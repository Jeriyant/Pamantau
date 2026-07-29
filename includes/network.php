<?php
declare(strict_types=1);

// Standard ICMP echo cadence used by real OS ping tools (Windows `ping`/Linux
// `iputils` both default to -i 1, i.e. one request per second) regardless of
// how quickly the reply actually comes back. pamantau_ping() itself always
// measures a real ICMP round-trip (never faked), but a single fast LAN reply
// only takes a few ms — without pacing, 5 sequential requests finish almost
// instantly and feel "fake" next to a real terminal `ping -n 5`. See
// pamantau_pace_ping(), used only by the interactive ping_host API action.
const PAMANTAU_PING_INTERVAL_MS = 1000;

/**
 * Accepts either a literal IP (v4/v6, via filter_var) or an RFC 1123-style
 * hostname (e.g. "jeriyant.my.id"), so ping/traceroute/port-scan/poll can
 * target hostnames — not just raw IP addresses. Never resolves the name
 * itself here; that is left to the OS ping/tracert/fsockopen call, which
 * already performs DNS resolution natively.
 */
function pamantau_is_valid_host(string $value): bool
{
    $value = trim($value);
    if ($value === '' || strlen($value) > 253) {
        return false;
    }
    if (filter_var($value, FILTER_VALIDATE_IP)) {
        return true;
    }
    $label = '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
    return (bool) preg_match('/^' . $label . '(\.' . $label . ')*$/', $value);
}

/**
 * Build an OS ping argv list (one echo request) for proc_open / exec.
 *
 * @return list<string>|null
 */
function pamantau_ping_command(string $ip, int $timeoutMs = 1000): ?array
{
    $ip = trim($ip);
    if (!pamantau_is_valid_host($ip)) {
        return null;
    }
    if (stripos(PHP_OS_FAMILY, 'Windows') === 0) {
        return ['ping', '-n', '1', '-w', (string) max(1, $timeoutMs), $ip];
    }
    $timeoutSec = max(0.15, $timeoutMs / 1000);
    $timeoutSec = rtrim(rtrim(number_format($timeoutSec, 3, '.', ''), '0'), '.') ?: '0.15';
    return ['ping', '-c', '1', '-W', $timeoutSec, $ip];
}

/**
 * Parse stdout/stderr from a single-echo OS ping.
 *
 * @return array{alive:bool,latency:?float,sub_ms:bool,ttl:?int,elapsed_ms:float,raw:string,error?:string}
 */
function pamantau_parse_ping_output(string $text, int $code, float $elapsedMs = 0.0): array
{
    $latency = null;
    $subMs = false;
    if (preg_match('/time([=<])\s*([\d.]+)\s*ms/i', $text, $m)) {
        $latency = (float) $m[2];
        $subMs = ($m[1] === '<') || $latency < 1;
        $latency = (int) round($latency);
    } elseif (preg_match('/([\d.]+)\s*ms/i', $text, $m)) {
        $latency = (float) $m[1];
        $subMs = $latency < 1;
        $latency = (int) round($latency);
    }

    $ttl = null;
    if (preg_match('/\bttl[=\s]+(\d+)/i', $text, $tm)) {
        $ttl = (int) $tm[1];
    }

    $alive = ($code === 0) || ($latency !== null && stripos($text, 'ttl=') !== false);

    $out = [
        'alive' => $alive,
        'latency' => $alive ? $latency : null,
        'sub_ms' => $alive && $subMs,
        'ttl' => $alive ? $ttl : null,
        'elapsed_ms' => $elapsedMs,
        'raw' => $text,
    ];
    if (!$alive) {
        $out['error'] = stripos($text, 'unreachable') !== false ? 'unreachable' : 'timeout';
    }

    return $out;
}

function pamantau_ping(string $ip, int $timeoutMs = 1000): array
{
    $ip = trim($ip);
    $cmd = pamantau_ping_command($ip, $timeoutMs);
    if ($cmd === null) {
        return ['alive' => false, 'latency' => null, 'elapsed_ms' => 0.0, 'error' => 'invalid_ip'];
    }

    $escaped = escapeshellarg($ip);
    if (stripos(PHP_OS_FAMILY, 'Windows') === 0) {
        $shell = "ping -n 1 -w {$timeoutMs} {$escaped}";
    } else {
        $timeoutSec = max(0.15, $timeoutMs / 1000);
        $timeoutSec = rtrim(rtrim(number_format($timeoutSec, 3, '.', ''), '0'), '.') ?: '0.15';
        $shell = "ping -c 1 -W {$timeoutSec} {$escaped}";
    }

    $output = [];
    $code = 1;
    $startedAt = microtime(true);
    exec($shell . ' 2>&1', $output, $code);
    $elapsedMs = (microtime(true) - $startedAt) * 1000;
    $text = implode("\n", $output);

    return pamantau_parse_ping_output($text, $code, $elapsedMs);
}

/**
 * Ping many hosts concurrently (one echo each) via proc_open.
 * Returns map of host => ping result array.
 *
 * @param list<string> $hosts
 * @return array<string, array{alive:bool,latency:?float,sub_ms?:bool,ttl?:?int,elapsed_ms:float,raw?:string,error?:string}>
 */
