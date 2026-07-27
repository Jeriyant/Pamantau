<?php
declare(strict_types=1);

/**
 * Telegram Bot API helpers for Pamantau notifications.
 */

function pamantau_telegram_api_base(string $token): string
{
    return 'https://api.telegram.org/bot' . $token;
}

/**
 * Mask a bot token for UI / API responses. Empty → empty.
 * Shows bullet prefix + last 4 characters when long enough.
 */
function pamantau_mask_bot_token(string $token): string
{
    $token = trim($token);
    if ($token === '') {
        return '';
    }
    $len = strlen($token);
    if ($len <= 4) {
        return str_repeat('•', max(4, $len));
    }
    return str_repeat('•', min(12, $len - 4)) . substr($token, -4);
}

/** True if value looks like a masked placeholder, not a real token. */
function pamantau_is_masked_bot_token(string $value): bool
{
    $value = trim($value);
    if ($value === '') {
        return false;
    }
    return str_contains($value, '•') || str_contains($value, '*');
}

/**
 * Settings copy for the local dashboard UI.
 * Returns the real bot token (admin form shows it as plain text) plus telegram_bot_token_set.
 */
function pamantau_settings_for_client(array $settings): array
{
    $settings = pamantau_normalize_settings($settings);
    $token = (string) ($settings['telegram_bot_token'] ?? '');
    $settings['telegram_bot_token_set'] = $token !== '';
    $settings['telegram_bot_token'] = $token;
    return $settings;
}

/**
 * Apply Telegram-related keys from a save_settings body onto existing settings.
 * Skips token update when empty or masked (keep stored secret).
 */
function pamantau_apply_telegram_settings_patch(array $settings, array $body): array
{
    $boolKeys = [
        'telegram_enabled',
        'telegram_notify_up',
        'telegram_notify_down',
        'telegram_screenshot_enabled',
    ];
    foreach ($boolKeys as $key) {
        if (array_key_exists($key, $body)) {
            $settings[$key] = $body[$key];
        }
    }
    if (array_key_exists('telegram_chat_id', $body)) {
        $settings['telegram_chat_id'] = trim((string) $body['telegram_chat_id']);
    }
    if (array_key_exists('telegram_tpl_up', $body)) {
        $settings['telegram_tpl_up'] = (string) $body['telegram_tpl_up'];
    }
    if (array_key_exists('telegram_tpl_down', $body)) {
        $settings['telegram_tpl_down'] = (string) $body['telegram_tpl_down'];
    }
    if (array_key_exists('telegram_screenshot_format', $body)) {
        $settings['telegram_screenshot_format'] = (string) $body['telegram_screenshot_format'];
    }
    if (array_key_exists('telegram_screenshot_schedule_mode', $body)) {
        $settings['telegram_screenshot_schedule_mode'] = (string) $body['telegram_screenshot_schedule_mode'];
    }
    if (array_key_exists('telegram_screenshot_every_min', $body)) {
        $settings['telegram_screenshot_every_min'] = $body['telegram_screenshot_every_min'];
    }
    if (array_key_exists('telegram_screenshot_hourly_minute', $body)) {
        $settings['telegram_screenshot_hourly_minute'] = $body['telegram_screenshot_hourly_minute'];
    }
    if (array_key_exists('telegram_screenshot_daily_time', $body)) {
        $settings['telegram_screenshot_daily_time'] = (string) $body['telegram_screenshot_daily_time'];
    }
    if (array_key_exists('telegram_screenshot_last_at', $body)) {
        $settings['telegram_screenshot_last_at'] = trim((string) $body['telegram_screenshot_last_at']);
    }
    if (array_key_exists('telegram_bot_token', $body)) {
        $token = trim((string) $body['telegram_bot_token']);
        if ($token !== '' && !pamantau_is_masked_bot_token($token)) {
            $settings['telegram_bot_token'] = $token;
        }
        // empty or masked → keep existing token
    }
    return $settings;
}

/**
 * Fill message template placeholders.
 *
 * @param array{label?:string,ip?:string,type?:string,latency?:mixed,time?:string,status?:string} $vars
 */
function pamantau_telegram_render_template(string $template, array $vars): string
{
    $latency = $vars['latency'] ?? null;
    $latencyStr = ($latency === null || $latency === '') ? '—' : (string) $latency;
    $map = [
        '{label}' => (string) ($vars['label'] ?? ''),
        '{ip}' => (string) ($vars['ip'] ?? ''),
        '{type}' => (string) ($vars['type'] ?? ''),
        '{latency}' => $latencyStr,
        '{time}' => (string) ($vars['time'] ?? date('Y-m-d H:i:s')),
        '{status}' => (string) ($vars['status'] ?? ''),
    ];
    return strtr($template, $map);
}

