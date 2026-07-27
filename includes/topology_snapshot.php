<?php
declare(strict_types=1);

/**
 * Server-side topology snapshot renderer (PHP GD).
 * Respects app settings used by the live canvas (theme → skin, show_*, grid, status colors).
 * Layout mirrors assets/js/app.js deviceMetrics / drawDevice* / deviceAnchorBox as closely as GD allows.
 * Typography uses bundled OFL TTF (Oxanium / Sora / JetBrains Mono) via imagettftext when FreeType is
 * available; falls back to imagestring bitmap fonts otherwise.
 */

/**
 * Device type catalog (mirrors TYPES in assets/js/app.js).
 *
 * @return array<string, array{label:string,short:string,color:string,icon:string,compact:bool}>
 */
function pamantau_device_type_catalog(): array
{
    static $catalog = null;
    if ($catalog !== null) {
        return $catalog;
    }
    $base = dirname(__DIR__) . '/assets/img/devices';
    $catalog = [
        'web' => ['label' => 'Web', 'short' => 'WEB', 'color' => '#6366f1', 'icon' => $base . '/web.png', 'compact' => false],
        'internet' => ['label' => 'Internet', 'short' => 'NET', 'color' => '#0ea5e9', 'icon' => $base . '/internet.png', 'compact' => false],
        'vpn' => ['label' => 'VPN', 'short' => 'VPN', 'color' => '#84cc16', 'icon' => $base . '/vpn.png', 'compact' => false],
        'server' => ['label' => 'Server', 'short' => 'SRV', 'color' => '#1a6aff', 'icon' => $base . '/server.png', 'compact' => false],
        'database' => ['label' => 'Database', 'short' => 'DB', 'color' => '#9333ea', 'icon' => $base . '/database.png', 'compact' => false],
        'loadbalance' => ['label' => 'Load Balance', 'short' => 'LB', 'color' => '#db2777', 'icon' => $base . '/loadbalance.png', 'compact' => false],
        'router' => ['label' => 'Router', 'short' => 'RTR', 'color' => '#ff8a1f', 'icon' => $base . '/router.png', 'compact' => false],
        'olt' => ['label' => 'OLT', 'short' => 'OLT', 'color' => '#12b5c9', 'icon' => $base . '/olt.png', 'compact' => false],
        'onu' => ['label' => 'ONU', 'short' => 'ONU', 'color' => '#16a34a', 'icon' => $base . '/onu.png', 'compact' => false],
        'printer' => ['label' => 'Printer', 'short' => 'PRT', 'color' => '#a16207', 'icon' => $base . '/printer.png', 'compact' => false],
        'client' => ['label' => 'Client', 'short' => 'CLI', 'color' => '#52525b', 'icon' => $base . '/client.png', 'compact' => false],
    ];
    return $catalog;
}

/**
 * @return array{label:string,short:string,color:string,icon:string,compact:bool}
 */
function pamantau_device_type_meta(?string $type): array
{
    $catalog = pamantau_device_type_catalog();
    $key = strtolower(trim((string) $type));
    return $catalog[$key] ?? $catalog['client'];
}

function pamantau_snapshot_is_compact(?string $type): bool
{
    return !empty(pamantau_device_type_meta($type)['compact']);
}

/** Theme → device skin (mirrors DEVICE_SKINS in app.js). */
function pamantau_snapshot_device_skin(string $theme): string
{
    return match ($theme) {
        'sand' => 'orbital',
        // Dark uses the same card chrome as Light (status tile + capsule + pills).
        'dark' => 'card',
        default => 'card',
    };
}

/**
 * Stage / chrome colors from CSS theme tokens (--stage-0, --canvas-dot approx, etc.).
 *
 * @return array{
 *   bg:array{0:int,1:int,2:int},
 *   grid:array{0:int,1:int,2:int},
 *   panel:array{0:int,1:int,2:int},
 *   ink:array{0:int,1:int,2:int},
 *   muted:array{0:int,1:int,2:int},
 *   faint:array{0:int,1:int,2:int},
 *   comment:array{0:int,1:int,2:int},
 *   titleBg:array{0:int,1:int,2:int},
 *   titleBorder:array{0:int,1:int,2:int},
 *   shadow:array{0:int,1:int,2:int},
 *   labelStroke:array{0:int,1:int,2:int},
 *   tileStroke:array{0:int,1:int,2:int},
 *   pillStroke:array{0:int,1:int,2:int}
 * }
 */
function pamantau_snapshot_theme_palette(string $theme): array
{
    return match ($theme) {
        'dark' => [
            'bg' => [6, 8, 12],
            'grid' => [22, 28, 40],
            'panel' => [12, 16, 24],
            'ink' => [220, 230, 245],
            'muted' => [132, 148, 171],
            'faint' => [94, 110, 132],
            'comment' => [94, 110, 132],
            'titleBg' => [12, 16, 24],
            'titleBorder' => [28, 40, 56],
            'shadow' => [0, 0, 0],
            'labelStroke' => [40, 52, 72],
            'tileStroke' => [200, 210, 225],
            'pillStroke' => [55, 65, 80],
        ],
        'sand' => [
            // Cool near-white gray stage (mirrors CSS --stage-0 / --stage-1).
            'bg' => [245, 246, 248],
            'grid' => [200, 204, 214],
            'panel' => [250, 251, 252],
            'ink' => [42, 34, 24],
            'muted' => [122, 106, 84],
            'faint' => [154, 136, 112],
            'comment' => [154, 136, 112],
            'titleBg' => [250, 251, 252],
            'titleBorder' => [197, 202, 211],
            'shadow' => [180, 186, 198],
            'labelStroke' => [197, 202, 211],
            'tileStroke' => [10, 10, 10],
            'pillStroke' => [40, 40, 40],
        ],
        default => [
            'bg' => [244, 246, 250],
            'grid' => [220, 228, 240],
            'panel' => [255, 255, 255],
            'ink' => [10, 22, 40],
            'muted' => [91, 107, 134],
            'faint' => [128, 144, 168],
            'comment' => [107, 124, 148],
            'titleBg' => [255, 255, 255],
            'titleBorder' => [197, 208, 224],
            'shadow' => [210, 218, 232],
            'labelStroke' => [210, 218, 230],
            'tileStroke' => [10, 10, 10],
            'pillStroke' => [40, 40, 40],
        ],
    };
}

/**
 * Localized PNG title strip / Telegram caption helpers.
 */
function pamantau_snapshot_title_text(array $settings, int $deviceCount): string
{
    $lang = ($settings['ui_language'] ?? 'id') === 'en' ? 'en' : 'id';
    $when = date('Y-m-d H:i:s');
    if ($lang === 'en') {
        return 'Pamantau - ' . $when . ' - ' . $deviceCount . ' devices';
    }
    return 'Pamantau - ' . $when . ' - ' . $deviceCount . ' perangkat';
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
 * Mix two hex colors — weight is share of $hexA (0–1). Mirrors app.js mixHexColor.
 *
 * @return array{0:int,1:int,2:int}
 */
function pamantau_mix_hex_rgb(string $hexA, string $hexB, float $weightA): array
{
    $a = pamantau_hex_to_rgb($hexA, [0, 0, 0]);
    $b = pamantau_hex_to_rgb($hexB, [255, 255, 255]);
    $w = max(0.0, min(1.0, $weightA));
    return [
        (int) round($a[0] * $w + $b[0] * (1 - $w)),
        (int) round($a[1] * $w + $b[1] * (1 - $w)),
        (int) round($a[2] * $w + $b[2] * (1 - $w)),
    ];
}

/**
 * Approximate hex + alpha over an opaque backdrop (JPG-safe).
 *
 * @return array{0:int,1:int,2:int}
 */
function pamantau_hex_alpha_over(string $hex, float $alpha, array $backdrop): array
{
    $fg = pamantau_hex_to_rgb($hex, [26, 106, 255]);
    $a = max(0.0, min(1.0, $alpha));
    return [
        (int) round($fg[0] * $a + $backdrop[0] * (1 - $a)),
        (int) round($fg[1] * $a + $backdrop[1] * (1 - $a)),
        (int) round($fg[2] * $a + $backdrop[2] * (1 - $a)),
    ];
}

function pamantau_snapshot_show(array $settings, string $key): bool
{
    // Match app.js showSetting: only explicit false hides.
    return ($settings[$key] ?? true) !== false;
}

/**
 * Visible text lines (order = draw order). Mirrors app.js deviceBodyLines.
 *
 * @return list<array{kind:string,text?:string}>
 */
function pamantau_snapshot_body_lines(array $d, array $settings): array
{
    $compact = pamantau_snapshot_is_compact(isset($d['type']) ? (string) $d['type'] : null);
    $lines = [];
    if (pamantau_snapshot_show($settings, 'show_label')) {
        $lines[] = ['kind' => 'label'];
    }
    if (pamantau_snapshot_show($settings, 'show_ip')) {
        $ip = trim((string) ($d['ip'] ?? ''));
        if (!$compact || $ip !== '') {
            $lines[] = ['kind' => 'ip'];
        }
    }
    if (pamantau_snapshot_show($settings, 'show_latency')) {
        $lines[] = ['kind' => 'latency'];
    }
    if (!$compact && pamantau_snapshot_show($settings, 'show_comment')) {
        $c = trim((string) ($d['comment'] ?? ''));
        if ($c !== '') {
            $lines[] = ['kind' => 'comment', 'text' => $c];
        }
    }
    if (!$compact && pamantau_snapshot_show($settings, 'show_services')) {
        $lines[] = ['kind' => 'services'];
    }
    return $lines;
}

function pamantau_snapshot_text_block_h(array $lines, int $labelStep, int $lineStep, bool $compact): int
{
    if ($lines === []) {
        return $compact ? 18 : 22;
    }
    $textH = 0;
    foreach ($lines as $line) {
        $textH += ($line['kind'] ?? '') === 'label' ? $labelStep : $lineStep;
    }
    return $textH;
}

function pamantau_snapshot_status_latency_label(array $d): string
{
    $status = strtolower((string) ($d['status'] ?? 'unknown'));
    if ($status === 'offline') {
        return 'Offline';
    }
    if ($status === 'online') {
        $lat = $d['latency'] ?? null;
        if ($lat !== null && $lat !== '' && is_numeric($lat)) {
            return 'Online - ' . (int) round((float) $lat) . 'ms';
        }
        return 'Online - —';
    }
    return '—';
}

function pamantau_snapshot_services_text(array $d): string
{
    $services = $d['services'] ?? null;
    if (is_array($services) && $services !== []) {
        $parts = [];
        foreach (array_slice($services, 0, 3) as $s) {
            $parts[] = (string) $s;
        }
        return implode(',', $parts);
    }
    return '—';
}

function pamantau_snapshot_status_text_ink(string $status, bool $dark): array
{
    $status = strtolower($status);
    if ($status === 'offline') {
        return $dark ? [255, 107, 126] : [196, 30, 58];
    }
    if ($status === 'online') {
        return $dark ? [57, 255, 20] : [21, 128, 61];
    }
    return $dark ? [96, 165, 250] : [29, 78, 216];
}

/**
 * Bundled OFL fonts (Oxanium / Sora / JetBrains Mono) — relative to project root.
 */
function pamantau_gd_fonts_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'fonts';
}

