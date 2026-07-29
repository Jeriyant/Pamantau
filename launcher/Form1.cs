using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;

namespace PamantauLauncher
{
    public partial class Form1 : Form
    {
        private Process? _phpProcess = null;
        private bool _isServerRunning = false;
        private string _phpExePath = "";
        private string _appRootDir = "";
        private NotifyIcon? _trayIcon;

        // UI Controls
        private Panel _headerPanel = null!;
        private PictureBox _pbLogo = null!;
        private Label _lblTitle = null!;
        private Label _lblSubtitle = null!;
        private Label _lblStatusBadge = null!;
        
        private GroupBox _grpServer = null!;
        private Label _lblPort = null!;
        private NumericUpDown _numPort = null!;
        private Button _btnToggleServer = null!;
        private Button _btnOpenBrowser = null!;

        private GroupBox _grpLinks = null!;
        private Label _lblLocalhostTitle = null!;
        private TextBox _txtLocalhostUrl = null!;
        private Button _btnCopyLocalhost = null!;

        private Label _lblNetworkIpTitle = null!;
        private TextBox _txtNetworkIpUrl = null!;
        private Button _btnCopyNetworkIp = null!;

        private GroupBox _grpLog = null!;
        private RichTextBox _rtbLog = null!;

        public Form1()
        {
            InitializeComponent();
            SetupCustomUi();
            DetectPaths();
            UpdateLinkUrls();
            FormClosing += Form1_FormClosing;
        }

        private void SetupCustomUi()
        {
            // Form Config
            this.Text = "Pamantau — Server Control Panel";
            this.Size = new Size(680, 720);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // Dark slate
            this.ForeColor = Color.FromArgb(241, 245, 249);
            this.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);

            // Icon Setup
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string iconPath = Path.Combine(baseDir, "app.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = Path.Combine(baseDir, "..", "launcher", "app.ico");
            }

            Icon? appIcon = null;
            if (File.Exists(iconPath))
            {
                try
                {
                    appIcon = new Icon(iconPath, 256, 256);
                    this.Icon = appIcon;
                }
                catch (Exception) { }
            }

            // High-res Logo Image Setup
            string logoPngPath = Path.Combine(baseDir, "logo.png");
            if (!File.Exists(logoPngPath))
            {
                logoPngPath = Path.Combine(baseDir, "..", "launcher", "logo.png");
            }

            Image? logoImg = null;
            if (File.Exists(logoPngPath))
            {
                try
                {
                    logoImg = Image.FromFile(logoPngPath);
                }
                catch (Exception) { }
            }

