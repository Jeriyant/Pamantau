<?php
declare(strict_types=1);

const PAMANTAU_HEADLESS_SNAPSHOT_TTL = 90;

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
    $baseUrl = ($https ? 'https' : 'http') . '://localhost:' . $port
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

/** @return array{ok:bool,error?:string,token?:string} */
function pamantau_headless_create_job(): array
{
    try {
        $token = bin2hex(random_bytes(32));
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'Token renderer headless gagal dibuat'];
    }
    @unlink(pamantau_headless_output_path());
    $job = [
        'token_hash' => hash('sha256', $token),
        'status' => 'pending',
        'created_at' => time(),
        'expires_at' => time() + PAMANTAU_HEADLESS_SNAPSHOT_TTL,
    ];
    $json = json_encode($job, JSON_UNESCAPED_SLASHES);
    if (!is_string($json) || @file_put_contents(pamantau_headless_job_path(), $json, LOCK_EX) === false) {
        return ['ok' => false, 'error' => 'Render job tidak dapat disimpan'];
    }
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
    if (@file_put_contents(pamantau_headless_output_path(), $binary, LOCK_EX) === false) {
        return ['ok' => false, 'error' => 'Hasil render headless tidak dapat disimpan'];
    }
    $job = pamantau_headless_read_job();
    $job['status'] = 'complete';
    $job['completed_at'] = time();
    $job['mime'] = $valid['mime'];
    $job['filename'] = $valid['filename'];
    $job['width'] = $valid['width'];
    $job['height'] = $valid['height'];
    @file_put_contents(
        pamantau_headless_job_path(),
        json_encode($job, JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
    return array_merge($valid, ['ok' => true]);
}

function pamantau_headless_browser_executable(): string
{
    $configured = trim((string) getenv('PAMANTAU_BROWSER_PATH'));
    $candidates = $configured !== '' ? [$configured] : [];
    if (PHP_OS_FAMILY === 'Windows') {
        $candidates = array_merge($candidates, [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]);
    } else {
        foreach (['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge'] as $name) {
            $found = trim((string) @shell_exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null'));
            if ($found !== '') {
                $candidates[] = $found;
            }
        }
    }
    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_executable($candidate)) {
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
    }
    $status = proc_get_status($process);
    if (!empty($status['running'])) {
        @proc_terminate($process);
    }
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
    $browser = pamantau_headless_browser_executable();
    if ($browser === '') {
        return ['ok' => false, 'error' => 'Microsoft Edge/Google Chrome tidak ditemukan untuk renderer background'];
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
    $url = $baseUrl . 'index.php?headless_snapshot=' . rawurlencode($token);
    $command = [
        $browser,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--use-angle=swiftshader',
        '--use-gl=angle',
        '--enable-unsafe-swiftshader',
        '--disable-extensions',
        '--disable-background-networking',
        '--no-first-run',
        '--hide-scrollbars',
        '--window-size=1920,1080',
        '--virtual-time-budget=15000',
        '--dump-dom',
        '--user-data-dir=' . $profile,
        '--ignore-certificate-errors',
        $url,
    ];
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $pipes = [];
    $process = @proc_open($command, $descriptors, $pipes, null, null, ['bypass_shell' => true]);
    if (!is_resource($process)) {
        pamantau_headless_remove_tree($profile);
        return ['ok' => false, 'error' => 'Browser headless gagal dijalankan'];
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $deadline = microtime(true) + PAMANTAU_HEADLESS_SNAPSHOT_TTL;
    $error = '';
    $result = null;
    try {
        while (microtime(true) < $deadline) {
            // --dump-dom can be large; continuously drain both pipes.
            stream_get_contents($pipes[1]);
            $error .= (string) stream_get_contents($pipes[2]);
            if (strlen($error) > 4096) {
                $error = substr($error, -4096);
            }
            $job = pamantau_headless_read_job();
            if (
                $result === null
                && ($job['status'] ?? '') === 'complete'
                && is_file(pamantau_headless_output_path())
            ) {
                $binary = @file_get_contents(pamantau_headless_output_path());
                if (is_string($binary)) {
                    $valid = pamantau_validate_canvas_snapshot_binary($binary);
                    if (!empty($valid['ok'])) {
                        $result = array_merge($valid, ['binary' => $binary]);
                    }
                }
            }
            $status = proc_get_status($process);
            if (empty($status['running'])) {
                break;
            }
            usleep(150000);
        }
        if (is_array($result)) {
            return $result;
        }
        $detail = trim($error);
        return [
            'ok' => false,
            'error' => 'Renderer browser tidak menghasilkan canvas baru'
                . ($detail !== '' ? ': ' . substr($detail, 0, 300) : ''),
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
