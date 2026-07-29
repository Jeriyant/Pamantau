<?php
declare(strict_types=1);

/**
 * Windows-safe updater used only by Pamantau Portable Server.
 *
 * Kestrel routes /update.php to this file, so an application update cannot
 * overwrite the portable updater itself. Runtime data in app/database and
 * topology JSON files in the app root are preserved. The previous app version
 * is kept in data/update-backups for recovery.
 */

$appRoot = portable_update_env_path('PAMANTAU_APP_ROOT');
$dataRoot = portable_update_env_path('PAMANTAU_DATA_ROOT');

require_once $appRoot . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'db.php';
require_once $appRoot . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'auth.php';

pamantau_auth_boot();
pamantau_auth_ensure_bootstrap();
if (!pamantau_auth_logged_in()) {
    portable_update_json(['ok' => false, 'error' => 'Unauthorized'], 401);
}

// Never hold the PHP session lock during a long download/install. Kestrel can
// then serve update progress requests through other PHP-CGI processes.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
@set_time_limit(0);
@ini_set('max_execution_time', '0');
ignore_user_abort(true);

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

$progressFile = $dataRoot . DIRECTORY_SEPARATOR . 'update-progress.json';

if ($method === 'GET') {
    if (($_GET['action'] ?? '') === 'check') {
        try {
            $release = portable_update_latest_release();
            portable_update_json([
                'ok' => true,
                'tag' => $release['tag'],
                'version' => $release['version'],
                'notes' => $release['notes'],
                'htmlUrl' => $release['htmlUrl'],
                'downloadUrl' => $release['downloadUrl'],
            ]);
        } catch (Throwable $error) {
            portable_update_json([
                'ok' => false,
                'error' => $error->getMessage(),
            ], 502);
        }
    }

    if (is_file($progressFile)) {
        $progress = json_decode((string) @file_get_contents($progressFile), true);
        if (is_array($progress)) {
            portable_update_json($progress);
        }
    }

    portable_update_json([
        'stage' => 'idle',
        'percent' => 0,
        'message' => '',
        'bytesReceived' => 0,
        'bytesTotal' => 0,
    ]);
}

if ($method !== 'POST') {
    portable_update_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$lockPath = $dataRoot . DIRECTORY_SEPARATOR . 'update.lock';
$lockHandle = @fopen($lockPath, 'c+');
if ($lockHandle === false || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
    if (is_resource($lockHandle)) {
        fclose($lockHandle);
    }
    portable_update_json([
        'ok' => false,
        'error' => 'Update lain sedang berjalan.',
    ], 409);
}

try {
    portable_update_write_progress($progressFile, 'check', 2, 'Memeriksa release GitHub...');
    $release = portable_update_latest_release();
    portable_update_write_progress(
        $progressFile,
        'check',
        8,
        'Release ' . $release['tag'] . ' ditemukan'
    );

    $workParent = $dataRoot . DIRECTORY_SEPARATOR . 'update-work';
    portable_update_ensure_dir($workParent);
    $workRoot = $workParent . DIRECTORY_SEPARATOR . 'job-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4));
    $extractRoot = $workRoot . DIRECTORY_SEPARATOR . 'extract';
    $zipPath = $workRoot . DIRECTORY_SEPARATOR . 'pamantau-dist.zip';
    portable_update_ensure_dir($extractRoot);

    portable_update_download($release['downloadUrl'], $zipPath, $progressFile);
    portable_update_extract_zip($zipPath, $extractRoot, $progressFile);
    $newAppRoot = portable_update_find_app_root($extractRoot);
    portable_update_validate_app($newAppRoot);

    portable_update_write_progress($progressFile, 'install', 25, 'Menyiapkan data aplikasi...');
    portable_update_preserve_runtime_data($appRoot, $newAppRoot, $extractRoot);

    $backupParent = $dataRoot . DIRECTORY_SEPARATOR . 'update-backups';
    portable_update_ensure_dir($backupParent);
    $backupRoot = $backupParent . DIRECTORY_SEPARATOR . 'app-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3));

    portable_update_write_progress($progressFile, 'install', 55, 'Mengganti source aplikasi...');
    if (!@rename($appRoot, $backupRoot)) {
        throw new RuntimeException('Folder aplikasi lama tidak dapat dipindahkan untuk backup.');
    }

    $installed = false;
    try {
        if (!@rename($newAppRoot, $appRoot)) {
            throw new RuntimeException('Source aplikasi baru tidak dapat dipasang.');
        }
        $installed = true;
    } finally {
        if (!$installed && !is_dir($appRoot) && is_dir($backupRoot)) {
            @rename($backupRoot, $appRoot);
        }
    }

    portable_update_validate_app($appRoot);
    portable_update_write_progress($progressFile, 'install', 90, 'Membersihkan file sementara...');
    portable_update_remove_tree($workRoot, $workParent);
    portable_update_prune_backups($backupParent, 2);

    $version = $release['version'];
    $versionFile = $appRoot . DIRECTORY_SEPARATOR . 'version.json';
    if (is_file($versionFile)) {
        $versionData = json_decode((string) @file_get_contents($versionFile), true);
        if (is_array($versionData) && !empty($versionData['version'])) {
            $version = (string) $versionData['version'];
        }
    }

    portable_update_write_progress(
        $progressFile,
        'done',
        100,
        'Selesai v' . $version
    );
    portable_update_json([
        'ok' => true,
        'version' => $version,
        'tag' => $release['tag'],
        'backup' => basename($backupRoot),
    ]);
} catch (Throwable $error) {
    portable_update_write_progress(
        $progressFile,
        'error',
        0,
        $error->getMessage()
    );
    portable_update_json([
        'ok' => false,
        'error' => $error->getMessage(),
    ], 500);
} finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
}

