using System.Diagnostics;
using System.Text.Json;

namespace PamantauPortable;

internal sealed record PhpRuntimeStatus(
    bool IsReady,
    string Version,
    IReadOnlyList<string> MissingExtensions,
    IReadOnlyList<string> MissingFunctions,
    string Error);

internal static class PhpRuntime
{
    public static async Task<PhpRuntimeStatus> ValidateAsync(
        PortablePaths paths,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(paths.PhpExe))
        {
            return new PhpRuntimeStatus(
                false,
                string.Empty,
                Array.Empty<string>(),
                Array.Empty<string>(),
                $"PHP CLI was not found: {paths.PhpExe}");
        }

        const string validationCode =
            "$ext=['curl','gd','mbstring','openssl','sockets','zip'];" +
            "$fn=['exec','proc_open','fsockopen','stream_socket_client','socket_select'];" +
            "$missingExt=array_values(array_filter($ext,fn($x)=>!extension_loaded($x)));" +
            "$missingFn=array_values(array_filter($fn,fn($x)=>!function_exists($x)));" +
            "echo json_encode(['version'=>PHP_VERSION,'missingExtensions'=>$missingExt,'missingFunctions'=>$missingFn]);";

        var startInfo = CreatePhpStartInfo(paths, paths.PhpExe);
        startInfo.ArgumentList.Add("-r");
        startInfo.ArgumentList.Add(validationCode);
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;

        try
        {
            using var process = new Process { StartInfo = startInfo };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
            {
                return new PhpRuntimeStatus(
                    false,
                    string.Empty,
                    Array.Empty<string>(),
                    Array.Empty<string>(),
                    string.IsNullOrWhiteSpace(stderr)
                        ? $"PHP validation failed with exit code {process.ExitCode}."
                        : stderr.Trim());
            }

            using var document = JsonDocument.Parse(stdout);
            var root = document.RootElement;
            var version = root.GetProperty("version").GetString() ?? string.Empty;
            var missingExtensions = ReadStringArray(root, "missingExtensions");
            var missingFunctions = ReadStringArray(root, "missingFunctions");
            var ready = missingExtensions.Count == 0 && missingFunctions.Count == 0;

            return new PhpRuntimeStatus(
                ready,
                version,
                missingExtensions,
                missingFunctions,
                ready ? string.Empty : "The PHP runtime does not meet the application requirements.");
        }
        catch (Exception exception)
        {
            return new PhpRuntimeStatus(
                false,
                string.Empty,
                Array.Empty<string>(),
                Array.Empty<string>(),
                exception.Message);
        }
    }

    public static ProcessStartInfo CreatePhpStartInfo(PortablePaths paths, string executable)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            WorkingDirectory = paths.PhpRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        startInfo.ArgumentList.Add("-c");
        startInfo.ArgumentList.Add(paths.PhpIni);
        AddIniOverride("extension_dir", Path.Combine(paths.PhpRoot, "ext"));
        AddIniOverride("session.save_path", paths.SessionsRoot);
        AddIniOverride("sys_temp_dir", paths.TempRoot);
        AddIniOverride("upload_tmp_dir", paths.TempRoot);
        AddIniOverride("error_log", paths.PhpErrorLog);
        AddIniOverride("curl.cainfo", Path.Combine(paths.PhpRoot, "extras", "ssl", "cacert.pem"));
        AddIniOverride("openssl.cafile", Path.Combine(paths.PhpRoot, "extras", "ssl", "cacert.pem"));

        startInfo.Environment["PHPRC"] = paths.PhpRoot;
        startInfo.Environment["PAMANTAU_PORTABLE_ROOT"] = paths.Root.TrimEnd(Path.DirectorySeparatorChar);
        startInfo.Environment["PAMANTAU_APP_ROOT"] = paths.AppRoot;
        startInfo.Environment["PAMANTAU_DATA_ROOT"] = paths.DataRoot;
        startInfo.Environment["TEMP"] = paths.TempRoot;
        startInfo.Environment["TMP"] = paths.TempRoot;

        var currentPath = startInfo.Environment.TryGetValue("PATH", out var value)
            ? value
            : Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        startInfo.Environment["PATH"] = paths.PhpRoot + Path.PathSeparator + currentPath;

        return startInfo;

        void AddIniOverride(string name, string value)
        {
            startInfo.ArgumentList.Add("-d");
            startInfo.ArgumentList.Add($"{name}={value}");
        }
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return property
            .EnumerateArray()
            .Select(item => item.GetString())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Cast<string>()
            .ToArray();
    }
}
