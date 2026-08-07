<?php
declare(strict_types=1);

/**
 * Install / remove Pamantau background worker in the root crontab.
 *
 * Primary target: Linux Debian/Ubuntu with Apache/php-fpm as www-data.
 * After one-time `sudo bash cli/setup-cron-access.sh`, this module calls:
 *   sudo -n cli/cronctl.sh on|off|status
 */

function pamantau_cron_app_dir(): string
{
    $dir = realpath(__DIR__ . '/..');
    return $dir !== false ? $dir : dirname(__DIR__);
}

function pamantau_cron_linux_app_dir(): string
{
    $dir = pamantau_cron_app_dir();
    if (PHP_OS_FAMILY === 'Windows' && preg_match('#^([A-Za-z]):[\\\\/](.*)$#', $dir, $m)) {
        return '/mnt/' . strtolower($m[1]) . '/' . str_replace('\\', '/', $m[2]);
    }
    return str_replace('\\', '/', $dir);
}

/** Prefer /usr/bin/php so Debian cron lines stay stable under Apache/php-fpm. */
function pamantau_cron_php_bin(): string
{
    foreach ([
        '/usr/bin/php',
        '/usr/bin/php8.4',
        '/usr/bin/php8.3',
        '/usr/bin/php8.2',
        '/usr/bin/php8.1',
        '/usr/local/bin/php',
    ] as $bin) {
        if (is_file($bin) && is_executable($bin)) {
            return $bin;
        }
    }
    $found = trim((string) @shell_exec('command -v php 2>/dev/null'));
    return $found !== '' ? $found : '/usr/bin/php';
}

function pamantau_cronctl_path(): string
{
    return pamantau_cron_app_dir() . DIRECTORY_SEPARATOR . 'cli' . DIRECTORY_SEPARATOR . 'cronctl.sh';
}

function pamantau_cron_worker_line(): string
{
    $app = pamantau_cron_linux_app_dir();
    $php = pamantau_cron_php_bin();
    return '* * * * * ' . $php . ' ' . $app . '/cli/background.php >> ' . $app . '/database/background-cron.log 2>&1';
}

function pamantau_cron_marker_path(): string
{
    return PAMANTAU_DB_DIR . '/.cron_installed';
}

function pamantau_cron_write_marker(bool $installed): void
{
    if (!is_dir(PAMANTAU_DB_DIR)) {
        @mkdir(PAMANTAU_DB_DIR, 0775, true);
    }
    $path = pamantau_cron_marker_path();
    if ($installed) {
        @file_put_contents($path, date('c') . "\n" . pamantau_cron_worker_line() . "\n");
        @chmod($path, 0644);
        return;
    }
    if (is_file($path)) {
        @unlink($path);
    }
}

function pamantau_cron_shell_available(): bool
{
    if (!function_exists('exec') || !function_exists('proc_open')) {
        return false;
    }
    $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
    foreach (['exec', 'proc_open'] as $fn) {
        if (in_array($fn, $disabled, true)) {
            return false;
        }
    }
    return true;
}

/**
 * @param list<string> $cmd
 * @return array{ok:bool,stdout:string,stderr:string,code:int}
 */
function pamantau_cron_run_command(array $cmd): array
{
    if (!pamantau_cron_shell_available()) {
        return ['ok' => false, 'stdout' => '', 'stderr' => 'shell disabled', 'code' => 1];
    }

    $stdoutFile = tempnam(sys_get_temp_dir(), 'pmcron_out_');
    $stderrFile = tempnam(sys_get_temp_dir(), 'pmcron_err_');
    if ($stdoutFile === false || $stderrFile === false) {
        return ['ok' => false, 'stdout' => '', 'stderr' => 'temp file failed', 'code' => 1];
    }

    try {
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['file', $stdoutFile, 'w'],
            2 => ['file', $stderrFile, 'w'],
        ];
        $proc = @proc_open($cmd, $descriptors, $pipes, pamantau_cron_app_dir());
        if (!is_resource($proc)) {
            return ['ok' => false, 'stdout' => '', 'stderr' => 'failed to start process', 'code' => 1];
        }
        fclose($pipes[0]);
        $code = proc_close($proc);
        return [
            'ok' => $code === 0,
            'stdout' => trim((string) @file_get_contents($stdoutFile)),
            'stderr' => trim((string) @file_get_contents($stderrFile)),
            'code' => (int) $code,
        ];
    } finally {
        @unlink($stdoutFile);
        @unlink($stderrFile);
    }
}

