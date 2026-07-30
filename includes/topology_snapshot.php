<?php
declare(strict_types=1);

require_once __DIR__ . '/headless_snapshot.php';

const PAMANTAU_CANVAS_SNAPSHOT_MAX_BYTES = 9 * 1048576;
const PAMANTAU_CANVAS_SNAPSHOT_MAX_WIDTH = 4000;
const PAMANTAU_CANVAS_SNAPSHOT_MAX_HEIGHT = 3000;
const PAMANTAU_CANVAS_SNAPSHOT_MAX_PIXELS = 10000000;

/** Parse a php.ini size string to bytes (0 if unknown/unlimited). */
function pamantau_ini_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '-1') {
        return 0;
    }
    if (!preg_match('/^(\d+)\s*([KMG])?B?$/i', $value, $m)) {
        return 0;
    }
    $n = (int) $m[1];
    return match (strtoupper($m[2] ?? '')) {
        'K' => $n * 1024,
        'M' => $n * 1048576,
        'G' => $n * 1073741824,
        default => $n,
    };
}

/**
 * Safe multipart payload target derived from the active PHP runtime.
 * The margin leaves room for multipart headers and other form fields.
 */
function pamantau_canvas_snapshot_upload_limit_bytes(): int
{
    $limit = PAMANTAU_CANVAS_SNAPSHOT_MAX_BYTES;
    foreach (['upload_max_filesize', 'post_max_size'] as $key) {
        $bytes = pamantau_ini_bytes((string) ini_get($key));
        if ($bytes > 0) {
            $limit = min($limit, $bytes);
        }
    }
    return max(128 * 1024, (int) floor($limit * 0.85));
}

/**
 * @return array{ok:bool,error?:string,mime?:string,filename?:string,width?:int,height?:int}
 */
function pamantau_validate_canvas_snapshot_binary(string $binary): array
{
    $size = strlen($binary);
    if ($size === 0) {
        return ['ok' => false, 'error' => 'Snapshot canvas kosong'];
    }
    if ($size > PAMANTAU_CANVAS_SNAPSHOT_MAX_BYTES) {
        return ['ok' => false, 'error' => 'Snapshot canvas melebihi batas 9 MB'];
    }

    $info = @getimagesizefromstring($binary);
    if (!is_array($info)) {
        return ['ok' => false, 'error' => 'File snapshot canvas bukan gambar yang valid'];
    }
    $width = max(0, (int) ($info[0] ?? 0));
    $height = max(0, (int) ($info[1] ?? 0));
    $mime = strtolower((string) ($info['mime'] ?? ''));
    if (!in_array($mime, ['image/png', 'image/jpeg'], true)) {
        return ['ok' => false, 'error' => 'Format snapshot canvas harus PNG atau JPG'];
    }
    if (
        $width < 1
        || $height < 1
        || $width > PAMANTAU_CANVAS_SNAPSHOT_MAX_WIDTH
        || $height > PAMANTAU_CANVAS_SNAPSHOT_MAX_HEIGHT
        || ($width * $height) > PAMANTAU_CANVAS_SNAPSHOT_MAX_PIXELS
    ) {
        return ['ok' => false, 'error' => 'Dimensi snapshot canvas terlalu besar'];
    }

    return [
        'ok' => true,
        'mime' => $mime,
        'filename' => $mime === 'image/jpeg' ? 'pamantau-topology.jpg' : 'pamantau-topology.png',
        'width' => $width,
        'height' => $height,
    ];
}

/**
 * Read and validate an uploaded live canvas without caching it.
 *
 * @return array{ok:bool,error?:string,binary?:string,mime?:string,filename?:string,width?:int,height?:int}
 */
function pamantau_canvas_snapshot_from_upload(mixed $upload): array
{
    if (!is_array($upload)) {
        return ['ok' => false, 'error' => 'File snapshot canvas tidak ditemukan'];
    }
    $error = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            return ['ok' => false, 'error' => 'Snapshot canvas melebihi batas upload server'];
        }
        return ['ok' => false, 'error' => 'Upload snapshot canvas gagal (kode ' . $error . ')'];
    }
    $tmp = (string) ($upload['tmp_name'] ?? '');
    $binary = $tmp !== '' && is_readable($tmp) ? @file_get_contents($tmp) : false;
    if (!is_string($binary)) {
        return ['ok' => false, 'error' => 'Snapshot canvas gagal dibaca'];
    }
    $valid = pamantau_validate_canvas_snapshot_binary($binary);
    return empty($valid['ok']) ? $valid : array_merge($valid, ['binary' => $binary]);
}

