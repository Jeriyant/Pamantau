/**
 * Pamantau — GitHub Releases update check + server install (FO-Simulator pattern).
 */
(function (global) {
  'use strict';

  const GITHUB_OWNER = 'Jeriyant';
  const GITHUB_REPO = 'Pamantau';
  const DIST_ASSET_NAME = 'pamantau-dist.zip';
  const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  const DISMISS_KEY = 'pamantau-update-dismissed';

  function getUpdateApiUrl() {
    return new URL('update.php', window.location.href).href;
  }

  function normalizeVersion(raw) {
    return String(raw || '').trim().replace(/^v/i, '');
  }

  function compareSemver(a, b) {
    const pa = normalizeVersion(a).split(/[.+-]/).map((p) => Number.parseInt(p, 10));
    const pb = normalizeVersion(b).split(/[.+-]/).map((p) => Number.parseInt(p, 10));
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const na = Number.isFinite(pa[i]) ? pa[i] : 0;
      const nb = Number.isFinite(pb[i]) ? pb[i] : 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  function findDistAsset(assets) {
    if (!assets || !assets.length) return null;
    const exact = assets.find((a) => a.name === DIST_ASSET_NAME);
    if (exact && exact.browser_download_url) return exact.browser_download_url;
    const zip = assets.find((a) => (a.name || '').toLowerCase().endsWith('.zip'));
    return zip && zip.browser_download_url ? zip.browser_download_url : null;
  }

  function formatReleaseNotesPreview(notes, maxItems) {
    const limit = maxItems == null ? 3 : maxItems;
    const cleaned = String(notes || '').replace(/^\uFEFF/, '').trim();
    if (!cleaned) return '';
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const whatsNewIdx = lines.findIndex((line) => /^#+\s*what'?s\s+new\b/i.test(line));
    const start = whatsNewIdx >= 0 ? whatsNewIdx + 1 : 0;
    const items = [];
    for (let i = start; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^#+\s/.test(line)) break;
      const text = line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim();
      if (!text) continue;
      items.push(text);
      if (items.length >= limit) break;
    }
    if (!items.length) {
      for (const line of lines) {
        if (/^#+\s/.test(line)) continue;
        const text = line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim();
        if (!text) continue;
        items.push(text);
        if (items.length >= limit) break;
      }
    }
    return items.join(' · ');
  }

  async function fetchLatestRelease(signal) {
    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        const tag = (data.tag_name || '').trim();
        if (tag) {
          return {
            tag,
            version: normalizeVersion(tag),
            notes: String(data.body || '').replace(/^\uFEFF/, '').trim(),
            htmlUrl: (data.html_url || '').trim() || `${GITHUB_REPO_URL}/releases`,
            downloadUrl: findDistAsset(data.assets),
          };
        }
      }
    } catch (err) {
      console.warn('[Pamantau update] Direct client GitHub fetch failed, trying server backend proxy:', err);
    }

    // Fallback: fetch via backend PHP proxy (update.php?action=check)
    const backendRes = await fetch(`${getUpdateApiUrl()}?action=check`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    if (!backendRes.ok) throw new Error(`GitHub release check failed (${backendRes.status})`);
    const bdata = await backendRes.json();
    if (!bdata || !bdata.ok || !bdata.tag) throw new Error(bdata.error || 'Server release check failed');
    return {
      tag: bdata.tag,
      version: bdata.version,
      notes: bdata.notes,
      htmlUrl: bdata.htmlUrl,
      downloadUrl: bdata.downloadUrl,
    };
  }

  async function applyServerUpdate(signal, onProgress) {
    let pollTimer;
    const pollProgress = async () => {
      try {
        const res = await fetch(getUpdateApiUrl(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || typeof data !== 'object') return;
        onProgress && onProgress({
          stage: typeof data.stage === 'string' ? data.stage : 'idle',
          percent: typeof data.percent === 'number' ? data.percent : 0,
          message: typeof data.message === 'string' ? data.message : '',
          bytesReceived: typeof data.bytesReceived === 'number' ? data.bytesReceived : 0,
          bytesTotal: typeof data.bytesTotal === 'number' ? data.bytesTotal : 0,
          updatedAt: data.updatedAt,
        });
      } catch (_) { /* ignore */ }
    };

    if (onProgress) {
      onProgress({
        stage: 'check',
        percent: 0,
        message: 'Memulai update…',
        bytesReceived: 0,
        bytesTotal: 0,
      });
      void pollProgress();
      pollTimer = setInterval(() => { void pollProgress(); }, 400);
    }

    let res;
    try {
      res = await fetch(getUpdateApiUrl(), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal,
      });
    } catch (_) {
      if (pollTimer) clearInterval(pollTimer);
      return {
        ok: false,
        error: 'update.php tidak terjangkau. Pastikan PHP aktif dan file update.php ada di folder app.',
      };
    } finally {
      if (pollTimer) clearInterval(pollTimer);
    }

    await pollProgress();

    let data = { ok: false };
    try {
      data = await res.json();
    } catch (_) {
      return {
        ok: false,
        error: `Respons bukan JSON (HTTP ${res.status}). Cek apakah PHP berjalan untuk update.php.`,
      };
    }

    if (!res.ok || !data.ok) {
      const detail = typeof data.detail === 'string' ? data.detail.trim() : '';
      const detailHint = detail && !(data.error || '').includes(detail.slice(0, 40))
        ? detail.split('\n').filter(Boolean).slice(-2).join(' | ')
        : '';
      return {
        ok: false,
        error: data.error || (`Update gagal (HTTP ${res.status})` + (detailHint ? `: ${detailHint}` : '')),
        detail: data.detail,
      };
    }

    return {
      ok: true,
      version: data.version,
      tag: data.tag,
      skipped: data.skipped,
    };
  }

  function t(key, vars) {
    if (global.I18N && typeof global.I18N.t === 'function') {
      return global.I18N.t(key, vars);
    }
    return key;
  }

  function appVersion() {
    return normalizeVersion(global.PAMANTAU_VERSION || '0.0.0');
  }

  function isDismissed(tag) {
    try {
      return localStorage.getItem(DISMISS_KEY) === tag;
    } catch (_) {
      return false;
    }
  }

  function dismiss(tag) {
    try {
      localStorage.setItem(DISMISS_KEY, tag);
    } catch (_) { /* ignore */ }
  }

  function renderProgress(host, progress) {
    if (!host) return;
    const pct = Math.max(0, Math.min(100, Math.round((progress && progress.percent) || 0)));
    host.innerHTML = `
      <div class="update-progress">
        <div class="update-progress-row">
          <span class="update-progress-msg"></span>
          <span class="update-progress-pct">${pct}%</span>
        </div>
        <div class="update-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="update-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    const msg = host.querySelector('.update-progress-msg');
    if (msg) msg.textContent = (progress && progress.message) || '…';
  }

  function showBanner(latest, api) {
    const root = document.getElementById('updateBanner');
  function setBtnText(btn, text) {
    if (!btn) return;
    const labelSpan = btn.querySelector('span[data-i18n], span.btn-label, span');
    if (labelSpan) {
      labelSpan.textContent = text;
    } else {
      btn.textContent = text;
    }
  }

  function showBanner(latest, api) {
    const root = document.getElementById('updateBanner');
    if (!root || !latest) return;
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="update-banner-text">
        <strong></strong>
        <span class="update-banner-note"></span>
        <div class="update-banner-progress-host"></div>
        <span class="update-banner-error hidden"></span>
      </div>
      <div class="update-banner-actions">
        <button type="button" class="update-banner-btn primary" data-act="install">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="update.install"></span>
        </button>
        <a class="update-banner-btn ghost" data-act="view" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="update.view_release"></span>
        </a>
        <button type="button" class="update-banner-btn ghost" data-act="later">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="update.later"></span>
        </button>
        <button type="button" class="update-banner-close" data-act="later" aria-label="Close">×</button>
      </div>`;
    root.querySelector('strong').textContent = t('update.available', { version: latest.version });
    const note = root.querySelector('.update-banner-note');
    const preview = formatReleaseNotesPreview(latest.notes);
    if (note) {
      note.textContent = preview;
      note.classList.toggle('hidden', !preview);
    }
    const installBtn = root.querySelector('[data-act="install"]');
    if (installBtn) setBtnText(installBtn, t('update.install'));
    const view = root.querySelector('[data-act="view"]');
    if (view) {
      view.href = latest.htmlUrl;
      setBtnText(view, t('update.view_release'));
    }
    const laterBtns = root.querySelectorAll('[data-act="later"]');
    laterBtns.forEach((btn) => {
      if (btn.tagName === 'BUTTON' && !btn.classList.contains('update-banner-close')) {
        setBtnText(btn, t('update.later'));
      }
      btn.addEventListener('click', () => {
        dismiss(latest.tag);
        root.classList.add('hidden');
      });
    });
    if (installBtn) {
      installBtn.addEventListener('click', () => api.apply(latest, {
        progressHost: root.querySelector('.update-banner-progress-host'),
        errorHost: root.querySelector('.update-banner-error'),
        installBtn,
      }));
    }
  }

  function setSettingsStatus(text, isError) {
    const el = document.getElementById('updateStatusText');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  function init() {
    const current = appVersion();
    const badge = document.getElementById('appVersionBadge');
    if (badge) badge.textContent = `v${current}`;

    const curValEl = document.getElementById('updateCurrentVersionVal');
    if (curValEl) curValEl.textContent = `v${current}`;

    let latest = null;
    let applying = false;
    let abort = null;

    const api = {
      async check({ silent } = {}) {
        if (abort) abort.abort();
        abort = new AbortController();
        const btnCheck = document.getElementById('btnUpdateCheck');
        const btnInstall = document.getElementById('btnUpdateInstall');
        if (btnCheck) btnCheck.disabled = true;
        if (!silent) setSettingsStatus(t('update.checking'), false);
        try {
          const release = await fetchLatestRelease(abort.signal);
          latest = release;
          const newer = compareSemver(release.version, current) > 0;
          const latValEl = document.getElementById('updateLatestVersionVal');
          if (latValEl) {
            if (newer) {
              latValEl.innerHTML = `v${release.version} <span class="version-tag newer">${t('update.available_badge')}</span>`;
            } else {
              latValEl.innerHTML = `v${release.version} <span class="version-tag ok">${t('update.up_to_date_badge')}</span>`;
            }
          }
          if (btnInstall) {
            if (newer && release.downloadUrl) {
              btnInstall.classList.remove('hidden');
              btnInstall.disabled = applying;
            } else {
              btnInstall.classList.add('hidden');
              btnInstall.disabled = true;
            }
          }
          if (!newer) {
            setSettingsStatus(t('update.up_to_date'), false);
            const banner = document.getElementById('updateBanner');
            if (banner) banner.classList.add('hidden');
            return release;
          }
          setSettingsStatus(t('update.available', { version: release.version }), false);
          if (!isDismissed(release.tag)) showBanner(release, api);
          return release;
        } catch (err) {
          if (err && err.name === 'AbortError') return null;
          const latValEl = document.getElementById('updateLatestVersionVal');
          if (latValEl) latValEl.textContent = '-';
          if (btnInstall) {
            btnInstall.classList.add('hidden');
            btnInstall.disabled = true;
          }
          setSettingsStatus(t('update.check_failed'), true);
          if (!silent) console.warn('[Pamantau update]', err);
          return null;
        } finally {
          if (btnCheck) btnCheck.disabled = false;
        }
      },
      async apply(release, hosts) {
        if (applying) return;
        const target = release || latest;
        if (!target) return;
        if (!target.downloadUrl) {
          setSettingsStatus(t('update.no_asset'), true);
          return;
        }
        applying = true;
        if (hosts && hosts.installBtn) {
          hosts.installBtn.disabled = true;
          setBtnText(hosts.installBtn, t('update.applying'));
        }
        const settingsInstall = document.getElementById('btnUpdateInstall');
        if (settingsInstall) {
          settingsInstall.disabled = true;
          setBtnText(settingsInstall, t('update.applying'));
        }
        try {
          const result = await applyServerUpdate(null, (progress) => {
            if (hosts && hosts.progressHost) renderProgress(hosts.progressHost, progress);
            const settingsProgress = document.getElementById('updateProgressHost');
            if (settingsProgress) renderProgress(settingsProgress, progress);
            setSettingsStatus(progress.message || t('update.applying'), false);
          });
          if (!result.ok) {
            const err = result.error || t('update.check_failed');
            setSettingsStatus(err, true);
            if (hosts && hosts.errorHost) {
              hosts.errorHost.textContent = err;
              hosts.errorHost.classList.remove('hidden');
            }
            applying = false;
            if (hosts && hosts.installBtn) {
              hosts.installBtn.disabled = false;
              setBtnText(hosts.installBtn, t('update.install'));
            }
            if (settingsInstall) {
              settingsInstall.disabled = false;
              setBtnText(settingsInstall, t('update.install'));
            }
            return;
          }
          window.location.reload();
        } catch (err) {
          applying = false;
          setSettingsStatus(String(err && err.message ? err.message : err), true);
        }
      },
    };

    const btnCheck = document.getElementById('btnUpdateCheck');
    if (btnCheck) {
      btnCheck.addEventListener('click', (e) => {
        e.preventDefault();
        void api.check({ silent: false });
      });
    }
    const btnInstall = document.getElementById('btnUpdateInstall');
    if (btnInstall) {
      btnInstall.addEventListener('click', (e) => {
        e.preventDefault();
        void api.apply(latest, {
          progressHost: document.getElementById('updateProgressHost'),
          errorHost: document.getElementById('updateSettingsError'),
          installBtn: btnInstall,
        });
      });
    }
    if (badge) {
      badge.addEventListener('click', () => { void api.check(); });
      badge.title = t('update.check_now');
    }

    setSettingsStatus(t('update.idle'), false);
    // Auto-check shortly after load (non-blocking).
    setTimeout(() => { void api.check({ silent: true }); }, 1200);

    global.PamantauUpdate = api;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
