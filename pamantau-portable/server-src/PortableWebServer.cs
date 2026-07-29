using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace PamantauPortable;

internal sealed class PortableWebServer : IAsyncDisposable
{
    private static readonly HashSet<string> BlockedDirectories = new(
        new[] { "database", "includes", "cli", ".git", ".github" },
        StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> BlockedExtensions = new(
        new[] { ".json", ".ini", ".log", ".lock", ".sh", ".ps1", ".bat", ".cmd", ".bak", ".tmp" },
        StringComparer.OrdinalIgnoreCase);

    private static readonly IReadOnlyDictionary<string, string> MimeTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".css"] = "text/css; charset=utf-8",
            [".js"] = "text/javascript; charset=utf-8",
            [".html"] = "text/html; charset=utf-8",
            [".txt"] = "text/plain; charset=utf-8",
            [".svg"] = "image/svg+xml",
            [".png"] = "image/png",
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".gif"] = "image/gif",
            [".webp"] = "image/webp",
            [".ico"] = "image/x-icon",
            [".woff"] = "font/woff",
            [".woff2"] = "font/woff2",
            [".ttf"] = "font/ttf",
            [".otf"] = "font/otf",
            [".map"] = "application/json",
            [".pdf"] = "application/pdf",
            [".zip"] = "application/zip",
        };

    private readonly PortablePaths _paths;
    private readonly AppLogger _logger;
    private readonly PhpCgiExecutor _php;
    private WebApplication? _application;

    public PortableWebServer(PortablePaths paths, AppLogger logger)
    {
        _paths = paths;
        _logger = logger;
        _php = new PhpCgiExecutor(paths, logger);
    }

    public bool IsRunning => _application is not null;
    public int Port { get; private set; }
    public bool IsLanEnabled { get; private set; }
    public string LocalUrl => $"http://127.0.0.1:{Port}/";

    public async Task StartAsync(int port, bool bindToLan, CancellationToken cancellationToken = default)
    {
        if (_application is not null)
        {
            return;
        }

        var options = new WebApplicationOptions
        {
            Args = Array.Empty<string>(),
            ApplicationName = typeof(PortableWebServer).Assembly.FullName,
            ContentRootPath = _paths.Root,
        };
        var builder = WebApplication.CreateSlimBuilder(options);
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(server =>
        {
            server.AddServerHeader = false;
            server.Limits.MaxRequestBodySize = 64L * 1024L * 1024L;
            server.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(30);
            server.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(2);
            server.Listen(
                bindToLan ? IPAddress.Any : IPAddress.Loopback,
                port,
                listen => listen.Protocols = HttpProtocols.Http1AndHttp2);
        });

        var application = builder.Build();
        application.Run(HandleRequestAsync);

        try
        {
            await application.StartAsync(cancellationToken);
        }
        catch
        {
            await application.DisposeAsync();
            throw;
        }

        _application = application;
        Port = port;
        IsLanEnabled = bindToLan;
        _logger.Info(
            bindToLan
                ? $"Webserver is online on port {port} (localhost and LAN)."
                : $"Webserver is online at {LocalUrl}");
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        var application = _application;
        if (application is null)
        {
            return;
        }

        _application = null;
        try
        {
            await application.StopAsync(cancellationToken);
        }
        finally
        {
            await application.DisposeAsync();
            _logger.Info("Webserver is offline.");
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_application is not null)
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await StopAsync(timeout.Token);
        }
    }

    private async Task HandleRequestAsync(HttpContext context)
    {
        AddSecurityHeaders(context.Response);

        var requestedPath = NormalizeUrlPath(context.Request.Path.Value);
        if (requestedPath is null)
        {
            await NotFoundAsync(context);
            return;
        }

        if (requestedPath.Equals("/.pamantau/health", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.Headers.CacheControl = "no-store";
            await JsonSerializer.SerializeAsync(
                context.Response.Body,
                new
                {
                    ok = true,
                    server = "Pamantau Webserver",
                    port = Port,
                    time = DateTimeOffset.Now,
                },
                cancellationToken: context.RequestAborted);
            return;
        }

        if (requestedPath.Equals("/update.php", StringComparison.OrdinalIgnoreCase))
        {
            await _php.ExecuteAsync(context, _paths.PortableUpdater, "/update.php");
            return;
        }

        var resolved = ResolveAppPath(requestedPath);
        if (resolved is null)
        {
            await NotFoundAsync(context);
            return;
        }

        if (Directory.Exists(resolved))
        {
            var indexPhp = Path.Combine(resolved, "index.php");
            var indexHtml = Path.Combine(resolved, "index.html");
            if (File.Exists(indexPhp))
            {
                resolved = indexPhp;
                requestedPath = requestedPath.TrimEnd('/') + "/index.php";
            }
            else if (File.Exists(indexHtml))
            {
                resolved = indexHtml;
            }
            else
            {
                await NotFoundAsync(context);
                return;
            }
        }

        if (!File.Exists(resolved))
        {
            await NotFoundAsync(context);
            return;
        }

        if (Path.GetExtension(resolved).Equals(".php", StringComparison.OrdinalIgnoreCase))
        {
            await _php.ExecuteAsync(context, resolved, requestedPath);
            return;
        }

        await ServeStaticFileAsync(context, resolved);
    }

    private string? ResolveAppPath(string requestedPath)
    {
        var relativePath = requestedPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var segments = requestedPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Any(segment =>
                segment is "." or ".." ||
                segment.StartsWith(".", StringComparison.Ordinal) ||
                BlockedDirectories.Contains(segment)))
        {
            return null;
        }

        var extension = Path.GetExtension(relativePath);
        if (BlockedExtensions.Contains(extension))
        {
            return null;
        }

        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(Path.Combine(_paths.AppRoot, relativePath));
        }
        catch
        {
            return null;
        }

        var rootPrefix = _paths.AppRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) &&
            !fullPath.Equals(_paths.AppRoot, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return fullPath;
    }

    private static string? NormalizeUrlPath(string? rawPath)
    {
        var value = string.IsNullOrEmpty(rawPath) ? "/" : rawPath;
        try
        {
            value = Uri.UnescapeDataString(value).Replace('\\', '/');
        }
        catch
        {
            return null;
        }

        if (value.IndexOf('\0') >= 0 || value.IndexOf(':') >= 0)
        {
            return null;
        }

        while (value.Contains("//", StringComparison.Ordinal))
        {
            value = value.Replace("//", "/", StringComparison.Ordinal);
        }

        return value.StartsWith('/') ? value : "/" + value;
    }

    private static async Task ServeStaticFileAsync(HttpContext context, string path)
    {
        var file = new FileInfo(path);
        var extension = file.Extension;
        context.Response.ContentType = MimeTypes.TryGetValue(extension, out var mime)
            ? mime
            : "application/octet-stream";
        context.Response.ContentLength = file.Length;
        context.Response.Headers["Cache-Control"] = "no-cache";
        context.Response.Headers["Last-Modified"] =
            file.LastWriteTimeUtc.ToString("R", CultureInfo.InvariantCulture);

        var etag = $"\"{file.Length:x}-{file.LastWriteTimeUtc.Ticks:x}\"";
        context.Response.Headers["ETag"] = etag;
        if (context.Request.Headers["If-None-Match"].Any(value =>
                string.Equals(value, etag, StringComparison.Ordinal)))
        {
            context.Response.StatusCode = StatusCodes.Status304NotModified;
            context.Response.ContentLength = null;
            return;
        }

        if (!HttpMethods.IsHead(context.Request.Method))
        {
            await context.Response.SendFileAsync(path, context.RequestAborted);
        }
    }

    private static void AddSecurityHeaders(HttpResponse response)
    {
        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["X-Frame-Options"] = "SAMEORIGIN";
        response.Headers["Referrer-Policy"] = "same-origin";
        response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    }

    private static async Task NotFoundAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        context.Response.ContentType = "text/plain; charset=utf-8";
        await context.Response.WriteAsync("404 - Not Found", context.RequestAborted);
    }
}