function pamantau_ping_parallel(array $hosts, int $timeoutMs = 1000): array
{
    $unique = [];
    foreach ($hosts as $host) {
        $host = trim((string) $host);
        if ($host !== '' && pamantau_is_valid_host($host)) {
            $unique[$host] = true;
        }
    }
    $unique = array_keys($unique);
    if ($unique === []) {
        return [];
    }

    $results = [];
    $handles = [];

    foreach ($unique as $ip) {
        $cmd = pamantau_ping_command($ip, $timeoutMs);
        if ($cmd === null) {
            $results[$ip] = ['alive' => false, 'latency' => null, 'elapsed_ms' => 0.0, 'error' => 'invalid_ip'];
            continue;
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $pipes = [];
        $proc = @proc_open($cmd, $descriptors, $pipes, null, null, ['bypass_shell' => true]);
        if (!is_resource($proc)) {
            // Fallback: sequential ping for this host only
            $results[$ip] = pamantau_ping($ip, $timeoutMs);
            continue;
        }
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $handles[$ip] = [
            'proc' => $proc,
            'out' => $pipes[1],
            'err' => $pipes[2],
            'buf' => '',
            'start' => microtime(true),
        ];
    }

    $deadline = microtime(true) + max(2.0, ($timeoutMs / 1000) + 2.0);

    while ($handles !== []) {
        foreach ($handles as $ip => $h) {
            $chunkOut = stream_get_contents($h['out']);
            $chunkErr = stream_get_contents($h['err']);
            if ($chunkOut !== false && $chunkOut !== '') {
                $h['buf'] .= $chunkOut;
            }
            if ($chunkErr !== false && $chunkErr !== '') {
                $h['buf'] .= $chunkErr;
            }

            $status = proc_get_status($h['proc']);
            $timedOut = microtime(true) >= $deadline;
            if ($status['running'] && !$timedOut) {
                $handles[$ip] = $h;
                continue;
            }

            if ($status['running']) {
                proc_terminate($h['proc']);
                $status = proc_get_status($h['proc']);
            }

            $restOut = stream_get_contents($h['out']);
            $restErr = stream_get_contents($h['err']);
            if ($restOut !== false) {
                $h['buf'] .= $restOut;
            }
            if ($restErr !== false) {
                $h['buf'] .= $restErr;
            }
            fclose($h['out']);
            fclose($h['err']);
            $code = proc_close($h['proc']);
            if (!is_int($code) || $code < 0) {
                $code = (int) ($status['exitcode'] ?? 1);
            }
            $elapsedMs = (microtime(true) - $h['start']) * 1000;
            $results[$ip] = pamantau_parse_ping_output($h['buf'], $code, $elapsedMs);
            unset($handles[$ip]);
        }
        if ($handles !== []) {
            usleep(3000);
        }
    }

    return $results;
}

/**
 * Run N ping attempts per device for one poll cycle.
 * - parallel: each wave pings all hosts at once (N waves)
 * - sequential: each host gets N pings one after another before the next host
 *
 * @param array<string, string> $targets id => ip
 * @return array<string, list<array{alive:bool,latency:?float}>>
 */
function pamantau_poll_ping_attempts(
    array $targets,
    int $pingCount = 5,
    string $method = 'parallel',
    int $timeoutMs = 1000
): array {
    $pingCount = min(10, max(1, $pingCount));
    $method = $method === 'sequential' ? 'sequential' : 'parallel';
    $attemptsById = [];
    foreach (array_keys($targets) as $id) {
        $attemptsById[$id] = [];
    }
    if ($targets === []) {
        return $attemptsById;
    }

    if ($method === 'sequential') {
        foreach ($targets as $id => $ip) {
            for ($i = 0; $i < $pingCount; $i++) {
                $attemptsById[$id][] = pamantau_ping($ip, $timeoutMs);
            }
        }
        return $attemptsById;
    }

    for ($wave = 0; $wave < $pingCount; $wave++) {
        $batch = pamantau_ping_parallel(array_values($targets), $timeoutMs);
        foreach ($targets as $id => $ip) {
            $attemptsById[$id][] = $batch[$ip] ?? ['alive' => false, 'latency' => null];
        }
    }

    return $attemptsById;
}

/**
 * Aggregate several single-echo ping results for one host.
 * Online when majority (≥ ceil(n/2)) succeed; latency = average of successes.
 *
 * @param list<array{alive?:bool,latency?:?float}> $attempts
 * @return array{alive:bool,latency:?float,ok:int,total:int}
 */
function pamantau_aggregate_pings(array $attempts): array
{
    $total = count($attempts);
    $ok = 0;
    $latencies = [];
    foreach ($attempts as $r) {
        if (!empty($r['alive'])) {
            $ok++;
            if (isset($r['latency']) && $r['latency'] !== null) {
                $latencies[] = (float) $r['latency'];
            }
        }
    }
    $need = max(1, (int) ceil($total / 2));
    $alive = $total > 0 && $ok >= $need;
    $latency = null;
    if ($alive && $latencies !== []) {
        $latency = (int) round(array_sum($latencies) / count($latencies));
    }

    return [
        'alive' => $alive,
        'latency' => $latency,
        'ok' => $ok,
        'total' => $total,
    ];
}

/**
 * Pad a real ping result up to the standard inter-packet interval so a
 * sequence of individual ping_host calls feels like one continuous terminal
 * `ping -n N` session instead of firing attempts back-to-back. Never
 * fakes/inflates the measured latency — only delays the HTTP response so the
 * *cadence* between attempts matches a real OS ping tool. Intended for the
 * interactive ping_host API action only; must not be used for background
 * polling/subnet scans, which need to stay fast across many hosts.
 */
function pamantau_pace_ping(array $result, int $intervalMs = PAMANTAU_PING_INTERVAL_MS): void
{
    $elapsedMs = (float) ($result['elapsed_ms'] ?? 0);
    $remainingMs = $intervalMs - $elapsedMs;
    if ($remainingMs > 0) {
        usleep((int) round($remainingMs * 1000));
    }
}

const PAMANTAU_TRACEROUTE_MAX_HOPS_DEFAULT = 30;

/**
 * Runs a shell command with stdout and stderr captured separately (unlike
 * exec(), which pamantau_ping() uses with a merged '2>&1' redirect). Needed
 * for traceroute so a missing-binary/permission stderr message can be
 * detected and turned into a clean error instead of being dumped into the
 * terminal as if it were real hop output.
 */
function pamantau_run_command(string $cmd): array
{
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = @proc_open($cmd, $descriptors, $pipes);
    if (!is_resource($process)) {
        return ['stdout' => '', 'stderr' => 'proc_open gagal dijalankan', 'code' => -1];
    }

    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]) ?: '';
    $stderr = stream_get_contents($pipes[2]) ?: '';
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($process);

    return ['stdout' => $stdout, 'stderr' => $stderr, 'code' => $code];
}

