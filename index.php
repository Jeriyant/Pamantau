<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/topology_snapshot.php';

pamantau_auth_boot();
pamantau_auth_ensure_bootstrap();

$pamantauHeadlessToken = trim((string) ($_GET['headless_snapshot'] ?? ''));
$pamantauHeadlessMode = $pamantauHeadlessToken !== ''
  && pamantau_headless_token_valid($pamantauHeadlessToken);

if (!$pamantauHeadlessMode && !pamantau_auth_logged_in()) {
  header('Location: login.php');
  exit;
}

pamantau_record_runtime_base_url();
$pamantauAuth = $pamantauHeadlessMode
  ? ['username' => '', 'logged_in' => false]
  : pamantau_auth_public_payload();
?>
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Pamantau</title>
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="assets/img/logo.svg" />
  <link rel="stylesheet" href="assets/css/app.css?v=<?= (int) @filemtime(__DIR__ . '/assets/css/app.css') ?>" />
  <link rel="stylesheet" href="assets/css/update.css?v=<?= (int) @filemtime(__DIR__ . '/assets/css/update.css') ?>" />
<?php
  $pamantauVersionFile = __DIR__ . '/version.json';
  $pamantauVersion = '1.7.3';
  if (is_file($pamantauVersionFile)) {
    $vj = json_decode((string) @file_get_contents($pamantauVersionFile), true);
    if (is_array($vj) && !empty($vj['version'])) {
      $pamantauVersion = (string) $vj['version'];
    }
  }
