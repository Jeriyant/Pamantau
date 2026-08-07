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
$theme = in_array((string) ($settings['theme'] ?? 'light'), ['light', 'dark'], true)
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
    .login-input-wrap {
      position: relative;
      display: block;
    }
    .login-input-wrap input {
      width: 100%;
      padding-right: 48px;
    }
    .login-visibility {
      position: absolute;
      top: 50%;
      right: 6px;
      transform: translateY(-50%);
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--muted);
      display: grid;
      place-items: center;
      cursor: pointer;
      transition: color 0.15s ease, background 0.15s ease;
    }
    .login-visibility:hover,
    .login-visibility:focus-visible {
      color: var(--ink);
      background: color-mix(in srgb, var(--chip) 80%, transparent);
      outline: none;
    }
    .login-visibility svg {
      width: 18px;
      height: 18px;
    }
    .login-visibility .eye-off {
      display: none;
    }
    .login-visibility.is-shown .eye-on {
      display: none;
    }
    .login-visibility.is-shown .eye-off {
      display: block;
    }
    .login-form #resetKey {
      font-family: var(--mono);
      font-size: .88rem;
      letter-spacing: .02em;
    }
    .login-password-row {
      display: grid;
      gap: 8px;
    }
    .login-forgot {
      justify-self: end;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent, #0284c8);
      font: 600 .82rem/1.4 var(--font);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .login-forgot:hover,
    .login-forgot:focus-visible {
      opacity: .85;
      outline: none;
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
    .login-success {
      min-height: 1.4em;
      margin: 0;
      color: var(--online, #16a34a);
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
    .login-panel[hidden] {
      display: none !important;
    }
    .login-back {
      justify-self: start;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: var(--muted);
      font: 600 .82rem/1.4 var(--font);
      cursor: pointer;
    }
    .login-back:hover,
    .login-back:focus-visible {
      color: var(--ink);
      outline: none;
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
          <p id="loginSubtitle" data-i18n="auth.login_subtitle">Masuk untuk membuka dashboard monitoring.</p>
        </div>
      </div>

      <div class="login-panel" id="loginPanel">
        <form class="login-form" id="loginForm">
          <label>
            <span data-i18n="auth.username">Username</span>
            <input type="text" id="loginUsername" name="username" autocomplete="username" required value="" />
          </label>
          <div class="login-password-row">
            <label>
              <span data-i18n="auth.password">Password</span>
              <input type="password" id="loginPassword" name="password" autocomplete="current-password" required value="" />
            </label>
            <button type="button" class="login-forgot" id="btnForgotPassword" data-i18n="auth.forgot_password">Lupa Password?</button>
          </div>
          <p class="login-error" id="loginError" role="alert"></p>
          <button type="submit" class="btn primary login-submit">
            <span data-i18n="auth.login">Login</span>
          </button>
        </form>
      </div>

      <div class="login-panel" id="resetPanel" hidden>
        <form class="login-form" id="resetForm">
          <button type="button" class="login-back" id="btnBackLogin" data-i18n="auth.back_to_login">← Kembali ke login</button>
          <p class="login-hint" data-i18n="auth.reset_hint">Masukkan isi file <code>database/app.key</code> untuk mengatur username dan password baru.</p>
          <label>
            <span data-i18n="auth.username">Username</span>
            <input type="text" id="resetUsername" name="username" autocomplete="username" spellcheck="false" required value="" />
          </label>
          <label>
            <span data-i18n="auth.recovery_key">Recovery key (app.key)</span>
            <div class="login-input-wrap">
              <input type="password" id="resetKey" name="recovery_key" autocomplete="off" spellcheck="false" required value="" />
              <button type="button" class="login-visibility" data-toggle-password="resetKey" aria-label="Tampilkan" title="Tampilkan">
                <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              </button>
            </div>
          </label>
          <label>
            <span data-i18n="auth.new_password">Password baru</span>
            <div class="login-input-wrap">
              <input type="password" id="resetPassword" name="new_password" autocomplete="new-password" required minlength="6" value="" />
              <button type="button" class="login-visibility" data-toggle-password="resetPassword" aria-label="Tampilkan" title="Tampilkan">
                <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              </button>
            </div>
          </label>
          <label>
            <span data-i18n="auth.confirm_password">Konfirmasi password</span>
            <div class="login-input-wrap">
              <input type="password" id="resetConfirm" name="confirm_password" autocomplete="new-password" required minlength="6" value="" />
              <button type="button" class="login-visibility" data-toggle-password="resetConfirm" aria-label="Tampilkan" title="Tampilkan">
                <svg class="eye-on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>
                <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.6A3 3 0 0 0 13.4 13.5M7.1 7.3C4.7 8.7 3 12 3 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M16.8 16.2C19.2 14.8 21 12 21 12s-3.5-6.5-9.5-6.5c-.7 0-1.4.1-2 .2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              </button>
            </div>
          </label>
          <p class="login-error" id="resetError" role="alert"></p>
          <p class="login-success" id="resetSuccess" role="status"></p>
          <button type="submit" class="btn primary login-submit">
            <span data-i18n="auth.reset_password">Reset Password</span>
          </button>
        </form>
      </div>

      <p class="login-copy" id="loginCopy">Copyright © JERIYANT - BARAMCITY</p>
    </section>
  </main>

  <script>window.PAMANTAU_LOGIN_LANG = <?= json_encode($lang, JSON_UNESCAPED_UNICODE) ?>;</script>
  <script src="assets/js/i18n.js?v=<?= (int) @filemtime(__DIR__ . '/assets/js/i18n.js') ?>"></script>
  <script>
    (() => {
      const I18N = window.PamantauI18n;
      const lang = window.PAMANTAU_LOGIN_LANG || 'id';
      const loginPanel = document.getElementById('loginPanel');
      const resetPanel = document.getElementById('resetPanel');
      const subtitle = document.getElementById('loginSubtitle');
      const form = document.getElementById('loginForm');
      const resetForm = document.getElementById('resetForm');
      const username = document.getElementById('loginUsername');
      const password = document.getElementById('loginPassword');
      const error = document.getElementById('loginError');
      const resetError = document.getElementById('resetError');
      const resetSuccess = document.getElementById('resetSuccess');
      const resetUsername = document.getElementById('resetUsername');
      const resetKey = document.getElementById('resetKey');
      const resetPassword = document.getElementById('resetPassword');
      const resetConfirm = document.getElementById('resetConfirm');
      const btnForgot = document.getElementById('btnForgotPassword');
      const btnBack = document.getElementById('btnBackLogin');

      function t(key, vars) {
        return I18N && typeof I18N.t === 'function' ? I18N.t(key, vars) : key;
      }

      function syncVisibilityLabels() {
        resetForm.querySelectorAll('[data-toggle-password]').forEach((btn) => {
          const shown = btn.classList.contains('is-shown');
          const label = shown ? t('auth.hide_password') : t('auth.show_password');
          btn.setAttribute('aria-label', label);
          btn.setAttribute('title', label);
        });
      }

      function setMode(mode) {
        const isReset = mode === 'reset';
        loginPanel.hidden = isReset;
        resetPanel.hidden = !isReset;
        if (subtitle) {
          subtitle.setAttribute('data-i18n', isReset ? 'auth.reset_subtitle' : 'auth.login_subtitle');
          subtitle.textContent = t(isReset ? 'auth.reset_subtitle' : 'auth.login_subtitle');
        }
        error.textContent = '';
        resetError.textContent = '';
        resetSuccess.textContent = '';
        if (isReset) {
          if (!resetUsername.value.trim() && username.value.trim()) {
            resetUsername.value = username.value.trim();
          }
          resetUsername.focus();
          syncVisibilityLabels();
        } else {
          username.focus();
        }
      }

      if (I18N && typeof I18N.applyLanguage === 'function') {
        I18N.applyLanguage(lang);
      }
      syncVisibilityLabels();

      btnForgot.addEventListener('click', () => setMode('reset'));
      btnBack.addEventListener('click', () => setMode('login'));

      resetForm.querySelectorAll('[data-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.getAttribute('data-toggle-password');
          const input = id ? document.getElementById(id) : null;
          if (!input) return;
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.classList.toggle('is-shown', show);
          const label = show ? t('auth.hide_password') : t('auth.show_password');
          btn.setAttribute('aria-label', label);
          btn.setAttribute('title', label);
        });
      });

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

      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        resetError.textContent = '';
        resetSuccess.textContent = '';

        const nextUsername = resetUsername.value.trim();
        const key = resetKey.value.trim();
        const nextPass = resetPassword.value;
        const confirm = resetConfirm.value;

        if (!nextUsername) {
          resetError.textContent = t('auth.username_required');
          return;
        }
        if (nextPass.length < 6) {
          resetError.textContent = t('auth.password_min');
          return;
        }
        if (nextPass !== confirm) {
          resetError.textContent = t('auth.password_mismatch');
          return;
        }

        const btn = resetForm.querySelector('button[type="submit"]');
        btn.disabled = true;

        try {
          const res = await fetch('api/index.php?action=reset_password', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recovery_key: key,
              new_username: nextUsername,
              new_password: nextPass,
              confirm_password: confirm,
            }),
          });
          const data = await res.json();
          if (!res.ok || data.ok === false) {
            if (res.status === 429 || data.rate_limited) {
              const mins = Math.max(1, Math.ceil(Number(data.retry_after || 0) / 60));
              throw new Error(t('auth.account_locked', { minutes: mins }));
            }
            if (data.error && /recovery key/i.test(String(data.error))) {
              throw new Error(t('auth.recovery_key_invalid'));
            }
            throw new Error(data.error || t('auth.reset_failed'));
          }

          const savedUsername = (data.auth && data.auth.username) || nextUsername;
          resetForm.reset();
          [resetKey, resetPassword, resetConfirm].forEach((input) => {
            if (input) input.type = 'password';
          });
          resetForm.querySelectorAll('[data-toggle-password]').forEach((toggle) => {
            toggle.classList.remove('is-shown');
          });
          syncVisibilityLabels();
          username.value = savedUsername;
          resetSuccess.textContent = t('auth.reset_success');
          setTimeout(() => {
            setMode('login');
            password.focus();
          }, 1200);
        } catch (err) {
          resetError.textContent = err && err.message ? err.message : t('auth.reset_failed');
        } finally {
          btn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>