/**
 * True when FreeType + at least Oxanium-Bold are available.
 */
function pamantau_gd_ttf_ready(): bool
{
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }
    $ready = function_exists('imagettftext')
        && function_exists('imagettfbbox')
        && is_file(pamantau_gd_fonts_dir() . DIRECTORY_SEPARATOR . 'Oxanium-Bold.ttf');
    return $ready;
}

/**
 * Resolve a bundled TTF path, or null if missing.
 */
function pamantau_gd_font_file(string $key): ?string
{
    static $cache = [];
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    $map = [
        'oxanium-bold' => 'Oxanium-Bold.ttf',
        'sora-medium' => 'Sora-Medium.ttf',
        'sora-semibold' => 'Sora-SemiBold.ttf',
        'mono-medium' => 'JetBrainsMono-Medium.ttf',
        'mono-semibold' => 'JetBrainsMono-SemiBold.ttf',
        'mono-bold' => 'JetBrainsMono-Bold.ttf',
    ];
    $name = $map[$key] ?? null;
    if ($name === null) {
        $cache[$key] = null;
        return null;
    }
    $path = pamantau_gd_fonts_dir() . DIRECTORY_SEPARATOR . $name;
    $cache[$key] = is_file($path) ? $path : null;
    return $cache[$key];
}

/**
 * Canvas-matched typography for GD (TTF when available, else built-in font id).
 *
 * Roles mirror assets/js/app.js: label (Oxanium), meta/badge (JetBrains Mono), title (Sora).
 *
 * @return array{file:?string,size:float,gd:int,role:string}
 */
function pamantau_gd_typo(string $role, bool $compact = false, string $skin = 'card'): array
{
    $ttf = pamantau_gd_ttf_ready();
    $file = null;
    $size = 11.0;
    $gd = 2;

    switch ($role) {
        case 'label':
            // Card pills draw larger Oxanium than orbital/signet body labels.
            if ($skin === 'card') {
                $size = $compact ? 14.0 : 15.5;
                $gd = 4;
            } elseif ($skin === 'orbital') {
                $size = $compact ? 11.0 : 12.5;
                $gd = 3;
            } else {
                $size = $compact ? 11.0 : 12.0;
                $gd = 3;
            }
            $file = $ttf ? pamantau_gd_font_file('oxanium-bold') : null;
            break;
        case 'meta':
            $size = $compact ? 9.0 : 9.5;
            $gd = 2;
            $file = $ttf ? pamantau_gd_font_file('mono-medium') : null;
            break;
        case 'meta_lat':
            $size = $compact ? 9.0 : 9.5;
            $gd = 2;
            $file = $ttf ? pamantau_gd_font_file('mono-bold') : null;
            break;
        case 'badge':
            $size = $compact ? 9.0 : 10.4;
            $gd = 2;
            $file = $ttf ? pamantau_gd_font_file('mono-semibold') : null;
            break;
        case 'title':
            $size = 13.0;
            $gd = 3;
            $file = $ttf ? pamantau_gd_font_file('sora-semibold') : null;
            break;
        default:
            $size = 11.0;
            $gd = 2;
            $file = $ttf ? pamantau_gd_font_file('sora-medium') : null;
            break;
    }

    return [
        'file' => $file,
        'size' => $size,
        'gd' => $gd,
        'role' => $role,
    ];
}

/**
 * @return array{w:int,h:int,ascent:int,descent:int}
 */
function pamantau_gd_typo_metrics(string $text, array $typo): array
{
    $text = $text === '' ? ' ' : $text;
    $file = $typo['file'] ?? null;
    if (is_string($file) && $file !== '' && pamantau_gd_ttf_ready()) {
        $box = @imagettfbbox((float) $typo['size'], 0.0, $file, $text);
        if ($box !== false) {
            $xs = [$box[0], $box[2], $box[4], $box[6]];
            $ys = [$box[1], $box[3], $box[5], $box[7]];
            $minX = min($xs);
            $maxX = max($xs);
            $minY = min($ys);
            $maxY = max($ys);
            return [
                'w' => (int) max(1, (int) ceil($maxX - $minX)),
                'h' => (int) max(1, (int) ceil($maxY - $minY)),
                'ascent' => (int) max(1, (int) ceil(-$minY)),
                'descent' => (int) max(0, (int) ceil($maxY)),
            ];
        }
    }
    $gd = (int) ($typo['gd'] ?? 2);
    return [
        'w' => imagefontwidth($gd) * strlen($text),
        'h' => imagefontheight($gd),
        'ascent' => imagefontheight($gd),
        'descent' => 0,
    ];
}

function pamantau_gd_typo_width(string $text, array $typo): int
{
    return pamantau_gd_typo_metrics($text, $typo)['w'];
}

/**
 * Built-in GD font text width helper (legacy / fallback).
 */
function pamantau_gd_text_width(int $font, string $text): int
{
    return imagefontwidth($font) * strlen($text);
}

/**
 * Truncate to pixel width (canvas truncateToWidth). Uses "..." ellipsis.
 */
function pamantau_gd_fit_width(string $text, array $typo, int $maxW): string
{
    $text = pamantau_gd_plain_text($text);
    if ($text === '' || $maxW <= 0) {
        return $text;
    }
    if (pamantau_gd_typo_width($text, $typo) <= $maxW) {
        return $text;
    }
    $ellipsis = '...';
    $ew = pamantau_gd_typo_width($ellipsis, $typo);
    if ($ew >= $maxW) {
        return '.';
    }
    // Prefer mb_* when available so UTF-8 labels don't split mid-codepoint.
    $len = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    $lo = 0;
    $hi = $len;
    $best = '';
    while ($lo <= $hi) {
        $mid = intdiv($lo + $hi, 2);
        $slice = function_exists('mb_substr')
            ? mb_substr($text, 0, $mid, 'UTF-8')
            : substr($text, 0, $mid);
        $cand = $slice . $ellipsis;
        if (pamantau_gd_typo_width($cand, $typo) <= $maxW) {
            $best = $cand;
            $lo = $mid + 1;
        } else {
            $hi = $mid - 1;
        }
    }
    return $best !== '' ? $best : $ellipsis;
}

/**
 * Normalize text for GD: keep UTF-8 for TTF, ASCII-safe for imagestring fallback.
 */
function pamantau_gd_plain_text(string $text): string
{
    $text = str_replace(["\r", "\n", "\t"], ' ', $text);
    if (pamantau_gd_ttf_ready()) {
        return $text;
    }
    return preg_replace('/[^\x20-\x7E]/', '?', $text) ?? $text;
}

/**
 * Draw typography. $x/$y are top-left of the ink box unless $baseline is true
 * (then $y is FreeType baseline). Horizontal: left edge at $x.
 *
 * @param resource|\GdImage $im
 * @param array{0:int,1:int,2:int}|int $color RGB array or allocated color
 */
function pamantau_gd_draw_typo(
    mixed $im,
    string $text,
    int $x,
    int $y,
    array $typo,
    array|int $color,
    bool $baseline = false
): void {
    $text = pamantau_gd_plain_text($text);
    if ($text === '') {
        return;
    }
    $col = is_array($color) ? pamantau_gd_allocate($im, $color) : $color;
    $file = $typo['file'] ?? null;
    if (is_string($file) && $file !== '' && pamantau_gd_ttf_ready()) {
        $metrics = pamantau_gd_typo_metrics($text, $typo);
        $baseY = $baseline ? $y : ($y + $metrics['ascent']);
        @imagettftext($im, (float) $typo['size'], 0.0, $x, $baseY, $col, $file, $text);
        return;
    }
    $gd = (int) ($typo['gd'] ?? 2);
    $drawY = $baseline ? max(0, $y - imagefontheight($gd)) : $y;
    imagestring($im, $gd, $x, $drawY, pamantau_snapshot_short($text, 200), $col);
}

/**
 * Draw centered in a box (pill / badge) — mirrors canvas textBaseline middle.
 *
 * @param resource|\GdImage $im
 * @param array{0:int,1:int,2:int}|int $color
 */
function pamantau_gd_draw_typo_centered(
    mixed $im,
    string $text,
    int $boxX,
    int $boxY,
    int $boxW,
    int $boxH,
    array $typo,
    array|int $color
): void {
    $text = pamantau_gd_plain_text($text);
    if ($text === '') {
        return;
    }
    $m = pamantau_gd_typo_metrics($text, $typo);
    $tx = $boxX + (int) round(($boxW - $m['w']) / 2);
    // Canvas uses textBaseline middle with +0.5 optical nudge.
    $ty = $boxY + (int) round(($boxH - $m['h']) / 2) + 1;
    pamantau_gd_draw_typo($im, $text, max($boxX + 1, $tx), max($boxY, $ty), $typo, $color, false);
}

/**
 * Centered text with dark outline (latency on light/card — mirrors canvas strokeText).
 *
 * @param resource|\GdImage $im
 * @param array{0:int,1:int,2:int}|int $color
 */
function pamantau_gd_draw_typo_centered_stroked(
    mixed $im,
    string $text,
    int $boxX,
    int $boxY,
    int $boxW,
    int $boxH,
    array $typo,
    array|int $color,
    array $strokeRgb = [10, 10, 10]
): void {
    $text = pamantau_gd_plain_text($text);
    if ($text === '') {
        return;
    }
    $m = pamantau_gd_typo_metrics($text, $typo);
    $tx = $boxX + (int) round(($boxW - $m['w']) / 2);
    $ty = $boxY + (int) round(($boxH - $m['h']) / 2) + 1;
    $stroke = pamantau_gd_allocate($im, $strokeRgb);
    foreach ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as [$dx, $dy]) {
        pamantau_gd_draw_typo($im, $text, max($boxX, $tx + $dx), max($boxY, $ty + $dy), $typo, $stroke, false);
    }
    pamantau_gd_draw_typo($im, $text, max($boxX + 1, $tx), max($boxY, $ty), $typo, $color, false);
}

/**
 * Type capsule layout (JetBrains Mono badge — mirrors typeShortBadgeLayout).
 *
 * @return array{w:int,h:int,padX:int,padY:int,font:int,typo:array}
 */