/**
 * Locates a real executable for a Linux/Unix tool name, checking common
 * absolute install paths first (works even with a stripped-down PATH under
 * a web server) and falling back to a `command -v` PATH lookup. Returns
 * null — never a guess — when the binary genuinely isn't installed, so the
 * caller can surface a clear "please install X" error instead of running a
 * command that will fail with "not found".
 */
function pamantau_detect_unix_binary(string $name): ?string
{
    foreach (["/usr/sbin/{$name}", "/usr/bin/{$name}", "/sbin/{$name}", "/bin/{$name}"] as $path) {
        if (is_executable($path)) {
            return $path;
        }
    }

    $out = [];
    $code = 1;
    exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null', $out, $code);
    $found = trim($out[0] ?? '');

    return ($found !== '' && $code === 0) ? $found : null;
}

/**
 * True when a command name resolves directly via the shell's PATH (i.e. it
 * could be invoked bare, without an absolute path). Used solely to decide
 * whether the traceroute/tracepath command we actually exec can be the
 * plain `traceroute IP` form the user wants instead of an absolute path —
 * we still fall back to the absolute path from pamantau_detect_unix_binary()
 * when a web server's stripped-down PATH doesn't include it.
 */
function pamantau_binary_in_path(string $name): bool
{
    $out = [];
    $code = 1;
    exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null', $out, $code);

    return $code === 0 && trim($out[0] ?? '') !== '';
}

/**
 * Runs a real OS traceroute (Windows `tracert` / Linux `traceroute`, falling
 * back to `tracepath` when `traceroute` isn't installed) and returns its
 * authentic stdout text, plus a best-effort parse of individual hops.
 *
 * The exec'd command is kept as close to the plain `traceroute IP` /
 * `tracert IP` the user actually types as possible: the only flag kept is
 * `-n`/`-d` (skip reverse-DNS on each hop), because without it a single
 * traceroute can take minutes if reverse lookups hang, easily blowing past
 * the request's execution time limit. Everything else (`-m`/`-h` hop count,
 * `-w` per-probe wait) is left at the tool's own default rather than pinned,
 * since that default already matches PAMANTAU_TRACEROUTE_MAX_HOPS_DEFAULT.
 * `display_command` mirrors the Windows CMD form shown in the UI
 * (`tracert -d IP`). The frontend reformats hop data into classic Windows
 * tracert chrome regardless of whether this host ran tracert or Linux
 * traceroute/tracepath.
 *
 * PHP_OS_FAMILY reflects the OS the PHP process itself runs on — which can
 * differ from the client's OS (e.g. PHP inside WSL/Linux while the user is on
 * Windows). We must always dispatch to the binary that actually exists on
 * *this* PHP host.
 * On Linux, if neither `traceroute` nor `tracepath` is installed (or the
 * command exists but fails, e.g. missing raw-socket permission), this
 * returns ok=false with a clear, actionable error — it never dumps a raw
 * "sh: ... not found" / stderr blob into the output as if it were hop data.
 */