/**
 * @return array{tag:string,version:string,notes:string,htmlUrl:string,downloadUrl:string}
 */
function portable_update_latest_release(): array
{
    $apiUrl = 'https://api.github.com/repos/Jeriyant/Pamantau/releases/latest';
    $curl = curl_init($apiUrl);
    if ($curl === false) {
        throw new RuntimeException('Ekstensi cURL tidak dapat diinisialisasi.');
    }

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_USERAGENT => 'Pamantau-Portable-Updater/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: application/vnd.github+json',
            'X-GitHub-Api-Version: 2022-11-28',
        ],
    ];
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        $options[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
    }
    curl_setopt_array($curl, $options);

    $raw = curl_exec($curl);
    $curlError = curl_error($curl);
    $httpCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if (!is_string($raw) || $raw === '' || $httpCode < 200 || $httpCode >= 300) {
        $detail = $curlError !== '' ? $curlError : 'HTTP ' . $httpCode;
        throw new RuntimeException('Gagal mengambil metadata rilis dari GitHub: ' . $detail);
    }

    $metadata = json_decode($raw, true);
    if (!is_array($metadata) || empty($metadata['tag_name'])) {
        throw new RuntimeException('Metadata release GitHub tidak valid.');
    }

    $downloadUrl = '';
    $assets = is_array($metadata['assets'] ?? null) ? $metadata['assets'] : [];
    foreach ($assets as $asset) {
        if (!is_array($asset)) {
            continue;
        }
        if ((string) ($asset['name'] ?? '') === 'pamantau-dist.zip') {
            $downloadUrl = trim((string) ($asset['browser_download_url'] ?? ''));
            break;
        }
    }
    if ($downloadUrl === '') {
        foreach ($assets as $asset) {
            if (!is_array($asset)) {
                continue;
            }
            $name = strtolower((string) ($asset['name'] ?? ''));
            if (str_ends_with($name, '.zip')) {
                $downloadUrl = trim((string) ($asset['browser_download_url'] ?? ''));
                break;
            }
        }
    }
    if ($downloadUrl === '' || !str_starts_with($downloadUrl, 'https://')) {
        throw new RuntimeException('Asset pamantau-dist.zip tidak ditemukan pada release terbaru.');
    }

    $tag = trim((string) $metadata['tag_name']);
    return [
        'tag' => $tag,
        'version' => ltrim($tag, 'vV'),
        'notes' => (string) ($metadata['body'] ?? ''),
        'htmlUrl' => (string) ($metadata['html_url'] ?? ''),
        'downloadUrl' => $downloadUrl,
    ];
}