function pamantau_snapshot_badge_layout(string $short, bool $compact): array
{
    $typo = pamantau_gd_typo('badge', $compact);
    $padX = $compact ? 6 : 7;
    $padY = $compact ? 3 : 3;
    $tw = pamantau_gd_typo_width($short, $typo);
    // Match canvas: h = fontSize + padY * 2
    $h = (int) max(1, (int) ceil((float) $typo['size'] + $padY * 2));
    return [
        'w' => (int) max(1, (int) ceil($tw + $padX * 2)),
        'h' => $h,
        'padX' => $padX,
        'padY' => $padY,
        'font' => (int) $typo['gd'],
        'typo' => $typo,
    ];
}

/**
 * Measure text need width for device sizing (TTF when available).
 */
function pamantau_snapshot_text_need(array $d, array $m, array $settings): int
{
    $skin = (string) ($m['skin'] ?? 'card');
    $need = 0;
    if ($skin === 'card') {
        $need = (int) ($m['tile'] ?? 0);
    } elseif (!empty($m['badge']['w'])) {
        $need = (int) $m['badge']['w'];
    }
    $meta = $m['meta'];
    $compact = !empty($m['compact']);
    $labelTypo = pamantau_gd_typo('label', $compact, $skin);
    $metaTypo = pamantau_gd_typo('meta', $compact, $skin);
    $latTypo = pamantau_gd_typo('meta_lat', $compact, $skin);

    if (pamantau_snapshot_show($settings, 'show_label')) {
        $raw = trim((string) ($d['label'] ?? ''));
        if ($raw === '') {
            $raw = (string) $meta['label'];
        }
        $need = max($need, pamantau_gd_typo_width(pamantau_gd_plain_text($raw), $labelTypo));
    }
    if (pamantau_snapshot_show($settings, 'show_ip')) {
        $ip = trim((string) ($d['ip'] ?? ''));
        if (!$compact || $ip !== '') {
            $need = max(
                $need,
                pamantau_gd_typo_width($ip !== '' ? pamantau_gd_plain_text($ip) : '—', $metaTypo)
            );
        }
    }
    if (pamantau_snapshot_show($settings, 'show_latency')) {
        $need = max(
            $need,
            pamantau_gd_typo_width(pamantau_snapshot_status_latency_label($d), $latTypo)
        );
    }
    if (!$compact && pamantau_snapshot_show($settings, 'show_comment')) {
        $c = trim((string) ($d['comment'] ?? ''));
        if ($c !== '') {
            $need = max($need, pamantau_gd_typo_width(pamantau_gd_plain_text($c), $metaTypo));
        }
    }
    if (!$compact && pamantau_snapshot_show($settings, 'show_services')) {
        $need = max(
            $need,
            pamantau_gd_typo_width(pamantau_snapshot_services_text($d), $metaTypo)
        );
    }
    return $need;
}

/**
 * Card metrics — mirrors app.js cardMetrics.
 *
 * @return array<string,mixed>
 */
function pamantau_snapshot_card_metrics(array $d, array $settings): array
{
    $meta = pamantau_device_type_meta(isset($d['type']) ? (string) $d['type'] : null);
    $compact = !empty($meta['compact']);
    $tile = $compact ? 56 : 72;
    $iconSize = $compact ? 28 : 36;
    $badge = pamantau_snapshot_badge_layout((string) $meta['short'], $compact);
    $capsuleGap = $compact ? 5 : 6;
    $labelGap = $compact ? 8 : 10;
    $lines = pamantau_snapshot_body_lines($d, $settings);
    $lineStep = $compact ? 15 : 16;
    $metaPillGap = $compact ? 3 : 4;
    $labelStep = $compact ? 20 : 22;
    $labelPadX = $compact ? 8 : 10;
    $labelPadY = $compact ? 6 : 7;
    $hasLabel = false;
    foreach ($lines as $line) {
        if (($line['kind'] ?? '') === 'label') {
            $hasLabel = true;
            break;
        }
    }
    $labelBoxH = $hasLabel ? $labelStep + $labelPadY : 0;
    $otherLines = array_values(array_filter($lines, static fn ($l) => ($l['kind'] ?? '') !== 'label'));
    $otherCount = count($otherLines);
    $otherH = $otherCount > 0
        ? ($otherCount * $lineStep) + (max(0, $otherCount - 1) * $metaPillGap)
        : 0;
    $metaGap = ($hasLabel && $otherLines !== []) ? ($compact ? 4 : 5) : 0;
    $textH = ($hasLabel ? $labelBoxH : 0) + $metaGap + $otherH;
    $stackH = $tile;
    $h = $stackH + ($textH > 0 ? $labelGap + $textH : 0);

    $m = [
        'skin' => 'card',
        'compact' => $compact,
        'meta' => $meta,
        'tile' => $tile,
        'iconSize' => $iconSize,
        'badge' => $badge,
        'capsuleGap' => $capsuleGap,
        'labelGap' => $labelGap,
        'labelPadX' => $labelPadX,
        'labelPadY' => $labelPadY,
        'labelBoxH' => $labelBoxH,
        'metaGap' => $metaGap,
        'metaPillGap' => $metaPillGap,
        'lines' => $lines,
        'otherLines' => $otherLines,
        'lineStep' => $lineStep,
        'labelStep' => $labelStep,
        'stackH' => $stackH,
        'textH' => $textH,
        'deviceH' => $h,
        'anchorW' => $tile,
        'anchorH' => $stackH,
        'radius' => $compact ? 14 : 16,
        'textLeft' => $labelPadX,
        'rightPad' => $labelPadX,
        'wMin' => $tile,
        'short' => (string) $meta['short'],
    ];
    $need = pamantau_snapshot_text_need($d, $m, $settings);
    $m['deviceW'] = (int) min(320, max($m['wMin'], (int) ceil($need + $m['textLeft'] + $m['rightPad'])));
    if ($m['deviceW'] < $tile) {
        $m['deviceW'] = $tile;
    }
    $rawLabel = trim((string) ($d['label'] ?? ''));
    if ($rawLabel === '') {
        $rawLabel = (string) $meta['label'];
    }
    // Fit label to pill budget (mirrors canvas truncateToWidth vs NODE_W_MAX).
    $labelTypo = pamantau_gd_typo('label', $compact, 'card');
    $maxLabelW = max(24, 320 - $labelPadX * 2);
    $m['label'] = pamantau_gd_fit_width($rawLabel, $labelTypo, $maxLabelW);
    return $m;
}

/**
 * Orbital metrics — mirrors app.js orbitalMetrics (Sand).
 *
 * @return array<string,mixed>
 */
function pamantau_snapshot_orbital_metrics(array $d, array $settings): array
{
    $meta = pamantau_device_type_meta(isset($d['type']) ? (string) $d['type'] : null);
    $compact = !empty($meta['compact']);
    $iconSize = $compact ? 20 : 26;
    $orbPad = $compact ? 7 : 9;
    $orbR = (int) round($iconSize / 2 + $orbPad);
    // Match app.js floats (ring stroke outer = orbR + ringGap + ringW).
    $ringGap = $compact ? 2.5 : 3.0;
    $ringW = $compact ? 2.75 : 3.25;
    $orbOuterR = (int) round($orbR + $ringGap + $ringW);
    $orbOuter = $orbOuterR * 2;
    $collarOverlap = $compact ? 11 : 13;
    $flagPadX = $compact ? 10 : 12;
    $flagPadY = $compact ? 7 : 9;
    $flagRadius = $compact ? 9 : 11;
    $badge = pamantau_snapshot_badge_layout((string) $meta['short'], $compact);
    $lines = pamantau_snapshot_body_lines($d, $settings);
    $lineStep = $compact ? 12 : 13;
    $labelStep = $compact ? 13 : 15;
    $flagInnerH = pamantau_snapshot_text_block_h($lines, $labelStep, $lineStep, $compact);
    $flagH = $flagInnerH + $flagPadY * 2;
    $badgeHang = (int) round($badge['h'] * 0.42);
    $h = max($orbOuter + $badgeHang, $flagH);
    // Match app.js: anchors use the FLAG PLATE (not AABB / not orb∪flag union).
    // Union AABB top-midpoint hangs above the plate when the orb is taller than the flag.
    $flagDrawH = min($flagH, $h);
    $flagTop = ($h - $flagDrawH) / 2.0;
    $flagLeft = $orbOuter - $collarOverlap;
    $textClear = $orbOuter + ($compact ? 3 : 4);
    $textInset = $orbOuter - $collarOverlap + $flagPadX;
    $textLeft = max($textClear, $textInset);

    $m = [
        'skin' => 'orbital',
        'compact' => $compact,
        'meta' => $meta,
        'iconSize' => $iconSize,
        'orbR' => $orbR,
        'ringGap' => $ringGap,
        'ringW' => $ringW,
        'orbOuterR' => $orbOuterR,
        'orbOuter' => $orbOuter,
        'collarOverlap' => $collarOverlap,
        'flagPadX' => $flagPadX,
        'flagPadY' => $flagPadY,
        'flagRadius' => $flagRadius,
        'badge' => $badge,
        'lines' => $lines,
        'lineStep' => $lineStep,
        'labelStep' => $labelStep,
        'flagInnerH' => $flagInnerH,
        'flagH' => $flagH,
        'deviceH' => $h,
        'anchorX' => $flagLeft,
        'anchorY' => $flagTop,
        'anchorH' => max(1, (int) round($flagDrawH)),
        'textLeft' => $textLeft,
        'rightPad' => $flagPadX,
        'wMin' => $compact ? 128 : 152,
        'short' => (string) $meta['short'],
    ];
    $need = pamantau_snapshot_text_need($d, $m, $settings);
    if ($need === 0 && !empty($m['badge'])) {
        $need = (int) $m['badge']['w'];
    }
    $m['deviceW'] = (int) min(320, max($m['wMin'], (int) ceil($need + $m['textLeft'] + $m['rightPad'])));
    $rawLabel = trim((string) ($d['label'] ?? ''));
    if ($rawLabel === '') {
        $rawLabel = (string) $meta['label'];
    }
    $labelTypo = pamantau_gd_typo('label', $compact, 'orbital');
    $m['label'] = pamantau_gd_fit_width(
        $rawLabel,
        $labelTypo,
        max(24, $m['deviceW'] - (int) $m['textLeft'] - (int) $m['flagPadX'])
    );
    return $m;
}

/**
 * Signet metrics — mirrors app.js signetMetrics (Dark).
 *
 * @return array<string,mixed>
 */