function pamantau_cron_setup_hint(): string
{
    $script = pamantau_cron_linux_app_dir() . '/cli/setup-cron-access.sh';
    return 'Jalankan sekali sebagai root: sudo bash ' . $script;
}

/**
 * @return array{ok:bool,stdout:string,stderr:string,code:int,via:string}
 */
function pamantau_cronctl_exec(string $action): array
{
    $cronctl = pamantau_cronctl_path();
    if (!is_file($cronctl)) {
        return [
            'ok' => false,
            'stdout' => '',
            'stderr' => 'cli/cronctl.sh missing',
            'code' => 1,
            'via' => 'missing',
        ];
    }

    if (PHP_OS_FAMILY === 'Windows') {
        $cronctlUnix = str_replace('\\', '/', $cronctl);
        // Map E:\... path already; cronctl path from Windows may be E:/...
        if (preg_match('#^([A-Za-z]):/(.*)$#', $cronctlUnix, $m)) {
            $cronctlUnix = '/mnt/' . strtolower($m[1]) . '/' . $m[2];
        }
        $bash = 'bash ' . escapeshellarg($cronctlUnix) . ' ' . escapeshellarg($action);
        $run = pamantau_cron_run_command(['wsl', '-u', 'root', '--', 'bash', '-lc', $bash]);
        $run['via'] = 'wsl-root';
        return $run;
    }

    $uid = function_exists('posix_geteuid') ? posix_geteuid() : -1;
    if ($uid === 0) {
        $direct = pamantau_cron_run_command(['bash', $cronctl, $action]);
        $direct['via'] = 'root-direct';
        return $direct;
    }

    $sudo = pamantau_cron_run_command(['sudo', '-n', $cronctl, $action]);
    if ($sudo['ok']) {
        $sudo['via'] = 'sudo-root';
        return $sudo;
    }

    $err = trim($sudo['stderr'] . ' ' . $sudo['stdout']);
    return [
        'ok' => false,
        'stdout' => $sudo['stdout'],
        'stderr' => pamantau_cron_setup_hint() . ($err !== '' ? ' (' . trim($err) . ')' : ''),
        'code' => (int) $sudo['code'],
        'via' => 'needs-setup',
    ];
}

/**
 * @return array{ok:bool,installed:bool,line:string,message:string,via:string}
 */
function pamantau_background_cron_status(): array
{
    $line = pamantau_cron_worker_line();
    $run = pamantau_cronctl_exec('status');
    $installed = $run['ok'] && (bool) preg_match('/\binstalled=1\b/', $run['stdout']);

    return [
        'ok' => $run['ok'],
        'installed' => $installed,
        'line' => $line,
        'message' => $installed
            ? 'Cron worker terpasang di root crontab'
            : ($run['stderr'] !== '' ? $run['stderr'] : 'Cron worker belum terpasang di root crontab'),
        'via' => (string) ($run['via'] ?? ''),
    ];
}

/**
 * Dependency checks for scheduled Telegram screenshots (Debian/Linux first).
 *
 * @return array{ok:bool,checks:list<array{id:string,ok:bool,detail:string}>}
 */
