using System.Text;

namespace PamantauPortable;

internal sealed class AppLogger
{
    private readonly string _logFile;
    private readonly object _fileLock = new();

    public AppLogger(string logFile)
    {
        _logFile = logFile;
    }

    public event Action<string>? MessageWritten;

    public void Info(string message) => Write("INFO", message);
    public void Warning(string message) => Write("WARN", message);
    public void Error(string message) => Write("ERROR", message);

    public void Write(string level, string message)
    {
        var clean = (message ?? string.Empty).TrimEnd('\r', '\n');
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{level}] {clean}";

        try
        {
            lock (_fileLock)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_logFile)!);
                File.AppendAllText(_logFile, line + Environment.NewLine, new UTF8Encoding(false));
            }
        }
        catch
        {
            // Logging must never stop the portable server.
        }

        MessageWritten?.Invoke(line);
    }
}