function pamantau_traceroute(string $ip, int $maxHops = PAMANTAU_TRACEROUTE_MAX_HOPS_DEFAULT): array
{
    $ip = trim($ip);
    if (!pamantau_is_valid_host($ip)) {
        return ['ok' => false, 'error' => 'Alamat IP/host tidak valid.', 'os' => '', 'command' => '', 'display_command' => '', 'used_fallback' => false, 'output' => '', 'hops' => []];
    }

    // Accepted for API compatibility / response echo only. Not forwarded as
    // a `-m`/`-h` flag (see doc comment above) — the OS tool uses its own
    // default hop limit. The frontend paints a Windows-style
    // "Tracing route to … over a maximum of N hops" header from this value.
    $maxHops = max(1, min(64, $maxHops));
    $escaped = escapeshellarg($ip);
    $isWindows = stripos(PHP_OS_FAMILY, 'Windows') === 0;

    if ($isWindows) {
        $cmd = "tracert -d {$escaped}";
        $displayCommand = "tracert -d {$ip}";
        $run = pamantau_run_command($cmd);
        $stdout = trim($run['stdout']);
        $stderr = trim($run['stderr']);

        if ($stdout === '' && ($run['code'] !== 0 || $stderr !== '')) {
            return [
                'ok' => false,
                'os' => 'windows',
                'command' => $cmd,
                'display_command' => $displayCommand,
                'used_fallback' => false,
                'output' => '',
                'hops' => [],
                'error' => 'Gagal menjalankan tracert di server (Windows): ' . ($stderr !== '' ? $stderr : "exit code {$run['code']}") . '.',
            ];
        }

        $text = $stdout !== '' ? $stdout : $stderr;

        return [
            'ok' => true,
            'os' => 'windows',
            'command' => $cmd,
            'display_command' => $displayCommand,
            'used_fallback' => false,
            'output' => $text,
            'hops' => pamantau_parse_traceroute_hops($text),
        ];
    }

    // Linux/Unix host: never assume `traceroute` exists — detect a real
    // binary first, fall back to `tracepath`, and if neither is installed
    // return a clean, actionable error instead of executing a command that
    // is guaranteed to print "sh: ...: not found" to stderr.
    $tracerouteBin = pamantau_detect_unix_binary('traceroute');
    $tracepathBin = $tracerouteBin === null ? pamantau_detect_unix_binary('tracepath') : null;

    if ($tracerouteBin === null && $tracepathBin === null) {
        return [
            'ok' => false,
            'os' => 'linux',
            'command' => '',
            'display_command' => '',
            'used_fallback' => false,
            'output' => '',
            'hops' => [],
            'error' => 'Perintah traceroute/tracepath tidak ditemukan di server (PHP berjalan di Linux/WSL). '
                . 'Install salah satu: "sudo apt install traceroute" (atau "sudo apt install iputils-tracepath" untuk tracepath) di WSL/Linux tersebut, '
                . 'atau jalankan Apache/PHP di Windows agar tracert bawaan Windows bisa dipakai.',
        ];
    }

    $usedFallback = $tracerouteBin === null;
    if (!$usedFallback) {
        // Invoke the bare `traceroute` name when it resolves via PATH, for a
        // clean, vanilla-looking exec; only fall back to the absolute path
        // pamantau_detect_unix_binary() found when the web server's PATH
        // doesn't include it.
        $execBin = pamantau_binary_in_path('traceroute') ? 'traceroute' : $tracerouteBin;
        $cmd = escapeshellarg($execBin) . " -n {$escaped}";
        $displayCommand = "traceroute {$ip}";
    } else {
        $execBin = pamantau_binary_in_path('tracepath') ? 'tracepath' : $tracepathBin;
        $cmd = escapeshellarg($execBin) . " -n {$escaped}";
        $displayCommand = "tracepath {$ip}";
    }

    $run = pamantau_run_command($cmd);
    $stdout = trim($run['stdout']);
    $stderr = trim($run['stderr']);

    // A nonzero exit with no useful stdout (e.g. permission denied creating
    // a raw socket — common for traceroute run as a non-root web server
    // user) means the command itself failed; surface that cleanly rather
    // than showing an empty/garbage hop list.
    if ($stdout === '' && ($run['code'] !== 0 || $stderr !== '')) {
        $detail = $stderr !== '' ? $stderr : "exit code {$run['code']}";
        return [
            'ok' => false,
            'os' => 'linux',
            'command' => $cmd,
            'display_command' => $displayCommand,
            'used_fallback' => $usedFallback,
            'output' => '',
            'hops' => [],
            'error' => "Traceroute gagal dijalankan di server (Linux): {$detail}. "
                . 'Pastikan traceroute/tracepath terpasang dan proses PHP punya izin membuat raw socket '
                . '(jalankan sebagai root, atau beri capability: sudo setcap cap_net_raw+ep $(command -v traceroute)).',
        ];
    }

    $text = $stdout !== '' ? $stdout : $stderr;

    return [
        'ok' => true,
        'os' => 'linux',
        'command' => $cmd,
        'display_command' => $displayCommand,
        'used_fallback' => $usedFallback,
        'output' => $text,
        'hops' => pamantau_parse_traceroute_hops($text),
    ];
}

/**
 * Best-effort line parser for Windows `tracert -d` and Linux
 * `traceroute -n` / `tracepath` output. The frontend prefers this structured
 * hop list when painting classic Windows tracert layout.
 */
function pamantau_parse_traceroute_hops(string $text): array
{
    $hops = [];
    foreach (preg_split('/\r?\n/', $text) as $line) {
        $line = trim($line);
        if (!preg_match('/^(\d{1,3})[.\s]+(.*)$/', $line, $m)) {
            continue;
        }
        $hopNum = (int) $m[1];
        if ($hopNum < 1 || $hopNum > 200) {
            continue;
        }
        $rest = $m[2];

        $ip = null;
        if (preg_match('/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/', $rest, $ipm)) {
            $ip = $ipm[1];
        }

        $times = [];
        if (preg_match_all('/([\d.]+)\s*ms/i', $rest, $tm)) {
            foreach ($tm[1] as $t) {
                $times[] = (float) $t;
            }
        }

        $timedOut = ($ip === null && $times === []);

        $hops[] = [
            'hop' => $hopNum,
            'ip' => $ip,
            'times_ms' => $times,
            'timed_out' => $timedOut,
        ];
    }

    return $hops;
}

/**
 * Safety ceiling for a single manual port-range scan (inclusive span).
 * Prefer passing the configured settings value (`scan_port_max`).
 */
function pamantau_scan_port_max_span(int $configured = 1024): int
{
    return min(10000, max(1, $configured));
}

/**
 * Normalize a list of port numbers (1–65535, unique, sorted).
 *
 * @param list<mixed> $ports
 * @return list<int>
 */
function pamantau_normalize_port_list(array $ports): array
{
    $clean = [];
    foreach ($ports as $p) {
        $n = (int) $p;
        if ($n >= 1 && $n <= 65535 && !in_array($n, $clean, true)) {
            $clean[] = $n;
        }
    }
    sort($clean);
    return array_values($clean);
}

/**
 * Expand an inclusive port range into a list (capped by max span).
 *
 * @return array{ok:bool,ports?:list<int>,error?:string,from?:int,to?:int,count?:int}
 */