function pamantau_snapshot_telegram_caption(array $settings, string $mode = 'auto'): string
{
    $lang = ($settings['ui_language'] ?? 'id') === 'en' ? 'en' : 'id';
    $when = date('Y-m-d H:i:s');
    if ($mode === 'test') {
        return $lang === 'en'
            ? '[TEST] Pamantau topology · ' . $when
            : '[UJI] Pamantau topologi · ' . $when;
    }
    return $lang === 'en'
        ? 'Pamantau topology - ' . $when
        : 'Pamantau topologi - ' . $when;
}

/**
 * @param array{ok:bool,binary?:string,filename?:string,error?:string} $shot
 * @return array{ok:bool,error?:string,filename?:string,source?:string}
 */
function pamantau_telegram_send_snapshot_binary(
    array $settings,
    array $shot,
    bool $touchLastAt = true,
    string $caption = ''
): array {
    try {
        $settings = pamantau_normalize_settings($settings);
        $token = (string) ($settings['telegram_bot_token'] ?? '');
        $chatId = (string) ($settings['telegram_chat_id'] ?? '');
        if ($token === '' || $chatId === '') {
            return ['ok' => false, 'error' => 'Isi Bot Token dan Chat ID di Pengaturan Telegram'];
        }
        if (empty($shot['ok']) || !isset($shot['binary'], $shot['filename'])) {
            return ['ok' => false, 'error' => $shot['error'] ?? 'Canvas tidak valid'];
        }

        $cap = $caption !== '' ? $caption : pamantau_snapshot_telegram_caption($settings, 'auto');
        $send = pamantau_telegram_send_photo(
            $token,
            $chatId,
            (string) $shot['binary'],
            (string) $shot['filename'],
            $cap
        );
        if (!$send['ok']) {
            return ['ok' => false, 'error' => $send['error'] ?? 'sendPhoto gagal'];
        }

        if ($touchLastAt) {
            $settings['telegram_screenshot_last_at'] = date('c');
            pamantau_write('settings', pamantau_normalize_settings($settings));
        }
        return [
            'ok' => true,
            'filename' => (string) $shot['filename'],
            'source' => 'live_canvas',
        ];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'Screenshot gagal: ' . $e->getMessage()];
    }
}

/**
 * Render a new canvas in Chrome/Edge for every scheduled send. No GD/cache
 * fallback is allowed because it can be stale or differ from the dashboard.
 *
 * @return array{ok:bool,error?:string,filename?:string,source?:string}
 */
function pamantau_telegram_send_topology_screenshot(
    array $settings,
    bool $touchLastAt = true,
    string $caption = ''
): array {
    @set_time_limit(150);
    $shot = pamantau_render_topology_headless();
    if (empty($shot['ok'])) {
        return ['ok' => false, 'error' => $shot['error'] ?? 'Render browser gagal'];
    }
    $sent = pamantau_telegram_send_snapshot_binary($settings, $shot, $touchLastAt, $caption);
    if (!empty($sent['ok'])) {
        $sent['source'] = 'headless_canvas';
    }
    return $sent;
}

/**
 * Whether a scheduled topology screenshot is due (server local timezone).
 */
function pamantau_telegram_screenshot_due(array $settings): bool
{
    $settings = pamantau_normalize_settings($settings);
    if (empty($settings['telegram_screenshot_enabled']) || empty($settings['telegram_enabled'])) {
        return false;
    }

    $last = trim((string) ($settings['telegram_screenshot_last_at'] ?? ''));
    $lastTs = $last !== '' ? strtotime($last) : false;
    $mode = (string) ($settings['telegram_screenshot_schedule_mode'] ?? 'interval');
    $now = time();

    if ($mode === 'hourly') {
        $minute = (int) ($settings['telegram_screenshot_hourly_minute'] ?? 0);
        $slot = mktime(
            (int) date('G', $now),
            $minute,
            0,
            (int) date('n', $now),
            (int) date('j', $now),
            (int) date('Y', $now)
        );
        return $lastTs === false ? $now >= $slot : ($now >= $slot && $lastTs < $slot);
    }

    if ($mode === 'daily') {
        $time = (string) ($settings['telegram_screenshot_daily_time'] ?? '08:00');
        $parts = explode(':', $time, 2);
        $hour = min(23, max(0, (int) ($parts[0] ?? 8)));
        $minute = min(59, max(0, (int) ($parts[1] ?? 0)));
        $slot = mktime(
            $hour,
            $minute,
            0,
            (int) date('n', $now),
            (int) date('j', $now),
            (int) date('Y', $now)
        );
        return $lastTs === false ? $now >= $slot : ($now >= $slot && $lastTs < $slot);
    }

    $every = max(5, (int) ($settings['telegram_screenshot_every_min'] ?? 30));
    return $lastTs === false || ($now - $lastTs) >= ($every * 60);
}
