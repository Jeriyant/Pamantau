<?php
declare(strict_types=1);

const PAMANTAU_DB_DIR = __DIR__ . '/../database';
const PAMANTAU_DB_FILE = PAMANTAU_DB_DIR . '/pamantau.json';

const PAMANTAU_VALID_TYPES = [
    'web', 'internet', 'vpn', 'server', 'database', 'loadbalance',
    'router', 'olt', 'onu', 'printer', 'client',
];

const PAMANTAU_VALID_LINK_TYPES = [
    'default', 'vpn', 'lan', 'fo', 'wireless', 'seluler', 'local', 'internet', 'trunk',
];

/**
 * Catalog metadata for connection link types (mirrors assets/js/link-types.js).
 *
 * @return array<string, array{label: string, color: string}>
 */
function pamantau_link_type_catalog(): array
{
    return [
        'default' => ['label' => 'Default', 'color' => '#e11d48'],
        'vpn' => ['label' => 'VPN', 'color' => '#eab308'],
        'lan' => ['label' => 'LAN', 'color' => '#16a34a'],
        'fo' => ['label' => 'Fiber', 'color' => '#0891b2'],
        'wireless' => ['label' => 'Wireless', 'color' => '#ff8a1f'],
        'seluler' => ['label' => 'Seluler', 'color' => '#ec4899'],
        'local' => ['label' => 'Local', 'color' => '#000000'],
        'internet' => ['label' => 'Internet', 'color' => '#0284c8'],
        'trunk' => ['label' => 'Trunk', 'color' => '#9333ea'],
    ];
}

function pamantau_normalize_link_type(mixed $value): string
{
    $id = is_string($value) ? strtolower(trim($value)) : '';
    return in_array($id, PAMANTAU_VALID_LINK_TYPES, true) ? $id : 'default';
}

function pamantau_normalize_connection(array $conn): array
{
    $conn['link_type'] = pamantau_normalize_link_type($conn['link_type'] ?? null);
    return $conn;
}

/**
 * @param mixed $connections
 * @return list<array>
 */
function pamantau_normalize_connections(mixed $connections): array
{
    if (!is_array($connections)) {
        return [];
    }
    $out = [];
    foreach ($connections as $conn) {
        if (!is_array($conn)) {
            continue;
        }
        $out[] = pamantau_normalize_connection($conn);
    }
    return array_values($out);
}

function pamantau_default_settings(): array
{
    return [
        'poll_interval_ms' => 30000,
        'polling_enabled' => true,
        'ping_timeout_ms' => 500,
        'poll_method' => 'parallel',
        'ping_count' => 5,
        'port_scan_enabled' => true,
        'common_ports' => [22, 23, 53, 80, 443, 1996, 2219, 2296, 3306, 3389, 8080, 8091, 8291, 8443, 8728],
        'common_port_notes' => [
            '22' => 'SSH',
            '23' => 'Telnet',
            '53' => 'DNS',
            '80' => 'HTTP',
            '443' => 'HTTPS',
            '1996' => 'SSH-JNET',
            '2219' => 'Winbox-JNET',
            '2296' => 'API-JNET',
            '3306' => 'MySQL',
            '3389' => 'RDP',
            '8080' => 'HTTP alternatif',
            '8091' => 'CUSJ',
            '8291' => 'Winbox',
            '8443' => 'HTTPS alternatif',
            '8728' => 'API RouterOS',
        ],
        // Manual Scan Port (range): parallel is faster for large spans.
        'scan_port_method' => 'parallel',
        // Max inclusive ports in one manual Scan Port range (1–10000).
        'scan_port_max' => 10000,
        // Scan Subnet discovery: parallel for faster host sweeps.
        'scan_subnet_method' => 'parallel',
        'subnet_batch_size' => 32,
        'subnet_timeout_ms' => 500,
        'subnet_max_hosts' => 254,
        'history_max' => 47,
        'zoom_min' => 0.2,
        'zoom_max' => 5,
        'animate_links' => true,
        'link_animation_style' => 'beads',
        'link_anim_speed' => 1.0,
        'show_link_icon' => true,
        'show_link_label' => true,
        'show_link_comment' => true,
        'show_label' => true,
        'show_ip' => true,
        'show_latency' => true,
        'show_comment' => true,
        'show_services' => true,
        'grid_size' => 12,
        'show_grid' => true,
        'snap_drag' => true,
        'layout_locked' => false,
        'theme' => 'light',
        'ui_language' => 'id',
        'status_online_color' => '#39ff14',
        'status_offline_color' => '#ff3b5c',
        'status_unknown_color' => '#8090a8',
        // Background worker (cli/background.php) — ON allows scheduled runs; OFF = no-op.
        'background_enabled' => false,
        // Telegram notifications (app-level only; not part of topology Save/Open).
        'telegram_enabled' => false,
        'telegram_bot_token' => '',
        'telegram_chat_id' => '',
        'telegram_notify_up' => true,
        'telegram_notify_down' => true,
        'telegram_tpl_up' => '{label} ({ip}) UP — {latency} ms @ {time}',
        'telegram_tpl_down' => '{label} ({ip}) DOWN @ {time}',
        'telegram_screenshot_enabled' => false,
        'telegram_screenshot_format' => 'png',
        'telegram_screenshot_schedule_mode' => 'interval',
        'telegram_screenshot_every_min' => 30,
        'telegram_screenshot_hourly_minute' => 0,
        'telegram_screenshot_daily_time' => '08:00',
        'telegram_screenshot_last_at' => '',
    ];
}

