<?php
declare(strict_types=1);

/**
 * Shared monitoring jobs used by the browser API and cli/background.php.
 * Ping/status polling and common-port discovery run on independent schedules.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/network.php';
require_once __DIR__ . '/telegram.php';

/**
 * Prevent ping and automatic port-discovery jobs from overlapping. Besides
 * limiting network load, this keeps their read/modify/write database cycles
 * from replacing each other's status or service updates.
 *
 * @return resource|false
 */
function pamantau_monitoring_lock()
{
    if (!is_dir(PAMANTAU_DB_DIR)) {
        @mkdir(PAMANTAU_DB_DIR, 0775, true);
    }
    $fp = @fopen(PAMANTAU_DB_DIR . '/monitoring.lock', 'c+');
    if ($fp === false) {
        return false;
    }
    if (!flock($fp, LOCK_EX | LOCK_NB)) {
        fclose($fp);
        return false;
    }
    return $fp;
}

/** @param resource $lock */
function pamantau_monitoring_unlock($lock): void
{
    flock($lock, LOCK_UN);
    fclose($lock);
}

/**
 * Return current monitoring data when another job owns the monitoring lock.
 */
function pamantau_monitoring_locked_payload(string $job): array
{
    return [
        'ok' => true,
        'skipped' => 'locked',
        'job' => $job,
        'results' => [],
        'devices' => pamantau_read('devices', []),
        'stats' => pamantau_read('stats', []),
        'polled_at' => date('c'),
        'notifications' => [],
    ];
}

/**
 * Run the fast status job: ping devices, update status/latency/statistics, and
 * send transition notifications. It never scans or clears service ports.
 */