function pamantau_expand_port_range(int $from, int $to, ?int $maxSpan = null): array
{
    $maxSpan = $maxSpan ?? pamantau_scan_port_max_span();
    if ($from < 1 || $to > 65535 || $from > $to) {
        return ['ok' => false, 'error' => 'Rentang port tidak valid (1–65535, mulai ≤ akhir).'];
    }
    $count = $to - $from + 1;
    if ($count > $maxSpan) {
        return [
            'ok' => false,
            'error' => 'Rentang terlalu besar (maks. ' . $maxSpan . ' port dari pengaturan). Perkecil rentang.',
            'from' => $from,
            'to' => $to,
            'count' => $count,
        ];
    }
    $ports = [];
    for ($p = $from; $p <= $to; $p++) {
        $ports[] = $p;
    }
    return ['ok' => true, 'ports' => $ports, 'from' => $from, 'to' => $to, 'count' => $count];
}

/**
 * Parse "1-1000" / "1 - 1000" into from/to.
 *
 * @return array{ok:bool,from?:int,to?:int,error?:string}
 */
function pamantau_parse_port_range_string(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') {
        return ['ok' => false, 'error' => 'Rentang port kosong.'];
    }
    if (!preg_match('/^(\d+)\s*-\s*(\d+)$/', $raw, $m)) {
        return ['ok' => false, 'error' => 'Format rentang tidak valid. Contoh: 1-1000'];
    }
    return [
        'ok' => true,
        'from' => (int) $m[1],
        'to' => (int) $m[2],
    ];
}

/**
 * Scan TCP ports on a host.
 * - sequential: one fsockopen at a time (accurate, used by poll common-ports)
 * - parallel: async connect in chunks (faster for manual range scans)
 *
 * @param list<int|string> $ports
 * @return list<int>
 */
function pamantau_scan_ports(string $ip, array $ports, float $timeoutSec = 0.35, string $method = 'sequential'): array
{
    $ip = trim($ip);
    if (!pamantau_is_valid_host($ip)) {
        return [];
    }

    $ports = pamantau_normalize_port_list($ports);
    if ($ports === []) {
        return [];
    }

    $method = strtolower(trim($method)) === 'parallel' ? 'parallel' : 'sequential';
    if ($method === 'parallel') {
        return pamantau_scan_ports_parallel($ip, $ports, $timeoutSec);
    }

    $open = [];
    foreach ($ports as $port) {
        $errno = 0;
        $errstr = '';
        $fp = @fsockopen($ip, $port, $errno, $errstr, $timeoutSec);
        if (is_resource($fp)) {
            $open[] = $port;
            fclose($fp);
        }
    }

    return $open;
}

/**
 * Parallel TCP connect scan (chunked async sockets).
 *
 * @param list<int> $ports
 * @return list<int>
 */
function pamantau_scan_ports_parallel(string $ip, array $ports, float $timeoutSec = 0.35, int $chunkSize = 96): array
{
    $open = [];
    $chunkSize = min(128, max(8, $chunkSize));
    $timeoutSec = max(0.1, min(5.0, $timeoutSec));
    $host = $ip;
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $host = '[' . $ip . ']';
    }

    foreach (array_chunk($ports, $chunkSize) as $chunk) {
        $handles = [];
        foreach ($chunk as $port) {
            $errno = 0;
            $errstr = '';
            $fp = @stream_socket_client(
                'tcp://' . $host . ':' . $port,
                $errno,
                $errstr,
                $timeoutSec,
                STREAM_CLIENT_CONNECT | STREAM_CLIENT_ASYNC_CONNECT
            );
            if (!is_resource($fp)) {
                continue;
            }
            stream_set_blocking($fp, false);
            $handles[$port] = [
                'fp' => $fp,
                'start' => microtime(true),
            ];
        }

        while ($handles !== []) {
            $read = null;
            $write = [];
            $except = null;
            foreach ($handles as $h) {
                $write[] = $h['fp'];
            }
            if ($write === []) {
                break;
            }

            $tvSec = 0;
            $tvUsec = 50000;
            $n = @stream_select($read, $write, $except, $tvSec, $tvUsec);
            $now = microtime(true);

            if (is_int($n) && $n > 0) {
                foreach ($write as $readyFp) {
                    foreach ($handles as $port => $h) {
                        if ($h['fp'] !== $readyFp) {
                            continue;
                        }
                        $peer = @stream_socket_get_name($readyFp, true);
                        if ($peer !== false && $peer !== '') {
                            $open[] = (int) $port;
                        }
                        fclose($readyFp);
                        unset($handles[$port]);
                        break;
                    }
                }
            }

            foreach ($handles as $port => $h) {
                if (($now - $h['start']) >= $timeoutSec) {
                    fclose($h['fp']);
                    unset($handles[$port]);
                }
            }
        }
    }

    sort($open);
    return array_values(array_unique($open));
}

/**
 * Scan the same common-port list across several devices concurrently.
 *
 * Devices are processed in bounded groups while the active socket set stays
 * below a Windows-safe stream_select size. The result is keyed by device id.
 *
 * @param array<string, string> $targets Device id => host/IP
 * @param list<int|string> $ports
 * @return array<string, list<int>>
 */