function portable_update_download(string $url, string $target, string $progressFile): void
{
    $file = @fopen($target, 'wb');
    if ($file === false) {
        throw new RuntimeException('File unduhan sementara tidak dapat dibuat.');
    }

    $curl = curl_init($url);
    if ($curl === false) {
        fclose($file);
        throw new RuntimeException('Ekstensi cURL tidak dapat diinisialisasi.');
    }

    $lastProgressAt = 0.0;
    $options = [
        CURLOPT_FILE => $file,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => 600,
        CURLOPT_USERAGENT => 'Pamantau-Portable-Updater/1.0',
        CURLOPT_NOPROGRESS => false,
        CURLOPT_PROGRESSFUNCTION => static function (
            $resource,
            float $downloadTotal,
            float $downloaded,
            float $uploadTotal,
            float $uploaded
        ) use ($progressFile, &$lastProgressAt): int {
            $now = microtime(true);
            if (($now - $lastProgressAt) < 0.20 && $downloadTotal > 0 && $downloaded < $downloadTotal) {
                return 0;
            }
            $lastProgressAt = $now;
            $percent = $downloadTotal > 0
                ? (int) min(100, round(($downloaded / $downloadTotal) * 100))
                : 0;
            portable_update_write_progress(
                $progressFile,
                'download',
                $percent,
                'Mengunduh paket...',
                (int) $downloaded,
                (int) $downloadTotal
            );
            return 0;
        },
    ];
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        $options[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
    }
    curl_setopt_array($curl, $options);

    portable_update_write_progress($progressFile, 'download', 0, 'Memulai unduhan...');
    $success = curl_exec($curl);
    $curlError = curl_error($curl);
    $httpCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    fclose($file);

    if ($success !== true || $httpCode < 200 || $httpCode >= 300 || !is_file($target) || filesize($target) < 1) {
        @unlink($target);
        $detail = $curlError !== '' ? $curlError : 'HTTP ' . $httpCode;
        throw new RuntimeException('Download paket update gagal: ' . $detail);
    }

    $size = (int) filesize($target);
    portable_update_write_progress(
        $progressFile,
        'download',
        100,
        'Unduhan selesai',
        $size,
        $size
    );
}

function portable_update_extract_zip(string $zipPath, string $extractRoot, string $progressFile): void
{
    $zip = new ZipArchive();
    $openResult = $zip->open($zipPath);
    if ($openResult !== true) {
        throw new RuntimeException('Paket update bukan arsip ZIP yang valid (kode ' . $openResult . ').');
    }

    portable_update_write_progress($progressFile, 'extract', 5, 'Memeriksa keamanan arsip...');
    for ($index = 0; $index < $zip->numFiles; $index++) {
        $name = (string) $zip->getNameIndex($index);
        $normalized = str_replace('\\', '/', $name);
        $segments = explode('/', $normalized);
        if (
            $normalized === ''
            || str_starts_with($normalized, '/')
            || preg_match('/^[A-Za-z]:\//', $normalized)
            || str_contains($normalized, "\0")
            || in_array('..', $segments, true)
        ) {
            $zip->close();
            throw new RuntimeException('Arsip update mengandung path yang tidak aman.');
        }
    }

    portable_update_write_progress($progressFile, 'extract', 35, 'Mengekstrak paket...');
    if (!$zip->extractTo($extractRoot)) {
        $zip->close();
        throw new RuntimeException('Paket update gagal diekstrak.');
    }
    $zip->close();
    portable_update_write_progress($progressFile, 'extract', 100, 'Ekstrak selesai');
}

function portable_update_find_app_root(string $extractRoot): string
{
    if (is_file($extractRoot . DIRECTORY_SEPARATOR . 'index.php')) {
        return $extractRoot;
    }

    $entries = scandir($extractRoot);
    if (!is_array($entries)) {
        throw new RuntimeException('Folder hasil ekstrak tidak dapat dibaca.');
    }
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..' || $entry === '__MACOSX') {
            continue;
        }
        $candidate = $extractRoot . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($candidate) && is_file($candidate . DIRECTORY_SEPARATOR . 'index.php')) {
            return $candidate;
        }
    }

    throw new RuntimeException('Paket update tidak berisi index.php.');
}

function portable_update_validate_app(string $root): void
{
    $required = [
        'index.php',
        'login.php',
        'api' . DIRECTORY_SEPARATOR . 'index.php',
        'includes' . DIRECTORY_SEPARATOR . 'db.php',
        'assets' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'app.js',
    ];
    foreach ($required as $relative) {
        if (!is_file($root . DIRECTORY_SEPARATOR . $relative)) {
            throw new RuntimeException('Paket aplikasi tidak lengkap: ' . str_replace('\\', '/', $relative));
        }
    }
}