function pamantau_snapshot_signet_metrics(array $d, array $settings): array
{
    $meta = pamantau_device_type_meta(isset($d['type']) ? (string) $d['type'] : null);
    $compact = !empty($meta['compact']);
    $iconSize = $compact ? 22 : 30;
    $padX = $compact ? 8 : 10;
    $padY = $compact ? 8 : 9;
    $platePad = $compact ? 5 : 6;
    $gapIconText = $compact ? 8 : 10;
    $badge = pamantau_snapshot_badge_layout((string) $meta['short'], $compact);
    $badgeGap = $compact ? 3 : 4;
    $plateOuter = $iconSize + $platePad * 2;
    $iconColW = $plateOuter;
    $iconColH = $plateOuter + $badgeGap + $badge['h'];
    $lines = pamantau_snapshot_body_lines($d, $settings);
    $lineStep = $compact ? 12 : 13;
    $labelStep = $compact ? 13 : 14;
    $textH = pamantau_snapshot_text_block_h($lines, $labelStep, $lineStep, $compact);
    $contentH = max($iconColH, $textH);
    $h = $contentH + $padY * 2;
    $ledPad = $compact ? 14 : 18;
    $textLeft = $padX + $iconColW + $gapIconText;

    $m = [
        'skin' => 'signet',
        'compact' => $compact,
        'meta' => $meta,
        'iconSize' => $iconSize,
        'padX' => $padX,
        'padY' => $padY,
        'platePad' => $platePad,
        'plateOuter' => $plateOuter,
        'gapIconText' => $gapIconText,
        'badge' => $badge,
        'badgeGap' => $badgeGap,
        'iconColW' => $iconColW,
        'iconColH' => $iconColH,
        'lines' => $lines,
        'lineStep' => $lineStep,
        'labelStep' => $labelStep,
        'contentH' => $contentH,
        'deviceH' => $h,
        'radius' => $compact ? 4 : 4,
        'textLeft' => $textLeft,
        'rightPad' => $ledPad + $padX,
        'wMin' => $compact ? 114 : 138,
        'bracketLen' => $compact ? 7 : 9,
        'short' => (string) $meta['short'],
    ];
    $need = pamantau_snapshot_text_need($d, $m, $settings);
    if ($need === 0) {
        $need = (int) $badge['w'];
    }
    $m['deviceW'] = (int) min(320, max($m['wMin'], (int) ceil($need + $m['textLeft'] + $m['rightPad'])));
    $rawLabel = trim((string) ($d['label'] ?? ''));
    if ($rawLabel === '') {
        $rawLabel = (string) $meta['label'];
    }
    $labelTypo = pamantau_gd_typo('label', $compact, 'signet');
    $m['label'] = pamantau_gd_fit_width(
        $rawLabel,
        $labelTypo,
        max(24, $m['deviceW'] - (int) $m['textLeft'] - ($compact ? 14 : 18) - (int) $m['padX'])
    );
    return $m;
}

/**
 * @return array<string,mixed>
 */
function pamantau_snapshot_device_metrics(array $d, array $settings): array
{
    $skin = pamantau_snapshot_device_skin((string) ($settings['theme'] ?? 'light'));
    if ($skin === 'orbital') {
        return pamantau_snapshot_orbital_metrics($d, $settings);
    }
    if ($skin === 'signet') {
        return pamantau_snapshot_signet_metrics($d, $settings);
    }
    return pamantau_snapshot_card_metrics($d, $settings);
}

/**
 * Anchor/tile box — card centers tile; orbital uses flag plate (anchorX/Y/H);
 * signet uses full device AABB.
 *
 * @return array{x:float,y:float,w:int,h:int}
 */
function pamantau_snapshot_anchor_box(array $d, array $m): array
{
    $w = (int) $m['deviceW'];
    $x = (float) ($d['x'] ?? 0);
    $y = (float) ($d['y'] ?? 0);
    if (isset($m['anchorH'])) {
        $ay = (float) ($m['anchorY'] ?? 0);
        if (isset($m['anchorX'])) {
            $ax = (float) $m['anchorX'];
            $aw = isset($m['anchorW']) ? (int) $m['anchorW'] : max(1, (int) round($w - $ax));
        } else {
            $aw = (int) ($m['anchorW'] ?? $w);
            $ax = ($w - $aw) / 2.0;
        }
        return [
            'x' => $x + $ax,
            'y' => $y + $ay,
            'w' => $aw,
            'h' => (int) $m['anchorH'],
        ];
    }
    return [
        'x' => $x,
        'y' => $y,
        'w' => $w,
        'h' => (int) $m['deviceH'],
    ];
}

/**
 * Edge midpoint on the visual anchor chrome (mirrors app.js sidePoint).
 * Orbital left attaches to the orb ring outer, not the flag under-collar edge.
 *
 * @return array{x:float,y:float}
 */
function pamantau_snapshot_side_point(array $d, array $m, string $side): array
{
    $box = pamantau_snapshot_anchor_box($d, $m);
    $cx = $box['x'] + $box['w'] / 2.0;
    $cy = $box['y'] + $box['h'] / 2.0;
    $skin = (string) ($m['skin'] ?? '');
    switch ($side) {
        case 'top':
            return ['x' => $cx, 'y' => $box['y']];
        case 'right':
            return ['x' => $box['x'] + $box['w'], 'y' => $cy];
        case 'bottom':
            return ['x' => $cx, 'y' => $box['y'] + $box['h']];
        case 'left':
            if ($skin === 'orbital') {
                $x = (float) ($d['x'] ?? 0);
                $y = (float) ($d['y'] ?? 0);
                $h = (float) ($m['deviceH'] ?? $box['h']);
                return ['x' => $x, 'y' => $y + $h / 2.0];
            }
            return ['x' => $box['x'], 'y' => $cy];
        default:
            return ['x' => $cx, 'y' => $cy];
    }
}

/**
 * Pick connector sides between two anchor boxes (mirrors app.js pickAnchorSide).
 *
 * @return array{fromSide:string,toSide:string}
 */
function pamantau_snapshot_pick_anchor_side(array $aBox, array $bBox): array
{
    $acx = $aBox['x'] + $aBox['w'] / 2.0;
    $acy = $aBox['y'] + $aBox['h'] / 2.0;
    $bcx = $bBox['x'] + $bBox['w'] / 2.0;
    $bcy = $bBox['y'] + $bBox['h'] / 2.0;
    $dx = $bcx - $acx;
    $dy = $bcy - $acy;

    $overlapX = $aBox['x'] < $bBox['x'] + $bBox['w'] && $bBox['x'] < $aBox['x'] + $aBox['w'];
    $overlapY = $aBox['y'] < $bBox['y'] + $bBox['h'] && $bBox['y'] < $aBox['y'] + $aBox['h'];

    if ($overlapX && !$overlapY) {
        $axis = 'y';
    } elseif ($overlapY && !$overlapX) {
        $axis = 'x';
    } else {
        $axis = abs($dx) >= abs($dy) ? 'x' : 'y';
    }

    if ($axis === 'x') {
        return $dx >= 0
            ? ['fromSide' => 'right', 'toSide' => 'left']
            : ['fromSide' => 'left', 'toSide' => 'right'];
    }
    return $dy >= 0
        ? ['fromSide' => 'bottom', 'toSide' => 'top']
        : ['fromSide' => 'top', 'toSide' => 'bottom'];
}

/**
 * Full visual AABB for snapshot framing (metrics box + chrome that draws outside it).
 * Card: tile shadow / stroke and meta text that paints a few px past deviceH.
 * Orbital: status ring stroke + type badge hang.
 * Signet: drop shadow and corner brackets.
 *
 * @return array{x0:float,y0:float,x1:float,y1:float}
 */
function pamantau_snapshot_device_draw_extent(array $d, array $m): array
{
    $x = (float) ($d['x'] ?? 0);
    $y = (float) ($d['y'] ?? 0);
    $w = (float) $m['deviceW'];
    $h = (float) $m['deviceH'];
    $x0 = $x;
    $y0 = $y;
    $x1 = $x + $w;
    $y1 = $y + $h;
    $skin = (string) ($m['skin'] ?? 'card');

    if ($skin === 'card') {
        // Tile shadow sits at +2/+3; tile is centered in deviceW.
        $tile = (float) ($m['tile'] ?? $w);
        $tileRight = $x + ($w + $tile) / 2.0 + 2.0;
        $x1 = max($x1, $tileRight);
        // Pill stack is included in deviceH; add a small ink margin for TTF ascenders.
        $y1 = max($y1, $y + $h + 3.0);
        $x0 -= 2.0;
        $x1 += 2.0;
    } elseif ($skin === 'orbital') {
        // Ring stroke + badge half below orb center can kiss past metrics h.
        $x0 -= 2.0;
        $y0 -= 2.0;
        $x1 += 2.0;
        $y1 += 6.0;
    } else {
        // Signet drop shadow (+2,+3) and 2px status outline.
        $x0 -= 2.0;
        $y0 -= 2.0;
        $x1 += 4.0;
        $y1 += 5.0;
    }

    return ['x0' => $x0, 'y0' => $y0, 'x1' => $x1, 'y1' => $y1];
}

/**
 * @param resource|\GdImage $im
 */
function pamantau_gd_allocate(mixed $im, array $rgb): int
{
    $col = imagecolorallocate($im, $rgb[0], $rgb[1], $rgb[2]);
    return $col === false ? 0 : $col;
}

/**
 * Filled + stroked rounded rectangle (JPG-safe opaque colors).
 *
 * @param resource|\GdImage $im
 */
function pamantau_gd_round_rect(
    mixed $im,
    int $x,
    int $y,
    int $w,
    int $h,
    int $r,
    ?int $fill,
    ?int $stroke,
    int $strokeWidth = 1
): void {
    if ($w <= 0 || $h <= 0) {
        return;
    }
    $r = (int) max(0, min($r, intdiv($w, 2), intdiv($h, 2)));
    $x2 = $x + $w - 1;
    $y2 = $y + $h - 1;

    if ($fill !== null) {
        if ($r <= 0) {
            imagefilledrectangle($im, $x, $y, $x2, $y2, $fill);
        } else {
            imagefilledrectangle($im, $x + $r, $y, $x2 - $r, $y2, $fill);
            imagefilledrectangle($im, $x, $y + $r, $x2, $y2 - $r, $fill);
            imagefilledellipse($im, $x + $r, $y + $r, $r * 2, $r * 2, $fill);
            imagefilledellipse($im, $x2 - $r, $y + $r, $r * 2, $r * 2, $fill);
            imagefilledellipse($im, $x + $r, $y2 - $r, $r * 2, $r * 2, $fill);
            imagefilledellipse($im, $x2 - $r, $y2 - $r, $r * 2, $r * 2, $fill);
        }
    }

    if ($stroke !== null) {
        for ($i = 0; $i < max(1, $strokeWidth); $i++) {
            $sx = $x + $i;
            $sy = $y + $i;
            $sw = $w - $i * 2;
            $sh = $h - $i * 2;
            if ($sw <= 0 || $sh <= 0) {
                break;
            }
            $sr = max(0, $r - $i);
            $sx2 = $sx + $sw - 1;
            $sy2 = $sy + $sh - 1;
            if ($sr <= 0) {
                imagerectangle($im, $sx, $sy, $sx2, $sy2, $stroke);
                continue;
            }
            imageline($im, $sx + $sr, $sy, $sx2 - $sr, $sy, $stroke);
            imageline($im, $sx + $sr, $sy2, $sx2 - $sr, $sy2, $stroke);
            imageline($im, $sx, $sy + $sr, $sx, $sy2 - $sr, $stroke);
            imageline($im, $sx2, $sy + $sr, $sx2, $sy2 - $sr, $stroke);
            imagearc($im, $sx + $sr, $sy + $sr, $sr * 2, $sr * 2, 180, 270, $stroke);
            imagearc($im, $sx2 - $sr, $sy + $sr, $sr * 2, $sr * 2, 270, 360, $stroke);
            imagearc($im, $sx + $sr, $sy2 - $sr, $sr * 2, $sr * 2, 90, 180, $stroke);
            imagearc($im, $sx2 - $sr, $sy2 - $sr, $sr * 2, $sr * 2, 0, 90, $stroke);
        }
    }
}