/**
 * Normalize a CSS hex color (#rgb / #rrggbb) to lowercase #rrggbb.
 */
function pamantau_normalize_hex_color(mixed $value, string $fallback): string
{
    $s = is_string($value) ? trim($value) : '';
    if (preg_match('/^#([0-9a-fA-F]{3})$/', $s, $m)) {
        $c = strtolower($m[1]);
        return '#' . $c[0] . $c[0] . $c[1] . $c[1] . $c[2] . $c[2];
    }
    if (preg_match('/^#([0-9a-fA-F]{6})$/', $s, $m)) {
        return '#' . strtolower($m[1]);
    }
    return $fallback;
}

/**
 * Merge stored settings with defaults and clamp/sanitize values.
 */
function pamantau_normalize_settings(mixed $raw): array
{
    $defaults = pamantau_default_settings();
    $in = is_array($raw) ? $raw : [];
    $out = array_merge($defaults, $in);

    $out['poll_interval_ms'] = min(60000, max(2000, (int) $out['poll_interval_ms']));
    $out['polling_enabled'] = (bool) $out['polling_enabled'];
    $out['ping_timeout_ms'] = min(5000, max(200, (int) $out['ping_timeout_ms']));
    $method = strtolower(trim((string) ($out['poll_method'] ?? 'parallel')));
    $out['poll_method'] = $method === 'sequential' ? 'sequential' : 'parallel';
    $out['ping_count'] = min(10, max(1, (int) ($out['ping_count'] ?? 5)));
    $out['port_scan_enabled'] = (bool) $out['port_scan_enabled'];
    $portScanMethod = strtolower(trim((string) ($out['scan_port_method'] ?? 'parallel')));
    $out['scan_port_method'] = $portScanMethod === 'sequential' ? 'sequential' : 'parallel';
    $out['scan_port_max'] = min(10000, max(1, (int) ($out['scan_port_max'] ?? 1024)));
    $subnetScanMethod = strtolower(trim((string) ($out['scan_subnet_method'] ?? 'sequential')));
    $out['scan_subnet_method'] = $subnetScanMethod === 'parallel' ? 'parallel' : 'sequential';
    $out['subnet_batch_size'] = min(128, max(8, (int) $out['subnet_batch_size']));
    $out['subnet_timeout_ms'] = min(500, max(100, (int) $out['subnet_timeout_ms']));
    $out['subnet_max_hosts'] = min(1022, max(2, (int) $out['subnet_max_hosts']));
    $out['history_max'] = min(200, max(10, (int) $out['history_max']));
    $out['zoom_min'] = min(1.0, max(0.2, (float) $out['zoom_min']));
    $out['zoom_max'] = min(5.0, max(1.2, (float) $out['zoom_max']));
    if ($out['zoom_max'] <= $out['zoom_min']) {
        $out['zoom_max'] = max($out['zoom_min'] + 0.5, 2.2);
    }
    $out['animate_links'] = (bool) $out['animate_links'];
    $validLinkAnimStyles = ['pulse', 'flow', 'comet', 'beads', 'spark'];
    $style = $out['link_animation_style'] ?? null;
    if ($style === 'glow') {
        $style = 'comet'; // migrasi gaya lama
    }
    $out['link_animation_style'] = in_array($style, $validLinkAnimStyles, true)
        ? $style
        : $defaults['link_animation_style'];
    $speed = (float) ($out['link_anim_speed'] ?? $defaults['link_anim_speed']);
    if ($speed !== $speed) { // NaN
        $speed = (float) $defaults['link_anim_speed'];
    }
    $out['link_anim_speed'] = min(2.0, max(0.25, round($speed * 20) / 20));
    $out['show_link_icon'] = (bool) $out['show_link_icon'];
    $out['show_link_label'] = (bool) $out['show_link_label'];
    $out['show_link_comment'] = (bool) $out['show_link_comment'];
    // Legacy key: show_node_services → show_services
    if (!array_key_exists('show_services', $in) && array_key_exists('show_node_services', $in)) {
        $out['show_services'] = $in['show_node_services'];
    }
    unset($out['show_node_services']);
    $out['show_label'] = (bool) $out['show_label'];
    $out['show_ip'] = (bool) $out['show_ip'];
    $out['show_latency'] = (bool) $out['show_latency'];
    $out['show_comment'] = (bool) $out['show_comment'];
    $out['show_services'] = (bool) $out['show_services'];
    $out['grid_size'] = min(64, max(8, (int) $out['grid_size']));
    $out['show_grid'] = (bool) $out['show_grid'];
    $out['snap_drag'] = (bool) $out['snap_drag'];
    $out['layout_locked'] = (bool) $out['layout_locked'];
    $validThemes = ['light', 'dark', 'sand'];
    $theme = strtolower(trim((string) ($out['theme'] ?? 'light')));
    if ($theme === 'midnight') {
        $theme = 'dark';
    }
    $out['theme'] = in_array($theme, $validThemes, true) ? $theme : $defaults['theme'];
    $uiLang = strtolower(trim((string) ($out['ui_language'] ?? 'id')));
    $out['ui_language'] = $uiLang === 'en' ? 'en' : 'id';
    $out['status_online_color'] = pamantau_normalize_hex_color(
        $out['status_online_color'] ?? null,
        $defaults['status_online_color']
    );
    $out['status_offline_color'] = pamantau_normalize_hex_color(
        $out['status_offline_color'] ?? null,
        $defaults['status_offline_color']
    );
    $out['status_unknown_color'] = pamantau_normalize_hex_color(
        $out['status_unknown_color'] ?? null,
        $defaults['status_unknown_color']
    );
    unset($out['status_lamp_blink']);

    $out['background_enabled'] = (bool) ($out['background_enabled'] ?? false);
    $out['telegram_enabled'] = (bool) ($out['telegram_enabled'] ?? false);
    $out['telegram_bot_token'] = is_string($out['telegram_bot_token'] ?? null)
        ? trim((string) $out['telegram_bot_token'])
        : '';
    $out['telegram_chat_id'] = is_string($out['telegram_chat_id'] ?? null)
        ? trim((string) $out['telegram_chat_id'])
        : '';
    $out['telegram_notify_up'] = (bool) ($out['telegram_notify_up'] ?? true);
    $out['telegram_notify_down'] = (bool) ($out['telegram_notify_down'] ?? true);
    $tplUp = trim((string) ($out['telegram_tpl_up'] ?? ''));
    $tplDown = trim((string) ($out['telegram_tpl_down'] ?? ''));
    $out['telegram_tpl_up'] = $tplUp !== ''
        ? $tplUp
        : $defaults['telegram_tpl_up'];
    $out['telegram_tpl_down'] = $tplDown !== ''
        ? $tplDown
        : $defaults['telegram_tpl_down'];
    $out['telegram_screenshot_enabled'] = (bool) ($out['telegram_screenshot_enabled'] ?? false);
    $shotFmt = strtolower(trim((string) ($out['telegram_screenshot_format'] ?? 'png')));
    $out['telegram_screenshot_format'] = $shotFmt === 'jpg' || $shotFmt === 'jpeg' ? 'jpg' : 'png';
    $shotMode = strtolower(trim((string) ($out['telegram_screenshot_schedule_mode'] ?? '')));
    if (!in_array($shotMode, ['interval', 'hourly', 'daily'], true)) {
        // Migrate legacy every_min-only settings to interval mode.
        $shotMode = 'interval';
    }
    $out['telegram_screenshot_schedule_mode'] = $shotMode;
    $out['telegram_screenshot_every_min'] = min(1440, max(5, (int) ($out['telegram_screenshot_every_min'] ?? 30)));
    $out['telegram_screenshot_hourly_minute'] = min(59, max(0, (int) ($out['telegram_screenshot_hourly_minute'] ?? 0)));
    $dailyTime = trim((string) ($out['telegram_screenshot_daily_time'] ?? '08:00'));
    if (preg_match('/^(\d{1,2}):(\d{2})$/', $dailyTime, $dm)) {
        $dh = min(23, max(0, (int) $dm[1]));
        $dmin = min(59, max(0, (int) $dm[2]));
        $out['telegram_screenshot_daily_time'] = sprintf('%02d:%02d', $dh, $dmin);
    } else {
        $out['telegram_screenshot_daily_time'] = '08:00';
    }
    $lastAt = trim((string) ($out['telegram_screenshot_last_at'] ?? ''));
    $out['telegram_screenshot_last_at'] = $lastAt;

    $ports = $out['common_ports'] ?? [];
    if (is_string($ports)) {
        $ports = preg_split('/[\s,;]+/', $ports) ?: [];
    }
    if (!is_array($ports)) {
        $ports = $defaults['common_ports'];
    }
    $cleanPorts = [];
    foreach ($ports as $p) {
        $n = (int) $p;
        if ($n >= 1 && $n <= 65535 && !in_array($n, $cleanPorts, true)) {
            $cleanPorts[] = $n;
        }
    }
    if ($cleanPorts === []) {
        $cleanPorts = $defaults['common_ports'];
    }
    // Preserve user/table order (do not sort).
    $out['common_ports'] = array_values($cleanPorts);

    $notesIn = $out['common_port_notes'] ?? [];
    if (!is_array($notesIn)) {
        $notesIn = [];
    }
    $cleanNotes = [];
    foreach ($cleanPorts as $portNum) {
        $key = (string) $portNum;
        $rawNote = $notesIn[$key] ?? $notesIn[$portNum] ?? null;
        if ($rawNote === null) {
            continue;
        }
        if (!is_string($rawNote) && !is_numeric($rawNote)) {
            continue;
        }
        $note = trim((string) $rawNote);
        if (function_exists('mb_substr')) {
            $note = mb_substr($note, 0, 80);
        } else {
            $note = substr($note, 0, 80);
        }
        if ($note !== '') {
            $cleanNotes[$key] = $note;
        }
    }
    $out['common_port_notes'] = $cleanNotes;

    return $out;
}

