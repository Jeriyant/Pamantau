<?php
declare(strict_types=1);

/**
 * Shared poll cycle used by API `poll` and cli/background.php.
 * Detects online/offline transitions and sends Telegram notifications when enabled.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/network.php';
require_once __DIR__ . '/telegram.php';

/**
 * Run one full poll cycle: ping devices, update store, notify on transitions.
 *
 * @return array{
 *   ok:bool,
 *   results:list<array>,
 *   devices:list<array>,
 *   stats:array,
 *   polled_at:string,
 *   notifications:list<array>
 * }
 */
function pamantau_run_poll_cycle(?array $settings = null): array
{
    $settings = pamantau_normalize_settings($settings ?? pamantau_read('settings', []));
    $timeout = (int) ($settings['ping_timeout_ms'] ?? 1000);
    $portScan = (bool) ($settings['port_scan_enabled'] ?? true);
    $ports = $settings['common_ports'] ?? [22, 80, 443];
    $pingWaves = min(10, max(1, (int) ($settings['ping_count'] ?? 5)));
    $pollMethod = (($settings['poll_method'] ?? 'parallel') === 'sequential')
        ? 'sequential'
        : 'parallel';

    // Snapshot only for pinging — never rewrite this snapshot later
    $snapshot = pamantau_read('devices', []);
    $pingMap = [];
    $targets = []; // id => ip

    // Previous status for transition detection (from snapshot before ping)
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
                'services' => $device['services'] ?? [],
                'alive' => false,
                'touched_services' => false,
                'attempted' => false,
            ];
            continue;
        }
        $targets[$id] = $ip;
    }

    $attemptsById = pamantau_poll_ping_attempts($targets, $pingWaves, $pollMethod, $timeout);

    foreach ($targets as $id => $ip) {
        $agg = pamantau_aggregate_pings($attemptsById[$id] ?? []);
        $alive = (bool) $agg['alive'];
        $latency = $agg['latency'];
        if ($latency !== null) {
            $latency = (int) round((float) $latency);
        }
        $services = [];
        $touchedServices = false;

        if ($alive && $portScan) {
            $services = pamantau_scan_ports($ip, $ports);
            $touchedServices = true;
        }

        $pingMap[$id] = [
            'status' => $alive ? 'online' : 'offline',
            'latency' => $latency,
            'services' => $services,
            'alive' => $alive,
            'touched_services' => $touchedServices,
            'attempted' => true,
        ];
    }

    // Re-read after slow pings so deletes during poll are not resurrected
    $devices = pamantau_read('devices', []);
    $stats = pamantau_read('stats', []);
    $statsDaily = pamantau_read('stats_daily', []);
    if (!is_array($statsDaily)) {
        $statsDaily = [];
    }
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
        if ($hit['touched_services']) {
            $device['services'] = $hit['services'];
        } elseif (($hit['status'] ?? '') === 'offline') {
            // Keep last known services when offline
        }
        if (!empty($hit['attempted'])) {
            $device['poll_count'] = max(0, (int) ($device['poll_count'] ?? 0)) + 1;
        }
        pamantau_record_stats($stats, $id, (bool) $hit['alive'], $hit['latency']);
        pamantau_record_daily_stats($statsDaily, $id, (bool) $hit['alive'], $hit['latency']);

        if (!empty($hit['attempted']) && $oldStatus !== $newStatus) {
            $note = pamantau_telegram_notify_transition($settings, $device, $oldStatus, $newStatus);
            if (!empty($note['sent']) || !empty($note['error'])) {
                $notifications[] = array_merge(['id' => $id, 'from' => $oldStatus, 'to' => $newStatus], $note);
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

    pamantau_write('devices', $devices);
    pamantau_write('stats', $stats);
    pamantau_write('stats_daily', $statsDaily);

    return [
        'ok' => true,
        'results' => $results,
        'devices' => $devices,
        'stats' => $stats,
        'polled_at' => date('c'),
        'notifications' => $notifications,
    ];
}
