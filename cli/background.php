<?php
declare(strict_types=1);

/**
 * Pamantau background worker — one poll cycle (+ optional Telegram screenshot).
 *
 * Respects settings.background_enabled (no-op when OFF).
 * Respects settings.poll_interval_ms: skips poll when the last successful
 * background poll was fewer than poll_interval_ms ago (cron may fire every
 * minute while Monitoring interval is e.g. 10–59s — worker self-paces).
 * Screenshot-due checks still run when poll is skipped.
 * Uses an exclusive flock so overlapping scheduler runs do not parallelize.
 *
 * ── Linux cron ─────────────────────────────────────────────────────────
 *   Suggested expression follows Monitoring poll_interval_ms (see app Settings).
 *   Minimum cron granularity is 1 minute; for sub-minute intervals use:
 *   * * * * * /usr/bin/php /path/to/Pamantau/cli/background.php >/dev/null 2>&1
 *
 * Note: Turning Background ON in app settings only allows this worker to run;
 * you still need cron to invoke this script.
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
    if (empty($settings['background_enabled'])) {
        fwrite(STDOUT, json_encode([
            'ok' => true,
            'skipped' => 'background_disabled',
        ], JSON_UNESCAPED_UNICODE) . "\n");
        exit(0);
    }

    if (function_exists('set_time_limit')) {
        set_time_limit(300);
    }

    $pollIntervalMs = max(2000, (int) ($settings['poll_interval_ms'] ?? 30000));
    $lastPollAt = (int) ($settings['background_last_poll_at'] ?? 0);
    $now = time();
    $elapsedMs = $lastPollAt > 0 ? ($now - $lastPollAt) * 1000 : PHP_INT_MAX;
    $pollTooSoon = $lastPollAt > 0 && $elapsedMs < $pollIntervalMs;

    $poll = null;
    $pollSkipped = null;
    if ($pollTooSoon) {
        $pollSkipped = 'poll_interval';
    } else {
        $poll = pamantau_run_poll_cycle($settings);
        // Persist last successful background poll time (unix ts).
        $settings = pamantau_normalize_settings(pamantau_read('settings', []));
        $settings['background_last_poll_at'] = time();
        pamantau_write('settings', pamantau_normalize_settings($settings));
    }

    $screenshot = ['ok' => false, 'skipped' => true];
    // Re-read settings (poll / last_at may have changed; screenshot helper may touch last_at)
    $settings = pamantau_normalize_settings(pamantau_read('settings', []));
    if (pamantau_telegram_screenshot_due($settings)) {
        $screenshot = pamantau_telegram_send_topology_screenshot($settings, true);
    }

    $out = [
        'ok' => true,
        'screenshot' => [
            'ok' => !empty($screenshot['ok']),
            'skipped' => !empty($screenshot['skipped']),
            'error' => $screenshot['error'] ?? null,
        ],
    ];
    if ($pollSkipped !== null) {
        $out['skipped'] = $pollSkipped;
        $out['poll_interval_ms'] = $pollIntervalMs;
        $out['background_last_poll_at'] = $lastPollAt;
    } else {
        $out['polled_at'] = $poll['polled_at'] ?? date('c');
        $out['device_count'] = is_array($poll['devices'] ?? null) ? count($poll['devices']) : 0;
        $out['notifications'] = $poll['notifications'] ?? [];
    }

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