            // System Tray Icon Setup
            _trayIcon = new NotifyIcon
            {
                Text = "Pamantau Server Control Panel",
                Icon = appIcon ?? SystemIcons.Application,
                Visible = true
            };
            var trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("Buka Dashboard Web", null, (s, e) => OpenWebBrowser());
            trayMenu.Items.Add("Start / Stop Server", null, (s, e) => ToggleServer());
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Keluar", null, (s, e) => {
                if (_trayIcon != null) _trayIcon.Visible = false;
                StopServer();
                Application.Exit();
            });
            _trayIcon.ContextMenuStrip = trayMenu;
            _trayIcon.DoubleClick += (s, e) => {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                this.BringToFront();
            };

            // --- Header Panel ---
            _headerPanel = new Panel
            {
                Location = new Point(0, 0),
                Size = new Size(680, 105),
                BackColor = Color.FromArgb(30, 41, 59)
            };

            _pbLogo = new PictureBox
            {
                Location = new Point(20, 20),
                Size = new Size(64, 64),
                SizeMode = PictureBoxSizeMode.Zoom
            };
            if (logoImg != null)
            {
                _pbLogo.Image = logoImg;
            }
            else if (appIcon != null)
            {
                _pbLogo.Image = appIcon.ToBitmap();
            }

            _lblTitle = new Label
            {
                Text = "PAMANTAU",
                Location = new Point(96, 18),
                Size = new Size(360, 36),
                AutoSize = false,
                Font = new Font("Segoe UI", 18F, FontStyle.Bold),
                ForeColor = Color.FromArgb(129, 140, 248)
            };

            _lblSubtitle = new Label
            {
                Text = "Standalone Portable PHP Web Server",
                Location = new Point(98, 58),
                Size = new Size(380, 24),
                AutoSize = false,
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184)
            };

            _lblStatusBadge = new Label
            {
                Text = "● SERVER MATI",
                Location = new Point(490, 32),
                Size = new Size(160, 40),
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                BackColor = Color.FromArgb(239, 68, 68), // Red
                ForeColor = Color.White
            };

            _headerPanel.Controls.Add(_pbLogo);
            _headerPanel.Controls.Add(_lblTitle);
            _headerPanel.Controls.Add(_lblSubtitle);
            _headerPanel.Controls.Add(_lblStatusBadge);

            // --- Server Control Group ---
            _grpServer = new GroupBox
            {
                Text = " Kontrol Server Web ",
                Location = new Point(20, 120),
                Size = new Size(624, 120),
                ForeColor = Color.FromArgb(226, 232, 240)
            };

            _lblPort = new Label
            {
                Text = "Port Web:",
                Location = new Point(20, 42),
                Size = new Size(80, 24),
                TextAlign = ContentAlignment.MiddleLeft
            };

            _numPort = new NumericUpDown
            {
                Location = new Point(105, 38),
                Size = new Size(95, 30),
                Minimum = 80,
                Maximum = 65535,
                Value = 8080,
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White
            };
            _numPort.ValueChanged += (s, e) => UpdateLinkUrls();

            _btnToggleServer = new Button
            {
                Text = "▶  START SERVER",
                Location = new Point(220, 34),
                Size = new Size(185, 44),
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                BackColor = Color.FromArgb(34, 197, 94), // Green
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnToggleServer.FlatAppearance.BorderSize = 0;
            _btnToggleServer.Click += (s, e) => ToggleServer();

            _btnOpenBrowser = new Button
            {
                Text = "🌐  BUKA BROWSER",
                Location = new Point(420, 34),
                Size = new Size(185, 44),
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                BackColor = Color.FromArgb(99, 102, 241), // Indigo
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnOpenBrowser.FlatAppearance.BorderSize = 0;
            _btnOpenBrowser.Click += (s, e) => OpenWebBrowser();

            _grpServer.Controls.Add(_lblPort);
            _grpServer.Controls.Add(_numPort);
            _grpServer.Controls.Add(_btnToggleServer);
            _grpServer.Controls.Add(_btnOpenBrowser);

            // --- Links & IP Address Group ---
            _grpLinks = new GroupBox
            {
                Text = " Alamat Akses Web (URL) ",
                Location = new Point(20, 255),
                Size = new Size(624, 140),
                ForeColor = Color.FromArgb(226, 232, 240)
            };

            _lblLocalhostTitle = new Label
            {
                Text = "Localhost (PC Ini):",
                Location = new Point(20, 38),
                Size = new Size(160, 24),
                TextAlign = ContentAlignment.MiddleLeft
            };

            _txtLocalhostUrl = new TextBox
            {
                Location = new Point(185, 35),
                Size = new Size(305, 28),
                ReadOnly = true,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.FromArgb(56, 189, 248),
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold)
            };

            _btnCopyLocalhost = new Button
            {
                Text = "Salin",
                Location = new Point(500, 33),
                Size = new Size(105, 32),
                BackColor = Color.FromArgb(51, 65, 85),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnCopyLocalhost.FlatAppearance.BorderSize = 0;
            _btnCopyLocalhost.Click += (s, e) => {
                Clipboard.SetText(_txtLocalhostUrl.Text);
                MessageBox.Show("Link Localhost berhasil disalin ke clipboard!", "Info", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };

            _lblNetworkIpTitle = new Label
            {
                Text = "IP Jaringan (LAN/Wi-Fi):",
                Location = new Point(20, 85),
                Size = new Size(160, 24),
                TextAlign = ContentAlignment.MiddleLeft
            };

            _txtNetworkIpUrl = new TextBox
            {
                Location = new Point(185, 82),
                Size = new Size(305, 28),
                ReadOnly = true,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.FromArgb(74, 222, 128),
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold)
            };

            _btnCopyNetworkIp = new Button
            {
                Text = "Salin",
                Location = new Point(500, 80),
                Size = new Size(105, 32),
                BackColor = Color.FromArgb(51, 65, 85),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnCopyNetworkIp.FlatAppearance.BorderSize = 0;
            _btnCopyNetworkIp.Click += (s, e) => {
                Clipboard.SetText(_txtNetworkIpUrl.Text);
                MessageBox.Show("Link IP Jaringan berhasil disalin ke clipboard!", "Info", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };

            _grpLinks.Controls.Add(_lblLocalhostTitle);
            _grpLinks.Controls.Add(_txtLocalhostUrl);
            _grpLinks.Controls.Add(_btnCopyLocalhost);
            _grpLinks.Controls.Add(_lblNetworkIpTitle);
            _grpLinks.Controls.Add(_txtNetworkIpUrl);
            _grpLinks.Controls.Add(_btnCopyNetworkIp);

            // --- Server Output Log Group ---
            _grpLog = new GroupBox
            {
                Text = " Log Aktivitas Server ",
                Location = new Point(20, 410),
                Size = new Size(624, 250),
                ForeColor = Color.FromArgb(226, 232, 240)
            };

            _rtbLog = new RichTextBox
            {
                Location = new Point(15, 25),
                Size = new Size(594, 210),
                ReadOnly = true,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.FromArgb(148, 163, 184),
                Font = new Font("Consolas", 9F, FontStyle.Regular),
                BorderStyle = BorderStyle.None
            };
            _grpLog.Controls.Add(_rtbLog);

            // Add all components to Form
            this.Controls.Add(_headerPanel);
            this.Controls.Add(_grpServer);
            this.Controls.Add(_grpLinks);
            this.Controls.Add(_grpLog);
        }

        private void DetectPaths()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            
            // Look for PHP binary
            string[] possiblePhpPaths = new string[]
            {
                Path.Combine(baseDir, "php", "php.exe"),
                Path.Combine(baseDir, "..", "php", "php.exe"),
                @"C:\php\php.exe",
                @"C:\xampp\php\php.exe",
                @"C:\laragon\bin\php\php.exe"
            };

            foreach (var p in possiblePhpPaths)
            {
                if (File.Exists(p))
                {
                    _phpExePath = Path.GetFullPath(p);
                    break;
                }
            }

            if (string.IsNullOrEmpty(_phpExePath))
            {
                _phpExePath = "php"; // fallback to system PATH
            }

            // Look for Pamantau App Directory (contains index.php)
            string[] possibleAppDirs = new string[]
            {
                baseDir,
                Path.Combine(baseDir, ".."),
                Path.GetFullPath(Path.Combine(baseDir, "..", ".."))
            };

            foreach (var d in possibleAppDirs)
            {
                if (File.Exists(Path.Combine(d, "index.php")))
                {
                    _appRootDir = Path.GetFullPath(d);
                    break;
                }
            }

            if (string.IsNullOrEmpty(_appRootDir))
            {
                _appRootDir = baseDir;
            }

            AppendLog($"PHP Path: {_phpExePath}");
            AppendLog($"App Path: {_appRootDir}");
        }

        private void UpdateLinkUrls()
        {
            int port = (int)_numPort.Value;
            _txtLocalhostUrl.Text = $"http://localhost:{port}";
            string localIp = GetLocalIPAddress();
            _txtNetworkIpUrl.Text = $"http://{localIp}:{port}";
        }

        private string GetLocalIPAddress()
        {
            try
            {
                var host = Dns.GetHostEntry(Dns.GetHostName());
                foreach (var ip in host.AddressList)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    {
                        return ip.ToString();
                    }
                }
            }
            catch (Exception) { }
            return "127.0.0.1";
        }

        private void ToggleServer()
        {
            if (_isServerRunning)
            {
                StopServer();
            }
            else
            {
                StartServer();
            }
        }

        private void StartServer()
        {
            if (_isServerRunning) return;

            int port = (int)_numPort.Value;
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = _phpExePath,
                    Arguments = $"-S 0.0.0.0:{port} -t \"{_appRootDir}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WorkingDirectory = _appRootDir
                };

                _phpProcess = new Process { StartInfo = psi };
                _phpProcess.OutputDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) AppendLog(e.Data); };
                _phpProcess.ErrorDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) AppendLog(e.Data); };

                _phpProcess.Start();
                _phpProcess.BeginOutputReadLine();
                _phpProcess.BeginErrorReadLine();

                _isServerRunning = true;
                _btnToggleServer.Text = "⏹  STOP SERVER";
                _btnToggleServer.BackColor = Color.FromArgb(239, 68, 68); // Red
                _numPort.Enabled = false;

                _lblStatusBadge.Text = "● SERVER ONLINE";
                _lblStatusBadge.BackColor = Color.FromArgb(34, 197, 94); // Green

                AppendLog($"[SUCCESS] Web Server aktif di http://localhost:{port}");
                AppendLog($"[SUCCESS] Server Jaringan aktif di http://{GetLocalIPAddress()}:{port}");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Gagal menjalankan server PHP:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                AppendLog($"[ERROR] {ex.Message}");
            }
        }

        private void StopServer()
        {
            if (!_isServerRunning) return;

            try
            {
                if (_phpProcess != null && !_phpProcess.HasExited)
                {
                    _phpProcess.Kill(true);
                    _phpProcess.Dispose();
                    _phpProcess = null;
                }
            }
            catch (Exception) { }

            _isServerRunning = false;
            _btnToggleServer.Text = "▶  START SERVER";
            _btnToggleServer.BackColor = Color.FromArgb(34, 197, 94); // Green
            _numPort.Enabled = true;

            _lblStatusBadge.Text = "● SERVER MATI";
            _lblStatusBadge.BackColor = Color.FromArgb(239, 68, 68); // Red

            AppendLog("[INFO] Server dihentikan.");
        }

        private void OpenWebBrowser()
        {
            if (!_isServerRunning)
            {
                var result = MessageBox.Show("Server belum aktif. Apakah Anda ingin menyalakan server dan membuka halaman web?", "Konfirmasi", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (result == DialogResult.Yes)
                {
                    StartServer();
                }
                else
                {
                    return;
                }
            }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = _txtLocalhostUrl.Text,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Gagal membuka browser:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void AppendLog(string message)
        {
            if (_rtbLog.InvokeRequired)
            {
                _rtbLog.Invoke(new Action(() => AppendLog(message)));
                return;
            }

            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            _rtbLog.AppendText($"[{timestamp}] {message}\n");
            _rtbLog.SelectionStart = _rtbLog.Text.Length;
            _rtbLog.ScrollToCaret();
        }

        private void Form1_FormClosing(object? sender, FormClosingEventArgs e)
        {
            StopServer();
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }
        }
    }
}
