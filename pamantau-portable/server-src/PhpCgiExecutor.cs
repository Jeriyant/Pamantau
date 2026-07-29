using System.Diagnostics;
using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;

namespace PamantauPortable;

internal sealed class PhpCgiExecutor
{
    private const long MaximumRequestBodyBytes = 64L * 1024L * 1024L;
    private const int MaximumHeaderBytes = 64 * 1024;

    private readonly PortablePaths _paths;
    private readonly AppLogger _logger;

    public PhpCgiExecutor(PortablePaths paths, AppLogger logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public async Task ExecuteAsync(
        HttpContext context,
        string scriptFilename,
        string scriptName)
    {
        MemoryStream? requestBody = null;
        try
        {
            requestBody = await BufferRequestBodyAsync(context.Request, context.RequestAborted);
        }
        catch (InvalidDataException exception)
        {
            context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            await context.Response.WriteAsync(exception.Message, context.RequestAborted);
            return;
        }

        var startInfo = PhpRuntime.CreatePhpStartInfo(_paths, _paths.PhpCgiExe);
        startInfo.RedirectStandardInput = true;
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;
        PopulateCgiEnvironment(startInfo, context, scriptFilename, scriptName, requestBody?.Length ?? 0);

        using var process = new Process
        {
            StartInfo = startInfo,
            EnableRaisingEvents = true,
        };
        using var output = new MemoryStream();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(TimeSpan.FromMinutes(6));

        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException("php-cgi.exe could not be started.");
            }

            var outputTask = process.StandardOutput.BaseStream.CopyToAsync(output, timeout.Token);
            var errorTask = process.StandardError.ReadToEndAsync(timeout.Token);

            if (requestBody is not null)
            {
                requestBody.Position = 0;
                await requestBody.CopyToAsync(process.StandardInput.BaseStream, timeout.Token);
            }

            await process.StandardInput.BaseStream.FlushAsync(timeout.Token);
            process.StandardInput.Close();

            await Task.WhenAll(outputTask, process.WaitForExitAsync(timeout.Token));
            var stderr = await errorTask;

            if (!string.IsNullOrWhiteSpace(stderr))
            {
                var summary = stderr.Trim();
                if (process.ExitCode == 0)
                {
                    _logger.Warning($"PHP {scriptName}: {summary}");
                }
                else
                {
                    _logger.Error($"PHP {scriptName} (exit {process.ExitCode}): {summary}");
                }
            }

            await WriteCgiResponseAsync(context, output.ToArray(), process.ExitCode);
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
            TryKill(process);
            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = context.RequestAborted.IsCancellationRequested
                    ? 499
                    : StatusCodes.Status504GatewayTimeout;
            }
        }
        catch (Exception exception)
        {
            TryKill(process);
            _logger.Error($"Failed to run PHP {scriptName}: {exception.Message}");
            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = StatusCodes.Status502BadGateway;
                context.Response.ContentType = "text/plain; charset=utf-8";
                await context.Response.WriteAsync(
                    "Pamantau Webserver could not run PHP-CGI. Check the server log.",
                    context.RequestAborted);
            }
        }
        finally
        {
            requestBody?.Dispose();
        }
    }

    private static async Task<MemoryStream?> BufferRequestBodyAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        if (request.ContentLength is > MaximumRequestBodyBytes)
        {
            throw new InvalidDataException("The request exceeds the 64 MB limit.");
        }

        if (request.ContentLength is null or 0 &&
            !HttpMethods.IsPost(request.Method) &&
            !HttpMethods.IsPut(request.Method) &&
            !HttpMethods.IsPatch(request.Method))
        {
            return null;
        }

        var body = new MemoryStream(
            request.ContentLength is > 0 and <= int.MaxValue
                ? (int)request.ContentLength.Value
                : 0);
        var buffer = new byte[64 * 1024];
        long total = 0;

        while (true)
        {
            var read = await request.Body.ReadAsync(buffer, cancellationToken);
            if (read == 0)
            {
                break;
            }

            total += read;
            if (total > MaximumRequestBodyBytes)
            {
                body.Dispose();
                throw new InvalidDataException("The request exceeds the 64 MB limit.");
            }

            await body.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }

        return body;
    }

    private void PopulateCgiEnvironment(
        ProcessStartInfo startInfo,
        HttpContext context,
        string scriptFilename,
        string scriptName,
        long bodyLength)
    {
        var request = context.Request;
        var remoteAddress = context.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        var localAddress = context.Connection.LocalIpAddress?.ToString() ?? "127.0.0.1";

        Set("GATEWAY_INTERFACE", "CGI/1.1");
        Set("SERVER_SOFTWARE", "PamantauPortable/1.0");
        Set("SERVER_PROTOCOL", request.Protocol);
        Set("REQUEST_METHOD", request.Method);
        Set("REQUEST_URI", request.PathBase + request.Path + request.QueryString);
        Set("SCRIPT_NAME", scriptName);
        Set("SCRIPT_FILENAME", scriptFilename);
        Set("DOCUMENT_ROOT", _paths.AppRoot);
        Set("QUERY_STRING", request.QueryString.HasValue
            ? request.QueryString.Value![1..]
            : string.Empty);
        Set("REMOTE_ADDR", remoteAddress);
        Set("REMOTE_PORT", context.Connection.RemotePort.ToString(CultureInfo.InvariantCulture));
        Set("SERVER_ADDR", localAddress);
        Set("SERVER_NAME", request.Host.Host);
        Set("SERVER_PORT", context.Connection.LocalPort.ToString(CultureInfo.InvariantCulture));
        Set("HTTPS", "off");
        Set("REDIRECT_STATUS", "200");
        Set("CONTENT_LENGTH", bodyLength.ToString(CultureInfo.InvariantCulture));

        if (!string.IsNullOrWhiteSpace(request.ContentType))
        {
            Set("CONTENT_TYPE", request.ContentType);
        }

        foreach (var header in request.Headers)
        {
            if (header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase) ||
                header.Key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var key = "HTTP_" + header.Key
                .ToUpperInvariant()
                .Replace('-', '_');
            Set(key, header.Value.ToString());
        }

        void Set(string key, string value) => startInfo.Environment[key] = value;
    }

    private static async Task WriteCgiResponseAsync(
        HttpContext context,
        byte[] output,
        int exitCode)
    {
        var separator = FindHeaderSeparator(output);
        if (separator.HeaderEnd < 0)
        {
            context.Response.StatusCode = StatusCodes.Status502BadGateway;
            context.Response.ContentType = "text/plain; charset=utf-8";
            await context.Response.WriteAsync(
                exitCode == 0
                    ? "The PHP-CGI response does not contain valid headers."
                    : $"PHP-CGI stopped with exit code {exitCode}.",
                context.RequestAborted);
            return;
        }

        var headerText = Encoding.Latin1.GetString(output, 0, separator.HeaderEnd);
        var statusCode = StatusCodes.Status200OK;
        var hasLocation = false;

        foreach (var line in headerText.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var colon = line.IndexOf(':');
            if (colon <= 0)
            {
                continue;
            }

            var name = line[..colon].Trim();
            var value = line[(colon + 1)..].Trim();
            if (name.Equals("Status", StringComparison.OrdinalIgnoreCase))
            {
                var firstToken = value.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                if (int.TryParse(firstToken, out var parsedStatus))
                {
                    statusCode = parsedStatus;
                }
                continue;
            }

            if (IsHopByHopHeader(name))
            {
                continue;
            }

            if (name.Equals("Location", StringComparison.OrdinalIgnoreCase))
            {
                hasLocation = true;
            }

            context.Response.Headers.Append(name, new StringValues(value));
        }

        if (hasLocation && statusCode == StatusCodes.Status200OK)
        {
            statusCode = StatusCodes.Status302Found;
        }

        context.Response.StatusCode = statusCode;
        var bodyOffset = separator.HeaderEnd + separator.SeparatorLength;
        var bodyLength = Math.Max(0, output.Length - bodyOffset);

        if (HttpMethods.IsHead(context.Request.Method))
        {
            if (!context.Response.Headers.ContainsKey("Content-Length"))
            {
                context.Response.ContentLength = bodyLength;
            }
            return;
        }

        if (bodyLength > 0)
        {
            await context.Response.Body.WriteAsync(
                output.AsMemory(bodyOffset, bodyLength),
                context.RequestAborted);
        }
    }

    private static (int HeaderEnd, int SeparatorLength) FindHeaderSeparator(byte[] output)
    {
        var scanLength = Math.Min(output.Length, MaximumHeaderBytes);
        for (var index = 0; index < scanLength - 1; index++)
        {
            if (index + 3 < scanLength &&
                output[index] == '\r' &&
                output[index + 1] == '\n' &&
                output[index + 2] == '\r' &&
                output[index + 3] == '\n')
            {
                return (index, 4);
            }

            if (output[index] == '\n' && output[index + 1] == '\n')
            {
                return (index, 2);
            }
        }

        return (-1, 0);
    }

    private static bool IsHopByHopHeader(string name) =>
        name.Equals("Connection", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Keep-Alive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Proxy-Authenticate", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Proxy-Authorization", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("TE", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Trailer", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Upgrade", StringComparison.OrdinalIgnoreCase);

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // Best effort cleanup.
        }
    }
}
