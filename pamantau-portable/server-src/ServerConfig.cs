using System.Text.Json;

namespace PamantauPortable;

internal sealed class ServerConfig
{
    public int Port { get; set; } = 8000;
    public string SourceDirectory { get; set; } = "app";
    public bool BindToLan { get; set; }
    public bool AutoOpenBrowser { get; set; } = true;
    public bool AutoStartServer { get; set; } = true;
    public bool RunBackgroundScheduler { get; set; } = true;

    public static ServerConfig Load(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new ServerConfig();
            }

            var config = JsonSerializer.Deserialize<ServerConfig>(
                File.ReadAllText(path),
                JsonOptions());

            if (config is null)
            {
                return new ServerConfig();
            }

            config.Port = Math.Clamp(config.Port, 1024, 65535);
            config.SourceDirectory = string.IsNullOrWhiteSpace(config.SourceDirectory)
                ? "app"
                : config.SourceDirectory.Trim();
            return config;
        }
        catch
        {
            return new ServerConfig();
        }
    }

    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(this, JsonOptions()));
        File.Move(tempPath, path, overwrite: true);
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };
}
