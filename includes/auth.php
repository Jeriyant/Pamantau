<?php
declare(strict_types=1);

function pamantau_auth_boot(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $isHttps = (
        (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
    );

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_name('pamantau_session');
    session_start();
}

function pamantau_auth_attempts_path(): string
{
    return PAMANTAU_DB_DIR . '/auth_attempts.json';
}

function pamantau_auth_attempts_load(): array
{
    $data = pamantau_read_json_file(pamantau_auth_attempts_path(), []);
    return is_array($data) ? $data : [];
}

function pamantau_auth_attempts_save(array $attempts): void
{
    if (!is_dir(PAMANTAU_DB_DIR)) {
        mkdir(PAMANTAU_DB_DIR, 0775, true);
    }

    $json = json_encode($attempts, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }

    $fp = fopen(pamantau_auth_attempts_path(), 'cb');
    if ($fp === false) {
        return;
    }

    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, $json);
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function pamantau_auth_attempt_key(): string
{
    $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    return $ip !== '' ? $ip : 'unknown';
}

function pamantau_auth_prune_attempts(array $attempts): array
{
    $cutoff = time() - 900;
    $clean = [];
    foreach ($attempts as $key => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $rawFailures = is_array($entry['failures'] ?? null) ? $entry['failures'] : [];
        $failures = array_values(array_filter(
            array_map('intval', $rawFailures),
            static fn(int $ts): bool => $ts >= $cutoff
        ));
        if ($failures !== []) {
            $clean[(string) $key] = ['failures' => $failures];
        }
    }
    return $clean;
}

function pamantau_auth_rate_limit_status(): array
{
    $attempts = pamantau_auth_prune_attempts(pamantau_auth_attempts_load());
    $key = pamantau_auth_attempt_key();
    $rawFailures = is_array($attempts[$key]['failures'] ?? null) ? $attempts[$key]['failures'] : [];
    $failures = array_values(array_map('intval', $rawFailures));
    $remaining = max(0, 5 - count($failures));
    $locked = count($failures) >= 5;
    $retryAfter = $locked ? max(1, 900 - (time() - min($failures))) : 0;

    return [
        'locked' => $locked,
        'remaining' => $remaining,
        'retry_after' => $retryAfter,
    ];
}

function pamantau_auth_record_failure(): array
{
    $attempts = pamantau_auth_prune_attempts(pamantau_auth_attempts_load());
    $key = pamantau_auth_attempt_key();
    $rawFailures = is_array($attempts[$key]['failures'] ?? null) ? $attempts[$key]['failures'] : [];
    $failures = array_values(array_map('intval', $rawFailures));
    $failures[] = time();
    $attempts[$key] = ['failures' => $failures];
    $attempts = pamantau_auth_prune_attempts($attempts);
    pamantau_auth_attempts_save($attempts);
    return pamantau_auth_rate_limit_status();
}

function pamantau_auth_clear_failures(): void
{
    $attempts = pamantau_auth_prune_attempts(pamantau_auth_attempts_load());
    $key = pamantau_auth_attempt_key();
    unset($attempts[$key]);
    pamantau_auth_attempts_save($attempts);
}

function pamantau_auth_ensure_bootstrap(): void
{
    $store = pamantau_load_store();
    $auth = is_array($store['auth'] ?? null) ? $store['auth'] : [];
    $username = trim((string) ($auth['username'] ?? ''));
    $hash = trim((string) ($auth['password_hash'] ?? ''));

    if ($username !== '' && $hash !== '') {
        return;
    }

    $store['auth'] = [
        'username' => 'admin',
        'password_hash' => password_hash('pamantau', PASSWORD_DEFAULT),
    ];
    pamantau_save_store($store);
}

function pamantau_auth_verify(string $user, string $pass): bool
{
    $auth = pamantau_read('auth', []);
    if (!is_array($auth)) {
        return false;
    }

    $storedUser = trim((string) ($auth['username'] ?? ''));
    $hash = (string) ($auth['password_hash'] ?? '');
    if ($storedUser === '' || $hash === '') {
        return false;
    }

    return hash_equals($storedUser, trim($user)) && password_verify($pass, $hash);
}

function pamantau_auth_logged_in(): bool
{
    return !empty($_SESSION['pamantau_user']) && is_string($_SESSION['pamantau_user']);
}

function pamantau_auth_login(string $username): void
{
    $_SESSION['pamantau_user'] = $username;
    session_regenerate_id(true);
}

function pamantau_auth_logout(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        pamantau_auth_boot();
    }

    $_SESSION = [];

    // Expire the browser cookie (must happen before any response body/headers lock).
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        $path = ($params['path'] ?? '') !== '' ? (string) $params['path'] : '/';
        $domain = (string) ($params['domain'] ?? '');
        $secure = (bool) ($params['secure'] ?? false);
        $httponly = (bool) ($params['httponly'] ?? true);
        $samesite = (string) ($params['samesite'] ?? 'Lax');
        $name = session_name();
        $expire = time() - 42000;

        setcookie($name, '', [
            'expires' => $expire,
            'path' => $path,
            'domain' => $domain,
            'secure' => $secure,
            'httponly' => $httponly,
            'samesite' => $samesite,
        ]);

        // Also clear common path variants in case an older cookie used a subpath.
        if ($path !== '/') {
            setcookie($name, '', [
                'expires' => $expire,
                'path' => '/',
                'domain' => $domain,
                'secure' => $secure,
                'httponly' => $httponly,
                'samesite' => $samesite,
            ]);
        }
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
}

function pamantau_auth_require(): void
{
    if (pamantau_auth_logged_in()) {
        return;
    }

    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => 'Unauthorized',
        'auth' => pamantau_auth_public_payload(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function pamantau_auth_public_payload(): array
{
    $auth = pamantau_read('auth', []);
    $storedUsername = is_array($auth) ? trim((string) ($auth['username'] ?? '')) : '';
    $sessionUsername = pamantau_auth_logged_in() ? (string) $_SESSION['pamantau_user'] : '';

    return [
        'username' => $sessionUsername !== '' ? $sessionUsername : $storedUsername,
        'logged_in' => pamantau_auth_logged_in(),
    ];
}
