<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';

pamantau_auth_boot();
pamantau_auth_ensure_bootstrap();

// Authoritative logout via navigation — avoids waiting on a locked API session
// held by a long-running poll/scan (which looked like endless loading).
if (isset($_GET['logout'])) {
    pamantau_auth_logout();
    header('Location: login.php');
    exit;
}

if (pamantau_auth_logged_in()) {
    header('Location: index.php');
    exit;
}

$settings = pamantau_normalize_settings(pamantau_read('settings', []));
$lang = strtolower((string) ($settings['ui_language'] ?? 'id')) === 'en' ? 'en' : 'id';
$theme = in_array((string) ($settings['theme'] ?? 'light'), ['light', 'dark', 'sand'], true)
    ? (string) $settings['theme']
    : 'light';
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($lang, ENT_QUOTES, 'UTF-8') ?>" data-theme="<?= htmlspecialchars($theme, ENT_QUOTES, 'UTF-8') ?>">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Pamantau Login</title>
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="assets/img/logo.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Oxanium:wght@600;700;800&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="assets/css/app.css?v=<?= (int) @filemtime(__DIR__ . '/assets/css/app.css') ?>" />
  <style>
    body {
      overflow: auto;
      min-height: 100vh;
    }
    .login-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .login-card {
      width: min(100%, 420px);
      padding: 28px;
      border-radius: 24px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 92%, white 8%), var(--surface));
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
      display: grid;
      gap: 18px;
    }
    .login-brand {
      display: grid;
      justify-items: center;
      gap: 12px;
      text-align: center;
    }
    .login-brand img {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      border: 2px solid rgba(255,255,255,.85);
      box-shadow: 0 14px 30px rgba(var(--accent-rgb), .2);
      background: #fff;
    }
    .login-brand h1 {
      margin: 0;
      font-family: var(--display);
      font-size: 2rem;
      line-height: 1;
      letter-spacing: -0.04em;
      color: var(--ink);
    }
    .login-brand p {
      margin: 0;
      color: var(--muted);
      font-size: .92rem;
      line-height: 1.5;
    }
    .login-form {
      display: grid;
      gap: 14px;
    }
    .login-form label {
      display: grid;
      gap: 6px;
      font-size: .76rem;
      color: var(--muted);
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .login-form input {
      width: 100%;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      border-radius: 14px;
      padding: 14px 15px;
      font: 500 .96rem var(--font);
    }
    .login-form input:focus {
      outline: none;
      border-color: rgba(var(--accent-rgb), .55);
      box-shadow: 0 0 0 3px rgba(var(--accent-rgb), .14);
    }
    .login-submit {
      width: 100%;
      min-height: 50px;
    }
    .login-error {
      min-height: 1.4em;
      margin: 0;
      color: var(--offline);
      font: 600 .84rem/1.45 var(--font);
      text-align: center;
    }
    .login-hint {
      margin: 0;
      color: var(--muted);
      font: 500 .82rem/1.5 var(--font);
      text-align: center;
    }
    .login-hint code {
      font-family: var(--mono);
      color: var(--ink);
      background: var(--chip);
      padding: 2px 6px;
      border-radius: 999px;
    }
    .login-copy {
      margin: 0;
      color: var(--muted);
      font: 500 .78rem/1.5 var(--font);
      text-align: center;
      letter-spacing: 0.01em;
    }
    @media (max-width: 640px) {
      .login-shell { padding: 16px; }
      .login-card { padding: 22px 18px; border-radius: 20px; }
      .login-brand h1 { font-size: 1.7rem; }
    }
  </style>
</head>
<body>
  <main class="login-shell">
    <section class="login-card">
      <div class="login-brand">
        <img src="assets/img/logo.svg" alt="Pamantau logo" />
        <div>
          <h1>Pamantau</h1>
          <p data-i18n="auth.login_subtitle">Masuk untuk membuka dashboard monitoring.</p>
        </div>
      </div>

      <form class="login-form" id="loginForm">
        <label>
          <span data-i18n="auth.username">Username</span>
          <input type="text" id="loginUsername" name="username" autocomplete="username" required value="" />
        </label>
        <label>
          <span data-i18n="auth.password">Password</span>
          <input type="password" id="loginPassword" name="password" autocomplete="current-password" required value="" />
        </label>
        <p class="login-error" id="loginError" role="alert"></p>
        <button type="submit" class="btn primary login-submit">
          <span data-i18n="auth.login">Login</span>
        </button>
      </form>

      <p class="login-copy" id="loginCopy">Copyright © JERIYANT - BARAMCITY</p>
    </section>
  </main>

  <script>window.PAMANTAU_LOGIN_LANG = <?= json_encode($lang, JSON_UNESCAPED_UNICODE) ?>;</script>
  <script src="assets/js/i18n.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/i18n.js') ?>"></script>
  <script>
    (() => {
      const I18N = window.PamantauI18n;
      const lang = window.PAMANTAU_LOGIN_LANG || 'id';
      const form = document.getElementById('loginForm');
      const username = document.getElementById('loginUsername');
      const password = document.getElementById('loginPassword');
      const error = document.getElementById('loginError');

      function t(key, vars) {
        return I18N && typeof I18N.t === 'function' ? I18N.t(key, vars) : key;
      }

      if (I18N && typeof I18N.applyLanguage === 'function') {
        I18N.applyLanguage(lang);
      }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.textContent = '';
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;

        try {
          const res = await fetch('api/index.php?action=login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: username.value.trim(),
              password: password.value,
            }),
          });
          const data = await res.json();
          if (!res.ok || data.ok === false) {
            if (res.status === 429 || data.rate_limited) {
              const mins = Math.max(1, Math.ceil(Number(data.retry_after || 0) / 60));
              throw new Error(t('auth.account_locked', { minutes: mins }));
            }
            throw new Error(data.error || t('auth.login_failed'));
          }
          window.location.href = 'index.php';
        } catch (err) {
          error.textContent = err && err.message ? err.message : t('auth.login_failed');
        } finally {
          btn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>
