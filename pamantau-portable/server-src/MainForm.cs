using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Net;
using System.Net.Sockets;

namespace PamantauPortable;

internal sealed class MainForm : Form
{
    private static readonly Color WindowColor = Color.FromArgb(22, 24, 29);
    private static readonly Color PanelColor = Color.FromArgb(33, 37, 43);
    private static readonly Color SurfaceColor = Color.FromArgb(24, 27, 32);
    private static readonly Color BorderColor = Color.FromArgb(58, 64, 74);
    private static readonly Color TextColor = Color.FromArgb(244, 246, 248);
    private static readonly Color MutedColor = Color.FromArgb(156, 163, 175);
    private static readonly Color AccentColor = Color.FromArgb(20, 184, 166);
    private static readonly Color AccentLightColor = Color.FromArgb(45, 212, 191);
    private static readonly Color BlueColor = Color.FromArgb(14, 165, 233);
    private static readonly Color GreenColor = Color.FromArgb(34, 197, 94);
    private static readonly Color RedColor = Color.FromArgb(239, 68, 68);
    private static readonly Color GrayButtonColor = Color.FromArgb(75, 85, 99);
    private static readonly Color LogColor = Color.FromArgb(134, 239, 172);

    private readonly PortablePaths _paths;
    private readonly ServerConfig _config;
    private readonly AppLogger _logger;
    private readonly PortableWebServer _server;
    private readonly BackgroundWorkerScheduler _backgroundScheduler;
    private readonly bool _startMinimizedToTray;
    private readonly ToolTip _toolTip = new();
    private readonly List<Image> _ownedImages = new();

    private readonly Label _statusBadge = new();
    private readonly Label _urlLabel = new();
    private readonly Label _runtimeLabel = new();
    private readonly TextBox _sourcePathBox = new();
    private readonly NumericUpDown _portInput = new();
    private readonly CheckBox _lanCheckBox = new();
    private readonly CheckBox _autoOpenCheckBox = new();
    private readonly CheckBox _autoStartCheckBox = new();
    private readonly CheckBox _startWithWindowsCheckBox = new();
    private readonly CheckBox _backgroundCheckBox = new();
    private readonly Button _browseSourceButton = new();
    private readonly Button _startStopButton = new();
    private readonly Button _openButton = new();
    private readonly TextBox _logBox = new();

    private Image _playIcon = null!;
    private Image _stopIcon = null!;
    private Image _browserIcon = null!;
    private Image _folderIcon = null!;
    private Image _exitIcon = null!;

    private NotifyIcon? _trayIcon;
    private ToolStripMenuItem? _trayStartStopItem;
    private bool _isBusy;
    private bool _allowClose;
    private bool _closeBalloonShown;
    private bool _loadingControls;

    public MainForm(bool startMinimizedToTray = false)
    {
        _startMinimizedToTray = startMinimizedToTray;

        var bootstrapPaths = new PortablePaths();
        _config = ServerConfig.Load(bootstrapPaths.ConfigFile);
        _paths = CreateConfiguredPaths(_config);
        _paths.EnsureWritableFolders();

        _logger = new AppLogger(_paths.LogFile);
        _server = new PortableWebServer(_paths, _logger);
        _backgroundScheduler = new BackgroundWorkerScheduler(_paths, _logger);

        InitializeWindow();
        InitializeButtonIcons();
        BuildInterface();
        InitializeTrayIcon();
        LoadConfigIntoControls();

        _logger.MessageWritten += AppendLog;
        _logger.Info("Pamantau Webserver is ready.");
        _logger.Info($"Source directory: {_paths.AppRoot}");

        Shown += MainForm_Shown;
        FormClosing += MainForm_FormClosing;
        FormClosed += (_, _) => DisposeOwnedImages();
    }

    private static PortablePaths CreateConfiguredPaths(ServerConfig config)
    {
        try
        {
            return new PortablePaths(config.SourceDirectory);
        }
        catch
        {
            config.SourceDirectory = "app";
            return new PortablePaths();
        }
    }

