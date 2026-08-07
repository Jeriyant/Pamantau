<?php
declare(strict_types=1);

const PAMANTAU_HEADLESS_SNAPSHOT_TTL = 120;

function pamantau_headless_job_path(): string
{
    return PAMANTAU_DB_DIR . '/headless-snapshot-job.json';
}

function pamantau_headless_output_path(): string
{
    return PAMANTAU_DB_DIR . '/headless-snapshot-output.bin';
}

function pamantau_runtime_base_url_path(): string
{
    return PAMANTAU_DB_DIR . '/runtime-base-url.json';
}

function pamantau_record_runtime_base_url(): void
{
    if (PHP_SAPI === 'cli' || empty($_SERVER['SERVER_PORT'])) {
        return;
    }
    $port = (int) $_SERVER['SERVER_PORT'];
    if ($port < 1 || $port > 65535) {
        return;
    }
    $https = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
    $basePath = rtrim(str_replace('/api', '', dirname($script)), '/.');
    // Prefer 127.0.0.1 so cron/root Chromium avoids localhost → ::1 quirks.
    $baseUrl = ($https ? 'https' : 'http') . '://127.0.0.1:' . $port
        . ($basePath !== '' ? '/' . ltrim($basePath, '/') : '') . '/';
    @file_put_contents(
        pamantau_runtime_base_url_path(),
        json_encode(['base_url' => $baseUrl, 'recorded_at' => date('c')], JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

function pamantau_headless_base_url(): string
{
    $env = trim((string) getenv('PAMANTAU_BASE_URL'));
    if ($env !== '' && preg_match('#^https?://(?:127\.0\.0\.1|localhost)(?::\d+)?(?:/.*)?$#i', $env)) {
        return rtrim($env, '/') . '/';
    }
    $saved = pamantau_read_json_file(pamantau_runtime_base_url_path(), []);
    $url = is_array($saved) ? trim((string) ($saved['base_url'] ?? '')) : '';
    if ($url !== '' && preg_match('#^https?://(?:127\.0\.0\.1|localhost)(?::\d+)?(?:/.*)?$#i', $url)) {
        return rtrim($url, '/') . '/';
    }
    return '';
}

/** @return array<string,mixed> */
function pamantau_headless_read_job(): array
{
    $job = pamantau_read_json_file(pamantau_headless_job_path(), []);
    return is_array($job) ? $job : [];
}

function pamantau_headless_token_valid(string $token): bool
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return false;
    }
    $job = pamantau_headless_read_job();
    return !empty($job['token_hash'])
        && (int) ($job['expires_at'] ?? 0) >= time()
        && ($job['status'] ?? '') === 'pending'
        && hash_equals((string) $job['token_hash'], hash('sha256', $token));
}

/**
 * Prefer a completed job, but also accept a valid output.bin alone.
 * Apache (www-data) may write the canvas while a root-owned job.json
 * cannot be updated to status=complete (common when cron runs as root).
 *
 * @return array{ok:bool,error?:string,binary?:string,mime?:string,filename?:string,width?:int,height?:int}|null
 */
function pamantau_headless_try_read_result(?int $notBefore = null): ?array
{
    $path = pamantau_headless_output_path();
    if (!is_file($path)) {
        return null;
    }
    if ($notBefore !== null) {
        $mtime = @filemtime($path);
        if (!is_int($mtime) || $mtime < $notBefore) {
            return null;
        }
    }
    $binary = @file_get_contents($path);
    if (!is_string($binary) || $binary === '') {
        return null;
    }
    $valid = pamantau_validate_canvas_snapshot_binary($binary);
    if (empty($valid['ok'])) {
        return null;
    }
    return array_merge($valid, ['binary' => $binary]);
}

/** @return array{ok:bool,error?:string,token?:string} */
function pamantau_headless_create_job(): array
{
    try {
        $token = bin2hex(random_bytes(32));
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'Token renderer headless gagal dibuat'];
    }
    @unlink(pamantau_headless_output_path());
    $jobPath = pamantau_headless_job_path();
    $dbDir = dirname($jobPath);
    if (!is_dir($dbDir) && !@mkdir($dbDir, 0775, true) && !is_dir($dbDir)) {
        return ['ok' => false, 'error' => 'Folder database tidak dapat dibuat (izin www-data)'];
    }
    // Drop stale root-owned job files so www-data can recreate them.
    if (is_file($jobPath) && !is_writable($jobPath)) {
        @unlink($jobPath);
        if (is_file($jobPath) && !is_writable($jobPath)) {
            return [
                'ok' => false,
                'error' => 'File job headless milik user lain (sering root). Jalankan: '
                    . 'rm -f ' . $jobPath . ' && chown -R www-data:www-data ' . $dbDir
                    . ' — dan pastikan cron memakai www-data, bukan root',
            ];
        }
    } else {
        @unlink($jobPath);
    }
    $job = [
        'token_hash' => hash('sha256', $token),
        'status' => 'pending',
        'created_at' => time(),
        'expires_at' => time() + PAMANTAU_HEADLESS_SNAPSHOT_TTL,
    ];
    $json = json_encode($job, JSON_UNESCAPED_SLASHES);
    if (!is_string($json) || @file_put_contents($jobPath, $json, LOCK_EX) === false) {
        return [
            'ok' => false,
            'error' => 'Render job tidak dapat disimpan — pastikan '
                . $dbDir . ' dimiliki www-data dan writable (chown -R www-data:www-data database)',
        ];
    }
    @chmod($jobPath, 0664);
    return ['ok' => true, 'token' => $token];
}