function pamantau_scan_device_ports_parallel(
    array $targets,
    array $ports,
    int $timeoutMs = 350,
    int $deviceConcurrency = 24,
    int $socketConcurrency = 60
): array {
    $cleanTargets = [];
    foreach ($targets as $id => $host) {
        $id = trim((string) $id);
        $host = trim((string) $host);
        if ($id !== '' && pamantau_is_valid_host($host)) {
            $cleanTargets[$id] = $host;
        }
    }

    $ports = pamantau_normalize_port_list($ports);
    $results = array_fill_keys(array_keys($cleanTargets), []);
    if ($cleanTargets === [] || $ports === []) {
        return $results;
    }

    $timeoutSec = min(5.0, max(0.1, $timeoutMs / 1000));
    $deviceConcurrency = min(32, max(1, $deviceConcurrency));
    $socketConcurrency = min(60, max(8, $socketConcurrency));

    // Native non-blocking sockets expose SO_ERROR, which reliably distinguishes
    // a completed connection from a refused/failed one on both Windows and Linux.
    if (!function_exists('socket_create') || !function_exists('socket_select')) {
        foreach ($cleanTargets as $id => $host) {
            $results[$id] = pamantau_scan_ports_parallel($host, $ports, $timeoutSec);
        }
        return $results;
    }

    foreach (array_chunk($cleanTargets, $deviceConcurrency, true) as $deviceBatch) {
        $preparedDevices = [];
        foreach ($deviceBatch as $id => $host) {
            $family = AF_INET;
            $socketHost = $host;
            if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                $family = AF_INET6;
            } elseif (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                $resolved = gethostbyname($host);
                if (!filter_var($resolved, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                    continue;
                }
                $socketHost = $resolved;
            }
            $preparedDevices[] = [
                'id' => (string) $id,
                'host' => $socketHost,
                'family' => $family,
            ];
        }

        // Interleave devices by port. With the Windows-safe 60 socket cap,
        // this keeps the whole 16-32 device batch active instead of allowing
        // the first few devices to consume every socket with all their ports.
        $queue = [];
        foreach ($ports as $port) {
            foreach ($preparedDevices as $device) {
                $queue[] = [
                    'id' => $device['id'],
                    'host' => $device['host'],
                    'family' => $device['family'],
                    'port' => (int) $port,
                ];
            }
        }

        $cursor = 0;
        $active = [];
        while ($cursor < count($queue) || $active !== []) {
            while ($cursor < count($queue) && count($active) < $socketConcurrency) {
                $job = $queue[$cursor++];
                $socket = @socket_create($job['family'], SOCK_STREAM, SOL_TCP);
                if ($socket === false) {
                    continue;
                }
                @socket_set_nonblock($socket);
                $connected = @socket_connect($socket, $job['host'], $job['port']);
                if ($connected) {
                    $results[$job['id']][] = (int) $job['port'];
                    socket_close($socket);
                    continue;
                }
                $active[] = [
                    'socket' => $socket,
                    'id' => $job['id'],
                    'port' => $job['port'],
                    'start' => microtime(true),
                ];
            }

            if ($active === []) {
                continue;
            }

            $read = [];
            $write = array_column($active, 'socket');
            $except = $write;
            @socket_select($read, $write, $except, 0, 50000);
            $now = microtime(true);

            foreach ($active as $index => $handle) {
                $ready = in_array($handle['socket'], $write, true)
                    || in_array($handle['socket'], $except, true);
                $timedOut = ($now - $handle['start']) >= $timeoutSec;
                if (!$ready && !$timedOut) {
                    continue;
                }

                if ($ready) {
                    $socketError = @socket_get_option($handle['socket'], SOL_SOCKET, SO_ERROR);
                    if ($socketError === 0) {
                        $results[$handle['id']][] = (int) $handle['port'];
                    }
                }
                socket_close($handle['socket']);
                unset($active[$index]);
            }
            if ($active !== []) {
                $active = array_values($active);
            }
        }
    }

    foreach ($results as &$openPorts) {
        sort($openPorts);
        $openPorts = array_values(array_unique($openPorts));
    }
    unset($openPorts);

    return $results;
}

function pamantau_parse_subnet(string $ip, string $subnet): ?array
{
    $ip = trim($ip);
    $subnet = trim($subnet);

    if ($subnet === '') {
        return null;
    }

    // Accept CIDR like 192.168.1.0/24 or just prefix length /24 or 24
    if (str_contains($subnet, '/')) {
        [$network, $prefix] = explode('/', $subnet, 2);
        $network = trim($network);
        $prefix = (int) trim($prefix);
        if (!filter_var($network, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                $network = $ip;
            } else {
                return null;
            }
        }
    } else {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return null;
        }
        $network = $ip;
        $prefix = (int) ltrim($subnet, '/');
    }

    // Prefix 16–30 accepted at parse time; huge sweeps are rejected later in
    // pamantau_subnet_targets (error, not silent truncate).
    if ($prefix < 16 || $prefix > 30) {
        return null;
    }

    $ipLong = ip2long($network);
    if ($ipLong === false) {
        return null;
    }

    $mask = $prefix === 0 ? 0 : (-1 << (32 - $prefix));
    $networkLong = $ipLong & $mask;
    $broadcastLong = $networkLong | (~$mask & 0xFFFFFFFF);

    return [
        'network' => long2ip($networkLong),
        'broadcast' => long2ip($broadcastLong),
        'prefix' => $prefix,
        'first' => $networkLong + 1,
        'last' => $broadcastLong - 1,
        'cidr' => long2ip($networkLong) . '/' . $prefix,
    ];
}

/**
 * Build the full usable-host list for a CIDR (network/broadcast excluded).
 * Does not silently truncate. Host counts above the safety ceiling return an error
 * so the UI can ask for a smaller CIDR (max usable: /20 · 4094 hosts).
 */
function pamantau_subnet_targets(string $ip, string $subnet): array
{
    $parsed = pamantau_parse_subnet($ip, $subnet);
    if ($parsed === null) {
        return ['ok' => false, 'error' => 'Subnet tidak valid. Contoh: 24 atau 192.168.1.0/24 (prefix 16-30).', 'targets' => []];
    }

    // Internal safety ceiling only (/20). Not exposed in Settings — pick a smaller CIDR.
    $safetyMaxHosts = 4094;
    $usable = (int) ($parsed['last'] - $parsed['first'] + 1);
    if ($usable > $safetyMaxHosts) {
        return [
            'ok' => false,
            'error' => 'CIDR terlalu besar (maks. /20 · 4.094 host). Pilih prefix lebih kecil.',
            'targets' => [],
        ];
    }

    $targets = [];
    for ($addr = $parsed['first']; $addr <= $parsed['last']; $addr++) {
        $hostIp = long2ip($addr);
        if ($hostIp === false || $hostIp === $ip) {
            continue;
        }
        $targets[] = $hostIp;
    }

    return [
        'ok' => true,
        'cidr' => $parsed['cidr'],
        'total' => count($targets),
        'targets' => $targets,
    ];
}