/**
 * Low-level Telegram API call (JSON body).
 *
 * @return array{ok:bool,error?:string,result?:mixed,raw?:array}
 */
function pamantau_telegram_api(string $token, string $method, array $payload = []): array
{
    $token = trim($token);
    if ($token === '') {
        return ['ok' => false, 'error' => 'Bot token kosong'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'Ekstensi PHP curl tidak tersedia'];
    }

    $url = pamantau_telegram_api_base($token) . '/' . ltrim($method, '/');
    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Gagal init curl'];
    }
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $json !== false ? $json : '{}',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $err = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false || $errno !== 0) {
        return ['ok' => false, 'error' => $err !== '' ? $err : 'Koneksi Telegram gagal'];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['ok' => false, 'error' => 'Respons Telegram tidak valid (HTTP ' . $http . ')'];
    }
    if (empty($data['ok'])) {
        $desc = (string) ($data['description'] ?? 'Telegram API error');
        return ['ok' => false, 'error' => $desc, 'raw' => $data];
    }
    return ['ok' => true, 'result' => $data['result'] ?? null, 'raw' => $data];
}

/**
 * @return array{ok:bool,error?:string,result?:mixed}
 */
function pamantau_telegram_send_message(string $token, string $chatId, string $text): array
{
    $chatId = trim($chatId);
    $text = trim($text);
    if ($chatId === '') {
        return ['ok' => false, 'error' => 'Chat ID kosong'];
    }
    if ($text === '') {
        return ['ok' => false, 'error' => 'Pesan kosong'];
    }
    return pamantau_telegram_api($token, 'sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'disable_web_page_preview' => true,
    ]);
}

/**
 * Send a photo (binary) via multipart/form-data.
 *
 * @return array{ok:bool,error?:string,result?:mixed}
 */
function pamantau_telegram_send_photo(
    string $token,
    string $chatId,
    string $imageBinary,
    string $filename = 'topology.png',
    string $caption = ''
): array {
    $token = trim($token);
    $chatId = trim($chatId);
    if ($token === '') {
        return ['ok' => false, 'error' => 'Bot token kosong'];
    }
    if ($chatId === '') {
        return ['ok' => false, 'error' => 'Chat ID kosong'];
    }
    if ($imageBinary === '') {
        return ['ok' => false, 'error' => 'Gambar kosong'];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'Ekstensi PHP curl tidak tersedia'];
    }

    $url = pamantau_telegram_api_base($token) . '/sendPhoto';
    $mime = str_ends_with(strtolower($filename), '.jpg') || str_ends_with(strtolower($filename), '.jpeg')
        ? 'image/jpeg'
        : 'image/png';

    $tmp = tempnam(sys_get_temp_dir(), 'pam_tg_');
    if ($tmp === false) {
        return ['ok' => false, 'error' => 'Gagal buat file sementara'];
    }
    $tmpPath = $tmp . (str_ends_with(strtolower($filename), '.jpg') ? '.jpg' : '.png');
    @unlink($tmp);
    if (file_put_contents($tmpPath, $imageBinary) === false) {
        return ['ok' => false, 'error' => 'Gagal tulis file sementara'];
    }

    $ch = curl_init($url);
    if ($ch === false) {
        @unlink($tmpPath);
        return ['ok' => false, 'error' => 'Gagal init curl'];
    }

    $fields = [
        'chat_id' => $chatId,
        'photo' => new CURLFile($tmpPath, $mime, $filename),
    ];
    if (trim($caption) !== '') {
        $fields['caption'] = trim($caption);
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 60,
    ]);
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $err = curl_error($ch);
    curl_close($ch);
    @unlink($tmpPath);

    if ($raw === false || $errno !== 0) {
        return ['ok' => false, 'error' => $err !== '' ? $err : 'Koneksi Telegram gagal'];
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data['ok'])) {
        $desc = is_array($data) ? (string) ($data['description'] ?? 'Telegram API error') : 'Respons tidak valid';
        return ['ok' => false, 'error' => $desc];
    }
    return ['ok' => true, 'result' => $data['result'] ?? null];
}

/**
 * Test bot token (getMe) and optionally send a short message to chat_id.
 *
 * @return array{ok:bool,error?:string,bot?:array,message_sent?:bool}
 */