/**
 * @param resource|\GdImage $im
 */
function pamantau_gd_filled_circle(mixed $im, int $cx, int $cy, int $r, int $fill): void
{
    if ($r <= 0) {
        return;
    }
    imagefilledellipse($im, $cx, $cy, $r * 2, $r * 2, $fill);
}

/**
 * @param resource|\GdImage $im
 */
function pamantau_gd_circle_stroke(mixed $im, int $cx, int $cy, int $r, int $stroke, int $width = 1): void
{
    if ($r <= 0) {
        return;
    }
    imagesetthickness($im, max(1, $width));
    imageellipse($im, $cx, $cy, $r * 2, $r * 2, $stroke);
    imagesetthickness($im, 1);
}

/**
 * HUD corner brackets (signet).
 *
 * @param resource|\GdImage $im
 */
function pamantau_gd_corner_brackets(
    mixed $im,
    int $x,
    int $y,
    int $w,
    int $h,
    int $len,
    int $color,
    int $lineW = 1
): void {
    imagesetthickness($im, max(1, $lineW));
    // TL
    imageline($im, $x, $y + $len, $x, $y, $color);
    imageline($im, $x, $y, $x + $len, $y, $color);
    // TR
    imageline($im, $x + $w - $len, $y, $x + $w, $y, $color);
    imageline($im, $x + $w, $y, $x + $w, $y + $len, $color);
    // BL
    imageline($im, $x, $y + $h - $len, $x, $y + $h, $color);
    imageline($im, $x, $y + $h, $x + $len, $y + $h, $color);
    // BR
    imageline($im, $x + $w - $len, $y + $h, $x + $w, $y + $h, $color);
    imageline($im, $x + $w, $y + $h, $x + $w, $y + $h - $len, $color);
    imagesetthickness($im, 1);
}

/**
 * Load device icon PNG (pre-rendered from SVG). Cached per request.
 *
 * @return resource|\GdImage|null
 */
function pamantau_snapshot_load_icon(string $type): mixed
{
    static $cache = [];
    $key = strtolower($type);
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    $meta = pamantau_device_type_meta($key);
    $path = (string) $meta['icon'];
    $img = null;
    if (is_file($path)) {
        $loaded = @imagecreatefrompng($path);
        if ($loaded !== false) {
            imagealphablending($loaded, true);
            imagesavealpha($loaded, true);
            $img = $loaded;
        }
    }
    $cache[$key] = $img;
    return $img;
}

/**
 * Draw device icon with optional white silhouette outline (card skin).
 *
 * @param resource|\GdImage $im
 */
function pamantau_snapshot_draw_icon(
    mixed $im,
    string $type,
    int $iconX,
    int $iconY,
    int $iconSize,
    array $toneRgb,
    bool $whiteOutline = true
): void {
    $icon = pamantau_snapshot_load_icon($type);
    if ($icon === null) {
        $tone = pamantau_gd_allocate($im, $toneRgb);
        $pad = max(3, (int) round($iconSize * 0.12));
        pamantau_gd_round_rect(
            $im,
            $iconX + $pad,
            $iconY + $pad,
            $iconSize - $pad * 2,
            $iconSize - $pad * 2,
            max(3, (int) round($iconSize * 0.18)),
            $tone,
            pamantau_gd_allocate($im, [255, 255, 255]),
            2
        );
        return;
    }

    $srcW = imagesx($icon);
    $srcH = imagesy($icon);

    if ($whiteOutline) {
        $sil = imagecreatetruecolor($iconSize, $iconSize);
        if ($sil !== false) {
            imagealphablending($sil, false);
            imagesavealpha($sil, true);
            $clear = imagecolorallocatealpha($sil, 0, 0, 0, 127);
            $white = imagecolorallocatealpha($sil, 255, 255, 255, 0);
            imagefilledrectangle($sil, 0, 0, $iconSize, $iconSize, $clear);
            imagealphablending($sil, true);
            imagecopyresampled($sil, $icon, 0, 0, 0, 0, $iconSize, $iconSize, $srcW, $srcH);

            imagealphablending($sil, false);
            for ($py = 0; $py < $iconSize; $py++) {
                for ($px = 0; $px < $iconSize; $px++) {
                    $c = imagecolorat($sil, $px, $py);
                    $a = ($c >> 24) & 0x7F;
                    imagesetpixel($sil, $px, $py, $a < 48 ? $white : $clear);
                }
            }
            imagealphablending($sil, true);

            $ow = 1;
            foreach ([[-$ow, 0], [$ow, 0], [0, -$ow], [0, $ow]] as [$dx, $dy]) {
                imagecopy($im, $sil, $iconX + $dx, $iconY + $dy, 0, 0, $iconSize, $iconSize);
            }
            imagedestroy($sil);
        }
    }

    imagealphablending($im, true);
    imagecopyresampled($im, $icon, $iconX, $iconY, 0, 0, $iconSize, $iconSize, $srcW, $srcH);
}

/**
 * Type short capsule.
 *
 * @param resource|\GdImage $im
 * @param array{w:int,h:int,font:int,typo?:array} $badge
 */
function pamantau_snapshot_draw_type_badge(
    mixed $im,
    int $leftX,
    int $centerY,
    string $short,
    string $tone,
    array $badge,
    string $skin,
    array $backdropRgb
): void {
    $w = (int) $badge['w'];
    $h = (int) $badge['h'];
    $typo = isset($badge['typo']) && is_array($badge['typo'])
        ? $badge['typo']
        : pamantau_gd_typo('badge', false);
    $y = $centerY - (int) round($h / 2);

    if ($skin === 'signet') {
        $bg = pamantau_hex_alpha_over($tone, 0.18, $backdropRgb);
        $border = pamantau_hex_alpha_over($tone, 0.5, $backdropRgb);
        $textRgb = pamantau_mix_hex_rgb($tone, '#ffffff', 0.5);
        $radius = 2;
        $backing = null;
    } elseif ($skin === 'orbital') {
        $bg = pamantau_hex_alpha_over($tone, 0.16, [255, 255, 255]);
        $border = pamantau_hex_alpha_over($tone, 0.45, [255, 255, 255]);
        $textRgb = pamantau_mix_hex_rgb($tone, '#0c1524', 0.55);
        $radius = (int) round($h / 2);
        $backing = [255, 255, 255];
    } else {
        $bg = pamantau_mix_hex_rgb($tone, '#ffffff', 0.12);
        $border = pamantau_mix_hex_rgb($tone, '#ffffff', 0.22);
        $textRgb = pamantau_mix_hex_rgb($tone, '#0a1628', 0.75);
        $radius = (int) round($h / 2);
        $backing = null;
    }

    if ($backing !== null) {
        pamantau_gd_round_rect(
            $im,
            $leftX,
            $y,
            $w,
            $h,
            $radius,
            pamantau_gd_allocate($im, $backing),
            null
        );
    }
    pamantau_gd_round_rect(
        $im,
        $leftX,
        $y,
        $w,
        $h,
        $radius,
        pamantau_gd_allocate($im, $bg),
        pamantau_gd_allocate($im, $border),
        1
    );
    pamantau_gd_draw_typo_centered($im, $short, $leftX, $y, $w, $h, $typo, $textRgb);
}

/**
 * Draw body text lines (orbital / signet — left aligned).
 *
 * @param resource|\GdImage $im
 * @param array<string,mixed> $m
 * @param array{ink:array,muted:array,faint:array,comment?:array} $pal
 */
function pamantau_snapshot_draw_body_text(
    mixed $im,
    array $d,
    array $m,
    int $textX,
    int $startY,
    int $contentH,
    int $maxMetaW,
    array $pal,
    array $statusTextColor
): void {
    $lines = $m['lines'] ?? [];
    $compact = !empty($m['compact']);
    $meta = $m['meta'];
    $skin = (string) ($m['skin'] ?? 'orbital');
    $labelStep = (int) $m['labelStep'];
    $lineStep = (int) $m['lineStep'];
    $textBlockH = pamantau_snapshot_text_block_h($lines, $labelStep, $lineStep, $compact);
    // Canvas drawDeviceBodyText: alphabetic baseline with +10/+11 first-line offset.
    $ty = $startY + max(0, (int) round(($contentH - $textBlockH) / 2)) + ($compact ? 10 : 11);

    $labelTypo = pamantau_gd_typo('label', $compact, $skin);
    $metaTypo = pamantau_gd_typo('meta', $compact, $skin);
    $latTypo = pamantau_gd_typo('meta_lat', $compact, $skin);
    $ipRaw = trim((string) ($d['ip'] ?? ''));
    $statusText = pamantau_snapshot_status_latency_label($d);

    foreach ($lines as $line) {
        $kind = $line['kind'] ?? '';
        if ($kind === 'label') {
            $raw = trim((string) ($d['label'] ?? ''));
            if ($raw === '') {
                $raw = (string) $meta['label'];
            }
            $text = pamantau_gd_fit_width($raw, $labelTypo, $maxMetaW);
            pamantau_gd_draw_typo($im, $text, $textX, $ty, $labelTypo, $pal['ink'], true);
            $ty += $labelStep;
        } elseif ($kind === 'ip') {
            $ipText = $ipRaw !== ''
                ? pamantau_gd_fit_width($ipRaw, $metaTypo, $maxMetaW)
                : '—';
            pamantau_gd_draw_typo($im, $ipText, $textX, $ty, $metaTypo, $pal['muted'], true);
            $ty += $lineStep;
        } elseif ($kind === 'latency') {
            $t = pamantau_gd_fit_width($statusText, $latTypo, $maxMetaW);
            pamantau_gd_draw_typo($im, $t, $textX, $ty, $latTypo, $statusTextColor, true);
            $ty += $lineStep;
        } elseif ($kind === 'comment') {
            $c = pamantau_gd_fit_width((string) ($line['text'] ?? ''), $metaTypo, $maxMetaW);
            pamantau_gd_draw_typo($im, $c, $textX, $ty, $metaTypo, $pal['faint'], true);
            $ty += $lineStep;
        } elseif ($kind === 'services') {
            $svc = pamantau_gd_fit_width(pamantau_snapshot_services_text($d), $metaTypo, $maxMetaW);
            pamantau_gd_draw_typo($im, $svc, $textX, $ty, $metaTypo, $pal['faint'], true);
            $ty += $lineStep;
        }
    }
}