    private void InitializeWindow()
    {
        Text = "Pamantau Webserver";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(900, 760);
        MinimumSize = new Size(840, 720);
        BackColor = WindowColor;
        ForeColor = TextColor;
        Font = new Font("Segoe UI", 9.5F);
        AutoScaleMode = AutoScaleMode.Dpi;

        if (_startMinimizedToTray)
        {
            WindowState = FormWindowState.Minimized;
            ShowInTaskbar = false;
        }

        try
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }
        catch
        {
            // The default application icon is sufficient.
        }
    }

    private void InitializeButtonIcons()
    {
        _playIcon = OwnImage(CreateButtonIcon(ButtonIcon.Play));
        _stopIcon = OwnImage(CreateButtonIcon(ButtonIcon.Stop));
        _browserIcon = OwnImage(CreateButtonIcon(ButtonIcon.Browser));
        _folderIcon = OwnImage(CreateButtonIcon(ButtonIcon.Folder));
        _exitIcon = OwnImage(CreateButtonIcon(ButtonIcon.Exit));
    }

    private Image OwnImage(Image image)
    {
        _ownedImages.Add(image);
        return image;
    }

    private void DisposeOwnedImages()
    {
        foreach (var image in _ownedImages)
        {
            image.Dispose();
        }
        _ownedImages.Clear();
        _toolTip.Dispose();
    }

    private void BuildInterface()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(20),
            BackColor = WindowColor,
            ColumnCount = 1,
            RowCount = 4,
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 142));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 330));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        root.Controls.Add(BuildHeaderPanel(), 0, 0);
        root.Controls.Add(BuildSettingsPanel(), 0, 1);
        root.Controls.Add(BuildLogPanel(), 0, 2);
        root.Controls.Add(BuildFooterPanel(), 0, 3);
        Controls.Add(root);
    }

    private Control BuildHeaderPanel()
    {
        var panel = CreatePanel();
        panel.Padding = new Padding(22, 18, 22, 18);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = PanelColor,
            ColumnCount = 2,
            RowCount = 1,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var brandPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = PanelColor,
            Margin = Padding.Empty,
        };
        var accent = new Panel
        {
            BackColor = AccentColor,
            Location = new Point(0, 3),
            Size = new Size(4, 75),
        };
        var title = new Label
        {
            Text = "PAMANTAU WEBSERVER",
            AutoSize = true,
            Location = new Point(16, 0),
            Font = new Font("Segoe UI Semibold", 17F, FontStyle.Bold),
            ForeColor = AccentLightColor,
        };
        var subtitle = new Label
        {
            Text = "Standalone webserver for the Pamantau application",
            AutoSize = true,
            Location = new Point(18, 39),
            ForeColor = MutedColor,
        };
        var technology = new Label
        {
            Text = "KESTREL  |  PHP-CGI  |  WINDOWS X64",
            AutoSize = true,
            Location = new Point(18, 68),
            Font = new Font("Segoe UI Semibold", 7.75F, FontStyle.Bold),
            ForeColor = Color.FromArgb(107, 114, 128),
        };
        brandPanel.Controls.Add(accent);
        brandPanel.Controls.Add(title);
        brandPanel.Controls.Add(subtitle);
        brandPanel.Controls.Add(technology);

        var statusLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = PanelColor,
            ColumnCount = 1,
            RowCount = 3,
            Margin = Padding.Empty,
        };
        statusLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
        statusLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        statusLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var statusTitle = new Label
        {
            Text = "SERVER STATUS",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopRight,
            Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold),
            ForeColor = MutedColor,
        };

        _statusBadge.Text = "OFFLINE";
        _statusBadge.AutoSize = true;
        _statusBadge.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _statusBadge.Margin = new Padding(0, 3, 0, 0);
        _statusBadge.Padding = new Padding(13, 5, 13, 5);
        _statusBadge.BackColor = RedColor;
        _statusBadge.ForeColor = Color.White;
        _statusBadge.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);

        _urlLabel.Text = "http://127.0.0.1:8000/";
        _urlLabel.Dock = DockStyle.Fill;
        _urlLabel.TextAlign = ContentAlignment.BottomRight;
        _urlLabel.AutoEllipsis = true;
        _urlLabel.ForeColor = AccentLightColor;
        _urlLabel.Font = new Font("Segoe UI", 9F, FontStyle.Underline);
        _urlLabel.Cursor = Cursors.Hand;
        _urlLabel.Visible = false;
        _urlLabel.Click += (_, _) => OpenBrowser();

        statusLayout.Controls.Add(statusTitle, 0, 0);
        statusLayout.Controls.Add(_statusBadge, 0, 1);
        statusLayout.Controls.Add(_urlLabel, 0, 2);
        layout.Controls.Add(brandPanel, 0, 0);
        layout.Controls.Add(statusLayout, 1, 0);
        panel.Controls.Add(layout);
        return panel;
    }

    private Control BuildSettingsPanel()
    {
        var panel = CreatePanel();
        panel.Padding = new Padding(20, 14, 20, 16);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = PanelColor,
            ColumnCount = 4,
            RowCount = 7,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 125));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var sectionTitle = new Label
        {
            Text = "SERVER CONFIGURATION",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold),
            ForeColor = AccentLightColor,
        };
        layout.Controls.Add(sectionTitle, 0, 0);
        layout.SetColumnSpan(sectionTitle, 4);

        var sourceLabel = CreateFieldLabel("SOURCE");
        _sourcePathBox.ReadOnly = true;
        _sourcePathBox.TabStop = false;
        _sourcePathBox.Dock = DockStyle.Fill;
        _sourcePathBox.Margin = new Padding(0, 10, 10, 10);
        _sourcePathBox.BackColor = SurfaceColor;
        _sourcePathBox.ForeColor = TextColor;
        _sourcePathBox.BorderStyle = BorderStyle.FixedSingle;
        _sourcePathBox.Cursor = Cursors.IBeam;

        ConfigureActionButton(
            _browseSourceButton,
            "Browse",
            GrayButtonColor,
            _folderIcon,
            new Padding(7, 7, 7, 7));
        _browseSourceButton.Click += async (_, _) => await BrowseSourceDirectoryAsync();

        layout.Controls.Add(sourceLabel, 0, 1);
        layout.Controls.Add(_sourcePathBox, 1, 1);
        layout.SetColumnSpan(_sourcePathBox, 2);
        layout.Controls.Add(_browseSourceButton, 3, 1);

        var portLabel = CreateFieldLabel("PORT");
        _portInput.Minimum = 1024;
        _portInput.Maximum = 65535;
        _portInput.Value = 8000;
        _portInput.Dock = DockStyle.Fill;
        _portInput.Margin = new Padding(0, 11, 12, 11);
        _portInput.BackColor = SurfaceColor;
        _portInput.ForeColor = Color.White;
        _portInput.BorderStyle = BorderStyle.FixedSingle;

        ConfigureActionButton(_startStopButton, "Start Server", GreenColor, _playIcon);
        _startStopButton.Click += async (_, _) => await ToggleServerAsync();
        ConfigureActionButton(_openButton, "Open Browser", BlueColor, _browserIcon);
        _openButton.Enabled = false;
        _openButton.Click += (_, _) => OpenBrowser();

        layout.Controls.Add(portLabel, 0, 2);
        layout.Controls.Add(_portInput, 1, 2);
        layout.Controls.Add(_startStopButton, 2, 2);
        layout.Controls.Add(_openButton, 3, 2);

        _lanCheckBox.Text = "Allow access from the LAN";
        ConfigureCheckBox(_lanCheckBox);
        layout.Controls.Add(_lanCheckBox, 0, 3);
        layout.SetColumnSpan(_lanCheckBox, 2);

        _autoOpenCheckBox.Text = "Open browser automatically";
        ConfigureCheckBox(_autoOpenCheckBox);
        layout.Controls.Add(_autoOpenCheckBox, 2, 3);
        layout.SetColumnSpan(_autoOpenCheckBox, 2);

        _autoStartCheckBox.Text = "Start server automatically";
        ConfigureCheckBox(_autoStartCheckBox);
        layout.Controls.Add(_autoStartCheckBox, 0, 4);
        layout.SetColumnSpan(_autoStartCheckBox, 2);

        _startWithWindowsCheckBox.Text = "Start with Windows";
        ConfigureCheckBox(_startWithWindowsCheckBox);
        _startWithWindowsCheckBox.CheckedChanged += StartWithWindowsCheckBox_CheckedChanged;
        layout.Controls.Add(_startWithWindowsCheckBox, 2, 4);
        layout.SetColumnSpan(_startWithWindowsCheckBox, 2);

        _backgroundCheckBox.Text = "Enable the background scheduler";
        ConfigureCheckBox(_backgroundCheckBox);
        layout.Controls.Add(_backgroundCheckBox, 0, 5);
        layout.SetColumnSpan(_backgroundCheckBox, 4);

        _runtimeLabel.Text = "PHP runtime: checking...";
        _runtimeLabel.Dock = DockStyle.Fill;
        _runtimeLabel.TextAlign = ContentAlignment.MiddleLeft;
        _runtimeLabel.ForeColor = MutedColor;
        layout.Controls.Add(_runtimeLabel, 0, 6);
        layout.SetColumnSpan(_runtimeLabel, 4);

        _toolTip.SetToolTip(
            _browseSourceButton,
            "Select the directory that contains index.php, login.php, api, and includes.");
        _toolTip.SetToolTip(
            _startWithWindowsCheckBox,
            "Launch the webserver after Windows sign-in and keep it in the System Tray.");
        _toolTip.SetToolTip(
            _lanCheckBox,
            "Allow trusted devices on the local network to connect to this webserver.");

        panel.Controls.Add(layout);
        return panel;
    }

    private static Label CreateFieldLabel(string text) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold),
        ForeColor = MutedColor,
    };

    private Control BuildLogPanel()
    {
        var panel = CreatePanel();
        panel.Padding = new Padding(14, 10, 14, 14);

        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 28,
            BackColor = PanelColor,
            ColumnCount = 2,
            RowCount = 1,
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));

        var label = new Label
        {
            Text = "SERVER ACTIVITY",
            Dock = DockStyle.Fill,
            ForeColor = AccentLightColor,
            Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold),
        };
        var logPath = new Label
        {
            Text = @"data\logs\server.log",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopRight,
            ForeColor = Color.FromArgb(107, 114, 128),
            Font = new Font("Segoe UI", 8F),
        };
        _logBox.Dock = DockStyle.Fill;
        _logBox.Multiline = true;
        _logBox.ReadOnly = true;
        _logBox.ScrollBars = ScrollBars.Vertical;
        _logBox.BackColor = Color.FromArgb(12, 14, 18);
        _logBox.ForeColor = LogColor;
        _logBox.Font = new Font("Consolas", 9F);
        _logBox.BorderStyle = BorderStyle.FixedSingle;

        header.Controls.Add(label, 0, 0);
        header.Controls.Add(logPath, 1, 0);
        panel.Controls.Add(_logBox);
        panel.Controls.Add(header);
        return panel;
    }

    private Control BuildFooterPanel()
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = WindowColor,
        };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = WindowColor,
            ColumnCount = 2,
            RowCount = 1,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));

        var hint = new Label
        {
            Text = "Closing the window keeps the webserver running in the System Tray.",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = MutedColor,
        };
        var exitButton = new Button();
        ConfigureActionButton(
            exitButton,
            "Exit",
            GrayButtonColor,
            _exitIcon,
            new Padding(8, 8, 0, 8));
        exitButton.Click += async (_, _) => await ExitApplicationAsync();

        layout.Controls.Add(hint, 0, 0);
        layout.Controls.Add(exitButton, 1, 0);
        panel.Controls.Add(layout);
        return panel;
    }

    private Panel CreatePanel()
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 0, 0, 14),
            BackColor = PanelColor,
        };
        panel.Paint += (_, eventArgs) =>
        {
            using var pen = new Pen(BorderColor);
            eventArgs.Graphics.DrawRectangle(pen, 0, 0, panel.Width - 1, panel.Height - 1);
        };
        panel.Resize += (_, _) => panel.Invalidate();
        return panel;
    }

    private static void ConfigureCheckBox(CheckBox checkBox)
    {
        checkBox.Dock = DockStyle.Fill;
        checkBox.ForeColor = TextColor;
        checkBox.AutoSize = true;
        checkBox.Margin = new Padding(0, 2, 8, 2);
        checkBox.Cursor = Cursors.Hand;
    }

    private static void ConfigureActionButton(
        Button button,
        string text,
        Color color,
        Image icon,
        Padding? margin = null)
    {
        button.Text = text;
        button.Image = icon;
        button.ImageAlign = ContentAlignment.MiddleCenter;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.Dock = DockStyle.Fill;
        button.Margin = margin ?? new Padding(7, 8, 7, 8);
        button.Padding = new Padding(5, 0, 5, 0);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = color;
        button.ForeColor = Color.White;
        button.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
        button.Cursor = Cursors.Hand;
    }

    private static Bitmap CreateButtonIcon(ButtonIcon icon)
    {
        var bitmap = new Bitmap(18, 18);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.Clear(Color.Transparent);

        using var pen = new Pen(Color.White, 1.7F)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        using var brush = new SolidBrush(Color.White);

        switch (icon)
        {
            case ButtonIcon.Play:
                graphics.FillPolygon(
                    brush,
                    new[] { new PointF(5, 3), new PointF(15, 9), new PointF(5, 15) });
                break;

            case ButtonIcon.Stop:
                graphics.FillRectangle(brush, 4, 4, 10, 10);
                break;

            case ButtonIcon.Browser:
                graphics.DrawEllipse(pen, 2, 2, 14, 14);
                graphics.DrawLine(pen, 2.5F, 9, 15.5F, 9);
                graphics.DrawArc(pen, 5, 2, 8, 14, -90, 180);
                graphics.DrawArc(pen, 5, 2, 8, 14, 90, 180);
                break;

            case ButtonIcon.Folder:
                using (var path = new GraphicsPath())
                {
                    path.AddPolygon(
                        new[]
                        {
                            new PointF(1.5F, 5),
                            new PointF(1.5F, 14.5F),
                            new PointF(16.5F, 14.5F),
                            new PointF(16.5F, 6),
                            new PointF(8, 6),
                            new PointF(6.5F, 3.5F),
                            new PointF(1.5F, 3.5F),
                        });
                    graphics.FillPath(brush, path);
                }
                break;

            case ButtonIcon.Exit:
                graphics.DrawArc(pen, 2.5F, 3, 13, 13, -45, 270);
                graphics.DrawLine(pen, 9, 1.5F, 9, 9);
                break;
        }

        return bitmap;
    }

    private void InitializeTrayIcon()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Show Pamantau Webserver", null, (_, _) => RestoreFromTray());
        menu.Items.Add("Open in browser", null, (_, _) => OpenBrowser());
        menu.Items.Add(new ToolStripSeparator());
        _trayStartStopItem = new ToolStripMenuItem(
            "Start Server",
            null,
            async (_, _) => await ToggleServerAsync());
        menu.Items.Add(_trayStartStopItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, async (_, _) => await ExitApplicationAsync());

        _trayIcon = new NotifyIcon
        {
            Text = "Pamantau Webserver",
            Icon = Icon ?? SystemIcons.Application,
            ContextMenuStrip = menu,
            Visible = true,
        };
        _trayIcon.DoubleClick += (_, _) => RestoreFromTray();
    }

    private void LoadConfigIntoControls()
    {
        _loadingControls = true;
        try
        {
            _portInput.Value = Math.Clamp(_config.Port, 1024, 65535);
            _sourcePathBox.Text = _paths.GetConfigSourceDirectory();
            _lanCheckBox.Checked = _config.BindToLan;
            _autoOpenCheckBox.Checked = _config.AutoOpenBrowser;
            _autoStartCheckBox.Checked = _config.AutoStartServer;
            _backgroundCheckBox.Checked = _config.RunBackgroundScheduler;

            var startupEnabled = StartupManager.IsEnabled();
            if (startupEnabled)
            {
                try
                {
                    StartupManager.SetEnabled(true);
                }
                catch (Exception exception)
                {
                    _logger.Warning($"Windows startup entry could not be refreshed: {exception.Message}");
                }
            }
            _startWithWindowsCheckBox.Checked = startupEnabled;
        }
        finally
        {
            _loadingControls = false;
        }

        _toolTip.SetToolTip(_sourcePathBox, _paths.AppRoot);
    }

    private async void MainForm_Shown(object? sender, EventArgs eventArgs)
    {
        if (_startMinimizedToTray)
        {
            Hide();
            ShowInTaskbar = false;
        }

        var runtime = await ValidateEnvironmentAsync(showDialog: !_startMinimizedToTray);
        if (runtime && (_startMinimizedToTray || _autoStartCheckBox.Checked))
        {
            await StartServerAsync(
                showDialogOnError: !_startMinimizedToTray,
                allowAutoOpenBrowser: !_startMinimizedToTray);
        }
    }

    private async Task<bool> ValidateEnvironmentAsync(bool showDialog)
    {
        try
        {
            _paths.EnsureWritableFolders();
            var missing = _paths.FindMissingRuntimeFiles();
            if (missing.Count > 0)
            {
                var names = string.Join(
                    Environment.NewLine,
                    missing.Select(path => "• " + Path.GetRelativePath(_paths.Root, path)));
                throw new FileNotFoundException(
                    "The portable package is incomplete. The following files are missing:" +
                    Environment.NewLine + names);
            }

            _paths.VerifyAppDataWritable();
            var status = await PhpRuntime.ValidateAsync(_paths);
            if (!status.IsReady)
            {
                var details = new List<string>();
                if (status.MissingExtensions.Count > 0)
                {
                    details.Add("Extensions: " + string.Join(", ", status.MissingExtensions));
                }
                if (status.MissingFunctions.Count > 0)
                {
                    details.Add("Functions: " + string.Join(", ", status.MissingFunctions));
                }
                if (!string.IsNullOrWhiteSpace(status.Error))
                {
                    details.Add(status.Error);
                }
                throw new InvalidOperationException(string.Join(Environment.NewLine, details));
            }

            _runtimeLabel.Text = $"PHP runtime: {status.Version} • all requirements are available";
            _runtimeLabel.ForeColor = Color.FromArgb(74, 222, 128);
            _logger.Info($"Runtime validation succeeded: PHP {status.Version}.");
            return true;
        }
        catch (Exception exception)
        {
            _runtimeLabel.Text = "PHP runtime: not ready";
            _runtimeLabel.ForeColor = Color.FromArgb(248, 113, 113);
            _logger.Error(exception.Message);
            if (showDialog)
            {
                MessageBox.Show(
                    exception.Message,
                    "Portable package is not ready",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            return false;
        }
    }

    private async Task BrowseSourceDirectoryAsync()
    {
        if (_server.IsRunning || _isBusy)
        {
            return;
        }

        using var dialog = new FolderBrowserDialog
        {
            Description = "Select the Pamantau source directory",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = false,
            SelectedPath = Directory.Exists(_paths.AppRoot) ? _paths.AppRoot : _paths.Root,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var previousPath = _paths.AppRoot;
        try
        {
            _paths.SetAppRoot(dialog.SelectedPath);
            var missing = _paths.FindMissingSourceFiles();
            if (missing.Count > 0)
            {
                var names = string.Join(
                    Environment.NewLine,
                    missing.Select(path => "• " + Path.GetRelativePath(_paths.AppRoot, path)));
                throw new InvalidOperationException(
                    "The selected directory is not a valid Pamantau source directory." +
                    Environment.NewLine + Environment.NewLine + names);
            }

            _paths.EnsureWritableFolders();
            _paths.VerifyAppDataWritable();
            _sourcePathBox.Text = _paths.GetConfigSourceDirectory();
            _toolTip.SetToolTip(_sourcePathBox, _paths.AppRoot);
            SaveConfig();
            _logger.Info($"Source directory changed to: {_paths.AppRoot}");
            await ValidateEnvironmentAsync(showDialog: true);
        }
        catch (Exception exception)
        {
            _paths.SetAppRoot(previousPath);
            _sourcePathBox.Text = _paths.GetConfigSourceDirectory();
            _toolTip.SetToolTip(_sourcePathBox, _paths.AppRoot);
            MessageBox.Show(
                exception.Message,
                "Invalid source directory",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void StartWithWindowsCheckBox_CheckedChanged(object? sender, EventArgs eventArgs)
    {
        if (_loadingControls)
        {
            return;
        }

        var enabled = _startWithWindowsCheckBox.Checked;
        try
        {
            StartupManager.SetEnabled(enabled);
            _logger.Info(
                enabled
                    ? "Start with Windows is enabled."
                    : "Start with Windows is disabled.");
        }
        catch (Exception exception)
        {
            _loadingControls = true;
            _startWithWindowsCheckBox.Checked = !enabled;
            _loadingControls = false;

            _logger.Error($"Windows startup settings could not be changed: {exception.Message}");
            MessageBox.Show(
                "Windows startup settings could not be changed." +
                Environment.NewLine + Environment.NewLine + exception.Message,
                "Start with Windows",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private async Task ToggleServerAsync()
    {
        if (_isBusy)
        {
            return;
        }

        if (_server.IsRunning)
        {
            await StopServerAsync();
        }
        else
        {
            await StartServerAsync(showDialogOnError: true);
        }
    }

    private async Task StartServerAsync(
        bool showDialogOnError,
        bool allowAutoOpenBrowser = true)
    {
        if (_isBusy || _server.IsRunning)
        {
            return;
        }

        SetBusy(true);
        try
        {
            SaveConfig();
            if (!await ValidateEnvironmentAsync(showDialogOnError))
            {
                return;
            }

            var port = (int)_portInput.Value;
            await _server.StartAsync(port, _lanCheckBox.Checked);

            if (_backgroundCheckBox.Checked)
            {
                _backgroundScheduler.Start();
            }

            SetRunningUi(true);
            LogAvailableUrls();

            if (allowAutoOpenBrowser && _autoOpenCheckBox.Checked)
            {
                await Task.Delay(350);
                OpenBrowser();
            }
        }
        catch (Exception exception)
        {
            _logger.Error($"The server could not start on port {_portInput.Value}: {exception.Message}");
            if (showDialogOnError)
            {
                MessageBox.Show(
                    $"The server cannot use port {_portInput.Value}.{Environment.NewLine}" +
                    "Make sure the port is not already in use, then choose a different port." +
                    Environment.NewLine + Environment.NewLine + exception.Message,
                    "Server startup failed",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            SetRunningUi(false);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async Task StopServerAsync()
    {
        if (_isBusy)
        {
            return;
        }

        SetBusy(true);
        try
        {
            await _backgroundScheduler.StopAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await _server.StopAsync(timeout.Token);
        }
        catch (Exception exception)
        {
            _logger.Error($"An error occurred while stopping the server: {exception.Message}");
        }
        finally
        {
            SetRunningUi(false);
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        _isBusy = busy;
        _startStopButton.Enabled = !busy;
        _startStopButton.Text = busy
            ? "Working..."
            : (_server.IsRunning ? "Stop Server" : "Start Server");
    }

    private void SetRunningUi(bool running)
    {
        _statusBadge.Text = running ? "ONLINE" : "OFFLINE";
        _statusBadge.BackColor = running ? GreenColor : RedColor;
        _startStopButton.Text = running ? "Stop Server" : "Start Server";
        _startStopButton.Image = running ? _stopIcon : _playIcon;
        _startStopButton.BackColor = running ? RedColor : GreenColor;
        _openButton.Enabled = running;
        _portInput.Enabled = !running;
        _lanCheckBox.Enabled = !running;
        _browseSourceButton.Enabled = !running;
        _urlLabel.Text = running ? _server.LocalUrl : $"http://127.0.0.1:{_portInput.Value}/";
        _urlLabel.Visible = running;
        if (_trayStartStopItem is not null)
        {
            _trayStartStopItem.Text = running ? "Stop Server" : "Start Server";
        }
    }

    private void LogAvailableUrls()
    {
        _logger.Info($"Application URL: {_server.LocalUrl}");
        if (_server.IsLanEnabled)
        {
            var lanAddress = FindLanAddress();
            if (lanAddress is not null)
            {
                _logger.Info($"LAN URL: http://{lanAddress}:{_server.Port}/");
            }
            _logger.Warning(
                "LAN mode is enabled. Allow PamantauServer through Windows Firewall only on trusted networks.");
        }
    }

    private void OpenBrowser()
    {
        if (!_server.IsRunning)
        {
            RestoreFromTray();
            _logger.Warning("The server is offline.");
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = _server.LocalUrl,
                UseShellExecute = true,
            });
            _logger.Info($"Opening browser: {_server.LocalUrl}");
        }
        catch (Exception exception)
        {
            _logger.Error($"The browser could not be opened: {exception.Message}");
        }
    }

    private void SaveConfig()
    {
        _config.Port = (int)_portInput.Value;
        _config.SourceDirectory = _paths.GetConfigSourceDirectory();
        _config.BindToLan = _lanCheckBox.Checked;
        _config.AutoOpenBrowser = _autoOpenCheckBox.Checked;
        _config.AutoStartServer = _autoStartCheckBox.Checked;
        _config.RunBackgroundScheduler = _backgroundCheckBox.Checked;
        try
        {
            _config.Save(_paths.ConfigFile);
        }
        catch (Exception exception)
        {
            _logger.Warning($"The configuration could not be saved: {exception.Message}");
        }
    }

    private void AppendLog(string line)
    {
        if (IsDisposed)
        {
            return;
        }
        if (InvokeRequired)
        {
            BeginInvoke(new Action<string>(AppendLog), line);
            return;
        }

        _logBox.AppendText(line + Environment.NewLine);
        _logBox.SelectionStart = _logBox.TextLength;
        _logBox.ScrollToCaret();
    }

    private void RestoreFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        SaveConfig();
        if (_allowClose)
        {
            return;
        }

        if (eventArgs.CloseReason == CloseReason.WindowsShutDown)
        {
            _allowClose = true;
            try
            {
                _backgroundScheduler.StopAsync().GetAwaiter().GetResult();
                _server.DisposeAsync().AsTask().GetAwaiter().GetResult();
            }
            catch
            {
                // Windows is shutting down; cleanup is best effort.
            }
            return;
        }

        eventArgs.Cancel = true;
        ShowInTaskbar = false;
        Hide();
        if (!_closeBalloonShown && _trayIcon is not null)
        {
            _closeBalloonShown = true;
            _trayIcon.ShowBalloonTip(
                2500,
                "Pamantau Webserver",
                "The webserver is still running in the System Tray. Select Exit to stop it.",
                ToolTipIcon.Info);
        }
    }

    private async Task ExitApplicationAsync()
    {
        if (_allowClose)
        {
            return;
        }

        _allowClose = true;
        Enabled = false;
        try
        {
            await _backgroundScheduler.StopAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await _server.StopAsync(timeout.Token);
        }
        catch (Exception exception)
        {
            _logger.Error($"Application cleanup did not finish: {exception.Message}");
        }
        finally
        {
            SaveConfig();
            if (_trayIcon is not null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }
            Close();
        }
    }

    private static string? FindLanAddress()
    {
        try
        {
            return Dns.GetHostAddresses(Dns.GetHostName())
                .FirstOrDefault(address =>
                    address.AddressFamily == AddressFamily.InterNetwork &&
                    !IPAddress.IsLoopback(address))
                ?.ToString();
        }
        catch
        {
            return null;
        }
    }

    private enum ButtonIcon
    {
        Play,
        Stop,
        Browser,
        Folder,
        Exit,
    }
}
