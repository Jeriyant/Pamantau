using System;
using System.Windows.Forms;

namespace PamantauLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, e) => {
                MessageBox.Show($"Terjadi kesalahan:\n{e.Exception.Message}\n\nDetail:\n{e.Exception.StackTrace}", "Pamantau Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };
            AppDomain.CurrentDomain.UnhandledException += (s, e) => {
                var ex = e.ExceptionObject as Exception;
                MessageBox.Show($"Terjadi kesalahan fatal:\n{ex?.Message}\n\nDetail:\n{ex?.StackTrace}", "Pamantau Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };

            try
            {
                ApplicationConfiguration.Initialize();
                Application.Run(new Form1());
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Gagal membuka Pamantau:\n{ex.Message}\n\nDetail:\n{ex.StackTrace}", "Pamantau Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}