function pamantau_telegram_screenshot_deps(): array
{
    require_once __DIR__ . '/headless_snapshot.php';

    $checks = [];
    $push = static function (string $id, bool $ok, string $detail = '') use (&$checks): void {
        $checks[] = ['id' => $id, 'ok' => $ok, 'detail' => $detail];
    };

    $app = pamantau_cron_app_dir();
    $cronctl = pamantau_cronctl_path();
    $worker = $app . DIRECTORY_SEPARATOR . 'cli' . DIRECTORY_SEPARATOR . 'background.php';
    $scriptsOk = is_file($cronctl) && is_file($worker);
    $push(
        'scripts',
        $scriptsOk,
        $scriptsOk ? '' : 'cli/cronctl.sh atau cli/background.php tidak ditemukan'
    );

    $shellOk = pamantau_cron_shell_available();
    $push(
        'shell',
        $shellOk,
        $shellOk ? '' : 'proc_open/exec dinonaktifkan di PHP'
    );

    $crontabBin = '';
    foreach (['/usr/bin/crontab', '/bin/crontab'] as $bin) {
        if (is_file($bin) && is_executable($bin)) {
            $crontabBin = $bin;
            break;
        }
    }
    if ($crontabBin === '') {
        $found = trim((string) @shell_exec('command -v crontab 2>/dev/null'));
        if ($found !== '' && is_file($found)) {
            $crontabBin = $found;
        }
    }
    $push(
        'cron',
        $crontabBin !== '',
        $crontabBin !== '' ? $crontabBin : 'sudo apt install cron'
    );

    $accessRun = pamantau_cronctl_exec('status');
    $accessOk = !empty($accessRun['ok']);
    $accessVia = (string) ($accessRun['via'] ?? '');
    $push(
        'cron_access',
        $accessOk,
        $accessOk
            ? ($accessVia !== '' ? 'via ' . $accessVia : '')
            : pamantau_cron_setup_hint()
    );

    $phpBin = pamantau_cron_php_bin();
    $phpOk = $phpBin !== '' && is_file($phpBin) && is_executable($phpBin);
    $push(
        'php_cli',
        $phpOk,
        $phpOk ? $phpBin : 'sudo apt install php-cli'
    );

    $browser = pamantau_headless_browser_executable();
    $browserOk = $browser !== '';
    $push(
        'chromium',
        $browserOk,
        $browserOk ? $browser : 'sudo apt install chromium'
    );

    $baseUrl = pamantau_headless_base_url();
    $baseOk = $baseUrl !== '';
    $push(
        'base_url',
        $baseOk,
        $baseOk ? $baseUrl : 'Buka dashboard sekali di server lokal'
    );

    $settings = pamantau_normalize_settings(pamantau_read('settings', []));
    $tgEnabled = !empty($settings['telegram_enabled']);
    $tgToken = trim((string) ($settings['telegram_bot_token'] ?? ''));
    $tgChat = trim((string) ($settings['telegram_chat_id'] ?? ''));
    $tgOk = $tgEnabled && $tgToken !== '' && $tgChat !== '';
    $tgDetail = '';
    if (!$tgEnabled) {
        $tgDetail = 'Aktifkan Telegram di Pengaturan Telegram';
    } elseif ($tgToken === '' || $tgChat === '') {
        $tgDetail = 'Isi Bot Token & Chat ID';
    }
    $push('telegram', $tgOk, $tgDetail);

    $allOk = true;
    foreach ($checks as $check) {
        if (empty($check['ok'])) {
            $allOk = false;
            break;
        }
    }

    return ['ok' => $allOk, 'checks' => $checks];
}

/**
 * @return array{ok:bool,installed:bool,line:string,message:string,via:string}
 */
function pamantau_background_cron_sync(bool $enabled): array
{
    $line = pamantau_cron_worker_line();
    $run = pamantau_cronctl_exec($enabled ? 'on' : 'off');

    if (!$run['ok']) {
        pamantau_cron_write_marker(false);
        $err = $run['stderr'] !== '' ? $run['stderr'] : ('exit ' . $run['code']);
        return [
            'ok' => false,
            'installed' => false,
            'line' => $line,
            'message' => 'Gagal mengatur cron root: ' . $err,
            'via' => (string) ($run['via'] ?? ''),
        ];
    }

    pamantau_cron_write_marker($enabled);
    return [
        'ok' => true,
        'installed' => $enabled,
        'line' => $line,
        'message' => $enabled ? 'Cron worker dipasang ke root crontab' : 'Cron worker dihapus dari root crontab',
        'via' => (string) ($run['via'] ?? ''),
    ];
}