function pamantau_default_store(): array
{
    return [
        'devices' => [],
        'connections' => [],
        'auth' => [
            'username' => 'admin',
            'password_hash' => '',
        ],
        'settings' => pamantau_default_settings(),
        'stats' => [],
        // Per-device daily poll aggregates (YYYY-MM-DD keys, server local TZ).
        // Used by ranged Laporan; cleared with Reset Counter.
        'stats_daily' => [],
    ];
}

/**
 * Ensure a device record has a valid `poll_count` (times it has been
 * pinged during live polling / manual ping). Missing/invalid values
 * default to 0 so existing devices saved before this field existed
 * still work.
 */
function pamantau_normalize_device(array $device): array
{
    $device['poll_count'] = max(0, (int) ($device['poll_count'] ?? 0));
    return $device;
}

function pamantau_normalize_devices(mixed $devices): array
{
    if (!is_array($devices)) {
        return [];
    }
    return array_map('pamantau_normalize_device', array_values(array_filter($devices, 'is_array')));
}

function pamantau_legacy_path(string $name): string
{
    $safe = preg_replace('/[^a-z0-9_-]/i', '', $name);
    return PAMANTAU_DB_DIR . '/' . $safe . '.json';
}

function pamantau_read_json_file(string $path, mixed $default = null): mixed
{
    if (!is_file($path)) {
        return $default;
    }

    // Try up to 5 times in case of transient write locks (Windows file sharing)
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $fp = @fopen($path, 'rb');
        if ($fp !== false) {
            @flock($fp, LOCK_SH);
            $raw = @stream_get_contents($fp);
            @flock($fp, LOCK_UN);
            @fclose($fp);

            if (is_string($raw) && $raw !== '') {
                $data = json_decode($raw, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                    return $data;
                }
            }
        }
        usleep(20000); // 20ms delay before retry
    }

    return $default;
}

