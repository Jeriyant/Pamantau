# Pamantau Portable Requirements Audit

This audit is based on the application source bundled in `app/`.

## Application runtime

- PHP 8.1 or newer is required because the source uses the `mixed` type and the
  `never` return type.
- Apache, Nginx, MySQL, MariaDB, Node.js, and Composer are not required.
- The application database is stored in `database/pamantau.json` under the
  selected source directory.
- The source `database/` directory and the portable `data/sessions`,
  `data/temp`, and `data/logs` directories must be writable.
- Windows `ping` and `tracert` commands are required for ICMP monitoring and
  traceroute.
- PHP functions `exec`, `proc_open`, `fsockopen`, and
  `stream_socket_client` must be enabled. The `sockets` extension is required
  for bounded parallel automatic port discovery.

## Bundled PHP extensions

- `curl`: Telegram and HTTPS updates
- `gd`: PNG and JPEG topology snapshots
- `mbstring`: UTF-8 labels and text
- `openssl`: HTTPS connections
- `sockets`: bounded parallel port discovery across devices
- `zip`: installing release updates on Windows
- `fileinfo`: file type detection

## Webserver architecture

`PamantauServer.exe` runs Kestrel inside the executable and processes PHP files
through `php-cgi.exe`. PHP requests run in parallel, allowing API polling and
update progress requests to continue without the blocking behavior of the PHP
built-in development server on Windows.

The webserver blocks direct HTTP access to:

- `database/`
- `includes/`
- `cli/`
- dotfiles
- JSON, log, lock, INI, shell, batch, and PowerShell files

The `/update.php` endpoint is routed to `server/portable-update.php`. The
portable updater preserves the database and topology JSON files, validates ZIP
paths, and retains the two most recent source backups in
`data/update-backups/`.
