<?php
declare(strict_types=1);

/**
 * Pamantau background worker — one poll cycle (+ optional Telegram screenshot).
 *
 * Respects settings.telegram_screenshot_enabled (via background_enabled mirror).
 * Ping and common-port discovery use independent last-run timestamps and
 * intervals. The worker may be invoked frequently; each job self-paces.
 * Screenshot-due checks still run when poll is skipped.
 * Uses an exclusive flock so overlapping scheduler runs do not parallelize.
 *
 * ── Linux cron (Debian/Ubuntu) ─────────────────────────────────────────
 *   The worker self-paces both jobs. To honor a 30-second ping interval with
 *   cron, invoke it at second 0 and second 30:
 *   * * * * * /usr/bin/php /path/to/Pamantau/cli/background.php >/dev/null 2>&1
 *   * * * * * sleep 30; /usr/bin/php /path/to/Pamantau/cli/background.php >/dev/null 2>&1
 *
 * Note: Enabling "Aktifkan screenshot terjadwal" allows this worker to run;
 * root cron still needs to invoke this script (installed automatically on Save).
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "cli/background.php must be run from CLI\n");
    exit(1);
}

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/poll.php';
require_once __DIR__ . '/../includes/topology_snapshot.php';

$lockPath = PAMANTAU_DB_DIR . '/background.lock';
if (!is_dir(PAMANTAU_DB_DIR)) {
    @mkdir(PAMANTAU_DB_DIR, 0775, true);
}

$lockFp = fopen($lockPath, 'c+');
if ($lockFp === false) {
    fwrite(STDERR, "Cannot open lock file\n");
    exit(1);
}

if (!flock($lockFp, LOCK_EX | LOCK_NB)) {
    // Another worker is still running — exit quietly.
    fwrite(STDOUT, json_encode(['ok' => true, 'skipped' => 'locked']) . "\n");
    fclose($lockFp);
    exit(0);
}

try {
    $settings = pamantau_normalize_settings(pamantau_read('settings', []));
    if (empty($settings['telegram_screenshot_enabled'])) {
        fwrite(STDOUT, json_encode([
            'ok' => true,
            'skipped' => 'screenshot_disabled',
        ], JSON_UNESCAPED_UNICODE) . "\n");
        exit(0);
    }

    if (function_exists('set_time_limit')) {
        set_time_limit(300);
    }

    $now = time();
    $pingIntervalMs = (int) ($settings['poll_interval_ms'] ?? 30000);
    $pingLastAt = (int) ($settings['ping_last_poll_at'] ?? 0);
    $pingDue = !empty($settings['polling_enabled'])
        && ($pingLastAt <= 0 || (($now - $pingLastAt) * 1000) >= $pingIntervalMs);

    $portIntervalMs = (int) ($settings['port_scan_interval_ms'] ?? 300000);
    $portLastAt = (int) ($settings['port_scan_last_poll_at'] ?? 0);
    $portDue = !empty($settings['port_scan_enabled'])
        && ($portLastAt <= 0 || (($now - $portLastAt) * 1000) >= $portIntervalMs);

    $ping = $pingDue
        ? pamantau_run_ping_cycle($settings)
        : ['ok' => true, 'job' => 'ping', 'skipped' => 'ping_interval'];

    // Ping persists its own timestamp and may change device status.
    $settings = pamantau_normalize_settings(pamantau_read('settings', []));
    $portScan = $portDue
        ? pamantau_run_port_scan_cycle($settings, true)
        : ['ok' => true, 'job' => 'port_scan', 'skipped' => 'port_scan_interval'];

    $screenshot = ['ok' => false, 'skipped' => true];
    // Re-read settings (poll / last_at may have changed; screenshot helper may touch last_at)
    $settings = pamantau_normalize_settings(pamantau_read('settings', []));
    if (pamantau_telegram_screenshot_due($settings)) {
        $screenshot = pamantau_telegram_send_topology_screenshot($settings, true);
    }

    $out = [
        'ok' => true,
        'jobs' => [
            'ping' => [
                'skipped' => $ping['skipped'] ?? null,
                'polled_at' => $ping['polled_at'] ?? null,
                'device_count' => is_array($ping['devices'] ?? null) ? count($ping['devices']) : 0,
            ],
            'port_scan' => [
                'skipped' => $portScan['skipped'] ?? null,
                'scanned_at' => $portScan['scanned_at'] ?? null,
                'scanned_count' => $portScan['scanned_count'] ?? 0,
                'online_target_count' => $portScan['online_target_count'] ?? 0,
            ],
        ],
        'screenshot' => [
            'ok' => !empty($screenshot['ok']),
            'skipped' => !empty($screenshot['skipped']),
            'error' => $screenshot['error'] ?? null,
        ],
    ];
    if (!$pingDue && !$portDue) {
        $out['skipped'] = 'job_intervals';
    }
    $out['notifications'] = $ping['notifications'] ?? [];

    fwrite(STDOUT, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE) . "\n");
    exit(1);
} finally {
    flock($lockFp, LOCK_UN);
    fclose($lockFp);
}
