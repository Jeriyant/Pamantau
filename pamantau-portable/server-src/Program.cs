using System.Threading;

namespace PamantauPortable;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        var launchedByWindows = args.Any(
            argument => argument.Equals("--startup", StringComparison.OrdinalIgnoreCase));

        using var singleInstance = new Mutex(
            initiallyOwned: true,
            name: @"Local\PamantauPortableServer-9A79D2C1-07E8-4EC8-A0A0-15551BB2AE93",
            createdNew: out var isFirstInstance);

        if (!isFirstInstance)
        {
            if (!launchedByWindows)
            {
                MessageBox.Show(
                    "Pamantau Webserver is already running. Check the application window or System Tray.",
                    "Pamantau Webserver",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, eventArgs) =>
            ShowFatalError("An interface error occurred.", eventArgs.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
            ShowFatalError("A fatal error occurred.", eventArgs.ExceptionObject as Exception);

        Application.Run(new MainForm(launchedByWindows));
        GC.KeepAlive(singleInstance);
    }

    private static void ShowFatalError(string message, Exception? exception)
    {
        var detail = exception is null
            ? message
            : $"{message}{Environment.NewLine}{Environment.NewLine}{exception.Message}";

        MessageBox.Show(
            detail,
            "Pamantau Webserver",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
    }
}