function pamantau_migrate_legacy_store(): array
{
    $store = pamantau_default_store();
    foreach (['devices', 'connections', 'settings', 'stats'] as $key) {
        $legacy = pamantau_read_json_file(pamantau_legacy_path($key), null);
        if ($legacy !== null) {
            $store[$key] = $legacy;
        }
    }
    return $store;
}

function pamantau_load_store(): array
{
    if (!is_dir(PAMANTAU_DB_DIR)) {
        @mkdir(PAMANTAU_DB_DIR, 0775, true);
    }

    if (is_file(PAMANTAU_DB_FILE)) {
        $data = pamantau_read_json_file(PAMANTAU_DB_FILE, null);
        if (is_array($data)) {
            $store = array_merge(pamantau_default_store(), $data);
            if (!is_array($store['auth'] ?? null)) {
                $store['auth'] = pamantau_default_store()['auth'];
            } else {
                $store['auth'] = array_merge(pamantau_default_store()['auth'], $store['auth']);
            }
            $store['settings'] = pamantau_normalize_settings($store['settings'] ?? []);
            $store['devices'] = pamantau_normalize_devices($store['devices'] ?? []);
            $store['connections'] = pamantau_normalize_connections($store['connections'] ?? []);
            return $store;
        }
    }

    // Migrate from old split JSON files once if main file does not exist at all
    $store = pamantau_migrate_legacy_store();
    $store['devices'] = pamantau_normalize_devices($store['devices'] ?? []);
    $store['connections'] = pamantau_normalize_connections($store['connections'] ?? []);
    if (!is_file(PAMANTAU_DB_FILE)) {
        pamantau_save_store($store);
    }

    return $store;
}