?>
  <script>window.PAMANTAU_VERSION = <?= json_encode($pamantauVersion, JSON_UNESCAPED_UNICODE) ?>;</script>
  <script>window.PAMANTAU_AUTH = <?= json_encode($pamantauAuth, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;</script>
  <script>window.PAMANTAU_HEADLESS_SNAPSHOT_TOKEN = <?= json_encode($pamantauHeadlessMode ? $pamantauHeadlessToken : '', JSON_UNESCAPED_SLASHES) ?>;</script>
</head>
<body>
  <div id="app">
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand">
          <img class="brand-logo" src="assets/img/logo.svg" width="44" height="44" alt="Logo Pamantau" />
          <div>
            <h1>Pamantau <button type="button" class="brand-version" id="appVersionBadge" title="Cek update" data-i18n-title="update.check_now">v<?= htmlspecialchars($pamantauVersion, ENT_QUOTES, 'UTF-8') ?></button></h1>
            <p id="docLabel" data-i18n="brand.tagline">Monitor topologi langsung</p>
          </div>
        </div>

        <div class="toolbar" role="toolbar" aria-label="Toolbar utama" data-i18n-aria="toolbar.main">
          <div class="tool-group file-menu-wrap">
            <button type="button" class="icon-tool" id="btnFile" title="File" data-i18n-title="file.menu" aria-haspopup="true" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L18.5 9v11.5A1.5 1.5 0 0 1 17 22H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              <span data-i18n="file.menu">File</span>
            </button>
            <div id="fileMenu" class="file-menu hidden" role="menu">
              <button type="button" data-file="new" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L18.5 9v11.5A1.5 1.5 0 0 1 17 22H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 13v6M9 16h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="file.new">Baru</span>
              </button>
              <button type="button" data-file="open" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 9.5V7.2A1.7 1.7 0 0 1 5.2 5.5h4.1l1.6 2H18.8A1.7 1.7 0 0 1 20.5 9.2v.3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3.5 11h17l-1.3 8.2a1.7 1.7 0 0 1-1.7 1.4H6.5a1.7 1.7 0 0 1-1.7-1.4L3.5 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
                <span data-i18n="file.open">Buka</span>
              </button>
              <div class="menu-sep"></div>
              <button type="button" data-file="save" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 3.5h10.2L19.5 7.3V19.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 3.5v4.5h7.5V3.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 20.5v-5.5h8v5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
                <span data-i18n="file.save">Simpan</span>
              </button>
              <button type="button" data-file="save-as" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L18.5 9v3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M5.5 3.5v15A1.5 1.5 0 0 0 7 20h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M14 14v7M11 18l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span data-i18n="file.save_as">Simpan sebagai (ekspor)</span>
              </button>
              <div class="menu-sep"></div>
              <button type="button" data-file="print" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 9V4h10v5M7 15H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M7 13h10v7H7z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span data-i18n="file.print">Cetak</span>
              </button>
              <div class="menu-sep"></div>
              <div class="menu-label" data-i18n="file.export_img">Export gambar</div>
              <button type="button" data-file="export-jpg" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10.5" r="1.8" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 16.5 8.5 12l3 2.5 3.2-3.8 5 5.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span data-i18n="file.export_jpg">Export JPG</span>
              </button>
              <button type="button" data-file="export-png" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10.5" r="1.8" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 16.5 8.5 12l3 2.5 3.2-3.8 5 5.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 7h3.5v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span data-i18n="file.export_png">Export PNG</span>
              </button>
            </div>
            <input type="file" id="importFile" accept="application/json,.json" class="hidden" />
          </div>

          <div class="tool-group file-menu-wrap">
            <button type="button" class="icon-tool" id="btnQuick" title="Quick" data-i18n-title="quick.menu" aria-haspopup="true" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4.5 13.2c-.35.46-.03 1.1.55 1.1H11l-1 7.7c-.08.6.7.95 1.1.5L20.5 10.3c.38-.45.05-1.15-.55-1.15H13l1-6.65c.08-.55-.65-.9-1-.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
              <span data-i18n="quick.menu">Quick</span>
            </button>
            <div id="quickMenu" class="file-menu quick-menu hidden" role="menu">
              <button type="button" data-quick="import-excel" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L18.5 9v11.5A1.5 1.5 0 0 1 17 22H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 14.5h7M12 11v7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="quick.import">Import Excel</span>
              </button>
              <button type="button" data-quick="export-excel" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L18.5 9v11.5A1.5 1.5 0 0 1 17 22H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 14.5h7M12 18v-7M9.5 13.5 12 11l2.5 2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span data-i18n="quick.export">Export Excel</span>
              </button>
              <button type="button" data-quick="template" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L18.5 9v11.5A1.5 1.5 0 0 1 17 22H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 13h7M8.5 16.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="quick.template">Template</span>
              </button>
            </div>
            <input type="file" id="importExcelFile" accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" class="hidden" />
          </div>

          <div class="tool-group file-menu-wrap">
            <button type="button" class="icon-tool" id="btnReports" title="Laporan" data-i18n-title="reports.menu" aria-haspopup="true" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V10M10 19V5M15 19v-6M20 19V8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 19.5h17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              <span data-i18n="reports.menu">Laporan</span>
            </button>
            <div id="reportsMenu" class="file-menu reports-menu hidden" role="menu">
              <button type="button" data-report="status" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="reports.status">Status</span>
              </button>
              <button type="button" data-report="latency" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4.5l3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span data-i18n="reports.latency">Latency</span>
              </button>
              <button type="button" data-report="ports" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 9h3M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="reports.ports">Port</span>
              </button>
              <button type="button" data-report="individual" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 19c.8-3.5 3-5.5 6.5-5.5s5.7 2 6.5 5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="reports.individual">Individu</span>
              </button>
            </div>
          </div>

          <div class="tool-group file-menu-wrap">
            <button type="button" class="icon-tool" id="btnNotif" title="Notifikasi" data-i18n-title="notif.menu" aria-haspopup="true" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.5a5 5 0 0 1 5 5v2.2c0 .7.2 1.4.6 2l1.1 1.5c.5.7 0 1.8-.9 1.8H6.2c-.9 0-1.4-1.1-.9-1.8l1.1-1.5c.4-.6.6-1.3.6-2V9.5a5 5 0 0 1 5-5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              <span data-i18n="notif.menu">Notifikasi</span>
            </button>
            <div id="notifMenu" class="file-menu notif-menu hidden" role="menu">
              <div class="file-submenu-wrap" id="telegramMenuWrap">
                <button type="button" class="file-submenu-trigger" id="btnTelegramSub" aria-haspopup="true" aria-expanded="false">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 5 3 11.5l6.2 2.1L18 8l-7.2 7.4L11 21 21 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
                  <span data-i18n="notif.telegram">Telegram</span>
                  <span class="ctx-chevron" aria-hidden="true">›</span>
                </button>
                <div id="telegramMenu" class="file-submenu" role="menu">
                  <button type="button" data-telegram="updown" role="menuitem">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 14.5 12 19.5 17 14.5M7 9.5 12 4.5 17 9.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span data-i18n="notif.updown">Online/Offline</span>
                  </button>
                  <button type="button" data-telegram="screenshot" role="menuitem">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12.5" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 6.5 9.8 4.5h4.4L15.5 6.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
                    <span data-i18n="notif.screenshot">Screenshot</span>
                  </button>
                  <button type="button" data-telegram="settings" role="menuitem">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 13.1a1.4 1.4 0 0 0 .28 1.54l.06.06a1.7 1.7 0 1 1-2.4 2.4l-.06-.06a1.4 1.4 0 0 0-1.54-.28 1.4 1.4 0 0 0-.85 1.28V18a1.7 1.7 0 1 1-3.4 0v-.1a1.4 1.4 0 0 0-.9-1.28 1.4 1.4 0 0 0-1.54.28l-.06.06a1.7 1.7 0 1 1-2.4-2.4l.06-.06a1.4 1.4 0 0 0 .28-1.54 1.4 1.4 0 0 0-1.28-.85H6a1.7 1.7 0 1 1 0-3.4h.1a1.4 1.4 0 0 0 1.28-.9 1.4 1.4 0 0 0-.28-1.54l-.06-.06a1.7 1.7 0 1 1 2.4-2.4l.06.06a1.4 1.4 0 0 0 1.54.28h.05A1.4 1.4 0 0 0 12 4.1V4a1.7 1.7 0 1 1 3.4 0v.1a1.4 1.4 0 0 0 .85 1.28h.05a1.4 1.4 0 0 0 1.54-.28l.06-.06a1.7 1.7 0 1 1 2.4 2.4l-.06.06a1.4 1.4 0 0 0-.28 1.54v.05a1.4 1.4 0 0 0 1.28.85H20a1.7 1.7 0 1 1 0 3.4h-.1a1.4 1.4 0 0 0-1.28.85Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
                    <span data-i18n="notif.tg_settings">Pengaturan</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button type="button" class="icon-tool" id="btnSettings" title="Pengaturan" data-i18n-title="nav.settings">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.1a1.4 1.4 0 0 0 .28 1.54l.06.06a1.7 1.7 0 1 1-2.4 2.4l-.06-.06a1.4 1.4 0 0 0-1.54-.28 1.4 1.4 0 0 0-.85 1.28V18a1.7 1.7 0 1 1-3.4 0v-.1a1.4 1.4 0 0 0-.9-1.28 1.4 1.4 0 0 0-1.54.28l-.06.06a1.7 1.7 0 1 1-2.4-2.4l.06-.06a1.4 1.4 0 0 0 .28-1.54 1.4 1.4 0 0 0-1.28-.85H6a1.7 1.7 0 1 1 0-3.4h.1a1.4 1.4 0 0 0 1.28-.9 1.4 1.4 0 0 0-.28-1.54l-.06-.06a1.7 1.7 0 1 1 2.4-2.4l.06.06a1.4 1.4 0 0 0 1.54.28h.05A1.4 1.4 0 0 0 12 4.1V4a1.7 1.7 0 1 1 3.4 0v.1a1.4 1.4 0 0 0 .85 1.28h.05a1.4 1.4 0 0 0 1.54-.28l.06-.06a1.7 1.7 0 1 1 2.4 2.4l-.06.06a1.4 1.4 0 0 0-.28 1.54v.05a1.4 1.4 0 0 0 1.28.85H20a1.7 1.7 0 1 1 0 3.4h-.1a1.4 1.4 0 0 0-1.28.85Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            <span data-i18n="nav.settings">Pengaturan</span>
          </button>

          <span class="tool-sep" aria-hidden="true"></span>

          <button type="button" class="icon-tool" id="btnLogout" title="Logout" data-i18n-title="auth.logout">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 8.5 17 12l-4 3.5M8 12h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span data-i18n="auth.logout">Logout</span>
          </button>
        </div>
      </div>

      <div class="top-actions">
        <div class="topbar-uptime" id="serverUptime" title="Waktu Aktif" data-i18n-title="uptime.title" aria-label="Waktu Aktif" data-i18n-aria="uptime.title">
          <span class="topbar-uptime-label" data-i18n="uptime.label">Waktu Aktif</span>
          <span class="topbar-uptime-value" id="serverUptimeValue">—</span>
        </div>
        <div class="user-chip" id="topUserChip"><?= htmlspecialchars((string) ($pamantauAuth['username'] ?? ''), ENT_QUOTES, 'UTF-8') ?></div>
        <div class="poll-meter" id="pollMeter" role="button" tabindex="0" aria-pressed="true" title="Klik untuk on/off polling" data-i18n-title="poll.title" aria-label="Polling aktif" data-i18n-aria="poll.aria_on">
          <span class="poll-ring" aria-hidden="true">
            <svg viewBox="0 0 28 28" width="28" height="28">
              <circle class="poll-ring-track" cx="14" cy="14" r="11" fill="none" />
              <circle class="poll-ring-progress" id="pollRing" cx="14" cy="14" r="11" fill="none" />
            </svg>
            <span class="dot" id="pollDot"></span>
          </span>
          <span id="pollLabel">Siaga 5s</span>
        </div>
      </div>
    </header>

    <div id="updateBanner" class="update-banner hidden" role="status" aria-live="polite"></div>

    <aside class="palette" id="palette">
      <div class="palette-bar">
        <div class="palette-topbar">
          <button type="button" class="icon-tool palette-toggle" id="btnTogglePalette" title="Sembunyikan komponen" data-i18n-title="palette.hide" aria-label="Sembunyikan komponen" data-i18n-aria="palette.hide" aria-expanded="true" aria-controls="palette">
            <svg class="ico-menu" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <svg class="ico-komponen" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <div class="palette-doc" id="paletteDoc" title="">
            <input type="text" class="palette-doc-name" id="paletteDocName" value="" placeholder="Untitled" data-i18n-placeholder="palette.untitled" maxlength="80" spellcheck="false" autocomplete="off" aria-label="Nama proyek" data-i18n-aria="palette.doc_name" title="Klik untuk edit nama proyek" data-i18n-title="palette.doc_edit" />
            <span class="palette-doc-status is-unsaved" id="paletteDocStatus" data-i18n="doc.unsaved">Belum disimpan</span>
          </div>
          <button type="button" class="icon-tool palette-pin" id="btnPinPalette" title="Sematkan panel" data-i18n-title="palette.pin" aria-label="Sematkan panel" data-i18n-aria="palette.pin" aria-pressed="false">
            <svg class="ico-pin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 3.5h6l-.75 5.1L17.5 12.2V14.5h-11v-2.3L9.75 8.6 9 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 14.5V20.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <svg class="ico-pin-filled" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 3.5h6l-.75 5.1L17.5 12.2V14.5h-11v-2.3L9.75 8.6 9 3.5z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 14.5V20.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
        <h2 data-i18n="palette.title">Komponen</h2>
      </div>
      <div class="palette-list" id="paletteList"></div>
    </aside>

    <main class="stage-wrap">
      <canvas id="stage"></canvas>
      <div id="deviceHoverTip" class="device-hover-tip" role="tooltip" aria-hidden="true"></div>

      <div class="stage-dock-host" id="stageDockHost">
        <button type="button" class="stage-dock-toggle" id="stageDockToggle" aria-expanded="false" aria-controls="stageDock" title="Kontrol kanvas" data-i18n-title="dock.canvas" data-i18n-aria="dock.canvas" aria-label="Kontrol kanvas">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <div class="stage-dock" id="stageDock" aria-label="Kontrol kanvas" data-i18n-aria="dock.canvas">
          <button type="button" class="dock-btn" id="btnZoomIn" title="Perbesar" data-i18n-title="dock.zoom_in">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <div class="zoom-rail">
            <div class="zoom-track" aria-hidden="true">
              <div class="zoom-fill" id="zoomFill"></div>
              <div class="zoom-thumb" id="zoomThumb"></div>
            </div>
            <input type="range" id="zoomSlider" class="zoom-slider" min="45" max="220" step="1" value="100" aria-label="Zoom" />
          </div>
          <button type="button" class="dock-btn" id="btnZoomOut" title="Perkecil" data-i18n-title="dock.zoom_out">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <button type="button" class="dock-pct" id="btnZoomReset" title="Reset zoom 100%" data-i18n-title="dock.zoom_reset">100%</button>
          <button type="button" class="dock-btn" id="btnZoomFit" title="Sesuaikan ke tampilan" data-i18n-title="dock.zoom_fit">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="dock-sep" aria-hidden="true"></span>
          <button type="button" class="dock-btn" id="btnLockLayout" title="Kunci layout" data-i18n-title="dock.lock" aria-pressed="false">
            <svg class="ico-unlock" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 7.5-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 15v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <svg class="ico-lock" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 15v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <div class="stage-copy">Copyright © JERIYANT - BARAMCITY</div>
    </main>
  </div>

  <div id="modalProps" class="modal hidden" aria-hidden="true">
    <div class="modal-card props-card">
      <header>
        <h2 id="propsModalTitle" data-i18n="props.title">Properties</h2>
        <div class="props-header-actions">
          <button type="button" class="btn save hidden" id="btnPropsSave">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13.5 9.5 18 19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="props.save">Simpan</span>
          </button>
          <button type="button" class="btn danger hidden" id="btnPropsDelete">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M8 7l.7 12.2a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="props.delete">Hapus</span>
          </button>
          <button type="button" class="icon-btn close" id="btnCloseProps" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </header>
      <div class="props-modal-body" id="inspector">
        <div id="multiSelectNote" class="multi-note hidden"></div>
        <form id="propsForm" class="props-form">
          <label><span data-i18n="prop.label">Label</span>
            <input type="text" id="propLabel" autocomplete="off" />
          </label>
          <label><span data-i18n="prop.ip">IP / Host</span>
            <input type="text" id="propIp" autocomplete="off" />
          </label>
          <label><span data-i18n="prop.type">Type</span>
            <select id="propType">
              <option value="web">Web</option>
              <option value="internet">Internet</option>
              <option value="vpn">VPN</option>
              <option value="server">Server</option>
              <option value="database">Database</option>
              <option value="loadbalance">Load Balance</option>
              <option value="router">Router</option>
              <option value="olt">OLT</option>
              <option value="onu">ONU</option>
              <option value="printer">Printer</option>
              <option value="client">Client</option>
            </select>
          </label>
          <label><span data-i18n="prop.comment">Komentar</span>
            <textarea id="propComment" rows="3"></textarea>
          </label>

          <div class="live-box">
            <div><span data-i18n="prop.status">Status</span><strong id="liveStatus">—</strong></div>
            <div><span data-i18n="prop.latency">Latency</span><strong id="liveLatency">—</strong></div>
            <div><span data-i18n="prop.service">Service</span><strong id="liveServices">—</strong></div>
            <div><span data-i18n="prop.poll_count">Jumlah Ping</span><strong id="livePollCount">—</strong></div>
          </div>

          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true">Simpan</button>
        </form>

        <form id="linkPropsForm" class="props-form">
          <label><span data-i18n="link.type">Tipe</span>
            <div class="link-type-select-wrap">
              <span class="link-type-swatch" id="linkTypeSwatch" aria-hidden="true"></span>
              <select id="linkType"></select>
            </div>
          </label>
          <label><span data-i18n="prop.label">Label</span>
            <input type="text" id="linkLabel" autocomplete="off" />
          </label>
          <label><span data-i18n="prop.comment">Komentar</span>
            <textarea id="linkComment" rows="3"></textarea>
          </label>
          <div class="live-box">
            <div><span data-i18n="link.from">Dari</span><strong id="linkFrom">—</strong></div>
            <div><span data-i18n="link.to">Ke</span><strong id="linkTo">—</strong></div>
          </div>
          <button type="submit" class="hidden" tabindex="-1" aria-hidden="true">Simpan</button>
        </form>

        <p class="empty-props" id="emptyProps" data-i18n="props.empty">Tidak ada item untuk diedit.</p>
      </div>
    </div>
  </div>

  <div id="modalScanSubnet" class="modal hidden" aria-hidden="true">
    <div class="modal-card scan-card">
      <header>
        <h2 data-i18n="scan.subnet">Scan Subnet</h2>
        <button type="button" class="icon-btn close" id="btnCloseScanSubnet" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="scan-modal-body">
        <p class="scan-target-info" id="scanSubnetTargetInfo" data-i18n="scan.target">Target: —</p>
        <form id="scanSubnetForm" class="props-form show">
          <div class="settings-grid">
            <label><span data-i18n="scan.network">Alamat network</span>
              <input type="text" id="scanCidrNetwork" placeholder="192.168.96.0" autocomplete="off" />
            </label>
            <label><span data-i18n="scan.prefix">Prefix</span>
              <select id="scanCidrPrefix">
                <option value="20">/20 · 4.094 host</option>
                <option value="22">/22 · 1.022 host</option>
                <option value="24" selected>/24 · 254 host</option>
                <option value="25">/25 · 126 host</option>
                <option value="26">/26 · 62 host</option>
                <option value="27">/27 · 30 host</option>
                <option value="28">/28 · 14 host</option>
                <option value="29">/29 · 6 host</option>
                <option value="30">/30 · 2 host</option>
              </select>
            </label>
          </div>
          <p class="scan-cidr-preview" id="scanCidrPreview" data-i18n="scan.cidr_preview">CIDR: —</p>
          <div class="scan-modal-actions">
            <button type="submit" class="btn primary">
              <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 7.2v9.6l8.4-4.8L9 7.2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
              <span class="btn-label" data-i18n="scan.start">Mulai Scan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div id="modalScanResults" class="modal hidden" aria-hidden="true">
    <div class="modal-card scan-results-card">
      <header>
        <h2 data-i18n="scan.results">Hasil Scan Subnet</h2>
        <button type="button" class="icon-btn close" id="btnCloseScanResults" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="scan-results-body">
        <p class="scan-results-summary" id="scanResultsSummary">—</p>
        <div class="scan-results-table-wrap">
          <table id="scanResultsTable">
            <thead>
              <tr>
                <th class="col-check"><input type="checkbox" id="scanResultsSelectAll" title="Pilih semua" data-i18n-title="scan.select_all" /></th>
                <th data-i18n="scan.col_ip">IP</th>
                <th data-i18n="scan.col_latency">Latency</th>
                <th data-i18n="scan.col_type">Tipe</th>
                <th data-i18n="scan.col_label">Label</th>
                <th data-i18n="scan.col_status">Status</th>
                <th data-i18n="scan.col_port">Port</th>
              </tr>
            </thead>
            <tbody id="scanResultsRows"></tbody>
          </table>
        </div>
      </div>
      <div class="prop-actions scan-modal-actions scan-results-actions">
        <button type="button" class="btn primary" id="btnConfirmScanResults">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/></svg>
          <span class="btn-label" data-i18n="scan.add_topo">Tambahkan ke Topologi</span>
        </button>
        <button type="button" class="btn rescan" id="btnRescanSubnet">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 5v4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 19v-4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" data-i18n="scan.rescan">Scan Ulang</span>
        </button>
      </div>
    </div>
  </div>

  <div id="modalPing" class="modal hidden" aria-hidden="true">
    <div class="modal-card ping-card">
      <header>
        <h2 data-i18n="ping.title">Ping</h2>
        <button type="button" class="icon-btn close" id="btnClosePing" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="ping-modal-body">
        <div class="ping-terminal" id="pingTerminal">
          <div class="ping-terminal-titlebar">
            <span class="ping-terminal-dot" id="pingTerminalDot"></span>
            <span class="ping-terminal-title" id="pingTerminalTitle" data-i18n="ping.terminal">Terminal</span>
            <span class="ping-terminal-status" id="pingTerminalStatus">Siap</span>
          </div>
          <div class="ping-terminal-output" id="pingTerminalOutput" role="log" aria-live="polite" aria-label="Hasil ping" data-i18n-aria="ping.output"></div>
        </div>
      </div>
      <div class="prop-actions scan-modal-actions">
        <button type="button" class="btn ghost" id="btnCapturePing" disabled title="Salin screenshot terminal ke clipboard" data-i18n-title="ping.capture_title">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 6.5 9.8 4.5h4.4l1.3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" data-i18n="ping.capture">Capture</span>
        </button>
        <button type="button" class="btn primary" id="btnRestartPing" disabled>
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 5v4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" data-i18n="ping.repeat">Ulangi</span>
        </button>
      </div>
    </div>
  </div>

  <div id="modalTraceroute" class="modal hidden" aria-hidden="true">
    <div class="modal-card ping-card traceroute-card">
      <header>
        <h2 data-i18n="tr.title">Traceroute</h2>
        <button type="button" class="icon-btn close" id="btnCloseTraceroute" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="ping-modal-body">
        <div class="ping-terminal" id="tracerouteTerminal">
          <div class="ping-terminal-titlebar">
            <span class="ping-terminal-dot" id="tracerouteTerminalDot"></span>
            <span class="ping-terminal-title" id="tracerouteTerminalTitle" data-i18n="ping.terminal">Terminal</span>
            <span class="ping-terminal-status" id="tracerouteTerminalStatus">Siap</span>
          </div>
          <div class="ping-terminal-output" id="tracerouteTerminalOutput" role="log" aria-live="polite" aria-label="Hasil traceroute" data-i18n-aria="tr.output"></div>
        </div>
      </div>
      <div class="prop-actions scan-modal-actions">
        <button type="button" class="btn ghost" id="btnCaptureTraceroute" disabled title="Salin screenshot terminal ke clipboard" data-i18n-title="ping.capture_title">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 6.5 9.8 4.5h4.4l1.3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" data-i18n="ping.capture">Capture</span>
        </button>
        <button type="button" class="btn primary" id="btnRestartTraceroute" disabled>
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 5v4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" data-i18n="ping.repeat">Ulangi</span>
        </button>
      </div>
    </div>
  </div>

  <div id="modalScanPorts" class="modal hidden" aria-hidden="true">
    <div class="modal-card ping-card scan-ports-card">
      <header>
        <h2 data-i18n="scan.port">Scan Port</h2>
        <button type="button" class="icon-btn close" id="btnCloseScanPorts" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="scan-ports-body">
        <p class="scan-target-info" id="scanPortsTargetInfo" data-i18n="scan.target">Target: —</p>
        <label class="scan-ports-range-field"><span data-i18n="scan.port_range">Rentang port</span>
          <input type="text" id="scanPortsRange" value="1-1024" autocomplete="off" spellcheck="false" />
        </label>
        <div class="scan-ports-results-wrap" id="scanPortsResultsWrap">
          <div class="scan-ports-loading hidden" id="scanPortsLoading">
            <span class="scan-ports-spinner" aria-hidden="true"></span>
            <span class="scan-ports-elapsed" id="scanPortsElapsed" aria-live="polite">0s</span>
          </div>
          <ul class="ping-results-list" id="scanPortsResultsList"></ul>
          <p class="scan-ports-empty hidden" id="scanPortsEmpty" data-i18n="scan.port_empty">Belum ada hasil scan.</p>
        </div>
        <p class="ping-summary" id="scanPortsSummary"></p>
      </div>
      <div class="prop-actions scan-modal-actions">
        <button type="button" class="btn primary" id="btnScanPorts">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v4.5M8.5 12H4M19.5 12H15M12 15.5V20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5a9.5 9.5 0 0 1 0 19M12 2.5a9.5 9.5 0 0 0 0 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".45"/></svg>
          <span class="btn-label" data-i18n="scan.port">Scan Port</span>
        </button>
        <button type="button" class="btn rescan" id="btnRescanPorts" disabled>
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 5v4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 19v-4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" data-i18n="scan.rescan">Scan Ulang</span>
        </button>
      </div>
    </div>
  </div>

  <div id="ctxMenu" class="ctx-menu hidden" role="menu">
    <div id="ctxDeviceItems">
      <div id="ctxSelectionInfo" class="ctx-selection-info hidden"></div>
      <div id="ctxSingleOnly" class="ctx-single-only">
        <div class="ctx-submenu-wrap" id="ctxOpenWrap">
          <button type="button" class="ctx-submenu-trigger" id="ctxOpenTrigger" aria-haspopup="true" aria-expanded="false">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5h5v5M19 5l-8.5 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 6H7.5A2.5 2.5 0 0 0 5 8.5v8A2.5 2.5 0 0 0 7.5 19h8a2.5 2.5 0 0 0 2.5-2.5V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span data-i18n="ctx.open">Buka</span>
            <span class="ctx-chevron" aria-hidden="true">›</span>
          </button>
          <div class="ctx-submenu" id="ctxOpenMenu" role="menu"></div>
        </div>
        <button type="button" data-act="ping">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.4" stroke="currentColor" stroke-width="1.7"/><path d="M8 10a5.6 5.6 0 0 1 8 0M5.3 7.2a9.4 9.4 0 0 1 13.4 0M15.4 16.5 12 20l-3.4-3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="ctx.ping">Ping</span>
        </button>
        <button type="button" data-act="traceroute">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="6" r="2.1" stroke="currentColor" stroke-width="1.7"/><circle cx="19" cy="18" r="2.1" stroke="currentColor" stroke-width="1.7"/><path d="M5 8.1c0 4.9 1 4.9 7 4.9s7 0 7 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="2.2 2.6"/></svg>
          <span data-i18n="ctx.traceroute">Traceroute</span>
        </button>
        <button type="button" data-act="scan-ports">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v4.5M8.5 12H4M19.5 12H15M12 15.5V20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5a9.5 9.5 0 0 1 0 19M12 2.5a9.5 9.5 0 0 0 0 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".45"/></svg>
          <span data-i18n="ctx.scan_port">Scan Port</span>
        </button>
        <button type="button" data-act="scan-subnet" id="ctxScanSubnet">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6.5" cy="7" r="2.2" stroke="currentColor" stroke-width="1.7"/><circle cx="17.5" cy="7" r="2.2" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="17" r="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M8.4 8.4 10.4 15M15.6 8.4 13.6 15M8.7 7h6.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="ctx.scan_subnet">Scan Subnet</span>
        </button>
      </div>
      <div id="ctxMultiActions">
        <div class="ctx-submenu-wrap" id="ctxTypeWrap">
        <button type="button" class="ctx-submenu-trigger" id="ctxTypeTrigger" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l8 4.5-8 4.5-8-4.5L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 12l8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="ctx.type">Tipe</span>
          <span class="ctx-chevron" aria-hidden="true">›</span>
        </button>
        <div class="ctx-submenu" id="ctxTypeMenu" role="menu">
          <button type="button" data-set-type="web" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#6366f1"/></svg>
            Web
          </button>
          <button type="button" data-set-type="internet" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#0ea5e9"/></svg>
            Internet
          </button>
          <button type="button" data-set-type="vpn" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#84cc16"/></svg>
            VPN
          </button>
          <button type="button" data-set-type="server" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#1a6aff"/></svg>
            Server
          </button>
          <button type="button" data-set-type="database" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#9333ea"/></svg>
            Database
          </button>
          <button type="button" data-set-type="loadbalance" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#db2777"/></svg>
            Load Balance
          </button>
          <button type="button" data-set-type="router" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#ff8a1f"/></svg>
            Router
          </button>
          <button type="button" data-set-type="olt" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#12b5c9"/></svg>
            OLT
          </button>
          <button type="button" data-set-type="onu" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#16a34a"/></svg>
            ONU
          </button>
          <button type="button" data-set-type="printer" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#a16207"/></svg>
            Printer
          </button>
          <button type="button" data-set-type="client" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#52525b"/></svg>
            Client
          </button>
        </div>
      </div>
        <div class="ctx-submenu-wrap" id="ctxArrangeWrap">
        <button type="button" class="ctx-submenu-trigger" id="ctxArrangeTrigger" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4v16M9 7h6v4H9V7Zm0 6h4v4H9v-4Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="ctx.arrange">Rapikan</span>
          <span class="ctx-chevron" aria-hidden="true">›</span>
        </button>
        <div class="ctx-submenu" id="ctxArrangeMenu" role="menu">
          <div class="menu-label">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5v14M9 7h7v3.5H9V7Zm0 6.5h5V17H9v-3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span data-i18n="ctx.align">Rata</span>
          </div>
          <button type="button" data-arrange="align-left" title="Rata kiri (Ctrl+←)" data-i18n-title="ctx.align_left_title" data-shortcut-title="align-left" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4v16M9 7h11M9 12h7M9 17h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.align_left">Rata kiri</span>
          </button>
          <button type="button" data-arrange="align-right" title="Rata kanan (Ctrl+→)" data-i18n-title="ctx.align_right_title" data-shortcut-title="align-right" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 4v16M4 7h11M8 12h8M6 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.align_right">Rata kanan</span>
          </button>
          <button type="button" data-arrange="align-top" title="Rata atas (Ctrl+↑)" data-i18n-title="ctx.align_top_title" data-shortcut-title="align-top" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16M7 9v11M12 9v7M17 9v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.align_top">Rata atas</span>
          </button>
          <button type="button" data-arrange="align-bottom" title="Rata bawah (Ctrl+↓)" data-i18n-title="ctx.align_bottom_title" data-shortcut-title="align-bottom" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h16M7 4v11M12 8v8M17 6v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.align_bottom">Rata bawah</span>
          </button>
          <button type="button" data-arrange="align-hcenter" title="Tengah horizontal (Ctrl+Shift+E)" data-i18n-title="ctx.align_h_title" data-shortcut-title="align-hcenter" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M7 7h10M9 12h6M8 17h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.align_h">Tengah horizontal</span>
          </button>
          <button type="button" data-arrange="align-vcenter" title="Tengah vertikal (Ctrl+Shift+M)" data-i18n-title="ctx.align_v_title" data-shortcut-title="align-vcenter" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h18M7 7v10M12 9v6M17 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.align_v">Tengah vertikal</span>
          </button>
          <div class="menu-sep"></div>
          <div class="menu-label">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h3M10.5 12h3M16 12h3M8 9.5v5M13.5 9.5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.spacing">Jarak</span>
          </div>
          <button type="button" data-arrange="dist-h" title="Jarak sama horizontal (Ctrl+Shift+H)" data-i18n-title="ctx.dist_h_title" data-shortcut-title="dist-h" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="8" width="4" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="10" y="8" width="4" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="16.5" y="8" width="4" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 6h2.5M14 6h2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.dist_h">Jarak sama horizontal</span>
          </button>
          <button type="button" data-arrange="dist-v" title="Jarak sama vertikal (Ctrl+Shift+V)" data-i18n-title="ctx.dist_v_title" data-shortcut-title="dist-v" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="3.5" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="8" y="10" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="8" y="16.5" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.7"/><path d="M6 7.5v2.5M6 14v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span data-i18n="ctx.dist_v">Jarak sama vertikal</span>
          </button>
          <button type="button" data-arrange="pack-h" title="Susun baris (gap tetap) (Ctrl+Shift+R)" data-i18n-title="ctx.pack_h_title" data-shortcut-title="pack-h" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="8" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="9.5" y="8" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="15.5" y="8" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/></svg>
            <span data-i18n="ctx.pack_h">Susun baris (gap tetap)</span>
          </button>
          <button type="button" data-arrange="pack-v" title="Susun kolom (gap tetap) (Ctrl+Shift+G)" data-i18n-title="ctx.pack_v_title" data-shortcut-title="pack-v" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="3.5" width="8" height="5" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="8" y="9.5" width="8" height="5" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="8" y="15.5" width="8" height="5" rx="1" stroke="currentColor" stroke-width="1.7"/></svg>
            <span data-i18n="ctx.pack_v">Susun kolom (gap tetap)</span>
          </button>
        </div>
      </div>
      <button type="button" data-act="copy">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M6 15.5V6.5A2.5 2.5 0 0 1 8.5 4H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span data-i18n="ctx.copy">Salin</span>
      </button>
      <button type="button" data-act="delete" class="danger">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M8 7l.7 12.2a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span data-i18n="ctx.delete">Hapus</span>
      </button>
      </div>
      <div id="ctxSingleOnlyProps" class="ctx-single-only">
        <button type="button" data-act="edit">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8.5h14M5 15.5h14M9.5 6v5M14.5 13v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.5" cy="8.5" r="2" stroke="currentColor" stroke-width="1.7"/><circle cx="14.5" cy="15.5" r="2" stroke="currentColor" stroke-width="1.7"/></svg>
          <span data-i18n="ctx.props">Properties</span>
        </button>
      </div>
    </div>
    <div id="ctxEmptyItems" class="hidden">
      <button type="button" data-act="undo" id="ctxUndoBtn" disabled>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 14.5H4v-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14.5a8 8 0 1 0 1.8-5.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Undo
      </button>
      <button type="button" data-act="redo" id="ctxRedoBtn" disabled>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.5 14.5H20v-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 14.5a8 8 0 1 1-1.8-5.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Redo
      </button>
      <button type="button" data-act="paste" id="ctxPasteBtn">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 8.5h10.5A2.5 2.5 0 0 1 21 11v7.5A2.5 2.5 0 0 1 18.5 21H8A2.5 2.5 0 0 1 5.5 18.5V11A2.5 2.5 0 0 1 8 8.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M9 8.5V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 14h7M9.5 17h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span data-i18n="ctx.paste">Tempel</span>
      </button>
    </div>
    <div id="ctxLinkItems" class="hidden">
      <div id="ctxLinkSelectionInfo" class="ctx-selection-info hidden"></div>
      <div class="ctx-submenu-wrap" id="ctxLinkTypeWrap">
        <button type="button" class="ctx-submenu-trigger" id="ctxLinkTypeTrigger" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16M7 8.5 4 12l3 3.5M17 8.5 20 12l-3 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="ctx.type">Tipe</span>
          <span class="ctx-chevron" aria-hidden="true">›</span>
        </button>
        <div class="ctx-submenu" id="ctxLinkTypeMenu" role="menu"></div>
      </div>
      <button type="button" data-act="link-delete" class="danger">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M8 7l.7 12.2a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span data-i18n="ctx.delete">Hapus</span>
      </button>
      <button type="button" data-act="link-edit" id="ctxLinkEditBtn">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8.5h14M5 15.5h14M9.5 6v5M14.5 13v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.5" cy="8.5" r="2" stroke="currentColor" stroke-width="1.7"/><circle cx="14.5" cy="15.5" r="2" stroke="currentColor" stroke-width="1.7"/></svg>
        <span data-i18n="ctx.props">Properties</span>
      </button>
    </div>
  </div>

  <!-- Text-field edit menu (Cursor/Simple Browser often blocks the native OS menu). -->
  <div id="editCtxMenu" class="ctx-menu edit-ctx-menu hidden" role="menu" aria-label="Edit teks" data-i18n-aria="edit.menu">
    <button type="button" data-edit="cut" role="menuitem">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 8.5a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 8 8.5Zm0 7a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 8 15.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M8.8 9.6 19 4.5M8.8 14.4 19 19.5M14.2 12h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      <span data-i18n="edit.cut">Potong</span>
    </button>
    <button type="button" data-edit="copy" role="menuitem">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      <span data-i18n="edit.copy">Salin</span>
    </button>
    <button type="button" data-edit="paste" role="menuitem">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7"/><path d="M10 5.5V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v.5" stroke="currentColor" stroke-width="1.7"/></svg>
      <span data-i18n="edit.paste">Tempel</span>
    </button>
    <button type="button" data-edit="select-all" role="menuitem">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8.5 12h7M12 8.5v7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      <span data-i18n="edit.select_all">Pilih semua</span>
    </button>
  </div>

  <div id="modalReports" class="modal hidden" aria-hidden="true">
    <div class="modal-card reports-card">
      <header>
        <h2 id="reportTitle" data-i18n="report.title">Laporan Pamantau</h2>
        <div class="report-header-actions">
          <button type="button" class="btn ghost hidden" id="btnChangeReportPeriod">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4v3M17 4v3M4.5 9.5h15M6 6.5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V8A1.5 1.5 0 0 1 6 6.5z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="report.change_period">Ubah periode</span>
          </button>
          <button type="button" class="btn ghost hidden" id="btnPrintReport">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 9V4h10v5M7 15H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M7 13h10v7H7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="report.print">Cetak</span>
          </button>
          <button type="button" class="btn primary hidden" id="btnExcelReport">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15zM5 9h14M5 14h14M10 3v18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="report.excel">Excel</span>
          </button>
          <button type="button" class="icon-btn close" id="btnCloseReports" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </header>
      <div id="reportPeriodGate" class="report-period-gate">
        <p class="report-period-desc" id="reportPeriodDesc" data-i18n="report.period_desc">Pilih rentang tanggal laporan. Data harian dikumpulkan sejak fitur ini aktif (zona waktu server).</p>
        <div class="report-period-fields" id="reportDateFields">
          <label><span data-i18n="report.from">Dari</span>
            <input type="date" id="reportDateFrom" required />
          </label>
          <label><span data-i18n="report.to">Sampai</span>
            <input type="date" id="reportDateTo" required />
          </label>
        </div>
        <div class="report-period-fields hidden" id="reportDeviceField">
          <label><span data-i18n="report.device">Perangkat</span>
            <select id="reportDeviceSelect"></select>
          </label>
        </div>
        <p id="reportPeriodError" class="report-period-error hidden" role="alert"></p>
        <div class="prop-actions scan-modal-actions report-period-actions">
          <button type="button" class="btn cancel" id="btnCancelReportPeriod">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M7.05 7.05l9.9 9.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="btn-label" data-i18n="common.cancel">Batal</span>
          </button>
          <button type="button" class="btn primary" id="btnApplyReportPeriod">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13.5 9.5 18 19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="report.apply">Terapkan</span>
          </button>
        </div>
      </div>
      <div id="reportTableWrap" class="report-body hidden">
        <p id="reportPeriodLabel" class="report-period-label"></p>
        <p id="reportEmptyNotice" class="report-empty-notice hidden" data-i18n="report.empty_historical">Belum ada data historis untuk periode ini. Pengumpulan harian dimulai saat fitur laporan bersejarah diaktifkan.</p>
        <table id="reportTable">
          <thead>
            <tr id="reportHeadRow"></tr>
          </thead>
          <tbody id="reportRows"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="modalSettings" class="modal hidden" aria-hidden="true">
    <div class="modal-card settings-card">
      <header>
        <h2 data-i18n="settings.title">Pengaturan</h2>
        <div class="settings-header-actions">
          <button type="submit" form="settingsForm" class="btn save" id="btnSaveSettings">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13.5 9.5 18 19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="btn-label" data-i18n="settings.save">Simpan</span>
          </button>
          <button type="button" class="icon-btn close" id="btnCloseSettings" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
            <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </header>
      <form id="settingsForm" class="settings-body">
        <section class="settings-section">
          <h3 data-i18n="lang.section">Bahasa</h3>
          <p class="settings-desc" data-i18n="lang.desc">Bahasa antarmuka aplikasi.</p>
          <label><span data-i18n="lang.label">Bahasa UI</span>
            <select id="setUiLanguage">
              <option value="id" data-i18n="lang.id">Indonesia</option>
              <option value="en" data-i18n="lang.en">English</option>
            </select>
          </label>
        </section>

        <section class="settings-section">
          <h3 data-i18n="theme.section">Tema</h3>
          <p class="settings-desc" data-i18n="theme.desc">Skema warna antarmuka: topbar, panel, aksen, dan latar kanvas.</p>
          <label><span data-i18n="theme.label">Tema UI</span>
            <select id="setTheme">
              <option value="light" data-i18n="theme.light">Light</option>
              <option value="dark" data-i18n="theme.dark">Dark</option>
            </select>
          </label>
        </section>

        <section class="settings-section account-section" id="accountSection">
          <h3 data-i18n="auth.account_section">Akun</h3>
          <p class="settings-desc" data-i18n="auth.account_desc">Ubah username admin dan password login.</p>

          <div class="account-identity" id="accountIdentity">
            <div class="account-avatar" id="accountAvatar" aria-hidden="true"><?= htmlspecialchars(strtoupper(substr((string) ($pamantauAuth['username'] ?? 'A'), 0, 1)), ENT_QUOTES, 'UTF-8') ?></div>
            <div class="account-identity-meta">
              <span class="account-identity-label" data-i18n="auth.current_username">Username saat ini</span>
              <strong class="account-readonly" id="accountCurrentUsername"><?= htmlspecialchars((string) ($pamantauAuth['username'] ?? ''), ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
            <span class="account-change-pill" id="accountChangePill" hidden data-i18n="auth.changes_pending">Username berubah</span>
          </div>

          <div class="settings-grid">
            <label class="account-field">
              <span data-i18n="auth.username">Username</span>
              <div class="account-input-wrap">
                <input type="text" id="accountNewUsername" autocomplete="username" spellcheck="false" />
              </div>
            </label>
            <label class="account-field">
              <span data-i18n="auth.old_password">Password lama</span>
              <div class="account-input-wrap">
                <input type="password" id="accountOldPassword" autocomplete="current-password" />
                <button type="button" class="account-visibility" data-toggle-password="accountOldPassword" aria-label="Show password" title="Show password">
                  <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                  <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                </button>
              </div>
              <small class="account-field-hint" id="accountOldHint"></small>
            </label>
          </div>

          <div class="settings-grid account-password-grid" id="accountPasswordGrid" hidden>
            <label class="account-field" id="accountNewPasswordField">
              <span data-i18n="auth.new_password">Password baru</span>
              <div class="account-input-wrap">
                <input type="password" id="accountNewPassword" autocomplete="new-password" />
                <button type="button" class="account-visibility" data-toggle-password="accountNewPassword" aria-label="Show password" title="Show password">
                  <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                  <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                </button>
              </div>
              <div class="account-strength" id="accountStrength" hidden>
                <div class="account-strength-bars" aria-hidden="true">
                  <span></span><span></span><span></span>
                </div>
                <small id="accountStrengthLabel"></small>
              </div>
              <small class="account-field-hint" id="accountNewHint"></small>
            </label>
            <label class="account-field account-confirm-field" id="accountConfirmField">
              <span data-i18n="auth.confirm_password">Konfirmasi password</span>
              <div class="account-input-wrap">
                <input type="password" id="accountConfirmPassword" autocomplete="new-password" />
                <button type="button" class="account-visibility" data-toggle-password="accountConfirmPassword" aria-label="Show password" title="Show password">
                  <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                  <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                </button>
              </div>
              <small class="account-field-hint" id="accountConfirmHint"></small>
            </label>
          </div>

          <ul class="account-checklist" id="accountChecklist" aria-live="polite" hidden>
            <li data-check="old" id="accountCheckOld"><span class="account-check-dot"></span><span data-i18n="auth.check_old">Password lama cocok</span></li>
            <li data-check="length" id="accountCheckLength"><span class="account-check-dot"></span><span data-i18n="auth.check_length">Password baru ≥ 6 karakter</span></li>
            <li data-check="match" id="accountCheckMatch"><span class="account-check-dot"></span><span data-i18n="auth.check_match">Konfirmasi cocok</span></li>
            <li data-check="ready" id="accountCheckReady"><span class="account-check-dot"></span><span data-i18n="auth.check_ready">Siap disimpan</span></li>
          </ul>

          <div class="settings-actions account-actions">
            <div class="settings-actions-left">
              <button type="button" class="btn save" id="btnSaveAccount" disabled hidden>
                <svg class="btn-ico account-save-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="btn-label" data-i18n="auth.save_account">Simpan akun</span>
              </button>
              <button type="button" class="btn ghost" id="btnResetAccount" hidden>
                <span class="btn-label" data-i18n="auth.reset_form">Batalkan</span>
              </button>
            </div>
            <p class="account-status" id="accountStatus" role="status" aria-live="polite"></p>
          </div>

          <div class="account-recovery" id="accountRecovery">
            <div class="settings-subhead" data-i18n="auth.recovery_section">Recovery key</div>
            <p class="settings-desc" data-i18n="auth.recovery_desc">Simpan isi database/app.key. Kunci ini dipakai untuk Lupa Password di halaman login.</p>
            <label class="account-field">
              <span data-i18n="auth.recovery_key">Recovery key (app.key)</span>
              <div class="account-input-wrap">
                <input type="password" id="accountRecoveryKey" readonly spellcheck="false" autocomplete="off" value="" />
                <button type="button" class="account-visibility" id="btnRevealRecoveryKey" aria-label="Show" title="Show">
                  <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                  <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                </button>
              </div>
              <small class="account-field-hint" id="accountRecoveryPath" data-i18n="auth.recovery_path">Lokasi file</small>
            </label>
            <div class="settings-actions account-actions">
              <div class="settings-actions-left">
                <button type="button" class="btn" id="btnCopyRecoveryKey">
                  <span class="btn-label" data-i18n="auth.copy_recovery_key">Salin key</span>
                </button>
                <button type="button" class="btn ghost" id="btnRotateRecoveryKey">
                  <span class="btn-label" data-i18n="auth.rotate_recovery_key">Buat key baru</span>
                </button>
              </div>
              <p class="account-status" id="accountRecoveryStatus" role="status" aria-live="polite"></p>
            </div>
          </div>
        </section>

        <section class="settings-section" id="settingsUpdateSection">
          <h3 data-i18n="update.section">Update</h3>
          <p class="settings-desc" data-i18n="update.desc">Periksa dan pasang versi baru dari GitHub Releases. Data di folder database tetap aman.</p>
          
          <div class="update-version-card">
            <div class="update-version-item">
              <span class="update-version-label" data-i18n="update.current_version_label">Versi saat ini</span>
              <span class="update-version-val" id="updateCurrentVersionVal">v<?= htmlspecialchars($pamantauVersion, ENT_QUOTES, 'UTF-8') ?></span>
            </div>
            <div class="update-version-divider"></div>
            <div class="update-version-item">
              <span class="update-version-label" data-i18n="update.latest_version_label">Versi rilis GitHub</span>
              <span class="update-version-val" id="updateLatestVersionVal">-</span>
            </div>
          </div>

          <p id="updateStatusText" class="settings-desc" data-i18n="update.idle">Belum diperiksa.</p>
          <div id="updateProgressHost"></div>
          <p id="updateSettingsError" class="update-banner-error hidden"></p>
          <div class="update-settings-actions">
            <button type="button" class="btn" id="btnUpdateCheck">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12v-1a8 8 0 0 1 14.93-4M20 12v1a8 8 0 0 1-14.93 4M4 8H8M4 8V4M20 16H16M20 16V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span data-i18n="update.check_now">Cek update</span>
            </button>
            <button type="button" class="btn save hidden" id="btnUpdateInstall" disabled>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span data-i18n="update.install">Update Sekarang</span>
            </button>
          </div>
        </section>

        <section class="settings-section">
          <h3 data-i18n="mon.section">Monitoring</h3>
          <p class="settings-desc" data-i18n="mon.desc">Polling status dan pemindaian port berjalan sebagai dua pekerjaan terpisah.</p>
          <div class="settings-subhead" data-i18n="mon.ping_job">Polling status (ping)</div>
          <label class="switch-row">
            <span class="switch-text" data-i18n="mon.auto_poll">Polling otomatis (interval berkala)</span>
            <span class="switch">
              <input type="checkbox" id="setPollingEnabled" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <div class="settings-grid" id="pollingScheduleExtras" data-depends-on="polling-enabled">
            <label><span data-i18n="mon.poll_interval">Interval polling (detik)</span>
              <input type="number" id="setPollSec" min="2" max="60" step="1" />
            </label>
            <label><span data-i18n="mon.ping_timeout">Timeout ping (ms)</span>
              <input type="number" id="setPingTimeout" min="200" max="5000" step="50" />
            </label>
            <label><span data-i18n="mon.poll_method">Metode poll</span>
              <select id="setPollMethod">
                <option value="parallel" data-i18n="mon.method_parallel">Paralel</option>
                <option value="sequential" data-i18n="mon.method_sequential">Satu-Satu</option>
              </select>
            </label>
            <label><span data-i18n="mon.ping_count">Jumlah ping per siklus (3–5)</span>
              <input type="number" id="setPingCount" min="3" max="5" step="1" />
            </label>
          </div>

          <div class="settings-subhead" data-i18n="mon.port_job">Pemindaian port otomatis</div>
          <label class="switch-row">
            <span class="switch-text" data-i18n="mon.auto_port">Scan port otomatis (jadwal terpisah)</span>
            <span class="switch">
              <input type="checkbox" id="setPortScan" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <div class="settings-grid" id="portScanScheduleExtras" data-depends-on="port-scan">
            <label><span data-i18n="mon.port_interval">Interval scan port (menit)</span>
              <input type="number" id="setPortScanIntervalMin" min="1" max="1440" step="1" />
            </label>
            <label><span data-i18n="mon.port_timeout">Timeout port (ms)</span>
              <input type="number" id="setPortScanTimeout" min="100" max="5000" step="50" />
            </label>
            <label><span data-i18n="mon.port_concurrency">Perangkat paralel (16–32)</span>
              <input type="number" id="setPortScanConcurrency" min="16" max="32" step="1" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h3 data-i18n="ports.section">Port Umum</h3>
          <p class="settings-desc" data-i18n="ports.desc">Daftar port yang diperiksa oleh jadwal scan port otomatis.</p>
          <div class="port-table-wrap" id="portScanExtras">
            <table class="port-table" id="commonPortsTable">
              <thead>
                <tr>
                  <th class="port-table-drag-col" aria-hidden="true"></th>
                  <th data-i18n="net.port_col">Port</th>
                  <th data-i18n="net.port_note_col">Keterangan</th>
                  <th aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody id="commonPortsBody"></tbody>
            </table>
            <button type="button" class="btn ghost" id="btnAddCommonPort" data-i18n="net.port_add">+ Tambah port</button>
            <p class="settings-desc" data-i18n="net.common_ports_desc">Dipakai oleh jadwal scan port otomatis — bukan oleh Scan Port manual.</p>
          </div>
        </section>

        <section class="settings-section">
          <h3 data-i18n="net.section">Pemindaian Jaringan</h3>
          <p class="settings-desc" data-i18n="net.desc">Pengaturan Scan Port manual (rentang) dan discovery host melalui Scan Subnet.</p>

          <div class="settings-subhead" data-i18n="net.scan_port">Scan port manual</div>
          <label><span data-i18n="net.port_method">Metode scan port</span>
            <select id="setScanPortMethod">
              <option value="parallel" data-i18n="mon.method_parallel">Paralel</option>
              <option value="sequential" data-i18n="mon.method_sequential">Satu-Satu</option>
            </select>
          </label>
          <p class="settings-desc" data-i18n="net.port_method_desc">Untuk Scan Port manual (rentang). Scan otomatis selalu memakai parallel terbatas.</p>
          <div class="settings-grid">
            <label><span data-i18n="net.port_max">Maks. port per scan</span>
              <input type="number" id="setScanPortMax" min="1" max="10000" step="1" />
            </label>
          </div>
          <p class="settings-desc" data-i18n="net.port_max_desc">Batas jumlah port dalam satu Scan Port manual (1–10000). Tidak membatasi port umum saat polling.</p>

          <div class="settings-subhead" data-i18n="net.scan_subnet">Scan subnet</div>
          <label><span data-i18n="net.subnet_method">Metode Scan Subnet</span>
            <select id="setScanSubnetMethod">
              <option value="sequential" data-i18n="mon.method_sequential">Satu-Satu</option>
              <option value="parallel" data-i18n="mon.method_parallel">Paralel</option>
            </select>
          </label>
          <p class="settings-desc" data-i18n="net.subnet_method_desc">Sequential lebih akurat; paralel lebih cepat per batch ping.</p>
          <div id="subnetBatchExtras" class="hidden" data-depends-on="subnet-parallel">
            <div class="settings-grid">
              <label><span data-i18n="net.batch">Host per batch</span>
                <input type="number" id="setSubnetBatchSize" min="8" max="128" step="1" />
              </label>
            </div>
            <p class="settings-desc" data-i18n="net.batch_desc">Jumlah host yang di-ping bersamaan per langkah scan paralel (8–128).</p>
          </div>
          <div class="settings-grid">
            <label><span data-i18n="net.subnet_timeout">Timeout ping (ms)</span>
              <input type="number" id="setSubnetTimeout" min="100" max="500" step="10" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h3 data-i18n="grid.section">Grid &amp; Tata Letak</h3>
          <p class="settings-desc" data-i18n="grid.desc">Ukuran grid dan snap saat drag.</p>
          <label class="switch-row">
            <span class="switch-text" data-i18n="grid.show">Tampilkan grid di kanvas</span>
            <span class="switch">
              <input type="checkbox" id="setShowGrid" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <div class="settings-grid" id="gridSizeExtras" data-depends-on="grid-visible">
            <label><span data-i18n="grid.size">Ukuran grid (px)</span>
              <input type="number" id="setGridSize" min="8" max="64" step="2" />
            </label>
          </div>
          <label class="switch-row" id="snapDragRow">
            <span class="switch-text" data-i18n="grid.snap">Snap ke grid saat drag</span>
            <span class="switch">
              <input type="checkbox" id="setSnapDrag" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
        </section>

        <section class="settings-section">
          <h3 data-i18n="zoom.section">Zoom &amp; Riwayat</h3>
          <p class="settings-desc" data-i18n="zoom.desc">Batas zoom kanvas dan jumlah langkah undo yang disimpan.</p>
          <div class="settings-grid">
            <label><span data-i18n="zoom.min">Zoom minimum</span>
              <input type="number" id="setZoomMin" min="0.2" max="1" step="0.05" />
            </label>
            <label><span data-i18n="zoom.max">Zoom maksimum</span>
              <input type="number" id="setZoomMax" min="1.2" max="5" step="0.1" />
            </label>
            <label><span data-i18n="zoom.history">Kedalaman undo</span>
              <input type="number" id="setHistoryMax" min="10" max="200" step="1" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h3 data-i18n="comp.section">Tampilan Komponen</h3>
          <p class="settings-desc" data-i18n="comp.desc">Teks dan badge yang ditampilkan pada kartu perangkat di kanvas. Lampu status &amp; ikon tipe tetap tampil.</p>
          <label class="switch-row">
            <span class="switch-text" data-i18n="comp.label">Tampilkan Label</span>
            <span class="switch">
              <input type="checkbox" id="setShowLabel" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="comp.ip">Tampilkan IP</span>
            <span class="switch">
              <input type="checkbox" id="setShowIp" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="comp.latency">Tampilkan Latensi</span>
            <span class="switch">
              <input type="checkbox" id="setShowLatency" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="comp.comment">Tampilkan Komentar</span>
            <span class="switch">
              <input type="checkbox" id="setShowComment" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="comp.port">Tampilkan Port</span>
            <span class="switch">
              <input type="checkbox" id="setShowServices" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
        </section>

        <section class="settings-section">
          <h3 data-i18n="conn.section">Tampilan Koneksi</h3>
          <p class="settings-desc" data-i18n="conn.desc">Animasi garis koneksi antar perangkat.</p>
          <label class="switch-row">
            <span class="switch-text" data-i18n="conn.icon">Tampilkan Icon</span>
            <span class="switch">
              <input type="checkbox" id="setShowLinkIcon" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="conn.label">Tampilkan Label</span>
            <span class="switch">
              <input type="checkbox" id="setShowLinkLabel" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="conn.comment">Tampilkan Komentar</span>
            <span class="switch">
              <input type="checkbox" id="setShowLinkComment" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label class="switch-row">
            <span class="switch-text" data-i18n="conn.anim">Animasi koneksi</span>
            <span class="switch">
              <input type="checkbox" id="setAnimateLinks" role="switch" />
              <span class="slider" aria-hidden="true"></span>
            </span>
          </label>
          <label><span data-i18n="conn.anim_style">Gaya animasi koneksi</span>
            <select id="setLinkAnimStyle">
              <option value="pulse" data-i18n="conn.style_pulse">Denyut</option>
              <option value="flow" data-i18n="conn.style_flow">Alur</option>
              <option value="comet" data-i18n="conn.style_comet">Komet</option>
              <option value="beads" data-i18n="conn.style_beads">Manik</option>
              <option value="spark" data-i18n="conn.style_spark">Kilat</option>
            </select>
          </label>
          <label class="settings-range-label">
            <span class="settings-range-head">
              <span data-i18n="conn.anim_speed">Kecepatan animasi</span>
              <span id="setLinkAnimSpeedVal" class="settings-range-val">1.00×</span>
            </span>
            <input type="range" id="setLinkAnimSpeed" min="0.25" max="2" step="0.05" value="1" />
          </label>
        </section>

        <section class="settings-section">
          <h3 data-i18n="status.section">Status perangkat</h3>
          <p class="settings-desc" data-i18n="status.desc">Warna status di kanvas: isi ubin ikon (tema Light), outline perangkat (tema Dark).</p>
          <div id="statusColorSettings">
            <div class="settings-grid">
              <label><span data-i18n="status.online">Warna online</span>
                <span class="color-row">
                  <input type="color" id="setStatusOnlineColor" value="#39ff14" />
                  <input type="text" id="setStatusOnlineColorText" maxlength="7" placeholder="#39ff14" autocomplete="off" spellcheck="false" />
                </span>
              </label>
              <label><span data-i18n="status.offline">Warna offline</span>
                <span class="color-row">
                  <input type="color" id="setStatusOfflineColor" value="#ff3b5c" />
                  <input type="text" id="setStatusOfflineColorText" maxlength="7" placeholder="#ff3b5c" autocomplete="off" spellcheck="false" />
                </span>
              </label>
              <label><span data-i18n="status.unknown">Warna unknown</span>
                <span class="color-row">
                  <input type="color" id="setStatusUnknownColor" value="#8090a8" />
                  <input type="text" id="setStatusUnknownColorText" maxlength="7" placeholder="#8090a8" autocomplete="off" spellcheck="false" />
                </span>
              </label>
            </div>
          </div>
        </section>

        <div class="settings-actions">
          <div class="settings-actions-left">
            <button type="button" class="btn ghost" id="btnResetSettings">
              <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.1-5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 4.5V10H10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="btn-label" data-i18n="settings.reset">Reset default</span>
            </button>
            <button type="button" class="btn danger" id="btnResetCounters" title="Reset counter &amp; statistik polling. Topologi (perangkat &amp; koneksi) tidak dihapus." data-i18n-title="settings.reset_counters_title">
              <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1A2 2 0 0 1 14.2 21H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              <span class="btn-label" data-i18n="settings.reset_counters">Reset Counter</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <div id="modalTgUpDown" class="modal hidden" aria-hidden="true">
    <div class="modal-card scan-card tg-card">
      <header>
        <h2 data-i18n="tg.updown_title">Telegram Online/Offline</h2>
        <button type="button" class="icon-btn close" id="btnCloseTgUpDown" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="settings-body tg-modal-body">
        <p class="settings-desc" data-i18n="tg.updown_desc">Kirim pesan saat perangkat berubah status Online atau Offline selama polling.</p>
        <label class="switch-row">
          <span class="switch-text" data-i18n="tg.notify_up">Notifikasi Online</span>
          <span class="switch">
            <input type="checkbox" id="tgNotifyUp" role="switch" />
            <span class="slider" aria-hidden="true"></span>
          </span>
        </label>
        <label class="switch-row">
          <span class="switch-text" data-i18n="tg.notify_down">Notifikasi Offline</span>
          <span class="switch">
            <input type="checkbox" id="tgNotifyDown" role="switch" />
            <span class="slider" aria-hidden="true"></span>
          </span>
        </label>
        <label><span data-i18n="tg.tpl_up">Template Online</span>
          <textarea id="tgTplUpPreview" rows="2" spellcheck="false"></textarea>
        </label>
        <label><span data-i18n="tg.tpl_down">Template Offline</span>
          <textarea id="tgTplDownPreview" rows="2" spellcheck="false"></textarea>
        </label>
        <p class="settings-desc" data-i18n="tg.placeholders">Placeholder: {label} {ip} {type} {latency} {time} {status}</p>
        <div class="tg-updown-preview" aria-live="polite">
          <div class="tg-updown-preview-block">
            <span class="tg-updown-preview-label" data-i18n="tg.preview_up">Pratinjau Online</span>
            <pre class="tg-updown-preview-text" id="tgMsgPreviewUp"></pre>
          </div>
          <div class="tg-updown-preview-block">
            <span class="tg-updown-preview-label" data-i18n="tg.preview_down">Pratinjau Offline</span>
            <pre class="tg-updown-preview-text" id="tgMsgPreviewDown"></pre>
          </div>
        </div>
        <div class="prop-actions scan-modal-actions">
          <button type="button" class="btn ghost" id="btnTgTestUp">
            <span class="btn-label" data-i18n="tg.test_up">Uji Online</span>
          </button>
          <button type="button" class="btn ghost" id="btnTgTestDown">
            <span class="btn-label" data-i18n="tg.test_down">Uji Offline</span>
          </button>
          <button type="button" class="btn save" id="btnSaveTgUpDown">
            <span class="btn-label" data-i18n="settings.save">Simpan</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div id="modalTgScreenshot" class="modal hidden" aria-hidden="true">
    <div class="modal-card scan-card tg-card">
      <header>
        <h2 data-i18n="tg.shot_title">Telegram Screenshot</h2>
        <button type="button" class="icon-btn close" id="btnCloseTgScreenshot" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="settings-body tg-modal-body">
        <label class="switch-row">
          <span class="switch-text" data-i18n="tg.shot_enabled">Aktifkan screenshot terjadwal</span>
          <span class="switch">
            <input type="checkbox" id="tgShotEnabled" role="switch" />
            <span class="slider" aria-hidden="true"></span>
          </span>
        </label>

        <div id="tgShotSchedHint" class="bg-sched-hint">
          <div class="bg-sched-label" data-i18n="bg.cron_title">Status cron</div>
          <p class="settings-desc" id="tgShotCronStatus" data-i18n="bg.cron_auto_desc">Status cron akan ditampilkan di sini setelah dicek.</p>
        </div>

        <div id="tgShotDeps" class="bg-sched-hint tg-shot-deps">
          <div class="bg-sched-label" data-i18n="tg.shot_deps_title">Syarat server</div>
          <ul class="tg-shot-deps-list" id="tgShotDepsList" aria-live="polite"></ul>
        </div>

        <div class="settings-grid">
          <label><span data-i18n="tg.shot_format">Format</span>
            <select id="tgShotFormat">
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </label>
          <label><span data-i18n="tg.shot_mode">Jadwal</span>
            <select id="tgShotMode">
              <option value="interval" data-i18n="tg.shot_mode_interval">Setiap N menit</option>
              <option value="hourly" data-i18n="tg.shot_mode_hourly">Setiap jam</option>
              <option value="daily" data-i18n="tg.shot_mode_daily">Setiap hari</option>
            </select>
          </label>
        </div>
        <div class="settings-grid" id="tgShotFieldsInterval">
          <label><span data-i18n="tg.shot_every">Setiap (menit)</span>
            <input type="number" id="tgShotEvery" min="1" max="1440" step="1" />
          </label>
        </div>
        <div class="settings-grid hidden" id="tgShotFieldsHourly">
          <label><span data-i18n="tg.shot_hourly_minute">Menit dalam jam (0–59)</span>
            <input type="number" id="tgShotHourlyMinute" min="0" max="59" step="1" value="0" />
          </label>
        </div>
        <div class="settings-grid hidden" id="tgShotFieldsDaily">
          <label><span data-i18n="tg.shot_daily_time">Jam (HH:MM)</span>
            <input type="time" id="tgShotDailyTime" value="08:00" />
          </label>
        </div>

        <p class="settings-desc tg-shot-last" id="tgShotLastHint" data-i18n="tg.shot_last_none">Belum pernah dikirim.</p>

        <div class="prop-actions scan-modal-actions">
          <button type="button" class="btn ghost" id="btnTgTestShot">
            <span class="btn-label" data-i18n="tg.test_shot">Uji kirim</span>
          </button>
          <button type="button" class="btn save" id="btnSaveTgScreenshot">
            <span class="btn-label" data-i18n="settings.save">Simpan</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div id="modalTgSettings" class="modal hidden" aria-hidden="true">
    <div class="modal-card scan-card tg-card">
      <header>
        <h2 data-i18n="tg.settings_title">Pengaturan Telegram</h2>
        <button type="button" class="icon-btn close" id="btnCloseTgSettings" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="settings-body tg-modal-body">
        <p class="settings-desc" data-i18n="tg.settings_desc">Bot token &amp; chat ID disimpan di pengaturan aplikasi (bukan file Save/Open topologi).</p>
        <label class="switch-row">
          <span class="switch-text" data-i18n="tg.enabled">Aktifkan Telegram</span>
          <span class="switch">
            <input type="checkbox" id="tgEnabled" role="switch" />
            <span class="slider" aria-hidden="true"></span>
          </span>
        </label>
        <label><span data-i18n="tg.bot_token">Bot Token</span>
          <input type="text" id="tgBotToken" autocomplete="off" spellcheck="false" />
        </label>
        <p class="settings-desc" data-i18n="tg.token_hint">Ubah token bila perlu.</p>
        <label><span data-i18n="tg.chat_id">Chat ID</span>
          <input type="text" id="tgChatId" autocomplete="off" spellcheck="false" />
        </label>
        <div class="prop-actions scan-modal-actions">
          <button type="button" class="btn ghost" id="btnTgTestConn">
            <span class="btn-label" data-i18n="tg.test_conn">Uji koneksi</span>
          </button>
          <button type="button" class="btn save" id="btnSaveTgSettings">
            <span class="btn-label" data-i18n="settings.save">Simpan</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast hidden"></div>
  <div id="busy" class="busy hidden" aria-live="polite">
    <div class="busy-card">
      <button type="button" class="icon-btn cancel busy-cancel" id="btnCancelBusy" aria-label="Batalkan" data-i18n-aria="busy.cancel" title="Batalkan" data-i18n-title="busy.cancel">
        <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M7.05 7.05l9.9 9.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
      <div class="spinner"></div>
      <p id="busyText" data-i18n="busy.default">Memproses…</p>
      <div id="busyProgressWrap" class="busy-progress hidden">
        <div class="busy-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="busyBarTrack">
          <div id="busyBar" class="busy-bar-fill"></div>
        </div>
        <div class="busy-meta">
          <span id="busyPercent">0%</span>
          <span id="busyCount">0 / 0</span>
        </div>
        <p id="busyDetail" class="busy-detail" data-i18n="busy.detail">Menyiapkan scan…</p>
        <p id="busyFound" class="busy-found">Ditemukan: 0 host</p>
      </div>
    </div>
  </div>

  <div id="modalConfirm" class="modal hidden" aria-hidden="true">
    <div class="modal-card confirm-card">
      <header>
        <h2 id="confirmTitle" data-i18n="common.confirm">Konfirmasi</h2>
        <button type="button" class="icon-btn close" id="btnCloseConfirm" aria-label="Tutup" data-i18n-aria="common.close" title="Tutup" data-i18n-title="common.close">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="confirm-modal-body">
        <p id="confirmMessage" data-i18n="confirm.delete_msg">Yakin ingin menghapus?</p>
      </div>
      <div class="prop-actions scan-modal-actions confirm-modal-actions">
        <button type="button" class="btn cancel" id="btnConfirmCancel">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M7.05 7.05l9.9 9.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <span class="btn-label" data-i18n="common.cancel">Batal</span>
        </button>
        <button type="button" class="btn danger" id="btnConfirmOk">
          <svg class="btn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M8 7l.7 12.2a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="btn-label" id="confirmOkLabel" data-i18n="confirm.delete">Hapus</span>
        </button>
      </div>
    </div>
  </div>

  <script src="assets/js/i18n.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/i18n.js') ?>"></script>
  <script src="assets/js/link-types.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/link-types.js') ?>"></script>
  <script src="assets/js/excel-import.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/excel-import.js') ?>"></script>
  <script src="assets/js/app.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/app.js') ?>"></script>
  <script src="assets/js/app-update.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/app-update.js') ?>"></script>
</body>
</html>