/**
 * @param resource|\GdImage $im
 * @param array<string,mixed> $m
 * @param array{0:int,1:int,2:int} $statusRgb
 * @param array<string,array{0:int,1:int,2:int}> $themePal
 */
function pamantau_snapshot_draw_device_card(
    mixed $im,
    array $d,
    array $m,
    float $ox,
    float $oy,
    array $statusRgb,
    array $themePal
): void {
    $meta = $m['meta'];
    $compact = !empty($m['compact']);
    $tile = (int) $m['tile'];
    $iconSize = (int) $m['iconSize'];
    $deviceW = (int) $m['deviceW'];
    $dx = (float) ($d['x'] ?? 0);
    $dy = (float) ($d['y'] ?? 0);
    $tileX = (int) round($dx + $ox + ($deviceW - $tile) / 2.0);
    $tileY = (int) round($dy + $oy);
    $cx = (int) round($dx + $ox + $deviceW / 2.0);
    $statusCol = pamantau_gd_allocate($im, $statusRgb);
    $shadow = pamantau_gd_allocate($im, $themePal['shadow']);
    $tileStrokeRgb = $themePal['tileStroke'] ?? [10, 10, 10];
    $tileStroke = pamantau_gd_allocate($im, $tileStrokeRgb);

    pamantau_gd_round_rect($im, $tileX + 2, $tileY + 3, $tile, $tile, (int) $m['radius'], $shadow, null);
    pamantau_gd_round_rect($im, $tileX, $tileY, $tile, $tile, (int) $m['radius'], $statusCol, $tileStroke, 2);

    $badge = $m['badge'];
    $badgeW = (int) $badge['w'];
    $badgeH = (int) $badge['h'];
    $capsuleCenterY = $tileY + $tile - (int) $m['capsuleGap'] - (int) round($badgeH / 2);
    $iconAreaBottom = $capsuleCenterY - (int) round($badgeH / 2) - ($compact ? 4 : 5);
    $iconY = $tileY + max(
        $compact ? 6 : 8,
        (int) round(($iconAreaBottom - $tileY - $iconSize) / 2)
    );
    $iconX = $tileX + (int) round(($tile - $iconSize) / 2);
    $toneRgb = pamantau_hex_to_rgb((string) $meta['color'], [82, 82, 91]);
    pamantau_snapshot_draw_icon(
        $im,
        (string) ($d['type'] ?? 'client'),
        $iconX,
        $iconY,
        $iconSize,
        $toneRgb,
        true
    );
    pamantau_snapshot_draw_type_badge(
        $im,
        $tileX + (int) round(($tile - $badgeW) / 2),
        $capsuleCenterY,
        (string) $m['short'],
        (string) $meta['color'],
        $badge,
        'card',
        [255, 255, 255]
    );

    if (($m['lines'] ?? []) === []) {
        return;
    }

    // Card chrome (Light/Dark): white text on near-black pills (mirrors app.js drawDeviceCard).
    $pillBg = pamantau_gd_allocate($im, [10, 10, 10]);
    $pillStroke = pamantau_gd_allocate($im, $themePal['pillStroke'] ?? [40, 40, 40]);
    $pillInk = pamantau_gd_allocate($im, [255, 255, 255]);
    $ty = $tileY + $tile + (int) $m['labelGap'];
    $maxMetaW = max($tile, $deviceW - 4);
    $metaPadX = $compact ? 6 : 7;
    $metaPillGap = (int) ($m['metaPillGap'] ?? ($compact ? 3 : 4));
    $labelTypo = pamantau_gd_typo('label', $compact, 'card');
    $metaTypo = pamantau_gd_typo('meta', $compact, 'card');
    $latTypo = pamantau_gd_typo('meta_lat', $compact, 'card');

    $drawInvertedPill = static function (
        mixed $im,
        int $cx,
        int $ty,
        string $text,
        array $typo,
        int $boxH,
        int $padX,
        mixed $pillBg,
        mixed $pillStroke,
        mixed $pillInk
    ): int {
        $tw = pamantau_gd_typo_width($text, $typo);
        $labelW = max($tw + $padX * 2, 24);
        $boxX = $cx - (int) round($labelW / 2);
        pamantau_gd_round_rect($im, $boxX, $ty, $labelW, $boxH, (int) round($boxH / 2), $pillBg, $pillStroke, 1);
        pamantau_gd_draw_typo_centered($im, $text, $boxX, $ty, $labelW, $boxH, $typo, $pillInk);
        return $boxH;
    };

    if (pamantau_snapshot_show_from_lines($m['lines'], 'label')) {
        $label = (string) $m['label'];
        $ty += $drawInvertedPill(
            $im,
            $cx,
            $ty,
            $label,
            $labelTypo,
            (int) $m['labelBoxH'],
            (int) $m['labelPadX'],
            $pillBg,
            $pillStroke,
            $pillInk
        ) + (int) $m['metaGap'];
    }

    $ipRaw = trim((string) ($d['ip'] ?? ''));
    $statusText = pamantau_snapshot_status_latency_label($d);
    $otherLines = $m['otherLines'] ?? [];
    $otherCount = count($otherLines);
    foreach ($otherLines as $idx => $line) {
        $kind = $line['kind'] ?? '';
        $boxH = (int) $m['lineStep'];
        if ($kind === 'ip') {
            $budget = max(8, $maxMetaW - $metaPadX * 2);
            $text = $ipRaw !== '' ? pamantau_gd_fit_width($ipRaw, $metaTypo, $budget) : '—';
            $drawInvertedPill($im, $cx, $ty, $text, $metaTypo, $boxH, $metaPadX, $pillBg, $pillStroke, $pillInk);
        } elseif ($kind === 'latency') {
            $text = pamantau_gd_fit_width($statusText, $latTypo, $maxMetaW);
            pamantau_gd_draw_typo_centered_stroked(
                $im,
                $text,
                $cx - (int) round(max($maxMetaW, pamantau_gd_typo_width($text, $latTypo)) / 2),
                $ty,
                max($maxMetaW, pamantau_gd_typo_width($text, $latTypo)),
                $boxH,
                $latTypo,
                $statusRgb
            );
        } elseif ($kind === 'comment') {
            $budget = max(8, $maxMetaW - $metaPadX * 2);
            $text = pamantau_gd_fit_width((string) ($line['text'] ?? ''), $metaTypo, $budget);
            $drawInvertedPill($im, $cx, $ty, $text, $metaTypo, $boxH, $metaPadX, $pillBg, $pillStroke, $pillInk);
        } elseif ($kind === 'services') {
            $budget = max(8, $maxMetaW - $metaPadX * 2);
            $text = pamantau_gd_fit_width(pamantau_snapshot_services_text($d), $metaTypo, $budget);
            $drawInvertedPill($im, $cx, $ty, $text, $metaTypo, $boxH, $metaPadX, $pillBg, $pillStroke, $pillInk);
        } else {
            continue;
        }
        $ty += $boxH + ($idx < $otherCount - 1 ? $metaPillGap : 0);
    }
}

function pamantau_snapshot_show_from_lines(array $lines, string $kind): bool
{
    foreach ($lines as $line) {
        if (($line['kind'] ?? '') === $kind) {
            return true;
        }
    }
    return false;
}

/**
 * @param resource|\GdImage $im
 * @param array<string,mixed> $m
 * @param array{0:int,1:int,2:int} $statusRgb
 * @param array<string,array{0:int,1:int,2:int}> $themePal
 */
function pamantau_snapshot_draw_device_orbital(
    mixed $im,
    array $d,
    array $m,
    float $ox,
    float $oy,
    array $statusRgb,
    array $themePal
): void {
    $meta = $m['meta'];
    $compact = !empty($m['compact']);
    $x = (int) round((float) ($d['x'] ?? 0) + $ox);
    $y = (int) round((float) ($d['y'] ?? 0) + $oy);
    $w = (int) $m['deviceW'];
    $h = (int) $m['deviceH'];
    $tone = (string) $meta['color'];
    $orbCx = $x + (int) $m['orbOuterR'];
    $orbCy = $y + (int) round($h / 2);
    $flagX = $x + (int) $m['orbOuter'] - (int) $m['collarOverlap'];
    $flagW = $w - ((int) $m['orbOuter'] - (int) $m['collarOverlap']);
    $flagH = min((int) $m['flagH'], $h);
    $flagY = $y + (int) round(($h - $flagH) / 2);
    $flagR = (int) $m['flagRadius'];
    $orbR = (int) $m['orbR'];

    // Flag plate
    pamantau_gd_round_rect(
        $im,
        $flagX,
        $flagY,
        $flagW,
        $flagH,
        $flagR,
        pamantau_gd_allocate($im, [255, 246, 230]),
        pamantau_gd_allocate($im, [200, 184, 160]),
        1
    );
    // Status outline on flag
    pamantau_gd_round_rect(
        $im,
        $flagX,
        $flagY,
        $flagW,
        $flagH,
        $flagR,
        null,
        pamantau_gd_allocate($im, $statusRgb),
        $compact ? 2 : 2
    );

    // Collar bridge
    $collarW = (int) $m['collarOverlap'] + ($compact ? 4 : 6);
    $collarH = min((int) round($flagH * 0.55), $compact ? 22 : 28);
    $collarX = $orbCx + (int) round($orbR * 0.28);
    $collarY = $orbCy - (int) round($collarH / 2);
    pamantau_gd_round_rect(
        $im,
        $collarX,
        $collarY,
        $collarW,
        $collarH,
        (int) round($collarH / 2),
        pamantau_gd_allocate($im, [236, 220, 196]),
        null
    );

    // Orb core
    pamantau_gd_filled_circle($im, $orbCx, $orbCy, $orbR, pamantau_gd_allocate($im, [255, 240, 220]));
    pamantau_gd_circle_stroke($im, $orbCx, $orbCy, $orbR - 1, pamantau_gd_allocate($im, pamantau_hex_alpha_over($tone, 0.62, [255, 240, 220])), 2);
    pamantau_gd_circle_stroke($im, $orbCx, $orbCy, $orbR, pamantau_gd_allocate($im, [160, 140, 110]), 1);

    // Status orbit ring
    // Status orbit ring (stroke centered; outer edge ≈ orbOuterR)
    $orbitR = $orbR + (int) round((float) $m['ringGap'] + (float) $m['ringW'] / 2.0);
    pamantau_gd_circle_stroke(
        $im,
        $orbCx,
        $orbCy,
        $orbitR,
        pamantau_gd_allocate($im, $statusRgb),
        max(1, (int) round((float) $m['ringW']))
    );

    $iconSize = (int) $m['iconSize'];
    pamantau_snapshot_draw_icon(
        $im,
        (string) ($d['type'] ?? 'client'),
        $orbCx - (int) round($iconSize / 2),
        $orbCy - (int) round($iconSize / 2),
        $iconSize,
        pamantau_hex_to_rgb($tone, [82, 82, 91]),
        false
    );

    $badge = $m['badge'];
    pamantau_snapshot_draw_type_badge(
        $im,
        $orbCx - (int) round((int) $badge['w'] / 2),
        $orbCy + $orbR - 1,
        (string) $m['short'],
        $tone,
        $badge,
        'orbital',
        [255, 246, 230]
    );

    pamantau_snapshot_draw_body_text(
        $im,
        $d,
        $m,
        $x + (int) $m['textLeft'],
        $flagY + (int) $m['flagPadY'],
        (int) $m['flagInnerH'],
        max(24, $w - (int) $m['textLeft'] - (int) $m['flagPadX']),
        [
            'ink' => $themePal['ink'],
            'muted' => $themePal['muted'],
            'faint' => $themePal['faint'],
        ],
        pamantau_snapshot_status_text_ink(strtolower((string) ($d['status'] ?? 'unknown')), false)
    );
}

