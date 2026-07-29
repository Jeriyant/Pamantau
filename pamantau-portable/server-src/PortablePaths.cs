namespace PamantauPortable;

internal sealed class PortablePaths
{
    public PortablePaths(string? sourceDirectory = null)
    {
        Root = Path.GetFullPath(AppContext.BaseDirectory);
        PhpRoot = Path.Combine(Root, "php");
        ServerRoot = Path.Combine(Root, "server");
        DataRoot = Path.Combine(Root, "data");
        AppRoot = ResolveAppRoot(sourceDirectory);

        PhpExe = Path.Combine(PhpRoot, "php.exe");
        PhpCgiExe = Path.Combine(PhpRoot, "php-cgi.exe");
        PhpIni = Path.Combine(PhpRoot, "php.ini");
        PortableUpdater = Path.Combine(ServerRoot, "portable-update.php");
        ConfigFile = Path.Combine(DataRoot, "server-config.json");
        LogFile = Path.Combine(DataRoot, "logs", "server.log");
        PhpErrorLog = Path.Combine(DataRoot, "logs", "php-error.log");
        SessionsRoot = Path.Combine(DataRoot, "sessions");
        TempRoot = Path.Combine(DataRoot, "temp");
    }

    public string Root { get; }
    public string AppRoot { get; private set; }
    public string PhpRoot { get; }
    public string ServerRoot { get; }
    public string DataRoot { get; }
    public string PhpExe { get; }
    public string PhpCgiExe { get; }
    public string PhpIni { get; }
    public string PortableUpdater { get; }
    public string ConfigFile { get; }
    public string LogFile { get; }
    public string PhpErrorLog { get; }
    public string SessionsRoot { get; }
    public string TempRoot { get; }

    public void EnsureWritableFolders()
    {
        Directory.CreateDirectory(DataRoot);
        Directory.CreateDirectory(Path.GetDirectoryName(LogFile)!);
        Directory.CreateDirectory(SessionsRoot);
        Directory.CreateDirectory(TempRoot);
        Directory.CreateDirectory(Path.Combine(DataRoot, "update-work"));
        if (Directory.Exists(AppRoot))
        {
            Directory.CreateDirectory(Path.Combine(AppRoot, "database"));
        }
    }

    public void SetAppRoot(string sourceDirectory)
    {
        AppRoot = ResolveAppRoot(sourceDirectory);
    }

    public string GetConfigSourceDirectory()
    {
        var rootPrefix = Root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return AppRoot.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)
            ? Path.GetRelativePath(Root, AppRoot)
            : AppRoot;
    }

    public IReadOnlyList<string> FindMissingRuntimeFiles()
    {
        var required = new[]
        {
            PhpExe,
            PhpCgiExe,
            PhpIni,
            PortableUpdater,
        }.Concat(RequiredSourceFiles());

        return required.Where(path => !File.Exists(path)).ToArray();
    }

    public IReadOnlyList<string> FindMissingSourceFiles() =>
        RequiredSourceFiles().Where(path => !File.Exists(path)).ToArray();

    public void VerifyAppDataWritable()
    {
        var testFile = Path.Combine(AppRoot, "database", $".portable-write-{Guid.NewGuid():N}.tmp");
        using (var stream = new FileStream(
                   testFile,
                   FileMode.CreateNew,
                   FileAccess.ReadWrite,
                   FileShare.None,
                   bufferSize: 1,
                   FileOptions.DeleteOnClose))
        {
            stream.WriteByte(1);
        }

        if (File.Exists(testFile))
        {
            File.Delete(testFile);
        }
    }

    private string ResolveAppRoot(string? sourceDirectory)
    {
        var value = string.IsNullOrWhiteSpace(sourceDirectory)
            ? "app"
            : sourceDirectory.Trim();
        return Path.GetFullPath(
            Path.IsPathRooted(value)
                ? value
                : Path.Combine(Root, value));
    }

    private IEnumerable<string> RequiredSourceFiles()
    {
        yield return Path.Combine(AppRoot, "index.php");
        yield return Path.Combine(AppRoot, "login.php");
        yield return Path.Combine(AppRoot, "api", "index.php");
        yield return Path.Combine(AppRoot, "includes", "db.php");
    }
}