function pamantau_scan_subnet(string $ip, string $subnet, int $timeoutMs = 200): array
{
    $plan = pamantau_subnet_targets($ip, $subnet);
    if (!$plan['ok']) {
        return ['ok' => false, 'error' => $plan['error'] ?? 'Scan gagal', 'hosts' => []];
    }

    $probe = pamantau_probe_hosts($plan['targets'], $timeoutMs);

    return [
        'ok' => true,
        'cidr' => $plan['cidr'],
        'scanned' => count($plan['targets']),
        'hosts' => $probe['hosts'],
    ];
}

/**
 * Probe hosts for ICMP reachability.
 * - sequential (default): one ping at a time — more accurate for subnet discovery
 * - parallel: concurrent pings within the batch (faster; may be less accurate)
 *
 * @param list<string> $ips
 * @return array{checked:list<string>,hosts:list<array{ip:string,latency:?float}>}
 */
function pamantau_probe_hosts(array $ips, int $timeoutMs = 250, string $method = 'sequential'): array
{
    $checked = [];
    foreach ($ips as $hostIp) {
        $hostIp = trim((string) $hostIp);
        if ($hostIp !== '' && filter_var($hostIp, FILTER_VALIDATE_IP)) {
            $checked[] = $hostIp;
        }
    }
    $checked = array_values(array_unique($checked));
    if ($checked === []) {
        return ['checked' => [], 'hosts' => []];
    }

    $method = strtolower(trim($method)) === 'parallel' ? 'parallel' : 'sequential';
    if ($method === 'parallel') {
        return pamantau_probe_hosts_parallel($checked, $timeoutMs);
    }

    return pamantau_probe_hosts_sequential($checked, $timeoutMs);
}

/**
 * @param list<string> $ips
 * @return array{checked:list<string>,hosts:list<array{ip:string,latency:?float}>}
 */
function pamantau_probe_hosts_parallel(array $ips, int $timeoutMs = 250): array
{
    $map = pamantau_ping_parallel($ips, $timeoutMs);
    $hosts = [];
    foreach ($ips as $ip) {
        $r = $map[$ip] ?? null;
        if (is_array($r) && !empty($r['alive'])) {
            $hosts[] = ['ip' => $ip, 'latency' => $r['latency'] ?? null];
        }
    }

    return [
        'checked' => $ips,
        'hosts' => $hosts,
    ];
}

function pamantau_probe_hosts_sequential(array $ips, int $timeoutMs = 250): array
{
    $hosts = [];
    foreach ($ips as $ip) {
        $r = pamantau_ping($ip, $timeoutMs);
        if ($r['alive']) {
            $hosts[] = ['ip' => $ip, 'latency' => $r['latency']];
        }
    }

    return [
        'checked' => $ips,
        'hosts' => $hosts,
    ];
}

function pamantau_guess_type(string $ip, array $openPorts): string
{
    $openPorts = array_map('intval', $openPorts);

    // Mikrotik/router management & routing protocol ports.
    $routerPorts = [8291, 8728, 8729, 179, 520, 67, 68];
    foreach ($routerPorts as $port) {
        if (in_array($port, $openPorts, true)) {
            return 'router';
        }
    }

    // SSH/web/db/RDP/VNC — typical of servers & managed hosts.
    $serverPorts = [21, 22, 25, 80, 443, 110, 143, 3306, 5432, 3389, 5900, 8080, 8443];
    foreach ($serverPorts as $port) {
        if (in_array($port, $openPorts, true)) {
            return 'server';
        }
    }

    // Telnet-only management is common on ONU/optical customer devices.
    if (in_array(23, $openPorts, true)) {
        return 'onu';
    }

    return 'client';
}

function pamantau_ensure_stats(array &$stats, string $id): void
{
    if (!isset($stats[$id])) {
        $stats[$id] = [
            'ping_total' => 0,
            'ping_ok' => 0,
            'ping_fail' => 0,
            'online_samples' => 0,
            'offline_samples' => 0,
            'latency_sum' => 0.0,
            'latency_count' => 0,
            'latency_min' => null,
            'latency_max' => null,
            'last_online_at' => null,
            'last_offline_at' => null,
            'updated_at' => null,
        ];
    }
}

function pamantau_record_stats(array &$stats, string $id, bool $alive, ?float $latency): void
{
    pamantau_ensure_stats($stats, $id);
    $now = date('c');
    $stats[$id]['ping_total']++;
    $stats[$id]['updated_at'] = $now;

    if ($alive) {
        $stats[$id]['ping_ok']++;
        $stats[$id]['online_samples']++;
        $stats[$id]['last_online_at'] = $now;
        if ($latency !== null) {
            $latency = (int) round((float) $latency);
            $stats[$id]['latency_sum'] += $latency;
            $stats[$id]['latency_count']++;
            if ($stats[$id]['latency_min'] === null || $latency < $stats[$id]['latency_min']) {
                $stats[$id]['latency_min'] = $latency;
            }
            if ($stats[$id]['latency_max'] === null || $latency > $stats[$id]['latency_max']) {
                $stats[$id]['latency_max'] = $latency;
            }
        }
    } else {
        $stats[$id]['ping_fail']++;
        $stats[$id]['offline_samples']++;
        $stats[$id]['last_offline_at'] = $now;
    }
}