function pamantau_save_store(array $store): bool
{
    if (!is_dir(PAMANTAU_DB_DIR)) {
        @mkdir(PAMANTAU_DB_DIR, 0775, true);
    }

    $payload = array_merge(pamantau_default_store(), $store);
    if (!is_array($payload['auth'] ?? null)) {
        $payload['auth'] = pamantau_default_store()['auth'];
    } else {
        $payload['auth'] = array_merge(pamantau_default_store()['auth'], $payload['auth']);
    }
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    // Safely write to temp file and overwrite PAMANTAU_DB_FILE without ever unlinking it first
    $tmpFile = PAMANTAU_DB_FILE . '.' . uniqid('tmp', true);
    if (@file_put_contents($tmpFile, $json, LOCK_EX) === false) {
        return false;
    }

    $ok = @copy($tmpFile, PAMANTAU_DB_FILE);
    @unlink($tmpFile);

    return $ok;
}

function pamantau_read(string $name, mixed $default = null): mixed
{
    $store = pamantau_load_store();
    return array_key_exists($name, $store) ? $store[$name] : $default;
}

function pamantau_write(string $name, mixed $data): bool
{
    $store = pamantau_load_store();
    $store[$name] = $data;
    return pamantau_save_store($store);
}

/**
 * Empty the database (devices, connections, stats, stats_daily) while deliberately
 * preserving `settings` — those are reset separately via the Settings
 * modal's "Reset default" action, so a destructive "kosongkan database"
 * click never silently wipes the user's monitoring/appearance preferences.
 */
function pamantau_clear_database(): array
{
    $store = pamantau_load_store();
    $store['devices'] = [];
    $store['connections'] = [];
    $store['stats'] = [];
    $store['stats_daily'] = [];
    pamantau_save_store($store);
    return $store;
}

/**
 * Reset polling counters/stats only — keeps topology (devices + connections) and settings.
 * Also clears daily historical aggregates (`stats_daily`).
 */
function pamantau_reset_counters(): array
{
    $store = pamantau_load_store();
    $devices = is_array($store['devices'] ?? null) ? $store['devices'] : [];
    foreach ($devices as &$device) {
        if (!is_array($device)) {
            continue;
        }
        $device['poll_count'] = 0;
        $device['status'] = 'unknown';
        $device['latency'] = null;
        // Keep services/label/ip/position — only clear live poll fields + counters
    }
    unset($device);
    $store['devices'] = $devices;
    $store['stats'] = [];
    $store['stats_daily'] = [];
    pamantau_save_store($store);
    return $store;
}

function pamantau_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}
