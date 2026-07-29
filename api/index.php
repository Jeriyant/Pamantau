<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/network.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/topology_snapshot.php';
require_once __DIR__ . '/../includes/poll.php';

// Session must start BEFORE any output/headers so Set-Cookie (login/logout) works.
pamantau_auth_boot();
pamantau_auth_ensure_bootstrap();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function json_out(mixed $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return $_POST ?: [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Format seconds as human uptime, e.g. "3 Hari 4 Jam 12 Menit" (ID; UI re-formats via i18n). */
function pamantau_format_uptime(int $seconds): string
{
    $seconds = max(0, $seconds);
    $days = intdiv($seconds, 86400);
    $hours = intdiv($seconds % 86400, 3600);
    $mins = intdiv($seconds % 3600, 60);
    $parts = [];
    if ($days > 0) {
        $parts[] = $days . ' Hari';
    }
    if ($hours > 0 || $days > 0) {
        $parts[] = $hours . ' Jam';
    }
    $parts[] = $mins . ' Menit';
    return implode(' ', $parts);
}

/**
 * Host/OS uptime in seconds (machine the PHP app runs on).
 * Linux: /proc/uptime. Windows: WMIC LastBootUpTime (fallback: PowerShell CIM).
 */
function pamantau_host_uptime_seconds(): ?int
{
    if (@is_readable('/proc/uptime')) {
        $raw = @file_get_contents('/proc/uptime');
        if (is_string($raw) && preg_match('/^(\d+(?:\.\d+)?)/', trim($raw), $m)) {
            return (int) floor((float) $m[1]);
        }
    }

    if (PHP_OS_FAMILY === 'Windows') {
        $wmic = @shell_exec('wmic os get lastbootuptime /value 2>NUL');
        if (is_string($wmic) && preg_match('/LastBootUpTime=(\d{14})(?:\.\d+)?([+-]\d{3,4})?/', $wmic, $m)) {
            $bootLocal = $m[1];
            $tz = new DateTimeZone(date_default_timezone_get() ?: 'UTC');
            if (!empty($m[2])) {
                $bias = (int) $m[2]; // minutes east of UTC, e.g. +420
                $sign = $bias < 0 ? '-' : '+';
                $abs = abs($bias);
                $tzName = sprintf('%s%02d:%02d', $sign, intdiv($abs, 60), $abs % 60);
                try {
                    $tz = new DateTimeZone($tzName);
                } catch (Throwable $e) {
                    // keep default timezone
                }
            }
            $boot = DateTimeImmutable::createFromFormat('YmdHis', $bootLocal, $tz);
            if ($boot instanceof DateTimeImmutable) {
                $diff = time() - $boot->getTimestamp();
                if ($diff >= 0) {
                    return $diff;
                }
            }
        }

        $ps = @shell_exec(
            'powershell -NoProfile -NonInteractive -Command '
            . '"[int]((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds" 2>NUL'
        );
        if (is_string($ps) && preg_match('/^\s*(\d+)\s*$/', trim($ps), $m)) {
            return (int) $m[1];
        }
    }

    // Generic Unix fallback: parse `uptime -s` boot timestamp if available.
    $bootLine = @shell_exec('uptime -s 2>/dev/null');
    if (is_string($bootLine) && trim($bootLine) !== '') {
        $bootTs = strtotime(trim($bootLine));
        if ($bootTs !== false) {
            $diff = time() - $bootTs;
            if ($diff >= 0) {
                return $diff;
            }
        }
    }

    return null;
}

/** @return array{ok:bool,uptime_seconds:?int,uptime_human:string} */
function pamantau_uptime_payload(): array
{
    $seconds = pamantau_host_uptime_seconds();
    if ($seconds === null) {
        return [
            'ok' => false,
            'uptime_seconds' => null,
            'uptime_human' => '',
        ];
    }
    return [
        'ok' => true,
        'uptime_seconds' => $seconds,
        'uptime_human' => pamantau_format_uptime($seconds),
    ];
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$body = json_body();
if ($action === '' && isset($body['action'])) {
    $action = (string) $body['action'];
}

// logout is public so a half-dead session can still be cleared without a 401 loop.
$publicActions = ['login', 'auth_status', 'logout'];
if (!in_array($action, $publicActions, true)) {
    pamantau_auth_require();
}

// Release the session file lock ASAP. Long actions (poll/scan) otherwise block
// concurrent logout/login until they finish — which looks like endless loading.
$sessionWriteActions = ['login', 'logout', 'change_credentials'];
if (
    !in_array($action, $sessionWriteActions, true)
    && session_status() === PHP_SESSION_ACTIVE
) {
    session_write_close();
}

$validTypes = PAMANTAU_VALID_TYPES;

try {
    switch ($action) {
        case 'login': {
            $status = pamantau_auth_rate_limit_status();
            if ($status['locked']) {
                json_out([
                    'ok' => false,
                    'error' => 'Account locked. Try again later.',
                    'rate_limited' => true,
                    'retry_after' => $status['retry_after'],
                ], 429);
            }

            $username = trim((string) ($body['username'] ?? ''));
            $password = (string) ($body['password'] ?? '');

            if (!pamantau_auth_verify($username, $password)) {
                $status = pamantau_auth_record_failure();
                json_out([
                    'ok' => false,
                    'error' => $status['locked'] ? 'Account locked. Try again later.' : 'Login failed',
                    'rate_limited' => $status['locked'],
                    'retry_after' => $status['retry_after'],
                ], $status['locked'] ? 429 : 401);
            }

            pamantau_auth_clear_failures();
            pamantau_auth_login($username);
            json_out([
                'ok' => true,
                'auth' => pamantau_auth_public_payload(),
            ]);
        }

        case 'auth_status': {
            json_out([
                'ok' => true,
                'auth' => pamantau_auth_public_payload(),
            ]);
        }

        case 'logout': {
            pamantau_auth_logout();
            // Do not call pamantau_auth_public_payload() after destroy — avoid
            // touching $_SESSION / accidentally re-opening the session.
            json_out([
                'ok' => true,
                'auth' => [
                    'username' => '',
                    'logged_in' => false,
                ],
            ]);
        }

        case 'verify_password': {
            $password = (string) ($body['password'] ?? '');
            $auth = pamantau_read('auth', []);
            $currentUsername = trim((string) ($auth['username'] ?? 'admin'));

            if ($password === '' || !pamantau_auth_verify($currentUsername, $password)) {
                json_out([
                    'ok' => false,
                    'valid' => false,
                    'error' => 'Old password is incorrect',
                ], 422);
            }

            json_out([
                'ok' => true,
                'valid' => true,
            ]);
        }

        case 'change_credentials': {
            $oldPassword = (string) ($body['old_password'] ?? '');
            $newPassword = (string) ($body['new_password'] ?? '');
            $newUsernameRaw = trim((string) ($body['new_username'] ?? ''));
            $auth = pamantau_read('auth', []);
            $currentUsername = trim((string) ($auth['username'] ?? 'admin'));

            if (!pamantau_auth_verify($currentUsername, $oldPassword)) {
                json_out(['ok' => false, 'error' => 'Old password is incorrect'], 422);
            }
            if (strlen($newPassword) < 6) {
                json_out(['ok' => false, 'error' => 'New password must be at least 6 characters'], 422);
            }

            $nextUsername = $newUsernameRaw !== '' ? $newUsernameRaw : $currentUsername;
            $store = pamantau_load_store();
            $store['auth'] = [
                'username' => $nextUsername,
                'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            ];
            pamantau_save_store($store);
            pamantau_auth_login($nextUsername);

            json_out([
                'ok' => true,
                'auth' => pamantau_auth_public_payload(),
            ]);
        }

        case 'bootstrap': {
            $uptime = pamantau_uptime_payload();
            json_out([
                'ok' => true,
                'devices' => pamantau_read('devices', []),
                'connections' => pamantau_read('connections', []),
                'settings' => pamantau_settings_for_client(pamantau_read('settings', [])),
                'stats' => pamantau_read('stats', []),
                'uptime_seconds' => $uptime['uptime_seconds'],
                'uptime_human' => $uptime['uptime_human'],
            ]);
        }

        case 'uptime': {
            $uptime = pamantau_uptime_payload();
            json_out($uptime, $uptime['ok'] ? 200 : 500);
        }

        case 'save_settings': {
            $keys = [
                'poll_interval_ms',
                'polling_enabled',
                'ping_timeout_ms',
                'poll_method',
                'ping_count',
                'port_scan_enabled',
                'port_scan_interval_ms',
                'port_scan_timeout_ms',
                'port_scan_device_concurrency',
                'common_ports',
                'common_port_notes',
                'scan_port_method',
                'scan_port_max',
                'scan_subnet_method',
                'subnet_batch_size',
                'subnet_timeout_ms',
                'subnet_max_hosts',
                'history_max',
                'zoom_min',
                'zoom_max',
                'animate_links',
                'link_animation_style',
                'link_anim_speed',
                'show_link_icon',
                'show_link_label',
                'show_link_comment',
                'show_label',
                'show_ip',
                'show_latency',
                'show_comment',
                'show_services',
                'grid_size',
                'show_grid',
                'snap_drag',
                'layout_locked',
                'theme',
                'ui_language',
                'status_online_color',
                'status_offline_color',
                'status_unknown_color',
                'background_enabled',
            ];
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            foreach ($keys as $key) {
                if (array_key_exists($key, $body)) {
                    $settings[$key] = $body[$key];
                }
            }
            $settings = pamantau_apply_telegram_settings_patch($settings, $body);
            $settings = pamantau_normalize_settings($settings);
            pamantau_write('settings', $settings);
            json_out(['ok' => true, 'settings' => pamantau_settings_for_client($settings)]);
        }

        case 'reset_settings': {
            $settings = pamantau_default_settings();
            pamantau_write('settings', $settings);
            json_out(['ok' => true, 'settings' => pamantau_settings_for_client($settings)]);
        }

        case 'export_database': {
            // Full server database export, separate from topology-only Save/Save as files.
            $store = pamantau_load_store();
            json_out([
                'ok' => true,
                'app' => 'Pamantau',
                'exported_at' => date('c'),
                'devices' => $store['devices'],
                'connections' => $store['connections'],
                'settings' => pamantau_settings_for_client($store['settings'] ?? []),
                'stats' => $store['stats'],
            ]);
        }

        case 'clear_database': {
            // Legacy alias — destructive wipe kept for compatibility
            $store = pamantau_clear_database();
            json_out([
                'ok' => true,
                'devices' => $store['devices'],
                'connections' => $store['connections'],
                'settings' => pamantau_settings_for_client($store['settings'] ?? []),
                'stats' => $store['stats'],
            ]);
        }

        case 'reset_counters': {
            $store = pamantau_reset_counters();
            json_out([
                'ok' => true,
                'devices' => $store['devices'],
                'connections' => $store['connections'],
                'settings' => pamantau_settings_for_client($store['settings'] ?? []),
                'stats' => $store['stats'],
            ]);
        }

        case 'replace_topology': {
            $devices = is_array($body['devices'] ?? null) ? array_values($body['devices']) : [];
            $connections = is_array($body['connections'] ?? null) ? array_values($body['connections']) : [];
            $store = pamantau_load_store();
            $existingDevices = is_array($store['devices'] ?? null) ? $store['devices'] : [];
            $serverStats = is_array($store['stats'] ?? null) ? $store['stats'] : [];
            $existingById = [];
            foreach ($existingDevices as $existingDevice) {
                if (is_array($existingDevice) && !empty($existingDevice['id'])) {
                    $existingById[(string) $existingDevice['id']] = $existingDevice;
                }
            }
            $cleanDevices = [];
            foreach ($devices as $device) {
                if (!is_array($device) || empty($device['id'])) {
                    continue;
                }
                $deviceId = (string) $device['id'];
                $existingDevice = $existingById[$deviceId] ?? null;
                $serverPollCount = is_array($existingDevice)
                    ? max(0, (int) ($existingDevice['poll_count'] ?? 0))
                    : 0;
                if (isset($serverStats[$deviceId]) && is_array($serverStats[$deviceId])) {
                    $serverPollCount = max(
                        $serverPollCount,
                        pamantau_poll_total($serverStats[$deviceId]),
                        max(0, (int) ($serverStats[$deviceId]['ping_total'] ?? 0))
                    );
                }
                $type = strtolower((string) ($device['type'] ?? 'client'));
                if (!in_array($type, $validTypes, true)) {
                    $type = 'client';
                }
                $cleanDevice = [
                    'id' => $deviceId,
                    'type' => $type,
                    'label' => trim((string) ($device['label'] ?? 'Device')),
                    'ip' => trim((string) ($device['ip'] ?? '')),
                    'subnet' => trim((string) ($device['subnet'] ?? '')),
                    'comment' => trim((string) ($device['comment'] ?? '')),
                    'x' => (float) ($device['x'] ?? 120),
                    'y' => (float) ($device['y'] ?? 120),
                    'services' => array_values(array_map('intval', $device['services'] ?? [])),
                    'status' => is_array($existingDevice)
                        ? (string) ($existingDevice['status'] ?? 'unknown')
                        : 'unknown',
                    'latency' => is_array($existingDevice) ? ($existingDevice['latency'] ?? null) : null,
                    'poll_count' => $serverPollCount,
                ];
                if (is_array($existingDevice) && !empty($existingDevice['ports_scanned_at'])) {
                    $cleanDevice['ports_scanned_at'] = (string) $existingDevice['ports_scanned_at'];
                }
                $cleanDevices[] = $cleanDevice;
            }
            $ids = [];
            foreach ($cleanDevices as $device) {
                $ids[$device['id']] = true;
            }
            $cleanConnections = [];
            foreach ($connections as $conn) {
                if (!is_array($conn)) {
                    continue;
                }
                $from = (string) ($conn['from'] ?? '');
                $to = (string) ($conn['to'] ?? '');
                if ($from === '' || $to === '' || $from === $to || !isset($ids[$from], $ids[$to])) {
                    continue;
                }
                $cleanConnections[] = [
                    'id' => (string) ($conn['id'] ?? pamantau_uuid()),
                    'from' => $from,
                    'to' => $to,
                    'label' => trim((string) ($conn['label'] ?? '')),
                    'comment' => trim((string) ($conn['comment'] ?? '')),
                    'link_type' => pamantau_normalize_link_type($conn['link_type'] ?? null),
                ];
            }
            // Settings are app-level only (save_settings). Ignore any settings in payload
            // so Open / replace_topology never overwrite theme, language, poll, etc.
            // Poll counters and all aggregate history are server-owned. Legacy
            // `stats` payloads from old topology files are intentionally ignored.
            $store['devices'] = $cleanDevices;
            $store['connections'] = $cleanConnections;
            pamantau_save_store($store);
            $settingsOut = pamantau_settings_for_client($store['settings'] ?? []);
            $statsOut = $serverStats;

            json_out([
                'ok' => true,
                'devices' => $cleanDevices,
                'connections' => $cleanConnections,
                'settings' => $settingsOut,
                'stats' => $statsOut,
            ]);
        }

        case 'upsert_device': {
            $devices = pamantau_read('devices', []);
            $id = (string) ($body['id'] ?? '');
            $type = strtolower((string) ($body['type'] ?? 'client'));
            if (!in_array($type, $validTypes, true)) {
                json_out(['ok' => false, 'error' => 'Tipe tidak valid'], 422);
            }

            $payload = [
                'type' => $type,
                'label' => trim((string) ($body['label'] ?? 'Device')),
                'ip' => trim((string) ($body['ip'] ?? '')),
                'subnet' => trim((string) ($body['subnet'] ?? '')),
                'comment' => trim((string) ($body['comment'] ?? '')),
                'x' => (float) ($body['x'] ?? 120),
                'y' => (float) ($body['y'] ?? 120),
                'services' => array_values(array_map('intval', $body['services'] ?? [])),
                'status' => (string) ($body['status'] ?? 'unknown'),
                'latency' => $body['latency'] ?? null,
            ];

            $found = false;
            foreach ($devices as &$device) {
                if (($device['id'] ?? '') === $id && $id !== '') {
                    // poll_count is not part of $payload, so array_merge keeps the
                    // device's existing counter untouched here.
                    $device = pamantau_normalize_device(array_merge($device, $payload, ['id' => $id]));
                    $found = true;
                    $saved = $device;
                    break;
                }
            }
            unset($device);

            if (!$found) {
                $saved = pamantau_normalize_device(array_merge(['id' => $id !== '' ? $id : pamantau_uuid()], $payload));
                $devices[] = $saved;
            }

            pamantau_write('devices', $devices);
            json_out(['ok' => true, 'device' => $saved, 'devices' => $devices]);
        }

        case 'delete_device': {
            $ids = [];
            if (!empty($body['ids']) && is_array($body['ids'])) {
                $ids = array_map('strval', $body['ids']);
            } elseif (!empty($body['id'])) {
                $ids = [(string) $body['id']];
            }
            $ids = array_values(array_filter($ids, static fn($id) => $id !== ''));
            if ($ids === []) {
                json_out(['ok' => false, 'error' => 'ID perangkat kosong'], 422);
            }
            $idSet = array_fill_keys($ids, true);

            $devices = array_values(array_filter(
                pamantau_read('devices', []),
                static fn($d) => !isset($idSet[(string) ($d['id'] ?? '')])
            ));
            $connections = array_values(array_filter(
                pamantau_read('connections', []),
                static fn($c) => !isset($idSet[(string) ($c['from'] ?? '')]) && !isset($idSet[(string) ($c['to'] ?? '')])
            ));
            $stats = pamantau_read('stats', []);
            $statsDaily = pamantau_read('stats_daily', []);
            if (!is_array($statsDaily)) {
                $statsDaily = [];
            }
            foreach ($ids as $id) {
                unset($stats[$id]);
                unset($statsDaily[$id]);
            }
            pamantau_write('devices', $devices);
            pamantau_write('connections', $connections);
            pamantau_write('stats', $stats);
            pamantau_write('stats_daily', $statsDaily);
            json_out(['ok' => true, 'deleted' => $ids, 'devices' => $devices, 'connections' => $connections]);
        }

        case 'save_layout': {
            $devices = pamantau_read('devices', []);
            $existingIds = [];
            foreach ($devices as $device) {
                $existingIds[(string) ($device['id'] ?? '')] = true;
            }
            $map = [];
            foreach (($body['devices'] ?? []) as $item) {
                $id = (string) ($item['id'] ?? '');
                if ($id !== '' && isset($existingIds[$id])) {
                    $map[$id] = $item;
                }
            }
            foreach ($devices as &$device) {
                $id = (string) ($device['id'] ?? '');
                if (isset($map[$id])) {
                    if (isset($map[$id]['x'])) {
                        $device['x'] = (float) $map[$id]['x'];
                    }
                    if (isset($map[$id]['y'])) {
                        $device['y'] = (float) $map[$id]['y'];
                    }
                }
            }
            unset($device);

            if (isset($body['connections']) && is_array($body['connections'])) {
                $connections = pamantau_normalize_connections(array_values(array_filter(
                    $body['connections'],
                    static function ($c) use ($existingIds) {
                        $from = (string) ($c['from'] ?? '');
                        $to = (string) ($c['to'] ?? '');
                        return isset($existingIds[$from], $existingIds[$to]);
                    }
                )));
                pamantau_write('connections', $connections);
            }

            pamantau_write('devices', $devices);
            json_out([
                'ok' => true,
                'devices' => $devices,
                'connections' => pamantau_read('connections', []),
            ]);
        }

        case 'upsert_connection': {
            $connections = pamantau_read('connections', []);
            $id = (string) ($body['id'] ?? '');
            $from = (string) ($body['from'] ?? '');
            $to = (string) ($body['to'] ?? '');
            $label = trim((string) ($body['label'] ?? ''));
            $comment = trim((string) ($body['comment'] ?? ''));
            $linkType = pamantau_normalize_link_type($body['link_type'] ?? null);
            if ($from === '' || $to === '' || $from === $to) {
                json_out(['ok' => false, 'error' => 'Koneksi tidak valid'], 422);
            }

            $devicesById = [];
            foreach (pamantau_read('devices', []) as $dv) {
                $devicesById[(string) ($dv['id'] ?? '')] = $dv;
            }
            $fromDevice = $devicesById[$from] ?? null;
            $toDevice = $devicesById[$to] ?? null;
            if ($fromDevice === null || $toDevice === null) {
                json_out(['ok' => false, 'error' => 'Perangkat tidak ditemukan'], 422);
            }

            $found = false;
            $saved = null;
            foreach ($connections as &$conn) {
                if ($id !== '' && ($conn['id'] ?? '') === $id) {
                    $conn['from'] = $from;
                    $conn['to'] = $to;
                    if (array_key_exists('label', $body)) {
                        $conn['label'] = $label;
                    }
                    if (array_key_exists('comment', $body)) {
                        $conn['comment'] = $comment;
                    }
                    if (array_key_exists('link_type', $body)) {
                        $conn['link_type'] = $linkType;
                    }
                    $found = true;
                    $saved = pamantau_normalize_connection($conn);
                    break;
                }
            }
            unset($conn);

            if (!$found) {
                // Avoid duplicate undirected link unless explicitly updating by id
                foreach ($connections as $conn) {
                    if (
                        (($conn['from'] ?? '') === $from && ($conn['to'] ?? '') === $to)
                        || (($conn['from'] ?? '') === $to && ($conn['to'] ?? '') === $from)
                    ) {
                        $saved = pamantau_normalize_connection($conn);
                        $found = true;
                        break;
                    }
                }
            }

            if (!$found) {
                $saved = [
                    'id' => $id !== '' ? $id : pamantau_uuid(),
                    'from' => $from,
                    'to' => $to,
                    'label' => $label,
                    'comment' => $comment,
                    'link_type' => $linkType,
                ];
                $connections[] = $saved;
            }

            $connections = pamantau_normalize_connections($connections);
            pamantau_write('connections', $connections);
            json_out(['ok' => true, 'connection' => $saved, 'connections' => $connections]);
        }

        case 'delete_connection': {
            $id = (string) ($body['id'] ?? '');
            $connections = array_values(array_filter(
                pamantau_read('connections', []),
                static fn($c) => ($c['id'] ?? '') !== $id
            ));
            pamantau_write('connections', $connections);
            json_out(['ok' => true, 'connections' => $connections]);
        }

        case 'poll': {
            $poll = pamantau_run_ping_cycle();
            json_out([
                'ok' => true,
                'results' => $poll['results'],
                'devices' => $poll['devices'],
                'stats' => $poll['stats'],
                'polled_at' => $poll['polled_at'],
                'skipped' => $poll['skipped'] ?? null,
            ]);
        }

        case 'poll_ports': {
            $force = !empty($body['force']);
            $scan = pamantau_run_port_scan_cycle(null, !$force);
            json_out([
                'ok' => true,
                'devices' => $scan['devices'] ?? pamantau_read('devices', []),
                'scanned_at' => $scan['scanned_at'] ?? null,
                'scanned_count' => $scan['scanned_count'] ?? 0,
                'online_target_count' => $scan['online_target_count'] ?? 0,
                'port_count' => $scan['port_count'] ?? 0,
                'skipped' => $scan['skipped'] ?? null,
                'next_in_ms' => $scan['next_in_ms'] ?? null,
            ]);
        }

        case 'telegram_test': {
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            // Optional overrides from modal before save
            if (array_key_exists('telegram_bot_token', $body)) {
                $tok = trim((string) $body['telegram_bot_token']);
                if ($tok !== '' && !pamantau_is_masked_bot_token($tok)) {
                    $settings['telegram_bot_token'] = $tok;
                }
            }
            if (array_key_exists('telegram_chat_id', $body)) {
                $settings['telegram_chat_id'] = trim((string) $body['telegram_chat_id']);
            }
            $token = (string) ($settings['telegram_bot_token'] ?? '');
            $chatId = (string) ($settings['telegram_chat_id'] ?? '');
            $res = pamantau_telegram_test_connection($token, $chatId, true);
            if (!$res['ok']) {
                json_out(['ok' => false, 'error' => $res['error'] ?? 'Uji gagal'], 502);
            }
            json_out([
                'ok' => true,
                'bot' => $res['bot'] ?? null,
                'message_sent' => !empty($res['message_sent']),
            ]);
        }

        case 'telegram_test_up':
        case 'telegram_test_down': {
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            $settings = pamantau_apply_telegram_settings_patch($settings, $body);
            $settings = pamantau_normalize_settings($settings);
            $kind = $action === 'telegram_test_down' ? 'down' : 'up';
            $sample = null;
            $devices = pamantau_read('devices', []);
            if (is_array($devices) && $devices !== []) {
                $sample = $devices[0];
            }
            $res = pamantau_telegram_test_transition($settings, $kind, is_array($sample) ? $sample : null);
            if (!$res['ok']) {
                json_out(['ok' => false, 'error' => $res['error'] ?? 'Uji gagal'], 502);
            }
            json_out(['ok' => true, 'text' => $res['text'] ?? '']);
        }

        case 'telegram_test_screenshot': {
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            $settings = pamantau_apply_telegram_settings_patch($settings, $body);
            $settings = pamantau_normalize_settings($settings);
            $res = pamantau_telegram_send_topology_screenshot(
                $settings,
                false,
                pamantau_snapshot_telegram_caption($settings, 'test')
            );
            if (!$res['ok']) {
                json_out(['ok' => false, 'error' => $res['error'] ?? 'Uji screenshot gagal'], 502);
            }
            json_out(['ok' => true, 'filename' => $res['filename'] ?? '']);
        }

        case 'ping_host': {
            $id = (string) ($body['id'] ?? '');
            $ip = trim((string) ($body['ip'] ?? ''));

            if ($ip === '' && $id !== '') {
                foreach (pamantau_read('devices', []) as $dv) {
                    if (($dv['id'] ?? '') === $id) {
                        $ip = trim((string) ($dv['ip'] ?? ''));
                        break;
                    }
                }
            }

            if (!pamantau_is_valid_host($ip)) {
                json_out(['ok' => false, 'error' => 'Alamat IP/host tidak valid'], 422);
            }

            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            $timeout = (int) ($settings['ping_timeout_ms'] ?? 1000);
            $count = max(1, min(20, (int) ($body['count'] ?? 1)));

            // The CMD-style ping modal calls this action once per attempt
            // (count=1) so it can render each reply line as soon as that
            // attempt finishes. `attempt`/`total` let us know where we are in
            // that overall sequence so we only pace (delay) attempts that are
            // NOT the very last one — mirroring how a real `ping -n 5` never
            // waits around after its final reply.
            $attemptIndex = max(1, (int) ($body['attempt'] ?? 1));
            $attemptTotal = max($attemptIndex, (int) ($body['total'] ?? $count));

            // One host at a time, one attempt after another — never parallel —
            // so latency readings stay accurate (see pamantau_probe_hosts_sequential).
            $attempts = [];
            for ($i = 0; $i < $count; $i++) {
                $r = pamantau_ping($ip, $timeout);
                $isLastOverall = ($attemptIndex + $i) >= $attemptTotal;
                if (!$isLastOverall) {
                    // Real ping tools send one echo request per second; pad this
                    // attempt's real elapsed time up to that cadence so a fast LAN
                    // reply doesn't make the whole sequence feel instant/fake.
                    pamantau_pace_ping($r);
                }
                $attempts[] = [
                    'ok' => (bool) $r['alive'],
                    'latency_ms' => $r['alive'] ? $r['latency'] : null,
                    'sub_ms' => (bool) ($r['sub_ms'] ?? false),
                    'ttl' => isset($r['ttl']) ? $r['ttl'] : null,
                    'error' => $r['alive'] ? null : (string) ($r['error'] ?? 'timeout'),
                ];
            }

            // Interactive Ping (context menu / modal) must NOT bump poll_count.
            // "Jumlah Ping" only advances on the poll action (auto interval or Refresh).

            json_out([
                'ok' => true,
                'ip' => $ip,
                'attempts' => $attempts,
            ]);
        }

        case 'traceroute_host': {
            $id = (string) ($body['id'] ?? '');
            $ip = trim((string) ($body['ip'] ?? ''));

            if ($ip === '' && $id !== '') {
                foreach (pamantau_read('devices', []) as $dv) {
                    if (($dv['id'] ?? '') === $id) {
                        $ip = trim((string) ($dv['ip'] ?? ''));
                        break;
                    }
                }
            }

            if (!pamantau_is_valid_host($ip)) {
                json_out(['ok' => false, 'error' => 'Alamat IP/host tidak valid'], 422);
            }

            $maxHops = max(1, min(30, (int) ($body['max_hops'] ?? PAMANTAU_TRACEROUTE_MAX_HOPS_DEFAULT)));

            // A real traceroute can legitimately take tens of seconds (several
            // unresponsive hops each waiting out their own probe timeout), so
            // give this single request a generous ceiling well above PHP's
            // usual default max_execution_time instead of letting it get cut off.
            if (function_exists('set_time_limit')) {
                set_time_limit(120);
            }

            $result = pamantau_traceroute($ip, $maxHops);

            if (!$result['ok']) {
                json_out([
                    'ok' => false,
                    'ip' => $ip,
                    'max_hops' => $maxHops,
                    'os' => $result['os'] ?? '',
                    'command' => $result['command'] ?? '',
                    'display_command' => $result['display_command'] ?? '',
                    'error' => $result['error'] ?? 'Traceroute gagal dijalankan di server.',
                ], 502);
            }

            json_out([
                'ok' => true,
                'ip' => $ip,
                'max_hops' => $maxHops,
                'os' => $result['os'] ?? '',
                'command' => $result['command'] ?? '',
                'display_command' => $result['display_command'] ?? '',
                'used_fallback' => $result['used_fallback'] ?? false,
                'output' => $result['output'],
                'hops' => $result['hops'],
            ]);
        }

        case 'scan_ports': {
            $id = (string) ($body['id'] ?? '');
            $ipOnly = trim((string) ($body['ip'] ?? ''));
            $devices = pamantau_read('devices', []);
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            $maxSpan = pamantau_scan_port_max_span((int) ($settings['scan_port_max'] ?? 1024));

            // Resolve port list: explicit ports / port_from+port_to / range string.
            // Manual Scan Port always sends a range; common_ports remains poll-only.
            $ports = null;
            $rangeFrom = null;
            $rangeTo = null;
            if (isset($body['ports']) && is_array($body['ports'])) {
                $ports = pamantau_normalize_port_list($body['ports']);
                if (count($ports) > $maxSpan) {
                    json_out([
                        'ok' => false,
                        'error' => 'Terlalu banyak port (maks. ' . $maxSpan . ' dari pengaturan).',
                    ], 422);
                }
            } elseif (isset($body['port_from']) || isset($body['port_to'])) {
                $rangeFrom = (int) ($body['port_from'] ?? 0);
                $rangeTo = (int) ($body['port_to'] ?? 0);
                $expanded = pamantau_expand_port_range($rangeFrom, $rangeTo, $maxSpan);
                if (!$expanded['ok']) {
                    json_out(['ok' => false, 'error' => $expanded['error'] ?? 'Rentang tidak valid'], 422);
                }
                $ports = $expanded['ports'];
                $rangeFrom = $expanded['from'];
                $rangeTo = $expanded['to'];
            } elseif (isset($body['range']) && trim((string) $body['range']) !== '') {
                $parsed = pamantau_parse_port_range_string((string) $body['range']);
                if (!$parsed['ok']) {
                    json_out(['ok' => false, 'error' => $parsed['error'] ?? 'Rentang tidak valid'], 422);
                }
                $expanded = pamantau_expand_port_range((int) $parsed['from'], (int) $parsed['to'], $maxSpan);
                if (!$expanded['ok']) {
                    json_out(['ok' => false, 'error' => $expanded['error'] ?? 'Rentang tidak valid'], 422);
                }
                $ports = $expanded['ports'];
                $rangeFrom = $expanded['from'];
                $rangeTo = $expanded['to'];
            } else {
                json_out(['ok' => false, 'error' => 'Rentang port wajib (contoh: 1-1000).'], 422);
            }

            if ($ports === [] || $ports === null) {
                json_out(['ok' => false, 'error' => 'Tidak ada port untuk dipindai'], 422);
            }

            $methodRaw = strtolower(trim((string) ($body['method'] ?? $settings['scan_port_method'] ?? 'parallel')));
            $method = $methodRaw === 'sequential' ? 'sequential' : 'parallel';

            $found = null;
            $scannedCount = count($ports);

            // Device id path: scan + persist services on that device (existing Scan Port).
            if ($id !== '') {
                foreach ($devices as &$device) {
                    if (($device['id'] ?? '') === $id) {
                        $ip = trim((string) ($device['ip'] ?? ''));
                        $device['services'] = pamantau_scan_ports($ip, $ports, 0.35, $method);
                        $found = $device;
                        break;
                    }
                }
                unset($device);

                if ($found === null) {
                    json_out(['ok' => false, 'error' => 'Device tidak ditemukan'], 404);
                }

                pamantau_write('devices', $devices);
                json_out([
                    'ok' => true,
                    'device' => $found,
                    'devices' => $devices,
                    'scanned' => $scannedCount,
                    'port_from' => $rangeFrom,
                    'port_to' => $rangeTo,
                    'method' => $method,
                    'open_ports' => $found['services'] ?? [],
                ]);
            }

            // IP-only path (Hasil Scan Subnet PORT column): common_ports without topology write.
            if (!pamantau_is_valid_host($ipOnly)) {
                json_out(['ok' => false, 'error' => 'Alamat IP/host tidak valid'], 422);
            }

            $openPorts = pamantau_scan_ports($ipOnly, $ports, 0.35, $method);
            json_out([
                'ok' => true,
                'ip' => $ipOnly,
                'scanned' => $scannedCount,
                'port_from' => $rangeFrom,
                'port_to' => $rangeTo,
                'method' => $method,
                'open_ports' => $openPorts,
                'persisted' => false,
            ]);
        }

        case 'scan_subnet_prepare': {
            $id = (string) ($body['id'] ?? '');
            $devices = pamantau_read('devices', []);
            $device = null;
            foreach ($devices as $dv) {
                if (($dv['id'] ?? '') === $id) {
                    $device = $dv;
                    break;
                }
            }
            if ($device === null) {
                json_out(['ok' => false, 'error' => 'Perangkat tidak ditemukan'], 404);
            }

            // CIDR is supplied by the client (chosen in the Scan Subnet modal); fall back
            // to the device's legacy stored subnet field for backward compatibility only.
            $cidr = trim((string) ($body['cidr'] ?? ''));
            $subnetSpec = $cidr !== '' ? $cidr : (string) ($device['subnet'] ?? '');

            $plan = pamantau_subnet_targets(
                (string) ($device['ip'] ?? ''),
                $subnetSpec
            );
            if (!$plan['ok']) {
                json_out(['ok' => false, 'error' => $plan['error'] ?? 'Subnet tidak valid'], 422);
            }

            json_out([
                'ok' => true,
                'device_id' => $id,
                'cidr' => $plan['cidr'],
                'total' => $plan['total'],
                'targets' => $plan['targets'],
            ]);
        }

        case 'scan_subnet_batch': {
            $ips = $body['ips'] ?? [];
            if (!is_array($ips) || count($ips) === 0) {
                json_out(['ok' => true, 'checked' => [], 'hosts' => []]);
            }
            if (count($ips) > 128) {
                $ips = array_slice($ips, 0, 128);
            }
            // Subnet scan is ping-only (ip + latency); ports come later via poll / Scan Port.
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            $timeout = min(500, max(100, (int) ($body['timeout_ms'] ?? $settings['subnet_timeout_ms'])));
            $methodRaw = strtolower(trim((string) ($body['method'] ?? $settings['scan_subnet_method'] ?? 'sequential')));
            $method = $methodRaw === 'parallel' ? 'parallel' : 'sequential';
            $probe = pamantau_probe_hosts($ips, $timeout, $method);

            $hosts = [];
            foreach ($probe['hosts'] as $host) {
                $hosts[] = [
                    'ip' => (string) ($host['ip'] ?? ''),
                    'latency' => $host['latency'] ?? null,
                    'services' => [],
                ];
            }

            json_out([
                'ok' => true,
                'checked' => $probe['checked'],
                'hosts' => $hosts,
                'method' => $method,
            ]);
        }

        case 'scan_subnet_detect': {
            $hosts = is_array($body['hosts'] ?? null) ? $body['hosts'] : [];
            $settings = pamantau_normalize_settings(pamantau_read('settings', []));
            $ports = $settings['common_ports'] ?? [22, 80, 443];
            $portScanEnabled = (bool) ($settings['port_scan_enabled'] ?? true);

            $results = [];
            foreach ($hosts as $host) {
                $ip = trim((string) (is_array($host) ? ($host['ip'] ?? '') : ''));
                if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
                    continue;
                }
                $open = $portScanEnabled ? pamantau_scan_ports($ip, $ports) : [];
                $results[] = [
                    'ip' => $ip,
                    'latency' => $host['latency'] ?? null,
                    'services' => $open,
                    'type' => pamantau_guess_type($ip, $open),
                ];
            }

            json_out(['ok' => true, 'hosts' => $results]);
        }

        case 'scan_subnet_apply':
        case 'scan_subnet': {
            $id = (string) ($body['id'] ?? '');
            $devices = pamantau_read('devices', []);
            $connections = pamantau_read('connections', []);
            $device = null;

            foreach ($devices as $dv) {
                if (($dv['id'] ?? '') === $id) {
                    $device = $dv;
                    break;
                }
            }

            if ($device === null) {
                json_out(['ok' => false, 'error' => 'Perangkat tidak ditemukan'], 404);
            }

            // Legacy single-shot scan, or apply pre-discovered hosts
            if ($action === 'scan_subnet' && empty($body['hosts'])) {
                $cidr = trim((string) ($body['cidr'] ?? ''));
                $subnetSpec = $cidr !== '' ? $cidr : (string) ($device['subnet'] ?? '');
                $settings = pamantau_normalize_settings(pamantau_read('settings', []));
                $scan = pamantau_scan_subnet(
                    (string) ($device['ip'] ?? ''),
                    $subnetSpec,
                    (int) $settings['ping_timeout_ms']
                );
                if (!$scan['ok']) {
                    json_out(['ok' => false, 'error' => $scan['error'] ?? 'Scan gagal'], 422);
                }
                $foundHosts = $scan['hosts'];
                $cidr = $scan['cidr'];
                $scanned = $scan['scanned'];
            } else {
                $foundHosts = is_array($body['hosts'] ?? null) ? $body['hosts'] : [];
                $cidr = (string) ($body['cidr'] ?? '');
                $scanned = (int) ($body['scanned'] ?? count($foundHosts));
            }

            $existingIps = [];
            foreach ($devices as $dv) {
                $ip = trim((string) ($dv['ip'] ?? ''));
                if ($ip !== '') {
                    $existingIps[$ip] = $dv['id'];
                }
            }

            $created = [];
            $rx = (float) ($device['x'] ?? 200);
            $ry = (float) ($device['y'] ?? 200);
            $angleStep = count($foundHosts) > 0 ? (2 * M_PI / max(count($foundHosts), 1)) : 0;
            $radius = 160;

            foreach ($foundHosts as $i => $host) {
                $hostIp = trim((string) ($host['ip'] ?? ''));
                if ($hostIp === '') {
                    continue;
                }
                if (isset($existingIps[$hostIp])) {
                    $targetId = $existingIps[$hostIp];
                } else {
                    // Prefer type/services already detected client-side (scan_subnet_detect +
                    // user confirmation in the results table); fall back to a fresh guess.
                    $open = is_array($host['services'] ?? null)
                        ? array_values(array_map('intval', $host['services']))
                        : [];
                    $type = strtolower((string) ($host['type'] ?? ''));
                    if (!in_array($type, $validTypes, true)) {
                        $type = pamantau_guess_type($hostIp, $open);
                    }
                    $label = trim((string) ($host['label'] ?? ''));
                    if ($label === '') {
                        $label = strtoupper($type) . '-' . substr(str_replace('.', '', $hostIp), -4);
                    }
                    $angle = $i * $angleStep;
                    $new = [
                        'id' => pamantau_uuid(),
                        'type' => $type,
                        'label' => $label,
                        'ip' => $hostIp,
                        'subnet' => '',
                        'comment' => 'Hasil scan dari ' . ($device['label'] ?? 'perangkat'),
                        'x' => $rx + cos($angle) * $radius,
                        'y' => $ry + sin($angle) * $radius,
                        'services' => $open,
                        'status' => 'online',
                        'latency' => $host['latency'] ?? null,
                        'poll_count' => 0,
                    ];
                    $devices[] = $new;
                    $existingIps[$hostIp] = $new['id'];
                    $targetId = $new['id'];
                    $created[] = $new;
                }

                $existsLink = false;
                foreach ($connections as $conn) {
                    if (
                        (($conn['from'] ?? '') === $id && ($conn['to'] ?? '') === $targetId) ||
                        (($conn['from'] ?? '') === $targetId && ($conn['to'] ?? '') === $id)
                    ) {
                        $existsLink = true;
                        break;
                    }
                }
                if (!$existsLink) {
                    $connections[] = [
                        'id' => pamantau_uuid(),
                        'from' => $id,
                        'to' => $targetId,
                        'link_type' => 'default',
                    ];
                }
            }

            pamantau_write('devices', $devices);
            pamantau_write('connections', $connections);

            json_out([
                'ok' => true,
                'cidr' => $cidr,
                'scanned' => $scanned,
                'found' => count($foundHosts),
                'created' => $created,
                'devices' => $devices,
                'connections' => $connections,
            ]);
        }

        case 'reports': {
            $from = trim((string) ($body['from'] ?? $_GET['from'] ?? ''));
            $to = trim((string) ($body['to'] ?? $_GET['to'] ?? ''));

            if ($from === '' || $to === '') {
                json_out(['ok' => false, 'error' => 'Parameter from dan to (YYYY-MM-DD) wajib diisi'], 422);
            }
            if (!pamantau_valid_date_ymd($from) || !pamantau_valid_date_ymd($to)) {
                json_out(['ok' => false, 'error' => 'Format tanggal tidak valid (gunakan YYYY-MM-DD)'], 422);
            }
            if ($from > $to) {
                json_out(['ok' => false, 'error' => 'Tanggal Dari tidak boleh setelah Sampai'], 422);
            }

            $devices = pamantau_read('devices', []);
            $statsDaily = pamantau_read('stats_daily', []);
            if (!is_array($statsDaily)) {
                $statsDaily = [];
            }
            $rows = [];
            $hasData = false;

            foreach ($devices as $device) {
                $id = (string) ($device['id'] ?? '');
                $deviceDays = (isset($statsDaily[$id]) && is_array($statsDaily[$id])) ? $statsDaily[$id] : [];
                $agg = pamantau_aggregate_daily_range($deviceDays, $from, $to);
                if (!empty($agg['has_data'])) {
                    $hasData = true;
                }

                $stat = [
                    'online_samples' => (int) ($agg['online_samples'] ?? 0),
                    'offline_samples' => (int) ($agg['offline_samples'] ?? 0),
                    'latency_sum' => (float) ($agg['latency_sum'] ?? 0),
                    'latency_count' => (int) ($agg['latency_count'] ?? 0),
                    'latency_min' => $agg['latency_min'] ?? null,
                    'latency_max' => $agg['latency_max'] ?? null,
                    'poll_count' => (int) ($agg['poll_count'] ?? 0),
                ];

                $rows[] = [
                    'id' => $id,
                    'label' => $device['label'] ?? '-',
                    'type' => $device['type'] ?? '-',
                    'ip' => $device['ip'] ?? '',
                    'status' => $device['status'] ?? 'unknown',
                    'latency' => $device['latency'] ?? null,
                    'ping_total' => (int) ($stat['poll_count'] ?? 0),
                    'ping_ok' => (int) ($stat['online_samples'] ?? 0),
                    'ping_fail' => (int) ($stat['offline_samples'] ?? 0),
                    'online_samples' => (int) ($stat['online_samples'] ?? 0),
                    'offline_samples' => (int) ($stat['offline_samples'] ?? 0),
                    'poll_total' => pamantau_poll_total($stat),
                    'online_ratio' => pamantau_online_ratio($stat),
                    'offline_ratio' => pamantau_offline_ratio($stat),
                    'avg_latency' => pamantau_avg_latency($stat),
                    'latency_min' => $stat['latency_min'] ?? null,
                    'latency_max' => $stat['latency_max'] ?? null,
                ];
            }

            // Sort keys match what each report actually displays now (ONLINE /
            // OFFLINE PERCENTAGE columns), with the raw sample count as a
            // tiebreaker so devices with identical ratios but more polling
            // history rank first.
            $mostOnline = $rows;
            usort($mostOnline, static fn($a, $b) => [$b['online_ratio'], $b['online_samples']] <=> [$a['online_ratio'], $a['online_samples']]);

            $mostOffline = $rows;
            usort($mostOffline, static fn($a, $b) => [$b['offline_ratio'], $b['offline_samples']] <=> [$a['offline_ratio'], $a['offline_samples']]);

            $bestLatency = array_values(array_filter($rows, static fn($r) => $r['avg_latency'] !== null));
            usort($bestLatency, static fn($a, $b) => $a['avg_latency'] <=> $b['avg_latency']);

            json_out([
                'ok' => true,
                'from' => $from,
                'to' => $to,
                'has_data' => $hasData,
                'timezone' => date_default_timezone_get() ?: 'UTC',
                'most_online' => $mostOnline,
                'most_offline' => $mostOffline,
                'best_latency' => $bestLatency,
            ]);
        }

        default:
            json_out(['ok' => false, 'error' => 'Action tidak dikenal'], 400);
    }
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => $e->getMessage()], 500);
}