/**
 * Day key for daily aggregates: YYYY-MM-DD in the PHP server's default
 * timezone (on Indonesian hosts this is typically WIB / Asia/Jakarta).
 * Past days before daily recording began cannot be backfilled.
 */
function pamantau_stats_day_key(?int $ts = null): string
{
    return date('Y-m-d', $ts ?? time());
}

function pamantau_empty_daily_bucket(): array
{
    return [
        'online_samples' => 0,
        'offline_samples' => 0,
        'latency_sum' => 0.0,
        'latency_count' => 0,
        'latency_min' => null,
        'latency_max' => null,
        'poll_count' => 0,
    ];
}

function pamantau_ensure_daily_stats(array &$statsDaily, string $id, string $day): void
{
    if (!isset($statsDaily[$id]) || !is_array($statsDaily[$id])) {
        $statsDaily[$id] = [];
    }
    if (!isset($statsDaily[$id][$day]) || !is_array($statsDaily[$id][$day])) {
        $statsDaily[$id][$day] = pamantau_empty_daily_bucket();
    }
}

/**
 * Bump today's daily bucket for a device (same sample as pamantau_record_stats).
 */
function pamantau_record_daily_stats(array &$statsDaily, string $id, bool $alive, ?float $latency): void
{
    $day = pamantau_stats_day_key();
    pamantau_ensure_daily_stats($statsDaily, $id, $day);
    $bucket = &$statsDaily[$id][$day];
    $bucket['poll_count'] = (int) ($bucket['poll_count'] ?? 0) + 1;

    if ($alive) {
        $bucket['online_samples'] = (int) ($bucket['online_samples'] ?? 0) + 1;
        if ($latency !== null) {
            $latency = (int) round((float) $latency);
            $bucket['latency_sum'] = (float) ($bucket['latency_sum'] ?? 0) + $latency;
            $bucket['latency_count'] = (int) ($bucket['latency_count'] ?? 0) + 1;
            $min = $bucket['latency_min'] ?? null;
            $max = $bucket['latency_max'] ?? null;
            if ($min === null || $latency < (float) $min) {
                $bucket['latency_min'] = $latency;
            }
            if ($max === null || $latency > (float) $max) {
                $bucket['latency_max'] = $latency;
            }
        }
    } else {
        $bucket['offline_samples'] = (int) ($bucket['offline_samples'] ?? 0) + 1;
    }
    unset($bucket);
}

/**
 * Aggregate inclusive YYYY-MM-DD daily buckets for one device into a stats-like row.
 * Days with no stored bucket are skipped (not treated as zero).
 *
 * @return array{online_samples:int,offline_samples:int,latency_sum:float,latency_count:int,latency_min:int|null,latency_max:int|null,poll_count:int,has_data:bool}
 */
function pamantau_aggregate_daily_range(array $deviceDays, string $from, string $to): array
{
    $agg = pamantau_empty_daily_bucket();
    $hasData = false;

    foreach ($deviceDays as $day => $bucket) {
        $dayKey = (string) $day;
        if ($dayKey < $from || $dayKey > $to || !is_array($bucket)) {
            continue;
        }
        $hasData = true;
        $agg['online_samples'] += (int) ($bucket['online_samples'] ?? 0);
        $agg['offline_samples'] += (int) ($bucket['offline_samples'] ?? 0);
        $agg['latency_sum'] += (float) ($bucket['latency_sum'] ?? 0);
        $agg['latency_count'] += (int) ($bucket['latency_count'] ?? 0);
        $agg['poll_count'] += (int) ($bucket['poll_count'] ?? 0);

        $bMin = $bucket['latency_min'] ?? null;
        $bMax = $bucket['latency_max'] ?? null;
        if ($bMin !== null && ($agg['latency_min'] === null || (float) $bMin < (float) $agg['latency_min'])) {
            $agg['latency_min'] = (int) round((float) $bMin);
        }
        if ($bMax !== null && ($agg['latency_max'] === null || (float) $bMax > (float) $agg['latency_max'])) {
            $agg['latency_max'] = (int) round((float) $bMax);
        }
    }

    $agg['has_data'] = $hasData;
    return $agg;
}

/** @return bool True when $value matches YYYY-MM-DD. */
function pamantau_valid_date_ymd(string $value): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $value);
    return $dt instanceof DateTimeImmutable && $dt->format('Y-m-d') === $value;
}

function pamantau_avg_latency(array $row): ?int
{
    if (($row['latency_count'] ?? 0) <= 0) {
        return null;
    }
    return (int) round((float) $row['latency_sum'] / (int) $row['latency_count']);
}

/**
 * Total completed poll/ping attempts recorded for a device's stats row —
 * online + offline samples always sum to this (see pamantau_record_stats,
 * which increments exactly one of the two per call). This is the shared
 * denominator for both pamantau_online_ratio() and pamantau_offline_ratio()
 * so the two percentages always stay consistent with each other.
 */
function pamantau_poll_total(array $row): int
{
    return (int) ($row['online_samples'] ?? 0) + (int) ($row['offline_samples'] ?? 0);
}

function pamantau_online_ratio(array $row): float
{
    $total = pamantau_poll_total($row);
    if ($total <= 0) {
        return 0.0;
    }
    return round(((int) $row['online_samples'] / $total) * 100, 2);
}

function pamantau_offline_ratio(array $row): float
{
    $total = pamantau_poll_total($row);
    if ($total <= 0) {
        return 0.0;
    }
    return round(((int) $row['offline_samples'] / $total) * 100, 2);
}