function pamantau_telegram_test_connection(string $token, string $chatId = '', bool $sendProbe = true): array
{
    $me = pamantau_telegram_api($token, 'getMe', []);
    if (!$me['ok']) {
        return ['ok' => false, 'error' => $me['error'] ?? 'getMe gagal'];
    }
    $bot = is_array($me['result'] ?? null) ? $me['result'] : [];
    $out = [
        'ok' => true,
        'bot' => [
            'id' => $bot['id'] ?? null,
            'username' => $bot['username'] ?? '',
            'first_name' => $bot['first_name'] ?? '',
        ],
        'message_sent' => false,
    ];
    if ($sendProbe && trim($chatId) !== '') {
        $msg = pamantau_telegram_send_message(
            $token,
            $chatId,
            'Pamantau: koneksi Telegram OK (' . date('Y-m-d H:i:s') . ')'
        );
        if (!$msg['ok']) {
            return ['ok' => false, 'error' => $msg['error'] ?? 'sendMessage gagal', 'bot' => $out['bot']];
        }
        $out['message_sent'] = true;
    }
    return $out;
}

/**
 * Build vars from a device record for templates.
 *
 * @param array $device
 * @return array{label:string,ip:string,type:string,latency:mixed,time:string,status:string}
 */
function pamantau_telegram_device_vars(array $device, ?string $statusOverride = null): array
{
    $status = $statusOverride ?? (string) ($device['status'] ?? 'unknown');
    $latency = $device['latency'] ?? null;
    return [
        'label' => (string) ($device['label'] ?? 'Device'),
        'ip' => (string) ($device['ip'] ?? ''),
        'type' => (string) ($device['type'] ?? ''),
        'latency' => $latency,
        'time' => date('Y-m-d H:i:s'),
        'status' => $status,
    ];
}

/**
 * Notify on status transition if Telegram master + up/down toggles allow it.
 * Up: non-online → online. Down: online → offline only (skip unknown→offline noise).
 *
 * @return array{sent:bool,kind?:string,error?:string}
 */
function pamantau_telegram_notify_transition(
    array $settings,
    array $device,
    string $oldStatus,
    string $newStatus
): array {
    $settings = pamantau_normalize_settings($settings);
    if (empty($settings['telegram_enabled'])) {
        return ['sent' => false];
    }
    $token = (string) ($settings['telegram_bot_token'] ?? '');
    $chatId = (string) ($settings['telegram_chat_id'] ?? '');
    if ($token === '' || $chatId === '') {
        return ['sent' => false, 'error' => 'Token/Chat ID belum diisi'];
    }

    $old = strtolower(trim($oldStatus));
    $new = strtolower(trim($newStatus));
    $kind = null;
    if ($old !== 'online' && $new === 'online' && !empty($settings['telegram_notify_up'])) {
        $kind = 'up';
    } elseif ($old === 'online' && $new === 'offline' && !empty($settings['telegram_notify_down'])) {
        $kind = 'down';
    }
    if ($kind === null) {
        return ['sent' => false];
    }

    $tpl = $kind === 'up'
        ? (string) $settings['telegram_tpl_up']
        : (string) $settings['telegram_tpl_down'];
    $vars = pamantau_telegram_device_vars($device, $new);
    $text = pamantau_telegram_render_template($tpl, $vars);
    $res = pamantau_telegram_send_message($token, $chatId, $text);
    if (!$res['ok']) {
        return ['sent' => false, 'kind' => $kind, 'error' => $res['error'] ?? 'Gagal kirim'];
    }
    return ['sent' => true, 'kind' => $kind];
}

/**
 * Send a test up/down message using current templates (sample device optional).
 *
 * @return array{ok:bool,error?:string,text?:string}
 */
function pamantau_telegram_test_transition(array $settings, string $kind, ?array $sampleDevice = null): array
{
    $settings = pamantau_normalize_settings($settings);
    $token = (string) ($settings['telegram_bot_token'] ?? '');
    $chatId = (string) ($settings['telegram_chat_id'] ?? '');
    if ($token === '' || $chatId === '') {
        return ['ok' => false, 'error' => 'Isi Bot Token dan Chat ID di Pengaturan Telegram'];
    }
    $kind = strtolower($kind) === 'down' ? 'down' : 'up';
    $device = is_array($sampleDevice) ? $sampleDevice : [
        'label' => 'Contoh-Router',
        'ip' => '192.168.1.1',
        'type' => 'router',
        'latency' => $kind === 'up' ? 12 : null,
        'status' => $kind === 'up' ? 'online' : 'offline',
    ];
    $tpl = $kind === 'up'
        ? (string) $settings['telegram_tpl_up']
        : (string) $settings['telegram_tpl_down'];
    $vars = pamantau_telegram_device_vars($device, $kind === 'up' ? 'online' : 'offline');
    $text = '[UJI] ' . pamantau_telegram_render_template($tpl, $vars);
    $res = pamantau_telegram_send_message($token, $chatId, $text);
    if (!$res['ok']) {
        return ['ok' => false, 'error' => $res['error'] ?? 'Gagal kirim'];
    }
    return ['ok' => true, 'text' => $text];
}