function portable_update_preserve_runtime_data(
    string $currentApp,
    string $newApp,
    string $extractBoundary
): void {
    $newDatabase = $newApp . DIRECTORY_SEPARATOR . 'database';
    if (is_dir($newDatabase)) {
        portable_update_remove_tree($newDatabase, $extractBoundary);
    }

    $currentDatabase = $currentApp . DIRECTORY_SEPARATOR . 'database';
    if (is_dir($currentDatabase)) {
        portable_update_copy_tree($currentDatabase, $newDatabase);
    } else {
        portable_update_ensure_dir($newDatabase);
    }

    $jsonFiles = glob($currentApp . DIRECTORY_SEPARATOR . '*.json') ?: [];
    foreach ($jsonFiles as $jsonFile) {
        if (strcasecmp(basename($jsonFile), 'version.json') === 0) {
            continue;
        }
        if (!@copy($jsonFile, $newApp . DIRECTORY_SEPARATOR . basename($jsonFile))) {
            throw new RuntimeException('Gagal mempertahankan file topology ' . basename($jsonFile) . '.');
        }
    }
}

function portable_update_copy_tree(string $source, string $destination): void
{
    portable_update_ensure_dir($destination);
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $item) {
        $relative = $iterator->getSubPathName();
        $target = $destination . DIRECTORY_SEPARATOR . $relative;
        if ($item->isDir()) {
            portable_update_ensure_dir($target);
        } elseif (!@copy($item->getPathname(), $target)) {
            throw new RuntimeException('Gagal menyalin data aplikasi: ' . $relative);
        }
    }
}

function portable_update_remove_tree(string $target, string $allowedParent): void
{
    if (!file_exists($target)) {
        return;
    }

    $targetFull = portable_update_normalize_path($target);
    $parentFull = rtrim(portable_update_normalize_path($allowedParent), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR;
    if (!str_starts_with(strtolower($targetFull), strtolower($parentFull))) {
        throw new RuntimeException('Menolak menghapus path di luar folder kerja update.');
    }

    if (is_file($target) || is_link($target)) {
        if (!@unlink($target)) {
            throw new RuntimeException('File sementara tidak dapat dihapus.');
        }
        return;
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($target, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $item) {
        $ok = $item->isDir()
            ? @rmdir($item->getPathname())
            : @unlink($item->getPathname());
        if (!$ok) {
            throw new RuntimeException('File sementara update tidak dapat dibersihkan.');
        }
    }
    if (!@rmdir($target)) {
        throw new RuntimeException('Folder sementara update tidak dapat dibersihkan.');
    }
}

function portable_update_prune_backups(string $backupParent, int $keep): void
{
    $entries = glob($backupParent . DIRECTORY_SEPARATOR . 'app-*', GLOB_ONLYDIR) ?: [];
    usort($entries, static fn(string $a, string $b): int => filemtime($b) <=> filemtime($a));
    foreach (array_slice($entries, max(0, $keep)) as $oldBackup) {
        portable_update_remove_tree($oldBackup, $backupParent);
    }
}

function portable_update_write_progress(
    string $path,
    string $stage,
    int $percent,
    string $message,
    int $bytesReceived = 0,
    int $bytesTotal = 0
): void {
    $payload = [
        'stage' => $stage,
        'percent' => max(0, min(100, $percent)),
        'message' => $message,
        'bytesReceived' => max(0, $bytesReceived),
        'bytesTotal' => max(0, $bytesTotal),
        'updatedAt' => time(),
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }

    $temp = $path . '.tmp-' . getmypid();
    if (@file_put_contents($temp, $json, LOCK_EX) !== false) {
        @rename($temp, $path);
    }
    @unlink($temp);
}

function portable_update_ensure_dir(string $path): void
{
    if (!is_dir($path) && !@mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Folder tidak dapat dibuat: ' . basename($path));
    }
}

function portable_update_normalize_path(string $path): string
{
    $full = realpath($path);
    if ($full !== false) {
        return rtrim($full, DIRECTORY_SEPARATOR);
    }

    $parent = realpath(dirname($path));
    if ($parent === false) {
        throw new RuntimeException('Path update tidak valid.');
    }
    return rtrim($parent, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . basename($path);
}

function portable_update_env_path(string $name): string
{
    $value = getenv($name);
    if (!is_string($value) || trim($value) === '') {
        portable_update_json(['ok' => false, 'error' => 'Environment portable tidak lengkap.'], 500);
    }

    $path = realpath($value);
    if ($path === false || !is_dir($path)) {
        portable_update_json(['ok' => false, 'error' => 'Path portable tidak valid.'], 500);
    }
    return rtrim($path, DIRECTORY_SEPARATOR);
}

function portable_update_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
