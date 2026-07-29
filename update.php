<?php
/**
 * Pamantau — update endpoint (mirrors FO-Simulator)
 *
 * GET  update.php  → progress JSON (/tmp/pamantau-update-progress.json)
 * POST update.php  → run update.sh --force
 */
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';

if (PHP_SAPI !== 'cli') {
    pamantau_auth_boot();
    pamantau_auth_ensure_bootstrap();
    if (!pamantau_auth_logged_in()) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

@set_time_limit(0);
@ini_set('max_execution_time', '0');
ignore_user_abort(true);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

$dir = __DIR__;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$progressFile = '/tmp/pamantau-update-progress.json';
$legacyProgress = $dir . DIRECTORY_SEPARATOR . '.update-progress.json';

if ($method === 'GET') {
    foreach ([$progressFile, $legacyProgress] as $file) {
        if (!is_file($file)) {
            continue;
        }
        $raw = (string) @file_get_contents($file);
        $json = json_decode($raw, true);
        if (is_array($json)) {
            echo json_encode($json, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    echo json_encode([
        'stage' => 'idle',
        'percent' => 0,
        'message' => '',
        'bytesReceived' => 0,
        'bytesTotal' => 0,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$script = $dir . DIRECTORY_SEPARATOR . 'update.sh';

if (!is_file($script)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'update.sh tidak ditemukan']);
    exit;
}

if (!is_executable($script)) {
    @chmod($script, 0755);
}

$cmd = sprintf(
    'cd %s && env -u REQUEST_METHOD -u GATEWAY_INTERFACE -u SCRIPT_FILENAME /bin/bash %s --force 2>&1',
    escapeshellarg($dir),
    escapeshellarg($script)
);

$output = [];
$exitCode = 0;
exec($cmd, $output, $exitCode);
$text = implode("\n", $output);

$version = null;
$versionFile = $dir . DIRECTORY_SEPARATOR . 'version.json';
if (is_file($versionFile)) {
    $json = json_decode((string) file_get_contents($versionFile), true);
    if (is_array($json) && isset($json['version'])) {
        $version = (string) $json['version'];
    }
}

if ($exitCode !== 0) {
    $hasIndex = is_file($dir . DIRECTORY_SEPARATOR . 'index.php');
    $hasAssets = is_dir($dir . DIRECTORY_SEPARATOR . 'assets');
    if ($hasIndex && $hasAssets && $version !== null && $version !== '') {
        echo json_encode([
            'ok' => true,
            'version' => $version,
            'warning' => 'Update terpasang, tetapi skrip melaporkan exit ' . $exitCode,
            'log' => $text,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $error = 'update.sh gagal (exit ' . $exitCode . ')';
    if (preg_match('/^ERROR:\s*(.+)$/m', $text, $m)) {
        $error = trim($m[1]);
    } elseif ($text !== '') {
        $lines = array_values(array_filter(array_map('trim', explode("\n", $text)), 'strlen'));
        if ($lines) {
            $error .= ': ' . $lines[count($lines) - 1];
        }
    }

    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $error,
        'detail' => $text,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode([
    'ok' => true,
    'version' => $version,
    'log' => $text,
], JSON_UNESCAPED_UNICODE);