/** @return array{ok:bool,error?:string,binary?:string,mime?:string,filename?:string,width?:int,height?:int} */
function pamantau_headless_complete_upload(mixed $upload, string $token): array
{
    if (!pamantau_headless_token_valid($token)) {
        return ['ok' => false, 'error' => 'Token render tidak valid atau kedaluwarsa'];
    }
    if (!is_array($upload) || (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'Hasil render headless tidak ditemukan'];
    }
    $tmp = (string) ($upload['tmp_name'] ?? '');
    $binary = $tmp !== '' && is_readable($tmp) ? @file_get_contents($tmp) : false;
    if (!is_string($binary)) {
        return ['ok' => false, 'error' => 'Hasil render headless tidak dapat dibaca'];
    }
    $valid = pamantau_validate_canvas_snapshot_binary($binary);
    if (empty($valid['ok'])) {
        return $valid;
    }
    $outPath = pamantau_headless_output_path();
    if (@file_put_contents($outPath, $binary, LOCK_EX) === false) {
        return ['ok' => false, 'error' => 'Hasil render headless tidak dapat disimpan'];
    }
    @chmod($outPath, 0664);
    $job = pamantau_headless_read_job();
    $job['status'] = 'complete';
    $job['completed_at'] = time();
    $job['mime'] = $valid['mime'];
    $job['filename'] = $valid['filename'];
    $job['width'] = $valid['width'];
    $job['height'] = $valid['height'];
    // Best-effort: output.bin alone is enough if job.json is not writable (root cron).
    @file_put_contents(
        pamantau_headless_job_path(),
        json_encode($job, JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
    return array_merge($valid, ['ok' => true]);
}

function pamantau_headless_browser_candidate_usable(string $candidate): bool
{
    return $candidate !== '' && is_file($candidate) && is_executable($candidate);
}

/**
 * Native Linux Chromium/Chrome paths (Debian/Ubuntu first). Absolute paths before
 * PATH lookup so root cron with a short PATH still finds the browser.
 *
 * @return list<string>
 */
function pamantau_headless_linux_browser_candidates(): array
{
    $candidates = [];
    $configured = trim((string) getenv('PAMANTAU_BROWSER_PATH'));
    if ($configured !== '') {
        $candidates[] = $configured;
    }
    $candidates = array_merge($candidates, [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/microsoft-edge-stable',
        '/usr/bin/microsoft-edge',
        '/snap/bin/chromium',
    ]);
    foreach ([
        'chromium',
        'chromium-browser',
        'google-chrome-stable',
        'google-chrome',
        'microsoft-edge-stable',
        'microsoft-edge',
    ] as $name) {
        $found = trim((string) @shell_exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null'));
        if ($found !== '') {
            $candidates[] = $found;
        }
    }
    return array_values(array_unique($candidates));
}

function pamantau_headless_browser_missing_hint(): string
{
    if (PHP_OS_FAMILY === 'Windows') {
        return 'Google Chrome atau Microsoft Edge tidak ditemukan untuk renderer background';
    }
    return 'Chromium/Chrome tidak ditemukan. Di Debian/Ubuntu: sudo apt install chromium'
        . ' (atau set PAMANTAU_BROWSER_PATH)';
}

function pamantau_headless_browser_executable(): string
{
    $configured = trim((string) getenv('PAMANTAU_BROWSER_PATH'));
    if (PHP_OS_FAMILY === 'Windows') {
        $candidates = $configured !== '' ? [$configured] : [];
        $candidates = array_merge($candidates, [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ]);
        foreach ($candidates as $candidate) {
            if (pamantau_headless_browser_candidate_usable($candidate)) {
                return $candidate;
            }
        }
        return '';
    }

    foreach (pamantau_headless_linux_browser_candidates() as $candidate) {
        if (pamantau_headless_browser_candidate_usable($candidate)) {
            return $candidate;
        }
    }
    return '';
}

function pamantau_headless_remove_tree(string $path): void
{
    $real = realpath($path);
    $temp = realpath(sys_get_temp_dir());
    if ($real === false || $temp === false || !str_starts_with(strtolower($real), strtolower($temp . DIRECTORY_SEPARATOR . 'pamantau-headless-'))) {
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($real, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    }
    @rmdir($real);
}

/** Stop only the browser process tree started for this render job. */
function pamantau_headless_terminate_process(mixed $process): void
{
    if (!is_resource($process)) {
        return;
    }
    $status = proc_get_status($process);
    $pid = max(0, (int) ($status['pid'] ?? 0));
    if ($pid > 0 && PHP_OS_FAMILY === 'Windows') {
        $null = fopen('NUL', 'w');
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => is_resource($null) ? $null : ['pipe', 'w'],
            2 => is_resource($null) ? $null : ['pipe', 'w'],
        ];
        $killerPipes = [];
        $killer = @proc_open(
            ['taskkill.exe', '/PID', (string) $pid, '/T', '/F'],
            $descriptors,
            $killerPipes,
            null,
            null,
            ['bypass_shell' => true]
        );
        if (isset($killerPipes[0]) && is_resource($killerPipes[0])) {
            fclose($killerPipes[0]);
        }
        if (is_resource($killer)) {
            @proc_close($killer);
        }
        if (is_resource($null)) {
            fclose($null);
        }
    } elseif ($pid > 0 && function_exists('posix_kill')) {
        @posix_kill(-$pid, defined('SIGTERM') ? SIGTERM : 15);
        @posix_kill($pid, defined('SIGTERM') ? SIGTERM : 15);
    }
    $status = proc_get_status($process);
    if (!empty($status['running'])) {
        @proc_terminate($process);
    }
}

/**
 * Environment for headless Chromium on Linux VPS (no interactive D-Bus session).
 *
 * @return array<string,string>|null null = inherit (Windows)
 */
function pamantau_headless_proc_env(): ?array
{
    if (PHP_OS_FAMILY === 'Windows') {
        return null;
    }

    $env = [];
    $fromGetenv = @getenv();
    if (is_array($fromGetenv)) {
        foreach ($fromGetenv as $key => $value) {
            if (is_string($key) && is_string($value) && $key !== '') {
                $env[$key] = $value;
            }
        }
    }
    foreach ($_ENV as $key => $value) {
        if (is_string($key) && is_string($value) && $key !== '') {
            $env[$key] = $value;
        }
    }

    // Empty/malformed DBUS_SESSION_BUS_ADDRESS under cron causes:
    // "Could not parse server address: Unknown address type"
    unset($env['DBUS_SESSION_BUS_ADDRESS'], $env['DBUS_STARTER_ADDRESS'], $env['DBUS_STARTER_BUS_TYPE']);
    foreach ([
        '/run/dbus/system_bus_socket',
        '/var/run/dbus/system_bus_socket',
    ] as $socket) {
        if (is_file($socket)) {
            $env['DBUS_SESSION_BUS_ADDRESS'] = 'unix:path=' . $socket;
            break;
        }
    }

    $xdg = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pamantau-xdg-runtime';
    if (!is_dir($xdg)) {
        @mkdir($xdg, 0700, true);
    }
    if (is_dir($xdg) && is_writable($xdg)) {
        $env['XDG_RUNTIME_DIR'] = $xdg;
    }

    $home = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pamantau-home';
    if (!is_dir($home)) {
        @mkdir($home, 0700, true);
    }
    if (is_dir($home) && is_writable($home)) {
        $env['HOME'] = $home;
    }

    if (!isset($env['LANG']) || trim((string) $env['LANG']) === '') {
        $env['LANG'] = 'C.UTF-8';
    }

    // Debian chromium often spawns crashpad_handler without --database under cron.
    $env['CHROME_HEADLESS'] = '1';
    unset($env['CHROME_CRASHPAD_PIPE_NAME'], $env['BREAKPAD_DUMP_LOCATION']);

    return $env;
}

function pamantau_headless_stderr_summary(string $stderr): string
{
    $lines = preg_split('/\R/', $stderr) ?: [];
    $kept = [];
    foreach ($lines as $line) {
        $line = trim((string) $line);
        if ($line === '') {
            continue;
        }
        if (preg_match(
            '/dbus\/bus\.cc|Failed to connect to the bus|Unknown address type|ERROR:gpu_|WARNING:gpu_|viz_main_impl|DevTools listening|chrome_crashpad_handler|crashpad\/|recvmsg: Connection reset|Crashpad|breakpad|--database is required/i',
            $line
        )) {
            continue;
        }
        $kept[] = $line;
    }
    $summary = trim(implode(' | ', $kept));
    if ($summary === '' && trim($stderr) !== '') {
        return 'Chromium headless jalan, tetapi canvas belum diunggah'
            . ' (cek: curl -k ke URL lokal; hapus database/background.lock jika stale)';
    }
    return $summary;
}

/**
 * Prefer the real Chromium binary over Debian's wrapper when available.
 */
function pamantau_headless_resolve_browser_binary(string $browser): string
{
    if ($browser === '' || PHP_OS_FAMILY === 'Windows') {
        return $browser;
    }
    $real = realpath($browser);
    $base = $real !== false ? $real : $browser;
    $name = strtolower(basename($base));
    if (str_contains($name, 'chromium')) {
        foreach ([
            '/usr/lib/chromium/chromium',
            '/usr/lib/chromium-browser/chromium',
            '/usr/lib/chromium-browser/chromium-browser',
        ] as $lib) {
            if (is_file($lib) && is_executable($lib)) {
                return $lib;
            }
        }
    }
    return $browser;
}

/**
 * Launch a fresh browser renderer and return only this job's newly rendered canvas.
 *
 * @return array{ok:bool,error?:string,binary?:string,mime?:string,filename?:string,width?:int,height?:int}
 */
function pamantau_render_topology_headless(): array
{
    $baseUrl = pamantau_headless_base_url();
    if ($baseUrl === '') {
        return ['ok' => false, 'error' => 'URL lokal renderer belum tersedia; buka Pamantau sekali setelah server aktif'];
    }
    $browser = pamantau_headless_resolve_browser_binary(pamantau_headless_browser_executable());
    if ($browser === '') {
        return ['ok' => false, 'error' => pamantau_headless_browser_missing_hint()];
    }
    $created = pamantau_headless_create_job();
    if (empty($created['ok'])) {
        return $created;
    }
    $token = (string) $created['token'];
    $profile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pamantau-headless-' . bin2hex(random_bytes(8));
    if (!@mkdir($profile, 0700, true) && !is_dir($profile)) {
        return ['ok' => false, 'error' => 'Folder sementara renderer tidak dapat dibuat'];
    }
    $crashDir = $profile . DIRECTORY_SEPARATOR . 'Crashpad';
    if (!@mkdir($crashDir, 0700, true) && !is_dir($crashDir)) {
        $crashDir = $profile;
    }
    $url = $baseUrl . 'index.php?headless_snapshot=' . rawurlencode($token);
    // Keep the browser open until JS POSTs the canvas (complete_headless_snapshot).
    // Do not use --dump-dom / --virtual-time-budget: those exit before async upload.
    // --crash-dumps-dir + crashpad flags avoid "--database is required" under cron.
    $command = [
        $browser,
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-gpu-sandbox',
        '--use-angle=swiftshader',
        '--use-gl=angle',
        '--enable-unsafe-swiftshader',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-breakpad',
        '--disable-crash-reporter',
        '--disable-features=TranslateUI,AudioServiceOutOfProcess,Crashpad,CrashReporting',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--window-size=1920,1080',
        '--user-data-dir=' . $profile,
        '--crash-dumps-dir=' . $crashDir,
        '--ignore-certificate-errors',
        '--allow-insecure-localhost',
        $url,
    ];
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $pipes = [];
    $process = @proc_open(
        $command,
        $descriptors,
        $pipes,
        null,
        pamantau_headless_proc_env(),
        ['bypass_shell' => true]
    );
    if (!is_resource($process)) {
        pamantau_headless_remove_tree($profile);
        return ['ok' => false, 'error' => 'Browser headless gagal dijalankan'];
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $deadline = microtime(true) + PAMANTAU_HEADLESS_SNAPSHOT_TTL;
    $browserExitGrace = 3.0;
    $browserExitAt = null;
    $error = '';
    $result = null;
    $outputNotBefore = time() - 1;
    try {
        while (microtime(true) < $deadline) {
            // Drain pipes so a blocked stdout/stderr buffer cannot stall Chromium.
            stream_get_contents($pipes[1]);
            $error .= (string) stream_get_contents($pipes[2]);
            if (strlen($error) > 4096) {
                $error = substr($error, -4096);
            }
            $try = pamantau_headless_try_read_result($outputNotBefore);
            if (is_array($try)) {
                $result = $try;
                break;
            }
            $status = proc_get_status($process);
            if (empty($status['running'])) {
                if ($browserExitAt === null) {
                    $browserExitAt = microtime(true);
                }
                // Brief grace for a late POST, then fail (browser died early).
                if ((microtime(true) - $browserExitAt) >= $browserExitGrace) {
                    break;
                }
            }
            usleep(150000);
        }
        if ($result === null) {
            $try = pamantau_headless_try_read_result($outputNotBefore);
            if (is_array($try)) {
                $result = $try;
            }
        }
        if (is_array($result)) {
            return $result;
        }
        $detail = pamantau_headless_stderr_summary($error);
        if ($detail === '') {
            $detail = 'Chromium headless jalan, tetapi canvas belum diunggah'
                . ' (cek: curl -k ke URL lokal; hapus database/background.lock jika stale)';
        }
        return [
            'ok' => false,
            'error' => 'Renderer browser tidak menghasilkan canvas baru'
                . ': ' . substr($detail, 0, 300)
                . ' [url=' . $baseUrl . ']',
        ];
    } finally {
        pamantau_headless_terminate_process($process);
        foreach ([1, 2] as $pipeNo) {
            if (isset($pipes[$pipeNo]) && is_resource($pipes[$pipeNo])) {
                fclose($pipes[$pipeNo]);
            }
        }
        @proc_close($process);
        @unlink(pamantau_headless_job_path());
        @unlink(pamantau_headless_output_path());
        pamantau_headless_remove_tree($profile);
    }
}
