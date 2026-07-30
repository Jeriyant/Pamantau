using System.Diagnostics;

namespace PamantauPortable;

internal sealed class BackgroundWorkerScheduler : IAsyncDisposable
{
    private readonly PortablePaths _paths;
    private readonly AppLogger _logger;
    private readonly Func<string?> _baseUrlProvider;
    private CancellationTokenSource? _cancellation;
    private Task? _loopTask;
    private Process? _activeProcess;
    private bool _backgroundDisabledReported;

    public BackgroundWorkerScheduler(
        PortablePaths paths,
        AppLogger logger,
        Func<string?> baseUrlProvider)
    {
        _paths = paths;
        _logger = logger;
        _baseUrlProvider = baseUrlProvider;
    }

    public bool IsRunning => _loopTask is not null;

    public void Start()
    {
        if (_loopTask is not null)
        {
            return;
        }

        var workerScript = Path.Combine(_paths.AppRoot, "cli", "background.php");
        if (!File.Exists(workerScript))
        {
            _logger.Warning("The background scheduler was not started because cli/background.php is missing.");
            return;
        }

        _cancellation = new CancellationTokenSource();
        _loopTask = RunLoopAsync(workerScript, _cancellation.Token);
        _logger.Info("The background scheduler is active and checks for work every 5 seconds.");
    }

    public async Task StopAsync()
    {
        var loopTask = _loopTask;
        if (loopTask is null)
        {
            return;
        }

        _cancellation?.Cancel();
        TryKillActiveProcess();

        try
        {
            await loopTask;
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown.
        }
        finally
        {
            _loopTask = null;
            _cancellation?.Dispose();
            _cancellation = null;
            _logger.Info("The background scheduler has stopped.");
        }
    }

    public async ValueTask DisposeAsync() => await StopAsync();

    private async Task RunLoopAsync(string workerScript, CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        await RunCycleAsync(workerScript, cancellationToken);

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            await RunCycleAsync(workerScript, cancellationToken);
        }
    }

    private async Task RunCycleAsync(string workerScript, CancellationToken cancellationToken)
    {
        var startInfo = PhpRuntime.CreatePhpStartInfo(_paths, _paths.PhpExe);
        startInfo.ArgumentList.Add(workerScript);
        var baseUrl = _baseUrlProvider();
        if (!string.IsNullOrWhiteSpace(baseUrl))
        {
            startInfo.Environment["PAMANTAU_BASE_URL"] = baseUrl;
        }
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;

        using var process = new Process { StartInfo = startInfo };
        _activeProcess = process;
        try
        {
            process.Start();
            var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            var output = (await outputTask).Trim();
            var error = (await errorTask).Trim();

            if (process.ExitCode != 0)
            {
                _logger.Error(
                    $"The background worker failed (exit {process.ExitCode}): " +
                    (error.Length > 0 ? error : output));
                return;
            }

            if (output.Contains("\"background_disabled\"", StringComparison.Ordinal))
            {
                if (!_backgroundDisabledReported)
                {
                    _logger.Warning(
                        "The scheduler is running, but background polling is disabled in " +
                        "Pamantau application settings. Enable Settings > Background > Run in background.");
                    _backgroundDisabledReported = true;
                }
                return;
            }

            _backgroundDisabledReported = false;
            if (output.Length > 0 &&
                !output.Contains("\"poll_interval\"", StringComparison.Ordinal) &&
                !output.Contains("\"job_intervals\"", StringComparison.Ordinal))
            {
                _logger.Info($"Background worker: {output}");
            }
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }
        catch (Exception exception)
        {
            _logger.Error($"The background worker could not start: {exception.Message}");
        }
        finally
        {
            if (ReferenceEquals(_activeProcess, process))
            {
                _activeProcess = null;
            }
        }
    }

    private void TryKillActiveProcess()
    {
        var process = _activeProcess;
        if (process is not null)
        {
            TryKill(process);
        }
    }

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