/**
 * @param resource|\GdImage $im
 * @param array<string,mixed> $m
 * @param array{0:int,1:int,2:int} $statusRgb
 * @param array<string,array{0:int,1:int,2:int}> $themePal
 */
function pamantau_snapshot_draw_device_signet(
    mixed $im,
    array $d,
    array $m,
    float $ox,
    float $oy,
    array $statusRgb,
    array $themePal
): void {
    $meta = $m['meta'];
    $compact = !empty($m['compact']);
    $x = (int) round((float) ($d['x'] ?? 0) + $ox);
    $y = (int) round((float) ($d['y'] ?? 0) + $oy);
    $w = (int) $m['deviceW'];
    $h = (int) $m['deviceH'];
    $radius = (int) $m['radius'];
    $tone = (string) $meta['color'];
    $body0 = [6, 9, 14];
    $body1 = [12, 18, 26];

    pamantau_gd_round_rect(
        $im,
        $x + 2,
        $y + 3,
        $w,
        $h,
        $radius,
        pamantau_gd_allocate($im, [0, 0, 0]),
        null
    );
    pamantau_gd_round_rect(
        $im,
        $x,
        $y,
        $w,
        $h,
        $radius,
        pamantau_gd_allocate($im, $body1),
        null
    );
    // Top half slightly lighter
    pamantau_gd_round_rect(
        $im,
        $x,
        $y,
        $w,
        max(4, (int) round($h * 0.45)),
        $radius,
        pamantau_gd_allocate($im, $body0),
        null
    );
    // Type rim
    $rim = pamantau_hex_alpha_over($tone, 0.38, $body1);
    pamantau_gd_round_rect(
        $im,
        $x + 1,
        $y + 1,
        $w - 2,
        $h - 2,
        max(1, $radius - 1),
        null,
        pamantau_gd_allocate($im, $rim),
        1
    );
    // Status outline
    pamantau_gd_round_rect(
        $im,
        $x,
        $y,
        $w,
        $h,
        $radius,
        null,
        pamantau_gd_allocate($im, $statusRgb),
        $compact ? 2 : 2
    );

    // Accent line
    $accentY = $y + ($compact ? 4 : 5);
    $accentInset = $compact ? 10 : 12;
    $accent = pamantau_hex_alpha_over($tone, 0.65, $body1);
    imageline($im, $x + $accentInset, $accentY, $x + $w - $accentInset, $accentY, pamantau_gd_allocate($im, $accent));

    pamantau_gd_corner_brackets(
        $im,
        $x + 3,
        $y + 3,
        $w - 6,
        $h - 6,
        (int) $m['bracketLen'],
        pamantau_gd_allocate($im, pamantau_hex_alpha_over($tone, 0.48, $body1)),
        1
    );

    // Glyph plate
    $plateOuter = (int) $m['plateOuter'];
    $plateX = $x + (int) $m['padX'];
    $plateY = $y + (int) round(($h - ($plateOuter + (int) $m['badgeGap'] + (int) $m['badge']['h'])) / 2);
    $plateR = $compact ? 3 : 4;
    pamantau_gd_round_rect(
        $im,
        $plateX,
        $plateY,
        $plateOuter,
        $plateOuter,
        $plateR,
        pamantau_gd_allocate($im, [16, 24, 32]),
        pamantau_gd_allocate($im, pamantau_hex_alpha_over($tone, 0.5, [16, 24, 32])),
        2
    );
    $iconSize = (int) $m['iconSize'];
    $iconX = $plateX + (int) $m['platePad'];
    $iconY = $plateY + (int) $m['platePad'];
    pamantau_snapshot_draw_icon(
        $im,
        (string) ($d['type'] ?? 'client'),
        $iconX,
        $iconY,
        $iconSize,
        pamantau_hex_to_rgb($tone, [82, 82, 91]),
        false
    );
    pamantau_snapshot_draw_type_badge(
        $im,
        $plateX + (int) round(($plateOuter - (int) $m['badge']['w']) / 2),
        $plateY + $plateOuter + (int) $m['badgeGap'] + (int) round((int) $m['badge']['h'] / 2),
        (string) $m['short'],
        $tone,
        $m['badge'],
        'signet',
        [12, 18, 26]
    );

    // Status LED
    $pipX = $x + $w - ($compact ? 10 : 12);
    $pipY = $y + ($compact ? 11 : 13);
    $pipR = $compact ? 3 : 4;
    pamantau_gd_filled_circle($im, $pipX, $pipY, $pipR + 2, pamantau_gd_allocate($im, [0, 0, 0]));
    pamantau_gd_filled_circle($im, $pipX, $pipY, $pipR, pamantau_gd_allocate($im, $statusRgb));

    pamantau_snapshot_draw_body_text(
        $im,
        $d,
        $m,
        $x + (int) $m['textLeft'],
        $y + (int) $m['padY'],
        (int) $m['contentH'],
        max(24, $w - (int) $m['textLeft'] - ($compact ? 14 : 18) - (int) $m['padX']),
        [
            'ink' => $themePal['ink'],
            'muted' => $themePal['muted'],
            'faint' => $themePal['faint'],
        ],
        pamantau_snapshot_status_text_ink(strtolower((string) ($d['status'] ?? 'unknown')), true)
    );
}

/**
 * @param list<array> $devices
 * @param list<array> $connections
 * @param array $settings
 * @return array{ok:bool,error?:string,binary?:string,mime?:string,filename?:string,width?:int,height?:int}
 */