function pamantau_run_ping_cycle(?array $settings = null): array
{
    $lock = pamantau_monitoring_lock();
    if ($lock === false) {
        return pamantau_monitoring_locked_payload('ping');
    }

    try {
        $settings = pamantau_normalize_settings($settings ?? pamantau_read('settings', []));
        $timeout = (int) ($settings['ping_timeout_ms'] ?? 500);
        $pingWaves = min(10, max(1, (int) ($settings['ping_count'] ?? 5)));
        $pollMethod = (($settings['poll_method'] ?? 'parallel') === 'sequential')
            ? 'sequential'
            : 'parallel';

        $snapshot = pamantau_read('devices', []);
        $pingMap = [];
        $targets = [];
        $prevStatus = [];

        foreach ($snapshot as $device) {
            $id = (string) ($device['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $prevStatus[$id] = strtolower((string) ($device['status'] ?? 'unknown'));
            $ip = trim((string) ($device['ip'] ?? ''));
            if ($ip === '') {
                $pingMap[$id] = [
                    'status' => 'unknown',
                    'latency' => null,
                    'alive' => false,
                    'attempted' => false,
                ];
                continue;
            }
            $targets[$id] = $ip;
        }

        $attemptsById = pamantau_poll_ping_attempts(
            $targets,
            $pingWaves,
            $pollMethod,
            $timeout
        );

        foreach ($targets as $id => $ip) {
            $agg = pamantau_aggregate_pings($attemptsById[$id] ?? []);
            $latency = $agg['latency'];
            if ($latency !== null) {
                $latency = (int) round((float) $latency);
            }
            $pingMap[$id] = [
                'status' => !empty($agg['alive']) ? 'online' : 'offline',
                'latency' => $latency,
                'alive' => (bool) $agg['alive'],
                'attempted' => true,
            ];
        }

        // Re-read after network I/O so deleted devices are never resurrected.
        $store = pamantau_load_store();
        $devices = is_array($store['devices'] ?? null) ? $store['devices'] : [];
        $stats = is_array($store['stats'] ?? null) ? $store['stats'] : [];
        $statsDaily = is_array($store['stats_daily'] ?? null) ? $store['stats_daily'] : [];
        $results = [];
        $notifications = [];

        foreach ($devices as &$device) {
            $id = (string) ($device['id'] ?? '');
            if ($id === '' || !isset($pingMap[$id])) {
                $results[] = [
                    'id' => $id,
                    'status' => $device['status'] ?? 'unknown',
                    'latency' => $device['latency'] ?? null,
                    'services' => $device['services'] ?? [],
                    'poll_count' => $device['poll_count'] ?? 0,
                ];
                continue;
            }

            $hit = $pingMap[$id];
            $oldStatus = $prevStatus[$id] ?? strtolower((string) ($device['status'] ?? 'unknown'));
            $newStatus = (string) $hit['status'];
            $device['status'] = $newStatus;
            $device['latency'] = $hit['latency'];
            // Services are intentionally untouched, including while offline.

            if (!empty($hit['attempted'])) {
                $device['poll_count'] = max(0, (int) ($device['poll_count'] ?? 0)) + 1;
                pamantau_record_stats($stats, $id, (bool) $hit['alive'], $hit['latency']);
                pamantau_record_daily_stats($statsDaily, $id, (bool) $hit['alive'], $hit['latency']);
            }

            if (!empty($hit['attempted']) && $oldStatus !== $newStatus) {
                $note = pamantau_telegram_notify_transition($settings, $device, $oldStatus, $newStatus);
                if (!empty($note['sent']) || !empty($note['error'])) {
                    $notifications[] = array_merge(
                        ['id' => $id, 'from' => $oldStatus, 'to' => $newStatus],
                        $note
                    );
                }
            }

            $results[] = [
                'id' => $id,
                'status' => $device['status'],
                'latency' => $device['latency'],
                'services' => $device['services'] ?? [],
                'poll_count' => $device['poll_count'] ?? 0,
            ];
        }
        unset($device);

        $latestSettings = pamantau_normalize_settings($store['settings'] ?? []);
        $latestSettings['ping_last_poll_at'] = time();
        $store['devices'] = $devices;
        $store['stats'] = $stats;
        $store['stats_daily'] = $statsDaily;
        $store['settings'] = pamantau_normalize_settings($latestSettings);
        pamantau_save_store($store);

        return [
            'ok' => true,
            'job' => 'ping',
            'results' => $results,
            'devices' => $devices,
            'stats' => $stats,
            'polled_at' => date('c'),
            'notifications' => $notifications,
        ];
    } finally {
        pamantau_monitoring_unlock($lock);
    }
}

/**
 * Run common-port discovery independently from ping polling.
 *
 * Only devices currently marked online are scanned. Offline devices keep their
 * last known services. When $respectInterval is true, a recent successful scan
 * is returned as an interval skip instead of running again.
 */
function pamantau_run_port_scan_cycle(
    ?array $settings = null,
    bool $respectInterval = true
): array {
    $lock = pamantau_monitoring_lock();
    if ($lock === false) {
        return pamantau_monitoring_locked_payload('port_scan');
    }

    try {
        $settings = pamantau_normalize_settings($settings ?? pamantau_read('settings', []));
        if (empty($settings['port_scan_enabled'])) {
            return [
                'ok' => true,
                'job' => 'port_scan',
                'skipped' => 'port_scan_disabled',
                'devices' => pamantau_read('devices', []),
            ];
        }

        $intervalMs = (int) ($settings['port_scan_interval_ms'] ?? 300000);
        $lastScanAt = max(0, (int) ($settings['port_scan_last_poll_at'] ?? 0));
        $elapsedMs = $lastScanAt > 0 ? (time() - $lastScanAt) * 1000 : PHP_INT_MAX;
        if ($respectInterval && $lastScanAt > 0 && $elapsedMs < $intervalMs) {
            return [
                'ok' => true,
                'job' => 'port_scan',
                'skipped' => 'port_scan_interval',
                'port_scan_interval_ms' => $intervalMs,
                'port_scan_last_poll_at' => $lastScanAt,
                'next_in_ms' => max(1000, $intervalMs - $elapsedMs),
                'devices' => pamantau_read('devices', []),
            ];
        }

        $snapshot = pamantau_read('devices', []);
        $targets = [];
        foreach ($snapshot as $device) {
            $id = trim((string) ($device['id'] ?? ''));
            $ip = trim((string) ($device['ip'] ?? ''));
            $status = strtolower((string) ($device['status'] ?? 'unknown'));
            if ($id !== '' && $ip !== '' && $status === 'online') {
                $targets[$id] = $ip;
            }
        }

        $ports = $settings['common_ports'] ?? [22, 80, 443];
        $timeoutMs = (int) ($settings['port_scan_timeout_ms'] ?? 350);
        $deviceConcurrency = (int) ($settings['port_scan_device_concurrency'] ?? 24);
        $scanResults = pamantau_scan_device_ports_parallel(
            $targets,
            $ports,
            $timeoutMs,
            $deviceConcurrency
        );

        // Merge only service fields into the newest device snapshot.
        $store = pamantau_load_store();
        $devices = is_array($store['devices'] ?? null) ? $store['devices'] : [];
        $scannedAt = date('c');
        $scannedCount = 0;
        foreach ($devices as &$device) {
            $id = (string) ($device['id'] ?? '');
            $status = strtolower((string) ($device['status'] ?? 'unknown'));
            if ($id === '' || $status !== 'online' || !array_key_exists($id, $scanResults)) {
                continue;
            }
            $device['services'] = $scanResults[$id];
            $device['ports_scanned_at'] = $scannedAt;
            $scannedCount++;
        }
        unset($device);

        $latestSettings = pamantau_normalize_settings($store['settings'] ?? []);
        $latestSettings['port_scan_last_poll_at'] = time();
        $store['devices'] = $devices;
        $store['settings'] = pamantau_normalize_settings($latestSettings);
        pamantau_save_store($store);

        return [
            'ok' => true,
            'job' => 'port_scan',
            'devices' => $devices,
            'scanned_at' => $scannedAt,
            'scanned_count' => $scannedCount,
            'online_target_count' => count($targets),
            'port_count' => count(pamantau_normalize_port_list($ports)),
            'next_in_ms' => $intervalMs,
        ];
    } finally {
        pamantau_monitoring_unlock($lock);
    }
}

/**
 * Backward-compatible status polling entry point. Port discovery only runs
 * when a caller explicitly passes true; normal browser/background scheduling
 * uses the two dedicated jobs above.
 */
function pamantau_run_poll_cycle(
    ?array $settings = null,
    ?bool $scanPortsOverride = false
): array {
    $poll = pamantau_run_ping_cycle($settings);
    if ($scanPortsOverride === true && empty($poll['skipped'])) {
        $poll['port_scan'] = pamantau_run_port_scan_cycle($settings, false);
        if (is_array($poll['port_scan']['devices'] ?? null)) {
            $poll['devices'] = $poll['port_scan']['devices'];
        }
    }
    return $poll;
}
