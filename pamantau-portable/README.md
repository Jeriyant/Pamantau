# Pamantau Webserver

A standalone Windows x64 package for running Pamantau without installing PHP,
Apache, a database server, or the .NET Runtime.

`PamantauServer.exe` is not signed with a commercial code-signing certificate,
so Windows SmartScreen may display a warning on another computer. The complete
webserver source is available in `server-src/`, and the final executable
checksum is recorded in `PORTABLE-MANIFEST.json`.

## Run the webserver

1. Open `PamantauServer.exe`.
2. Select the Pamantau source directory when using source outside the bundled
   `app/` directory.
3. Enter the desired port while the server is offline.
4. Select **Start Server**.
5. Select **Open Browser**, or visit `http://127.0.0.1:PORT/`.

The source directory, port, automatic server start, automatic browser opening,
LAN mode, and background scheduler settings are stored in
`data/server-config.json`.

## Start with Windows

Enable **Start with Windows** to launch Pamantau Webserver after Windows
sign-in. It starts the server in the System Tray without opening the browser.
Double-click the tray icon to show the application window.

## LAN mode

Enable **Allow access from the LAN**, then restart the server. Windows Firewall
may ask for permission. Allow access only on private and trusted networks. Do
not expose the port directly to the internet because this package uses local
HTTP without TLS.

## Data and backups

- Active monitoring database and counters: selected server source directory
  under `database/`
- Topology JSON: local file selected through **Open**, **Save**, or **Save As**;
  it does not contain or overwrite server polling counters and history
- Webserver log: `data/logs/server.log`
- PHP log: `data/logs/php-error.log`
- Configuration: `data/server-config.json`
- Update backups: `data/update-backups/`

Closing the window keeps the webserver running in the System Tray. Use **Exit**
from the window or tray menu to stop it completely.

## Package structure

- `PamantauServer.exe`: self-contained webserver and launcher
- `server-src/`: complete C# webserver source
- `server/portable-update.php`: portable Windows updater
- `app/`: bundled Pamantau source and application data
- `php/`: official PHP runtime, configuration, and extensions
- `scripts/`: webserver rebuild and source synchronization scripts
- `REQUIREMENTS.md`: audited application requirements

## Rebuild the executable

On a development computer with the .NET 8 SDK:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-server.ps1
```

To synchronize another Pamantau source directory into the bundled `app/`
directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-app.ps1 -SourceRoot C:\path\to\Pamantau
```

To create sanitized GitHub release archives after building the executable:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

The packaging script creates `pamantau-dist.zip` for in-app updates and
`Pamantau-Portable-vX.Y.Z-win-x64.zip` for new portable installations. Runtime
configuration, logs, sessions, topology data, and the live database are not
included.

## Windows prerequisite

The official PHP runtime requires Microsoft Visual C++ Redistributable
2015-2022 x64. It is normally available on Windows 10 and Windows 11. If PHP
validation fails because a runtime DLL is missing, run
`prerequisites/vc_redist.x64.exe`, then reopen `PamantauServer.exe`.