function pamantau_render_topology_snapshot(
    array $devices,
    array $connections,
    array $settings = [],
    string $format = 'png'
): array {
    if (!function_exists('imagecreatetruecolor')) {
        return ['ok' => false, 'error' => 'Ekstensi PHP GD tidak tersedia'];
    }

    // Apache defaults (often 30s / 128M) are tight for large topologies + Telegram upload.
    @set_time_limit(120);
    $mem = (string) ini_get('memory_limit');
    if ($mem !== '' && $mem !== '-1') {
        $bytes = pamantau_ini_bytes($mem);
        // Higher canvas caps need more headroom for truecolor buffers + encode.
        if ($bytes > 0 && $bytes < 384 * 1048576) {
            @ini_set('memory_limit', '384M');
        }
    }

    $settings = pamantau_normalize_settings($settings);
    $format = strtolower($format) === 'jpg' || strtolower($format) === 'jpeg' ? 'jpg' : 'png';
    $theme = (string) ($settings['theme'] ?? 'light');
    $skin = pamantau_snapshot_device_skin($theme);
    $themePal = pamantau_snapshot_theme_palette($theme);

    $onlineColor = pamantau_hex_to_rgb((string) ($settings['status_online_color'] ?? '#39ff14'), [57, 255, 20]);
    $offlineColor = pamantau_hex_to_rgb((string) ($settings['status_offline_color'] ?? '#ff3b5c'), [255, 59, 92]);
    $unknownColor = pamantau_hex_to_rgb((string) ($settings['status_unknown_color'] ?? '#8090a8'), [128, 144, 168]);
    $linkCatalog = pamantau_link_type_catalog();

    // Framing: full visual AABB → padded content buffer → center below title → scale-to-fit.
    // Caps keep Telegram sendPhoto reliable (~10MB) while preserving crisp labels/icons.
    $pad = 64;
    $titleH = 28;
    $maxW = 3600;
    $maxH = 2700;
    $minW = 640;
    $minH = 400;

    $minX = null;
    $minY = null;
    $maxX = null;
    $maxY = null;

    $cleanDevices = [];
    $metricsById = [];
    foreach ($devices as $d) {
        if (!is_array($d) || empty($d['id'])) {
            continue;
        }
        $m = pamantau_snapshot_device_metrics($d, $settings);
        $cleanDevices[] = $d;
        $metricsById[(string) $d['id']] = $m;
        $ext = pamantau_snapshot_device_draw_extent($d, $m);
        $minX = $minX === null ? $ext['x0'] : min($minX, $ext['x0']);
        $minY = $minY === null ? $ext['y0'] : min($minY, $ext['y0']);
        $maxX = $maxX === null ? $ext['x1'] : max($maxX, $ext['x1']);
        $maxY = $maxY === null ? $ext['y1'] : max($maxY, $ext['y1']);
    }

    if ($cleanDevices === []) {
        $minX = 0.0;
        $minY = 0.0;
        $maxX = 400.0;
        $maxY = 240.0;
    }

    $contentW = max(1.0, (float) $maxX - (float) $minX);
    $contentH = max(1.0, (float) $maxY - (float) $minY);

    // Natural content buffer (no title). Ceil so rounding never shrinks a side.
    $srcW = (int) max(1, (int) ceil($contentW + $pad * 2));
    $srcH = (int) max(1, (int) ceil($contentH + $pad * 2));

    // Fit into max canvas under the title strip; bump to mins when topology is small.
    // floor(dest) so resampled blit never claims more pixels than the canvas allows.
    $maxContentH = max(1, $maxH - $titleH);
    $scale = min(1.0, $maxW / $srcW, $maxContentH / $srcH);
    $dstContentW = (int) max(1, (int) floor($srcW * $scale));
    $dstContentH = (int) max(1, (int) floor($srcH * $scale));

    $width = (int) min($maxW, max($minW, $dstContentW));
    $height = (int) min($maxH, max($minH, $dstContentH + $titleH));

    // Center scaled content in the drawable area below the title.
    $availW = $width;
    $availH = max(1, $height - $titleH);
    $destX = (int) floor(($availW - $dstContentW) / 2.0);
    $destY = $titleH + (int) floor(($availH - $dstContentH) / 2.0);

    $im = imagecreatetruecolor($srcW, $srcH);
    if ($im === false) {
        return ['ok' => false, 'error' => 'Gagal membuat kanvas'];
    }
    imagealphablending($im, true);
    imagesavealpha($im, true);

    $bg = pamantau_gd_allocate($im, $themePal['bg']);
    $gridCol = pamantau_gd_allocate($im, $themePal['grid']);
    $lineDefault = pamantau_gd_allocate($im, [225, 29, 72]);
    imagefilledrectangle($im, 0, 0, $srcW, $srcH, $bg);

    if (!empty($settings['show_grid'])) {
        $gridStep = min(64, max(8, (int) ($settings['grid_size'] ?? 12)));
        for ($gx = 0; $gx < $srcW; $gx += $gridStep) {
            imageline($im, $gx, 0, $gx, $srcH, $gridCol);
        }
        for ($gy = 0; $gy < $srcH; $gy += $gridStep) {
            imageline($im, 0, $gy, $srcW, $gy, $gridCol);
        }
    }

    // Place world AABB with equal pad on all sides of the content buffer.
    $ox = $pad - (float) $minX;
    $oy = $pad - (float) $minY;

    $byId = [];
    foreach ($cleanDevices as $d) {
        $byId[(string) $d['id']] = $d;
    }

    // Links → edge midpoints on visual chrome (flag plate / tile / body)
    imagesetthickness($im, 2);
    foreach ($connections as $conn) {
        if (!is_array($conn)) {
            continue;
        }
        $from = (string) ($conn['from'] ?? '');
        $to = (string) ($conn['to'] ?? '');
        if (!isset($byId[$from], $byId[$to], $metricsById[$from], $metricsById[$to])) {
            continue;
        }
        $aBox = pamantau_snapshot_anchor_box($byId[$from], $metricsById[$from]);
        $bBox = pamantau_snapshot_anchor_box($byId[$to], $metricsById[$to]);
        $sides = pamantau_snapshot_pick_anchor_side($aBox, $bBox);
        $aPt = pamantau_snapshot_side_point($byId[$from], $metricsById[$from], $sides['fromSide']);
        $bPt = pamantau_snapshot_side_point($byId[$to], $metricsById[$to], $sides['toSide']);
        $x1 = (int) round($aPt['x'] + $ox);
        $y1 = (int) round($aPt['y'] + $oy);
        $x2 = (int) round($bPt['x'] + $ox);
        $y2 = (int) round($bPt['y'] + $oy);
        $lt = pamantau_normalize_link_type($conn['link_type'] ?? null);
        $hex = $linkCatalog[$lt]['color'] ?? '#e11d48';
        $rgb = pamantau_hex_to_rgb($hex, [225, 29, 72]);
        $col = pamantau_gd_allocate($im, $rgb);
        imageline($im, $x1, $y1, $x2, $y2, $col ?: $lineDefault);
    }
    imagesetthickness($im, 1);

    foreach ($cleanDevices as $d) {
        $id = (string) $d['id'];
        $m = $metricsById[$id];
        $status = strtolower((string) ($d['status'] ?? 'unknown'));
        $rgb = $unknownColor;
        if ($status === 'online') {
            $rgb = $onlineColor;
        } elseif ($status === 'offline') {
            $rgb = $offlineColor;
        }

        if ($skin === 'orbital') {
            pamantau_snapshot_draw_device_orbital($im, $d, $m, $ox, $oy, $rgb, $themePal);
        } elseif ($skin === 'signet') {
            pamantau_snapshot_draw_device_signet($im, $d, $m, $ox, $oy, $rgb, $themePal);
        } else {
            pamantau_snapshot_draw_device_card($im, $d, $m, $ox, $oy, $rgb, $themePal);
        }
    }

    // Composite onto final canvas (min size / aspect centering / scale-to-fit).
    $out = imagecreatetruecolor($width, $height);
    if ($out === false) {
        imagedestroy($im);
        return ['ok' => false, 'error' => 'Gagal membuat kanvas'];
    }
    imagealphablending($out, true);
    imagesavealpha($out, true);
    $outBg = pamantau_gd_allocate($out, $themePal['bg']);
    $titleBg = pamantau_gd_allocate($out, $themePal['titleBg']);
    $titleBorder = pamantau_gd_allocate($out, $themePal['titleBorder']);
    imagefilledrectangle($out, 0, 0, $width, $height, $outBg);

    if ($dstContentW === $srcW && $dstContentH === $srcH) {
        imagecopy($out, $im, $destX, $destY, 0, 0, $srcW, $srcH);
    } else {
        imagecopyresampled(
            $out,
            $im,
            $destX,
            $destY,
            0,
            0,
            $dstContentW,
            $dstContentH,
            $srcW,
            $srcH
        );
    }
    imagedestroy($im);

    // Title strip — reserved above content (drawn last so it never covers devices).
    imagefilledrectangle($out, 0, 0, $width, $titleH, $titleBg);
    imageline($out, 0, $titleH, $width, $titleH, $titleBorder);
    $title = pamantau_snapshot_title_text($settings, count($cleanDevices));
    $titleTypo = pamantau_gd_typo('title');
    $titleSafe = pamantau_gd_fit_width($title, $titleTypo, max(40, $width - 24));
    $titleMetrics = pamantau_gd_typo_metrics($titleSafe, $titleTypo);
    $titleTop = (int) round(($titleH - $titleMetrics['h']) / 2);
    pamantau_gd_draw_typo($out, $titleSafe, 12, max(2, $titleTop), $titleTypo, $themePal['ink']);

    ob_start();
    if ($format === 'jpg') {
        // High quality for Telegram photos (matches client export ~0.92).
        imagejpeg($out, null, 92);
        $mime = 'image/jpeg';
        $filename = 'pamantau-topology.jpg';
    } else {
        // PNG is lossless; lower level = larger/faster. Sharpness comes from resolution.
        imagepng($out, null, 4);
        $mime = 'image/png';
        $filename = 'pamantau-topology.png';
    }
    $binary = ob_get_clean();

    // Telegram sendPhoto ~10MB; if PNG balloons, fall back to high-quality JPEG.
    if (
        $format === 'png'
        && is_string($binary)
        && $binary !== ''
        && strlen($binary) > 9 * 1048576
    ) {
        ob_start();
        imagejpeg($out, null, 92);
        $jpgBinary = ob_get_clean();
        if (is_string($jpgBinary) && $jpgBinary !== '') {
            $binary = $jpgBinary;
            $mime = 'image/jpeg';
            $filename = 'pamantau-topology.jpg';
        }
    }

    imagedestroy($out);

    if ($binary === false || $binary === '') {
        return ['ok' => false, 'error' => 'Gagal encode gambar'];
    }

    return [
        'ok' => true,
        'binary' => $binary,
        'mime' => $mime,
        'filename' => $filename,
        'width' => $width,
        'height' => $height,
    ];
}

/**
 * @return array{0:int,1:int,2:int}
 */
function pamantau_hex_to_rgb(string $hex, array $fallback): array
{
    $hex = pamantau_normalize_hex_color($hex, '');
    if ($hex === '' || !preg_match('/^#([0-9a-f]{6})$/', $hex, $m)) {
        return [$fallback[0], $fallback[1], $fallback[2]];
    }
    $h = $m[1];
    return [hexdec(substr($h, 0, 2)), hexdec(substr($h, 2, 2)), hexdec(substr($h, 4, 2))];
}

function pamantau_snapshot_short(string $text, int $max): string
{
    // Prefer UTF-8 when TTF is available; ASCII-scrub only for imagestring fallback.
    if (!pamantau_gd_ttf_ready()) {
        $text = preg_replace('/[^\x20-\x7E]/', '?', $text) ?? $text;
    }
    $len = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    if ($len <= $max) {
        return $text;
    }
    $slice = function_exists('mb_substr')
        ? mb_substr($text, 0, max(1, $max - 3), 'UTF-8')
        : substr($text, 0, max(1, $max - 3));
    return $slice . '...';
}

/** Parse php.ini memory_limit / size strings to bytes (0 if unknown). */
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
    $u = strtoupper($m[2] ?? '');
    return match ($u) {
        'K' => $n * 1024,
        'M' => $n * 1048576,
        'G' => $n * 1073741824,
        default => $n,
    };
}

/**
 * Render + send topology photo to Telegram. Updates telegram_screenshot_last_at on success
 * when $touchLastAt is true.
 *
 * @return array{ok:bool,error?:string,filename?:string}
 */
function pamantau_telegram_send_topology_screenshot(
    array $settings,
    bool $touchLastAt = true,
    string $caption = ''
): array {
    @set_time_limit(120);

    try {
        $settings = pamantau_normalize_settings($settings);
        $token = (string) ($settings['telegram_bot_token'] ?? '');
        $chatId = (string) ($settings['telegram_chat_id'] ?? '');
        if ($token === '' || $chatId === '') {
            return ['ok' => false, 'error' => 'Isi Bot Token dan Chat ID di Pengaturan Telegram'];
        }

        $format = (string) ($settings['telegram_screenshot_format'] ?? 'png');
        $shot = pamantau_render_topology_snapshot(
            pamantau_read('devices', []) ?: [],
            pamantau_read('connections', []) ?: [],
            $settings,
            $format
        );
        if (!$shot['ok']) {
            return ['ok' => false, 'error' => $shot['error'] ?? 'Render gagal'];
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

        return ['ok' => true, 'filename' => (string) $shot['filename']];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'Screenshot gagal: ' . $e->getMessage()];
    }
}

/**
 * Whether a scheduled topology screenshot is due (server local timezone).
 *
 * Modes:
 * - interval: every N minutes since last send (min 5)
 * - hourly: once per clock hour at minute M (0–59)
 * - daily: once per calendar day at HH:MM
 */
function pamantau_telegram_screenshot_due(array $settings): bool
{
    $settings = pamantau_normalize_settings($settings);
    if (empty($settings['telegram_screenshot_enabled'])) {
        return false;
    }
    if (empty($settings['telegram_enabled'])) {
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
        if ($lastTs === false) {
            return $now >= $slot;
        }
        if ($now < $slot) {
            return false;
        }
        return $lastTs < $slot;
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
        if ($lastTs === false) {
            return $now >= $slot;
        }
        if ($now < $slot) {
            return false;
        }
        return $lastTs < $slot;
    }

    $every = max(5, (int) ($settings['telegram_screenshot_every_min'] ?? 30));
    if ($lastTs === false) {
        return true;
    }
    return ($now - $lastTs) >= ($every * 60);
}
