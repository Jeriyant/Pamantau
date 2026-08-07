(() => {
  const API = 'api/index.php';
  const HEADLESS_SNAPSHOT_TOKEN = String(window.PAMANTAU_HEADLESS_SNAPSHOT_TOKEN || '');
  const HEADLESS_SNAPSHOT_MODE = HEADLESS_SNAPSHOT_TOKEN !== '';
  const TYPES = [
    { type: 'web', label: 'Web', short: 'WEB', desc: 'Situs / webserver', color: '#6366f1', icon: 'assets/img/devices/web.svg' },
    { type: 'internet', label: 'Internet', short: 'NET', desc: 'Gateway / uplink internet', color: '#0ea5e9', icon: 'assets/img/devices/internet.svg' },
    { type: 'vpn', label: 'VPN', short: 'VPN', desc: 'Layanan VPN', color: '#84cc16', icon: 'assets/img/devices/vpn.svg' },
    { type: 'server', label: 'Server', short: 'SRV', desc: 'Server / host', color: '#1a6aff', icon: 'assets/img/devices/server.svg' },
    { type: 'database', label: 'Database', short: 'DB', desc: 'Basis data / DB server', color: '#9333ea', icon: 'assets/img/devices/database.svg' },
    { type: 'loadbalance', label: 'Load Balance', short: 'LB', desc: 'Load balancer', color: '#db2777', icon: 'assets/img/devices/loadbalance.svg' },
    { type: 'router', label: 'Router', short: 'RTR', desc: 'Router jaringan', color: '#ff8a1f', icon: 'assets/img/devices/router.svg' },
    { type: 'olt', label: 'OLT', short: 'OLT', desc: 'Terminal fiber', color: '#12b5c9', icon: 'assets/img/devices/olt.svg' },
    { type: 'onu', label: 'ONU', short: 'ONU', desc: 'Unit pelanggan', color: '#16a34a', icon: 'assets/img/devices/onu.svg' },
    { type: 'printer', label: 'Printer', short: 'PRT', desc: 'Printer / pencetak', color: '#a16207', icon: 'assets/img/devices/printer.svg' },
    { type: 'client', label: 'Client', short: 'CLI', desc: 'Perangkat pengguna', color: '#52525b', icon: 'assets/img/devices/client.svg' },
  ];

  const LINK_TYPES = window.PAMANTAU_LINK_TYPES || [
    { id: 'default', label: 'Default', color: '#e11d48', icon: 'assets/img/links/default.svg' },
  ];

  function normalizeLinkType(value) {
    const id = String(value || 'default').toLowerCase().trim();
    return LINK_TYPES.some((t) => t.id === id) ? id : 'default';
  }

  function getLinkTypeMeta(linkType) {
    const id = normalizeLinkType(linkType);
    return LINK_TYPES.find((t) => t.id === id) || LINK_TYPES[0];
  }

  function linkTypeLabel(linkType) {
    const meta = getLinkTypeMeta(linkType);
    const key = `link.type.${meta.id}`;
    const translated = t(key);
    return translated !== key ? translated : meta.label;
  }

  function normalizeConnection(conn) {
    return { ...conn, link_type: normalizeLinkType(conn.link_type) };
  }

  function normalizeConnections(list) {
    return (list || []).map(normalizeConnection);
  }

  function isCompactType(type) {
    const m = TYPES.find((t) => t.type === type);
    return !!(m && m.compact);
  }

  function connectionValidationError(fromDevice, toDevice) {
    if (!fromDevice || !toDevice) return 'Perangkat tidak ditemukan';
    return null;
  }

  /** Form controls where canvas shortcuts (Ctrl+C/V/A, Delete, Space) should not steal focus. */
  const EDITABLE_SEL = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, select, [contenteditable="true"]';

  /** Text-like fields only — custom Potong/Salin/Tempel menu; exclude select and non-text inputs. */
  const TEXT_EDITABLE_SEL = 'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="password"], input[type="number"], input[type="tel"], textarea';

  function isEditableTarget(t) {
    const node = t && t.nodeType === 1 ? t : t && t.parentElement;
    return !!(node && node.closest && node.closest(EDITABLE_SEL));
  }

  function isTextEditableTarget(t) {
    const node = t && t.nodeType === 1 ? t : t && t.parentElement;
    return !!(node && node.closest && node.closest(TEXT_EDITABLE_SEL));
  }

  function editableFieldFrom(t) {
    const node = t && t.nodeType === 1 ? t : t && t.parentElement;
    return (node && node.closest && node.closest(EDITABLE_SEL)) || null;
  }

  function textEditableFieldFrom(t) {
    const node = t && t.nodeType === 1 ? t : t && t.parentElement;
    return (node && node.closest && node.closest(TEXT_EDITABLE_SEL)) || null;
  }


  const I18N = window.PamantauI18n || null;
  /** Last known host uptime (seconds); kept so language switches can re-format. */
  let lastServerUptimeSeconds = null;
  function t(key, vars) {
    return I18N && typeof I18N.t === 'function' ? I18N.t(key, vars) : key;
  }
  function normalizeUiLang(value) {
    return I18N && typeof I18N.normalizeLang === 'function'
      ? I18N.normalizeLang(value)
      : (String(value || '').toLowerCase() === 'en' ? 'en' : 'id');
  }
  function applyUiLanguage(lang) {
    const next = normalizeUiLang(lang != null ? lang : state.settings.ui_language);
    state.settings.ui_language = next;
    if (I18N && typeof I18N.applyLanguage === 'function') {
      I18N.applyLanguage(next);
    } else {
      document.documentElement.lang = next;
    }
    refreshI18nDynamic();
    if (window.PamantauUpdate && typeof window.PamantauUpdate.refreshLanguage === 'function') {
      window.PamantauUpdate.refreshLanguage();
    }
    return next;
  }
  function typeLabel(type) {
    const key = `type.${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    const m = TYPES.find((item) => item.type === type);
    return m ? m.label : String(type || '');
  }
  function typeDesc(type) {
    const key = `type.${type}.desc`;
    const translated = t(key);
    if (translated !== key) return translated;
    const m = TYPES.find((item) => item.type === type);
    return m ? m.desc : '';
  }
  function refreshI18nDynamic() {
    try { updatePollMeterUi(); } catch (_) {}
    try { syncDocLabel(); } catch (_) {}
    try { syncLockUi(); } catch (_) {}
    try { syncArrangeShortcutHints(); } catch (_) {}
    try { renderPalette(); } catch (_) {}
    try { populateDeviceTypeSelect(); } catch (_) {}
    try { populateDeviceTypeCtxMenu(); } catch (_) {}
    try { populateLinkTypeSelect(); } catch (_) {}
    try { populateLinkTypeCtxMenu(); } catch (_) {}
    try { syncPasteMenuState(); } catch (_) {}
    try { if (typeof syncInspector === 'function') syncInspector(); } catch (_) {}
    try {
      if (el.modalReports && !el.modalReports.classList.contains('hidden') && typeof renderReport === 'function') {
        renderReport();
      }
    } catch (_) {}
    try {
      if (typeof isScanResultsModalOpen === 'function' && isScanResultsModalOpen() && typeof renderScanResultsTable === 'function') {
        renderScanResultsTable();
      }
    } catch (_) {}
    try {
      if (typeof applyServerUptime === 'function' && lastServerUptimeSeconds != null) {
        applyServerUptime({ ok: true, uptime_seconds: lastServerUptimeSeconds });
      }
    } catch (_) {}
  }

  /** Platform chord helpers for Rapikan/align shortcuts (Ctrl / ⌘). */
  function isApplePlatform() {
    const plat = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /Mac|iPhone|iPad|iPod/i.test(plat) || /Mac OS X/i.test(ua);
  }

  const ARRANGE_SHORTCUTS = {
    'align-left': { labelKey: 'ctx.align_left', win: 'Ctrl+←', mac: '⌘←' },
    'align-right': { labelKey: 'ctx.align_right', win: 'Ctrl+→', mac: '⌘→' },
    'align-top': { labelKey: 'ctx.align_top', win: 'Ctrl+↑', mac: '⌘↑' },
    'align-bottom': { labelKey: 'ctx.align_bottom', win: 'Ctrl+↓', mac: '⌘↓' },
    'align-hcenter': { labelKey: 'ctx.align_h', win: 'Ctrl+Shift+E', mac: '⌘⇧E' },
    'align-vcenter': { labelKey: 'ctx.align_v', win: 'Ctrl+Shift+M', mac: '⌘⇧M' },
    'dist-h': { labelKey: 'ctx.dist_h', win: 'Ctrl+Shift+H', mac: '⌘⇧H' },
    'dist-v': { labelKey: 'ctx.dist_v', win: 'Ctrl+Shift+V', mac: '⌘⇧V' },
    'pack-h': { labelKey: 'ctx.pack_h', win: 'Ctrl+Shift+R', mac: '⌘⇧R' },
    'pack-v': { labelKey: 'ctx.pack_v', win: 'Ctrl+Shift+G', mac: '⌘⇧G' },
  };

  function arrangeShortcutChord(act) {
    const spec = ARRANGE_SHORTCUTS[act];
    if (!spec) return '';
    return isApplePlatform() ? spec.mac : spec.win;
  }

  function arrangeShortcutTitle(act) {
    const spec = ARRANGE_SHORTCUTS[act];
    if (!spec) return '';
    return `${t(spec.labelKey)} (${arrangeShortcutChord(act)})`;
  }

  function syncArrangeShortcutHints() {
    Object.keys(ARRANGE_SHORTCUTS).forEach((act) => {
      const title = arrangeShortcutTitle(act);
      document.querySelectorAll(`[data-shortcut-title="${act}"]`).forEach((node) => {
        node.title = title;
      });
    });
  }

  const iconCache = {};
  const linkIconCache = {};
  const LINK_ICON_VER = 2; // bump when link SVG glyphs change (cache bust)
  let iconsReady = false;

  const DEFAULT_PORT_NOTES = {
    '22': 'SSH',
    '23': 'Telnet',
    '53': 'DNS',
    '80': 'HTTP',
    '443': 'HTTPS',
    '1996': 'SSH-JNET',
    '2219': 'Winbox-JNET',
    '2296': 'API-JNET',
    '3306': 'MySQL',
    '3389': 'RDP',
    '8080': 'HTTP alternatif',
    '8091': 'CUSJ',
    '8291': 'Winbox',
    '8443': 'HTTPS alternatif',
    '8728': 'API RouterOS',
  };

  const DEFAULT_SETTINGS = {
    poll_interval_ms: 30000,
    polling_enabled: true,
    ping_timeout_ms: 500,
    poll_method: 'parallel',
    ping_count: 5,
    port_scan_enabled: true,
    port_scan_interval_ms: 300000,
    port_scan_timeout_ms: 350,
    port_scan_device_concurrency: 24,
    common_ports: [22, 23, 53, 80, 443, 1996, 2219, 2296, 3306, 3389, 8080, 8091, 8291, 8443, 8728],
    common_port_notes: { ...DEFAULT_PORT_NOTES },
    scan_port_method: 'parallel',
    scan_port_max: 10000,
    scan_subnet_method: 'parallel',
    subnet_batch_size: 32,
    subnet_timeout_ms: 500,
    subnet_max_hosts: 254,
    history_max: 47,
    zoom_min: 0.2,
    zoom_max: 5,
    animate_links: true,
    link_animation_style: 'beads',
    link_anim_speed: 1,
    show_link_icon: true,
    show_link_label: true,
    show_link_comment: true,
    show_label: true,
    show_ip: true,
    show_latency: true,
    show_comment: true,
    show_services: true,
    grid_size: 12,
    show_grid: true,
    snap_drag: true,
    layout_locked: false,
    theme: 'light',
    ui_language: 'id',
    status_online_color: '#39ff14',
    status_offline_color: '#ff3b5c',
    status_unknown_color: '#8090a8',
    background_enabled: false,
    telegram_enabled: false,
    telegram_bot_token: '',
    telegram_bot_token_set: false,
    telegram_chat_id: '',
    telegram_notify_up: true,
    telegram_notify_down: true,
    telegram_tpl_up: '{label} ({ip}) ONLINE — {latency} ms @ {time}',
    telegram_tpl_down: '{label} ({ip}) OFFLINE @ {time}',
    telegram_screenshot_enabled: false,
    telegram_screenshot_format: 'png',
    telegram_screenshot_schedule_mode: 'interval',
    telegram_screenshot_every_min: 30,
    telegram_screenshot_hourly_minute: 0,
    telegram_screenshot_daily_time: '08:00',
    telegram_screenshot_last_at: '',
  };

  const THEME_KEYS = ['light', 'dark', 'sand'];

  const state = {
    devices: [],
    connections: [],
    settings: { ...DEFAULT_SETTINGS },
    auth: {
      username: (window.PAMANTAU_AUTH && window.PAMANTAU_AUTH.username) || '',
      logged_in: !!(window.PAMANTAU_AUTH && window.PAMANTAU_AUTH.logged_in),
    },
    stats: {},
    selectedId: null,
    selectedIds: new Set(),
    hoverId: null,
    selectedConnId: null,
    selectedConnectionIds: new Set(),
    hoverConnId: null,
    rewiring: null,
    connectFrom: null,
    linking: false,
    dragging: null,
    dragOffset: { x: 0, y: 0 },
    dragOrigins: null,
    marquee: null,
    pan: { x: 0, y: 0 },
    scale: 1,
    spacePan: false,
    panning: false,
    panStart: null,
    ctxTarget: null,
    ctxLinkId: null,
    ctxPasteAt: null,
    deviceClipboard: null,
    longPressTimer: null,
    longPressOrigin: null,
    scanSubnetTargetId: null,
    pingTargetId: null,
    pingRunToken: 0,
    tracerouteTargetId: null,
    tracerouteRunToken: 0,
    scanPortsTargetId: null,
    scanPortsTargetIp: '',
    scanPortsRunToken: 0,
    scanPortsDidScan: false,
    /** True while a manual Scan Port request is in flight — blocks interval poll. */
    scanPortsBusy: false,
    scanPortsBusyGen: 0,
    scanResults: [],
    scanResultsPending: null,
    /** Bumps to abort live latency + port scans for Hasil Scan Subnet. */
    scanResultsLiveToken: 0,
    scanResultsLiveController: null,
    pollTimer: null,
    pollCountdownTimer: null,
    pollCycleStart: 0,
    pollIntervalMs: 5000,
    pollLastSec: 0,
    pollToken: 0,
    pollBusy: false,
    pollBusyGen: 0,
    portPollTimer: null,
    portPollBusy: false,
    busyController: null,
    reportTab: 'status',
    reportSort: {},
    reports: null,
    reportFrom: null,
    reportTo: null,
    reportDeviceId: null,
    reportApplied: false,
    doc: { name: null, handle: null, title: '' },
    docDirty: false,
  };

  const el = {
    stage: document.getElementById('stage'),
    paletteList: document.getElementById('paletteList'),
    propsForm: document.getElementById('propsForm'),
    linkPropsForm: document.getElementById('linkPropsForm'),
    emptyProps: document.getElementById('emptyProps'),
    propLabel: document.getElementById('propLabel'),
    propType: document.getElementById('propType'),
    propIp: document.getElementById('propIp'),
    propComment: document.getElementById('propComment'),
    linkLabel: document.getElementById('linkLabel'),
    linkComment: document.getElementById('linkComment'),
    linkType: document.getElementById('linkType'),
    linkTypeSwatch: document.getElementById('linkTypeSwatch'),
    linkFrom: document.getElementById('linkFrom'),
    linkTo: document.getElementById('linkTo'),
    liveStatus: document.getElementById('liveStatus'),
    liveLatency: document.getElementById('liveLatency'),
    liveServices: document.getElementById('liveServices'),
    livePollCount: document.getElementById('livePollCount'),
    ctxMenu: document.getElementById('ctxMenu'),
    editCtxMenu: document.getElementById('editCtxMenu'),
    ctxDeviceItems: document.getElementById('ctxDeviceItems'),
    ctxEmptyItems: document.getElementById('ctxEmptyItems'),
    ctxUndoBtn: document.getElementById('ctxUndoBtn'),
    ctxRedoBtn: document.getElementById('ctxRedoBtn'),
    ctxPasteBtn: document.getElementById('ctxPasteBtn'),
    ctxLinkItems: document.getElementById('ctxLinkItems'),
    ctxLinkSelectionInfo: document.getElementById('ctxLinkSelectionInfo'),
    ctxLinkTypeWrap: document.getElementById('ctxLinkTypeWrap'),
    ctxLinkTypeTrigger: document.getElementById('ctxLinkTypeTrigger'),
    ctxLinkTypeMenu: document.getElementById('ctxLinkTypeMenu'),
    ctxLinkEditBtn: document.getElementById('ctxLinkEditBtn'),
    ctxScanSubnet: document.getElementById('ctxScanSubnet'),
    ctxSelectionInfo: document.getElementById('ctxSelectionInfo'),
    ctxSingleOnly: document.getElementById('ctxSingleOnly'),
    ctxSingleOnlyProps: document.getElementById('ctxSingleOnlyProps'),
    ctxMultiActions: document.getElementById('ctxMultiActions'),
    modalReports: document.getElementById('modalReports'),
    reportsMenu: document.getElementById('reportsMenu'),
    btnNotif: document.getElementById('btnNotif'),
    notifMenu: document.getElementById('notifMenu'),
    telegramMenuWrap: document.getElementById('telegramMenuWrap'),
    btnTelegramSub: document.getElementById('btnTelegramSub'),
    telegramMenu: document.getElementById('telegramMenu'),
    modalTgUpDown: document.getElementById('modalTgUpDown'),
    modalTgScreenshot: document.getElementById('modalTgScreenshot'),
    modalTgSettings: document.getElementById('modalTgSettings'),
    setBackgroundEnabled: document.getElementById('setBackgroundEnabled'),
    bgSchedHint: document.getElementById('bgSchedHint'),
    bgCronHint: document.getElementById('bgCronHint'),
    btnCopyBgCron: document.getElementById('btnCopyBgCron'),
    tgNotifyUp: document.getElementById('tgNotifyUp'),
    tgNotifyDown: document.getElementById('tgNotifyDown'),
    tgTplUpPreview: document.getElementById('tgTplUpPreview'),
    tgTplDownPreview: document.getElementById('tgTplDownPreview'),
    tgShotEnabled: document.getElementById('tgShotEnabled'),
    tgShotFormat: document.getElementById('tgShotFormat'),
    tgShotMode: document.getElementById('tgShotMode'),
    tgShotEvery: document.getElementById('tgShotEvery'),
    tgShotHourlyMinute: document.getElementById('tgShotHourlyMinute'),
    tgShotDailyTime: document.getElementById('tgShotDailyTime'),
    tgShotFieldsInterval: document.getElementById('tgShotFieldsInterval'),
    tgShotFieldsHourly: document.getElementById('tgShotFieldsHourly'),
    tgShotFieldsDaily: document.getElementById('tgShotFieldsDaily'),
    tgShotLastHint: document.getElementById('tgShotLastHint'),
    tgEnabled: document.getElementById('tgEnabled'),
    tgBotToken: document.getElementById('tgBotToken'),
    tgChatId: document.getElementById('tgChatId'),
    reportTitle: document.getElementById('reportTitle'),
    reportTable: document.getElementById('reportTable'),
    reportPeriodGate: document.getElementById('reportPeriodGate'),
    reportTableWrap: document.getElementById('reportTableWrap'),
    reportDateFrom: document.getElementById('reportDateFrom'),
    reportDateTo: document.getElementById('reportDateTo'),
    reportPeriodDesc: document.getElementById('reportPeriodDesc'),
    reportDateFields: document.getElementById('reportDateFields'),
    reportDeviceField: document.getElementById('reportDeviceField'),
    reportDeviceSelect: document.getElementById('reportDeviceSelect'),
    reportPeriodError: document.getElementById('reportPeriodError'),
    reportPeriodLabel: document.getElementById('reportPeriodLabel'),
    reportEmptyNotice: document.getElementById('reportEmptyNotice'),
    btnApplyReportPeriod: document.getElementById('btnApplyReportPeriod'),
    btnCancelReportPeriod: document.getElementById('btnCancelReportPeriod'),
    btnChangeReportPeriod: document.getElementById('btnChangeReportPeriod'),
    btnPrintReport: document.getElementById('btnPrintReport'),
    btnExcelReport: document.getElementById('btnExcelReport'),
    modalSettings: document.getElementById('modalSettings'),
    modalProps: document.getElementById('modalProps'),
    propsModalTitle: document.getElementById('propsModalTitle'),
    btnPropsSave: document.getElementById('btnPropsSave'),
    btnPropsDelete: document.getElementById('btnPropsDelete'),
    modalScanSubnet: document.getElementById('modalScanSubnet'),
    scanSubnetForm: document.getElementById('scanSubnetForm'),
    scanSubnetTargetInfo: document.getElementById('scanSubnetTargetInfo'),
    scanCidrNetwork: document.getElementById('scanCidrNetwork'),
    scanCidrPrefix: document.getElementById('scanCidrPrefix'),
    scanCidrPreview: document.getElementById('scanCidrPreview'),
    btnCloseScanSubnet: document.getElementById('btnCloseScanSubnet'),
    modalPing: document.getElementById('modalPing'),
    pingTerminal: document.getElementById('pingTerminal'),
    pingTerminalDot: document.getElementById('pingTerminalDot'),
    pingTerminalTitle: document.getElementById('pingTerminalTitle'),
    pingTerminalStatus: document.getElementById('pingTerminalStatus'),
    pingTerminalOutput: document.getElementById('pingTerminalOutput'),
    btnClosePing: document.getElementById('btnClosePing'),
    btnCapturePing: document.getElementById('btnCapturePing'),
    btnRestartPing: document.getElementById('btnRestartPing'),
    modalTraceroute: document.getElementById('modalTraceroute'),
    tracerouteTerminal: document.getElementById('tracerouteTerminal'),
    tracerouteTerminalDot: document.getElementById('tracerouteTerminalDot'),
    tracerouteTerminalTitle: document.getElementById('tracerouteTerminalTitle'),
    tracerouteTerminalStatus: document.getElementById('tracerouteTerminalStatus'),
    tracerouteTerminalOutput: document.getElementById('tracerouteTerminalOutput'),
    btnCloseTraceroute: document.getElementById('btnCloseTraceroute'),
    btnCaptureTraceroute: document.getElementById('btnCaptureTraceroute'),
    btnRestartTraceroute: document.getElementById('btnRestartTraceroute'),
    modalScanPorts: document.getElementById('modalScanPorts'),
    scanPortsTargetInfo: document.getElementById('scanPortsTargetInfo'),
    scanPortsRange: document.getElementById('scanPortsRange'),
    scanPortsLoading: document.getElementById('scanPortsLoading'),
    scanPortsElapsed: document.getElementById('scanPortsElapsed'),
    scanPortsResultsList: document.getElementById('scanPortsResultsList'),
    scanPortsEmpty: document.getElementById('scanPortsEmpty'),
    scanPortsSummary: document.getElementById('scanPortsSummary'),
    btnCloseScanPorts: document.getElementById('btnCloseScanPorts'),
    btnScanPorts: document.getElementById('btnScanPorts'),
    btnRescanPorts: document.getElementById('btnRescanPorts'),
    modalScanResults: document.getElementById('modalScanResults'),
    scanResultsSummary: document.getElementById('scanResultsSummary'),
    scanResultsRows: document.getElementById('scanResultsRows'),
    scanResultsSelectAll: document.getElementById('scanResultsSelectAll'),
    btnCloseScanResults: document.getElementById('btnCloseScanResults'),
    btnRescanSubnet: document.getElementById('btnRescanSubnet'),
    btnConfirmScanResults: document.getElementById('btnConfirmScanResults'),
    settingsForm: document.getElementById('settingsForm'),
    btnResetCounters: document.getElementById('btnResetCounters'),
    btnClearDatabase: document.getElementById('btnClearDatabase'),
    setPollSec: document.getElementById('setPollSec'),
    setPingTimeout: document.getElementById('setPingTimeout'),
    setPollMethod: document.getElementById('setPollMethod'),
    setPingCount: document.getElementById('setPingCount'),
    pollingScheduleExtras: document.getElementById('pollingScheduleExtras'),
    setPortScan: document.getElementById('setPortScan'),
    portScanScheduleExtras: document.getElementById('portScanScheduleExtras'),
    setPortScanIntervalMin: document.getElementById('setPortScanIntervalMin'),
    setPortScanTimeout: document.getElementById('setPortScanTimeout'),
    setPortScanConcurrency: document.getElementById('setPortScanConcurrency'),
    portScanExtras: document.getElementById('portScanExtras'),
    commonPortsBody: document.getElementById('commonPortsBody'),
    btnAddCommonPort: document.getElementById('btnAddCommonPort'),
    setScanPortMethod: document.getElementById('setScanPortMethod'),
    setScanPortMax: document.getElementById('setScanPortMax'),
    setScanSubnetMethod: document.getElementById('setScanSubnetMethod'),
    subnetBatchExtras: document.getElementById('subnetBatchExtras'),
    setSubnetBatchSize: document.getElementById('setSubnetBatchSize'),
    setSubnetTimeout: document.getElementById('setSubnetTimeout'),
    setHistoryMax: document.getElementById('setHistoryMax'),
    setZoomMin: document.getElementById('setZoomMin'),
    setZoomMax: document.getElementById('setZoomMax'),
    setAnimateLinks: document.getElementById('setAnimateLinks'),
    setLinkAnimStyle: document.getElementById('setLinkAnimStyle'),
    setLinkAnimSpeed: document.getElementById('setLinkAnimSpeed'),
    setLinkAnimSpeedVal: document.getElementById('setLinkAnimSpeedVal'),
    setShowLinkIcon: document.getElementById('setShowLinkIcon'),
    setShowLinkLabel: document.getElementById('setShowLinkLabel'),
    setShowLinkComment: document.getElementById('setShowLinkComment'),
    setShowLabel: document.getElementById('setShowLabel'),
    setShowIp: document.getElementById('setShowIp'),
    setShowLatency: document.getElementById('setShowLatency'),
    setShowComment: document.getElementById('setShowComment'),
    setShowServices: document.getElementById('setShowServices'),
    gridSizeExtras: document.getElementById('gridSizeExtras'),
    snapDragRow: document.getElementById('snapDragRow'),
    setGridSize: document.getElementById('setGridSize'),
    setShowGrid: document.getElementById('setShowGrid'),
    setSnapDrag: document.getElementById('setSnapDrag'),
    setTheme: document.getElementById('setTheme'),
    setUiLanguage: document.getElementById('setUiLanguage'),
    setStatusOnlineColor: document.getElementById('setStatusOnlineColor'),
    setStatusOnlineColorText: document.getElementById('setStatusOnlineColorText'),
    setStatusOfflineColor: document.getElementById('setStatusOfflineColor'),
    setStatusOfflineColorText: document.getElementById('setStatusOfflineColorText'),
    setStatusUnknownColor: document.getElementById('setStatusUnknownColor'),
    setStatusUnknownColorText: document.getElementById('setStatusUnknownColorText'),
    topUserChip: document.getElementById('topUserChip'),
    btnLogout: document.getElementById('btnLogout'),
    accountCurrentUsername: document.getElementById('accountCurrentUsername'),
    accountAvatar: document.getElementById('accountAvatar'),
    accountChangePill: document.getElementById('accountChangePill'),
    accountOldPassword: document.getElementById('accountOldPassword'),
    accountNewUsername: document.getElementById('accountNewUsername'),
    accountNewPassword: document.getElementById('accountNewPassword'),
    accountConfirmPassword: document.getElementById('accountConfirmPassword'),
    accountConfirmField: document.getElementById('accountConfirmField'),
    accountPasswordGrid: document.getElementById('accountPasswordGrid'),
    accountOldHint: document.getElementById('accountOldHint'),
    accountNewHint: document.getElementById('accountNewHint'),
    accountConfirmHint: document.getElementById('accountConfirmHint'),
    accountStrength: document.getElementById('accountStrength'),
    accountStrengthLabel: document.getElementById('accountStrengthLabel'),
    accountCheckOld: document.getElementById('accountCheckOld'),
    accountCheckLength: document.getElementById('accountCheckLength'),
    accountCheckMatch: document.getElementById('accountCheckMatch'),
    accountCheckReady: document.getElementById('accountCheckReady'),
    accountChecklist: document.getElementById('accountChecklist'),
    accountStatus: document.getElementById('accountStatus'),
    btnSaveAccount: document.getElementById('btnSaveAccount'),
    btnResetAccount: document.getElementById('btnResetAccount'),
    accountSection: document.getElementById('accountSection'),
    btnReports: document.getElementById('btnReports'),
    ctxOpenWrap: document.getElementById('ctxOpenWrap'),
    ctxOpenTrigger: document.getElementById('ctxOpenTrigger'),
    ctxOpenMenu: document.getElementById('ctxOpenMenu'),
    ctxTypeWrap: document.getElementById('ctxTypeWrap'),
    ctxTypeTrigger: document.getElementById('ctxTypeTrigger'),
    ctxTypeMenu: document.getElementById('ctxTypeMenu'),
    ctxArrangeWrap: document.getElementById('ctxArrangeWrap'),
    ctxArrangeTrigger: document.getElementById('ctxArrangeTrigger'),
    ctxArrangeMenu: document.getElementById('ctxArrangeMenu'),
    stageWrap: document.querySelector('.stage-wrap'),
    stageDockHost: document.getElementById('stageDockHost'),
    stageDock: document.getElementById('stageDock') || document.querySelector('.stage-dock'),
    stageDockToggle: document.getElementById('stageDockToggle'),
    deviceHoverTip: document.getElementById('deviceHoverTip'),
    modalConfirm: document.getElementById('modalConfirm'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmOkLabel: document.getElementById('confirmOkLabel'),
    btnCloseConfirm: document.getElementById('btnCloseConfirm'),
    btnConfirmCancel: document.getElementById('btnConfirmCancel'),
    btnConfirmOk: document.getElementById('btnConfirmOk'),
    zoomSlider: document.getElementById('zoomSlider'),
    zoomFill: document.getElementById('zoomFill'),
    zoomThumb: document.getElementById('zoomThumb'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),
    btnZoomFit: document.getElementById('btnZoomFit'),
    btnLockLayout: document.getElementById('btnLockLayout'),
    reportRows: document.getElementById('reportRows'),
    reportHeadRow: document.getElementById('reportHeadRow'),
    toast: document.getElementById('toast'),
    busy: document.getElementById('busy'),
    busyText: document.getElementById('busyText'),
    busyProgressWrap: document.getElementById('busyProgressWrap'),
    busyBar: document.getElementById('busyBar'),
    busyBarTrack: document.getElementById('busyBarTrack'),
    busyPercent: document.getElementById('busyPercent'),
    busyCount: document.getElementById('busyCount'),
    busyDetail: document.getElementById('busyDetail'),
    busyFound: document.getElementById('busyFound'),
    btnCancelBusy: document.getElementById('btnCancelBusy'),
    pollMeter: document.getElementById('pollMeter'),
    pollDot: document.getElementById('pollDot'),
    pollLabel: document.getElementById('pollLabel'),
    serverUptime: document.getElementById('serverUptime'),
    serverUptimeValue: document.getElementById('serverUptimeValue'),
    pollRing: document.getElementById('pollRing'),
    setPollingEnabled: document.getElementById('setPollingEnabled'),
    btnFile: document.getElementById('btnFile'),
    fileMenu: document.getElementById('fileMenu'),
    importFile: document.getElementById('importFile'),
    btnQuick: document.getElementById('btnQuick'),
    quickMenu: document.getElementById('quickMenu'),
    importExcelFile: document.getElementById('importExcelFile'),
    docLabel: document.getElementById('docLabel'),
    paletteDoc: document.getElementById('paletteDoc'),
    paletteDocName: document.getElementById('paletteDocName'),
    paletteDocStatus: document.getElementById('paletteDocStatus'),
    app: document.getElementById('app'),
    palette: document.getElementById('palette'),
    btnTogglePalette: document.getElementById('btnTogglePalette'),
    btnPinPalette: document.getElementById('btnPinPalette'),
  };

  const PALETTE_PINNED_KEY = 'pamantau.palettePinned';
  const PALETTE_VISIBLE_LEGACY_KEY = 'pamantau.paletteVisible';

  const history = {
    stack: [],
    index: -1,
    max: 40,
    locked: false,
  };

  let ctx = el.stage.getContext('2d');
  let stageCssW = 1;
  let stageCssH = 1;
  // Theme → device skin. Changing theme swaps canvas device visuals.
  // Dark uses the same card chrome as Light (status tile + capsule + pills).
  const DEVICE_SKINS = {
    sand: 'orbital',
    light: 'card',
    dark: 'card',
  };
  const NODE_W_MAX = 320;
  const PLUS_R = 9;

  function currentTheme() {
    const raw = (state.settings && state.settings.theme)
      || document.documentElement.getAttribute('data-theme')
      || DEFAULT_SETTINGS.theme;
    return resolveTheme(raw);
  }

  function activeDeviceSkin() {
    return DEVICE_SKINS[currentTheme()] || 'card';
  }

  function showSetting(key) {
    return state.settings[key] !== false;
  }

  /** Visible text lines in the device body (order = draw order). Shared by all skins. */
  function deviceBodyLines(d) {
    const compact = isCompactType(d && d.type);
    const lines = [];
    if (showSetting('show_label')) lines.push({ kind: 'label' });
    if (showSetting('show_ip')) {
      const ip = String((d && d.ip) || '').trim();
      // Compact: skip empty IP; full skins keep "—" placeholder.
      if (!compact || ip) lines.push({ kind: 'ip' });
    }
    if (showSetting('show_latency')) lines.push({ kind: 'latency' });
    if (!compact && showSetting('show_comment')) {
      const c = String((d && d.comment) || '').trim();
      if (c) lines.push({ kind: 'comment', text: c });
    }
    if (!compact && showSetting('show_services')) lines.push({ kind: 'services' });
    return lines;
  }

  function deviceTextBlockH(lines, labelStep, lineStep, compact) {
    if (!lines.length) return compact ? 18 : 22;
    let textH = 0;
    for (let i = 0; i < lines.length; i += 1) {
      textH += lines[i].kind === 'label' ? labelStep : lineStep;
    }
    return textH;
  }

  // --- Orbital Badge (Sand) — circular icon core + frosted info flag ----------
  function orbitalPalette() {
    return {
      flag0: 'rgba(255, 246, 230, 0.94)',
      flag1: 'rgba(240, 226, 204, 0.97)',
      flagStroke: 'rgba(90, 70, 40, 0.14)',
      flagSheen: 'rgba(255,255,255,0.35)',
      orb0: 'rgba(255, 240, 220, 0.98)',
      orb1: 'rgba(232, 214, 188, 1)',
      orbStroke: 'rgba(90, 70, 40, 0.16)',
      collar: 'rgba(236, 220, 196, 0.95)',
      ink: '#2a2218',
      muted: '#7a6a54',
      faint: '#9a8870',
      shadow: 'rgba(60, 40, 16, 0.22)',
    };
  }

  function orbitalMetrics(d) {
    const compact = isCompactType(d && d.type);
    const meta = typeMeta(d && d.type);
    const iconSize = compact ? 20 : 26;
    const orbPad = compact ? 7 : 9;
    const orbR = iconSize / 2 + orbPad;
    const ringGap = compact ? 2.5 : 3;
    const ringW = compact ? 2.75 : 3.25;
    const orbOuterR = orbR + ringGap + ringW;
    const orbOuter = orbOuterR * 2;
    const collarOverlap = compact ? 11 : 13;
    const flagPadX = compact ? 10 : 12;
    const flagPadY = compact ? 7 : 9;
    const flagRadius = compact ? 9 : 11;
    const badgeLay = typeShortBadgeLayout(meta.short, compact);
    const lines = deviceBodyLines(d);
    const lineStep = compact ? 12 : 13;
    const labelStep = compact ? 13 : 15;
    const flagInnerH = deviceTextBlockH(lines, labelStep, lineStep, compact);
    const flagH = flagInnerH + flagPadY * 2;
    const badgeHang = badgeLay.h * 0.42;
    const h = Math.max(orbOuter + badgeHang, flagH);
    // Link/plus anchors follow the FLAG PLATE (like card→tile), not the AABB and
    // not the orb∪flag union. When the orb is taller than the flag, a union AABB
    // top-edge midpoint sits in empty space above the plate (center X is over the
    // flag, while the higher top belongs only to the left-side orb).
    const flagDrawH = Math.min(flagH, h);
    const flagTop = (h - flagDrawH) / 2;
    const flagLeft = orbOuter - collarOverlap;
    const textClear = orbOuter + (compact ? 3 : 4);
    const textInset = orbOuter - collarOverlap + flagPadX;
    const textLeft = Math.max(textClear, textInset);
    return {
      skin: 'orbital',
      compact,
      meta,
      iconSize,
      orbR,
      ringGap,
      ringW,
      orbOuterR,
      orbOuter,
      collarOverlap,
      flagPadX,
      flagPadY,
      flagRadius,
      badgeLay,
      lines,
      lineStep,
      labelStep,
      flagInnerH,
      flagH,
      h,
      // Flag plate origin (left-aligned after orb collar); width = deviceW - anchorX.
      anchorX: flagLeft,
      anchorY: flagTop,
      anchorH: Math.max(1, flagDrawH),
      textLeft,
      rightPad: flagPadX,
      wMin: compact ? 128 : 152,
    };
  }

  // --- Chassis module (Dark) — rail + icon well + mono stack -----------------
  // --- Neon Signet (Dark) — HUD plate, square glyph, type rim, status edge ----
  function signetPalette() {
    return {
      body0: '#06090e',
      body1: '#0c121a',
      plate0: '#101820',
      plate1: '#0a1016',
      plateStroke: 'rgba(255,255,255,0.06)',
      sheen: 'rgba(255,255,255,0.045)',
      ink: '#e6eef8',
      muted: '#8494ab',
      faint: '#5e6e84',
      shadow: 'rgba(0,0,0,0.55)',
    };
  }

  function signetMetrics(d) {
    const compact = isCompactType(d && d.type);
    const meta = typeMeta(d && d.type);
    const iconSize = compact ? 22 : 30;
    const padX = compact ? 8 : 10;
    const padY = compact ? 8 : 9;
    const platePad = compact ? 5 : 6;
    const gapIconText = compact ? 8 : 10;
    const badgeLay = typeShortBadgeLayout(meta.short, compact);
    const badgeGap = compact ? 3 : 4;
    const plateOuter = iconSize + platePad * 2;
    const iconColW = plateOuter;
    const iconColH = plateOuter + badgeGap + badgeLay.h;
    const lines = deviceBodyLines(d);
    const lineStep = compact ? 12 : 13;
    const labelStep = compact ? 13 : 14;
    const textH = deviceTextBlockH(lines, labelStep, lineStep, compact);
    const contentH = Math.max(iconColH, textH);
    const h = contentH + padY * 2;
    const ledPad = compact ? 14 : 18;
    const textLeft = padX + iconColW + gapIconText;
    return {
      skin: 'signet',
      compact,
      meta,
      iconSize,
      padX,
      padY,
      platePad,
      plateOuter,
      gapIconText,
      badgeLay,
      badgeGap,
      iconColW,
      iconColH,
      lines,
      lineStep,
      labelStep,
      contentH,
      h,
      // Sharper than card/orbital — HUD plate feel, not soft chrome.
      radius: compact ? 3.5 : 4,
      textLeft,
      rightPad: ledPad + padX,
      wMin: compact ? 114 : 138,
      bracketLen: compact ? 7 : 9,
    };
  }

  // --- Classic light card (Light) — status tile + inverted meta pills --------
  function cardPalette() {
    const dark = currentTheme() === 'dark';
    return {
      body0: dark ? '#0c121a' : '#ffffff',
      body1: dark ? '#101820' : '#f7fafc',
      stroke: dark ? 'rgba(255,255,255,.14)' : 'rgba(15,28,55,.10)',
      ink: '#ffffff',
      muted: '#ffffff',
      faint: '#ffffff',
      comment: '#ffffff',
      pillBg: '#0a0a0a',
      pillStroke: dark ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.12)',
      tileStroke: dark ? 'rgba(255,255,255,.22)' : '#0a0a0a',
      latStroke: dark ? 'rgba(0,0,0,.85)' : '#0a0a0a',
      shadow: dark ? 'rgba(0,0,0,.45)' : 'rgba(10,22,40,.12)',
    };
  }

  /**
   * Card skin (Light + Dark): status-filled icon tile + Komponen capsule inside;
   * label / IP / comment (and services) as white-on-black pills below;
   * latency stays status-colored. All gated by Tampilan Komponen settings.
   */
  function cardMetrics(d) {
    const compact = isCompactType(d && d.type);
    const meta = typeMeta(d && d.type);
    const tile = compact ? 56 : 72;
    const iconSize = compact ? 38 : 48;
    const badgeLay = typeShortBadgeLayout(meta.short, compact);
    const capsuleGap = compact ? 5 : 6;
    const labelGap = compact ? 8 : 10;
    const lines = deviceBodyLines(d);
    const lineStep = compact ? 15 : 16;
    const metaPillGap = compact ? 3 : 4;
    const labelStep = compact ? 24 : 26;
    const labelPadX = compact ? 9 : 11;
    const labelPadY = compact ? 7 : 8;
    const hasLabel = lines.some((l) => l.kind === 'label');
    const labelBoxH = hasLabel ? labelStep + labelPadY : 0;
    const otherLines = lines.filter((l) => l.kind !== 'label');
    const otherH = otherLines.length
      ? otherLines.length * lineStep + Math.max(0, otherLines.length - 1) * metaPillGap
      : 0;
    const metaGap = hasLabel && otherLines.length ? (compact ? 4 : 5) : 0;
    const textH = (hasLabel ? labelBoxH : 0) + metaGap + otherH;
    const stackH = tile;
    const h = stackH + (textH ? labelGap + textH : 0);
    return {
      skin: 'card',
      compact,
      meta,
      tile,
      iconSize,
      badgeLay,
      capsuleGap,
      labelGap,
      labelPadX,
      labelPadY,
      labelBoxH,
      metaGap,
      metaPillGap,
      lines,
      otherLines,
      lineStep,
      labelStep,
      stackH,
      textH,
      h,
      anchorW: tile,
      anchorH: stackH,
      radius: compact ? 14 : 16,
      textLeft: labelPadX,
      rightPad: labelPadX,
      wMin: tile,
    };
  }

  function deviceMetrics(d) {
    const skin = activeDeviceSkin();
    if (skin === 'orbital') return orbitalMetrics(d);
    if (skin === 'signet') return signetMetrics(d);
    return cardMetrics(d);
  }

  /** Tinggi device box — mengikuti skin aktif. */
  function deviceH(d) {
    return deviceMetrics(d).h;
  }

  function statusLatencyLabel(d) {
    const status = d.status || 'unknown';
    if (status === 'offline') return 'Offline';
    if (status === 'online') {
      const ms = formatLatencyMs(d.latency, { space: false });
      return ms ? `Online - ${ms}` : 'Online - —';
    }
    return '—';
  }

  /** Whole-ms latency for UI — never decimals or locale commas. */
  function formatLatencyMs(value, { space = true, unit = true } = {}) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const ms = Math.round(n);
    if (!unit) return `${ms}ms`;
    return space ? `${ms} ms` : `${ms}ms`;
  }

  // Cache badge widths — measureText is expensive and deviceW() runs many
  // times per frame (draw + hit-test + connection anchors) on 100+ nodes.
  const deviceWCache = new WeakMap();

  function deviceWCacheKey(d) {
    const flags = [
      showSetting('show_label') ? 1 : 0,
      showSetting('show_ip') ? 1 : 0,
      showSetting('show_latency') ? 1 : 0,
      showSetting('show_comment') ? 1 : 0,
      showSetting('show_services') ? 1 : 0,
    ].join('');
    const services = !isCompactType(d.type) && showSetting('show_services')
      && Array.isArray(d.services) && d.services.length
      ? d.services.slice(0, 3).join(',')
      : '';
    const lat = d.latency != null && Number.isFinite(Number(d.latency))
      ? String(Math.round(Number(d.latency)))
      : '';
    const comment = showSetting('show_comment') ? String(d.comment || '').trim() : '';
    // Skin affects chrome (textLeft/rightPad), so widths must recompute on theme change.
    return `${activeDeviceSkin()}\0${d.type}\0${d.label || ''}\0${d.ip || ''}\0${d.status || 'unknown'}\0${lat}\0${flags}\0${services}\0${comment}`;
  }

  /** Lebar device box — chrome mengikuti skin aktif. */
  function deviceW(d) {
    const key = deviceWCacheKey(d);
    const hit = deviceWCache.get(d);
    if (hit && hit.key === key) return hit.w;

    const m = deviceMetrics(d);
    const meta = m.meta;
    const compact = m.compact;
    const prevFont = ctx.font;
    let need = 0;
    if (m.skin === 'card') need = m.tile;
    else if (m.badgeLay) need = m.badgeLay.w;
    const labelFont = m.skin === 'orbital'
      ? (compact ? '700 11px "Oxanium", "Sora"' : '700 12.5px "Oxanium", "Sora"')
      : m.skin === 'card'
        ? '700 18px "Oxanium", "Sora"'
        : (compact ? '700 11px "Oxanium", "Sora"' : '700 12px "Oxanium", "Sora"');

    if (showSetting('show_label')) {
      const label = String(d.label || meta.label || '').trim() || meta.label;
      ctx.font = labelFont;
      need = Math.max(need, ctx.measureText(label).width);
    }

    if (showSetting('show_ip')) {
      const ip = String(d.ip || '').trim();
      if (!compact || ip) {
        ctx.font = compact ? '500 9px "JetBrains Mono"' : '500 9.5px "JetBrains Mono"';
        need = Math.max(need, ctx.measureText(ip || '—').width);
      }
    }

    if (showSetting('show_latency')) {
      const statusText = statusLatencyLabel(d);
      ctx.font = compact ? '700 9px "JetBrains Mono"' : '700 9.5px "JetBrains Mono"';
      need = Math.max(need, ctx.measureText(statusText).width);
    }

    if (!compact && showSetting('show_comment')) {
      const comment = String(d.comment || '').trim();
      if (comment) {
        ctx.font = '500 9px "JetBrains Mono"';
        need = Math.max(need, ctx.measureText(comment).width);
      }
    }

    if (!compact && showSetting('show_services')) {
      const services = Array.isArray(d.services) && d.services.length
        ? d.services.slice(0, 3).join(',')
        : '—';
      ctx.font = '500 9px "JetBrains Mono"';
      need = Math.max(need, ctx.measureText(services).width);
    }
    ctx.font = prevFont;
    const chrome = m.textLeft + m.rightPad;
    const w = Math.min(NODE_W_MAX, Math.max(m.wMin, Math.ceil(need + chrome)));
    deviceWCache.set(d, { key, w });
    return w;
  }

  // Selection accent lives on the azure end of the theme so it reads as
  // "selected" independent of the green/red status stroke — avoids the
  // muddy pink/red blend an amber ring gave when paired with offline status.
  const SELECTION_GLOW_COLOR = 'rgba(26,106,255,.6)';
  const SELECTION_RING_COLOR = 'rgba(26,106,255,.8)';
  const SELECTION_GLOW_BLUR = 18;
  // Softer secondary cue for path members (reachable via links) when a
  // device is selected — same azure family, lower alpha so primary wins.
  const NEIGHBOR_GLOW_COLOR = 'rgba(26,106,255,.28)';
  const NEIGHBOR_RING_COLOR = 'rgba(26,106,255,.45)';
  const NEIGHBOR_GLOW_BLUR = 12;
  // Dim factor for devices/links outside the selected connected component.
  const SELECTION_DIM_ALPHA = 0.38;

  function loadIcons() {
    const deviceLoads = TYPES.map((t) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        iconCache[t.type] = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = t.icon;
    }));
    const linkLoads = LINK_TYPES.map((t) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        linkIconCache[t.id] = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `${t.icon}?v=${LINK_ICON_VER}`;
    }));
    return Promise.all([...deviceLoads, ...linkLoads]).then(() => {
      iconsReady = true;
    });
  }

  function populateDeviceTypeSelect() {
    if (!el.propType) return;
    const prev = el.propType.value;
    el.propType.innerHTML = TYPES.map(
      (item) => `<option value="${item.type}">${escapeHtml(typeLabel(item.type))}</option>`,
    ).join('');
    if (prev && TYPES.some((item) => item.type === prev)) el.propType.value = prev;
  }

  function populateDeviceTypeCtxMenu() {
    if (!el.ctxTypeMenu) return;
    el.ctxTypeMenu.innerHTML = TYPES.map((item) => `
      <button type="button" data-set-type="${item.type}" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="${item.color}"/></svg>
        ${escapeHtml(typeLabel(item.type))}
      </button>
    `).join('');
  }

  function populateLinkTypeSelect() {
    if (!el.linkType) return;
    const prev = el.linkType.value;
    el.linkType.innerHTML = LINK_TYPES.map(
      (lt) => `<option value="${lt.id}">${escapeHtml(linkTypeLabel(lt.id))}</option>`,
    ).join('');
    if (prev) el.linkType.value = prev;
    updateLinkTypeSwatch(el.linkType.value);
  }

  function populateLinkTypeCtxMenu() {
    if (!el.ctxLinkTypeMenu) return;
    el.ctxLinkTypeMenu.innerHTML = LINK_TYPES.map((lt) => `
      <button type="button" data-set-link-type="${lt.id}" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="${lt.color}"/></svg>
        ${escapeHtml(linkTypeLabel(lt.id))}
      </button>
    `).join('');
  }

  function updateLinkTypeSwatch(linkType) {
    if (!el.linkTypeSwatch) return;
    el.linkTypeSwatch.style.background = getLinkTypeMeta(linkType).color;
  }

  async function api(action, payload = null, methodOrOpts = 'GET') {
    let method = 'GET';
    let signal;
    if (methodOrOpts && typeof methodOrOpts === 'object') {
      method = methodOrOpts.method || 'GET';
      signal = methodOrOpts.signal;
    } else if (typeof methodOrOpts === 'string') {
      method = methodOrOpts;
    }
    const opts = { method, headers: {}, credentials: 'include' };
    if (signal) opts.signal = signal;
    let url = `${API}?action=${encodeURIComponent(action)}`;
    if (HEADLESS_SNAPSHOT_MODE) {
      url += `&headless_token=${encodeURIComponent(HEADLESS_SNAPSHOT_TOKEN)}`;
    }
    if (payload !== null) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify({
        action,
        ...payload,
        ...(HEADLESS_SNAPSHOT_MODE ? { headless_token: HEADLESS_SNAPSHOT_TOKEN } : {}),
      });
    }
    const res = await fetch(url, opts);
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (res.status === 401) {
      if (!HEADLESS_SNAPSHOT_MODE) {
        window.location.href = 'login.php';
      }
      throw new Error(data.error || 'Unauthorized');
    }
    if (!res.ok || data.ok === false) {
      const error = new Error(data.error || 'Request gagal');
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function apiMultipart(action, formData, { signal } = {}) {
    const body = formData instanceof FormData ? formData : new FormData();
    body.set('action', action);
    if (HEADLESS_SNAPSHOT_MODE) body.set('headless_token', HEADLESS_SNAPSHOT_TOKEN);
    const headlessQuery = HEADLESS_SNAPSHOT_MODE
      ? `&headless_token=${encodeURIComponent(HEADLESS_SNAPSHOT_TOKEN)}`
      : '';
    const res = await fetch(`${API}?action=${encodeURIComponent(action)}${headlessQuery}`, {
      method: 'POST',
      body,
      credentials: 'include',
      signal,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (res.status === 401) {
      if (!HEADLESS_SNAPSHOT_MODE) {
        window.location.href = 'login.php';
      }
      throw new Error(data.error || 'Unauthorized');
    }
    if (!res.ok || data.ok === false) {
      const error = new Error(data.error || 'Request gagal');
      error.payload = data;
      throw error;
    }
    return data;
  }

  function applyAuthPayload(auth) {
    const next = auth && typeof auth === 'object' ? auth : {};
    state.auth = {
      username: String(next.username || ''),
      logged_in: !!next.logged_in,
    };
    syncAuthUi();
  }

  function syncAuthUi() {
    const username = state.auth && state.auth.username ? state.auth.username : '';
    if (el.topUserChip) el.topUserChip.textContent = username;
    if (el.accountCurrentUsername) el.accountCurrentUsername.textContent = username || '—';
    if (el.accountAvatar) {
      el.accountAvatar.textContent = (username || 'A').charAt(0).toUpperCase();
    }
  }

  let accountOldPasswordVerified = false;
  let accountOldPasswordVerifiedValue = '';
  let accountOldPasswordVerifyToken = 0;
  let accountOldPasswordVerifyTimer = null;

  function clearAccountOldPasswordVerifyTimer() {
    if (accountOldPasswordVerifyTimer) {
      clearTimeout(accountOldPasswordVerifyTimer);
      accountOldPasswordVerifyTimer = null;
    }
  }

  function scheduleAccountOldPasswordVerify(immediate = false) {
    clearAccountOldPasswordVerifyTimer();
    const value = String(el.accountOldPassword?.value || '');
    if (!value) {
      accountOldPasswordVerifyToken += 1;
      accountOldPasswordVerified = false;
      accountOldPasswordVerifiedValue = '';
      setAccountPasswordFieldsLocked(true);
      setAccountHint(el.accountOldHint, '', '');
      setAccountFieldState(el.accountOldPassword, '');
      syncAccountFormUi();
      return;
    }
    if (immediate) {
      verifyAccountOldPassword();
      return;
    }
    setAccountHint(el.accountOldHint, t('auth.old_password_checking'), '');
    setAccountFieldState(el.accountOldPassword, '');
    accountOldPasswordVerifyTimer = setTimeout(() => {
      accountOldPasswordVerifyTimer = null;
      verifyAccountOldPassword();
    }, 350);
  }

  function clearAccountForm() {
    if (el.accountOldPassword) el.accountOldPassword.value = '';
    if (el.accountNewPassword) el.accountNewPassword.value = '';
    if (el.accountConfirmPassword) el.accountConfirmPassword.value = '';
    clearAccountOldPasswordVerifyTimer();
    accountOldPasswordVerifyToken += 1;
    accountOldPasswordVerified = false;
    accountOldPasswordVerifiedValue = '';
    setAccountPasswordFieldsLocked(true);
    if (el.accountSection) {
      el.accountSection.querySelectorAll('.account-visibility.is-shown').forEach((btn) => {
        const id = btn.getAttribute('data-toggle-password');
        const input = id ? document.getElementById(id) : null;
        if (input) input.type = 'password';
        btn.classList.remove('is-shown');
        btn.setAttribute('aria-label', t('auth.show_password'));
        btn.setAttribute('title', t('auth.show_password'));
      });
    }
    syncAccountFormUi();
  }

  function fillAccountForm() {
    if (el.accountCurrentUsername) {
      el.accountCurrentUsername.textContent = state.auth && state.auth.username ? state.auth.username : '—';
    }
    if (el.accountAvatar) {
      const username = state.auth && state.auth.username ? state.auth.username : 'A';
      el.accountAvatar.textContent = username.charAt(0).toUpperCase();
    }
    if (el.accountNewUsername) {
      el.accountNewUsername.value = state.auth && state.auth.username ? state.auth.username : '';
    }
    clearAccountForm();
  }

  function passwordStrength(value) {
    const pass = String(value || '');
    if (!pass) return { level: 0, label: '' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10 || (/[A-Z]/.test(pass) && /[a-z]/.test(pass))) score += 1;
    if (/\d/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score += 1;
    const level = Math.max(1, Math.min(3, score));
    const labels = {
      1: t('auth.strength_weak'),
      2: t('auth.strength_fair'),
      3: t('auth.strength_strong'),
    };
    return { level, label: labels[level] || '' };
  }

  function setAccountHint(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('is-error', kind === 'error');
    node.classList.toggle('is-ok', kind === 'ok');
  }

  function setAccountFieldState(input, stateName) {
    const field = input && input.closest ? input.closest('.account-field') : null;
    if (!field) return;
    field.classList.toggle('is-valid', stateName === 'valid');
    field.classList.toggle('is-invalid', stateName === 'invalid');
  }

  function setAccountCheck(node, done) {
    if (!node) return;
    node.classList.toggle('is-done', !!done);
  }

  function setAccountStatus(text, kind) {
    if (!el.accountStatus) return;
    el.accountStatus.textContent = text || '';
    el.accountStatus.classList.toggle('is-error', kind === 'error');
    el.accountStatus.classList.toggle('is-ok', kind === 'ok');
  }

  function isAccountPasswordFieldsLocked() {
    return !!(el.accountPasswordGrid && el.accountPasswordGrid.hidden);
  }

  function setAccountPasswordFieldsLocked(locked) {
    if (!el.accountPasswordGrid) return;
    const lock = !!locked;
    el.accountPasswordGrid.hidden = lock;

    [el.accountNewPassword, el.accountConfirmPassword].forEach((input) => {
      if (!input) return;
      if (lock) {
        input.value = '';
        input.type = 'password';
      }
    });

    el.accountPasswordGrid.querySelectorAll('.account-visibility').forEach((btn) => {
      btn.classList.remove('is-shown');
      btn.setAttribute('aria-label', t('auth.show_password'));
      btn.setAttribute('title', t('auth.show_password'));
    });

    if (lock) {
      setAccountHint(el.accountNewHint, '', '');
      setAccountHint(el.accountConfirmHint, '', '');
      setAccountFieldState(el.accountNewPassword, '');
      setAccountFieldState(el.accountConfirmPassword, '');
      if (el.accountStrength) el.accountStrength.hidden = true;
    }
  }

  async function verifyAccountOldPassword() {
    const value = String(el.accountOldPassword?.value || '');
    const token = ++accountOldPasswordVerifyToken;

    if (!value) {
      accountOldPasswordVerified = false;
      accountOldPasswordVerifiedValue = '';
      setAccountPasswordFieldsLocked(true);
      syncAccountFormUi();
      return false;
    }

    if (accountOldPasswordVerified && value === accountOldPasswordVerifiedValue) {
      setAccountPasswordFieldsLocked(false);
      syncAccountFormUi();
      return true;
    }

    setAccountHint(el.accountOldHint, t('auth.old_password_checking'), '');
    setAccountFieldState(el.accountOldPassword, '');

    try {
      await api('verify_password', { password: value });
      if (token !== accountOldPasswordVerifyToken) return false;
      if (String(el.accountOldPassword?.value || '') !== value) return false;

      accountOldPasswordVerified = true;
      accountOldPasswordVerifiedValue = value;
      setAccountHint(el.accountOldHint, t('auth.old_password_ok'), 'ok');
      setAccountFieldState(el.accountOldPassword, 'valid');
      setAccountPasswordFieldsLocked(false);
      syncAccountFormUi();
      return true;
    } catch (_) {
      if (token !== accountOldPasswordVerifyToken) return false;
      accountOldPasswordVerified = false;
      accountOldPasswordVerifiedValue = '';
      setAccountPasswordFieldsLocked(true);
      setAccountHint(el.accountOldHint, t('auth.old_password_wrong'), 'error');
      setAccountFieldState(el.accountOldPassword, 'invalid');
      syncAccountFormUi();
      return false;
    }
  }

  function getAccountFormState() {
    const currentUsername = String(state.auth && state.auth.username ? state.auth.username : '').trim();
    const oldPassword = String(el.accountOldPassword?.value || '');
    const newUsername = String(el.accountNewUsername?.value || '').trim();
    const unlocked = !isAccountPasswordFieldsLocked();
    const newPassword = unlocked ? String(el.accountNewPassword?.value || '') : '';
    const confirmPassword = unlocked ? String(el.accountConfirmPassword?.value || '') : '';
    const usernameOk = newUsername.length > 0;
    const usernameChanged = usernameOk && newUsername !== currentUsername;
    const oldOk = oldPassword.length > 0;
    const oldVerified = accountOldPasswordVerified
      && oldPassword !== ''
      && oldPassword === accountOldPasswordVerifiedValue;
    const lengthOk = newPassword.length >= 6;
    const matchOk = newPassword.length > 0 && newPassword === confirmPassword;
    const dirty = usernameChanged
      || oldOk
      || newPassword.length > 0
      || confirmPassword.length > 0;
    const ready = oldVerified && usernameOk && lengthOk && matchOk;
    return {
      currentUsername,
      oldPassword,
      newUsername,
      newPassword,
      confirmPassword,
      unlocked,
      usernameOk,
      usernameChanged,
      oldOk,
      oldVerified,
      lengthOk,
      matchOk,
      dirty,
      ready,
      strength: passwordStrength(newPassword),
    };
  }

  function syncAccountFormUi() {
    const form = getAccountFormState();

    setAccountCheck(el.accountCheckOld, form.oldVerified);
    setAccountCheck(el.accountCheckLength, form.lengthOk);
    setAccountCheck(el.accountCheckMatch, form.matchOk);
    setAccountCheck(el.accountCheckReady, form.ready);

    if (el.accountChangePill) el.accountChangePill.hidden = !form.usernameChanged;
    if (el.accountChecklist) el.accountChecklist.hidden = !form.dirty;
    if (el.btnResetAccount) {
      el.btnResetAccount.hidden = !form.dirty;
      el.btnResetAccount.setAttribute('aria-hidden', form.dirty ? 'false' : 'true');
    }
    if (el.btnSaveAccount) {
      el.btnSaveAccount.hidden = !form.dirty;
      el.btnSaveAccount.setAttribute('aria-hidden', form.dirty ? 'false' : 'true');
      if (!el.btnSaveAccount.classList.contains('is-busy')) {
        el.btnSaveAccount.disabled = !form.ready;
      }
    }

    if (el.accountStrength) {
      el.accountStrength.hidden = form.newPassword.length === 0;
      el.accountStrength.dataset.level = String(form.strength.level || 0);
    }
    if (el.accountStrengthLabel) {
      el.accountStrengthLabel.textContent = form.strength.label || '';
    }

    if (!form.oldOk && form.dirty) {
      setAccountHint(el.accountOldHint, t('auth.old_password_required'), 'error');
      setAccountFieldState(el.accountOldPassword, 'invalid');
    } else if (form.oldVerified) {
      setAccountHint(el.accountOldHint, t('auth.old_password_ok'), 'ok');
      setAccountFieldState(el.accountOldPassword, 'valid');
    } else if (!form.oldOk) {
      setAccountHint(el.accountOldHint, '', '');
      setAccountFieldState(el.accountOldPassword, '');
    }

    if (!form.usernameOk) {
      setAccountFieldState(el.accountNewUsername, 'invalid');
    } else if (form.usernameChanged) {
      setAccountFieldState(el.accountNewUsername, 'valid');
    } else {
      setAccountFieldState(el.accountNewUsername, '');
    }

    if (form.newPassword && !form.lengthOk) {
      setAccountHint(el.accountNewHint, t('auth.password_min'), 'error');
      setAccountFieldState(el.accountNewPassword, 'invalid');
    } else if (form.lengthOk) {
      setAccountHint(el.accountNewHint, '', '');
      setAccountFieldState(el.accountNewPassword, 'valid');
    } else {
      setAccountHint(el.accountNewHint, '', '');
      setAccountFieldState(el.accountNewPassword, '');
    }

    if (form.confirmPassword && !form.matchOk) {
      setAccountHint(el.accountConfirmHint, t('auth.password_mismatch'), 'error');
      setAccountFieldState(el.accountConfirmPassword, 'invalid');
    } else if (form.matchOk) {
      setAccountHint(el.accountConfirmHint, t('auth.match_ok'), 'ok');
      setAccountFieldState(el.accountConfirmPassword, 'valid');
    } else {
      setAccountHint(el.accountConfirmHint, '', '');
      setAccountFieldState(el.accountConfirmPassword, '');
    }

    if (form.ready) {
      setAccountStatus(t('auth.ready_hint'), 'ok');
    } else if (form.dirty) {
      setAccountStatus(t('auth.form_incomplete'), '');
    } else {
      setAccountStatus('', '');
    }

    return form;
  }

  function isAbortError(err) {
    return !!(err && (err.name === 'AbortError' || err.code === 20));
  }

  function beginBusyAbort() {
    if (state.busyController) {
      try { state.busyController.abort(); } catch (_) { /* ignore */ }
    }
    state.busyController = new AbortController();
    return state.busyController.signal;
  }

  function clearBusyAbort() {
    state.busyController = null;
  }

  function cancelBusyOperation() {
    if (!state.busyController) return;
    try { state.busyController.abort(); } catch (_) { /* ignore */ }
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.add('hidden'), 3200);
  }

  function cloneTopology() {
    return {
      devices: JSON.parse(JSON.stringify(state.devices)),
      connections: JSON.parse(JSON.stringify(state.connections)),
    };
  }

  function canUndo() {
    return history.index > 0;
  }

  function canRedo() {
    return history.index >= 0 && history.index < history.stack.length - 1;
  }

  function updateHistoryButtons() {
    const undoOk = canUndo();
    const redoOk = canRedo();
    if (el.ctxUndoBtn) {
      el.ctxUndoBtn.disabled = !undoOk;
      el.ctxUndoBtn.classList.toggle('disabled', !undoOk);
      el.ctxUndoBtn.title = t(undoOk ? 'nav.undo_title' : 'nav.undo_empty');
    }
    if (el.ctxRedoBtn) {
      el.ctxRedoBtn.disabled = !redoOk;
      el.ctxRedoBtn.classList.toggle('disabled', !redoOk);
      el.ctxRedoBtn.title = t(redoOk ? 'nav.redo_title' : 'nav.redo_empty');
    }
  }

  function pushHistory(opts = {}) {
    if (history.locked) return;
    const markDirty = opts.dirty !== false;
    const snap = cloneTopology();
    const current = history.stack[history.index];
    if (current && JSON.stringify(current) === JSON.stringify(snap)) {
      updateHistoryButtons();
      return;
    }
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(snap);
    if (history.stack.length > history.max) {
      history.stack.shift();
    }
    history.index = history.stack.length - 1;
    updateHistoryButtons();
    // First baseline snapshot is clean; later topology edits mark the doc dirty.
    if (markDirty && history.stack.length > 1) {
      markDocDirty();
    }
  }

  async function restoreTopology(snap, label) {
    history.locked = true;
    try {
      const data = await api('replace_topology', {
        devices: snap.devices,
        connections: snap.connections,
      });
      state.devices = data.devices;
      state.connections = data.connections;
      clearSelection();
      syncInspector();
      draw();
      if (label) toast(label);
    } finally {
      history.locked = false;
      updateHistoryButtons();
      markDocDirty();
    }
  }

  async function undo() {
    if (!canUndo()) return;
    history.index -= 1;
    await restoreTopology(history.stack[history.index], 'Undo');
  }

  async function redo() {
    if (!canRedo()) return;
    history.index += 1;
    await restoreTopology(history.stack[history.index], 'Redo');
  }

  function busy(on, text = null, progress = null) {
    el.busyText.textContent = text || t('busy.default');
    el.busy.classList.toggle('hidden', !on);
    if (!on) {
      el.busyProgressWrap.classList.add('hidden');
      clearBusyAbort();
      return;
    }
    if (progress) {
      el.busyProgressWrap.classList.remove('hidden');
      const total = Math.max(1, Number(progress.total || 1));
      const done = Math.min(total, Number(progress.done || 0));
      const pct = Math.round((done / total) * 100);
      el.busyBar.style.width = pct + '%';
      el.busyBarTrack.setAttribute('aria-valuenow', String(pct));
      el.busyPercent.textContent = pct + '%';
      el.busyCount.textContent = `${done} / ${total}`;
      el.busyDetail.textContent = progress.detail || '';
      el.busyFound.textContent = t('busy.found', { n: progress.found || 0 });
    } else {
      el.busyProgressWrap.classList.add('hidden');
    }
  }

  function setBusyProgress(progress) {
    if (el.busy.classList.contains('hidden')) return;
    busy(true, el.busyText.textContent, progress);
  }

  function typeMeta(type) {
    return TYPES.find((t) => t.type === type) || TYPES.find((t) => t.type === 'client') || TYPES[0];
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function stageDpr() {
    return window.devicePixelRatio || 1;
  }

  function resize() {
    const rect = el.stage.parentElement.getBoundingClientRect();
    const dpr = stageDpr();
    stageCssW = Math.max(1, Math.round(rect.width));
    stageCssH = Math.max(1, Math.round(rect.height));
    el.stage.width = Math.floor(stageCssW * dpr);
    el.stage.height = Math.floor(stageCssH * dpr);
    el.stage.style.width = stageCssW + 'px';
    el.stage.style.height = stageCssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - state.pan.x) / state.scale,
      y: (sy - state.pan.y) / state.scale,
    };
  }

  function getPointer(e) {
    const rect = el.stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitDevice(wx, wy) {
    // Include padding so hover stays active when moving onto + handles
    const pad = PLUS_R + 8;
    for (let i = state.devices.length - 1; i >= 0; i--) {
      const d = state.devices[i];
      const w = deviceW(d);
      if (wx >= d.x - pad && wx <= d.x + w + pad && wy >= d.y - pad && wy <= d.y + deviceH(d) + pad) {
        return d;
      }
    }
    return null;
  }

  function deviceAnchorBox(d) {
    const m = deviceMetrics(d);
    const w = deviceW(d);
    const h = deviceH(d);
    if (m.anchorH != null) {
      const ay = m.anchorY != null ? m.anchorY : 0;
      // anchorX = left inset (orbital flag). Else center anchorW (card tile).
      let ax;
      let aw;
      if (m.anchorX != null) {
        ax = m.anchorX;
        aw = m.anchorW != null ? m.anchorW : Math.max(1, w - ax);
      } else {
        aw = m.anchorW != null ? m.anchorW : w;
        ax = (w - aw) / 2;
      }
      return {
        x: d.x + ax,
        y: d.y + ay,
        w: aw,
        h: m.anchorH,
      };
    }
    return { x: d.x, y: d.y, w, h };
  }

  /** Orb left-edge attach (ring outer) — used when flag-plate box is the anchor. */
  function orbitalLeftAttach(d) {
    const m = orbitalMetrics(d);
    // orbCx = d.x + orbOuterR; outer-left = orbCx - orbOuterR = d.x
    return { x: d.x, y: d.y + m.h / 2 };
  }

  /** Offset from stored (d.x, d.y) to the visual tile / anchor box origin. */
  function deviceAnchorOffset(d) {
    const box = deviceAnchorBox(d);
    return { x: box.x - d.x, y: box.y - d.y };
  }

  /**
   * Move device so its anchor/tile box lands at (tileX, tileY).
   * Pass null to leave that axis unchanged. Uses current skin metrics
   * (e.g. card centers tile: d.x = tileX - (deviceW - tileW) / 2).
   */
  function setDeviceAnchorPos(d, tileX, tileY) {
    const off = deviceAnchorOffset(d);
    if (tileX != null) d.x = tileX - off.x;
    if (tileY != null) d.y = tileY - off.y;
  }

  function plusHandles(d) {
    const box = deviceAnchorBox(d);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // Orbital: left + sits on the orb ring, not the flag's under-collar edge.
    let leftX = box.x - 2;
    let leftY = cy;
    if (activeDeviceSkin() === 'orbital') {
      const p = orbitalLeftAttach(d);
      leftX = p.x - 2;
      leftY = p.y;
    }
    return [
      { side: 'top', x: cx, y: box.y - 2 },
      { side: 'right', x: box.x + box.w + 2, y: cy },
      { side: 'bottom', x: cx, y: box.y + box.h + 2 },
      { side: 'left', x: leftX, y: leftY },
    ];
  }

  function hitPlus(wx, wy) {
    // Prefer hovered / selected devices first for easier targeting
    const ordered = [...state.devices].sort((a, b) => {
      const score = (d) => (d.id === state.hoverId ? 2 : 0) + (isSelected(d.id) ? 1 : 0);
      return score(b) - score(a);
    });
    for (const d of ordered) {
      const show = d.id === state.hoverId || isSelected(d.id) || state.linking || state.connectFrom === d.id;
      if (!show && !state.linking) continue;
      for (const h of plusHandles(d)) {
        const dx = wx - h.x;
        const dy = wy - h.y;
        if (dx * dx + dy * dy <= (PLUS_R + 4) * (PLUS_R + 4)) {
          return { device: d, handle: h };
        }
      }
    }
    return null;
  }

  function drawPlusHandle(h, active = false) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, PLUS_R, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#1a6aff' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = active ? '#0047e0' : '#1a6aff';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(h.x - 4, h.y);
    ctx.lineTo(h.x + 4, h.y);
    ctx.moveTo(h.x, h.y - 4);
    ctx.lineTo(h.x, h.y + 4);
    ctx.strokeStyle = active ? '#ffffff' : '#1a6aff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // --- Edge-anchored connection geometry -----------------------------------
  // Links attach to the mid-point of a card's top/right/bottom/left edge
  // (matching the hover "+" connect handles) instead of the box center. The
  // side used for each end is picked dynamically from device geometry every
  // draw, so dragging a device keeps the anchors correct automatically.

  function sidePoint(d, side) {
    const box = deviceAnchorBox(d);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    switch (side) {
      case 'top': return { x: cx, y: box.y };
      case 'right': return { x: box.x + box.w, y: cy };
      case 'bottom': return { x: cx, y: box.y + box.h };
      case 'left':
        // Orbital flag plate starts under the orb — attach to ring outer left.
        if (activeDeviceSkin() === 'orbital') return orbitalLeftAttach(d);
        return { x: box.x, y: cy };
      default: return { x: cx, y: cy };
    }
  }

  // Choose the best edge on `from` (and its opposite on `to`) based on the
  // relative position of the two device rects. Prefers the axis on which the
  // boxes do NOT overlap (classic orthogonal-connector heuristic); falls
  // back to whichever axis has the larger separation.
  function pickAnchorSide(from, to) {
    const a = deviceAnchorBox(from);
    const b = deviceAnchorBox(to);
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;

    const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
    const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;

    let axis;
    if (overlapX && !overlapY) axis = 'y';
    else if (overlapY && !overlapX) axis = 'x';
    else axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';

    if (axis === 'x') {
      return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
    }
    return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
  }

  // Same heuristic as pickAnchorSide but against a raw world point (used for
  // the temporary drag-to-connect / rewire preview line, where the far end
  // is the mouse cursor rather than another device).
  function pickAnchorSideToPoint(d, px, py) {
    const box = deviceAnchorBox(d);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const dx = px - cx;
    const dy = py - cy;

    const overlapX = px >= box.x && px <= box.x + box.w;
    const overlapY = py >= box.y && py <= box.y + box.h;

    let axis;
    if (overlapX && !overlapY) axis = 'y';
    else if (overlapY && !overlapX) axis = 'x';
    else axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';

    if (axis === 'x') return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'bottom' : 'top';
  }

  function sideNormal(side) {
    switch (side) {
      case 'top': return { x: 0, y: -1 };
      case 'bottom': return { x: 0, y: 1 };
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
      default: return { x: 0, y: 0 };
    }
  }

  // Control points project outward from each anchor along the edge's normal
  // so the curve always leaves/enters perpendicular to the card, giving a
  // clean S-curve regardless of which sides are used.
  function bezierControlPoints(a, b, fromSide, toSide) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const offset = Math.max(28, Math.min(dist * 0.5, 90));
    const na = sideNormal(fromSide);
    const nb = sideNormal(toSide);
    return {
      c1: { x: a.x + na.x * offset, y: a.y + na.y * offset },
      c2: { x: b.x + nb.x * offset, y: b.y + nb.y * offset },
    };
  }

  // Full path (anchors + bezier control points) for a connection between two
  // devices. Computed fresh every call so moving/dragging devices instantly
  // updates the line.
  function connectionPath(from, to) {
    const { fromSide, toSide } = pickAnchorSide(from, to);
    const a = sidePoint(from, fromSide);
    const b = sidePoint(to, toSide);
    const { c1, c2 } = bezierControlPoints(a, b, fromSide, toSide);
    return { a, b, c1, c2, fromSide, toSide };
  }

  function normalizeHexColor(value, fallback = '#8090a8') {
    const raw = String(value || '').trim();
    const m3 = raw.match(/^#([0-9a-fA-F]{3})$/);
    if (m3) {
      const c = m3[1].toLowerCase();
      return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
    }
    const m6 = raw.match(/^#([0-9a-fA-F]{6})$/);
    if (m6) return `#${m6[1].toLowerCase()}`;
    return fallback;
  }

  function statusColor(status) {
    const s = state.settings;
    if (status === 'online') {
      return normalizeHexColor(s.status_online_color, DEFAULT_SETTINGS.status_online_color);
    }
    if (status === 'offline') {
      return normalizeHexColor(s.status_offline_color, DEFAULT_SETTINGS.status_offline_color);
    }
    return normalizeHexColor(s.status_unknown_color, DEFAULT_SETTINGS.status_unknown_color);
  }

  function hexAlpha(hex, alpha) {
    const h = String(hex || '#1a6aff').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(26,106,255,${alpha})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function parseHexRgb(hex) {
    const normalized = normalizeHexColor(hex, '#1a6aff');
    const n = parseInt(normalized.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Mirrors CSS color-mix(in srgb, A w%, B) — weight is A's share (0–1).
  function mixHexColor(hexA, hexB, weightA) {
    const [r1, g1, b1] = parseHexRgb(hexA);
    const [r2, g2, b2] = parseHexRgb(hexB);
    const w = Math.max(0, Math.min(1, weightA));
    const r = Math.round(r1 * w + r2 * (1 - w));
    const g = Math.round(g1 * w + g2 * (1 - w));
    const b = Math.round(b1 * w + b2 * (1 - w));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  // Palette .ico-code pill — tinted bg, tone border, mixed tone/ink text.
  const typeBadgeLayoutCache = Object.create(null);

  function typeShortBadgeLayout(short, compact) {
    const cacheKey = `${compact ? 1 : 0}:${short}`;
    const cached = typeBadgeLayoutCache[cacheKey];
    if (cached) return cached;
    // Match `.palette-item .ico-code` (menu Komponen capsule).
    const fontSize = compact ? 9 : 10.4;
    const font = `600 ${fontSize}px "JetBrains Mono"`;
    const padX = compact ? 6 : 7;
    const padY = compact ? 2.5 : 3;
    const prevFont = ctx.font;
    ctx.font = font;
    const textW = ctx.measureText(short).width;
    ctx.font = prevFont;
    const lay = {
      font,
      fontSize,
      padX,
      padY,
      letterSpacing: 0.04,
      w: textW + padX * 2,
      h: fontSize + padY * 2,
    };
    typeBadgeLayoutCache[cacheKey] = lay;
    return lay;
  }

  function drawTypeShortBadge(leftX, centerY, short, tone, compact) {
    const lay = typeShortBadgeLayout(short, compact);
    const skin = activeDeviceSkin();
    let bg;
    let border;
    let textColor;
    let backing = null;
    let radius = lay.h / 2;
    if (skin === 'signet') {
      bg = hexAlpha(tone, 0.18);
      border = hexAlpha(tone, 0.5);
      textColor = mixHexColor(tone, '#ffffff', 0.5);
      radius = 2;
    } else if (skin === 'orbital') {
      bg = hexAlpha(tone, 0.16);
      border = hexAlpha(tone, 0.45);
      textColor = mixHexColor(tone, '#0c1524', 0.55);
      backing = 'rgba(255,255,255,0.82)';
    } else {
      // Light / card: mirror CSS `.palette-item .ico-code`
      // background: color-mix(tone 12%, white)
      // border: color-mix(tone 22%, white)
      // color: color-mix(tone 75%, #0a1628)
      bg = mixHexColor(tone, '#ffffff', 0.12);
      border = mixHexColor(tone, '#ffffff', 0.22);
      textColor = mixHexColor(tone, '#0a1628', 0.75);
      backing = null;
      radius = 999;
    }

    ctx.save();
    roundRect(leftX, centerY - lay.h / 2, lay.w, lay.h, Math.min(radius, lay.h / 2));
    if (backing) {
      ctx.fillStyle = backing;
      ctx.fill();
    }
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = lay.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    if (lay.letterSpacing) {
      // Canvas letterSpacing (modern) — fallback: draw as single string.
      try { ctx.letterSpacing = `${lay.letterSpacing}em`; } catch (_) { /* ignore */ }
    }
    ctx.fillText(short, leftX + lay.w / 2, centerY + 0.5);
    try { ctx.letterSpacing = '0px'; } catch (_) { /* ignore */ }
    ctx.restore();
  }

  const LINK_ANIM_STYLES = ['pulse', 'flow', 'comet', 'beads', 'spark'];

  function resolveLinkAnimStyle(raw) {
    const s = raw || DEFAULT_SETTINGS.link_animation_style;
    if (s === 'glow') return 'comet';
    return LINK_ANIM_STYLES.includes(s) ? s : 'pulse';
  }

  function resolveLinkAnimSpeed(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_SETTINGS.link_anim_speed;
    return Math.min(2, Math.max(0.25, Math.round(n * 20) / 20));
  }

  function formatLinkAnimSpeed(speed) {
    return `${resolveLinkAnimSpeed(speed).toFixed(2)}×`;
  }

  // Accumulated animation clock so speed changes scale dt without phase jumps
  // (unlike performance.now() * speed, which teleports when the multiplier changes).
  // Advance ONLY from the anim loop (~30fps) — linkAnimNow() is a pure read so
  // per-connection samples and hover/drag redraws do not burn extra dt or skew phase.
  let linkAnimClockMs = 0;
  let linkAnimLastWallMs = 0;

  function linkAnimNow() {
    return linkAnimClockMs;
  }

  function advanceLinkAnimClock(now = performance.now()) {
    const speed = resolveLinkAnimSpeed(state.settings.link_anim_speed);
    if (!linkAnimLastWallMs) {
      linkAnimLastWallMs = now;
      return linkAnimClockMs;
    }
    const dt = now - linkAnimLastWallMs;
    linkAnimLastWallMs = now;
    // Skip large gaps (anim loop paused, tab backgrounded) so resume doesn't teleport.
    if (dt > 0 && dt < 250) {
      linkAnimClockMs += dt * speed;
    }
    return linkAnimClockMs;
  }

  function applyLinkAnimSpeedLive(raw) {
    const speed = resolveLinkAnimSpeed(raw);
    state.settings.link_anim_speed = speed;
    if (el.setLinkAnimSpeed && String(el.setLinkAnimSpeed.value) !== String(speed)) {
      el.setLinkAnimSpeed.value = String(speed);
    }
    syncLinkAnimSpeedLabel();
    return speed;
  }

  function syncLinkAnimControlsUi() {
    const on = !!(el.setAnimateLinks && el.setAnimateLinks.checked);
    if (el.setLinkAnimStyle) el.setLinkAnimStyle.disabled = !on;
    if (el.setLinkAnimSpeed) el.setLinkAnimSpeed.disabled = !on;
  }

  function syncLinkAnimSpeedLabel() {
    if (!el.setLinkAnimSpeedVal || !el.setLinkAnimSpeed) return;
    el.setLinkAnimSpeedVal.textContent = formatLinkAnimSpeed(
      state.settings.link_anim_speed ?? el.setLinkAnimSpeed.value,
    );
  }

  function drawLinkTypeIcon(conn, mx, my, hasLabel, highlighted = false) {
    // World-space sizes so badges scale with the same ctx.scale(state.scale)
    // transform as devices/lines (do not counter-scale by 1/zoom).
    const meta = getLinkTypeMeta(conn.link_type);
    const size = highlighted ? 20 : 18;
    const pad = 3.5;
    const badgeR = size / 2 + pad;
    const labelGap = 4;
    const centerY = hasLabel ? my - 8 - labelGap - badgeR : my;
    const img = linkIconCache[meta.id];
    const glyph = size * 0.62;

    ctx.save();
    ctx.shadowColor = hexAlpha(meta.color, highlighted ? 0.55 : 0.4);
    ctx.shadowBlur = highlighted ? 5 : 3.5;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(mx, centerY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.beginPath();
    ctx.arc(mx, centerY, badgeR, 0, Math.PI * 2);
    ctx.strokeStyle = highlighted ? '#ffffff' : hexAlpha('#ffffff', 0.45);
    ctx.lineWidth = highlighted ? 1.5 : 1;
    ctx.stroke();

    if (img) {
      ctx.drawImage(img, mx - glyph / 2, centerY - glyph / 2, glyph, glyph);
    } else {
      ctx.beginPath();
      ctx.arc(mx, centerY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawConnection(conn, from, to, selected) {
    const { a, b, c1, c2 } = connectionPath(from, to);
    const baseWidth = selected ? 3.8 : 1.7;
    const meta = getLinkTypeMeta(conn.link_type);
    const typeColor = meta.color;
    const strokeNormal = hexAlpha(typeColor, selected ? 0.98 : 0.48);
    const strokeFlow = hexAlpha(typeColor, selected ? 1 : 0.78);
    // Animate only when global gate is on AND both endpoints are online
    // (offline or unknown on either end → static rope).
    const bothOnline = (from.status || 'unknown') === 'online'
      && (to.status || 'unknown') === 'online';
    const animating = state.settings.animate_links !== false
      && isPollingEnabled()
      && bothOnline;
    const animStyle = resolveLinkAnimStyle(state.settings.link_animation_style);
    const curveLen = animating ? approxCubicBezierLength(a, c1, c2, b) : 0;

    if (selected) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // White outer halo — path stands out clearly on light/dark canvas.
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = baseWidth + 10;
      ctx.stroke();
      // Type-color glow sits inside the white halo.
      ctx.strokeStyle = hexAlpha(typeColor, 0.36);
      ctx.lineWidth = baseWidth + 5;
      ctx.stroke();
      ctx.restore();
    }

    // Flow = garis putus-putus — tanpa solid di belakang.
    // Style lain tetap pakai garis dasar solid.
    if (animating && animStyle === 'flow') {
      // Dash/gap stay in world px; offset rate is already world-speed.
      // Scale period slightly with length so short links still show ~2+ dashes.
      const dash = Math.max(5, Math.min(10, curveLen * 0.035));
      const gap = dash * 0.7;
      const period = dash + gap;
      const offset = -((linkAnimNow() / 45) % period);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      ctx.setLineDash([dash, gap]);
      ctx.lineDashOffset = offset;
      ctx.lineCap = 'round';
      ctx.strokeStyle = strokeFlow;
      ctx.lineWidth = baseWidth;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      ctx.strokeStyle = strokeNormal;
      ctx.lineWidth = baseWidth;
      ctx.stroke();
    }

    // Comet: bright hot head + continuous tapered trail along the curve (from → to).
    // Distinct from beads (discrete dots), pulse (single dot), flow (dashes), spark (ping-pong flash).
    if (animating && animStyle === 'comet') {
      const headT = (linkAnimNow() / linkAnimPeriodMs(1400, curveLen)) % 1;
      // Trail in world px (~28% of curve, clamped) → t-fraction via L.
      const trailWorld = Math.min(160, Math.max(48, curveLen * 0.28));
      const trailLen = Math.min(0.55, Math.max(0.12, trailWorld / curveLen));
      // Dense samples so consecutive segments abut — no bead gaps.
      const samples = 48;
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const u = i / samples; // 0 = tip of tail, 1 = head
        const t = headT - trailLen * (1 - u);
        if (t < 0) continue; // clip: never wrap past t=0
        pts.push({
          x: cubic(a.x, c1.x, c2.x, b.x, t),
          y: cubic(a.y, c1.y, c2.y, b.y, t),
          u,
        });
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Stroke pts[fromIdx..end] as one continuous polyline.
      const strokeTrail = (fromIdx, width, color) => {
        if (pts.length - fromIdx < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[fromIdx].x, pts[fromIdx].y);
        for (let i = fromIdx + 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };

      // Nested continuous passes: full soft glow → shorter brighter core near head.
      // Each pass is a single stroke (not per-segment), so the trail reads solid.
      const n = pts.length;
      if (n >= 2) {
        const sel = selected;
        // Soft wide glow over the whole visible trail
        strokeTrail(0, sel ? 9.5 : 7.5, hexAlpha(typeColor, sel ? 0.1 : 0.07));
        // Mid envelope — skip the faintest tip
        strokeTrail(Math.floor(n * 0.18), sel ? 6.2 : 5.0, hexAlpha(typeColor, sel ? 0.22 : 0.16));
        // Brighter body nearer the head
        strokeTrail(Math.floor(n * 0.42), sel ? 3.8 : 3.1, hexAlpha(typeColor, sel ? 0.55 : 0.42));
        // Tight bright core
        strokeTrail(Math.floor(n * 0.62), sel ? 2.4 : 1.9, hexAlpha(typeColor, sel ? 0.88 : 0.72));
        // Hot filament just behind the head
        strokeTrail(Math.floor(n * 0.8), sel ? 1.5 : 1.2, hexAlpha(typeColor, sel ? 1 : 0.92));
      }

      // Leading hot spot (head) — white core over colored halo
      const head = pts[pts.length - 1];
      if (head) {
        ctx.beginPath();
        ctx.arc(head.x, head.y, selected ? 6.2 : 5.0, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(typeColor, selected ? 0.34 : 0.26);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(head.x, head.y, selected ? 3.6 : 3.0, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(typeColor, selected ? 0.95 : 0.88);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(head.x, head.y, selected ? 1.9 : 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
      }
      ctx.restore();
    }

    if (animating && animStyle === 'pulse') {
      const t = (linkAnimNow() / linkAnimPeriodMs(900, curveLen)) % 1;
      const px = cubic(a.x, c1.x, c2.x, b.x, t);
      const py = cubic(a.y, c1.y, c2.y, b.y, t);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = selected ? hexAlpha(typeColor, 0.95) : typeColor;
      ctx.fill();
    }

    // Rangkaian titik berjalan: spacing in world px → count scales with length
    if (animating && animStyle === 'beads') {
      const beadSpacingWorld = 40;
      const count = Math.max(2, Math.min(12, Math.round(curveLen / beadSpacingWorld)));
      const spacing = 1 / count;
      const lead = (linkAnimNow() / linkAnimPeriodMs(1800, curveLen)) % 1;
      const r = 2.2;
      const alpha = selected ? 0.85 : 0.75;
      for (let i = 0; i < count; i++) {
        const t = (lead + i * spacing) % 1;
        const px = cubic(a.x, c1.x, c2.x, b.x, t);
        const py = cubic(a.y, c1.y, c2.y, b.y, t);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(typeColor, alpha);
        ctx.fill();
      }
    }

    // Kilat: merah maju lalu biru mundur bergiliran, titik lebih tegas
    if (animating && animStyle === 'spark') {
      const cycle = (linkAnimNow() / linkAnimPeriodMs(1800, curveLen)) % 1;
      const redTurn = cycle < 0.5;
      const t = redTurn ? cycle * 2 : 1 - (cycle - 0.5) * 2;
      const color = redTurn ? '#ff3b5c' : '#1a6aff';
      const px = cubic(a.x, c1.x, c2.x, b.x, t);
      const py = cubic(a.y, c1.y, c2.y, b.y, t);
      // halo luar
      ctx.beginPath();
      ctx.arc(px, py, selected ? 9 : 7.5, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(color, selected ? 0.32 : 0.26);
      ctx.fill();
      // ring tengah
      ctx.beginPath();
      ctx.arc(px, py, selected ? 5.2 : 4.4, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(color, selected ? 0.7 : 0.62);
      ctx.fill();
      // inti solid
      ctx.beginPath();
      ctx.arc(px, py, selected ? 3.2 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // highlight putih kecil biar kontras
      ctx.beginPath();
      ctx.arc(px - 0.7, py - 0.7, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }

    const mx = cubic(a.x, c1.x, c2.x, b.x, 0.5);
    const my = cubic(a.y, c1.y, c2.y, b.y, 0.5);
    const showIcon = showSetting('show_link_icon');
    const showLabel = showSetting('show_link_label') && !!conn.label;
    const commentText = showSetting('show_link_comment')
      ? String(conn.comment || '').trim()
      : '';
    if (showIcon) {
      drawLinkTypeIcon(conn, mx, my, showLabel, selected);
    }

    const labelY = my - 2; // was my - 6; +4 world-px below icon
    const commentY = labelY + 13; // was +20; tighter under label (10px/9px fonts)

    if (showLabel) {
      const labelDraw = truncate(conn.label, 16);
      ctx.font = '600 10px "Sora"';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(labelDraw, mx, labelY);
      ctx.fillStyle = '#5b6b86';
      ctx.fillText(labelDraw, mx, labelY);
      ctx.textAlign = 'left';
    }

    if (commentText) {
      const commentDraw = truncate(commentText, 22);
      ctx.font = '500 9px "Sora"';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(commentDraw, mx, commentY);
      ctx.fillStyle = '#8090a8';
      ctx.fillText(commentDraw, mx, commentY);
      ctx.textAlign = 'left';
    }

    if (selected || state.hoverConnId === conn.id || (state.rewiring && state.rewiring.connId === conn.id)) {
      drawEndpoint(a, state.rewiring && state.rewiring.connId === conn.id && state.rewiring.end === 'from', typeColor);
      drawEndpoint(b, state.rewiring && state.rewiring.connId === conn.id && state.rewiring.end === 'to', typeColor);
    }
  }

  function drawEndpoint(p, active = false, accentColor = '#1a6aff') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, active ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = active ? accentColor : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accentColor;
    ctx.stroke();
  }

  function cubic(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  // Approximate cubic-bezier arc length by chord-sum sampling (world px).
  // Used to scale link animation period / trail / bead spacing so short and
  // long tali move at a similar world-space speed.
  const LINK_ANIM_REF_LEN = 200;

  function approxCubicBezierLength(a, c1, c2, b, steps = 16) {
    let len = 0;
    let px = a.x;
    let py = a.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = cubic(a.x, c1.x, c2.x, b.x, t);
      const y = cubic(a.y, c1.y, c2.y, b.y, t);
      len += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    return Math.max(len, 1);
  }

  // Period for one full from→to lap at ~constant world speed (ref length @ baseMs).
  function linkAnimPeriodMs(baseMs, curveLen) {
    return baseMs * (curveLen / LINK_ANIM_REF_LEN);
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function hitConnection(wx, wy) {
    const byId = Object.fromEntries(state.devices.map((d) => [d.id, d]));
    let best = null;
    let bestScore = 10 * 10;

    for (const c of state.connections) {
      const from = byId[c.from];
      const to = byId[c.to];
      if (!from || !to) continue;
      const { a, b, c1, c2 } = connectionPath(from, to);

      const dFrom = dist2(wx, wy, a.x, a.y);
      if (dFrom <= 12 * 12 && dFrom < bestScore) {
        best = { conn: c, end: 'from', from, to };
        bestScore = dFrom;
      }
      const dTo = dist2(wx, wy, b.x, b.y);
      if (dTo <= 12 * 12 && dTo < bestScore) {
        best = { conn: c, end: 'to', from, to };
        bestScore = dTo;
      }

      for (let t = 0; t <= 1; t += 0.025) {
        const px = cubic(a.x, c1.x, c2.x, b.x, t);
        const py = cubic(a.y, c1.y, c2.y, b.y, t);
        const d = dist2(wx, wy, px, py);
        if (d < bestScore && d <= 8 * 8) {
          best = { conn: c, end: null, from, to };
          bestScore = d;
        }
      }
    }
    return best;
  }

  function findConnection(id) {
    return state.connections.find((c) => c.id === id) || null;
  }

  // Device status cue (all themes): settings-driven online / offline / unknown.
  function deviceStatusPulse(status) {
    // Glow is always static — no sine blink / pulse animation.
    return {
      blinkOn: false,
      statusPulse: 1,
      sc: statusColor(status),
      showGlow: status === 'online' || status === 'offline',
    };
  }

  function statusTextInk(status, dark) {
    if (status === 'offline') return dark ? '#ff6b7e' : '#c41e3a';
    if (status === 'online') return dark ? '#39FF14' : '#15803d';
    return dark ? '#60a5fa' : '#1d4ed8';
  }

  function drawRectSelectionAura(x, y, w, h, radius, selected, softNeighbor) {
    if (!selected && !softNeighbor) return;
    const auraColor = selected ? SELECTION_GLOW_COLOR : NEIGHBOR_GLOW_COLOR;
    const auraBlur = selected ? SELECTION_GLOW_BLUR : NEIGHBOR_GLOW_BLUR;
    ctx.save();
    ctx.shadowColor = auraColor;
    ctx.shadowBlur = auraBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    roundRect(x, y, w, h, radius);
    ctx.fillStyle = auraColor;
    ctx.fill();
    ctx.restore();
  }

  function strokeStatusRectOutline(x, y, w, h, radius, { sc, compact, selected, softNeighbor }) {
    roundRect(x, y, w, h, radius);
    ctx.lineWidth = selected ? 2.2 : (compact ? 1.5 : 1.7);
    // Status cue is outline only (no soft glow behind the device).
    ctx.strokeStyle = sc;
    ctx.stroke();
    if (selected) {
      roundRect(x - 3, y - 3, w + 6, h + 6, radius + 3);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = SELECTION_RING_COLOR;
      ctx.stroke();
    } else if (softNeighbor) {
      roundRect(x - 2, y - 2, w + 4, h + 4, radius + 2);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = NEIGHBOR_RING_COLOR;
      ctx.stroke();
    }
  }

  function drawStatusLed(pipX, pipY, compact, { sc }, darkWell) {
    const pipR = compact ? 3.2 : 4.0;
    ctx.beginPath();
    ctx.arc(pipX, pipY, compact ? 4.4 : 5.6, 0, Math.PI * 2);
    ctx.fillStyle = darkWell ? 'rgba(0,0,0,0.35)' : '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pipX, pipY, pipR, 0, Math.PI * 2);
    ctx.fillStyle = sc;
    ctx.fill();
  }

  function drawDeviceBodyText(d, m, {
    textX, maxMetaW, startY, contentH, pal, statusTextColor, labelFont,
  }) {
    const compact = m.compact;
    const meta = m.meta;
    const bodyLines = m.lines;
    const ipRaw = (d.ip || '').trim();
    const statusText = statusLatencyLabel(d);
    const metaBaseFont = compact ? '500 9px "JetBrains Mono"' : '500 9.5px "JetBrains Mono"';
    const metaLatFont = compact ? '700 9px "JetBrains Mono"' : '700 9.5px "JetBrains Mono"';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let textBlockH = deviceTextBlockH(bodyLines, m.labelStep, m.lineStep, compact);
    let ty = startY + Math.max(0, (contentH - textBlockH) / 2) + (compact ? 10 : 11);

    for (let i = 0; i < bodyLines.length; i += 1) {
      const line = bodyLines[i];
      if (line.kind === 'label') {
        ctx.fillStyle = pal.ink;
        ctx.font = labelFont;
        const labelText = String(d.label || meta.label || '').trim() || meta.label;
        ctx.fillText(truncateToWidth(labelText, maxMetaW), textX, ty);
        ty += m.labelStep;
      } else if (line.kind === 'ip') {
        ctx.font = metaBaseFont;
        ctx.fillStyle = pal.muted;
        const ipText = ipRaw ? truncateToWidth(ipRaw, maxMetaW) : '—';
        ctx.fillText(ipText, textX, ty);
        ty += m.lineStep;
      } else if (line.kind === 'latency') {
        ctx.font = metaLatFont;
        ctx.fillStyle = statusTextColor;
        ctx.fillText(truncateToWidth(statusText, maxMetaW), textX, ty);
        ty += m.lineStep;
      } else if (line.kind === 'comment') {
        ctx.fillStyle = pal.faint;
        ctx.font = '500 9px "JetBrains Mono"';
        ctx.fillText(truncateToWidth(line.text, maxMetaW), textX, ty);
        ty += m.lineStep;
      } else if (line.kind === 'services') {
        const services = Array.isArray(d.services) && d.services.length
          ? d.services.slice(0, 3).join(',')
          : '—';
        ctx.fillStyle = pal.faint;
        ctx.font = '500 9px "JetBrains Mono"';
        ctx.fillText(truncateToWidth(services, maxMetaW), textX, ty);
        ty += m.lineStep;
      }
    }
  }

  function drawDevicePlusHandles(d) {
    const showPlus = state.hoverId === d.id || isSelected(d.id) || state.linking || state.connectFrom === d.id;
    if (!showPlus) return;
    for (const h2 of plusHandles(d)) {
      drawPlusHandle(h2, state.connectFrom === d.id);
    }
  }

  const iconOutlineCache = Object.create(null);

  function drawDeviceIcon(
    d,
    iconX,
    iconY,
    iconSize,
    tone,
    {
      outlineColor = null,
      outlineWidth = 1.75,
      innerOutlineColor = null,
      innerOutlineWidth = 0,
      outlineLayers = null,
    } = {}
  ) {
    const img = iconCache[d.type];
    const customLayers = Array.isArray(outlineLayers)
      ? outlineLayers.filter((layer) => layer && layer.color && layer.width > 0)
      : [];
    const layers = [];
    if (customLayers.length) {
      let radius = 0;
      for (const layer of customLayers) {
        radius += layer.width;
        layers.push({ color: layer.color, radius });
      }
      layers.reverse();
    } else if (outlineColor) {
      if (innerOutlineColor && innerOutlineWidth > 0) {
        layers.push({
          color: outlineColor,
          radius: Math.max(1, outlineWidth) + innerOutlineWidth,
        });
        layers.push({
          color: innerOutlineColor,
          radius: innerOutlineWidth,
        });
      } else {
        layers.push({ color: outlineColor, radius: Math.max(1, outlineWidth) });
      }
    }

    if (img) {
      if (layers.length) {
        // Build the silhouette at a higher resolution and spread it around a
        // circle. Downsampling the result keeps curved icon edges smooth,
        // similar to a vector stroke, without changing the component box.
        const scale = 4;
        for (const layer of layers) {
          const pad = Math.ceil(layer.radius) + 1;
          const sourceSize = Math.ceil(iconSize * scale);
          const scaledPad = pad * scale;
          const side = sourceSize + scaledPad * 2;
          const cacheKey = `${d.type}|${iconSize}|${layer.radius}|${layer.color}|smooth-hollow`;
          let off = iconOutlineCache[cacheKey];
          if (!off) {
            const mask = document.createElement('canvas');
            mask.width = side;
            mask.height = side;
            const mctx = mask.getContext('2d');
            mctx.imageSmoothingEnabled = true;
            mctx.imageSmoothingQuality = 'high';
            mctx.drawImage(img, scaledPad, scaledPad, sourceSize, sourceSize);
            mctx.globalCompositeOperation = 'source-in';
            mctx.fillStyle = layer.color;
            mctx.fillRect(0, 0, side, side);

            off = document.createElement('canvas');
            off.width = side;
            off.height = side;
            const octx = off.getContext('2d');
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = 'high';
            const radius = layer.radius * scale;
            const samples = 32;
            for (let i = 0; i < samples; i += 1) {
              const angle = (Math.PI * 2 * i) / samples;
              octx.drawImage(mask, Math.cos(angle) * radius, Math.sin(angle) * radius);
            }
            octx.drawImage(mask, 0, 0);
            // Keep the stroke outside the icon silhouette. Transparent areas
            // inside the icon remain transparent instead of being color-filled.
            octx.globalCompositeOperation = 'destination-out';
            octx.drawImage(mask, 0, 0);
            octx.globalCompositeOperation = 'source-over';
            iconOutlineCache[cacheKey] = off;
          }
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(off, iconX - pad, iconY - pad, iconSize + pad * 2, iconSize + pad * 2);
          ctx.restore();
        }
      }
      ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
    } else {
      if (layers.length) {
        for (const layer of layers) {
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = layer.radius * 2;
          roundRect(iconX + 3, iconY + 3, iconSize - 6, iconSize - 6, 5);
          ctx.stroke();
        }
      }
      ctx.fillStyle = tone;
      roundRect(iconX + 3, iconY + 3, iconSize - 6, iconSize - 6, 5);
      ctx.fill();
    }
  }

  function drawDevice(d, { neighbor = false } = {}) {
    const skin = activeDeviceSkin();
    if (skin === 'orbital') drawDeviceOrbital(d, { neighbor });
    else if (skin === 'signet') drawDeviceSignet(d, { neighbor });
    else drawDeviceCard(d, { neighbor });
  }

  function drawDeviceOrbital(d, { neighbor = false } = {}) {
    const m = orbitalMetrics(d);
    const meta = m.meta;
    const compact = m.compact;
    const selected = isSelected(d.id);
    const softNeighbor = neighbor && !selected;
    const x = d.x;
    const y = d.y;
    const w = deviceW(d);
    const h = m.h;
    const pal = orbitalPalette();
    const tone = meta.color;

    const orbCx = x + m.orbOuterR;
    const orbCy = y + h / 2;
    const flagX = x + m.orbOuter - m.collarOverlap;
    const flagW = w - (m.orbOuter - m.collarOverlap);
    const flagH = Math.min(m.flagH, h);
    const flagY = y + (h - flagH) / 2;
    const flagR = m.flagRadius;

    ctx.save();

    const status = d.status || 'unknown';
    const { sc } = deviceStatusPulse(status);

    // Selection / path-neighbor soft fill aura (drawn under the badge).
    if (selected || softNeighbor) {
      const auraColor = selected ? SELECTION_GLOW_COLOR : NEIGHBOR_GLOW_COLOR;
      const auraBlur = selected ? SELECTION_GLOW_BLUR : NEIGHBOR_GLOW_BLUR;
      ctx.save();
      ctx.shadowColor = auraColor;
      ctx.shadowBlur = auraBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, m.orbOuterR, 0, Math.PI * 2);
      ctx.fillStyle = auraColor;
      ctx.fill();
      roundRect(flagX, flagY, flagW, flagH, flagR);
      ctx.fillStyle = auraColor;
      ctx.fill();
      ctx.restore();
    }

    // --- Info flag (frosted plate) — depth shadow only, no status glow -----
    ctx.save();
    ctx.shadowColor = pal.shadow;
    ctx.shadowBlur = selected ? 10 : (softNeighbor ? 9 : 8);
    ctx.shadowOffsetY = 2;
    roundRect(flagX, flagY, flagW, flagH, flagR);
    const flagGrad = ctx.createLinearGradient(flagX, flagY, flagX, flagY + flagH);
    flagGrad.addColorStop(0, pal.flag0);
    flagGrad.addColorStop(1, pal.flag1);
    ctx.fillStyle = flagGrad;
    ctx.fill();
    ctx.restore();

    roundRect(flagX, flagY, flagW, flagH, flagR);
    ctx.strokeStyle = pal.flagStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Status outline on the info flag
    if (!selected && !softNeighbor) {
      roundRect(flagX, flagY, flagW, flagH, flagR);
      ctx.strokeStyle = sc;
      ctx.lineWidth = compact ? 1.5 : 1.7;
      ctx.stroke();
    }

    // Top sheen on the flag
    ctx.save();
    roundRect(flagX + 1, flagY + 1, flagW - 2, Math.max(4, flagH * 0.38), Math.max(1, flagR - 1));
    ctx.clip();
    const sheen = ctx.createLinearGradient(flagX, flagY, flagX, flagY + flagH * 0.4);
    sheen.addColorStop(0, pal.flagSheen);
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(flagX, flagY, flagW, flagH * 0.4);
    ctx.restore();

    // Type-tint wash where flag docks to the orb
    ctx.save();
    roundRect(flagX, flagY, flagW, flagH, flagR);
    ctx.clip();
    const dockWash = ctx.createLinearGradient(flagX, flagY, flagX + 24, flagY);
    dockWash.addColorStop(0, hexAlpha(tone, selected ? 0.22 : 0.14));
    dockWash.addColorStop(1, hexAlpha(tone, 0));
    ctx.fillStyle = dockWash;
    ctx.fillRect(flagX, flagY, 24, flagH);
    ctx.restore();

    // Docking collar (soft bridge under the orb lip)
    const collarW = m.collarOverlap + (compact ? 4 : 6);
    const collarH = Math.min(flagH * 0.55, compact ? 22 : 28);
    const collarX = orbCx + m.orbR * 0.28;
    const collarY = orbCy - collarH / 2;
    roundRect(collarX, collarY, collarW, collarH, collarH / 2);
    ctx.fillStyle = pal.collar;
    ctx.fill();

    // --- Orbital core ---
    ctx.save();
    if (selected || softNeighbor) {
      ctx.shadowColor = hexAlpha(tone, selected ? 0.5 : 0.3);
      ctx.shadowBlur = compact ? 10 : 14;
    } else {
      ctx.shadowColor = pal.shadow;
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
    }
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, m.orbR, 0, Math.PI * 2);
    const orbGrad = ctx.createRadialGradient(
      orbCx - m.orbR * 0.3,
      orbCy - m.orbR * 0.35,
      m.orbR * 0.12,
      orbCx,
      orbCy,
      m.orbR
    );
    orbGrad.addColorStop(0, pal.orb0);
    orbGrad.addColorStop(0.65, pal.orb1);
    orbGrad.addColorStop(1, hexAlpha(tone, 0.22));
    ctx.fillStyle = orbGrad;
    ctx.fill();
    ctx.restore();

    // Type accent ring on the orb face
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, m.orbR - 0.75, 0, Math.PI * 2);
    ctx.strokeStyle = hexAlpha(tone, 0.62);
    ctx.lineWidth = compact ? 1.6 : 1.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, m.orbR - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = pal.orbStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Status orbit ring — outline only (online green / offline red)
    const orbitR = m.orbR + m.ringGap + m.ringW / 2;
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, orbitR, 0, Math.PI * 2);
    ctx.lineWidth = m.ringW;
    ctx.strokeStyle = sc;
    ctx.stroke();

    // Selection / neighbor outer frame around the whole badge
    if (selected) {
      roundRect(x - 3, y - 3, w + 6, h + 6, flagR + 4);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = SELECTION_RING_COLOR;
      ctx.stroke();
    } else if (softNeighbor) {
      roundRect(x - 2, y - 2, w + 4, h + 4, flagR + 3);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = NEIGHBOR_RING_COLOR;
      ctx.stroke();
    }

    // Device icon in the orb
    drawDeviceIcon(d, orbCx - m.iconSize / 2, orbCy - m.iconSize / 2, m.iconSize, tone);

    // Type short capsule docked on the orb's lower rim
    drawTypeShortBadge(orbCx - m.badgeLay.w / 2, orbCy + m.orbR - 1, meta.short, tone, compact);

    drawDeviceBodyText(d, m, {
      textX: x + m.textLeft,
      maxMetaW: Math.max(24, w - m.textLeft - m.flagPadX),
      startY: flagY + m.flagPadY,
      contentH: m.flagInnerH,
      pal,
      statusTextColor: statusTextInk(status, false),
      labelFont: compact ? '700 11px "Oxanium", "Sora"' : '700 12.5px "Oxanium", "Sora"',
    });

    drawDevicePlusHandles(d);
    ctx.restore();
  }

  function drawHudCornerBrackets(x, y, w, h, len, color, lineW) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'square';
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + len);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + h - len);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + len, y + h);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - len);
    ctx.stroke();
    ctx.restore();
  }

  function drawDeviceSignet(d, { neighbor = false } = {}) {
    // Neon Signet / HUD: dark plate, luminous type rim, square glyph, status edge light.
    const m = signetMetrics(d);
    const meta = m.meta;
    const compact = m.compact;
    const selected = isSelected(d.id);
    const softNeighbor = neighbor && !selected;
    const x = d.x;
    const y = d.y;
    const w = deviceW(d);
    const h = m.h;
    const radius = m.radius;
    const pal = signetPalette();
    const tone = meta.color;

    ctx.save();
    drawRectSelectionAura(x, y, w, h, radius, selected, softNeighbor);

    const status = d.status || 'unknown';
    const pulse = deviceStatusPulse(status);
    const { sc } = pulse;

    // Body — near-black metallic plate (no status glow behind).
    ctx.shadowColor = pal.shadow;
    ctx.shadowBlur = selected ? 12 : (softNeighbor ? 10 : 8);
    ctx.shadowOffsetY = 2;
    roundRect(x, y, w, h, radius);
    const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
    bodyGrad.addColorStop(0, pal.body0);
    bodyGrad.addColorStop(0.55, pal.body1);
    bodyGrad.addColorStop(1, '#080d14');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Soft top sheen (glass-ish rim light, not a white card wash).
    ctx.save();
    roundRect(x, y, w, h, radius);
    ctx.clip();
    const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.42);
    sheen.addColorStop(0, pal.sheen);
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h * 0.42);

    // Type-color luminous inner rim (HUD frame).
    roundRect(x + 1.1, y + 1.1, w - 2.2, h - 2.2, Math.max(0.5, radius - 1));
    ctx.strokeStyle = hexAlpha(tone, selected ? 0.55 : 0.38);
    ctx.lineWidth = compact ? 1.15 : 1.35;
    ctx.stroke();

    // Thin neon accent line across the top (type color).
    const accentY = y + (compact ? 3.5 : 4.5);
    const accentInset = compact ? 10 : 12;
    ctx.beginPath();
    ctx.moveTo(x + accentInset, accentY);
    ctx.lineTo(x + w - accentInset, accentY);
    ctx.strokeStyle = hexAlpha(tone, selected ? 0.85 : 0.65);
    ctx.lineWidth = compact ? 1.2 : 1.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Soft bloom under the accent line
    ctx.save();
    ctx.shadowColor = hexAlpha(tone, 0.55);
    ctx.shadowBlur = compact ? 5 : 7;
    ctx.beginPath();
    ctx.moveTo(x + accentInset, accentY);
    ctx.lineTo(x + w - accentInset, accentY);
    ctx.strokeStyle = hexAlpha(tone, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // HUD corner brackets in type color (outside the clip restore above).
    drawHudCornerBrackets(
      x + 2.5,
      y + 2.5,
      w - 5,
      h - 5,
      m.bracketLen,
      hexAlpha(tone, selected ? 0.7 : 0.48),
      compact ? 1.15 : 1.3
    );

    // Status outline only (online green / offline red) — no glow fill.
    strokeStatusRectOutline(x, y, w, h, radius, {
      sc, compact, selected, softNeighbor,
    });

    // Square glyph plate (signet) — deliberately not a circular well.
    const plateX = x + m.padX;
    const plateY = y + (h - (m.plateOuter + m.badgeGap + m.badgeLay.h)) / 2;
    const plateR = compact ? 3 : 3.5;

    ctx.save();
    ctx.shadowColor = hexAlpha(tone, selected ? 0.45 : 0.28);
    ctx.shadowBlur = compact ? 7 : 10;
    roundRect(plateX, plateY, m.plateOuter, m.plateOuter, plateR);
    const plateGrad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + m.plateOuter);
    plateGrad.addColorStop(0, pal.plate0);
    plateGrad.addColorStop(1, pal.plate1);
    ctx.fillStyle = plateGrad;
    ctx.fill();
    ctx.restore();

    roundRect(plateX, plateY, m.plateOuter, m.plateOuter, plateR);
    ctx.strokeStyle = hexAlpha(tone, selected ? 0.7 : 0.5);
    ctx.lineWidth = compact ? 1.35 : 1.55;
    ctx.stroke();
    roundRect(plateX + 0.75, plateY + 0.75, m.plateOuter - 1.5, m.plateOuter - 1.5, Math.max(0.5, plateR - 0.5));
    ctx.strokeStyle = pal.plateStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    const iconX = plateX + m.platePad;
    const iconY = plateY + m.platePad;
    drawDeviceIcon(d, iconX, iconY, m.iconSize, tone);
    drawTypeShortBadge(
      plateX + (m.plateOuter - m.badgeLay.w) / 2,
      plateY + m.plateOuter + m.badgeGap + m.badgeLay.h / 2,
      meta.short,
      tone,
      compact
    );

    drawStatusLed(x + w - (compact ? 10 : 12), y + (compact ? 11 : 13), compact, pulse, true);

    drawDeviceBodyText(d, m, {
      textX: x + m.textLeft,
      maxMetaW: Math.max(24, w - m.textLeft - (compact ? 14 : 18) - m.padX),
      startY: y + m.padY,
      contentH: m.contentH,
      pal,
      statusTextColor: statusTextInk(status, true),
      labelFont: compact ? '700 11px "Oxanium", "Sora"' : '700 12px "Oxanium", "Sora"',
    });

    drawDevicePlusHandles(d);
    ctx.restore();
  }

  function drawDeviceCard(d, { neighbor = false } = {}) {
    // Card skin (Light/Dark): solid status-filled tile, outline, Komponen capsule
    // inside; inverted black pills below. No glow.
    const m = cardMetrics(d);
    const meta = m.meta;
    const compact = m.compact;
    const selected = isSelected(d.id);
    const softNeighbor = neighbor && !selected;
    const x = d.x;
    const y = d.y;
    const w = deviceW(d);
    const pal = cardPalette();
    const tone = meta.color;
    const tile = m.tile;
    const tileX = x + (w - tile) / 2;
    const tileY = y;

    ctx.save();

    const status = d.status || 'unknown';
    const fillColor = statusColor(status);

    drawRectSelectionAura(tileX, tileY, tile, tile, m.radius, selected, softNeighbor);

    // --- Icon tile: full status color + theme outline ----------------------
    roundRect(tileX, tileY, tile, tile, m.radius);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = pal.tileStroke;
    ctx.lineWidth = selected ? 2.2 : 1.6;
    roundRect(tileX, tileY, tile, tile, m.radius);
    ctx.stroke();

    if (selected) {
      roundRect(tileX - 3, tileY - 3, tile + 6, tile + 6, m.radius + 3);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = SELECTION_RING_COLOR;
      ctx.stroke();
    } else if (softNeighbor) {
      roundRect(tileX - 2, tileY - 2, tile + 4, tile + 4, m.radius + 2);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = NEIGHBOR_RING_COLOR;
      ctx.stroke();
    }

    // Icon in upper area; Komponen-style capsule inside tile at the bottom.
    const badgeLay = m.badgeLay;
    const capsuleY = tileY + tile - m.capsuleGap - badgeLay.h / 2;
    const iconAreaBottom = capsuleY - badgeLay.h / 2 - (compact ? 4 : 5);
    const iconY = tileY + Math.max(compact ? 6 : 8, (iconAreaBottom - tileY - m.iconSize) / 2);
    const iconX = tileX + (tile - m.iconSize) / 2;
    drawDeviceIcon(d, iconX, iconY, m.iconSize, tone, {
      outlineLayers: [
        { color: '#ffffff', width: 2 },
        { color: '#000000', width: 2 },
      ],
    });

    // Capsule = same as menu Komponen `.ico-code`
    drawTypeShortBadge(
      tileX + (tile - badgeLay.w) / 2,
      capsuleY,
      meta.short,
      tone,
      compact
    );

    // --- Label / IP / comment (black pills) + latency / ports below ---------
    if (m.lines.length) {
      const cx = x + w / 2;
      const maxMetaW = Math.max(tile, w - 4);
      const ipRaw = (d.ip || '').trim();
      const statusText = statusLatencyLabel(d);
      const statusTextColor = statusColor(status);
      const metaBaseFont = compact ? '500 9px "JetBrains Mono"' : '500 9.5px "JetBrains Mono"';
      const metaLatFont = compact ? '700 9px "JetBrains Mono"' : '700 9.5px "JetBrains Mono"';
      const labelFont = '700 18px "Oxanium", "Sora"';
      const metaPadX = compact ? 6 : 7;
      let ty = y + m.stackH + m.labelGap;

      const drawInvertedPill = (text, font, boxH, padX) => {
        ctx.font = font;
        const textW = ctx.measureText(text).width;
        const boxW = textW + padX * 2;
        const boxX = cx - boxW / 2;
        roundRect(boxX, ty, boxW, boxH, boxH / 2);
        ctx.fillStyle = pal.pillBg;
        ctx.fill();
        ctx.strokeStyle = pal.pillStroke;
        ctx.lineWidth = 1;
        roundRect(boxX, ty, boxW, boxH, boxH / 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, ty + boxH / 2 + 0.5);
        return boxH;
      };

      if (showSetting('show_label')) {
        const maxLabelW = Math.max(24, NODE_W_MAX - m.labelPadX * 2);
        const rawLabel = String(d.label || meta.label || '').trim() || meta.label;
        ctx.font = labelFont;
        const labelText = truncateToWidth(rawLabel, maxLabelW);
        ty += drawInvertedPill(labelText, labelFont, m.labelBoxH, m.labelPadX) + m.metaGap;
      }

      for (let i = 0; i < m.otherLines.length; i += 1) {
        const line = m.otherLines[i];
        if (line.kind === 'ip') {
          drawInvertedPill(
            ipRaw ? truncateToWidth(ipRaw, maxMetaW - metaPadX * 2) : '—',
            metaBaseFont,
            m.lineStep,
            metaPadX
          );
        } else if (line.kind === 'latency') {
          // Keep status color — outlined text, no black pill.
          ctx.font = metaLatFont;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const latText = truncateToWidth(statusText, maxMetaW);
          ctx.lineJoin = 'round';
          ctx.miterLimit = 2;
          ctx.lineWidth = 2.6;
          ctx.strokeStyle = pal.latStroke;
          ctx.strokeText(latText, cx, ty + m.lineStep / 2 + 0.5);
          ctx.fillStyle = statusTextColor;
          ctx.fillText(latText, cx, ty + m.lineStep / 2 + 0.5);
        } else if (line.kind === 'comment') {
          drawInvertedPill(
            truncateToWidth(line.text, maxMetaW - metaPadX * 2),
            '500 9px "JetBrains Mono"',
            m.lineStep,
            metaPadX
          );
        } else if (line.kind === 'services') {
          const services = Array.isArray(d.services) && d.services.length
            ? d.services.slice(0, 3).join(',')
            : '—';
          drawInvertedPill(
            truncateToWidth(services, maxMetaW - metaPadX * 2),
            '500 9px "JetBrains Mono"',
            m.lineStep,
            metaPadX
          );
        }
        ty += m.lineStep + (i < m.otherLines.length - 1 ? m.metaPillGap : 0);
      }
    }

    drawDevicePlusHandles(d);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // Binary-search truncation using actual glyph widths (ctx.font must
  // already be set by the caller) so labels never overflow the card
  // regardless of proportional/monospace font metrics.
  const truncateWidthCache = new Map();
  const TRUNCATE_CACHE_MAX = 512;

  function truncateToWidth(text, maxW) {
    const font = ctx.font;
    const cacheKey = `${font}\0${maxW}\0${text}`;
    const cached = truncateWidthCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let out;
    if (ctx.measureText(text).width <= maxW) {
      out = text;
    } else {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const cand = `${text.slice(0, mid)}…`;
        if (ctx.measureText(cand).width <= maxW) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      out = lo > 0 ? `${text.slice(0, lo)}…` : '…';
    }
    if (truncateWidthCache.size >= TRUNCATE_CACHE_MAX) truncateWidthCache.clear();
    truncateWidthCache.set(cacheKey, out);
    return out;
  }

  function draw() {
    ctx.clearRect(0, 0, stageCssW, stageCssH);
    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.scale, state.scale);

    drawWorldGrid();

    const byId = Object.fromEntries(state.devices.map((d) => [d.id, d]));
    const pathHL = buildSelectionPathHighlight();

    for (const c of state.connections) {
      const a = byId[c.from];
      const b = byId[c.to];
      if (!a || !b) continue;
      if (state.rewiring && state.rewiring.connId === c.id) continue;
      const onPath = pathHL.pathConnIds.has(c.id);
      const emphasized = isConnSelected(c.id)
        || onPath
        || state.hoverConnId === c.id;
      const dimmed = pathHL.active && !emphasized;
      if (dimmed) ctx.globalAlpha = SELECTION_DIM_ALPHA;
      drawConnection(c, a, b, emphasized);
      if (dimmed) ctx.globalAlpha = 1;
    }

    if (state.rewiring) {
      const conn = findConnection(state.rewiring.connId);
      if (conn && state._mouseWorld) {
        const fixedId = state.rewiring.end === 'from' ? conn.to : conn.from;
        const fixed = byId[fixedId];
        if (fixed) {
          const side = pickAnchorSideToPoint(fixed, state._mouseWorld.x, state._mouseWorld.y);
          const a = sidePoint(fixed, side);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(state._mouseWorld.x, state._mouseWorld.y);
          ctx.strokeStyle = 'rgba(26,106,255,.9)';
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
          drawEndpoint(a, true);
          drawEndpoint(state._mouseWorld, true);
        }
      }
    }

    if (state.linking && state.connectFrom) {
      const from = byId[state.connectFrom];
      if (from && state._mouseWorld) {
        const side = pickAnchorSideToPoint(from, state._mouseWorld.x, state._mouseWorld.y);
        const a = sidePoint(from, side);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(state._mouseWorld.x, state._mouseWorld.y);
        ctx.strokeStyle = 'rgba(26,106,255,.9)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (state.selectedIds.size > 1) {
      drawSelectionBlock([...state.selectedIds]);
    }

    for (const d of state.devices) {
      const selected = isSelected(d.id);
      const neighbor = pathHL.neighborIds.has(d.id);
      const dimmed = pathHL.active && !selected && !neighbor;
      if (dimmed) ctx.globalAlpha = SELECTION_DIM_ALPHA;
      drawDevice(d, { neighbor });
      if (dimmed) ctx.globalAlpha = 1;
    }

    if (state.marquee) {
      drawMarquee(state.marquee);
    }
    ctx.restore();

    updateHoverTip();
  }

  function renderPalette() {
    el.paletteList.innerHTML = TYPES.map((item) => {
      const label = typeLabel(item.type);
      const desc = typeDesc(item.type);
      return `
      <div class="palette-item" draggable="true" data-type="${item.type}" style="--tone:${item.color}" title="${escapeHtml(label)}: ${escapeHtml(desc)}">
        <span class="palette-accent" aria-hidden="true"></span>
        <span class="ico-wrap">
          <img class="ico-img" src="${item.icon}" alt="" width="34" height="34" draggable="false" />
        </span>
        <span class="ico-meta">
          <strong>${escapeHtml(label)}</strong>
          <small class="ico-desc">${escapeHtml(desc)}</small>
        </span>
        <span class="ico-code">${escapeHtml(item.short)}</span>
      </div>
    `;
    }).join('');

    el.paletteList.querySelectorAll('.palette-item').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        if (isLayoutLocked()) {
          e.preventDefault();
          toast(t('toast.layout_locked'));
          return;
        }
        e.dataTransfer.setData('text/pamantau-type', item.dataset.type);
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      // Mobile: tap palette item to place at canvas center (HTML5 drag is unreliable on phones)
      item.addEventListener('click', async () => {
        if (!window.matchMedia('(max-width: 980px)').matches) return;
        if (isLayoutLocked()) {
          toast(t('toast.layout_locked'));
          return;
        }
        const type = item.dataset.type;
        if (!type) return;
        const rect = el.stage.getBoundingClientRect();
        const w = screenToWorld(rect.width / 2, rect.height / 2);
        await addDeviceAt(type, w.x, w.y);
        toast(t('toast.component_added'));
      });
    });
  }

  function isSelected(id) {
    return state.selectedIds.has(id);
  }

  function isConnSelected(id) {
    return state.selectedConnectionIds.has(id);
  }

  /**
   * Lower rank = more upstream. Topology hierarchy (not palette order):
   * web → internet → server → database → vpn → loadbalance → router → olt → onu → printer → client
   */
  const TYPE_RANK = {
    web: 0,
    internet: 1,
    server: 2,
    database: 3,
    vpn: 4,
    loadbalance: 5,
    router: 6,
    olt: 7,
    onu: 8,
    printer: 9,
    client: 10,
  };

  function deviceTypeRank(type) {
    const r = TYPE_RANK[type];
    return r === undefined ? 11 : r;
  }

  /**
   * Selection path highlight by network hierarchy (undirected edges, ranked walk).
   * Upstream: only the ancestor chain (neighbors with strictly lower type rank).
   * Downstream: full subtree (all reachable via strictly higher type rank).
   * Same-rank links are not traversed (avoids sibling fan-out). Multi-select
   * unions each selection’s up-path + down-subtree. Inactive when no devices
   * are selected (link-only selection keeps its own highlight path).
   */
  function buildSelectionPathHighlight() {
    const neighborIds = new Set();
    const pathConnIds = new Set();
    if (!state.selectedIds.size) {
      return { active: false, neighborIds, pathConnIds };
    }

    const byId = Object.fromEntries(state.devices.map((d) => [d.id, d]));

    // Undirected adjacency: deviceId -> [{ other, connId }, ...]
    const adj = new Map();
    for (const c of state.connections) {
      if (!c.from || !c.to || c.from === c.to) continue;
      if (!adj.has(c.from)) adj.set(c.from, []);
      if (!adj.has(c.to)) adj.set(c.to, []);
      adj.get(c.from).push({ other: c.to, connId: c.id });
      adj.get(c.to).push({ other: c.from, connId: c.id });
    }

    function walkDirected(startId, towardUpstream) {
      const start = byId[startId];
      if (!start) return;
      const seen = new Set([startId]);
      const queue = [startId];
      let qi = 0;
      while (qi < queue.length) {
        const id = queue[qi++];
        const cur = byId[id];
        if (!cur) continue;
        const curRank = deviceTypeRank(cur.type);
        const edges = adj.get(id);
        if (!edges) continue;
        for (const { other, connId } of edges) {
          const next = byId[other];
          if (!next) continue;
          const nextRank = deviceTypeRank(next.type);
          if (towardUpstream) {
            if (!(nextRank < curRank)) continue;
          } else if (!(nextRank > curRank)) {
            continue;
          }
          pathConnIds.add(connId);
          if (seen.has(other)) continue;
          seen.add(other);
          if (!state.selectedIds.has(other)) neighborIds.add(other);
          queue.push(other);
        }
      }
    }

    for (const id of state.selectedIds) {
      walkDirected(id, true);  // jalur naik: ancestor chain only
      walkDirected(id, false); // jalur turun: full subtree
    }

    return { active: true, neighborIds, pathConnIds };
  }

  function primarySelectedId() {
    return state.selectedId;
  }

  function clearSelection() {
    state.selectedIds.clear();
    state.selectedId = null;
    state.selectedConnectionIds.clear();
    state.selectedConnId = null;
  }

  function setSelection(ids, primary = null, { clearConnections = true } = {}) {
    if (clearConnections) {
      state.selectedConnectionIds.clear();
      state.selectedConnId = null;
    }
    state.selectedIds = new Set(ids.filter(Boolean));
    if (primary && state.selectedIds.has(primary)) {
      state.selectedId = primary;
    } else {
      state.selectedId = state.selectedIds.size ? [...state.selectedIds][state.selectedIds.size - 1] : null;
    }
  }

  function setConnectionSelection(ids, primary = null, { clearDevices = true } = {}) {
    if (clearDevices) {
      state.selectedIds.clear();
      state.selectedId = null;
    }
    state.selectedConnectionIds = new Set(ids.filter(Boolean));
    if (primary && state.selectedConnectionIds.has(primary)) {
      state.selectedConnId = primary;
    } else {
      state.selectedConnId = state.selectedConnectionIds.size
        ? [...state.selectedConnectionIds][state.selectedConnectionIds.size - 1]
        : null;
    }
  }

  function toggleInSelection(id) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
      if (state.selectedId === id) {
        state.selectedId = state.selectedIds.size ? [...state.selectedIds][0] : null;
      }
    } else {
      state.selectedIds.add(id);
      state.selectedId = id;
    }
  }

  function toggleInConnectionSelection(id) {
    if (state.selectedConnectionIds.has(id)) {
      state.selectedConnectionIds.delete(id);
      if (state.selectedConnId === id) {
        state.selectedConnId = state.selectedConnectionIds.size
          ? [...state.selectedConnectionIds][0]
          : null;
      }
    } else {
      state.selectedConnectionIds.add(id);
      state.selectedConnId = id;
    }
  }

  function deviceBounds(d) {
    return { x: d.x, y: d.y, w: deviceW(d), h: deviceH(d) };
  }

  function pointInRect(px, py, box) {
    return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
  }

  function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  function normalizeRect(x1, y1, x2, y2) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    return { x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }

  function devicesInMarquee(box) {
    return state.devices.filter((d) => rectsIntersect(deviceBounds(d), box)).map((d) => d.id);
  }

  function connectionsInMarquee(box) {
    const byId = Object.fromEntries(state.devices.map((d) => [d.id, d]));
    const ids = [];
    for (const c of state.connections) {
      const from = byId[c.from];
      const to = byId[c.to];
      if (!from || !to) continue;
      const { a, b, c1, c2 } = connectionPath(from, to);
      let hit = pointInRect(a.x, a.y, box) || pointInRect(b.x, b.y, box);
      if (!hit) {
        for (let t = 0; t <= 1; t += 0.05) {
          const px = cubic(a.x, c1.x, c2.x, b.x, t);
          const py = cubic(a.y, c1.y, c2.y, b.y, t);
          if (pointInRect(px, py, box)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) ids.push(c.id);
    }
    return ids;
  }

  function drawMarquee(box) {
    if (!box || (box.w < 2 && box.h < 2)) return;
    ctx.save();
    ctx.fillStyle = 'rgba(26, 106, 255, 0.12)';
    ctx.strokeStyle = 'rgba(26, 106, 255, 0.75)';
    ctx.lineWidth = 1.2 / state.scale;
    ctx.setLineDash([6 / state.scale, 4 / state.scale]);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  }

  function drawSelectionBlock(ids) {
    if (!ids.length) return;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const id of ids) {
      const d = findDevice(id);
      if (!d) continue;
      minX = Math.min(minX, d.x);
      minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + deviceW(d));
      maxY = Math.max(maxY, d.y + deviceH(d));
    }
    if (!Number.isFinite(minX)) return;
    const pad = 10;
    ctx.save();
    ctx.strokeStyle = 'rgba(26, 106, 255, 0.55)';
    ctx.fillStyle = 'rgba(26, 106, 255, 0.06)';
    ctx.lineWidth = 1.5 / state.scale;
    ctx.setLineDash([8 / state.scale, 5 / state.scale]);
    roundRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function findDevice(id) {
    return state.devices.find((d) => d.id === id) || null;
  }

  /** Open ports from last poll / port scan (`device.services`). */
  function deviceOpenPortSet(services) {
    const ports = Array.isArray(services)
      ? services.map((p) => parseInt(p, 10)).filter((p) => Number.isFinite(p))
      : [];
    return new Set(ports);
  }

  /** Pick http/https for context-menu Buka from known open web ports. */
  function webProtocolForDevice(device) {
    const open = deviceOpenPortSet(device && device.services);
    if (open.has(443)) return 'https';
    if (open.has(80)) return 'http';
    return 'http';
  }

  function openDeviceInBrowserWithPort(id, port) {
    const d = findDevice(id);
    if (!d) return;
    const raw = String(d.ip || '').trim();
    if (!raw) {
      toast(t('toast.no_ip'));
      return;
    }
    let host = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (!host) {
      toast(t('toast.invalid_ip'));
      return;
    }
    if (!host.includes('[') && /^[^:]+:\d+$/.test(host)) {
      host = host.replace(/:\d+$/, '');
    }
    if (host.includes(':') && !host.includes('.') && !host.startsWith('[')) {
      host = `[${host}]`;
    }
    const p = Number(port) || 80;
    const isHttps = p === 443 || p === 8443;
    const protocol = isHttps ? 'https' : 'http';
    window.open(`${protocol}://${host}:${p}`, '_blank', 'noopener,noreferrer');
  }

  function openDeviceInBrowser(id) {
    const d = findDevice(id);
    if (!d) return;
    const open = deviceOpenPortSet(d.services);
    let port = 80;
    if (open.has(443)) port = 443;
    else if (open.has(80)) port = 80;
    else if (open.has(8080)) port = 8080;
    else if (open.has(8091)) port = 8091;
    else if (open.size > 0) port = [...open][0];
    openDeviceInBrowserWithPort(id, port);
  }

  function populateCtxOpenMenu(d) {
    if (!el.ctxOpenMenu) return;
    if (!d) {
      el.ctxOpenMenu.innerHTML = '';
      return;
    }
    const services = Array.from(new Set(
      (Array.isArray(d.services) ? d.services : [])
        .map(Number)
        .filter((p) => Number.isFinite(p) && p >= 1 && p <= 65535)
    )).sort((a, b) => a - b);

    if (services.length === 0) {
      el.ctxOpenMenu.innerHTML = `<div class="menu-label">${escapeHtml(t('ctx.open_empty'))}</div>`;
      return;
    }

    el.ctxOpenMenu.innerHTML = services.map((p) => {
      const name = portServiceName(p);
      const badge = name ? `<span class="ctx-port-badge">${escapeHtml(name)}</span>` : '';
      return `
        <button type="button" data-open-port="${p}" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#16a34a"/></svg>
          ${p}${badge ? ` ${badge}` : ''}
        </button>
      `;
    }).join('');
  }

  function isPropsModalOpen() {
    return el.modalProps && !el.modalProps.classList.contains('hidden');
  }

  function openPropsModal() {
    syncInspector();
    if (!el.modalProps) return;
    el.modalProps.classList.remove('hidden');
    el.modalProps.setAttribute('aria-hidden', 'false');
  }

  function closePropsModal() {
    if (!el.modalProps) return;
    el.modalProps.classList.add('hidden');
    el.modalProps.setAttribute('aria-hidden', 'true');
  }

  let confirmResolver = null;

  function closeConfirmDialog(result) {
    if (!el.modalConfirm) return;
    el.modalConfirm.classList.add('hidden');
    el.modalConfirm.setAttribute('aria-hidden', 'true');
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(!!result);
    }
  }

  function confirmDialog({ title = t('common.confirm'), message = '', confirmLabel = t('confirm.delete') } = {}) {
    return new Promise((resolve) => {
      if (!el.modalConfirm) {
        resolve(false);
        return;
      }
      if (confirmResolver) {
        const prev = confirmResolver;
        confirmResolver = null;
        prev(false);
      }
      confirmResolver = resolve;
      if (el.confirmTitle) el.confirmTitle.textContent = title;
      if (el.confirmMessage) el.confirmMessage.textContent = message;
      if (el.confirmOkLabel) el.confirmOkLabel.textContent = confirmLabel;
      else if (el.btnConfirmOk) setBtnLabel(el.btnConfirmOk, confirmLabel);
      el.modalConfirm.classList.remove('hidden');
      el.modalConfirm.setAttribute('aria-hidden', 'false');
      el.btnConfirmOk?.focus();
    });
  }

  function setBtnLabel(btn, text) {
    if (!btn) return;
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = text;
    else btn.textContent = text;
  }

  function setPropsHeaderActions(mode) {
    const save = el.btnPropsSave;
    const del = el.btnPropsDelete;
    if (!save || !del) return;
    if (mode === 'device') {
      setBtnLabel(save, 'Simpan');
      setBtnLabel(del, 'Hapus');
      save.classList.remove('hidden');
      del.classList.remove('hidden');
      return;
    }
    if (mode === 'link') {
      setBtnLabel(save, 'Simpan');
      setBtnLabel(del, 'Hapus');
      save.classList.remove('hidden');
      del.classList.remove('hidden');
      return;
    }
    save.classList.add('hidden');
    del.classList.add('hidden');
  }

  function syncInspector() {
    const multiNote = document.getElementById('multiSelectNote');
    const count = state.selectedIds.size;
    const linkCount = state.selectedConnectionIds.size;

    el.propsForm.classList.remove('show');
    el.linkPropsForm.classList.remove('show');
    if (multiNote) multiNote.classList.add('hidden');
    if (el.emptyProps) el.emptyProps.classList.add('hidden');
    setPropsHeaderActions(null);

    if (linkCount > 1) {
      if (multiNote) {
        multiNote.classList.remove('hidden');
        multiNote.innerHTML = `<strong>${t('multi.links', { n: linkCount })}</strong><span>${t('multi.links_hint')}</span>`;
      }
      if (el.propsModalTitle) el.propsModalTitle.textContent = t('props.title');
      return;
    }

    if (linkCount === 1 || state.selectedConnId) {
      const c = findConnection(state.selectedConnId || [...state.selectedConnectionIds][0]);
      if (!c) {
        if (el.emptyProps) el.emptyProps.classList.remove('hidden');
        if (el.propsModalTitle) el.propsModalTitle.textContent = t('props.title');
        return;
      }
      const from = findDevice(c.from);
      const to = findDevice(c.to);
      el.linkPropsForm.classList.add('show');
      el.linkType.value = normalizeLinkType(c.link_type);
      updateLinkTypeSwatch(c.link_type);
      el.linkLabel.value = c.label || '';
      el.linkComment.value = c.comment || '';
      el.linkFrom.textContent = from ? `${from.label || from.type} (${from.ip || '-'})` : c.from;
      el.linkTo.textContent = to ? `${to.label || to.type} (${to.ip || '-'})` : c.to;
      if (el.propsModalTitle) el.propsModalTitle.textContent = t('props.title');
      setPropsHeaderActions('link');
      return;
    }

    if (count === 0) {
      if (el.emptyProps) el.emptyProps.classList.remove('hidden');
      if (el.propsModalTitle) el.propsModalTitle.textContent = t('props.title');
      return;
    }

    if (count > 1) {
      if (multiNote) {
        multiNote.classList.remove('hidden');
        multiNote.innerHTML = `<strong>${t('multi.devices', { n: count })}</strong><span>${t('multi.devices_hint')}</span>`;
      }
      if (el.propsModalTitle) el.propsModalTitle.textContent = t('props.title');
      return;
    }

    const d = findDevice(state.selectedId);
    if (!d) {
      if (el.emptyProps) el.emptyProps.classList.remove('hidden');
      if (el.propsModalTitle) el.propsModalTitle.textContent = t('props.title');
      return;
    }
    el.propsForm.classList.add('show');
    el.propLabel.value = d.label || '';
    el.propType.value = d.type || 'client';
    el.propIp.value = d.ip || '';
    el.propComment.value = d.comment || '';
    updateLive(d);
    if (el.propsModalTitle) el.propsModalTitle.textContent = `${t('props.title')} · ${d.label || d.type}`;
    setPropsHeaderActions('device');
  }

  function selectDevice(id, opts = {}) {
    const { additive = false, toggle = false } = opts;
    if (!additive && !toggle) {
      state.selectedConnectionIds.clear();
      state.selectedConnId = null;
    }
    if (!id) {
      clearSelection();
      syncInspector();
      draw();
      return;
    }
    if (toggle) {
      toggleInSelection(id);
    } else if (additive) {
      state.selectedIds.add(id);
      state.selectedId = id;
    } else {
      setSelection([id], id);
    }
    syncInspector();
    draw();
  }

  function selectConnection(id, opts = {}) {
    const { additive = false, toggle = false } = opts;
    if (!additive && !toggle) {
      state.selectedIds.clear();
      state.selectedId = null;
    }
    if (!id) {
      state.selectedConnectionIds.clear();
      state.selectedConnId = null;
      syncInspector();
      draw();
      return;
    }
    if (toggle) {
      toggleInConnectionSelection(id);
    } else if (additive) {
      state.selectedConnectionIds.add(id);
      state.selectedConnId = id;
    } else {
      setConnectionSelection([id], id);
    }
    syncInspector();
    draw();
  }

  function updateLive(d) {
    const st = d.status || 'unknown';
    el.liveStatus.textContent = st === 'unknown' ? '—' : st.toUpperCase();
    el.liveStatus.className = 'status-' + st;
    el.liveLatency.textContent = formatLatencyMs(d.latency) || '—';
    el.liveServices.textContent = (d.services && d.services.length) ? d.services.join(', ') : '—';
    if (el.livePollCount) el.livePollCount.textContent = `${Number(d.poll_count || 0)}×`;
  }

  function deviceTipName(d) {
    if (!d) return '—';
    return String(d.label || typeMeta(d.type).label || d.type || '').trim() || '—';
  }

  // Builds the same live fields shown in Properties (status/latency/service/
  // poll count) for the floating canvas hover tooltip, keyed off the same
  // device fields updateLive() reads so both stay in sync.
  // Head: device type icon (TYPES[].icon → assets/img/devices/*.svg, same as
  // cards/palette) + label + type badge. Status stays green/red text below —
  // device SVGs are full-color (not white glyphs), so use <img>, not CSS mask.
  function hoverTipHtml(d) {
    const meta = typeMeta(d.type);
    const st = d.status || 'unknown';
    const statusClass = 'status-' + st;
    // Inline color matches the device-box status stroke (settings-aware).
    const sc = statusColor(st);
    const statusText = st === 'unknown' ? '—' : st.toUpperCase();
    const latency = formatLatencyMs(d.latency) || '—';
    const services = (d.services && d.services.length) ? d.services.join(', ') : '—';
    const pollCount = `${Number(d.poll_count || 0)}×`;
    const ip = d.ip ? escapeHtml(String(d.ip)) : '—';
    const label = escapeHtml(d.label || meta.label || '');
    const iconUrl = escapeHtml(meta.icon || '');
    return `
      <div class="hover-tip-head">
        <img class="hover-tip-device-icon" src="${iconUrl}" alt="" width="16" height="16" aria-hidden="true" />
        <strong class="hover-tip-label">${label}</strong>
        <span class="hover-tip-type">${escapeHtml(typeLabel(meta.type))}</span>
      </div>
      <div class="hover-tip-row"><span>IP</span><strong>${ip}</strong></div>
      <div class="hover-tip-row"><span>Status</span><strong class="${statusClass}" style="color:${sc}">${statusText}</strong></div>
      <div class="hover-tip-row"><span>Latency</span><strong>${latency}</strong></div>
      <div class="hover-tip-row"><span>Service</span><strong>${escapeHtml(services)}</strong></div>
      <div class="hover-tip-row"><span>Jumlah Ping</span><strong>${pollCount}</strong></div>
    `;
  }

  // Connector (tali) hover tip — type icon + name, Label, from→to, comment (bottom, unlabeled).
  // Icon: same SVG glyph as drawLinkTypeIcon (meta.icon / linkIconCache),
  // tinted with the type color via CSS mask + currentColor (glyphs are white).
  function linkHoverTipHtml(conn) {
    const meta = getLinkTypeMeta(conn.link_type);
    const typeLabel = escapeHtml(linkTypeLabel(conn.link_type));
    const label = String(conn.label || '').trim();
    const comment = String(conn.comment || '').trim();
    const from = findDevice(conn.from);
    const to = findDevice(conn.to);
    const pathText = `${escapeHtml(deviceTipName(from))} → ${escapeHtml(deviceTipName(to))}`;
    const iconUrl = `${meta.icon}?v=${LINK_ICON_VER}`;
    const rows = [
      label ? `<div class="hover-tip-row"><span>Label</span><strong>${escapeHtml(label)}</strong></div>` : '',
      `<div class="hover-tip-row hover-tip-row-wrap hover-tip-row-path"><strong>${pathText}</strong></div>`,
      comment ? `<div class="hover-tip-row hover-tip-row-wrap hover-tip-row-path"><strong>${escapeHtml(comment)}</strong></div>` : '',
    ].filter(Boolean).join('');
    return `
      <div class="hover-tip-head">
        <span class="hover-tip-type-icon" style="color:${meta.color};-webkit-mask-image:url('${iconUrl}');mask-image:url('${iconUrl}')" aria-hidden="true"></span>
        <strong class="hover-tip-label">${typeLabel}</strong>
      </div>
      ${rows}
    `;
  }

  // Anchors the tooltip above (or below) a screen-space rect, clamped in .stage-wrap.
  function positionHoverTipBox(sx, sy, sw, sh) {
    const tip = el.deviceHoverTip;
    if (!tip || !el.stageWrap) return;
    const wrapRect = el.stageWrap.getBoundingClientRect();
    const gap = 10;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    let left = sx + sw / 2 - tw / 2;
    let top = sy - th - gap;
    if (top < 4) top = sy + sh + gap;

    left = Math.max(4, Math.min(left, wrapRect.width - tw - 4));
    top = Math.max(4, Math.min(top, wrapRect.height - th - 4));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function stageOffset() {
    const wrapRect = el.stageWrap.getBoundingClientRect();
    const stageRect = el.stage.getBoundingClientRect();
    return {
      x: stageRect.left - wrapRect.left,
      y: stageRect.top - wrapRect.top,
    };
  }

  // Anchors the tooltip just above (or, if there's no room, below) the
  // hovered device's on-screen box, clamped inside .stage-wrap.
  function positionHoverTip(d) {
    if (!el.deviceHoverTip || !el.stageWrap) return;
    const off = stageOffset();
    const sx = d.x * state.scale + state.pan.x + off.x;
    const sy = d.y * state.scale + state.pan.y + off.y;
    positionHoverTipBox(sx, sy, deviceW(d) * state.scale, deviceH(d) * state.scale);
  }

  // Anchors the tooltip near the midpoint of a connection curve.
  function positionLinkHoverTip(conn) {
    if (!el.deviceHoverTip || !el.stageWrap) return;
    const from = findDevice(conn.from);
    const to = findDevice(conn.to);
    if (!from || !to) return;
    const { a, b, c1, c2 } = connectionPath(from, to);
    const mx = cubic(a.x, c1.x, c2.x, b.x, 0.5);
    const my = cubic(a.y, c1.y, c2.y, b.y, 0.5);
    const off = stageOffset();
    const sx = mx * state.scale + state.pan.x + off.x;
    const sy = my * state.scale + state.pan.y + off.y;
    // Treat the midpoint as a small anchor so the tip sits above the rope.
    positionHoverTipBox(sx - 8, sy - 8, 16, 16);
  }

  // Shows/refreshes the canvas hover tooltip for a device or tali konektor;
  // hidden while dragging/linking/rewiring, during marquee/panning, or while
  // a context menu / modal covers the stage. Device hover wins over link.
  function updateHoverTip() {
    const tip = el.deviceHoverTip;
    if (!tip) return;
    const blocked = state.panning || state.marquee || state.rewiring || state.linking || state.dragging
      || !el.ctxMenu.classList.contains('hidden')
      || document.querySelector('.modal:not(.hidden)');
    if (blocked) {
      tip.classList.remove('show');
      return;
    }
    const d = findDevice(state.hoverId);
    if (d) {
      tip.innerHTML = hoverTipHtml(d);
      tip.classList.add('show');
      positionHoverTip(d);
      return;
    }
    const conn = findConnection(state.hoverConnId);
    if (conn) {
      tip.innerHTML = linkHoverTipHtml(conn);
      tip.classList.add('show');
      positionLinkHoverTip(conn);
      return;
    }
    tip.classList.remove('show');
  }

  async function persistDevice(partial) {
    const data = await api('upsert_device', partial);
    state.devices = data.devices;
    pushHistory();
    if (data.device) selectDevice(data.device.id);
    else draw();
    return data.device;
  }

  function gridSize() {
    return Math.min(64, Math.max(8, Number(state.settings.grid_size || 24)));
  }

  function snapValue(v, g = gridSize()) {
    return Math.round(v / g) * g;
  }

  function selectedDevicesList() {
    const ids = state.selectedIds.size ? [...state.selectedIds] : [];
    return ids.map((id) => findDevice(id)).filter(Boolean);
  }

  async function commitArrange(devices, label) {
    if (!devices.length) return;
    draw();
    try {
      await saveLayout();
      toast(label);
    } catch (e) {
      toast(e.message);
    }
  }

  async function arrangeAction(act) {
    const selected = selectedDevicesList();
    const g = gridSize();
    const gap = g * 2;

    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }

    const need2 = ['align-left', 'align-right', 'align-top', 'align-bottom', 'align-hcenter', 'align-vcenter'];
    const need3 = ['dist-h', 'dist-v'];
    if (need2.includes(act) && selected.length < 2) {
      toast(t('toast.min_2'));
      return;
    }
    if (need3.includes(act) && selected.length < 3) {
      toast(t('toast.min_3_dist'));
      return;
    }
    if ((act === 'pack-h' || act === 'pack-v') && selected.length < 2) {
      toast(t('toast.min_2'));
      return;
    }

    // All arrange ops align the visual tile / link-anchor box (deviceAnchorBox),
    // then convert back to stored d.x/d.y via setDeviceAnchorPos.
    if (act === 'align-left') {
      const x = Math.min(...selected.map((d) => deviceAnchorBox(d).x));
      selected.forEach((d) => setDeviceAnchorPos(d, x, null));
      await commitArrange(selected, 'Rata kiri');
      return;
    }
    if (act === 'align-right') {
      const right = Math.max(...selected.map((d) => {
        const b = deviceAnchorBox(d);
        return b.x + b.w;
      }));
      selected.forEach((d) => {
        const b = deviceAnchorBox(d);
        setDeviceAnchorPos(d, right - b.w, null);
      });
      await commitArrange(selected, 'Rata kanan');
      return;
    }
    if (act === 'align-top') {
      const y = Math.min(...selected.map((d) => deviceAnchorBox(d).y));
      selected.forEach((d) => setDeviceAnchorPos(d, null, y));
      await commitArrange(selected, 'Rata atas');
      return;
    }
    if (act === 'align-bottom') {
      const bottom = Math.max(...selected.map((d) => {
        const b = deviceAnchorBox(d);
        return b.y + b.h;
      }));
      selected.forEach((d) => {
        const b = deviceAnchorBox(d);
        setDeviceAnchorPos(d, null, bottom - b.h);
      });
      await commitArrange(selected, 'Rata bawah');
      return;
    }
    if (act === 'align-hcenter') {
      const mid = selected.reduce((s, d) => {
        const b = deviceAnchorBox(d);
        return s + b.x + b.w / 2;
      }, 0) / selected.length;
      selected.forEach((d) => {
        const b = deviceAnchorBox(d);
        setDeviceAnchorPos(d, mid - b.w / 2, null);
      });
      await commitArrange(selected, 'Tengah horizontal');
      return;
    }
    if (act === 'align-vcenter') {
      const mid = selected.reduce((s, d) => {
        const b = deviceAnchorBox(d);
        return s + b.y + b.h / 2;
      }, 0) / selected.length;
      selected.forEach((d) => {
        const b = deviceAnchorBox(d);
        setDeviceAnchorPos(d, null, mid - b.h / 2);
      });
      await commitArrange(selected, 'Tengah vertikal');
      return;
    }
    if (act === 'dist-h') {
      const sorted = [...selected].sort((a, b) => deviceAnchorBox(a).x - deviceAnchorBox(b).x);
      const boxes = sorted.map((d) => deviceAnchorBox(d));
      const firstLeft = boxes[0].x;
      const lastRight = boxes[boxes.length - 1].x + boxes[boxes.length - 1].w;
      const totalW = boxes.reduce((s, b) => s + b.w, 0);
      const gapSpace = (lastRight - firstLeft - totalW) / (sorted.length - 1);
      let x = firstLeft;
      sorted.forEach((d, i) => {
        setDeviceAnchorPos(d, x, null);
        x += boxes[i].w + gapSpace;
      });
      await commitArrange(selected, 'Jarak sama horizontal');
      return;
    }
    if (act === 'dist-v') {
      const sorted = [...selected].sort((a, b) => deviceAnchorBox(a).y - deviceAnchorBox(b).y);
      const boxes = sorted.map((d) => deviceAnchorBox(d));
      const firstTop = boxes[0].y;
      const lastBottom = boxes[boxes.length - 1].y + boxes[boxes.length - 1].h;
      const totalH = boxes.reduce((s, b) => s + b.h, 0);
      const gapSpace = (lastBottom - firstTop - totalH) / (sorted.length - 1);
      let y = firstTop;
      sorted.forEach((d, i) => {
        setDeviceAnchorPos(d, null, y);
        y += boxes[i].h + gapSpace;
      });
      await commitArrange(selected, 'Jarak sama vertikal');
      return;
    }
    if (act === 'pack-h') {
      // Spacing follows full visual bounds (Tampilan Komponen), but the shared
      // row uses anchor/tile Y so rata kiri/kanan/tengah tetap konsisten.
      const sorted = [...selected].sort((a, b) => {
        const ba = deviceBounds(a);
        const bb = deviceBounds(b);
        return ba.x - bb.x || ba.y - bb.y;
      });
      let fullX = deviceBounds(sorted[0]).x;
      const anchorY = sorted.reduce((s, d) => s + deviceAnchorBox(d).y, 0) / sorted.length;
      sorted.forEach((d) => {
        const full = deviceBounds(d);
        const anchor = deviceAnchorBox(d);
        const anchorX = fullX + (anchor.x - full.x);
        setDeviceAnchorPos(d, anchorX, anchorY);
        fullX += deviceBounds(d).w + gap;
      });
      await commitArrange(selected, 'Susun baris');
      return;
    }
    if (act === 'pack-v') {
      const sorted = [...selected].sort((a, b) => {
        const ba = deviceBounds(a);
        const bb = deviceBounds(b);
        return ba.y - bb.y || ba.x - bb.x;
      });
      const anchorX = sorted.reduce((s, d) => s + deviceAnchorBox(d).x, 0) / sorted.length;
      let fullY = deviceBounds(sorted[0]).y;
      sorted.forEach((d) => {
        const full = deviceBounds(d);
        const anchor = deviceAnchorBox(d);
        const anchorY = fullY + (anchor.y - full.y);
        setDeviceAnchorPos(d, anchorX, anchorY);
        fullY += deviceBounds(d).h + gap;
      });
      await commitArrange(selected, 'Susun kolom');
    }
  }

  async function changeSelectedType(type) {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const meta = typeMeta(type);
    const selected = selectedDevicesList();
    if (!selected.length) return;
    const ids = new Set(selected.map((d) => d.id));
    const nextDevices = state.devices.map((d) => (ids.has(d.id) ? { ...d, type: meta.type } : d));
    try {
      const data = await api('replace_topology', {
        devices: nextDevices,
        connections: state.connections,
      });
      state.devices = data.devices;
      state.connections = data.connections;
      pushHistory();
      syncInspector();
      draw();
      toast(t('toast.type_changed', { n: selected.length, label: typeLabel(meta.type) }));
    } catch (e) {
      toast(e.message);
    }
  }

  function snapScreenLineCoord(screenCss, lineWidthCss = 1) {
    const dpr = stageDpr();
    if (lineWidthCss <= 1) return (Math.round(screenCss * dpr) + 0.5) / dpr;
    return Math.round(screenCss * dpr) / dpr;
  }

  function snapWorldAxis(world, axis, lineWidthCss = 1) {
    const screen = axis === 'x'
      ? world * state.scale + state.pan.x
      : world * state.scale + state.pan.y;
    const snapped = snapScreenLineCoord(screen, lineWidthCss);
    return axis === 'x'
      ? (snapped - state.pan.x) / state.scale
      : (snapped - state.pan.y) / state.scale;
  }

  function drawWorldGrid() {
    if (!state.settings.show_grid) return;
    const g = gridSize();
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(stageCssW, stageCssH);
    const x0 = Math.floor(tl.x / g) * g;
    const y0 = Math.floor(tl.y / g) * g;
    const x1 = Math.ceil(br.x / g) * g;
    const y1 = Math.ceil(br.y / g) * g;
    const minorW = 1 / state.scale;
    const majorW = 2 / state.scale;

    ctx.save();
    ctx.lineCap = 'butt';

    ctx.beginPath();
    for (let x = x0, i = Math.round(x0 / g); x <= x1 + 0.001; x += g, i += 1) {
      if (i % 4 === 0) continue;
      const sx = snapWorldAxis(x, 'x', 1);
      ctx.moveTo(sx, y0);
      ctx.lineTo(sx, y1);
    }
    for (let y = y0, j = Math.round(y0 / g); y <= y1 + 0.001; y += g, j += 1) {
      if (j % 4 === 0) continue;
      const sy = snapWorldAxis(y, 'y', 1);
      ctx.moveTo(x0, sy);
      ctx.lineTo(x1, sy);
    }
    ctx.strokeStyle = 'rgba(26,106,255,.08)';
    ctx.lineWidth = minorW;
    ctx.stroke();

    ctx.beginPath();
    for (let x = x0, i = Math.round(x0 / g); x <= x1 + 0.001; x += g, i += 1) {
      if (i % 4 !== 0) continue;
      const sx = snapWorldAxis(x, 'x', 2);
      ctx.moveTo(sx, y0);
      ctx.lineTo(sx, y1);
    }
    for (let y = y0, j = Math.round(y0 / g); y <= y1 + 0.001; y += g, j += 1) {
      if (j % 4 !== 0) continue;
      const sy = snapWorldAxis(y, 'y', 2);
      ctx.moveTo(x0, sy);
      ctx.lineTo(x1, sy);
    }
    ctx.strokeStyle = 'rgba(26,106,255,.16)';
    ctx.lineWidth = majorW;
    ctx.stroke();
    ctx.restore();
  }

  async function saveLayout() {
    // Invalidate in-flight poll so stale bootstrap/poll payloads cannot clobber
    // freshly moved positions (drag + Rapikan) before the write lands.
    state.pollToken += 1;
    await api('save_layout', {
      devices: state.devices.map((d) => ({ id: d.id, x: d.x, y: d.y })),
      connections: state.connections,
    });
    pushHistory();
  }

  async function addDeviceAt(type, wx, wy) {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const meta = typeMeta(type);
    const label = typeLabel(meta.type);
    const stub = { type, label, ip: '', status: 'unknown', latency: null, services: [], comment: '' };
    const device = {
      id: uid(),
      type,
      label,
      ip: '',
      comment: '',
      x: wx - deviceW(stub) / 2,
      y: wy - deviceH(stub) / 2,
      services: [],
      status: 'unknown',
      latency: null,
    };
    await persistDevice(device);
    toast(t('toast.added', { label }));
  }

  function importExcelErrorToast(err) {
    const code = err && err.code;
    if (code === 'HEADER') return toast(t('toast.import_header'));
    if (code === 'SHEET' || code === 'ZIP') return toast(t('toast.import_sheet'));
    if (code === 'XLS') return toast(t('toast.import_xls'));
    if (code === 'INFLATE') return toast(t('toast.import_fail', { err: 'deflate' }));
    toast(t('toast.import_fail', { err: (err && err.message) || String(err) }));
  }

  async function importDevicesFromExcelFile(file) {
    if (!file) return;
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const excel = window.PamantauExcel;
    if (!excel || typeof excel.parseFile !== 'function') {
      toast(t('toast.import_fail', { err: 'parser missing' }));
      return;
    }

    busy(true, t('quick.importing'));
    try {
      const table = await excel.parseFile(file);
      const mapped = excel.mapDeviceRows(table);
      const items = mapped.items || [];
      const skipped = Number(mapped.skipped || 0);

      if (!items.length) {
        toast(t('toast.import_none', { m: skipped }));
        return;
      }

      const rect = el.stage.getBoundingClientRect();
      const center = screenToWorld(rect.width / 2, rect.height / 2);
      const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)));
      const rows = Math.ceil(items.length / cols);
      const g = gridSize();
      const gapX = Math.max(180, g * 8);
      const gapY = Math.max(120, g * 5);
      const startX = center.x - ((cols - 1) * gapX) / 2;
      const startY = center.y - ((rows - 1) * gapY) / 2;

      const newDevices = items.map((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const meta = typeMeta(item.type);
        const label = String(item.label || '').trim() || meta.label;
        return {
          id: uid(),
          type: meta.type,
          label,
          ip: String(item.ip || '').trim(),
          subnet: '',
          comment: String(item.comment || '').trim(),
          x: startX + col * gapX,
          y: startY + row * gapY,
          services: [],
          status: 'unknown',
          latency: null,
        };
      });

      const data = await api('replace_topology', {
        devices: [...state.devices, ...newDevices],
        connections: state.connections,
      });
      state.devices = data.devices;
      state.connections = data.connections;
      pushHistory();
      clearSelection();
      if (newDevices.length === 1) selectDevice(newDevices[0].id);
      else draw();
      toast(t('toast.import_done', { n: newDevices.length, m: skipped }));
    } catch (err) {
      importExcelErrorToast(err);
    } finally {
      busy(false);
    }
  }

  function suggestedDevicesXlsxName() {
    const base = sanitizeProjectFileBase(projectDisplayName());
    if (!base || base.toLowerCase() === 'untitled') return 'pamantau-devices.xlsx';
    return `${base}-devices.xlsx`;
  }

  function exportDevicesToExcel() {
    const excel = window.PamantauExcel;
    if (!excel || typeof excel.buildDevicesXlsx !== 'function') {
      toast(t('toast.import_fail', { err: 'exporter missing' }));
      return;
    }
    if (!state.devices.length) {
      toast(t('toast.export_none'));
      return;
    }
    try {
      const blob = excel.buildDevicesXlsx(state.devices);
      downloadBlob(blob, suggestedDevicesXlsxName());
      toast(t('toast.export_devices_done', { n: state.devices.length }));
    } catch (err) {
      toast(t('toast.import_fail', { err: (err && err.message) || String(err) }));
    }
  }

  function downloadExcelTemplate() {
    const excel = window.PamantauExcel;
    if (!excel || typeof excel.buildTemplateXlsx !== 'function') {
      toast(t('toast.import_fail', { err: 'exporter missing' }));
      return;
    }
    try {
      const blob = excel.buildTemplateXlsx();
      downloadBlob(blob, 'pamantau-devices-template.xlsx');
      toast(t('toast.template_done'));
    } catch (err) {
      toast(t('toast.import_fail', { err: (err && err.message) || String(err) }));
    }
  }

  function hideCtx() {
    el.ctxMenu.classList.add('hidden');
    state.ctxTarget = null;
    state.ctxLinkId = null;
    state.ctxPasteAt = null;
    closeCtxSubmenus();
  }

  let editCtxField = null;

  function hideEditCtx() {
    if (el.editCtxMenu) el.editCtxMenu.classList.add('hidden');
    editCtxField = null;
  }

  function scanResultStatusLabel(row) {
    return row && row.exists ? t('scan.status_existing') : t('scan.status_new');
  }

  function fieldSelectedText(field) {
    if (!field) return '';
    if (field.tagName === 'SELECT') return field.value || '';
    if (typeof field.selectionStart === 'number' && typeof field.selectionEnd === 'number') {
      return String(field.value || '').slice(field.selectionStart, field.selectionEnd);
    }
    if (field.isContentEditable) return String(window.getSelection() || '');
    return String(field.value || '');
  }

  function replaceFieldSelection(field, text) {
    if (!field || field.disabled || field.readOnly) return;
    if (field.tagName === 'SELECT') {
      field.value = text;
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (typeof field.selectionStart === 'number' && typeof field.selectionEnd === 'number') {
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const v = String(field.value || '');
      field.value = v.slice(0, start) + text + v.slice(end);
      const caret = start + String(text).length;
      try { field.setSelectionRange(caret, caret); } catch (_) { /* ignore */ }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (field.isContentEditable) {
      document.execCommand('insertText', false, text);
    }
  }

  function selectAllInField(field) {
    if (!field || field.disabled) return;
    field.focus();
    if (field.tagName === 'SELECT') return;
    if (typeof field.setSelectionRange === 'function') {
      const len = String(field.value || '').length;
      try { field.setSelectionRange(0, len); } catch (_) { /* ignore */ }
      return;
    }
    if (field.isContentEditable) document.execCommand('selectAll');
  }

  async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  async function readTextFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
    return '';
  }

  function showEditCtx(clientX, clientY, field) {
    if (!el.editCtxMenu || !field) return;
    hideCtx();
    editCtxField = field;
    try { field.focus({ preventScroll: true }); } catch (_) { field.focus(); }

    const locked = !!(field.disabled || field.readOnly);
    const isSelect = field.tagName === 'SELECT';
    const hasSel = fieldSelectedText(field).length > 0;
    const hasValue = String(field.value || '').length > 0;
    const cutBtn = el.editCtxMenu.querySelector('[data-edit="cut"]');
    const copyBtn = el.editCtxMenu.querySelector('[data-edit="copy"]');
    const pasteBtn = el.editCtxMenu.querySelector('[data-edit="paste"]');
    const allBtn = el.editCtxMenu.querySelector('[data-edit="select-all"]');
    if (cutBtn) cutBtn.disabled = locked || isSelect || !hasSel;
    if (copyBtn) copyBtn.disabled = !(hasSel || hasValue);
    if (pasteBtn) pasteBtn.disabled = locked || isSelect;
    if (allBtn) allBtn.disabled = isSelect;

    el.editCtxMenu.classList.remove('hidden');
    el.editCtxMenu.style.left = '-9999px';
    el.editCtxMenu.style.top = '0px';
    const mw = el.editCtxMenu.offsetWidth || 180;
    const mh = el.editCtxMenu.offsetHeight || 160;
    const pos = clampCtxMenuPosition(clientX, clientY, mw, mh);
    el.editCtxMenu.style.left = `${pos.left}px`;
    el.editCtxMenu.style.top = `${pos.top}px`;
  }

  async function runEditCtxAction(act) {
    const field = editCtxField;
    hideEditCtx();
    if (!field || !act) return;
    try { field.focus({ preventScroll: true }); } catch (_) { field.focus(); }

    if (act === 'select-all') {
      selectAllInField(field);
      return;
    }
    if (act === 'copy') {
      let text = fieldSelectedText(field);
      if (!text) text = String(field.value || '');
      if (!text) return;
      try { await copyTextToClipboard(text); } catch (_) { toast(t('toast.copy_fail')); }
      return;
    }
    if (act === 'cut') {
      if (field.disabled || field.readOnly || field.tagName === 'SELECT') return;
      const text = fieldSelectedText(field);
      if (!text) return;
      try {
        await copyTextToClipboard(text);
        replaceFieldSelection(field, '');
      } catch (_) {
        toast(t('toast.cut_fail'));
      }
      return;
    }
    if (act === 'paste') {
      if (field.disabled || field.readOnly || field.tagName === 'SELECT') return;
      try {
        const text = await readTextFromClipboard();
        replaceFieldSelection(field, text);
      } catch (_) {
        toast(t('toast.clipboard_denied'));
      }
    }
  }

  function clearLongPress() {
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
    state.longPressOrigin = null;
  }

  function armLongPress(e, onFire) {
    clearLongPress();
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    state.longPressOrigin = { x: e.clientX, y: e.clientY };
    state.longPressTimer = setTimeout(() => {
      state.longPressTimer = null;
      state.longPressOrigin = null;
      state.dragging = null;
      state.dragOrigins = null;
      state.marquee = null;
      state.panning = false;
      state.panStart = null;
      try { el.stage.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      onFire();
      draw();
    }, 520);
  }

  function closeCtxSubmenu(wrap, trigger) {
    if (!wrap) return;
    wrap.classList.remove('open', 'fly-left', 'fly-up');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function closeCtxArrange() {
    closeCtxSubmenu(el.ctxArrangeWrap, el.ctxArrangeTrigger);
  }

  function closeCtxType() {
    closeCtxSubmenu(el.ctxTypeWrap, el.ctxTypeTrigger);
  }

  function closeCtxLinkType() {
    closeCtxSubmenu(el.ctxLinkTypeWrap, el.ctxLinkTypeTrigger);
  }

  function closeCtxOpen() {
    closeCtxSubmenu(el.ctxOpenWrap, el.ctxOpenTrigger);
  }

  function closeCtxSubmenus() {
    closeCtxOpen();
    closeCtxType();
    closeCtxArrange();
    closeCtxLinkType();
  }

  function measureCtxSubmenuHeight(submenu) {
    if (!submenu) return 320;
    if (submenu.offsetHeight > 8) return submenu.offsetHeight;

    // Measure without leaving inline styles that would fight CSS hover/open rules.
    const probe = submenu.cloneNode(true);
    probe.style.cssText = [
      'position:absolute',
      'left:-99999px',
      'top:0',
      'display:flex',
      'visibility:hidden',
      'pointer-events:none',
      'z-index:-1',
    ].join(';');
    document.body.appendChild(probe);
    const height = probe.offsetHeight || 320;
    probe.remove();
    return height;
  }

  function positionCtxSubmenu(wrap) {
    if (!wrap || !el.ctxMenu) return;
    wrap.classList.remove('fly-left', 'fly-up');
    const submenu = wrap.querySelector('.ctx-submenu');
    const trigger = wrap.querySelector('.ctx-submenu-trigger');
    if (!submenu || !trigger) return;

    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuRect = el.ctxMenu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const subW = Math.max(submenu.offsetWidth || 248, 248);
    const subH = measureCtxSubmenuHeight(submenu);

    if (menuRect.right + subW > vw - pad) {
      wrap.classList.add('fly-left');
    }

    // Default submenu anchors near the trigger top; flip up when it would clip.
    const projectedBottom = triggerRect.top - 6 + subH;
    if (projectedBottom > vh - pad) {
      wrap.classList.add('fly-up');
    }
  }

  function positionCtxOpen() {
    positionCtxSubmenu(el.ctxOpenWrap);
  }

  function positionCtxArrange() {
    positionCtxSubmenu(el.ctxArrangeWrap);
  }

  function positionCtxType() {
    positionCtxSubmenu(el.ctxTypeWrap);
  }

  function positionCtxLinkType() {
    positionCtxSubmenu(el.ctxLinkTypeWrap);
  }

  function clampCtxMenuPosition(x, y, mw, mh) {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;

    // Prefer flipping above the cursor when there is not enough room below.
    if (y + mh + pad > vh && y - mh >= pad) {
      top = y - mh;
    }

    left = Math.min(Math.max(pad, left), Math.max(pad, vw - mw - pad));
    top = Math.min(Math.max(pad, top), Math.max(pad, vh - mh - pad));
    return { left, top };
  }

  function placeCtx(x, y) {
    hideEditCtx();
    el.ctxMenu.classList.remove('hidden');
    // Park off-screen briefly so we can measure real size before clamping.
    el.ctxMenu.style.left = '-9999px';
    el.ctxMenu.style.top = '0px';

    const mw = el.ctxMenu.offsetWidth || 220;
    const mh = el.ctxMenu.offsetHeight || 240;
    const pos = clampCtxMenuPosition(x, y, mw, mh);
    el.ctxMenu.style.left = `${pos.left}px`;
    el.ctxMenu.style.top = `${pos.top}px`;

    positionCtxOpen();
    positionCtxType();
    positionCtxArrange();
    positionCtxLinkType();

    // Second pass after layout (multi-select / submenu labels can change height).
    requestAnimationFrame(() => {
      if (!el.ctxMenu || el.ctxMenu.classList.contains('hidden')) return;
      const rect = el.ctxMenu.getBoundingClientRect();
      const next = clampCtxMenuPosition(
        x,
        y,
        rect.width || mw,
        rect.height || mh,
      );
      // If cursor-based clamp still overflows (rare), pin to viewport edges.
      const pad = 8;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      let left = next.left;
      let top = next.top;
      if (top + rect.height > vh - pad) top = Math.max(pad, vh - rect.height - pad);
      if (left + rect.width > vw - pad) left = Math.max(pad, vw - rect.width - pad);
      el.ctxMenu.style.left = `${left}px`;
      el.ctxMenu.style.top = `${top}px`;
      positionCtxOpen();
      positionCtxType();
      positionCtxArrange();
      positionCtxLinkType();
    });
  }

  function updateCtxDeviceMode() {
    const count = state.selectedIds.size;
    const isMulti = count > 1;
    if (el.ctxSingleOnly) el.ctxSingleOnly.classList.toggle('hidden', isMulti);
    if (el.ctxSingleOnlyProps) el.ctxSingleOnlyProps.classList.toggle('hidden', isMulti);
    if (el.ctxArrangeWrap) el.ctxArrangeWrap.classList.toggle('hidden', count < 2);
    if (el.ctxTypeWrap) el.ctxTypeWrap.classList.toggle('hidden', count < 2);
    if (el.ctxSelectionInfo) {
      if (isMulti) {
        el.ctxSelectionInfo.textContent = t('ctx.n_devices', { n: count });
        el.ctxSelectionInfo.classList.remove('hidden');
      } else {
        el.ctxSelectionInfo.classList.add('hidden');
      }
    }
  }

  function updateCtxLinkMode() {
    const count = state.selectedConnectionIds.size;
    const isMulti = count > 1;
    if (el.ctxLinkEditBtn) el.ctxLinkEditBtn.classList.toggle('hidden', isMulti);
    if (el.ctxLinkSelectionInfo) {
      if (isMulti) {
        el.ctxLinkSelectionInfo.textContent = t('ctx.n_links', { n: count });
        el.ctxLinkSelectionInfo.classList.remove('hidden');
      } else {
        el.ctxLinkSelectionInfo.classList.add('hidden');
      }
    }
  }

  function showCtx(x, y, device) {
    state.ctxTarget = device.id;
    state.ctxLinkId = null;
    state.ctxPasteAt = null;
    el.ctxDeviceItems.classList.remove('hidden');
    if (el.ctxEmptyItems) el.ctxEmptyItems.classList.add('hidden');
    el.ctxLinkItems.classList.add('hidden');
    closeCtxSubmenus();
    populateCtxOpenMenu(device);
    updateCtxDeviceMode();
    placeCtx(x, y);
  }

  function showEmptyCtx(x, y, wx, wy) {
    state.ctxTarget = null;
    state.ctxLinkId = null;
    state.ctxPasteAt = { x: wx, y: wy };
    el.ctxDeviceItems.classList.add('hidden');
    el.ctxLinkItems.classList.add('hidden');
    if (el.ctxEmptyItems) el.ctxEmptyItems.classList.remove('hidden');
    closeCtxSubmenus();
    updateHistoryButtons();
    syncPasteMenuState();
    placeCtx(x, y);
  }

  function showLinkCtx(x, y, conn) {
    state.ctxTarget = null;
    state.ctxLinkId = conn.id;
    state.ctxPasteAt = null;
    el.ctxDeviceItems.classList.add('hidden');
    if (el.ctxEmptyItems) el.ctxEmptyItems.classList.add('hidden');
    el.ctxLinkItems.classList.remove('hidden');
    closeCtxSubmenus();
    updateCtxLinkMode();
    placeCtx(x, y);
  }

  function hasDeviceClipboard() {
    return !!(state.deviceClipboard && state.deviceClipboard.devices && state.deviceClipboard.devices.length);
  }

  function syncPasteMenuState() {
    if (!el.ctxPasteBtn) return;
    const ok = hasDeviceClipboard();
    el.ctxPasteBtn.classList.toggle('hidden', !ok);
    el.ctxPasteBtn.disabled = !ok;
    el.ctxPasteBtn.title = t(ok ? 'ctx.paste_ready_title' : 'ctx.paste_empty_title');
    el.ctxPasteBtn.classList.toggle('disabled', !ok);
  }

  function devicesForClipboard() {
    let ids = state.selectedIds.size ? [...state.selectedIds] : [];
    if (!ids.length && state.ctxTarget) ids = [state.ctxTarget];
    if (!ids.length && state.selectedId) ids = [state.selectedId];
    return ids.map((id) => findDevice(id)).filter(Boolean);
  }

  function buildDeviceClipboard(devices) {
    const idSet = new Set(devices.map((d) => d.id));
    const connections = state.connections.filter(
      (c) => idSet.has(c.from) && idSet.has(c.to)
    );
    return {
      v: 1,
      devices: devices.map((d) => ({
        id: d.id,
        type: d.type,
        label: d.label || '',
        ip: d.ip || '',
        subnet: d.subnet || '',
        comment: d.comment || '',
        x: Number(d.x) || 0,
        y: Number(d.y) || 0,
        services: Array.isArray(d.services) ? d.services.map(Number) : [],
      })),
      connections: connections.map((c) => ({
        from: c.from,
        to: c.to,
        label: c.label || '',
        comment: c.comment || '',
        link_type: normalizeLinkType(c.link_type),
      })),
    };
  }

  async function copySelectedDevices() {
    const devices = devicesForClipboard();
    if (!devices.length) {
      toast(t('toast.select_device'));
      return false;
    }
    state.deviceClipboard = buildDeviceClipboard(devices);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(JSON.stringify({
          pamantauClipboard: 1,
          ...state.deviceClipboard,
        }));
      }
    } catch (_) { /* ignore system clipboard failures */ }
    toast(t('toast.devices_copied', { n: devices.length }));
    return true;
  }

  function parseClipboardPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.pamantauClipboard !== 1 && raw.v !== 1) return null;
    const devices = Array.isArray(raw.devices) ? raw.devices : [];
    if (!devices.length) return null;
    return {
      v: 1,
      devices,
      connections: Array.isArray(raw.connections) ? raw.connections : [],
    };
  }

  async function ensureDeviceClipboard() {
    if (hasDeviceClipboard()) return state.deviceClipboard;
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const parsed = parseClipboardPayload(JSON.parse(text));
        if (parsed) {
          state.deviceClipboard = parsed;
          return parsed;
        }
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  async function pasteDevicesAt(wx, wy) {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const clip = await ensureDeviceClipboard();
    if (!clip || !clip.devices.length) {
      toast(t('toast.clipboard_empty'));
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    clip.devices.forEach((d) => {
      minX = Math.min(minX, Number(d.x) || 0);
      minY = Math.min(minY, Number(d.y) || 0);
    });
    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(minY)) minY = 0;

    const anchorX = Number.isFinite(wx) ? wx : minX + 32;
    const anchorY = Number.isFinite(wy) ? wy : minY + 32;
    const offsetX = anchorX - minX;
    const offsetY = anchorY - minY;
    const g = gridSize();
    const snap = !!state.settings.snap_drag;

    const idMap = {};
    const newDevices = clip.devices.map((d) => {
      const oldId = String(d.id || '');
      const newId = uid();
      if (oldId) idMap[oldId] = newId;
      let x = (Number(d.x) || 0) + offsetX;
      let y = (Number(d.y) || 0) + offsetY;
      if (snap) {
        x = snapValue(x, g);
        y = snapValue(y, g);
      }
      const type = String(d.type || 'client').toLowerCase();
      return {
        id: newId,
        type: TYPES.some((t) => t.type === type) ? type : 'client',
        label: String(d.label || typeMeta(type).label),
        ip: String(d.ip || ''),
        subnet: String(d.subnet || ''),
        comment: String(d.comment || ''),
        x,
        y,
        services: Array.isArray(d.services) ? d.services.map(Number).filter((n) => Number.isFinite(n)) : [],
        status: 'unknown',
        latency: null,
        poll_count: 0,
      };
    });

    const newConnections = (clip.connections || [])
      .filter((c) => idMap[c.from] && idMap[c.to] && idMap[c.from] !== idMap[c.to])
      .map((c) => ({
        id: uid(),
        from: idMap[c.from],
        to: idMap[c.to],
        label: String(c.label || ''),
        comment: String(c.comment || ''),
        link_type: normalizeLinkType(c.link_type),
      }));

    try {
      state.devices = [...state.devices, ...newDevices];
      state.connections = normalizeConnections([...state.connections, ...newConnections]);
      await persistTopologyToServer();
      pushHistory();
      setSelection(newDevices.map((d) => d.id));
      syncInspector();
      draw();
      toast(t('toast.devices_pasted', { n: newDevices.length }));
    } catch (e) {
      toast(e.message || t('toast.paste_fail'));
    }
  }

  async function deleteConnection(id) {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const ids = id
      ? [id]
      : (state.selectedConnectionIds.size ? [...state.selectedConnectionIds] : (state.selectedConnId ? [state.selectedConnId] : []));
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: t('confirm.delete_links'),
      message: ids.length > 1 ? t('confirm.delete_links_n', { n: ids.length }) : t('confirm.delete_link_one'),
      confirmLabel: t('confirm.delete'),
    });
    if (!ok) return;
    state.pollToken += 1;
    try {
      let last = null;
      for (const connId of ids) {
        last = await api('delete_connection', { id: connId });
      }
      if (last) state.connections = last.connections;
      for (const connId of ids) {
        state.selectedConnectionIds.delete(connId);
        if (state.selectedConnId === connId) state.selectedConnId = null;
      }
      if (!state.selectedConnId && state.selectedConnectionIds.size) {
        state.selectedConnId = [...state.selectedConnectionIds][0];
      }
      pushHistory();
      syncInspector();
      draw();
      toast(ids.length > 1 ? t('toast.links_deleted', { n: ids.length }) : t('toast.link_deleted'));
      closePropsModal();
    } catch (e) {
      toast(e.message);
    }
  }

  async function changeSelectedLinkType(linkType) {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const type = normalizeLinkType(linkType);
    const label = linkTypeLabel(type);
    const ids = state.selectedConnectionIds.size
      ? [...state.selectedConnectionIds]
      : (state.selectedConnId ? [state.selectedConnId] : []);
    if (!ids.length) return;
    try {
      let last = null;
      for (const id of ids) {
        const c = findConnection(id);
        if (!c) continue;
        last = await api('upsert_connection', {
          id: c.id,
          from: c.from,
          to: c.to,
          label: c.label || '',
          comment: c.comment || '',
          link_type: type,
        });
        if (last && Array.isArray(last.connections)) {
          state.connections = last.connections;
        }
      }
      pushHistory();
      syncInspector();
      draw();
      toast(t('toast.link_type_changed', { n: ids.length, label }));
    } catch (e) {
      toast(e.message);
    }
  }

  async function deleteSelectedCanvasItems() {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const deviceIds = [...state.selectedIds];
    const connIds = [...state.selectedConnectionIds];
    if (!deviceIds.length && !connIds.length) return;

    if (deviceIds.length && !connIds.length) {
      await deleteDevice(null);
      return;
    }
    if (connIds.length && !deviceIds.length) {
      await deleteConnection(null);
      return;
    }

    const ok = await confirmDialog({
      title: t('confirm.delete_selection'),
      message: t('confirm.delete_selection_mix', { devices: deviceIds.length, links: connIds.length }),
      confirmLabel: t('confirm.delete'),
    });
    if (!ok) return;

    state.pollToken += 1;
    try {
      const data = await api('delete_device', { ids: deviceIds });
      state.devices = data.devices;
      state.connections = data.connections;

      const remaining = connIds.filter((id) => findConnection(id));
      let last = null;
      for (const connId of remaining) {
        last = await api('delete_connection', { id: connId });
      }
      if (last) state.connections = last.connections;

      clearSelection();
      syncInspector();
      pushHistory();
      draw();
      toast(t('toast.selection_deleted'));
      closePropsModal();
    } catch (e) {
      toast(e.message);
    }
  }

  function ipv4ToLong(ip) {
    const parts = String(ip || '').trim().split('.');
    if (parts.length !== 4) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
  }

  function longToIpv4(long) {
    return [24, 16, 8, 0].map((shift) => (long >>> shift) & 255).join('.');
  }

  function networkBaseForPrefix(ip, prefix) {
    const ipLong = ipv4ToLong(ip);
    if (ipLong === null) return null;
    const p = Math.min(32, Math.max(0, Number(prefix) || 24));
    const mask = p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
    return longToIpv4((ipLong & mask) >>> 0);
  }

  function hostsForPrefix(prefix) {
    const p = Math.min(32, Math.max(0, Number(prefix) || 24));
    return Math.max(0, Math.pow(2, 32 - p) - 2);
  }

  function isValidIpv4(value) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || '').trim())
      && ipv4ToLong(value) !== null;
  }

  function updateScanCidrPreview() {
    if (!el.scanCidrPreview) return;
    const network = el.scanCidrNetwork.value.trim();
    const prefix = el.scanCidrPrefix.value;
    if (!isValidIpv4(network)) {
      el.scanCidrPreview.textContent = t('scan.cidr_invalid_preview');
      return;
    }
    const hosts = hostsForPrefix(prefix);
    el.scanCidrPreview.innerHTML = t('scan.cidr_ok', { cidr: `<strong>${network}/${prefix}</strong>`, hosts: hosts.toLocaleString(normalizeUiLang(state.settings.ui_language) === 'en' ? 'en-US' : 'id-ID') });
  }

  function isScanSubnetModalOpen() {
    return el.modalScanSubnet && !el.modalScanSubnet.classList.contains('hidden');
  }

  function openScanSubnetModal(id) {
    const d = findDevice(id);
    if (!d) return;
    state.scanSubnetTargetId = id;
    const meta = typeMeta(d.type);
    const label = escapeHtml(d.label || meta.label || '—');
    const ip = d.ip && isValidIpv4(d.ip) ? d.ip : '—';
    el.scanSubnetTargetInfo.innerHTML = `<strong>${label}</strong><span class="ping-target-ip">${escapeHtml(ip)}</span>`;

    const prefix = Number(el.scanCidrPrefix.value) || 24;
    const base = d.ip ? networkBaseForPrefix(d.ip, prefix) : null;
    el.scanCidrNetwork.value = base || (isValidIpv4(d.ip) ? d.ip : '');
    updateScanCidrPreview();

    if (!el.modalScanSubnet) return;
    el.modalScanSubnet.classList.remove('hidden');
    el.modalScanSubnet.setAttribute('aria-hidden', 'false');
    setTimeout(() => el.scanCidrNetwork.focus(), 0);
  }

  function closeScanSubnetModal() {
    if (!el.modalScanSubnet) return;
    el.modalScanSubnet.classList.add('hidden');
    el.modalScanSubnet.setAttribute('aria-hidden', 'true');
    state.scanSubnetTargetId = null;
  }

  async function scanSubnet(id, cidr) {
    const d = findDevice(id);
    if (!d) {
      toast(t('toast.device_missing'));
      return;
    }
    if (!cidr) {
      toast(t('toast.cidr_invalid'));
      return;
    }

    // Method from settings: sequential = one host at a time (more accurate);
    // parallel = batch concurrent pings (faster; batch capped server-side ≤128).
    const subnetMethod = state.settings.scan_subnet_method === 'parallel' ? 'parallel' : 'sequential';
    const configuredBatch = Math.min(128, Math.max(8, Number(state.settings.subnet_batch_size || 32)));
    const BATCH = subnetMethod === 'parallel' ? configuredBatch : 1;
    const probeTimeout = Math.min(500, Math.max(100, Number(state.settings.subnet_timeout_ms || 200)));
    const signal = beginBusyAbort();
    const foundHosts = [];
    let planCidr = cidr;
    let total = 0;
    let partialResults = null;
    try {
      busy(true, t('busy.scan_subnet_prepare'), {
        total: 1, done: 0, found: 0, detail: t('busy.scan_subnet_targets'),
      });

      const plan = await api('scan_subnet_prepare', { id, cidr }, { signal });
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const targets = plan.targets || [];
      planCidr = plan.cidr || cidr;
      total = targets.length;
      if (total === 0) {
        toast(t('toast.no_subnet_ip'));
        return;
      }

      const methodHint = subnetMethod === 'parallel'
        ? t('scan.method_parallel_batch', { n: BATCH })
        : t('scan.method_sequential');
      busy(true, `Scan ${planCidr}`, {
        total, done: 0, found: 0, detail: t('busy.scan_subnet_start', { method: methodHint }),
      });

      let done = 0;

      for (let i = 0; i < targets.length; i += BATCH) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const batch = targets.slice(i, i + BATCH);
        const current = batch.length === 1
          ? batch[0]
          : `${batch.join(', ')} (${batch.length})`;
        setBusyProgress({
          total,
          done,
          found: foundHosts.length,
          detail: `Ping ${current}`,
        });

        const probe = await api('scan_subnet_batch', {
          ips: batch,
          timeout_ms: probeTimeout,
          method: subnetMethod,
        }, { signal });
        // Ignore late responses after cancel; only keep hits collected while active.
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (Array.isArray(probe.hosts) && probe.hosts.length) {
          foundHosts.push(...probe.hosts);
        }
        done = Math.min(total, i + batch.length);

        setBusyProgress({
          total,
          done,
          found: foundHosts.length,
          detail: t('busy.scan_subnet_done', { target: current }),
        });
      }

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      if (foundHosts.length === 0) {
        toast(t('toast.scan_zero', { n: total }));
        return;
      }

      // Type stays default 'client' — no separate detect-device-type phase.
      openScanResultsModal(id, { cidr: planCidr, scanned: total, hosts: foundHosts });
    } catch (e) {
      if (isAbortError(e)) {
        if (foundHosts.length > 0) {
          partialResults = {
            cidr: planCidr,
            scanned: total || foundHosts.length,
            hosts: foundHosts.slice(),
          };
          toast(t('toast.scan_cancel_found', { n: foundHosts.length }));
        } else {
          toast(t('toast.scan_cancel'));
        }
      } else {
        toast(e.message);
      }
    } finally {
      busy(false);
    }

    // Show partial hits after the busy overlay is cleared (same apply UI as a full scan).
    if (partialResults) {
      openScanResultsModal(id, partialResults);
    }
  }

  function pingAttemptCount() {
    return Math.min(5, Math.max(3, Number(state.settings?.ping_count || 5)));
  }

  const TERMINAL_CAPTURE_COLORS = {
    bg: '#0c0c0c',
    titlebarTop: '#2c2c2c',
    titlebarBot: '#1c1c1c',
    title: '#cfcfcf',
    status: '#9aa5b1',
    border: '#000000',
    dotIdle: '#5b6b86',
    default: '#cccccc',
    prompt: '#9aa5b1',
    header: '#f2f2f2',
    reply: '#12c97a',
    timeout: '#ff3b5c',
    error: '#ff3b5c',
    statsTitle: '#f2f2f2',
    statsIndent: '#cccccc',
  };

  function pingLineColor(className) {
    const cls = String(className || '');
    if (cls.includes('ping-line--prompt')) return TERMINAL_CAPTURE_COLORS.prompt;
    if (cls.includes('ping-line--header')) return TERMINAL_CAPTURE_COLORS.header;
    if (cls.includes('ping-line--reply')) return TERMINAL_CAPTURE_COLORS.reply;
    if (cls.includes('ping-line--timeout')) return TERMINAL_CAPTURE_COLORS.timeout;
    if (cls.includes('ping-line--error')) return TERMINAL_CAPTURE_COLORS.error;
    if (cls.includes('ping-line--stats-title')) return TERMINAL_CAPTURE_COLORS.statsTitle;
    if (cls.includes('ping-line--stats-indent')) return TERMINAL_CAPTURE_COLORS.statsIndent;
    return TERMINAL_CAPTURE_COLORS.default;
  }

  function pingLineBold(className) {
    const cls = String(className || '');
    return cls.includes('ping-line--error') || cls.includes('ping-line--stats-title');
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const raw = text === '' || text == null ? ' ' : String(text);
    if (ctx.measureText(raw).width <= maxWidth) return [raw];
    const lines = [];
    let current = '';
    for (const ch of raw) {
      const next = current + ch;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [' '];
  }

  function renderTerminalToPngBlob(terminalEl) {
    return new Promise((resolve, reject) => {
      try {
        const titleEl = terminalEl.querySelector('.ping-terminal-title');
        const statusEl = terminalEl.querySelector('.ping-terminal-status');
        const dotEl = terminalEl.querySelector('.ping-terminal-dot');
        const lineEls = terminalEl.querySelectorAll('.ping-line');

        const title = (titleEl && titleEl.textContent) || 'Terminal';
        const status = (statusEl && statusEl.textContent) || '';
        const live = !!(dotEl && dotEl.classList.contains('live'));

        const cssW = Math.max(320, Math.round(terminalEl.getBoundingClientRect().width) || 560);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const padX = 14;
        const padY = 10;
        const titlebarH = 34;
        const fontSize = 13;
        const lineHeight = Math.round(fontSize * 1.55);
        const mono = '400 13px "JetBrains Mono", ui-monospace, Consolas, monospace';
        const monoBold = '700 13px "JetBrains Mono", ui-monospace, Consolas, monospace';
        const titleFont = '600 11px system-ui, sans-serif';

        const measure = document.createElement('canvas').getContext('2d');
        measure.font = mono;
        const textMax = cssW - padX * 2;
        const wrapped = [];
        lineEls.forEach((node) => {
          const text = node.textContent === '\u00A0' ? '' : (node.textContent || '');
          const color = pingLineColor(node.className);
          const bold = pingLineBold(node.className);
          measure.font = bold ? monoBold : mono;
          wrapCanvasText(measure, text, textMax).forEach((part) => {
            wrapped.push({ text: part, color, bold });
          });
        });
        if (!wrapped.length) wrapped.push({ text: ' ', color: TERMINAL_CAPTURE_COLORS.default, bold: false });

        const bodyH = padY + wrapped.length * lineHeight + padY;
        const cssH = titlebarH + bodyH;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // Terminal chrome
        ctx.fillStyle = TERMINAL_CAPTURE_COLORS.bg;
        ctx.beginPath();
        const r = 10;
        ctx.moveTo(r, 0);
        ctx.arcTo(cssW, 0, cssW, cssH, r);
        ctx.arcTo(cssW, cssH, 0, cssH, r);
        ctx.arcTo(0, cssH, 0, 0, r);
        ctx.arcTo(0, 0, cssW, 0, r);
        ctx.closePath();
        ctx.fill();

        const grad = ctx.createLinearGradient(0, 0, 0, titlebarH);
        grad.addColorStop(0, TERMINAL_CAPTURE_COLORS.titlebarTop);
        grad.addColorStop(1, TERMINAL_CAPTURE_COLORS.titlebarBot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cssW, titlebarH);
        ctx.fillStyle = TERMINAL_CAPTURE_COLORS.border;
        ctx.fillRect(0, titlebarH - 1, cssW, 1);

        // Live / idle dot
        ctx.beginPath();
        ctx.arc(14, titlebarH / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = live ? TERMINAL_CAPTURE_COLORS.reply : TERMINAL_CAPTURE_COLORS.dotIdle;
        ctx.fill();

        ctx.font = titleFont;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = TERMINAL_CAPTURE_COLORS.status;
        const statusW = status ? ctx.measureText(status).width : 0;
        if (status) {
          ctx.fillText(status, cssW - padX - statusW, titlebarH / 2);
        }
        ctx.fillStyle = TERMINAL_CAPTURE_COLORS.title;
        const titleMax = Math.max(40, cssW - padX - 22 - (statusW ? statusW + 12 : 0) - padX);
        let titleDraw = title;
        while (titleDraw.length > 1 && ctx.measureText(titleDraw).width > titleMax) {
          titleDraw = titleDraw.slice(0, -1);
        }
        if (titleDraw !== title && titleDraw.length > 1) titleDraw = titleDraw.slice(0, -1) + '…';
        ctx.fillText(titleDraw, 24, titlebarH / 2);

        // Output lines
        let y = titlebarH + padY + fontSize;
        wrapped.forEach((row) => {
          ctx.font = row.bold ? monoBold : mono;
          ctx.fillStyle = row.color;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(row.text, padX, y);
          y += lineHeight;
        });

        canvas.toBlob((blob) => {
          if (!blob) reject(new Error('Gagal membuat gambar terminal'));
          else resolve(blob);
        }, 'image/png');
      } catch (e) {
        reject(e);
      }
    });
  }

  async function captureTerminalToClipboard(terminalEl) {
    if (!terminalEl) throw new Error('Terminal tidak ditemukan');
    if (!window.isSecureContext) {
      throw new Error('Clipboard gambar memerlukan HTTPS atau localhost');
    }
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
      throw new Error('Browser tidak mendukung salin gambar ke clipboard');
    }
    const blob = await renderTerminalToPngBlob(terminalEl);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': Promise.resolve(blob) }),
    ]);
  }

  function setPingFooterEnabled(enabled) {
    if (el.btnRestartPing) el.btnRestartPing.disabled = !enabled;
    if (el.btnCapturePing) el.btnCapturePing.disabled = !enabled;
  }

  function setTracerouteFooterEnabled(enabled) {
    if (el.btnRestartTraceroute) el.btnRestartTraceroute.disabled = !enabled;
    if (el.btnCaptureTraceroute) el.btnCaptureTraceroute.disabled = !enabled;
  }

  function isPingModalOpen() {
    return el.modalPing && !el.modalPing.classList.contains('hidden');
  }

  function pingLine(text, cls) {
    const div = document.createElement('div');
    div.className = cls ? `ping-line ${cls}` : 'ping-line';
    div.textContent = text === '' ? '\u00A0' : text;
    return div;
  }

  function clearPingTerminal() {
    if (el.pingTerminalOutput) el.pingTerminalOutput.innerHTML = '';
  }

  function appendPingLine(text, cls) {
    if (!el.pingTerminalOutput) return;
    el.pingTerminalOutput.appendChild(pingLine(text, cls));
    el.pingTerminalOutput.scrollTop = el.pingTerminalOutput.scrollHeight;
  }

  function setPingStatus(running) {
    if (el.pingTerminalStatus) el.pingTerminalStatus.textContent = running ? t('ping.running') : t('ping.done');
    if (el.pingTerminalDot) el.pingTerminalDot.classList.toggle('live', running);
  }

  function openPingModal(id) {
    const d = findDevice(id);
    if (!d) return;
    const ip = String(d.ip || '').trim();
    if (!ip) {
      toast(t('toast.no_ip'));
      return;
    }
    if (!el.modalPing) return;

    state.pingTargetId = id;
    const meta = typeMeta(d.type);
    const label = d.label || meta.label || '—';
    if (el.pingTerminalTitle) el.pingTerminalTitle.textContent = 'Terminal';

    el.modalPing.classList.remove('hidden');
    el.modalPing.setAttribute('aria-hidden', 'false');

    runPingSequence(id, ip);
  }

  function closePingModal() {
    if (!el.modalPing) return;
    el.modalPing.classList.add('hidden');
    el.modalPing.setAttribute('aria-hidden', 'true');
    state.pingTargetId = null;
    state.pingRunToken++;
  }

  async function runPingSequence(id, ip) {
    state.pingRunToken++;
    const myToken = state.pingRunToken;
    const pingCount = pingAttemptCount();

    setPingFooterEnabled(false);
    clearPingTerminal();
    setPingStatus(true);

    // Classic Windows `ping` chrome — prompt/header/reply/stats wording.
    // Backend may still run Linux ping; TTL/latency come from parsed ICMP.
    appendPingLine(`C:\\Pamantau>ping ${ip} -n ${pingCount}`, 'ping-line--prompt');
    appendPingLine('');
    appendPingLine(`Pinging ${ip} with 32 bytes of data:`, 'ping-line--header');

    let okCount = 0;
    const latencies = [];

    for (let i = 1; i <= pingCount; i++) {
      if (state.pingRunToken !== myToken) return;
      let attempt;
      try {
        // Each attempt is its own real, sequential ping — the backend paces
        // it to a ~1s cadence (like a real terminal ping) via attempt/total,
        // so we simply await and render whatever comes back, no fake delay here.
        const data = await api('ping_host', { id, ip, count: 1, attempt: i, total: pingCount });
        attempt = (data.attempts && data.attempts[0]) || { ok: false, error: 'timeout' };
      } catch (e) {
        attempt = { ok: false, error: 'timeout' };
      }
      if (state.pingRunToken !== myToken) return;

      if (attempt.ok) {
        okCount++;
        const subMs = !!attempt.sub_ms;
        const ms = attempt.latency_ms != null ? Math.round(Number(attempt.latency_ms)) : null;
        // Sub-millisecond LAN replies are recorded as 0ms for stats (matches
        // how a real terminal ping's own summary line rounds them down).
        latencies.push(subMs ? 0 : (ms != null ? ms : 0));
        const timeText = subMs ? 'time<1ms' : `time=${ms != null ? ms : '?'}ms`;
        const ttl = attempt.ttl != null && attempt.ttl !== '' ? Number(attempt.ttl) : null;
        const ttlText = ttl != null && Number.isFinite(ttl) ? ` TTL=${ttl}` : '';
        appendPingLine(`Reply from ${ip}: bytes=32 ${timeText}${ttlText}`, 'ping-line--reply');
      } else if (attempt.error === 'unreachable') {
        appendPingLine('Destination host unreachable.', 'ping-line--timeout');
      } else {
        appendPingLine('Request timed out.', 'ping-line--timeout');
      }
    }

    if (state.pingRunToken !== myToken) return;

    const lost = pingCount - okCount;
    const lossPct = Math.round((lost / pingCount) * 100);
    appendPingLine('');
    appendPingLine(`Ping statistics for ${ip}:`, 'ping-line--stats-title');
    appendPingLine(`    Packets: Sent = ${pingCount}, Received = ${okCount}, Lost = ${lost} (${lossPct}% loss),`, 'ping-line--stats-indent');
    if (latencies.length) {
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const min = Math.min(...latencies);
      const max = Math.max(...latencies);
      appendPingLine('Approximate round trip times in milli-seconds:', 'ping-line--stats-title');
      appendPingLine(`    Minimum = ${min}ms, Maximum = ${max}ms, Average = ${avg}ms`, 'ping-line--stats-indent');
    }
    appendPingLine('');
    appendPingLine('C:\\Pamantau>', 'ping-line--prompt');

    setPingStatus(false);
    setPingFooterEnabled(true);
  }

  const TRACEROUTE_MAX_HOPS = 30;

  function isTracerouteModalOpen() {
    return el.modalTraceroute && !el.modalTraceroute.classList.contains('hidden');
  }

  function clearTracerouteTerminal() {
    if (el.tracerouteTerminalOutput) el.tracerouteTerminalOutput.innerHTML = '';
  }

  function appendTracerouteLine(text, cls) {
    if (!el.tracerouteTerminalOutput) return;
    el.tracerouteTerminalOutput.appendChild(pingLine(text, cls));
    el.tracerouteTerminalOutput.scrollTop = el.tracerouteTerminalOutput.scrollHeight;
  }

  function setTracerouteStatus(running) {
    if (el.tracerouteTerminalStatus) el.tracerouteTerminalStatus.textContent = running ? t('tr.running') : t('ping.done');
    if (el.tracerouteTerminalDot) el.tracerouteTerminalDot.classList.toggle('live', running);
  }

  // Classifies a Windows-style hop line for terminal coloring.
  function tracerouteLineClass(line) {
    if (!/^\s*\d+\s/.test(line)) return '';
    if (/\d+\s*ms/i.test(line)) return 'ping-line--reply';
    if (/\*/.test(line) || /timed out/i.test(line)) return 'ping-line--timeout';
    return '';
  }

  // Windows tracert uses ~%3d%9s%9s%9s for hop + three RTT columns.
  const TRACERT_RTT_WIDTH = 9;

  function formatTracertMs(ms) {
    if (ms == null || ms === '' || Number.isNaN(Number(ms))) {
      return '*'.padStart(TRACERT_RTT_WIDTH, ' ');
    }
    const n = Math.round(Number(ms));
    const label = n < 1 ? '<1 ms' : `${n} ms`;
    return label.padStart(TRACERT_RTT_WIDTH, ' ');
  }

  function formatTracertHopLine(hopNum, t1, t2, t3, host) {
    const num = String(hopNum).padStart(3, ' ');
    const times = [t1, t2, t3].map(formatTracertMs).join('');
    return `${num}${times}  ${host}`;
  }

  function formatTracertHopFromData(hop) {
    const raw = Array.isArray(hop.times_ms) ? hop.times_ms : [];
    const t1 = raw[0];
    const t2 = raw[1];
    const t3 = raw[2];
    const missing = (t) => t == null || t === '';
    const timedOut = hop.timed_out || (missing(t1) && missing(t2) && missing(t3) && !hop.ip);
    const host = timedOut && !hop.ip ? 'Request timed out.' : (hop.ip || '*');
    return formatTracertHopLine(hop.hop, t1, t2, t3, host);
  }

  // Parse raw tracert/traceroute/tracepath stdout into hop objects when the
  // API hops[] array is empty. Skips Linux/Windows intro banners.
  function parseTracerouteHopsFromOutput(text) {
    const hops = [];
    String(text || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (/^traceroute to\b/i.test(line)) return;
      if (/^tracing route to\b/i.test(line)) return;
      if (/^trace (complete|finished)\b/i.test(line)) return;
      if (/^over a maximum of\b/i.test(line)) return;
      const m = line.match(/^(\d{1,3})[.\s]+(.*)$/);
      if (!m) return;
      const hopNum = parseInt(m[1], 10);
      if (hopNum < 1 || hopNum > 200) return;
      const rest = m[2];
      const ipm = rest.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      const ip = ipm ? ipm[1] : null;
      const times = [];
      const tm = rest.matchAll(/([\d.]+)\s*ms/gi);
      for (const t of tm) times.push(parseFloat(t[1]));
      const timedOut = ip == null && times.length === 0;
      hops.push({ hop: hopNum, ip, times_ms: times, timed_out: timedOut });
    });
    return hops;
  }

  function renderWindowsTracert(ip, maxHops, hops) {
    appendTracerouteLine(`C:\\Pamantau>tracert -d ${ip}`, 'ping-line--prompt');
    appendTracerouteLine('');
    appendTracerouteLine(`Tracing route to ${ip} over a maximum of ${maxHops} hops`, 'ping-line--header');
    appendTracerouteLine('');
    if (!hops.length) {
      appendTracerouteLine('Tidak ada hop dari traceroute.', 'ping-line--timeout');
    } else {
      hops.forEach((hop) => {
        const line = formatTracertHopFromData(hop);
        appendTracerouteLine(line, tracerouteLineClass(line));
      });
    }
    appendTracerouteLine('');
    appendTracerouteLine('Trace complete.');
    appendTracerouteLine('');
    appendTracerouteLine('C:\\Pamantau>', 'ping-line--prompt');
  }

  function openTracerouteModal(id) {
    const d = findDevice(id);
    if (!d) return;
    const ip = String(d.ip || '').trim();
    if (!ip) {
      toast(t('toast.no_ip'));
      return;
    }
    if (!el.modalTraceroute) return;

    state.tracerouteTargetId = id;
    if (el.tracerouteTerminalTitle) el.tracerouteTerminalTitle.textContent = 'Terminal';

    el.modalTraceroute.classList.remove('hidden');
    el.modalTraceroute.setAttribute('aria-hidden', 'false');

    runTracerouteSequence(id, ip);
  }

  function closeTracerouteModal() {
    if (!el.modalTraceroute) return;
    el.modalTraceroute.classList.add('hidden');
    el.modalTraceroute.setAttribute('aria-hidden', 'true');
    state.tracerouteTargetId = null;
    state.tracerouteRunToken++;
  }

  async function runTracerouteSequence(id, ip) {
    state.tracerouteRunToken++;
    const myToken = state.tracerouteRunToken;

    setTracerouteFooterEnabled(false);
    clearTracerouteTerminal();
    setTracerouteStatus(true);

    appendTracerouteLine(`Menjalankan traceroute ke ${ip}...`, 'ping-line--prompt');

    let data;
    try {
      data = await api('traceroute_host', { id, ip, max_hops: TRACEROUTE_MAX_HOPS });
    } catch (e) {
      if (state.tracerouteRunToken !== myToken) return;
      clearTracerouteTerminal();
      appendTracerouteLine(`C:\\Pamantau>tracert -d ${ip}`, 'ping-line--prompt');
      appendTracerouteLine('');
      appendTracerouteLine(`Traceroute gagal: ${e.message}`, 'ping-line--error');
      appendTracerouteLine('');
      appendTracerouteLine('C:\\Pamantau>', 'ping-line--prompt');
      setTracerouteStatus(false);
      setTracerouteFooterEnabled(true);
      return;
    }

    if (state.tracerouteRunToken !== myToken) return;
    clearTracerouteTerminal();

    const maxHops = Math.max(1, Math.min(30, Number(data.max_hops) || TRACEROUTE_MAX_HOPS));
    let hops = Array.isArray(data.hops) ? data.hops.filter((h) => h && h.hop >= 1) : [];
    if (!hops.length) {
      hops = parseTracerouteHopsFromOutput(data.output);
    }

    renderWindowsTracert(ip, maxHops, hops);

    setTracerouteStatus(false);
    setTracerouteFooterEnabled(true);
  }

  function isScanResultsModalOpen() {
    return el.modalScanResults && !el.modalScanResults.classList.contains('hidden');
  }

  function scanResultRowLabel(type, ip) {
    return `${String(type || 'client').toUpperCase()}-${String(ip || '').replace(/\./g, '').slice(-4)}`;
  }

  function openScanResultsModal(sourceId, { cidr, scanned, hosts }) {
    const existingByIp = {};
    state.devices.forEach((dv) => {
      const ip = String(dv.ip || '').trim();
      if (ip) existingByIp[ip] = dv;
    });

    state.scanResultsPending = { id: sourceId, cidr, scanned };
    state.scanResults = hosts.map((h) => {
      const existing = existingByIp[h.ip];
      const type = existing ? existing.type : (h.type || 'client');
      return {
        ip: h.ip,
        latency: h.latency ?? null,
        services: [],
        portsStatus: 'pending',
        type,
        label: existing ? existing.label : scanResultRowLabel(type, h.ip),
        exists: !!existing,
        selected: true,
      };
    });

    renderScanResultsTable();

    if (!el.modalScanResults) return;
    el.modalScanResults.classList.remove('hidden');
    el.modalScanResults.setAttribute('aria-hidden', 'false');
    startScanResultsLiveUpdates();
  }

  function closeScanResultsModal() {
    if (!el.modalScanResults) return;
    abortScanResultsLive();
    el.modalScanResults.classList.add('hidden');
    el.modalScanResults.setAttribute('aria-hidden', 'true');
    state.scanResults = [];
    state.scanResultsPending = null;
  }

  function rescanFromScanResults() {
    const pending = state.scanResultsPending;
    const id = pending?.id || null;
    const cidr = pending?.cidr ? String(pending.cidr) : '';
    closeScanResultsModal();
    if (!id || !findDevice(id)) {
      toast(t('toast.scan_source_missing'));
      return;
    }
    openScanSubnetModal(id);
    const m = cidr.match(/^(.+)\/(\d+)$/);
    if (m && el.scanCidrNetwork && el.scanCidrPrefix) {
      el.scanCidrNetwork.value = m[1];
      if ([...el.scanCidrPrefix.options].some((o) => o.value === m[2])) {
        el.scanCidrPrefix.value = m[2];
      }
      updateScanCidrPreview();
    }
  }

  function typeSelectOptionsHtml(selected) {
    return TYPES.map((t) => `<option value="${t.type}" ${t.type === selected ? 'selected' : ''}>${escapeHtml(typeLabel(t.type))}</option>`).join('');
  }

  function updateScanResultsSummary() {
    const total = state.scanResults.length;
    const selected = state.scanResults.filter((r) => r.selected).length;
    const news = state.scanResults.filter((r) => r.selected && !r.exists).length;
    if (el.scanResultsSummary) {
      el.scanResultsSummary.innerHTML = t('scan.summary', { total: `<strong>${total}</strong>`, selected: `<strong>${selected}</strong>`, news });
    }
    if (el.btnConfirmScanResults) {
      setBtnLabel(el.btnConfirmScanResults, selected > 0
        ? `Tambahkan ${selected} ke Topologi`
        : 'Tambahkan ke Topologi');
      el.btnConfirmScanResults.disabled = selected === 0;
    }
    if (el.scanResultsSelectAll) {
      el.scanResultsSelectAll.checked = total > 0 && selected === total;
      el.scanResultsSelectAll.indeterminate = selected > 0 && selected < total;
    }
  }

  function scanResultLatencyCellHtml(r) {
    const ms = r.latency;
    if (ms == null || !Number.isFinite(Number(ms))) {
      return '<td class="scan-cell-latency is-miss">—</td>';
    }
    return `<td class="scan-cell-latency">${escapeHtml(formatLatencyMs(ms) || '—')}</td>`;
  }

  function formatScanResultPortsHtml(r) {
    if (r.portsStatus === 'scanning' || r.portsStatus === 'pending') {
      return escapeHtml(t('scan.ports_scanning'));
    }
    const open = Array.from(new Set((r.services || []).map(Number)))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535)
      .sort((a, b) => a - b);
    if (!open.length) return '—';
    return open.map((p) => {
      const name = portServiceName(p);
      if (name) {
        return `<span class="scan-port-chip has-note">${escapeHtml(String(p))} (${escapeHtml(name)})</span>`;
      }
      return `<span class="scan-port-chip">${escapeHtml(String(p))}</span>`;
    }).join(' ');
  }

  function scanResultPortsCellHtml(r) {
    const scanning = r.portsStatus === 'scanning' || r.portsStatus === 'pending';
    return `<td class="scan-cell-ports${scanning ? ' is-scanning' : ''}">${formatScanResultPortsHtml(r)}</td>`;
  }

  function renderScanResultsTable() {
    if (!el.scanResultsRows) return;
    el.scanResultsRows.innerHTML = state.scanResults.map((r, i) => `
      <tr class="${r.exists ? 'is-existing' : ''} ${r.selected ? '' : 'is-unchecked'}" data-idx="${i}">
        <td class="col-check"><input type="checkbox" class="scan-row-check" data-idx="${i}" ${r.selected ? 'checked' : ''} /></td>
        <td class="scan-cell-ip">${escapeHtml(r.ip)}</td>
        ${scanResultLatencyCellHtml(r)}
        <td class="scan-cell-type">
          <select class="scan-row-type" data-idx="${i}" ${r.exists ? 'disabled' : ''}>${typeSelectOptionsHtml(r.type)}</select>
        </td>
        <td class="scan-cell-label">
          <input type="text" class="scan-row-label" data-idx="${i}" value="${escapeHtml(r.label)}" ${r.exists ? 'disabled' : ''} />
        </td>
        <td class="scan-cell-status">
          <span class="scan-result-badge ${r.exists ? 'existing' : 'new'}">${escapeHtml(scanResultStatusLabel(r))}</span>
        </td>
        ${scanResultPortsCellHtml(r)}
      </tr>
    `).join('') || `<tr><td colspan="7">${escapeHtml(t('scan.no_reply'))}</td></tr>`;
    updateScanResultsSummary();
  }

  async function confirmScanResults() {
    const pending = state.scanResultsPending;
    if (!pending) return;
    const selected = state.scanResults.filter((r) => r.selected);
    if (selected.length === 0) {
      toast(t('toast.select_one_add'));
      return;
    }

    const signal = beginBusyAbort();
    busy(true, t('busy.build_topology'), {
      total: selected.length,
      done: selected.length,
      found: selected.length,
      detail: t('busy.build_topology_detail', { n: selected.length }),
    });
    try {
      const hosts = selected.map((r) => ({
        ip: r.ip,
        latency: r.latency,
        services: Array.isArray(r.services) ? [...r.services] : [],
        type: r.type,
        label: r.label,
      }));
      const data = await api('scan_subnet_apply', {
        id: pending.id,
        hosts,
        cidr: pending.cidr,
        scanned: pending.scanned,
      }, { signal });

      state.devices = data.devices;
      state.connections = data.connections;
      selectDevice(pending.id);
      pushHistory();
      closeScanResultsModal();
      toast(t('toast.scan_done_add', { found: data.found, created: data.created.length }));
    } catch (e) {
      if (isAbortError(e)) {
        toast(t('toast.scan_cancel'));
      } else {
        toast(e.message);
      }
    } finally {
      busy(false);
    }
  }

  function scanPortMaxFromSettings() {
    const n = Number(state.settings?.scan_port_max);
    if (!Number.isFinite(n)) return DEFAULT_SETTINGS.scan_port_max;
    return Math.min(10000, Math.max(1, Math.round(n)));
  }

  /** Default range shown when Scan Port modal opens: 1…scan_port_max. */
  function scanPortRangeFromSettings() {
    const to = scanPortMaxFromSettings();
    return { from: 1, to, count: to, label: `1-${to}` };
  }

  function syncScanPortsRangeField() {
    if (!el.scanPortsRange) return;
    el.scanPortsRange.value = scanPortRangeFromSettings().label;
  }

  /** Parse editable `#scanPortsRange` (same rules as API: `from-to`, span ≤ scan_port_max). */
  function parseScanPortsRangeInput(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
      return { ok: false, error: 'Rentang port kosong.' };
    }
    const m = text.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) {
      return { ok: false, error: 'Format rentang tidak valid. Contoh: 1-1000' };
    }
    const from = Number(m[1]);
    const to = Number(m[2]);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to > 65535 || from > to) {
      return { ok: false, error: t('scan.port_range_invalid') };
    }
    const count = to - from + 1;
    const maxSpan = scanPortMaxFromSettings();
    if (count > maxSpan) {
      return {
        ok: false,
        error: `Rentang terlalu besar (maks. ${maxSpan} port dari pengaturan). Perkecil rentang.`,
      };
    }
    return { ok: true, from, to, count, label: `${from}-${to}` };
  }

  function portServiceName(port) {
    const notes = state.settings?.common_port_notes;
    if (!notes || typeof notes !== 'object') return '';
    const raw = notes[port] ?? notes[String(port)] ?? notes[Number(port)];
    if (raw == null) return '';
    const note = String(raw).trim();
    return note;
  }

  function isScanPortsModalOpen() {
    return el.modalScanPorts && !el.modalScanPorts.classList.contains('hidden');
  }

  // IPv6 bare address needs brackets in a http://host:port URL
  function bracketHost(host) {
    if (host.includes(':') && !host.includes('.') && !host.startsWith('[')) {
      return `[${host}]`;
    }
    return host;
  }

  let scanPortsElapsedTimer = null;
  let scanPortsElapsedStartedAt = 0;

  function stopScanPortsElapsed() {
    if (scanPortsElapsedTimer != null) {
      clearInterval(scanPortsElapsedTimer);
      scanPortsElapsedTimer = null;
    }
  }

  function setScanPortsElapsedText(ms) {
    if (el.scanPortsElapsed) {
      el.scanPortsElapsed.textContent = formatScanPortsDuration(ms);
    }
  }

  function setScanPortsLoading(active) {
    const scanning = !!active;
    if (el.modalScanPorts) {
      el.modalScanPorts.classList.toggle('is-scanning', scanning);
      el.modalScanPorts.setAttribute('aria-busy', scanning ? 'true' : 'false');
    }
    if (el.btnScanPorts) el.btnScanPorts.disabled = scanning;
    if (el.btnRescanPorts) {
      el.btnRescanPorts.disabled = scanning || !state.scanPortsDidScan;
    }
    if (el.scanPortsRange) el.scanPortsRange.disabled = scanning;
    if (el.scanPortsLoading) el.scanPortsLoading.classList.toggle('hidden', !scanning);

    stopScanPortsElapsed();
    if (scanning) {
      scanPortsElapsedStartedAt = performance.now();
      setScanPortsElapsedText(0);
      scanPortsElapsedTimer = setInterval(() => {
        setScanPortsElapsedText(performance.now() - scanPortsElapsedStartedAt);
      }, 100);
    }
  }

  function setScanPortsEmpty(message, isError) {
    if (el.scanPortsEmpty) {
      el.scanPortsEmpty.textContent = message || '';
      el.scanPortsEmpty.classList.toggle('hidden', !message);
      el.scanPortsEmpty.classList.toggle('is-error', !!isError);
    }
  }

  function scanPortsRowHtml(port, open) {
    const name = portServiceName(port);
    const ip = String(state.scanPortsTargetIp || '').trim();
    const url = ip ? `http://${bracketHost(ip)}:${port}` : '';
    const titleAttr = url ? ` title="Buka ${escapeHtml(url)}"` : '';
    return `
      <li class="ping-result-row scan-port-row ${open ? 'ok' : 'fail'}" data-port="${escapeHtml(String(port))}"${titleAttr}>
        <span class="ping-result-num">${escapeHtml(String(port))}</span>
        <span class="ping-result-status">${open ? 'Terbuka' : 'Tertutup'}</span>
        <span class="ping-result-detail">${escapeHtml(name)}</span>
      </li>
    `;
  }

  function openScanPortInBrowser(port) {
    const ip = String(state.scanPortsTargetIp || '').trim();
    if (!ip || !port) return;
    window.open(`http://${bracketHost(ip)}:${port}`, '_blank', 'noopener,noreferrer');
  }

  /** Compact wall-time for scan summary, e.g. `12.4s` or `1m 05s`. */
  function formatScanPortsDuration(ms) {
    const totalSec = Math.max(0, Number(ms) || 0) / 1000;
    if (totalSec < 60) {
      const rounded = Math.round(totalSec * 10) / 10;
      return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
    }
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }

  /** List open ports only (range scans can cover thousands of closed ports). */
  function renderScanPortsResults(scannedMeta, openPorts, elapsedMs) {
    const open = Array.from(new Set((openPorts || []).map(Number)))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535)
      .sort((a, b) => a - b);
    const scannedCount = Number(scannedMeta && scannedMeta.count) || open.length;
    const from = scannedMeta && scannedMeta.from;
    const to = scannedMeta && scannedMeta.to;
    const rangeLabel = (from != null && to != null) ? `${from}–${to}` : '';

    if (el.scanPortsResultsList) {
      el.scanPortsResultsList.innerHTML = open.length
        ? open.map((p) => scanPortsRowHtml(p, true)).join('')
        : '';
    }
    setScanPortsEmpty(open.length
      ? ''
      : (scannedCount > 0
        ? `Tidak ada port terbuka${rangeLabel ? ` pada ${rangeLabel}` : ''}`
        : 'Belum ada hasil scan.'));
    if (el.scanPortsSummary) {
      if (scannedCount > 0 || open.length > 0) {
        el.scanPortsSummary.textContent =
          `${open.length} Port Terbuka - ${formatScanPortsDuration(elapsedMs)}`;
      } else {
        el.scanPortsSummary.textContent = '';
      }
    }
  }

  function openScanPortsModal(id) {
    const d = findDevice(id);
    if (!d) return;
    const ip = String(d.ip || '').trim();
    if (!ip) {
      toast(t('toast.no_ip'));
      return;
    }
    if (!el.modalScanPorts) return;

    state.scanPortsTargetId = id;
    state.scanPortsTargetIp = ip;
    state.scanPortsDidScan = false;
    const meta = typeMeta(d.type);
    const label = escapeHtml(d.label || meta.label || '—');
    if (el.scanPortsTargetInfo) {
      el.scanPortsTargetInfo.innerHTML = `<strong>${label}</strong><span class="ping-target-ip">${escapeHtml(ip)}</span>`;
    }
    syncScanPortsRangeField();
    if (el.scanPortsResultsList) el.scanPortsResultsList.innerHTML = '';
    if (el.scanPortsSummary) el.scanPortsSummary.textContent = '';
    setScanPortsEmpty('Klik Scan Port untuk memulai.');
    setScanPortsLoading(false);

    el.modalScanPorts.classList.remove('hidden');
    el.modalScanPorts.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (el.btnScanPorts) el.btnScanPorts.focus();
    }, 0);
  }

  function closeScanPortsModal() {
    if (!el.modalScanPorts) return;
    el.modalScanPorts.classList.add('hidden');
    el.modalScanPorts.setAttribute('aria-hidden', 'true');
    state.scanPortsTargetId = null;
    state.scanPortsTargetIp = '';
    state.scanPortsDidScan = false;
    state.scanPortsRunToken++;
    // Cancel any in-flight scan hold so interval polling can resume.
    state.scanPortsBusyGen += 1;
    state.scanPortsBusy = false;
    setScanPortsLoading(false);
    if (isPollingEnabled() && !state.pollBusy) {
      scheduleNextPollAfterComplete();
    }
  }

  async function runScanPorts(id) {
    state.scanPortsRunToken++;
    const myToken = state.scanPortsRunToken;

    const range = parseScanPortsRangeInput(el.scanPortsRange?.value);
    if (!range.ok) {
      toast(range.error);
      setScanPortsEmpty(range.error, true);
      return;
    }
    if (el.scanPortsRange) el.scanPortsRange.value = range.label;

    const method = state.settings.scan_port_method === 'sequential' ? 'sequential' : 'parallel';

    // Hold interval polling for the whole scan. Otherwise the standby timer fires
    // mid-scan, queues api('poll'), and that full-topology poll runs the instant
    // scan_ports returns (looks like "scan finished → poll all devices").
    state.scanPortsBusyGen += 1;
    const holdGen = state.scanPortsBusyGen;
    state.scanPortsBusy = true;
    clearPollTimer();
    // Discard an in-flight poll's full device replace so it cannot wipe scan results.
    state.pollToken += 1;

    setScanPortsLoading(true);
    if (el.scanPortsResultsList) el.scanPortsResultsList.innerHTML = '';
    if (el.scanPortsSummary) el.scanPortsSummary.textContent = '';
    setScanPortsEmpty('');

    const scanStartedAt = performance.now();
    try {
      const data = await api('scan_ports', {
        id,
        port_from: range.from,
        port_to: range.to,
        method,
      });
      if (state.scanPortsRunToken !== myToken) return;
      const elapsedMs = performance.now() - scanStartedAt;

      const device = (Array.isArray(data.devices) ? data.devices.find((dv) => dv.id === id) : null) || data.device;
      const openPorts = Array.isArray(data.open_ports)
        ? data.open_ports
        : (device && Array.isArray(device.services) ? device.services : []);

      // Apply open ports to the scanned device only — never kick off / replace via poll.
      const local = findDevice(id);
      if (local) {
        local.services = Array.isArray(device?.services) ? [...device.services] : [...openPorts];
      }

      state.scanPortsDidScan = true;
      if (state.selectedId === id && isPropsModalOpen()) {
        const d = findDevice(id);
        if (d) updateLive(d);
      }
      draw();

      const scannedCount = Number(data.scanned) || range.count;

      renderScanPortsResults(
        { from: range.from, to: range.to, count: scannedCount },
        openPorts,
        elapsedMs,
      );
      setScanPortsLoading(false);
      toast(t('toast.scan_port_done'));
    } catch (e) {
      if (state.scanPortsRunToken !== myToken) return;
      setScanPortsLoading(false);
      setScanPortsEmpty(e.message || 'Scan gagal. Coba lagi.', true);
      if (el.scanPortsSummary) el.scanPortsSummary.textContent = '';
      toast(e.message);
    } finally {
      if (state.scanPortsRunToken === myToken) {
        if (el.btnScanPorts) el.btnScanPorts.disabled = false;
        if (el.btnRescanPorts) {
          el.btnRescanPorts.disabled = !state.scanPortsDidScan;
        }
      }
      // Only the latest scan hold may clear busy / resume the standby countdown.
      // Do not call poll() here — just re-arm the interval.
      if (holdGen === state.scanPortsBusyGen) {
        state.scanPortsBusy = false;
        if (isPollingEnabled() && !state.pollBusy) {
          scheduleNextPollAfterComplete();
        } else {
          updatePollMeterUi();
        }
      }
    }
  }

  function commonPortsFromSettings() {
    const raw = Array.isArray(state.settings?.common_ports) && state.settings.common_ports.length
      ? state.settings.common_ports
      : DEFAULT_SETTINGS.common_ports;
    return Array.from(new Set(raw.map(Number)))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535)
      .sort((a, b) => a - b);
  }

  function abortScanResultsLive() {
    state.scanResultsLiveToken += 1;
    if (state.scanResultsLiveController) {
      try { state.scanResultsLiveController.abort(); } catch (_) { /* ignore */ }
      state.scanResultsLiveController = null;
    }
    // Release poll hold started by results-table port scans.
    state.scanPortsBusyGen += 1;
    state.scanPortsBusy = false;
    if (isPollingEnabled() && !state.pollBusy) {
      scheduleNextPollAfterComplete();
    } else {
      updatePollMeterUi();
    }
  }

  function updateScanResultLatencyCell(idx, ms) {
    const row = state.scanResults[idx];
    if (row) {
      row.latency = (ms != null && Number.isFinite(Number(ms))) ? Number(ms) : null;
    }
    const cell = el.scanResultsRows?.querySelector(`tr[data-idx="${idx}"] td.scan-cell-latency`);
    if (!cell) return;
    cell.classList.remove('is-pending', 'is-miss');
    if (ms == null || !Number.isFinite(Number(ms))) {
      cell.classList.add(ms === undefined ? 'is-pending' : 'is-miss');
      cell.textContent = ms === undefined ? '…' : '—';
      return;
    }
    cell.textContent = formatLatencyMs(ms) || '—';
  }

  function updateScanResultPortsCell(idx) {
    const row = state.scanResults[idx];
    if (!row) return;
    const cell = el.scanResultsRows?.querySelector(`tr[data-idx="${idx}"] td.scan-cell-ports`);
    if (!cell) return;
    const scanning = row.portsStatus === 'scanning' || row.portsStatus === 'pending';
    cell.classList.toggle('is-scanning', scanning);
    cell.innerHTML = formatScanResultPortsHtml(row);
  }

  async function runScanResultRowPing(idx, token, signal) {
    // Keep attempt < total so the API paces ~1s between echoes (realtime feel).
    let attempt = 0;
    while (state.scanResultsLiveToken === token && isScanResultsModalOpen()) {
      const row = state.scanResults[idx];
      const ip = String(row?.ip || '').trim();
      if (!ip) return;
      attempt += 1;
      try {
        const data = await api('ping_host', {
          ip,
          count: 1,
          attempt,
          total: attempt + 1,
        }, { signal });
        if (state.scanResultsLiveToken !== token) return;
        if (state.scanResults[idx]?.ip !== ip) return;
        const att = Array.isArray(data.attempts) ? data.attempts[0] : null;
        if (att && att.ok && att.latency_ms != null) {
          updateScanResultLatencyCell(idx, att.latency_ms);
        } else {
          updateScanResultLatencyCell(idx, null);
        }
      } catch (e) {
        if (isAbortError(e) || state.scanResultsLiveToken !== token) return;
        if (state.scanResults[idx]?.ip === ip) {
          updateScanResultLatencyCell(idx, null);
        }
      }
    }
  }

  async function runScanResultRowPorts(idx, token, signal, ports, method) {
    const row = state.scanResults[idx];
    const ip = String(row?.ip || '').trim();
    if (!ip) return;

    row.portsStatus = 'scanning';
    row.services = [];
    updateScanResultPortsCell(idx);

    if (!ports.length) {
      row.portsStatus = 'done';
      row.services = [];
      updateScanResultPortsCell(idx);
      return;
    }

    try {
      const data = await api('scan_ports', {
        ip,
        ports,
        method,
      }, { signal });
      if (state.scanResultsLiveToken !== token) return;
      if (state.scanResults[idx]?.ip !== ip) return;

      const open = Array.from(new Set((data.open_ports || []).map(Number)))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535)
        .sort((a, b) => a - b);
      row.services = open;
      row.portsStatus = 'done';
      updateScanResultPortsCell(idx);
    } catch (e) {
      if (isAbortError(e) || state.scanResultsLiveToken !== token) return;
      if (state.scanResults[idx]?.ip !== ip) return;
      row.portsStatus = 'done';
      row.services = [];
      updateScanResultPortsCell(idx);
    }
  }

  async function runScanResultsPortScans(token, signal) {
    const ports = commonPortsFromSettings();
    const method = state.settings.scan_port_method === 'sequential' ? 'sequential' : 'parallel';
    const n = state.scanResults.length;
    if (!n) return;

    state.scanPortsBusyGen += 1;
    const holdGen = state.scanPortsBusyGen;
    state.scanPortsBusy = true;
    clearPollTimer();
    state.pollToken += 1;

    // Batch concurrent IP-only scans so many hosts don't freeze the UI.
    const batchSize = Math.min(3, Math.max(1, n));
    try {
      for (let start = 0; start < n; start += batchSize) {
        if (state.scanResultsLiveToken !== token || !isScanResultsModalOpen()) break;
        const slice = [];
        for (let i = start; i < Math.min(start + batchSize, n); i += 1) {
          slice.push(runScanResultRowPorts(i, token, signal, ports, method));
        }
        await Promise.all(slice);
      }
    } finally {
      if (holdGen === state.scanPortsBusyGen) {
        state.scanPortsBusy = false;
        if (isPollingEnabled() && !state.pollBusy) {
          scheduleNextPollAfterComplete();
        } else {
          updatePollMeterUi();
        }
      }
    }
  }

  function startScanResultsLiveUpdates() {
    // Soft-abort prior live work (token + fetch), then start fresh.
    // Full abortScanResultsLive (poll release) is reserved for modal close.
    state.scanResultsLiveToken += 1;
    if (state.scanResultsLiveController) {
      try { state.scanResultsLiveController.abort(); } catch (_) { /* ignore */ }
    }
    const token = state.scanResultsLiveToken;
    const controller = new AbortController();
    state.scanResultsLiveController = controller;
    const { signal } = controller;

    state.scanResults.forEach((row, idx) => {
      row.portsStatus = 'scanning';
      row.services = [];
      updateScanResultPortsCell(idx);
      // Stagger ping loops so opening many hosts does not stampede the API.
      window.setTimeout(() => {
        if (state.scanResultsLiveToken !== token) return;
        runScanResultRowPing(idx, token, signal);
      }, idx * 75);
    });

    runScanResultsPortScans(token, signal);
  }

  async function deleteDevice(id) {
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const ids = id ? [id] : [...state.selectedIds];
    if (!ids.length) return;
    const msg = ids.length > 1
      ? t('confirm.delete_devices_n', { n: ids.length })
      : t('confirm.delete_device_one');
    const ok = await confirmDialog({
      title: t('confirm.delete_device'),
      message: msg,
      confirmLabel: t('confirm.delete'),
    });
    if (!ok) return;

    // Invalidate in-flight poll so stale device lists cannot restore deleted nodes
    state.pollToken += 1;

    try {
      const data = await api('delete_device', { ids });
      state.devices = data.devices;
      state.connections = data.connections;
      clearSelection();
      syncInspector();
      pushHistory();
      draw();
      toast(ids.length > 1 ? t('toast.devices_deleted', { n: ids.length }) : t('toast.device_deleted'));
      closePropsModal();
    } catch (e) {
      toast(e.message);
    }
  }

  async function poll(silent = true) {
    // silent=true = auto-poll; jangan jalan jika polling OFF.
    // silent=false = refresh manual / setelah simpan props — tetap boleh sekali.
    if (silent && !isPollingEnabled()) {
      stopPolling();
      return;
    }
    // Manual Scan Port owns the network — do not start a full-topology poll.
    if (state.scanPortsBusy) {
      if (!silent) toast(t('toast.poll_busy'));
      return;
    }
    // Hindari overlap: poll jaringan lambat bisa lebih lama dari interval.
    if (state.pollBusy) {
      if (!silent) toast(t('toast.poll_busy'));
      return;
    }
    state.pollBusyGen += 1;
    const busyGen = state.pollBusyGen;
    state.pollBusy = true;
    // Batalkan jadwal berikutnya — siklus baru dimulai di finally setelah selesai.
    clearPollTimer();
    updatePollMeterUi();
    const token = state.pollToken;
    const auto = silent;
    try {
      const data = await api('poll');
      // Dimatikan saat request masih jalan — buang hasil auto-poll.
      if (auto && !isPollingEnabled()) {
        return;
      }
      if (token !== state.pollToken) {
        if (auto && !isPollingEnabled()) return;
        // Invalidated (delete / Scan Port) — only patch status/latency, never services
        // (manual port scan results must not be overwritten by a discarded poll).
        if (Array.isArray(data.results)) {
          const map = Object.fromEntries(state.devices.map((d) => [d.id, d]));
          for (const r of data.results) {
            const d = map[r.id];
            if (!d) continue;
            d.status = r.status;
            d.latency = r.latency != null && Number.isFinite(Number(r.latency))
              ? Math.round(Number(r.latency))
              : r.latency;
          }
          draw();
        }
        return;
      }
      state.devices = data.devices;
      state.stats = data.stats || state.stats;
      if (state.selectedId && isPropsModalOpen()) {
        const d = findDevice(state.selectedId);
        if (d) updateLive(d);
      }
      draw();
    } catch (e) {
      if (!silent) toast(e.message);
    } finally {
      // Hanya pemilik busyGen ini yang boleh clear busy / jadwal Siaga.
      // stopPolling() menaikkan pollBusyGen; delete hanya menaikkan pollToken.
      if (busyGen !== state.pollBusyGen) {
        return;
      }
      state.pollBusy = false;
      // Scan Port will re-arm the standby timer when it finishes — don't steal that.
      if (state.scanPortsBusy) {
        updatePollMeterUi();
        return;
      }
      // Interval dihitung dari *selesai* poll (bukan dari awal), agar UI ↔ HTTP sync.
      if (isPollingEnabled()) {
        scheduleNextPollAfterComplete();
      } else {
        clearPollCountdown();
        updatePollMeterUi();
      }
    }
  }

  const POLL_RING_CIRC = 2 * Math.PI * 11; // r=11 in SVG

  function clearPollTimer() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function clearPollCountdown() {
    if (state.pollCountdownTimer) {
      clearInterval(state.pollCountdownTimer);
      state.pollCountdownTimer = null;
    }
  }

  function restartPollCountdown() {
    state.pollCycleStart = Date.now();
    state.pollLastSec = Math.ceil(Number(state.pollIntervalMs || 5000) / 1000);
    updatePollMeterUi();
  }

  function ensurePollCountdownTicker() {
    if (state.pollCountdownTimer) return;
    state.pollCountdownTimer = setInterval(tickPollCountdown, 250);
  }

  /** Pastikan ticker 250ms hidup + siklus Siaga di-reset dari awal. */
  function startPollCountdownUi() {
    ensurePollCountdownTicker();
    restartPollCountdown();
  }

  /**
   * Poll-meter ring metaphor (waiting):
   * Ring fills with elapsed wait time — empty when a wait cycle starts,
   * full just before the next scan. During Polling the ring stays full + pulses.
   */
  function updatePollMeterUi() {
    const meter = el.pollMeter || document.querySelector('.poll-meter');
    if (!meter) return;

    // Scanning: request in flight (auto or manual Refresh).
    if (state.pollBusy) {
      meter.classList.remove('off');
      meter.classList.add('busy');
      if (el.pollRing) {
        el.pollRing.style.strokeDasharray = String(POLL_RING_CIRC);
        el.pollRing.style.strokeDashoffset = '0';
      }
      if (el.pollDot) el.pollDot.classList.remove('tick');
      if (el.pollLabel) el.pollLabel.textContent = t('poll.busy');
      meter.setAttribute('aria-label', t('poll.aria_busy'));
      return;
    }

    meter.classList.remove('busy');

    // OFF: no timers / static empty ring.
    if (!isPollingEnabled()) {
      meter.classList.add('off');
      if (el.pollRing) {
        el.pollRing.style.strokeDasharray = String(POLL_RING_CIRC);
        el.pollRing.style.strokeDashoffset = String(POLL_RING_CIRC);
      }
      if (el.pollLabel) el.pollLabel.textContent = t('poll.off');
      meter.setAttribute('aria-label', t('poll.aria_off'));
      return;
    }

    // Waiting (Siaga): countdown toward next poll.
    meter.classList.remove('off');
    const ms = Math.max(2000, Number(state.pollIntervalMs || state.settings.poll_interval_ms || 5000) || 5000);
    const cycleStart = state.pollCycleStart > 0 ? state.pollCycleStart : Date.now();
    const elapsed = Math.max(0, Date.now() - cycleStart);
    const progress = Math.min(1, elapsed / ms);
    const remaining = Math.max(0, ms - elapsed);
    const secs = Math.max(0, Math.ceil(remaining / 1000));

    if (el.pollRing) {
      el.pollRing.style.strokeDasharray = String(POLL_RING_CIRC);
      el.pollRing.style.strokeDashoffset = String(POLL_RING_CIRC * (1 - progress));
    }

    if (el.pollLabel) {
      el.pollLabel.textContent = secs > 0 ? t('poll.standby', { s: secs }) : t('poll.standby_soon');
    }
    meter.setAttribute('aria-label', secs > 0
      ? t('poll.aria_next', { s: secs })
      : t('poll.aria_soon'));
  }

  function tickPollCountdown() {
    if (state.pollBusy || !isPollingEnabled()) {
      updatePollMeterUi();
      return;
    }
    const ms = Math.max(2000, Number(state.pollIntervalMs || state.settings.poll_interval_ms || 5000) || 5000);
    const cycleStart = state.pollCycleStart > 0 ? state.pollCycleStart : Date.now();
    const elapsed = Math.max(0, Date.now() - cycleStart);
    const remaining = Math.max(0, ms - elapsed);
    const secs = Math.max(0, Math.ceil(remaining / 1000));

    if (secs !== state.pollLastSec && secs > 0 && el.pollDot) {
      el.pollDot.classList.remove('tick');
      void el.pollDot.offsetWidth;
      el.pollDot.classList.add('tick');
    }
    state.pollLastSec = secs;
    updatePollMeterUi();
  }

  /** Setelah poll selesai: mulai hitung mundur penuh + setTimeout ke poll berikutnya. */
  function scheduleNextPollAfterComplete() {
    clearPollTimer();
    if (!isPollingEnabled()) {
      clearPollCountdown();
      updatePollMeterUi();
      return;
    }
    const ms = Math.max(2000, Number(state.pollIntervalMs || state.settings.poll_interval_ms || 5000) || 5000);
    state.pollIntervalMs = ms;
    startPollCountdownUi();
    state.pollTimer = setTimeout(() => poll(true), ms);
  }

  function clearAutomaticPortScanTimer() {
    if (state.portPollTimer) {
      clearTimeout(state.portPollTimer);
      state.portPollTimer = null;
    }
  }

  function scheduleAutomaticPortScan(delayMs = null) {
    clearAutomaticPortScanTimer();
    if (state.settings.port_scan_enabled === false) return;
    const intervalMs = Math.max(
      60000,
      Number(state.settings.port_scan_interval_ms || 300000) || 300000,
    );
    const waitMs = delayMs === null ? intervalMs : Math.max(1000, Number(delayMs) || intervalMs);
    state.portPollTimer = setTimeout(pollPortsAutomatic, waitMs);
  }

  function startAutomaticPortScanning() {
    clearAutomaticPortScanTimer();
    if (state.settings.port_scan_enabled === false) return;
    // The API performs the authoritative due-time check. A short initial delay
    // lets the first ping finish; a lock response is retried after five seconds.
    scheduleAutomaticPortScan(1500);
  }

  async function pollPortsAutomatic() {
    state.portPollTimer = null;
    if (state.settings.port_scan_enabled === false) return;
    if (state.portPollBusy || state.scanPortsBusy) {
      scheduleAutomaticPortScan(5000);
      return;
    }

    state.portPollBusy = true;
    let retryMs = null;
    try {
      const data = await api('poll_ports', {});
      if (data.skipped === 'locked') {
        retryMs = 5000;
        return;
      }
      if (data.skipped === 'port_scan_interval' && Number(data.next_in_ms) > 0) {
        retryMs = Number(data.next_in_ms);
      }
      if (!data.skipped && Array.isArray(data.devices)) {
        const current = Object.fromEntries(state.devices.map((device) => [device.id, device]));
        for (const remote of data.devices) {
          const local = current[remote.id];
          if (!local) continue;
          local.services = Array.isArray(remote.services) ? remote.services : [];
          if (remote.ports_scanned_at) {
            local.ports_scanned_at = remote.ports_scanned_at;
          }
        }
        draw();
        if (Number(data.next_in_ms) > 0) {
          retryMs = Number(data.next_in_ms);
        }
      }
    } catch (_) {
      retryMs = 30000;
    } finally {
      state.portPollBusy = false;
      scheduleAutomaticPortScan(retryMs);
    }
  }

  function isLayoutLocked() {
    return !!state.settings.layout_locked;
  }

  function zoomBounds() {
    return {
      min: Number(state.settings.zoom_min || 0.45),
      max: Number(state.settings.zoom_max || 2.2),
    };
  }

  function syncZoomUi() {
    if (!el.zoomSlider || !el.btnZoomReset) return;
    const { min, max } = zoomBounds();
    const minPct = Math.round(min * 100);
    const maxPct = Math.round(max * 100);
    el.zoomSlider.min = String(minPct);
    el.zoomSlider.max = String(maxPct);
    const pct = Math.round(state.scale * 100);
    el.zoomSlider.value = String(pct);
    el.btnZoomReset.textContent = `${pct}%`;
    const span = maxPct - minPct;
    const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (pct - minPct) / span));
    if (el.zoomFill) el.zoomFill.style.height = `${t * 100}%`;
    if (el.zoomThumb) el.zoomThumb.style.top = `${(1 - t) * 100}%`;
  }

  function syncLockUi() {
    const locked = isLayoutLocked();
    if (el.btnLockLayout) {
      el.btnLockLayout.setAttribute('aria-pressed', locked ? 'true' : 'false');
      el.btnLockLayout.title = locked ? t('dock.unlock') : t('dock.lock');
      el.btnLockLayout.setAttribute('data-i18n-title', locked ? 'dock.unlock' : 'dock.lock');
      el.btnLockLayout.classList.toggle('active', locked);
    }
    if (el.stageWrap) el.stageWrap.classList.toggle('locked', locked);
    if (el.paletteList) el.paletteList.classList.toggle('is-locked', locked);
  }

  function syncGridUi() {
    if (el.stageWrap) el.stageWrap.classList.toggle('show-grid', !!state.settings.show_grid);
  }

  function setZoomAt(nextScale, screenX = null, screenY = null) {
    const { min, max } = zoomBounds();
    const rect = el.stage.parentElement.getBoundingClientRect();
    const sx = screenX == null ? rect.width / 2 : screenX;
    const sy = screenY == null ? rect.height / 2 : screenY;
    const before = screenToWorld(sx, sy);
    state.scale = Math.min(max, Math.max(min, nextScale));
    const after = screenToWorld(sx, sy);
    state.pan.x += (after.x - before.x) * state.scale;
    state.pan.y += (after.y - before.y) * state.scale;
    syncZoomUi();
    draw();
  }

  function zoomBy(factor) {
    setZoomAt(state.scale * factor);
  }

  function zoomToFit(padding = 48) {
    if (!state.devices.length) {
      setZoomAt(1);
      state.pan = { x: 0, y: 0 };
      syncZoomUi();
      draw();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of state.devices) {
      minX = Math.min(minX, d.x);
      minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + deviceW(d));
      maxY = Math.max(maxY, d.y + deviceH(d));
    }
    const rect = el.stage.parentElement.getBoundingClientRect();
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const { min, max } = zoomBounds();
    const scale = Math.min(
      max,
      Math.max(min, Math.min(
        (rect.width - padding * 2) / worldW,
        (rect.height - padding * 2) / worldH,
      )),
    );
    state.scale = scale;
    state.pan.x = (rect.width - worldW * scale) / 2 - minX * scale;
    state.pan.y = (rect.height - worldH * scale) / 2 - minY * scale;
    syncZoomUi();
    draw();
  }

  async function toggleLayoutLock() {
    const next = !isLayoutLocked();
    try {
      const data = await api('save_settings', { ...state.settings, layout_locked: next });
      applySettings(data.settings || { ...state.settings, layout_locked: next });
      toast(next ? t('toast.layout_locked_on') : t('toast.layout_unlocked'));
    } catch (e) {
      toast(e.message);
    }
  }

  function isPollingEnabled() {
    return state.settings.polling_enabled !== false;
  }

  function setDevicesUnknownWhilePollingOff() {
    let changed = false;
    for (const d of state.devices) {
      if ((d.status || 'unknown') !== 'unknown' || d.latency != null) {
        d.status = 'unknown';
        d.latency = null;
        changed = true;
      }
    }
    if (!changed) return;
    if (state.selectedId && isPropsModalOpen()) {
      const d = findDevice(state.selectedId);
      if (d) updateLive(d);
    }
    draw();
  }

  function stopPolling() {
    // Batalkan hasil auto-poll yang masih in-flight (finally lama tidak boleh jadwal ulang).
    state.pollToken += 1;
    state.pollBusyGen += 1;
    state.pollBusy = false;
    clearPollTimer();
    clearPollCountdown();
    state.pollCycleStart = 0;
    // Request mungkin masih jalan (hasil dibuang via token) — meter langsung OFF,
    // jangan biarkan class busy menahan label "Polling".
    const meter = el.pollMeter || document.querySelector('.poll-meter');
    meter?.classList.remove('busy');
    meter?.classList.add('off');
    if (el.pollRing) {
      el.pollRing.style.strokeDasharray = String(POLL_RING_CIRC);
      el.pollRing.style.strokeDashoffset = String(POLL_RING_CIRC);
    }
    if (el.pollLabel) el.pollLabel.textContent = t('poll.off');
    meter?.setAttribute('aria-label', t('poll.aria_off'));
    setDevicesUnknownWhilePollingOff();
    syncAnimLoop();
  }

  function startPolling() {
    if (!isPollingEnabled()) {
      stopPolling();
      return;
    }
    const ms = Math.max(2000, Number(state.settings.poll_interval_ms || 5000) || 5000);

    // Keluar dari visuals OFF segera (sebelum / meskipun poll() early-return).
    const meter = el.pollMeter || document.querySelector('.poll-meter');
    meter?.classList.remove('off');
    syncPollToggleUi();

    // Poll masih in-flight: tampilkan Polling; finally-nya akan mulai Siaga.
    if (state.pollBusy) {
      state.pollIntervalMs = ms;
      ensurePollCountdownTicker();
      updatePollMeterUi();
      syncAnimLoop();
      return;
    }

    // Sudah dalam siklus Siaga aktif dengan interval sama — jangan reset (applySettings setelah toggle).
    if (
      state.pollCountdownTimer
      && state.pollTimer
      && state.pollCycleStart > 0
      && Number(state.pollIntervalMs) === ms
    ) {
      ensurePollCountdownTicker();
      updatePollMeterUi();
      syncAnimLoop();
      return;
    }

    state.pollIntervalMs = ms;
    clearPollTimer();
    clearPollCountdown();
    ensurePollCountdownTicker();
    // Segera poll sekali; Siaga + setTimeout berikutnya dimulai di finally poll.
    poll(true);
    // poll() set busy secara sync sebelum await — jika tidak, fallback Siaga.
    if (!state.pollBusy) {
      startPollCountdownUi();
      state.pollTimer = setTimeout(() => poll(true), ms);
    }
    syncAnimLoop();
  }

  function syncPollToggleUi() {
    const on = isPollingEnabled();
    if (el.pollMeter) el.pollMeter.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (el.setPollingEnabled) el.setPollingEnabled.checked = on;
  }

  async function togglePolling() {
    const next = !isPollingEnabled();
    const prevEnabled = isPollingEnabled();
    // Optimistic UI: meter berubah instan sebelum save_settings selesai.
    state.settings = { ...state.settings, polling_enabled: next };
    syncPollToggleUi();
    if (next) startPolling();
    else stopPolling();
    try {
      const data = await api('save_settings', { ...state.settings, polling_enabled: next });
      applySettings(data.settings || { ...state.settings, polling_enabled: next });
      toast(t(next ? 'toast.polling_on' : 'toast.polling_off'));
    } catch (e) {
      state.settings = { ...state.settings, polling_enabled: prevEnabled };
      syncPollToggleUi();
      if (prevEnabled) startPolling();
      else stopPolling();
      toast(e.message);
    }
  }

  function resolveTheme(raw) {
    let key = String(raw || DEFAULT_SETTINGS.theme).toLowerCase().trim();
    if (key === 'midnight') key = 'dark';
    return THEME_KEYS.includes(key) ? key : DEFAULT_SETTINGS.theme;
  }

  function applyTheme(theme) {
    const key = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', key);
    // Device skins follow theme — force a redraw so boxes swap immediately.
    if (ctx && state.devices) draw();
  }

  function applySettings(settings) {
    const incoming = settings ? { ...settings } : {};
    // Legacy key: show_node_services → show_services
    if (!Object.prototype.hasOwnProperty.call(incoming, 'show_services')
        && Object.prototype.hasOwnProperty.call(incoming, 'show_node_services')) {
      incoming.show_services = incoming.show_node_services !== false;
    }
    delete incoming.show_node_services;
    delete incoming.status_lamp_blink;
    state.settings = { ...DEFAULT_SETTINGS, ...incoming };
    state.settings.theme = resolveTheme(state.settings.theme);
    state.settings.ui_language = normalizeUiLang(state.settings.ui_language);
    state.settings.link_animation_style = resolveLinkAnimStyle(state.settings.link_animation_style);
    state.settings.link_anim_speed = resolveLinkAnimSpeed(state.settings.link_anim_speed);
    syncLinkAnimSpeedLabel();
    applyTheme(state.settings.theme);
    applyUiLanguage(state.settings.ui_language);
    history.max = Math.min(200, Math.max(10, Number(state.settings.history_max || 40)));
    while (history.stack.length > history.max) {
      history.stack.shift();
      history.index = Math.max(-1, history.index - 1);
    }
    const zMin = Number(state.settings.zoom_min || 0.45);
    const zMax = Number(state.settings.zoom_max || 2.2);
    state.scale = Math.min(zMax, Math.max(zMin, state.scale));
    if (!HEADLESS_SNAPSHOT_MODE) {
      startPolling();
      startAutomaticPortScanning();
    }
    syncPollToggleUi();
    syncZoomUi();
    syncLockUi();
    syncGridUi();
    draw();
    if (!HEADLESS_SNAPSHOT_MODE) syncAnimLoop();
  }

  function fillSettingsForm() {
    const s = state.settings;
    el.setPollSec.value = Math.round(Number(s.poll_interval_ms || 5000) / 1000);
    if (el.setPollingEnabled) el.setPollingEnabled.checked = s.polling_enabled !== false;
    syncPollingExtrasUi();
    el.setPingTimeout.value = Number(s.ping_timeout_ms || 1000);
    if (el.setPollMethod) {
      el.setPollMethod.value = s.poll_method === 'sequential' ? 'sequential' : 'parallel';
    }
    if (el.setPingCount) {
      el.setPingCount.value = Math.min(5, Math.max(3, Number(s.ping_count || 5)));
    }
    el.setPortScan.checked = s.port_scan_enabled !== false;
    if (el.setPortScanIntervalMin) {
      el.setPortScanIntervalMin.value = Math.round(
        Number(s.port_scan_interval_ms || 300000) / 60000,
      );
    }
    if (el.setPortScanTimeout) {
      el.setPortScanTimeout.value = Number(s.port_scan_timeout_ms || 350);
    }
    if (el.setPortScanConcurrency) {
      el.setPortScanConcurrency.value = Math.min(
        32,
        Math.max(16, Number(s.port_scan_device_concurrency || 24)),
      );
    }
    if (el.setShowLabel) el.setShowLabel.checked = s.show_label !== false;
    if (el.setShowIp) el.setShowIp.checked = s.show_ip !== false;
    if (el.setShowLatency) el.setShowLatency.checked = s.show_latency !== false;
    if (el.setShowComment) el.setShowComment.checked = s.show_comment !== false;
    if (el.setShowServices) el.setShowServices.checked = s.show_services !== false;
    const ports = Array.isArray(s.common_ports) && s.common_ports.length
      ? s.common_ports
      : DEFAULT_SETTINGS.common_ports;
    const rawNotes = s.common_port_notes;
    const notes = (rawNotes && typeof rawNotes === 'object' && !Array.isArray(rawNotes))
      ? { ...rawNotes }
      : { ...DEFAULT_PORT_NOTES };
    renderCommonPortsTable(ports, notes);
    syncPortScanExtrasUi();
    if (el.setScanPortMethod) {
      el.setScanPortMethod.value = s.scan_port_method === 'sequential' ? 'sequential' : 'parallel';
    }
    if (el.setScanPortMax) {
      el.setScanPortMax.value = Math.min(10000, Math.max(1, Number(s.scan_port_max || 1024)));
    }
    if (el.setScanSubnetMethod) {
      el.setScanSubnetMethod.value = s.scan_subnet_method === 'parallel' ? 'parallel' : 'sequential';
    }
    if (el.setSubnetBatchSize) {
      el.setSubnetBatchSize.value = Math.min(128, Math.max(8, Number(s.subnet_batch_size || 32)));
    }
    syncSubnetMethodUi();
    el.setSubnetTimeout.value = Number(s.subnet_timeout_ms || 200);
    el.setHistoryMax.value = Number(s.history_max || 40);
    el.setZoomMin.value = Number(s.zoom_min || 0.45);
    el.setZoomMax.value = Number(s.zoom_max || 2.2);
    el.setAnimateLinks.checked = s.animate_links !== false;
    if (el.setShowLinkIcon) el.setShowLinkIcon.checked = s.show_link_icon !== false;
    if (el.setShowLinkLabel) el.setShowLinkLabel.checked = s.show_link_label !== false;
    if (el.setShowLinkComment) el.setShowLinkComment.checked = s.show_link_comment !== false;
    if (el.setLinkAnimStyle) {
      const style = resolveLinkAnimStyle(s.link_animation_style);
      el.setLinkAnimStyle.value = style;
    }
    if (el.setLinkAnimSpeed) {
      el.setLinkAnimSpeed.value = String(resolveLinkAnimSpeed(s.link_anim_speed));
      syncLinkAnimSpeedLabel();
    }
    syncLinkAnimControlsUi();
    if (el.setGridSize) el.setGridSize.value = Number(s.grid_size || 24);
    if (el.setSnapDrag) el.setSnapDrag.checked = !!s.snap_drag;
    if (el.setShowGrid) el.setShowGrid.checked = !!s.show_grid;
    syncGridSettingsUi();
    if (el.setTheme) el.setTheme.value = resolveTheme(s.theme);
    if (el.setUiLanguage) el.setUiLanguage.value = normalizeUiLang(s.ui_language);
    if (el.setBackgroundEnabled) el.setBackgroundEnabled.checked = !!s.background_enabled;
    syncBackgroundSchedUi();
    syncColorField(el.setStatusOnlineColor, el.setStatusOnlineColorText, s.status_online_color, DEFAULT_SETTINGS.status_online_color);
    syncColorField(el.setStatusOfflineColor, el.setStatusOfflineColorText, s.status_offline_color, DEFAULT_SETTINGS.status_offline_color);
    syncColorField(el.setStatusUnknownColor, el.setStatusUnknownColorText, s.status_unknown_color, DEFAULT_SETTINGS.status_unknown_color);
  }

  function syncPollingExtrasUi() {
    if (!el.pollingScheduleExtras || !el.setPollingEnabled) return;
    el.pollingScheduleExtras.classList.toggle('hidden', !el.setPollingEnabled.checked);
  }

  function syncPortScanExtrasUi() {
    if (!el.setPortScan) return;
    const enabled = el.setPortScan.checked;
    if (el.portScanScheduleExtras) {
      el.portScanScheduleExtras.classList.toggle('hidden', !enabled);
    }
  }

  function syncGridSettingsUi() {
    if (!el.setShowGrid) return;
    const visible = !!el.setShowGrid.checked;
    if (el.gridSizeExtras) el.gridSizeExtras.classList.toggle('hidden', !visible);
    if (el.snapDragRow) el.snapDragRow.classList.toggle('hidden', !visible);
    if (!visible && el.setSnapDrag) el.setSnapDrag.checked = false;
  }

  function syncBackgroundSchedUi() {
    if (!el.bgSchedHint || !el.setBackgroundEnabled) return;
    el.bgSchedHint.classList.toggle('hidden', !el.setBackgroundEnabled.checked);
  }

  function appendCommonPortRow(portValue, noteValue) {
    if (!el.commonPortsBody) return;
    const tr = document.createElement('tr');

    const tdDrag = document.createElement('td');
    tdDrag.className = 'port-table-drag';
    const dragHandle = document.createElement('span');
    dragHandle.className = 'port-row-drag';
    dragHandle.draggable = true;
    dragHandle.setAttribute('role', 'button');
    dragHandle.tabIndex = 0;
    dragHandle.setAttribute('data-i18n-aria', 'net.port_drag');
    dragHandle.setAttribute('data-i18n-title', 'net.port_drag');
    dragHandle.setAttribute('aria-label', t('net.port_drag'));
    dragHandle.title = t('net.port_drag');
    dragHandle.textContent = '⋮⋮';
    tdDrag.appendChild(dragHandle);

    const tdPort = document.createElement('td');
    tdPort.className = 'port-table-port-cell';
    const portInput = document.createElement('input');
    portInput.type = 'number';
    portInput.className = 'port-table-port';
    portInput.min = '1';
    portInput.max = '65535';
    portInput.step = '1';
    portInput.placeholder = '80';
    portInput.autocomplete = 'off';
    if (portValue != null && portValue !== '') portInput.value = String(portValue);
    tdPort.appendChild(portInput);

    const tdNote = document.createElement('td');
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'port-table-note';
    noteInput.maxLength = 80;
    noteInput.placeholder = '—';
    noteInput.autocomplete = 'off';
    noteInput.value = noteValue != null ? String(noteValue) : '';
    tdNote.appendChild(noteInput);

    const tdDel = document.createElement('td');
    tdDel.className = 'port-table-actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn ghost port-row-del';
    delBtn.setAttribute('aria-label', t('props.delete'));
    delBtn.title = t('props.delete');
    delBtn.textContent = '×';
    tdDel.appendChild(delBtn);

    tr.appendChild(tdDrag);
    tr.appendChild(tdPort);
    tr.appendChild(tdNote);
    tr.appendChild(tdDel);
    el.commonPortsBody.appendChild(tr);
  }

  function clearCommonPortsDropIndicators() {
    if (!el.commonPortsBody) return;
    el.commonPortsBody.querySelectorAll('tr.drop-before, tr.drop-after').forEach((row) => {
      row.classList.remove('drop-before', 'drop-after');
    });
  }

  function bindCommonPortsReorder() {
    if (!el.commonPortsBody || el.commonPortsBody.dataset.reorderBound === '1') return;
    el.commonPortsBody.dataset.reorderBound = '1';
    let dragRow = null;

    el.commonPortsBody.addEventListener('dragstart', (e) => {
      const handle = e.target && e.target.closest ? e.target.closest('.port-row-drag') : null;
      if (!handle || !el.commonPortsBody.contains(handle)) {
        e.preventDefault();
        return;
      }
      const tr = handle.closest('tr');
      if (!tr) {
        e.preventDefault();
        return;
      }
      dragRow = tr;
      tr.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'port-row');
      }
    });

    el.commonPortsBody.addEventListener('dragend', () => {
      if (dragRow) dragRow.classList.remove('is-dragging');
      clearCommonPortsDropIndicators();
      dragRow = null;
    });

    el.commonPortsBody.addEventListener('dragover', (e) => {
      if (!dragRow) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const tr = e.target && e.target.closest ? e.target.closest('tr') : null;
      clearCommonPortsDropIndicators();
      if (!tr || tr === dragRow || !el.commonPortsBody.contains(tr)) return;
      const rect = tr.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      tr.classList.add(before ? 'drop-before' : 'drop-after');
    });

    el.commonPortsBody.addEventListener('dragleave', (e) => {
      if (!dragRow) return;
      const related = e.relatedTarget;
      if (related && el.commonPortsBody.contains(related)) return;
      clearCommonPortsDropIndicators();
    });

    el.commonPortsBody.addEventListener('drop', (e) => {
      if (!dragRow) return;
      e.preventDefault();
      const tr = e.target && e.target.closest ? e.target.closest('tr') : null;
      clearCommonPortsDropIndicators();
      if (!tr || tr === dragRow || !el.commonPortsBody.contains(tr)) {
        dragRow.classList.remove('is-dragging');
        dragRow = null;
        return;
      }
      const rect = tr.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) {
        el.commonPortsBody.insertBefore(dragRow, tr);
      } else {
        el.commonPortsBody.insertBefore(dragRow, tr.nextSibling);
      }
      dragRow.classList.remove('is-dragging');
      dragRow = null;
    });
  }

  function renderCommonPortsTable(ports, notes) {
    if (!el.commonPortsBody) return;
    el.commonPortsBody.replaceChildren();
    const list = Array.isArray(ports) ? ports : [];
    const noteMap = notes && typeof notes === 'object' && !Array.isArray(notes) ? notes : {};
    if (list.length === 0) {
      appendCommonPortRow('', '');
      return;
    }
    list.forEach((p) => {
      const n = Number(p);
      const key = String(n);
      const note = noteMap[key] != null ? noteMap[key] : (noteMap[n] != null ? noteMap[n] : '');
      appendCommonPortRow(Number.isFinite(n) ? n : '', note);
    });
  }

  function readCommonPortsTable() {
    const ports = [];
    const notes = {};
    const seen = new Set();
    if (!el.commonPortsBody) {
      return { ports: [...DEFAULT_SETTINGS.common_ports], notes: { ...DEFAULT_PORT_NOTES } };
    }
    el.commonPortsBody.querySelectorAll('tr').forEach((tr) => {
      const portInput = tr.querySelector('.port-table-port');
      const noteInput = tr.querySelector('.port-table-note');
      const n = parseInt(portInput && portInput.value, 10);
      if (!Number.isFinite(n) || n < 1 || n > 65535 || seen.has(n)) return;
      seen.add(n);
      ports.push(n);
      const note = String(noteInput && noteInput.value != null ? noteInput.value : '').trim().slice(0, 80);
      if (note) notes[String(n)] = note;
    });
    return { ports, notes };
  }

  function syncSubnetMethodUi() {
    if (!el.subnetBatchExtras || !el.setScanSubnetMethod) return;
    el.subnetBatchExtras.classList.toggle(
      'hidden',
      el.setScanSubnetMethod.value !== 'parallel',
    );
  }

  function syncColorField(colorEl, textEl, value, fallback) {
    const hex = normalizeHexColor(value, fallback);
    if (colorEl) colorEl.value = hex;
    if (textEl) textEl.value = hex;
  }

  function readColorField(colorEl, textEl, fallback) {
    const fromText = textEl ? String(textEl.value || '').trim() : '';
    if (fromText && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(fromText)) {
      return normalizeHexColor(fromText, fallback);
    }
    if (colorEl && colorEl.value) return normalizeHexColor(colorEl.value, fallback);
    return fallback;
  }

  function bindColorPair(colorEl, textEl, fallback) {
    if (!colorEl || !textEl) return;
    colorEl.addEventListener('input', () => {
      textEl.value = normalizeHexColor(colorEl.value, fallback);
    });
    textEl.addEventListener('change', () => {
      const hex = normalizeHexColor(textEl.value, fallback);
      textEl.value = hex;
      colorEl.value = hex;
    });
  }

  function readSettingsForm() {
    const { ports: portsRaw, notes: portNotes } = readCommonPortsTable();
    return {
      poll_interval_ms: Math.round(Number(el.setPollSec.value || 5) * 1000),
      polling_enabled: !!(el.setPollingEnabled && el.setPollingEnabled.checked),
      ping_timeout_ms: Number(el.setPingTimeout.value || 1000),
      poll_method: el.setPollMethod && el.setPollMethod.value === 'sequential'
        ? 'sequential'
        : 'parallel',
      ping_count: Math.min(5, Math.max(3, Number(el.setPingCount?.value || 5))),
      port_scan_enabled: !!el.setPortScan.checked,
      port_scan_interval_ms: Math.round(
        Math.min(1440, Math.max(1, Number(el.setPortScanIntervalMin?.value || 5))) * 60000,
      ),
      port_scan_timeout_ms: Math.min(
        5000,
        Math.max(100, Number(el.setPortScanTimeout?.value || 350)),
      ),
      port_scan_device_concurrency: Math.min(
        32,
        Math.max(16, Number(el.setPortScanConcurrency?.value || 24)),
      ),
      common_ports: portsRaw,
      common_port_notes: portNotes,
      scan_port_method: el.setScanPortMethod && el.setScanPortMethod.value === 'sequential'
        ? 'sequential'
        : 'parallel',
      scan_port_max: Math.min(10000, Math.max(1, Number(el.setScanPortMax?.value || 1024))),
      scan_subnet_method: el.setScanSubnetMethod && el.setScanSubnetMethod.value === 'parallel'
        ? 'parallel'
        : 'sequential',
      subnet_batch_size: Math.min(128, Math.max(8, Number(el.setSubnetBatchSize?.value || 32))),
      subnet_timeout_ms: Number(el.setSubnetTimeout.value || 200),
      history_max: Number(el.setHistoryMax.value || 40),
      zoom_min: Number(el.setZoomMin.value || 0.45),
      zoom_max: Number(el.setZoomMax.value || 2.2),
      animate_links: !!el.setAnimateLinks.checked,
      link_animation_style: el.setLinkAnimStyle
        ? resolveLinkAnimStyle(el.setLinkAnimStyle.value)
        : DEFAULT_SETTINGS.link_animation_style,
      link_anim_speed: el.setLinkAnimSpeed
        ? resolveLinkAnimSpeed(el.setLinkAnimSpeed.value)
        : DEFAULT_SETTINGS.link_anim_speed,
      show_link_icon: !!(el.setShowLinkIcon && el.setShowLinkIcon.checked),
      show_link_label: !!(el.setShowLinkLabel && el.setShowLinkLabel.checked),
      show_link_comment: !!(el.setShowLinkComment && el.setShowLinkComment.checked),
      show_label: !!(el.setShowLabel && el.setShowLabel.checked),
      show_ip: !!(el.setShowIp && el.setShowIp.checked),
      show_latency: !!(el.setShowLatency && el.setShowLatency.checked),
      show_comment: !!(el.setShowComment && el.setShowComment.checked),
      show_services: !!(el.setShowServices && el.setShowServices.checked),
      grid_size: Number(el.setGridSize?.value || 24),
      show_grid: !!(el.setShowGrid && el.setShowGrid.checked),
      snap_drag: !!(el.setShowGrid && el.setShowGrid.checked && el.setSnapDrag && el.setSnapDrag.checked),
      // Layout lock is toggled from the zoom dock padlock only.
      layout_locked: !!state.settings.layout_locked,
      theme: resolveTheme(el.setTheme?.value),
      ui_language: normalizeUiLang(el.setUiLanguage?.value),
      background_enabled: !!(el.setBackgroundEnabled && el.setBackgroundEnabled.checked),
      status_online_color: readColorField(
        el.setStatusOnlineColor,
        el.setStatusOnlineColorText,
        DEFAULT_SETTINGS.status_online_color,
      ),
      status_offline_color: readColorField(
        el.setStatusOfflineColor,
        el.setStatusOfflineColorText,
        DEFAULT_SETTINGS.status_offline_color,
      ),
      status_unknown_color: readColorField(
        el.setStatusUnknownColor,
        el.setStatusUnknownColorText,
        DEFAULT_SETTINGS.status_unknown_color,
      ),
    };
  }

  function openSettings() {
    fillSettingsForm();
    fillAccountForm();
    el.modalSettings.classList.remove('hidden');
    el.modalSettings.setAttribute('aria-hidden', 'false');
  }

  function closeSettings() {
    el.modalSettings.classList.add('hidden');
    el.modalSettings.setAttribute('aria-hidden', 'true');
    clearAccountForm();
  }

  let tgTokenDirty = false;

  function isMaskedToken(value) {
    const s = String(value || '');
    return s.includes('•') || s.includes('*');
  }

  function applyTelegramSettingsResponse(settings) {
    if (!settings) return;
    state.settings = { ...DEFAULT_SETTINGS, ...state.settings, ...settings };
    state.settings.telegram_bot_token_set = !!(
      settings.telegram_bot_token_set
      || (settings.telegram_bot_token && String(settings.telegram_bot_token).trim() !== '')
    );
  }

  function fillTgUpDownForm() {
    const s = state.settings;
    if (el.tgNotifyUp) el.tgNotifyUp.checked = s.telegram_notify_up !== false;
    if (el.tgNotifyDown) el.tgNotifyDown.checked = s.telegram_notify_down !== false;
    if (el.tgTplUpPreview) el.tgTplUpPreview.value = s.telegram_tpl_up || DEFAULT_SETTINGS.telegram_tpl_up;
    if (el.tgTplDownPreview) el.tgTplDownPreview.value = s.telegram_tpl_down || DEFAULT_SETTINGS.telegram_tpl_down;
  }

  function syncTgShotScheduleFields() {
    const mode = el.tgShotMode?.value === 'hourly' || el.tgShotMode?.value === 'daily'
      ? el.tgShotMode.value
      : 'interval';
    el.tgShotFieldsInterval?.classList.toggle('hidden', mode !== 'interval');
    el.tgShotFieldsHourly?.classList.toggle('hidden', mode !== 'hourly');
    el.tgShotFieldsDaily?.classList.toggle('hidden', mode !== 'daily');
  }

  function fillTgScreenshotForm() {
    const s = state.settings;
    if (el.tgShotEnabled) el.tgShotEnabled.checked = !!s.telegram_screenshot_enabled;
    if (el.tgShotFormat) {
      el.tgShotFormat.value = s.telegram_screenshot_format === 'jpg' ? 'jpg' : 'png';
    }
    const mode = s.telegram_screenshot_schedule_mode === 'hourly' || s.telegram_screenshot_schedule_mode === 'daily'
      ? s.telegram_screenshot_schedule_mode
      : 'interval';
    if (el.tgShotMode) el.tgShotMode.value = mode;
    if (el.tgShotEvery) {
      el.tgShotEvery.value = Math.min(1440, Math.max(1, Number(s.telegram_screenshot_every_min || 30)));
    }
    if (el.tgShotHourlyMinute) {
      el.tgShotHourlyMinute.value = Math.min(59, Math.max(0, Number(s.telegram_screenshot_hourly_minute ?? 0)));
    }
    if (el.tgShotDailyTime) {
      const raw = String(s.telegram_screenshot_daily_time || '08:00').trim();
      el.tgShotDailyTime.value = /^\d{1,2}:\d{2}$/.test(raw) ? raw.padStart(5, '0') : '08:00';
    }
    syncTgShotScheduleFields();
    if (el.tgShotLastHint) {
      const last = String(s.telegram_screenshot_last_at || '').trim();
      if (last) {
        el.tgShotLastHint.removeAttribute('data-i18n');
        el.tgShotLastHint.textContent = t('tg.shot_last', { at: formatDateTimeHuman(last) });
      } else {
        el.tgShotLastHint.setAttribute('data-i18n', 'tg.shot_last_none');
        el.tgShotLastHint.textContent = t('tg.shot_last_none');
      }
    }
  }

  /** Asia/Jakarta — e.g. "8 Agustus 2026 02:49 WIB" */
  function formatDateTimeHuman(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    const isEn = normalizeUiLang(state.settings?.ui_language) === 'en';
    try {
      const parts = new Intl.DateTimeFormat(isEn ? 'en-GB' : 'id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(dt);
      const get = (type) => parts.find((p) => p.type === type)?.value || '';
      const day = get('day');
      const month = get('month');
      const year = get('year');
      const hour = get('hour').padStart(2, '0');
      const minute = get('minute').padStart(2, '0');
      return `${day} ${month} ${year} ${hour}:${minute} WIB`;
    } catch (_) {
      return raw;
    }
  }

  function fillTgSettingsForm() {
    const s = state.settings;
    tgTokenDirty = false;
    if (el.tgEnabled) el.tgEnabled.checked = !!s.telegram_enabled;
    if (el.tgBotToken) {
      el.tgBotToken.value = String(s.telegram_bot_token || '').trim();
      el.tgBotToken.placeholder = '';
    }
    if (el.tgChatId) el.tgChatId.value = s.telegram_chat_id || '';
  }

  function openTgModal(which) {
    closeAllMenus();
    if (which === 'updown') {
      fillTgUpDownForm();
      el.modalTgUpDown?.classList.remove('hidden');
      el.modalTgUpDown?.setAttribute('aria-hidden', 'false');
    } else if (which === 'screenshot') {
      fillTgScreenshotForm();
      el.modalTgScreenshot?.classList.remove('hidden');
      el.modalTgScreenshot?.setAttribute('aria-hidden', 'false');
    } else if (which === 'settings') {
      fillTgSettingsForm();
      el.modalTgSettings?.classList.remove('hidden');
      el.modalTgSettings?.setAttribute('aria-hidden', 'false');
    }
  }

  function closeTgUpDown() {
    el.modalTgUpDown?.classList.add('hidden');
    el.modalTgUpDown?.setAttribute('aria-hidden', 'true');
  }
  function closeTgScreenshot() {
    el.modalTgScreenshot?.classList.add('hidden');
    el.modalTgScreenshot?.setAttribute('aria-hidden', 'true');
  }
  function closeTgSettings() {
    el.modalTgSettings?.classList.add('hidden');
    el.modalTgSettings?.setAttribute('aria-hidden', 'true');
  }
  function closeAllTgModals() {
    closeTgUpDown();
    closeTgScreenshot();
    closeTgSettings();
  }

  function readTgTokenForSave() {
    if (!el.tgBotToken) return undefined;
    const raw = String(el.tgBotToken.value || '').trim();
    if (!tgTokenDirty) return undefined;
    if (raw === '' || isMaskedToken(raw)) return undefined;
    return raw;
  }

  async function saveTelegramPatch(patch) {
    const data = await api('save_settings', patch);
    applyTelegramSettingsResponse(data.settings || patch);
    if (
      Object.prototype.hasOwnProperty.call(patch, 'telegram_screenshot_enabled')
      || Object.prototype.hasOwnProperty.call(patch, 'telegram_screenshot_format')
    ) {
      telegramCanvasLastFingerprint = '';
    }
    return data;
  }

  // Single source of truth for every report tab/export target — the live
  // table, the Print view, and the Excel export all render the exact same
  // per-tab column set defined here, so a header edit can never drift out
  // of sync with the row cells. Each column knows how to read its raw
  // value (get, used for sorting too), how to display it on screen/print
  // (format) and how to render it for Excel (excel — plain numbers, no
  // "ms" suffix, so Excel treats them as numeric rather than text).
  function textCol(key, labelKey, get) {
    return {
      key,
      labelKey,
      get label() { return t(this.labelKey); },
      type: 'string',
      get,
      format: (v) => escapeHtml(v || '—'),
      excel: (v) => escapeHtml(v || ''),
    };
  }

  function numCol(key, labelKey, get, unit = '') {
    return {
      key,
      labelKey,
      get label() { return t(this.labelKey); },
      type: 'number',
      get,
      format: (v) => (v != null ? `${v}${unit}` : '—'),
      excel: (v) => (v != null ? String(v) : ''),
    };
  }

  function latencyCol(key, labelKey, get) {
    return {
      key,
      labelKey,
      get label() { return t(this.labelKey); },
      type: 'number',
      get: (r) => {
        const raw = get(r);
        if (raw == null || raw === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) ? Math.round(n) : null;
      },
      format: (v) => (v != null ? `${Math.round(Number(v))} ms` : '—'),
      excel: (v) => (v != null ? String(Math.round(Number(v))) : ''),
    };
  }

  // Status ONLINE/OFFLINE: percentage = (count / poll_total) * 100.
  // Whole percentages render as integers (`100%`); otherwise one decimal
  // (`98.3%`). poll_total === 0 → 0% (no division by zero).
  function roundReportPct(n) {
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 10) / 10;
  }

  function formatReportPct(v) {
    const rounded = roundReportPct(Number(v));
    if (rounded == null) return '—';
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text}%`;
  }

  function pctOfPollCol(key, labelKey, getCount) {
    return {
      key,
      labelKey,
      get label() { return t(this.labelKey); },
      type: 'number',
      get: (r) => {
        const total = reportPollTotal(r);
        if (!total || total <= 0) return 0;
        const count = Number(getCount(r) || 0);
        return roundReportPct((100 / total) * count);
      },
      format: (v) => formatReportPct(v),
      // Plain numeric percent (no "%" suffix) so Excel treats the cell as a number.
      excel: (v) => {
        const rounded = roundReportPct(Number(v));
        if (rounded == null) return '';
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
      },
    };
  }

  const COL_LABEL = textCol('label', 'report.col_label', (r) => r.label || '');
  const COL_TYPE = textCol('type', 'report.col_type', (r) => r.type || '');
  const COL_IP = textCol('ip', 'report.col_ip', (r) => r.ip || '');
  const COL_PORT = textCol('port_text', 'report.col_port', (r) => {
    if (r.port_text) return r.port_text;
    const ports = Array.isArray(r.services) ? r.services : [];
    return ports.length ? ports.map(Number).sort((a, b) => a - b).join(', ') : '-';
  });
  const COL_DATE = {
    key: 'date',
    labelKey: 'report.col_date',
    get label() { return t(this.labelKey); },
    type: 'string',
    get: (r) => r.date || '',
    format: (v) => escapeHtml(formatReportDateYmd(v)),
    excel: (v) => escapeHtml(v || ''),
  };
  // poll_total = online_samples + offline_samples (the `poll` action
  // records exactly one of the two per completed ping, see
  // pamantau_record_stats / pamantau_poll_total in includes/network.php).
  function reportPollTotal(r) {
    return r.poll_total != null
      ? Number(r.poll_total)
      : Number(r.online_samples || 0) + Number(r.offline_samples || 0);
  }
  const COL_POLLING = numCol('poll_total', 'report.col_polling', reportPollTotal);
  const COL_AVG_LATENCY = latencyCol('avg_latency', 'report.col_avg', (r) => (r.avg_latency != null ? Number(r.avg_latency) : null));
  const COL_MIN_LATENCY = latencyCol('latency_min', 'report.col_min', (r) => (r.latency_min != null ? Number(r.latency_min) : null));
  const COL_MAX_LATENCY = latencyCol('latency_max', 'report.col_max', (r) => (r.latency_max != null ? Number(r.latency_max) : null));
  const COL_ONLINE = pctOfPollCol('online_samples', 'report.col_online', (r) => Number(r.online_samples || 0));
  const COL_OFFLINE = pctOfPollCol('offline_samples', 'report.col_offline', (r) => Number(r.offline_samples || 0));
  function dailyPctCol(key, labelKey) {
    return {
      key,
      labelKey,
      get label() { return t(this.labelKey); },
      type: 'number',
      get: (r) => (r.has_data ? Number(r[key]) : null),
      format: (v) => (v == null ? '-' : formatReportPct(v)),
      excel: (v) => (v == null ? '' : String(roundReportPct(Number(v)))),
    };
  }
  const COL_DAILY_ONLINE = dailyPctCol('online_ratio', 'report.col_online');
  const COL_DAILY_OFFLINE = dailyPctCol('offline_ratio', 'report.col_offline');

  // "Online terbanyak" and "Offline terbanyak" are merged into one
  // sortable Status report — ONLINE/OFFLINE show percent of polls
  // (count / poll_total * 100). Latency keeps its own column set untouched.
  const REPORT_DEFS = {
    status: {
      titleKey: 'report.status_title',
      get title() { return t(this.titleKey); },
      columns: [COL_LABEL, COL_TYPE, COL_IP, COL_POLLING, COL_AVG_LATENCY, COL_ONLINE, COL_OFFLINE],
      rows: () => (state.reports && state.reports.most_online) || [],
    },
    latency: {
      titleKey: 'report.latency_title',
      get title() { return t(this.titleKey); },
      columns: [COL_LABEL, COL_TYPE, COL_IP, COL_POLLING, COL_MIN_LATENCY, COL_MAX_LATENCY, COL_AVG_LATENCY],
      rows: () => (state.reports && state.reports.best_latency) || [],
    },
    ports: {
      titleKey: 'report.ports_title',
      get title() { return t(this.titleKey); },
      requiresPeriod: false,
      columns: [COL_LABEL, COL_TYPE, COL_IP, COL_PORT],
      rows: () => (state.reports && state.reports.port_rows) || [],
    },
    individual: {
      titleKey: 'report.individual_title',
      get title() {
        const device = state.reports && state.reports.individual_device;
        return device && device.label
          ? `${t(this.titleKey)} - ${device.label}`
          : t(this.titleKey);
      },
      columns: [COL_DATE, COL_POLLING, COL_DAILY_ONLINE, COL_DAILY_OFFLINE],
      rows: () => (state.reports && state.reports.individual_daily) || [],
    },
  };
  // Old menu/tab names map straight onto the merged Status report.
  const REPORT_TAB_ALIASES = { online: 'status', offline: 'status' };

  function normalizeReportTab(tab) {
    const t = REPORT_TAB_ALIASES[tab] || tab;
    return REPORT_DEFS[t] ? t : 'status';
  }

  // Shared sort helper used by the Status AND Latency tables (click a
  // <th> to sort asc/desc by that column, string- or number-aware).
  function getReportRows(tab) {
    const t = normalizeReportTab(tab);
    const def = REPORT_DEFS[t];
    const rows = (def.rows() || []).slice();
    const sort = state.reportSort[t];
    if (!sort || !sort.key) return rows;
    const col = def.columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (col.type === 'number') {
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * dir;
      }
      const sa = String(va || '').toLowerCase();
      const sb = String(vb || '').toLowerCase();
      if (sa < sb) return -1 * dir;
      if (sa > sb) return 1 * dir;
      return 0;
    });
    return rows;
  }

  function setReportSort(tab, key) {
    const t = normalizeReportTab(tab);
    const cur = state.reportSort[t];
    state.reportSort[t] = (cur && cur.key === key)
      ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' };
  }

  async function loadReports(from, to) {
    const payload = { from, to };
    if (normalizeReportTab(state.reportTab) === 'individual') {
      payload.device_id = state.reportDeviceId || '';
    }
    const data = await api('reports', payload);
    state.reports = data;
    state.reportFrom = data.from || from;
    state.reportTo = data.to || to;
    state.reportApplied = true;
    renderReport();
  }

  function ymdLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function defaultReportRange() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: ymdLocal(from), to: ymdLocal(now) };
  }

  function individualReportRange() {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 29);
    return { from: ymdLocal(from), to: ymdLocal(to) };
  }

  function formatReportDateYmd(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '';
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const lang = (I18N && typeof I18N.getLang === 'function' ? I18N.getLang() : state.settings.ui_language) === 'en'
      ? 'en-GB'
      : 'id-ID';
    return dt.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function reportPeriodText(from = state.reportFrom, to = state.reportTo) {
    if (normalizeReportTab(state.reportTab) === 'ports') return '';
    if (!from || !to) return '';
    return t('report.period_label', {
      from: formatReportDateYmd(from),
      to: formatReportDateYmd(to),
    });
  }

  function setReportPeriodError(msg) {
    if (!el.reportPeriodError) return;
    if (!msg) {
      el.reportPeriodError.textContent = '';
      el.reportPeriodError.classList.add('hidden');
      return;
    }
    el.reportPeriodError.textContent = msg;
    el.reportPeriodError.classList.remove('hidden');
  }

  function fillReportPeriodInputs(from, to) {
    const range = normalizeReportTab(state.reportTab) === 'individual'
      ? individualReportRange()
      : defaultReportRange();
    if (el.reportDateFrom) el.reportDateFrom.value = from || state.reportFrom || range.from;
    if (el.reportDateTo) el.reportDateTo.value = to || state.reportTo || range.to;
    setReportPeriodError('');
  }

  function populateReportDeviceSelect() {
    if (!el.reportDeviceSelect) return;
    const current = state.reportDeviceId || state.selectedId || (state.devices[0] && state.devices[0].id) || '';
    el.reportDeviceSelect.innerHTML = state.devices.map((device) => (
      `<option value="${escapeHtml(device.id)}">${escapeHtml(device.label || device.ip || device.id)}</option>`
    )).join('');
    if (current && state.devices.some((device) => device.id === current)) {
      el.reportDeviceSelect.value = current;
    }
    state.reportDeviceId = el.reportDeviceSelect.value || '';
  }

  function showReportPeriodGate() {
    if (el.reportPeriodGate) el.reportPeriodGate.classList.remove('hidden');
    if (el.reportTableWrap) el.reportTableWrap.classList.add('hidden');
    if (el.btnPrintReport) el.btnPrintReport.classList.add('hidden');
    if (el.btnExcelReport) el.btnExcelReport.classList.add('hidden');
    if (el.btnChangeReportPeriod) el.btnChangeReportPeriod.classList.add('hidden');
    fillReportPeriodInputs();
    const tab = normalizeReportTab(state.reportTab);
    const def = REPORT_DEFS[tab];
    const individual = tab === 'individual';
    if (el.reportDateFields) el.reportDateFields.classList.remove('hidden');
    if (el.reportDeviceField) el.reportDeviceField.classList.toggle('hidden', !individual);
    if (el.reportPeriodDesc) {
      el.reportPeriodDesc.textContent = t(individual ? 'report.individual_desc' : 'report.period_desc');
    }
    if (individual) populateReportDeviceSelect();
    if (el.reportTitle) el.reportTitle.textContent = def.title;
  }

  function showReportTableView() {
    if (el.reportPeriodGate) el.reportPeriodGate.classList.add('hidden');
    if (el.reportTableWrap) el.reportTableWrap.classList.remove('hidden');
    if (el.btnPrintReport) el.btnPrintReport.classList.remove('hidden');
    if (el.btnExcelReport) el.btnExcelReport.classList.remove('hidden');
    if (el.btnChangeReportPeriod) {
      el.btnChangeReportPeriod.classList.toggle('hidden', normalizeReportTab(state.reportTab) === 'ports');
      const label = el.btnChangeReportPeriod.querySelector('.btn-label');
      if (label) label.textContent = t(state.reportTab === 'individual' ? 'report.change_filter' : 'report.change_period');
    }
  }

  function renderReportHead(tab = state.reportTab) {
    if (!el.reportHeadRow) return;
    const tabKey = normalizeReportTab(tab);
    const def = REPORT_DEFS[tabKey];
    const sort = state.reportSort[tabKey] || {};
    const ths = [`<th class="col-num">${escapeHtml(t('report.col_no'))}</th>`].concat(def.columns.map((c) => {
      const active = sort.key === c.key;
      const dir = active ? sort.dir : null;
      const arrow = active ? `<span class="sort-arrow" aria-hidden="true">${dir === 'desc' ? '▼' : '▲'}</span>` : '';
      const ariaSort = active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';
      return `<th class="sortable${active ? ' sorted' : ''}" data-key="${c.key}" aria-sort="${ariaSort}" title="${escapeHtml(t('report.sort_by', { label: c.label }))}">${escapeHtml(c.label)}${arrow}</th>`;
    }));
    el.reportHeadRow.innerHTML = ths.join('');
  }

  function renderReportRowsInto(target, tab = state.reportTab) {
    if (!target) return;
    const tabKey = normalizeReportTab(tab);
    const def = REPORT_DEFS[tabKey];
    const rows = getReportRows(tabKey);
    target.innerHTML = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        ${def.columns.map((c) => `<td>${c.format(c.get(r))}</td>`).join('')}
      </tr>
    `).join('') || `<tr><td colspan="${def.columns.length + 1}">${t('report.empty')}</td></tr>`;
  }

  function renderReport() {
    const tab = normalizeReportTab(state.reportTab);
    state.reportTab = tab;
    const def = REPORT_DEFS[tab];
    if (el.reportTitle) el.reportTitle.textContent = def.title;
    if (el.reportPeriodLabel) {
      el.reportPeriodLabel.textContent = reportPeriodText();
    }
    if (el.reportEmptyNotice) {
      const hasData = tab === 'ports'
        ? !!(state.reports && state.reports.port_rows && state.reports.port_rows.length)
        : tab === 'individual'
          ? !!(state.reports && state.reports.individual_has_data)
          : !!(state.reports && state.reports.has_data);
      el.reportEmptyNotice.classList.toggle('hidden', hasData || !state.reportApplied);
      el.reportEmptyNotice.textContent = t('report.empty_historical');
    }
    if (!state.reportApplied) {
      showReportPeriodGate();
      return;
    }
    showReportTableView();
    renderReportHead(tab);
    renderReportRowsInto(el.reportRows, tab);
  }

  function closeReportsModal() {
    el.modalReports.classList.add('hidden');
    el.modalReports.setAttribute('aria-hidden', 'true');
    state.reportApplied = false;
    state.reports = null;
    showReportPeriodGate();
  }

  function openReportPeriodPicker(tab) {
    state.reportTab = normalizeReportTab(tab || state.reportTab || 'status');
    if (state.reportTab === 'ports') {
      state.reports = {
        has_data: state.devices.length > 0,
        port_rows: state.devices.map((device) => ({
          ...device,
          port_text: Array.isArray(device.services) && device.services.length
            ? [...device.services].map(Number).sort((a, b) => a - b).join(', ')
            : '-',
        })),
      };
      state.reportFrom = null;
      state.reportTo = null;
      state.reportApplied = true;
      el.modalReports.classList.remove('hidden');
      el.modalReports.setAttribute('aria-hidden', 'false');
      renderReport();
      return;
    }
    state.reportApplied = false;
    state.reports = null;
    showReportPeriodGate();
    el.modalReports.classList.remove('hidden');
    el.modalReports.setAttribute('aria-hidden', 'false');
    if (el.reportDateFrom) el.reportDateFrom.focus();
  }

  async function applyReportPeriod() {
    const individual = normalizeReportTab(state.reportTab) === 'individual';
    const from = el.reportDateFrom ? String(el.reportDateFrom.value || '').trim() : '';
    const to = el.reportDateTo ? String(el.reportDateTo.value || '').trim() : '';
    if (individual) {
      state.reportDeviceId = el.reportDeviceSelect ? String(el.reportDeviceSelect.value || '') : '';
      if (!state.reportDeviceId) {
        setReportPeriodError(t('report.device_required'));
        return;
      }
    }
    if (!from || !to) {
      setReportPeriodError(t('report.invalid_dates'));
      return;
    }
    if (from > to) {
      setReportPeriodError(t('report.invalid_range'));
      return;
    }
    setReportPeriodError('');
    try {
      await loadReports(from, to);
    } catch (err) {
      setReportPeriodError(err.message || String(err));
    }
  }

  function cancelReportPeriod() {
    // From "Ubah periode": restore the last applied report instead of closing.
    if (state.reports && state.reportFrom && state.reportTo) {
      state.reportApplied = true;
      setReportPeriodError('');
      renderReport();
      return;
    }
    closeReportsModal();
  }

  function reportTableHtml(tab = state.reportTab) {
    const tabKey = normalizeReportTab(tab);
    const def = REPORT_DEFS[tabKey];
    const rows = getReportRows(tabKey);
    const body = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        ${def.columns.map((c) => `<td>${c.format(c.get(r))}</td>`).join('')}
      </tr>
    `).join('') || `<tr><td colspan="${def.columns.length + 1}">${t('report.empty')}</td></tr>`;
    const headCells = [t('report.col_no'), ...def.columns.map((c) => c.label)].map((h) =>
      `<th style="text-align:left;border-bottom:1px solid #ccd;padding:8px">${escapeHtml(h)}</th>`
    ).join('');
    const period = reportPeriodText();
    const periodHtml = period
      ? `<p style="margin:0 0 12px;font:600 13px Sora,sans-serif;color:#334155">${escapeHtml(period)}</p>`
      : '';
    return `
      <h2 style="font-family:Sora,sans-serif;margin:0 0 8px">${escapeHtml(def.title)}</h2>
      ${periodHtml}
      <table style="width:100%;border-collapse:collapse;font-family:Sora,sans-serif;font-size:13px">
        <thead><tr>${headCells}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      <p style="margin-top:16px;color:#5b6b86;font:600 12px Sora,sans-serif">Copyright © JERIYANT - BARAMCITY</p>
    `;
  }

  async function ensureReportsLoaded() {
    if (
      state.reports
      && state.reportApplied
      && (normalizeReportTab(state.reportTab) === 'ports' || (state.reportFrom && state.reportTo))
    ) return;
    throw new Error(t('report.invalid_dates'));
  }

  async function printReport(tab = state.reportTab) {
    await ensureReportsLoaded();
    const tabKey = normalizeReportTab(tab);
    const def = REPORT_DEFS[tabKey];
    const win = window.open('', '_blank');
    if (!win) {
      toast(t('toast.print_popup'));
      return;
    }
    const period = reportPeriodText();
    const docTitle = period ? `${def.title} — ${period}` : def.title;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(docTitle)}</title>
      <style>
        body{margin:24px;color:#0a1628;font:14px/1.4 system-ui,sans-serif}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{padding:8px 6px;border-bottom:1px solid #d0d7e2;text-align:left}
        th{background:#e8edf4;color:#4a5568;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
        @media print{
          body{margin:12px}
          th{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#e8edf4 !important}
        }
        @media (max-width:640px){
          body{margin:12px}
          table{font-size:11px}
          th{background:#e8edf4 !important}
        }
      </style></head><body>
      ${reportTableHtml(tabKey)}
      <script>window.onload=()=>{window.focus();window.print();}</script>
      </body></html>`);
    win.document.close();
  }

  async function exportReportExcel(tab = state.reportTab) {
    await ensureReportsLoaded();
    const tabKey = normalizeReportTab(tab);
    const def = REPORT_DEFS[tabKey];
    const rows = getReportRows(tabKey);
    // SpreadsheetML HTML yang bisa dibuka Excel. Numeric columns use raw
    // numbers (no "ms" suffix) so Excel treats them as numeric rather
    // than text. Column order stays in sync with REPORT_DEFS[tab].columns
    // automatically since both the head and body iterate the same array.
    const trHead = [t('report.col_no'), ...def.columns.map((c) => c.label)].map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const trBody = rows.map((r, i) => `<tr>
      <td>${i + 1}</td>
      ${def.columns.map((c) => `<td>${c.excel(c.get(r))}</td>`).join('')}
    </tr>`).join('') || `<tr><td colspan="${def.columns.length + 1}">${escapeHtml(t('report.empty'))}</td></tr>`;
    const period = reportPeriodText();
    const periodHtml = period ? `<p>${escapeHtml(period)}</p>` : '';

    const xml = `﻿<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>${escapeHtml(def.title).slice(0, 31)}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<h3>${escapeHtml(def.title)}</h3>
${periodHtml}
<table border="1"><thead><tr>${trHead}</tr></thead><tbody>${trBody}</tbody></table>
<p>Copyright © JERIYANT - BARAMCITY</p>
</body></html>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const slug = String(def.title || 'laporan').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const rangeSlug = (state.reportFrom && state.reportTo)
      ? `${state.reportFrom}_${state.reportTo}`
      : new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `laporan-${slug}-${rangeSlug}.xls`);
    toast(t('toast.export_excel', { title: def.title }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // Events
  const stageTouchPoints = new Map();
  let stagePinch = null;

  function stageTouchPair() {
    return [...stageTouchPoints.values()].slice(0, 2);
  }

  function cancelStageInteractionForPinch() {
    clearLongPress();
    // A first finger may briefly start dragging a device before the second
    // finger lands. Restore its origin so pinch never moves topology items.
    if (state.dragging && state.dragOrigins) {
      for (const [id, origin] of Object.entries(state.dragOrigins)) {
        const device = findDevice(id);
        if (device) {
          device.x = origin.x;
          device.y = origin.y;
        }
      }
    }
    state.panning = false;
    state.panStart = null;
    state.dragging = null;
    state.dragOrigins = null;
    state.marquee = null;
    state.linking = false;
    state.connectFrom = null;
    state.rewiring = null;
    el.stage.classList.remove('connect-mode');
    el.stage.style.cursor = 'default';
  }

  function beginStagePinch() {
    const [a, b] = stageTouchPair();
    if (!a || !b) return false;
    cancelStageInteractionForPinch();
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    stagePinch = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      scale: state.scale,
      anchor: screenToWorld(midpoint.x, midpoint.y),
    };
    draw();
    return true;
  }

  el.stage.addEventListener('dragover', (e) => e.preventDefault());
  el.stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (isLayoutLocked()) {
      toast(t('toast.layout_locked'));
      return;
    }
    const type = e.dataTransfer.getData('text/pamantau-type');
    if (!type) return;
    const p = getPointer(e);
    const w = screenToWorld(p.x, p.y);
    await addDeviceAt(type, w.x, w.y);
  });

  el.stage.addEventListener('pointerdown', (e) => {
    hideCtx();
    if (e.pointerType === 'touch') {
      e.preventDefault();
      const point = getPointer(e);
      stageTouchPoints.set(e.pointerId, {
        ...point,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      try { el.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (stageTouchPoints.size >= 2 && beginStagePinch()) return;
    }
    // Blur palette/doc inputs so Ctrl+arrow Rapikan shortcuts are not swallowed
    // by isEditableTarget / stopPropagation on focused fields.
    const active = document.activeElement;
    if (active && active !== document.body && isEditableTarget(active) && typeof active.blur === 'function') {
      try { active.blur(); } catch (_) { /* ignore */ }
    }
    const locked = isLayoutLocked();
    if (e.button === 1 || (e.button === 0 && state.spacePan)) {
      if (locked) {
        toast(t('toast.layout_locked'));
        return;
      }
      state.panning = true;
      state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
      el.stage.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const p = getPointer(e);
    const w = screenToWorld(p.x, p.y);
    const plus = hitPlus(w.x, w.y);
    const linkHit = hitConnection(w.x, w.y);
    const hit = hitDevice(w.x, w.y);
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;

    // Start link from + handle
    if (plus) {
      if (locked) {
        toast(t('toast.layout_locked'));
        return;
      }
      state.linking = true;
      state.connectFrom = plus.device.id;
      state.hoverId = plus.device.id;
      el.stage.classList.add('connect-mode');
      el.stage.setPointerCapture(e.pointerId);
      draw();
      return;
    }

    // Rewire connection endpoint
    if (linkHit && linkHit.end) {
      if (locked) {
        selectConnection(linkHit.conn.id);
        toast(t('toast.layout_locked'));
        return;
      }
      selectConnection(linkHit.conn.id);
      state.rewiring = { connId: linkHit.conn.id, end: linkHit.end };
      el.stage.classList.add('connect-mode');
      el.stage.setPointerCapture(e.pointerId);
      draw();
      return;
    }

    // Select connection body
    if (linkHit && !hit) {
      if (additive) {
        selectConnection(linkHit.conn.id, {
          toggle: e.ctrlKey || e.metaKey,
          additive: e.shiftKey && !(e.ctrlKey || e.metaKey),
        });
      } else if (!isConnSelected(linkHit.conn.id)) {
        selectConnection(linkHit.conn.id);
      } else {
        state.selectedConnId = linkHit.conn.id;
        state.selectedIds.clear();
        state.selectedId = null;
        syncInspector();
        draw();
      }
      armLongPress(e, () => {
        if (!isConnSelected(linkHit.conn.id)) selectConnection(linkHit.conn.id);
        showLinkCtx(e.clientX, e.clientY, linkHit.conn);
      });
      return;
    }

    if (hit) {
      if (additive) {
        selectDevice(hit.id, { toggle: e.ctrlKey || e.metaKey, additive: e.shiftKey && !(e.ctrlKey || e.metaKey) });
      } else if (!isSelected(hit.id)) {
        selectDevice(hit.id);
      } else {
        state.selectedId = hit.id;
        state.selectedConnectionIds.clear();
        state.selectedConnId = null;
        syncInspector();
      }

      armLongPress(e, () => {
        if (!isSelected(hit.id)) selectDevice(hit.id);
        showCtx(e.clientX, e.clientY, hit);
      });

      if (locked) {
        draw();
        return;
      }

      const dragIds = isSelected(hit.id) ? [...state.selectedIds] : [hit.id];
      state.dragging = hit.id;
      state.dragOffset = { x: w.x, y: w.y };
      state.dragOrigins = {};
      for (const id of dragIds) {
        const d = findDevice(id);
        if (d) state.dragOrigins[id] = { x: d.x, y: d.y };
      }
      el.stage.setPointerCapture(e.pointerId);
    } else if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      // Touch on empty canvas pans (marquee is desktop-only)
      if (locked) {
        toast(t('toast.layout_locked'));
        return;
      }
      if (!additive) clearSelection();
      state.panning = true;
      state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
      el.stage.style.cursor = 'grabbing';
      el.stage.setPointerCapture(e.pointerId);
      syncInspector();
      draw();
    } else {
      // Start marquee block selection
      if (!additive) clearSelection();
      state.marquee = { x: w.x, y: w.y, w: 0, h: 0, x0: w.x, y0: w.y, additive };
      armLongPress(e, () => {
        state.marquee = null;
        showEmptyCtx(e.clientX, e.clientY, w.x, w.y);
      });
      syncInspector();
      el.stage.setPointerCapture(e.pointerId);
      draw();
    }
  });

  el.stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && stageTouchPoints.has(e.pointerId)) {
      e.preventDefault();
      const point = getPointer(e);
      stageTouchPoints.set(e.pointerId, {
        ...point,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (stagePinch && stageTouchPoints.size >= 2) {
        const [a, b] = stageTouchPair();
        const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { min, max } = zoomBounds();
        state.scale = Math.min(max, Math.max(
          min,
          stagePinch.scale * (distance / stagePinch.distance),
        ));
        // Keep the world point between both fingers fixed while also allowing
        // the midpoint to move, giving natural pinch-zoom plus two-finger pan.
        state.pan.x = midpoint.x - stagePinch.anchor.x * state.scale;
        state.pan.y = midpoint.y - stagePinch.anchor.y * state.scale;
        syncZoomUi();
        scheduleDraw();
        return;
      }
    }
    const p = getPointer(e);
    state._mouseWorld = screenToWorld(p.x, p.y);

    if (state.longPressOrigin) {
      const dx = e.clientX - state.longPressOrigin.x;
      const dy = e.clientY - state.longPressOrigin.y;
      if ((dx * dx + dy * dy) > 100) clearLongPress();
    }

    if (state.panning && state.panStart) {
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      scheduleDraw();
      return;
    }

    if (state.marquee) {
      const box = normalizeRect(state.marquee.x0, state.marquee.y0, state._mouseWorld.x, state._mouseWorld.y);
      state.marquee = { ...state.marquee, ...box };
      scheduleDraw();
      return;
    }

    if (state.rewiring) {
      const over = hitDevice(state._mouseWorld.x, state._mouseWorld.y);
      state.hoverId = over ? over.id : null;
      el.stage.style.cursor = over ? 'copy' : 'crosshair';
      scheduleDraw();
      return;
    }

    if (state.linking && state.connectFrom) {
      const over = hitDevice(state._mouseWorld.x, state._mouseWorld.y);
      state.hoverId = over ? over.id : state.connectFrom;
      el.stage.style.cursor = over && over.id !== state.connectFrom ? 'copy' : 'crosshair';
      scheduleDraw();
      return;
    }

    if (state.dragging && state.dragOrigins) {
      const dx = state._mouseWorld.x - state.dragOffset.x;
      const dy = state._mouseWorld.y - state.dragOffset.y;
      for (const [id, origin] of Object.entries(state.dragOrigins)) {
        const d = findDevice(id);
        if (!d) continue;
        let nx = origin.x + dx;
        let ny = origin.y + dy;
        if (state.settings.snap_drag) {
          nx = snapValue(nx);
          ny = snapValue(ny);
        }
        d.x = nx;
        d.y = ny;
      }
      scheduleDraw();
      return;
    }

    // Hover hit-tests (esp. hitConnection) are costly on large maps —
    // coalesce to one pass per animation frame.
    scheduleHoverPass();
  });

  el.stage.addEventListener('pointerup', async (e) => {
    clearLongPress();
    if (e.pointerType === 'touch') {
      const wasPinching = !!stagePinch;
      stageTouchPoints.delete(e.pointerId);
      if (wasPinching) {
        stagePinch = null;
        state.panning = false;
        state.panStart = null;
        // Continue as a normal one-finger pan if one finger remains down.
        const remaining = [...stageTouchPoints.values()][0];
        if (remaining && !isLayoutLocked()) {
          state.panning = true;
          state.panStart = {
            x: remaining.clientX - state.pan.x,
            y: remaining.clientY - state.pan.y,
          };
          el.stage.style.cursor = 'grabbing';
        }
        return;
      }
    }
    if (state.panning) {
      state.panning = false;
      state.panStart = null;
      el.stage.style.cursor = state.spacePan ? 'grab' : 'default';
      return;
    }

    if (state.rewiring) {
      const p = getPointer(e);
      const w = screenToWorld(p.x, p.y);
      const target = hitDevice(w.x, w.y);
      const info = state.rewiring;
      const conn = findConnection(info.connId);
      state.rewiring = null;
      el.stage.classList.remove('connect-mode');
      el.stage.style.cursor = 'default';

      if (conn && target) {
        const nextFrom = info.end === 'from' ? target.id : conn.from;
        const nextTo = info.end === 'to' ? target.id : conn.to;
        if (nextFrom !== nextTo && (nextFrom !== conn.from || nextTo !== conn.to)) {
          const err = connectionValidationError(findDevice(nextFrom), findDevice(nextTo));
          if (err) {
            toast(err);
            draw();
            return;
          }
          try {
            const data = await api('upsert_connection', {
              id: conn.id,
              from: nextFrom,
              to: nextTo,
              label: conn.label || '',
              comment: conn.comment || '',
              link_type: normalizeLinkType(conn.link_type),
            });
            state.connections = data.connections;
            pushHistory();
            selectConnection(conn.id);
            toast(t('toast.conn_moved'));
          } catch (err2) {
            toast(err2.message);
            draw();
          }
          return;
        }
      }
      draw();
      return;
    }

    if (state.linking) {
      const p = getPointer(e);
      const w = screenToWorld(p.x, p.y);
      const target = hitDevice(w.x, w.y);
      const fromId = state.connectFrom;
      state.linking = false;
      state.connectFrom = null;
      el.stage.classList.remove('connect-mode');
      el.stage.style.cursor = 'default';

      if (target && fromId && target.id !== fromId) {
        const validationErr = connectionValidationError(findDevice(fromId), target);
        if (validationErr) {
          toast(validationErr);
          draw();
          return;
        }
        try {
          const data = await api('upsert_connection', { from: fromId, to: target.id });
          state.connections = data.connections;
          pushHistory();
          toast(t('toast.conn_created'));
        } catch (err) {
          toast(err.message);
        }
      }
      draw();
      return;
    }

    if (state.marquee) {
      const box = normalizeRect(state.marquee.x0, state.marquee.y0, state._mouseWorld.x, state._mouseWorld.y);
      const additive = state.marquee.additive;
      const hitIds = devicesInMarquee(box);
      const hitConnIds = connectionsInMarquee(box);
      if (box.w >= 4 || box.h >= 4) {
        if (additive) {
          setSelection([...new Set([...state.selectedIds, ...hitIds])], null, { clearConnections: false });
          setConnectionSelection(
            [...new Set([...state.selectedConnectionIds, ...hitConnIds])],
            null,
            { clearDevices: false },
          );
        } else {
          setSelection(hitIds, null, { clearConnections: false });
          setConnectionSelection(hitConnIds, null, { clearDevices: false });
        }
        syncInspector();
      } else if (!additive) {
        clearSelection();
        syncInspector();
      }
      state.marquee = null;
      draw();
      return;
    }

    if (state.dragging) {
      state.dragging = null;
      state.dragOrigins = null;
      try { await saveLayout(); } catch (_) {}
    }
  });

  el.stage.addEventListener('pointercancel', (e) => {
    clearLongPress();
    if (e.pointerType === 'touch') stageTouchPoints.delete(e.pointerId);
    stagePinch = null;
    state.panning = false;
    state.panStart = null;
    state.dragging = null;
    state.dragOrigins = null;
    state.marquee = null;
    state.linking = false;
    state.connectFrom = null;
    state.rewiring = null;
    el.stage.classList.remove('connect-mode');
    el.stage.style.cursor = 'default';
    draw();
  });

  el.stage.addEventListener('pointerleave', () => {
    if (!state.linking && !state.dragging && !state.marquee && !state.rewiring) {
      if (state.hoverId || state.hoverConnId) {
        state.hoverId = null;
        state.hoverConnId = null;
        draw();
      }
      el.stage.style.cursor = 'default';
    }
  });

  // Capture-phase: text fields get an edit menu. Cursor/Simple Browser often
  // suppresses the native OS context menu, so stage's bubble handler alone was
  // never enough (modal/palette inputs are not under #stage).
  document.addEventListener('contextmenu', (e) => {
    const field = textEditableFieldFrom(e.target);
    if (!field) return;
    e.preventDefault();
    e.stopPropagation();
    showEditCtx(e.clientX, e.clientY, field);
  }, true);

  el.stage.addEventListener('contextmenu', (e) => {
    // Safety: never open the canvas menu for form fields.
    if (isEditableTarget(e.target)) return;
    hideEditCtx();
    e.preventDefault();
    const p = getPointer(e);
    const w = screenToWorld(p.x, p.y);
    const linkHit = hitConnection(w.x, w.y);
    const hit = hitDevice(w.x, w.y);

    // A device box always wins over an overlapping cable. This prevents a
    // stale connection hover/end-point hit from opening the cable menu when
    // the user clearly right-clicked a component.
    if (hit) {
      if (!isSelected(hit.id)) selectDevice(hit.id);
      else {
        state.selectedId = hit.id;
        state.selectedConnectionIds.clear();
        state.selectedConnId = null;
        syncInspector();
        draw();
      }
      showCtx(e.clientX, e.clientY, hit);
      return;
    }

    if (linkHit) {
      const additive = e.ctrlKey || e.metaKey;
      if (additive) {
        selectConnection(linkHit.conn.id, { toggle: true });
      } else if (!isConnSelected(linkHit.conn.id)) selectConnection(linkHit.conn.id);
      else {
        state.selectedConnId = linkHit.conn.id;
        state.selectedIds.clear();
        state.selectedId = null;
        syncInspector();
        draw();
      }
      showLinkCtx(e.clientX, e.clientY, linkHit.conn);
      return;
    } else {
      showEmptyCtx(e.clientX, e.clientY, w.x, w.y);
    }
  });

  el.stage.addEventListener('dblclick', (e) => {
    e.preventDefault();
    hideCtx();
    const p = getPointer(e);
    const w = screenToWorld(p.x, p.y);
    const hit = hitDevice(w.x, w.y);
    if (!hit) return;
    selectDevice(hit.id);
    openPropsModal();
  });

  // Wheel/trackpad zoom must keep working while layout is locked; only
  // editing/dragging/panning/connecting are gated by isLayoutLocked().
  el.stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = getPointer(e);
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setZoomAt(state.scale * delta, p.x, p.y);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const editing = isEditableTarget(document.activeElement);

    if (e.code === 'Space' && !editing && !isLayoutLocked()) {
      state.spacePan = true;
      el.stage.style.cursor = 'grab';
    }
    // Canvas shortcuts must not steal Ctrl+C/V/A/Z or Delete from form fields.
    if (!editing) {
      if (e.key === 'Delete') {
        if (state.selectedIds.size || state.selectedConnectionIds.size) {
          deleteSelectedCanvasItems();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
        || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection(state.devices.map((d) => d.id), null, { clearConnections: false });
        setConnectionSelection(
          state.connections.map((c) => c.id),
          null,
          { clearDevices: false },
        );
        syncInspector();
        draw();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelectedDevices();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const rect = el.stage.getBoundingClientRect();
        const center = screenToWorld(rect.width / 2, rect.height / 2);
        const at = state.ctxPasteAt || center;
        pasteDevicesAt(at.x, at.y);
      }
      // Rapikan / align shortcuts (Ctrl|⌘ + arrows; Ctrl|⌘+Shift + letters).
      // Prefer e.code so layout/OS quirks don't break Arrow* / letter matching.
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey) {
        let arrangeAct = null;
        const code = e.code;
        if (!e.shiftKey) {
          if (code === 'ArrowLeft' || e.key === 'ArrowLeft') arrangeAct = 'align-left';
          else if (code === 'ArrowRight' || e.key === 'ArrowRight') arrangeAct = 'align-right';
          else if (code === 'ArrowUp' || e.key === 'ArrowUp') arrangeAct = 'align-top';
          else if (code === 'ArrowDown' || e.key === 'ArrowDown') arrangeAct = 'align-bottom';
        } else {
          const keyUpper = (e.key || '').toUpperCase();
          if (code === 'KeyE' || keyUpper === 'E') arrangeAct = 'align-hcenter';
          else if (code === 'KeyM' || keyUpper === 'M') arrangeAct = 'align-vcenter';
          else if (code === 'KeyH' || keyUpper === 'H') arrangeAct = 'dist-h';
          else if (code === 'KeyV' || keyUpper === 'V') arrangeAct = 'dist-v';
          else if (code === 'KeyR' || keyUpper === 'R') arrangeAct = 'pack-h';
          else if (code === 'KeyG' || keyUpper === 'G') arrangeAct = 'pack-v';
        }
        if (arrangeAct) {
          e.preventDefault();
          arrangeAction(arrangeAct);
        }
      }
    }
    if (e.key === 'Escape') {
      if (el.busy && !el.busy.classList.contains('hidden') && state.busyController) {
        cancelBusyOperation();
        return;
      }
      if (el.editCtxMenu && !el.editCtxMenu.classList.contains('hidden')) {
        hideEditCtx();
        return;
      }
      if (!el.ctxMenu.classList.contains('hidden')) {
        if (el.ctxTypeWrap && el.ctxTypeWrap.classList.contains('open')) {
          closeCtxType();
          return;
        }
        if (el.ctxArrangeWrap && el.ctxArrangeWrap.classList.contains('open')) {
          closeCtxArrange();
          return;
        }
        if (el.ctxLinkTypeWrap && el.ctxLinkTypeWrap.classList.contains('open')) {
          closeCtxLinkType();
          return;
        }
        hideCtx();
        return;
      }
      if (el.fileMenu && !el.fileMenu.classList.contains('hidden')) {
        closeFileMenu();
        return;
      }
      if (el.reportsMenu && !el.reportsMenu.classList.contains('hidden')) {
        closeReportsMenu();
        return;
      }
      if (el.notifMenu && !el.notifMenu.classList.contains('hidden')) {
        closeNotifMenu();
        return;
      }
      if (el.quickMenu && !el.quickMenu.classList.contains('hidden')) {
        closeQuickMenu();
        return;
      }
      if (el.modalTgUpDown && !el.modalTgUpDown.classList.contains('hidden')) {
        closeTgUpDown();
        return;
      }
      if (el.modalTgScreenshot && !el.modalTgScreenshot.classList.contains('hidden')) {
        closeTgScreenshot();
        return;
      }
      if (el.modalTgSettings && !el.modalTgSettings.classList.contains('hidden')) {
        closeTgSettings();
        return;
      }
      if (isScanSubnetModalOpen()) {
        closeScanSubnetModal();
        return;
      }
      if (isPingModalOpen()) {
        closePingModal();
        return;
      }
      if (isTracerouteModalOpen()) {
        closeTracerouteModal();
        return;
      }
      if (isScanPortsModalOpen()) {
        closeScanPortsModal();
        return;
      }
      if (isScanResultsModalOpen()) {
        closeScanResultsModal();
        return;
      }
      if (el.modalProps && !el.modalProps.classList.contains('hidden')) {
        closePropsModal();
        return;
      }
      if (!el.modalSettings.classList.contains('hidden')) {
        closeSettings();
        return;
      }
      if (!el.modalReports.classList.contains('hidden')) {
        closeReportsModal();
        return;
      }
      state.linking = false;
      state.rewiring = null;
      state.connectFrom = null;
      state.marquee = null;
      el.stage.classList.remove('connect-mode');
      el.stage.style.cursor = 'default';
      hideCtx();
      clearSelection();
      syncInspector();
      draw();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spacePan = false;
      el.stage.style.cursor = state.linking ? 'crosshair' : 'default';
    }
  });

  document.addEventListener('click', (e) => {
    if (!el.ctxMenu.contains(e.target)) hideCtx();
    if (el.editCtxMenu && !el.editCtxMenu.contains(e.target)) hideEditCtx();
  });

  if (el.editCtxMenu) {
    el.editCtxMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-edit]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      await runEditCtxAction(btn.dataset.edit);
    });
  }

  // Keep flyouts open while interacting; don't let stage/document handlers race.
  el.ctxMenu.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  el.ctxMenu.querySelectorAll('.ctx-submenu-wrap').forEach((wrap) => {
    wrap.addEventListener('mouseenter', () => positionCtxSubmenu(wrap));
  });

  el.ctxMenu.addEventListener('click', async (e) => {
    if (e.target.closest('#ctxOpenTrigger')) {
      e.stopPropagation();
      if (!el.ctxOpenWrap || !el.ctxOpenTrigger) return;
      const open = !el.ctxOpenWrap.classList.contains('open');
      closeCtxType();
      closeCtxArrange();
      closeCtxLinkType();
      el.ctxOpenWrap.classList.toggle('open', open);
      el.ctxOpenTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) positionCtxOpen();
      return;
    }

    const openPortBtn = e.target.closest('button[data-open-port]');
    if (openPortBtn) {
      e.stopPropagation();
      const portVal = openPortBtn.dataset.openPort;
      const targetId = state.ctxTarget;
      hideCtx();
      openDeviceInBrowserWithPort(targetId, parseInt(portVal, 10));
      return;
    }

    if (e.target.closest('#ctxTypeTrigger')) {
      e.stopPropagation();
      if (!el.ctxTypeWrap || !el.ctxTypeTrigger) return;
      const open = !el.ctxTypeWrap.classList.contains('open');
      closeCtxArrange();
      closeCtxLinkType();
      el.ctxTypeWrap.classList.toggle('open', open);
      el.ctxTypeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) positionCtxType();
      return;
    }

    const setTypeBtn = e.target.closest('button[data-set-type]');
    if (setTypeBtn) {
      e.stopPropagation();
      hideCtx();
      await changeSelectedType(setTypeBtn.dataset.setType);
      return;
    }

    if (e.target.closest('#ctxLinkTypeTrigger')) {
      e.stopPropagation();
      const open = !el.ctxLinkTypeWrap.classList.contains('open');
      closeCtxType();
      closeCtxArrange();
      el.ctxLinkTypeWrap.classList.toggle('open', open);
      el.ctxLinkTypeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) positionCtxLinkType();
      return;
    }

    const setLinkTypeBtn = e.target.closest('button[data-set-link-type]');
    if (setLinkTypeBtn) {
      e.stopPropagation();
      hideCtx();
      await changeSelectedLinkType(setLinkTypeBtn.dataset.setLinkType);
      return;
    }

    if (e.target.closest('#ctxArrangeTrigger')) {
      e.stopPropagation();
      if (!el.ctxArrangeWrap || !el.ctxArrangeTrigger) return;
      const open = !el.ctxArrangeWrap.classList.contains('open');
      closeCtxType();
      closeCtxLinkType();
      el.ctxArrangeWrap.classList.toggle('open', open);
      el.ctxArrangeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) positionCtxArrange();
      return;
    }

    const arrangeBtn = e.target.closest('button[data-arrange]');
    if (arrangeBtn) {
      e.stopPropagation();
      const act = arrangeBtn.dataset.arrange;
      hideCtx();
      if (act) await arrangeAction(act);
      return;
    }

    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = state.ctxTarget;
    const linkId = state.ctxLinkId;
    const pasteAt = state.ctxPasteAt ? { ...state.ctxPasteAt } : null;
    hideCtx();

    if (act === 'copy') {
      await copySelectedDevices();
      return;
    }
    if (act === 'undo') {
      await undo();
      return;
    }
    if (act === 'redo') {
      await redo();
      return;
    }
    if (act === 'paste') {
      if (pasteAt) await pasteDevicesAt(pasteAt.x, pasteAt.y);
      else {
        const rect = el.stage.getBoundingClientRect();
        const center = screenToWorld(rect.width / 2, rect.height / 2);
        await pasteDevicesAt(center.x, center.y);
      }
      return;
    }

    if (act === 'link-edit' && linkId) {
      selectConnection(linkId);
      openPropsModal();
      return;
    }
    if (act === 'link-delete') {
      if (state.selectedConnectionIds.size > 1) deleteConnection(null);
      else deleteConnection(linkId || null);
      return;
    }

    if (!id) return;
    if (act === 'open') {
      openDeviceInBrowser(id);
      return;
    }
    if (act === 'edit') {
      selectDevice(id);
      openPropsModal();
    }
    if (act === 'ping') openPingModal(id);
    if (act === 'traceroute') openTracerouteModal(id);
    if (act === 'scan-ports') openScanPortsModal(id);
    if (act === 'scan-subnet') openScanSubnetModal(id);
    if (act === 'delete') {
      if (isSelected(id) && state.selectedIds.size > 1) deleteDevice(null);
      else deleteDevice(id);
    }
  });

  el.linkPropsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = findConnection(state.selectedConnId);
    if (!c) return;
    try {
      const data = await api('upsert_connection', {
        id: c.id,
        from: c.from,
        to: c.to,
        label: el.linkLabel.value.trim(),
        comment: el.linkComment.value.trim(),
        link_type: normalizeLinkType(el.linkType.value),
      });
      state.connections = data.connections;
      pushHistory();
      selectConnection(c.id);
      toast(t('toast.props_saved'));
      closePropsModal();
    } catch (err) {
      toast(err.message);
    }
  });

  if (el.linkType) {
    el.linkType.addEventListener('change', () => {
      updateLinkTypeSwatch(el.linkType.value);
    });
  }

  el.propsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedId) return;
    const d = findDevice(state.selectedId);
    if (!d) return;
    const type = el.propType.value;
    const payload = {
      id: d.id,
      type,
      label: el.propLabel.value.trim() || 'Device',
      ip: el.propIp.value.trim(),
      comment: el.propComment.value.trim(),
      x: d.x,
      y: d.y,
      services: d.services || [],
      status: d.status || 'unknown',
      latency: d.latency,
    };
    try {
      await persistDevice(payload);
      toast(t('toast.props_saved'));
      closePropsModal();
    } catch (err) {
      toast(err.message);
    }
  });

  if (el.btnPropsSave) {
    el.btnPropsSave.addEventListener('click', () => {
      if (state.selectedConnId) {
        if (typeof el.linkPropsForm.requestSubmit === 'function') el.linkPropsForm.requestSubmit();
        else el.linkPropsForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        return;
      }
      if (state.selectedId) {
        if (typeof el.propsForm.requestSubmit === 'function') el.propsForm.requestSubmit();
        else el.propsForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
  }
  if (el.btnPropsDelete) {
    el.btnPropsDelete.addEventListener('click', () => {
      if (state.selectedConnectionIds.size || state.selectedConnId) {
        deleteConnection(null);
        return;
      }
      if (state.selectedIds.size) deleteDevice(null);
    });
  }
  if (el.pollMeter) {
    el.pollMeter.addEventListener('click', () => {
      closeAllMenus();
      togglePolling();
    });
    el.pollMeter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        closeAllMenus();
        togglePolling();
      }
    });
  }

  // Zoom dock controls are intentionally not guarded by isLayoutLocked();
  // locking only disables edit/drag/pan/connect actions, not zoom.
  el.btnZoomIn.addEventListener('click', () => zoomBy(1.12));
  el.btnZoomOut.addEventListener('click', () => zoomBy(1 / 1.12));
  el.btnZoomReset.addEventListener('click', () => setZoomAt(1));
  el.btnZoomFit.addEventListener('click', () => zoomToFit());
  syncArrangeShortcutHints();
  el.zoomSlider.addEventListener('input', () => {
    setZoomAt(Number(el.zoomSlider.value) / 100);
  });
  el.btnLockLayout.addEventListener('click', () => toggleLayoutLock());

  function withDrawContext(otherCtx, fn) {
    const prev = ctx;
    ctx = otherCtx;
    try {
      fn();
    } finally {
      ctx = prev;
    }
  }

  async function fullProjectPayload() {
    // Local files contain topology only. Poll counters, live status/latency,
    // and aggregate history remain authoritative in the server database.
    const devices = state.devices.map((device) => {
      const {
        status: _status,
        latency: _latency,
        poll_count: _pollCount,
        ports_scanned_at: _portsScannedAt,
        ...topologyDevice
      } = device;
      return topologyDevice;
    });
    return {
      app: 'Pamantau',
      exported_at: new Date().toISOString(),
      devices,
      connections: state.connections,
    };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function syncDocLabel() {
    const name = projectDisplayName();
    // "Saved" hanya jika sudah ada file (Save/Open) dan belum ada perubahan.
    const hasFile = !!state.doc.name;
    const saved = hasFile && !state.docDirty;
    if (el.docLabel) {
      el.docLabel.textContent = t('brand.tagline');
    }
    document.title = 'Pamantau';
    if (el.paletteDocName && document.activeElement !== el.paletteDocName) {
      el.paletteDocName.value = state.doc.title
        || (state.doc.name ? String(state.doc.name).replace(/\.json$/i, '') : '');
    }
    const statusLabel = saved ? t('doc.saved') : t('doc.unsaved');
    if (el.paletteDocStatus) {
      el.paletteDocStatus.textContent = statusLabel;
      el.paletteDocStatus.classList.toggle('is-saved', saved);
      el.paletteDocStatus.classList.toggle('is-unsaved', !saved);
    }
    if (el.paletteDoc) {
      el.paletteDoc.title = t('doc.tip', { name, status: statusLabel });
    }
  }

  function projectDisplayName() {
    const titled = String(state.doc.title || '').trim();
    if (titled) return titled.replace(/\.json$/i, '');
    if (state.doc.name) return String(state.doc.name).replace(/\.json$/i, '');
    return t('palette.untitled');
  }

  function sanitizeProjectFileBase(raw) {
    const cleaned = String(raw || '')
      .trim()
      .replace(/\.json$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || '';
  }

  function suggestedSaveName() {
    const base = sanitizeProjectFileBase(projectDisplayName());
    if (!base || base.toLowerCase() === 'untitled') {
      return `pamantau-${new Date().toISOString().slice(0, 10)}.json`;
    }
    return `${base}.json`;
  }

  function currentProjectTitleBase() {
    if (el.paletteDocName && document.activeElement === el.paletteDocName) {
      return sanitizeProjectFileBase(el.paletteDocName.value);
    }
    return sanitizeProjectFileBase(state.doc.title || '');
  }

  /** True when title matches associated file base name (e.g. foo.json → foo). */
  function projectTitleMatchesAssociatedFile() {
    if (!state.doc.name) return false;
    const fileBase = sanitizeProjectFileBase(state.doc.name);
    const titleBase = currentProjectTitleBase();
    return !!fileBase && fileBase === titleBase;
  }

  function saveActsAsSaveAs() {
    return !projectTitleMatchesAssociatedFile();
  }

  function commitProjectTitleFromInput() {
    if (!el.paletteDocName) return;
    const next = sanitizeProjectFileBase(el.paletteDocName.value);
    const prev = sanitizeProjectFileBase(state.doc.title || (state.doc.name || ''));
    state.doc.title = next;
    el.paletteDocName.value = next;
    if (next !== prev) {
      markDocDirty();
      return;
    }
    persistDocMeta();
    syncDocLabel();
  }

  function markDocDirty() {
    state.docDirty = true;
    persistDocMeta();
    syncDocLabel();
  }

  function markDocClean() {
    state.docDirty = false;
    persistDocMeta();
    syncDocLabel();
  }

  const DOC_META_KEY = 'pamantau.docMeta';
  const DOC_IDB_NAME = 'pamantau-doc';
  const DOC_IDB_STORE = 'handles';
  const DOC_IDB_KEY = 'topology';

  function persistDocMeta() {
    try {
      localStorage.setItem(DOC_META_KEY, JSON.stringify({
        name: state.doc.name || null,
        title: state.doc.title || '',
        dirty: !!state.docDirty,
      }));
    } catch (_) { /* ignore quota / private mode */ }
  }

  function loadDocMeta() {
    try {
      const raw = localStorage.getItem(DOC_META_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        name: parsed.name ? String(parsed.name) : null,
        title: parsed.title != null ? String(parsed.title) : '',
        dirty: !!parsed.dirty,
      };
    } catch (_) {
      return null;
    }
  }

  function openDocIdb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DOC_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DOC_IDB_STORE)) {
          db.createObjectStore(DOC_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open failed'));
    });
  }

  async function storeFileHandle(handle) {
    try {
      const db = await openDocIdb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DOC_IDB_STORE, 'readwrite');
        const store = tx.objectStore(DOC_IDB_STORE);
        if (handle) store.put(handle, DOC_IDB_KEY);
        else store.delete(DOC_IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (_) { /* ignore */ }
  }

  async function loadStoredFileHandle() {
    try {
      const db = await openDocIdb();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(DOC_IDB_STORE, 'readonly');
        const req = tx.objectStore(DOC_IDB_STORE).get(DOC_IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return handle || null;
    } catch (_) {
      return null;
    }
  }

  async function ensureFileHandlePermission(handle, mode = 'readwrite', { request = true } = {}) {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    try {
      let perm = await handle.queryPermission({ mode });
      if (perm === 'granted') return true;
      if (request && perm !== 'denied' && typeof handle.requestPermission === 'function') {
        perm = await handle.requestPermission({ mode });
      }
      return perm === 'granted';
    } catch (_) {
      return false;
    }
  }

  async function rememberDoc(partial = {}) {
    state.doc = {
      name: partial.name !== undefined ? partial.name : state.doc.name,
      handle: partial.handle !== undefined ? partial.handle : state.doc.handle,
      title: partial.title !== undefined ? partial.title : state.doc.title,
    };
    persistDocMeta();
    if (partial.handle !== undefined) {
      await storeFileHandle(partial.handle || null);
    }
    syncDocLabel();
  }

  async function restoreDocSession() {
    const meta = loadDocMeta();
    if (meta) {
      state.doc.name = meta.name;
      state.doc.title = meta.title || (meta.name ? sanitizeProjectFileBase(meta.name) : '');
      state.docDirty = !!meta.dirty;
    }
    const handle = await loadStoredFileHandle();
    if (handle) {
      // Keep the handle even if permission is still "prompt" — requestPermission
      // needs a user gesture (e.g. Save click). Nulling it here made Save act like Save as.
      state.doc.handle = handle;
      const ok = await ensureFileHandlePermission(handle, 'readwrite', { request: false });
      if (ok) {
        try {
          const file = await handle.getFile();
          if (file && file.name) {
            state.doc.name = file.name;
            if (!state.doc.title) {
              state.doc.title = sanitizeProjectFileBase(file.name);
            }
          }
        } catch (_) { /* keep meta name */ }
      }
    }
    persistDocMeta();
    syncDocLabel();
  }

  function clearDoc() {
    state.doc = { name: null, handle: null, title: '' };
    state.docDirty = false;
    try { localStorage.removeItem(DOC_META_KEY); } catch (_) { /* ignore */ }
    storeFileHandle(null);
    syncDocLabel();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function deviceWorldBounds(pad = 40) {
    if (!state.devices.length) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600, w: 800, h: 600 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of state.devices) {
      minX = Math.min(minX, d.x);
      minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + deviceW(d));
      maxY = Math.max(maxY, d.y + deviceH(d));
    }
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function colorWithAlpha(color, alpha) {
    const value = String(color || '').trim();
    const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgba) {
      return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${alpha})`;
    }
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = Number.parseInt(hex[1], 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }
    return `rgba(255,255,255,${alpha})`;
  }

  function paintTopologyCanvasBackground(c, w, h, background = null) {
    if (background) {
      c.fillStyle = background;
      c.fillRect(0, 0, w, h);
      return;
    }

    const styles = getComputedStyle(document.documentElement);
    const stage0 = styles.getPropertyValue('--stage-0').trim() || '#f4f6fa';
    const stage1 = styles.getPropertyValue('--stage-1').trim() || '#e9eef6';
    const stageGlow = styles.getPropertyValue('--stage-glow').trim() || 'rgba(255,255,255,.98)';

    // Mirrors .stage-wrap: linear-gradient(160deg, stage-0, stage-1)
    // with the radial stage glow layered above it.
    const angle = 160 * Math.PI / 180;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const linear = c.createLinearGradient(
      cx - dx * half,
      cy - dy * half,
      cx + dx * half,
      cy + dy * half,
    );
    linear.addColorStop(0, stage0);
    linear.addColorStop(1, stage1);
    c.fillStyle = linear;
    c.fillRect(0, 0, w, h);

    const gx = w * 0.5;
    const gy = h * 0.3;
    const radius = Math.max(
      Math.hypot(gx, gy),
      Math.hypot(w - gx, gy),
      Math.hypot(gx, h - gy),
      Math.hypot(w - gx, h - gy),
    );
    const radial = c.createRadialGradient(gx, gy, 0, gx, gy, radius);
    radial.addColorStop(0, stageGlow);
    radial.addColorStop(0.58, colorWithAlpha(stageGlow, 0));
    radial.addColorStop(1, colorWithAlpha(stageGlow, 0));
    c.fillStyle = radial;
    c.fillRect(0, 0, w, h);
  }

  function drawTopologyCanvasGrid(c, box, pixelRatio) {
    if (!state.settings.show_grid) return;
    const g = gridSize();
    const x0 = Math.floor(box.minX / g) * g;
    const y0 = Math.floor(box.minY / g) * g;
    const x1 = Math.ceil(box.maxX / g) * g;
    const y1 = Math.ceil(box.maxY / g) * g;
    const snapX = (x, lineWidth) => {
      const px = (x - box.minX) * pixelRatio;
      const snapped = lineWidth <= 1 ? Math.round(px) + 0.5 : Math.round(px);
      return box.minX + snapped / pixelRatio;
    };
    const snapY = (y, lineWidth) => {
      const px = (y - box.minY) * pixelRatio;
      const snapped = lineWidth <= 1 ? Math.round(px) + 0.5 : Math.round(px);
      return box.minY + snapped / pixelRatio;
    };

    c.save();
    c.lineCap = 'butt';
    c.beginPath();
    for (let x = x0, i = Math.round(x0 / g); x <= x1 + 0.001; x += g, i += 1) {
      if (i % 4 === 0) continue;
      const sx = snapX(x, 1);
      c.moveTo(sx, y0);
      c.lineTo(sx, y1);
    }
    for (let y = y0, i = Math.round(y0 / g); y <= y1 + 0.001; y += g, i += 1) {
      if (i % 4 === 0) continue;
      const sy = snapY(y, 1);
      c.moveTo(x0, sy);
      c.lineTo(x1, sy);
    }
    c.strokeStyle = 'rgba(26,106,255,.08)';
    c.lineWidth = 1;
    c.stroke();

    c.beginPath();
    for (let x = x0, i = Math.round(x0 / g); x <= x1 + 0.001; x += g, i += 1) {
      if (i % 4 !== 0) continue;
      const sx = snapX(x, 2);
      c.moveTo(sx, y0);
      c.lineTo(sx, y1);
    }
    for (let y = y0, i = Math.round(y0 / g); y <= y1 + 0.001; y += g, i += 1) {
      if (i % 4 !== 0) continue;
      const sy = snapY(y, 2);
      c.moveTo(x0, sy);
      c.lineTo(x1, sy);
    }
    c.strokeStyle = 'rgba(26,106,255,.16)';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  function renderTopologyCanvas({ pixelRatio = 2, background = null } = {}) {
    const box = deviceWorldBounds(48);
    const renderRatio = Math.min(
      Math.max(0.01, Number(pixelRatio) || 2),
      3600 / Math.max(1, box.w),
      2700 / Math.max(1, box.h),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.min(3600, Math.floor(box.w * renderRatio)));
    canvas.height = Math.max(1, Math.min(2700, Math.floor(box.h * renderRatio)));
    const c = canvas.getContext('2d');
    c.setTransform(renderRatio, 0, 0, renderRatio, 0, 0);
    paintTopologyCanvasBackground(c, box.w, box.h, background);
    c.translate(-box.minX, -box.minY);
    drawTopologyCanvasGrid(c, box, renderRatio);

    withDrawContext(c, () => {
      const prevSelected = state.selectedIds;
      const prevSelectedId = state.selectedId;
      const prevHover = state.hoverId;
      const prevConn = state.selectedConnId;
      const prevConnIds = state.selectedConnectionIds;
      const prevHoverConn = state.hoverConnId;
      const prevConnectFrom = state.connectFrom;
      const prevLinking = state.linking;
      state.selectedIds = new Set();
      state.selectedId = null;
      state.hoverId = null;
      state.selectedConnId = null;
      state.selectedConnectionIds = new Set();
      state.hoverConnId = null;
      state.connectFrom = null;
      state.linking = false;
      try {
        const byId = Object.fromEntries(state.devices.map((d) => [d.id, d]));
        for (const conn of state.connections) {
          const a = byId[conn.from];
          const b = byId[conn.to];
          if (!a || !b) continue;
          drawConnection(conn, a, b, false);
        }
        for (const d of state.devices) drawDevice(d);
      } finally {
        state.selectedIds = prevSelected;
        state.selectedId = prevSelectedId;
        state.hoverId = prevHover;
        state.selectedConnId = prevConn;
        state.selectedConnectionIds = prevConnIds;
        state.hoverConnId = prevHoverConn;
        state.connectFrom = prevConnectFrom;
        state.linking = prevLinking;
      }
    });

    return canvas;
  }

  let telegramCanvasLastFingerprint = '';
  let telegramCanvasUploadLimitBytes = 1536 * 1024;

  function telegramCanvasSnapshotSource(format = null) {
    const settings = state.settings || {};
    const devices = state.devices.map((d) => ({
      id: d.id,
      type: d.type,
      label: d.label,
      ip: d.ip,
      comment: d.comment,
      x: d.x,
      y: d.y,
      services: d.services,
      status: d.status,
      latency: d.latency,
    }));
    const source = JSON.stringify({
      renderer: 2,
      format: format === 'jpg' ? 'jpg' : 'png',
      settings: {
        theme: settings.theme,
        show_grid: settings.show_grid,
        grid_size: settings.grid_size,
        show_link_icon: settings.show_link_icon,
        show_link_label: settings.show_link_label,
        show_link_comment: settings.show_link_comment,
        show_label: settings.show_label,
        show_ip: settings.show_ip,
        show_latency: settings.show_latency,
        show_comment: settings.show_comment,
        show_services: settings.show_services,
        status_online_color: settings.status_online_color,
        status_offline_color: settings.status_offline_color,
        status_unknown_color: settings.status_unknown_color,
      },
      devices,
      connections: state.connections,
    });
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return {
      source,
      fingerprint: `canvas-v2-${(hash >>> 0).toString(16).padStart(8, '0')}-${source.length}`,
    };
  }

  function canvasToBlob(canvas, mime, quality = undefined) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas tidak dapat diubah menjadi gambar'));
      }, mime, quality);
    });
  }

  function downscaleTopologyCanvas(source, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(source.width * scale));
    canvas.height = Math.max(1, Math.floor(source.height * scale));
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function buildTelegramCanvasSnapshot(format = null) {
    const requested = format === 'jpg' ? 'jpg' : 'png';
    let canvas = renderTopologyCanvas({ pixelRatio: 2 });
    const preferredUploadBytes = Math.min(
      7 * 1024 * 1024,
      Math.max(128 * 1024, Number(telegramCanvasUploadLimitBytes) || 1536 * 1024),
    );
    let actual = requested;
    let mime = requested === 'jpg' ? 'image/jpeg' : 'image/png';
    let blob = await canvasToBlob(canvas, mime, requested === 'jpg' ? 0.92 : undefined);

    // Prefer the selected format, then progressively compress and resize.
    // Layout/styling remain identical; only output resolution changes when the
    // active PHP upload_max_filesize requires it.
    if (blob.size > preferredUploadBytes) {
      actual = 'jpg';
      mime = 'image/jpeg';
      blob = await canvasToBlob(canvas, mime, 0.86);
    }
    if (blob.size > preferredUploadBytes) {
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.74);
    }
    if (blob.size > preferredUploadBytes) {
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.62);
    }

    for (let attempt = 0; blob.size > preferredUploadBytes && attempt < 4; attempt += 1) {
      const ratio = Math.max(
        0.35,
        Math.min(0.88, Math.sqrt(preferredUploadBytes / blob.size) * 0.9),
      );
      const next = downscaleTopologyCanvas(canvas, ratio);
      if (next.width === canvas.width && next.height === canvas.height) break;
      canvas = next;
      blob = await canvasToBlob(canvas, 'image/jpeg', attempt < 2 ? 0.76 : 0.62);
      actual = 'jpg';
      mime = 'image/jpeg';
    }

    if (blob.size > preferredUploadBytes) {
      throw new Error(
        `Snapshot canvas masih melebihi batas server (${Math.round(preferredUploadBytes / 1024)} KB)`,
      );
    }
    return { blob, format: actual, mime };
  }

  async function uploadTelegramCanvasSnapshot({
    action = 'telegram_test_screenshot',
    format = null,
    force = false,
  } = {}) {
    const requested = format === null
      ? (state.settings.telegram_screenshot_format === 'jpg' ? 'jpg' : 'png')
      : (format === 'jpg' ? 'jpg' : 'png');
    const source = telegramCanvasSnapshotSource(requested);
    if (!force && source.fingerprint === telegramCanvasLastFingerprint) {
      return { ok: true, skipped: 'unchanged' };
    }

    let image = await buildTelegramCanvasSnapshot(requested);
    let data = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const form = new FormData();
      form.set('fingerprint', source.fingerprint);
      form.set('telegram_screenshot_format', image.format);
      form.set(
        'snapshot',
        image.blob,
        image.format === 'jpg' ? 'pamantau-topology.jpg' : 'pamantau-topology.png',
      );
      try {
        data = await apiMultipart(action, form);
        break;
      } catch (error) {
        const serverMax = Number(error && error.payload && error.payload.max_bytes);
        if (
          attempt === 0
          && Number.isFinite(serverMax)
          && serverMax >= 128 * 1024
          && serverMax < image.blob.size
        ) {
          telegramCanvasUploadLimitBytes = serverMax;
          image = await buildTelegramCanvasSnapshot(requested);
          continue;
        }
        throw error;
      }
    }
    if (!data) throw new Error('Snapshot canvas gagal diunggah');
    telegramCanvasLastFingerprint = source.fingerprint;
    return data;
  }

  async function applyOpenedTopology(data, meta = {}) {
    const devices = data.devices || [];
    const connections = data.connections || [];
    // Ignore legacy data.stats/data.settings. Monitoring data stays server-local.
    const saved = await api('replace_topology', {
      devices,
      connections,
    });
    state.devices = saved.devices;
    state.connections = saved.connections;
    state.stats = saved.stats || state.stats || {};
    await rememberDoc({
      name: meta.name || state.doc.name || null,
      handle: meta.handle !== undefined ? meta.handle : state.doc.handle,
      title: sanitizeProjectFileBase(meta.name || state.doc.title || '') || state.doc.title || '',
    });
    clearSelection();
    syncInspector();
    history.stack = [];
    history.index = -1;
    pushHistory({ dirty: false });
    markDocClean();
    zoomToFit();
    draw();
  }

  async function openTopologyFile() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{
            description: 'Pamantau Project',
            accept: { 'application/json': ['.json'] },
          }],
        });
        // Request readwrite while we still have the picker user gesture
        await ensureFileHandlePermission(handle, 'readwrite');
        const file = await handle.getFile();
        const data = JSON.parse(await file.text());
        await applyOpenedTopology(data, { name: file.name, handle });
        toast(t('toast.opened', { name: file.name }));
        return;
      }
      el.importFile.click();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      toast(t('toast.open_fail', { err: err.message || err }));
    }
  }

  async function writeJsonToHandle(handle, blob) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function persistTopologyToServer() {
    await api('replace_topology', {
      devices: state.devices,
      connections: state.connections,
    });
  }

  async function saveTopologyFile({ saveAs = false } = {}) {
    commitProjectTitleFromInput();
    // Renamed project (title ≠ associated file base) → treat Save like Save as.
    if (!saveAs && saveActsAsSaveAs()) saveAs = true;
    const payload = await fullProjectPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const suggested = suggestedSaveName();

    try {
      // Saving a local project never replaces server-owned monitoring data.

      if (!saveAs && state.doc.handle) {
        const ok = await ensureFileHandlePermission(state.doc.handle, 'readwrite');
        if (ok) {
          await writeJsonToHandle(state.doc.handle, blob);
          const name = state.doc.name || state.doc.handle.name || suggested;
          await rememberDoc({
            name,
            handle: state.doc.handle,
            title: state.doc.title || sanitizeProjectFileBase(name),
          });
          markDocClean();
          toast(t('toast.saved', { name }));
          return;
        }
        // Permission denied / unavailable — fall through to Save as picker
      }

      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [{
            description: 'Pamantau Project',
            accept: { 'application/json': ['.json'] },
          }],
        });
        await writeJsonToHandle(handle, blob);
        await rememberDoc({
          name: handle.name,
          handle,
          title: sanitizeProjectFileBase(handle.name) || state.doc.title || '',
        });
        markDocClean();
        toast(t('toast.saved', { name: handle.name }));
        return;
      }

      // Fallback browser tanpa File System Access API
      if (!saveAs && state.doc.name) {
        downloadBlob(blob, state.doc.name);
        await rememberDoc({
          name: state.doc.name,
          handle: null,
          title: state.doc.title || sanitizeProjectFileBase(state.doc.name),
        });
        markDocClean();
        toast(t('toast.redownload', { name: state.doc.name }));
        return;
      }
      downloadBlob(blob, suggested);
      await rememberDoc({
        name: suggested,
        handle: null,
        title: sanitizeProjectFileBase(suggested) || state.doc.title || '',
      });
      markDocClean();
      toast(t('toast.save_as_done'));
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      toast(t('toast.save_fail', { err: err.message || err }));
    }
  }

  function exportTopologyImage(format) {
    if (!state.devices.length) {
      toast(t('toast.export_none'));
      return;
    }
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const canvas = renderTopologyCanvas({
      pixelRatio: 2,
      background: format === 'jpg' ? '#eef3fb' : '#eef3fb',
    });
    const quality = format === 'jpg' ? 0.92 : undefined;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast(t('toast.export_img_fail'));
        return;
      }
      const base = sanitizeProjectFileBase(projectDisplayName()) || 'pamantau-topo';
      downloadBlob(blob, `${base}.${ext}`);
      toast(t('toast.export_img_done', { ext: ext.toUpperCase() }));
    }, mime, quality);
  }

  function printTopology() {
    if (!state.devices.length) {
      toast(t('toast.print_none'));
      return;
    }
    const canvas = renderTopologyCanvas({ pixelRatio: 2 });
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) {
      toast(t('toast.print_popup'));
      return;
    }
    const title = state.doc.name || 'Pamantau Topology';
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>
        html,body{margin:0;padding:0;background:#fff}
        .wrap{display:flex;flex-direction:column;align-items:center;padding:16px;font-family:Sora,sans-serif}
        img{max-width:100%;height:auto}
        .copy{margin-top:12px;color:#5b6b86;font-size:12px}
        @media print{ .copy{position:fixed;bottom:8px} }
      </style></head><body>
      <div class="wrap">
        <img src="${dataUrl}" alt="Topology" />
        <div class="copy">Copyright © JERIYANT - BARAMCITY · ${title}</div>
      </div>
      <script>window.onload=()=>{window.focus();window.print();}</script>
      </body></html>`);
    win.document.close();
  }

  /** Suppress document outside-close for one tick after opening (touch ghost clicks). */
  let toolbarMenuIgnoreOutsideUntil = 0;

  function clearToolbarFlyoutPosition(menu) {
    if (!menu) return;
    menu.classList.remove('flyout-fixed');
    menu.style.top = '';
    menu.style.left = '';
    menu.style.maxWidth = '';
  }

  function placeToolbarFlyout(menu, anchor) {
    if (!menu || !anchor || menu.classList.contains('hidden')) return;
    const gap = 8;
    const pad = 8;
    menu.classList.add('flyout-fixed');
    menu.style.top = '0px';
    menu.style.left = '0px';
    const rect = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + gap;
    const maxLeft = Math.max(pad, window.innerWidth - mw - pad);
    left = Math.min(Math.max(pad, left), maxLeft);
    if (top + mh > window.innerHeight - pad) {
      const above = rect.top - mh - gap;
      top = above >= pad ? above : Math.max(pad, window.innerHeight - mh - pad);
    }
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.maxWidth = `${Math.min(mw, window.innerWidth - pad * 2)}px`;
  }

  function repositionOpenToolbarMenus() {
    if (el.fileMenu && !el.fileMenu.classList.contains('hidden')) {
      placeToolbarFlyout(el.fileMenu, el.btnFile);
    }
    if (el.quickMenu && el.btnQuick && !el.quickMenu.classList.contains('hidden')) {
      placeToolbarFlyout(el.quickMenu, el.btnQuick);
    }
    if (el.reportsMenu && !el.reportsMenu.classList.contains('hidden')) {
      placeToolbarFlyout(el.reportsMenu, el.btnReports);
    }
    if (el.notifMenu && el.btnNotif && !el.notifMenu.classList.contains('hidden')) {
      placeToolbarFlyout(el.notifMenu, el.btnNotif);
    }
  }

  function closeFileMenu() {
    clearToolbarFlyoutPosition(el.fileMenu);
    el.fileMenu.classList.add('hidden');
    el.btnFile.classList.remove('open');
    el.btnFile.setAttribute('aria-expanded', 'false');
  }

  function closeQuickMenu() {
    if (!el.quickMenu) return;
    clearToolbarFlyoutPosition(el.quickMenu);
    el.quickMenu.classList.add('hidden');
    if (el.btnQuick) {
      el.btnQuick.classList.remove('open');
      el.btnQuick.setAttribute('aria-expanded', 'false');
    }
  }

  function closeReportsMenu() {
    if (!el.reportsMenu) return;
    clearToolbarFlyoutPosition(el.reportsMenu);
    el.reportsMenu.classList.add('hidden');
    el.btnReports.classList.remove('open');
    el.btnReports.setAttribute('aria-expanded', 'false');
  }

  function closeNotifMenu() {
    if (!el.notifMenu) return;
    clearToolbarFlyoutPosition(el.notifMenu);
    el.notifMenu.classList.add('hidden');
    if (el.btnNotif) {
      el.btnNotif.classList.remove('open');
      el.btnNotif.setAttribute('aria-expanded', 'false');
    }
    if (el.telegramMenuWrap) el.telegramMenuWrap.classList.remove('open', 'fly-left');
    if (el.btnTelegramSub) el.btnTelegramSub.setAttribute('aria-expanded', 'false');
  }

  function closeAllMenus() {
    closeFileMenu();
    closeQuickMenu();
    closeReportsMenu();
    closeNotifMenu();
  }

  function openToolbarMenu(menu, btn) {
    toolbarMenuIgnoreOutsideUntil = performance.now() + 400;
    menu.classList.remove('hidden');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    // Measure after paint so max-height / content size are accurate.
    requestAnimationFrame(() => placeToolbarFlyout(menu, btn));
  }

  function toggleFileMenu() {
    const open = el.fileMenu.classList.contains('hidden');
    closeAllMenus();
    if (open) openToolbarMenu(el.fileMenu, el.btnFile);
  }

  function toggleQuickMenu() {
    if (!el.quickMenu || !el.btnQuick) return;
    const open = el.quickMenu.classList.contains('hidden');
    closeAllMenus();
    if (open) openToolbarMenu(el.quickMenu, el.btnQuick);
  }

  function toggleReportsMenu() {
    const open = el.reportsMenu.classList.contains('hidden');
    closeAllMenus();
    if (open) openToolbarMenu(el.reportsMenu, el.btnReports);
  }

  function toggleNotifMenu() {
    if (!el.notifMenu || !el.btnNotif) return;
    const open = el.notifMenu.classList.contains('hidden');
    closeAllMenus();
    if (open) openToolbarMenu(el.notifMenu, el.btnNotif);
  }

  function isToolbarMenuEvent(target) {
    if (!target || !target.closest) return false;
    if (target.closest('.file-menu-wrap')) return true;
    if (el.fileMenu && el.fileMenu.contains(target)) return true;
    if (el.quickMenu && el.quickMenu.contains(target)) return true;
    if (el.reportsMenu && el.reportsMenu.contains(target)) return true;
    if (el.notifMenu && el.notifMenu.contains(target)) return true;
    if (el.telegramMenu && el.telegramMenu.contains(target)) return true;
    return false;
  }

  el.btnFile.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFileMenu();
  });

  if (el.paletteDocName) {
    el.paletteDocName.addEventListener('click', (e) => e.stopPropagation());
    el.paletteDocName.addEventListener('pointerdown', (e) => e.stopPropagation());
    // On focus from outside: caret at end. Already-focused mid-text clicks keep normal placement.
    el.paletteDocName.addEventListener('focus', (e) => {
      const input = e.target;
      requestAnimationFrame(() => {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      });
    });
    el.paletteDocName.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        el.paletteDocName.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        syncDocLabel();
        el.paletteDocName.blur();
      }
    });
    el.paletteDocName.addEventListener('blur', () => {
      commitProjectTitleFromInput();
    });
  }

  document.addEventListener('click', (e) => {
    if (performance.now() < toolbarMenuIgnoreOutsideUntil) return;
    if (isToolbarMenuEvent(e.target)) return;
    closeAllMenus();
  });

  // Keep menu taps from hitting the stage / closing via bubbling.
  [el.fileMenu, el.quickMenu, el.reportsMenu, el.notifMenu, el.telegramMenu].forEach((menu) => {
    if (!menu) return;
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => e.stopPropagation());
  });

  window.addEventListener('resize', () => repositionOpenToolbarMenus());
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => repositionOpenToolbarMenus());
  });
  {
    const toolbarEl = document.querySelector('.topbar .toolbar');
    if (toolbarEl) {
      toolbarEl.addEventListener('scroll', () => {
        // Anchors move under overflow scroll — close rather than chase.
        closeAllMenus();
      }, { passive: true });
    }
  }

  el.fileMenu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-file]');
    if (!btn) return;
    const act = btn.dataset.file;
    closeFileMenu();

    if (act === 'new') {
      if (!confirm('Buat topologi baru? Semua perangkat di kanvas akan dihapus.')) return;
      try {
        const data = await api('replace_topology', { devices: [], connections: [] });
        state.devices = data.devices;
        state.connections = data.connections;
        state.stats = data.stats || {};
        clearDoc();
        clearSelection();
        syncInspector();
        history.stack = [];
        history.index = -1;
        pushHistory({ dirty: false });
        markDocClean();
        draw();
        toast(t('toast.canvas_cleared'));
      } catch (err) {
        toast(err.message);
      }
    }
    if (act === 'open') await openTopologyFile();
    if (act === 'save') await saveTopologyFile({ saveAs: false });
    if (act === 'save-as') await saveTopologyFile({ saveAs: true });
    if (act === 'print') printTopology();
    if (act === 'export-jpg') exportTopologyImage('jpg');
    if (act === 'export-png') exportTopologyImage('png');
  });

  el.importFile.addEventListener('change', async () => {
    const file = el.importFile.files && el.importFile.files[0];
    el.importFile.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await applyOpenedTopology(data, { name: file.name, handle: null });
      toast(t('toast.opened', { name: file.name }));
    } catch (err) {
      toast(t('toast.open_fail', { err: err.message }));
    }
  });

  el.btnReports.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleReportsMenu();
  });

  if (el.btnNotif) {
    el.btnNotif.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotifMenu();
    });
  }

  if (el.btnTelegramSub && el.telegramMenuWrap) {
    el.btnTelegramSub.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !el.telegramMenuWrap.classList.contains('open');
      el.telegramMenuWrap.classList.toggle('open', open);
      el.btnTelegramSub.setAttribute('aria-expanded', open ? 'true' : 'false');
      // Prefer fly-left if submenu would overflow the viewport.
      if (open && el.telegramMenu) {
        const rect = el.telegramMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
          el.telegramMenuWrap.classList.add('fly-left');
        } else {
          el.telegramMenuWrap.classList.remove('fly-left');
        }
      }
    });
  }

  if (el.telegramMenu) {
    el.telegramMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-telegram]');
      if (!btn) return;
      const act = btn.dataset.telegram;
      closeNotifMenu();
      if (act === 'updown' || act === 'screenshot' || act === 'settings') {
        openTgModal(act);
      }
    });
  }

  if (el.btnQuick) {
    el.btnQuick.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleQuickMenu();
    });
  }

  if (el.quickMenu) {
    el.quickMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-quick]');
      if (!btn) return;
      const act = btn.dataset.quick;
      closeQuickMenu();
      if (act === 'import-excel' && el.importExcelFile) {
        el.importExcelFile.value = '';
        el.importExcelFile.click();
      } else if (act === 'export-excel') {
        exportDevicesToExcel();
      } else if (act === 'template') {
        downloadExcelTemplate();
      }
    });
  }

  if (el.importExcelFile) {
    el.importExcelFile.addEventListener('change', async () => {
      const file = el.importExcelFile.files && el.importExcelFile.files[0];
      el.importExcelFile.value = '';
      if (!file) return;
      await importDevicesFromExcelFile(file);
    });
  }

  el.reportsMenu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-report]');
    if (!btn) return;
    const tab = btn.dataset.report;
    closeReportsMenu();
    openReportPeriodPicker(tab);
  });

  document.getElementById('btnCloseReports').addEventListener('click', () => closeReportsModal());
  if (el.btnCancelReportPeriod) {
    el.btnCancelReportPeriod.addEventListener('click', () => cancelReportPeriod());
  }
  if (el.btnApplyReportPeriod) {
    el.btnApplyReportPeriod.addEventListener('click', () => {
      applyReportPeriod().catch((err) => toast(err.message || String(err)));
    });
  }
  if (el.reportPeriodGate) {
    el.reportPeriodGate.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag !== 'INPUT' && tag !== 'SELECT') return;
      e.preventDefault();
      applyReportPeriod().catch((err) => toast(err.message || String(err)));
    });
  }
  if (el.btnChangeReportPeriod) {
    el.btnChangeReportPeriod.addEventListener('click', () => {
      state.reportApplied = false;
      showReportPeriodGate();
    });
  }
  if (el.btnPrintReport) {
    el.btnPrintReport.addEventListener('click', () => {
      printReport(state.reportTab).catch((err) => toast(err.message || String(err)));
    });
  }
  if (el.btnExcelReport) {
    el.btnExcelReport.addEventListener('click', () => {
      exportReportExcel(state.reportTab).catch((err) => toast(err.message || String(err)));
    });
  }

  if (el.reportHeadRow) {
    el.reportHeadRow.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-key]');
      if (!th) return;
      setReportSort(state.reportTab, th.dataset.key);
      renderReport();
    });
  }

  document.getElementById('btnSettings').addEventListener('click', () => {
    closeAllMenus();
    openSettings();
  });
  document.getElementById('btnCloseSettings').addEventListener('click', () => closeSettings());

  if (el.btnLogout) {
    el.btnLogout.addEventListener('click', () => {
      el.btnLogout.disabled = true;
      // Navigate immediately. login.php?logout=1 clears the session server-side
      // so we never hang waiting for api/logout behind a locked poll session.
      window.location.replace('login.php?logout=1');
    });
  }

  if (el.accountSection) {
    el.accountSection.querySelectorAll('[data-toggle-password]').forEach((btn) => {
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

    [
      el.accountNewUsername,
      el.accountConfirmPassword,
    ].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => syncAccountFormUi());
      input.addEventListener('blur', () => syncAccountFormUi());
    });

    if (el.accountOldPassword) {
      el.accountOldPassword.addEventListener('input', () => {
        // Invalidate any in-flight / previously accepted match while typing.
        accountOldPasswordVerifyToken += 1;
        accountOldPasswordVerified = false;
        accountOldPasswordVerifiedValue = '';
        setAccountPasswordFieldsLocked(true);
        syncAccountFormUi();
        scheduleAccountOldPasswordVerify(false);
      });
      el.accountOldPassword.addEventListener('blur', () => {
        scheduleAccountOldPasswordVerify(true);
      });
      el.accountOldPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          scheduleAccountOldPasswordVerify(true);
        }
      });
    }

    if (el.accountNewPassword) {
      el.accountNewPassword.addEventListener('input', () => syncAccountFormUi());
      el.accountNewPassword.addEventListener('blur', () => syncAccountFormUi());
    }
  }

  if (el.btnResetAccount) {
    el.btnResetAccount.addEventListener('click', () => {
      fillAccountForm();
      setAccountStatus('', '');
    });
  }

  if (el.btnSaveAccount) {
    el.btnSaveAccount.addEventListener('click', async () => {
      const form = syncAccountFormUi();
      if (!form.ready) {
        toast(t('auth.form_incomplete'));
        return;
      }

      el.btnSaveAccount.disabled = true;
      el.btnSaveAccount.classList.add('is-busy');
      setAccountStatus(t('auth.saving'), '');

      try {
        const data = await api('change_credentials', {
          old_password: form.oldPassword,
          new_password: form.newPassword,
          new_username: form.newUsername,
        });
        applyAuthPayload(data.auth || {});
        fillAccountForm();
        setAccountStatus(t('auth.credentials_updated'), 'ok');
        toast(t('auth.credentials_updated'));
      } catch (err) {
        const message = err.message || String(err);
        setAccountStatus(message, 'error');
        toast(message);
        syncAccountFormUi();
      } finally {
        el.btnSaveAccount.classList.remove('is-busy');
        syncAccountFormUi();
      }
    });
  }

  if (el.tgBotToken) {
    el.tgBotToken.addEventListener('input', () => {
      tgTokenDirty = true;
    });
  }

  document.getElementById('btnCloseTgUpDown')?.addEventListener('click', () => closeTgUpDown());
  document.getElementById('btnCloseTgScreenshot')?.addEventListener('click', () => closeTgScreenshot());
  document.getElementById('btnCloseTgSettings')?.addEventListener('click', () => closeTgSettings());

  document.getElementById('btnSaveTgUpDown')?.addEventListener('click', async () => {
    try {
      await saveTelegramPatch({
        telegram_notify_up: !!(el.tgNotifyUp && el.tgNotifyUp.checked),
        telegram_notify_down: !!(el.tgNotifyDown && el.tgNotifyDown.checked),
        telegram_tpl_up: el.tgTplUpPreview ? el.tgTplUpPreview.value : state.settings.telegram_tpl_up,
        telegram_tpl_down: el.tgTplDownPreview ? el.tgTplDownPreview.value : state.settings.telegram_tpl_down,
      });
      closeTgUpDown();
      toast(t('toast.tg_saved'));
    } catch (err) {
      toast(err.message || String(err));
    }
  });

  document.getElementById('btnTgTestUp')?.addEventListener('click', async () => {
    try {
      await api('telegram_test_up', {
        telegram_tpl_up: el.tgTplUpPreview ? el.tgTplUpPreview.value : undefined,
      });
      toast(t('toast.tg_test_ok'));
    } catch (err) {
      toast(err.message || String(err));
    }
  });
  document.getElementById('btnTgTestDown')?.addEventListener('click', async () => {
    try {
      await api('telegram_test_down', {
        telegram_tpl_down: el.tgTplDownPreview ? el.tgTplDownPreview.value : undefined,
      });
      toast(t('toast.tg_test_ok'));
    } catch (err) {
      toast(err.message || String(err));
    }
  });

  document.getElementById('btnSaveTgScreenshot')?.addEventListener('click', async () => {
    try {
      const mode = el.tgShotMode?.value === 'hourly' || el.tgShotMode?.value === 'daily'
        ? el.tgShotMode.value
        : 'interval';
      let dailyTime = String(el.tgShotDailyTime?.value || '08:00').trim();
      if (!/^\d{1,2}:\d{2}$/.test(dailyTime)) dailyTime = '08:00';
      const shotOn = !!(el.tgShotEnabled && el.tgShotEnabled.checked);
      await saveTelegramPatch({
        telegram_screenshot_enabled: shotOn,
        // Worker CLI skips when Background OFF — keep them in sync for scheduled shots.
        background_enabled: shotOn ? true : undefined,
        telegram_screenshot_format: el.tgShotFormat && el.tgShotFormat.value === 'jpg' ? 'jpg' : 'png',
        telegram_screenshot_schedule_mode: mode,
        telegram_screenshot_every_min: Math.min(1440, Math.max(1, Number(el.tgShotEvery?.value || 30))),
        telegram_screenshot_hourly_minute: Math.min(59, Math.max(0, Number(el.tgShotHourlyMinute?.value ?? 0))),
        telegram_screenshot_daily_time: dailyTime,
      });
      if (shotOn && el.setBackgroundEnabled) el.setBackgroundEnabled.checked = true;
      closeTgScreenshot();
      toast(t('toast.tg_saved'));
    } catch (err) {
      toast(err.message || String(err));
    }
  });

  el.tgShotMode?.addEventListener('change', syncTgShotScheduleFields);

  document.getElementById('btnTgTestShot')?.addEventListener('click', async () => {
    try {
      await uploadTelegramCanvasSnapshot({
        action: 'telegram_test_screenshot',
        format: el.tgShotFormat && el.tgShotFormat.value === 'jpg' ? 'jpg' : 'png',
        force: true,
      });
      toast(t('toast.tg_test_ok'));
    } catch (err) {
      toast(err.message || String(err));
    }
  });

  document.getElementById('btnSaveTgSettings')?.addEventListener('click', async () => {
    try {
      const patch = {
        telegram_enabled: !!(el.tgEnabled && el.tgEnabled.checked),
        telegram_chat_id: el.tgChatId ? String(el.tgChatId.value || '').trim() : '',
      };
      const token = readTgTokenForSave();
      if (token !== undefined) patch.telegram_bot_token = token;
      await saveTelegramPatch(patch);
      closeTgSettings();
      toast(t('toast.tg_saved'));
    } catch (err) {
      toast(err.message || String(err));
    }
  });

  document.getElementById('btnTgTestConn')?.addEventListener('click', async () => {
    try {
      const payload = {
        telegram_chat_id: el.tgChatId ? String(el.tgChatId.value || '').trim() : '',
      };
      const token = readTgTokenForSave();
      if (token !== undefined) payload.telegram_bot_token = token;
      else if (el.tgBotToken && !isMaskedToken(el.tgBotToken.value) && String(el.tgBotToken.value).trim()) {
        payload.telegram_bot_token = String(el.tgBotToken.value).trim();
      }
      const data = await api('telegram_test', payload);
      const uname = data.bot && data.bot.username ? ` (@${data.bot.username})` : '';
      toast(t('toast.tg_conn_ok', { bot: uname }));
    } catch (err) {
      toast(err.message || String(err));
    }
  });

  bindColorPair(el.setStatusOnlineColor, el.setStatusOnlineColorText, DEFAULT_SETTINGS.status_online_color);
  bindColorPair(el.setStatusOfflineColor, el.setStatusOfflineColorText, DEFAULT_SETTINGS.status_offline_color);
  bindColorPair(el.setStatusUnknownColor, el.setStatusUnknownColorText, DEFAULT_SETTINGS.status_unknown_color);
  if (el.setAnimateLinks) {
    el.setAnimateLinks.addEventListener('change', () => {
      syncLinkAnimControlsUi();
    });
  }
  if (el.setLinkAnimSpeed) {
    el.setLinkAnimSpeed.addEventListener('input', () => {
      // Live preview while dragging — same pattern as the zoom slider.
      // Persistence still happens on settings form submit (save_settings).
      applyLinkAnimSpeedLive(el.setLinkAnimSpeed.value);
    });
  }
  if (el.setPortScan) {
    el.setPortScan.addEventListener('change', () => syncPortScanExtrasUi());
  }
  if (el.setPollingEnabled) {
    el.setPollingEnabled.addEventListener('change', () => syncPollingExtrasUi());
  }
  if (el.setShowGrid) {
    el.setShowGrid.addEventListener('change', () => syncGridSettingsUi());
  }
  if (el.setBackgroundEnabled) {
    el.setBackgroundEnabled.addEventListener('change', () => syncBackgroundSchedUi());
  }
  if (el.btnCopyBgCron) {
    el.btnCopyBgCron.addEventListener('click', async () => {
      const line = (el.bgCronHint && el.bgCronHint.textContent || '').trim();
      if (!line) return;
      try {
        await copyTextToClipboard(line);
        toast(t('toast.copied'));
      } catch (_) {
        toast(t('toast.clipboard_denied'));
      }
    });
  }
  if (el.btnAddCommonPort) {
    el.btnAddCommonPort.addEventListener('click', () => {
      appendCommonPortRow('', '');
      const last = el.commonPortsBody && el.commonPortsBody.querySelector('tr:last-child .port-table-port');
      if (last) last.focus();
    });
  }
  if (el.commonPortsBody) {
    bindCommonPortsReorder();
    el.commonPortsBody.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.port-row-del') : null;
      if (!btn || !el.commonPortsBody.contains(btn)) return;
      const tr = btn.closest('tr');
      if (tr) tr.remove();
      if (el.commonPortsBody.children.length === 0) appendCommonPortRow('', '');
    });
  }
  if (el.setScanSubnetMethod) {
    el.setScanSubnetMethod.addEventListener('change', () => syncSubnetMethodUi());
  }
  document.getElementById('btnCloseProps').addEventListener('click', () => closePropsModal());

  if (el.btnCloseConfirm) el.btnCloseConfirm.addEventListener('click', () => closeConfirmDialog(false));
  if (el.btnConfirmCancel) el.btnConfirmCancel.addEventListener('click', () => closeConfirmDialog(false));
  if (el.btnConfirmOk) el.btnConfirmOk.addEventListener('click', () => closeConfirmDialog(true));
  if (el.btnCancelBusy) el.btnCancelBusy.addEventListener('click', () => cancelBusyOperation());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.modalConfirm && !el.modalConfirm.classList.contains('hidden')) {
      e.preventDefault();
      closeConfirmDialog(false);
    }
  });

  if (el.scanSubnetForm) {
    el.scanSubnetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = state.scanSubnetTargetId;
      if (!id) return;
      const network = el.scanCidrNetwork.value.trim();
      const prefix = Number(el.scanCidrPrefix.value) || 24;
      if (!isValidIpv4(network)) {
        toast(t('toast.network_invalid'));
        return;
      }
      const cidr = `${network}/${prefix}`;
      closeScanSubnetModal();
      await scanSubnet(id, cidr);
    });
  }
  if (el.scanCidrPrefix) {
    el.scanCidrPrefix.addEventListener('change', () => {
      const id = state.scanSubnetTargetId;
      const d = id ? findDevice(id) : null;
      if (d && d.ip) {
        const base = networkBaseForPrefix(d.ip, Number(el.scanCidrPrefix.value));
        if (base) el.scanCidrNetwork.value = base;
      }
      updateScanCidrPreview();
    });
  }
  if (el.scanCidrNetwork) {
    el.scanCidrNetwork.addEventListener('input', updateScanCidrPreview);
  }
  if (el.btnCloseScanSubnet) el.btnCloseScanSubnet.addEventListener('click', () => closeScanSubnetModal());

  if (el.btnClosePing) el.btnClosePing.addEventListener('click', () => closePingModal());
  if (el.btnCapturePing) {
    el.btnCapturePing.addEventListener('click', async () => {
      try {
        await captureTerminalToClipboard(el.pingTerminal);
        toast(t('toast.copied'));
      } catch (e) {
        toast(e && e.message ? e.message : t('toast.copy_image_fail'));
      }
    });
  }
  if (el.btnRestartPing) {
    el.btnRestartPing.addEventListener('click', () => {
      const id = state.pingTargetId;
      const d = id ? findDevice(id) : null;
      if (!d) return;
      const ip = String(d.ip || '').trim();
      if (!ip) return;
      runPingSequence(id, ip);
    });
  }

  if (el.btnCloseTraceroute) el.btnCloseTraceroute.addEventListener('click', () => closeTracerouteModal());
  if (el.btnCaptureTraceroute) {
    el.btnCaptureTraceroute.addEventListener('click', async () => {
      try {
        await captureTerminalToClipboard(el.tracerouteTerminal);
        toast(t('toast.copied'));
      } catch (e) {
        toast(e && e.message ? e.message : t('toast.copy_image_fail'));
      }
    });
  }
  if (el.btnRestartTraceroute) {
    el.btnRestartTraceroute.addEventListener('click', () => {
      const id = state.tracerouteTargetId;
      const d = id ? findDevice(id) : null;
      if (!d) return;
      const ip = String(d.ip || '').trim();
      if (!ip) return;
      runTracerouteSequence(id, ip);
    });
  }

  if (el.btnCloseScanPorts) el.btnCloseScanPorts.addEventListener('click', () => closeScanPortsModal());
  const onScanPortsClick = () => {
    const id = state.scanPortsTargetId;
    if (!id) return;
    runScanPorts(id);
  };
  if (el.btnScanPorts) el.btnScanPorts.addEventListener('click', onScanPortsClick);
  if (el.btnRescanPorts) el.btnRescanPorts.addEventListener('click', onScanPortsClick);
  if (el.scanPortsRange) {
    el.scanPortsRange.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const id = state.scanPortsTargetId;
      if (!id || el.btnScanPorts?.disabled) return;
      runScanPorts(id);
    });
  }
  if (el.scanPortsResultsList) {
    // Event delegation: rows are rebuilt on every scan, so bind once on the container.
    el.scanPortsResultsList.addEventListener('click', (e) => {
      const row = e.target.closest('.scan-port-row');
      if (!row) return;
      openScanPortInBrowser(row.getAttribute('data-port'));
    });
  }

  if (el.scanResultsRows) {
    el.scanResultsRows.addEventListener('change', (e) => {
      const target = e.target;
      const idx = Number(target.dataset.idx);
      const row = state.scanResults[idx];
      if (!row) return;
      if (target.classList.contains('scan-row-check')) {
        row.selected = target.checked;
        target.closest('tr')?.classList.toggle('is-unchecked', !row.selected);
        updateScanResultsSummary();
      } else if (target.classList.contains('scan-row-type')) {
        row.type = target.value;
      } else if (target.classList.contains('scan-row-label')) {
        row.label = target.value.trim() || scanResultRowLabel(row.type, row.ip);
      }
    });
  }
  if (el.scanResultsSelectAll) {
    el.scanResultsSelectAll.addEventListener('change', () => {
      const checked = el.scanResultsSelectAll.checked;
      state.scanResults.forEach((r) => { r.selected = checked; });
      renderScanResultsTable();
    });
  }
  if (el.btnCloseScanResults) el.btnCloseScanResults.addEventListener('click', () => closeScanResultsModal());
  if (el.btnRescanSubnet) el.btnRescanSubnet.addEventListener('click', () => rescanFromScanResults());
  if (el.btnConfirmScanResults) el.btnConfirmScanResults.addEventListener('click', () => confirmScanResults());

  if (el.setUiLanguage) {
    el.setUiLanguage.addEventListener('change', async () => {
      const next = normalizeUiLang(el.setUiLanguage.value);
      applyUiLanguage(next);
      try {
        const data = await api('save_settings', { ...state.settings, ui_language: next });
        if (data && data.settings) {
          state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
          state.settings.ui_language = normalizeUiLang(state.settings.ui_language);
        }
      } catch (err) {
        toast(err.message || String(err));
      }
    });
  }

  el.settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = readSettingsForm();
      const data = await api('save_settings', payload);
      applySettings(data.settings || payload);
      closeSettings();
      toast(t('toast.settings_saved'));
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById('btnResetSettings').addEventListener('click', async () => {
    if (!confirm(t('toast.reset_settings_confirm'))) return;
    try {
      const data = await api('reset_settings', {});
      applySettings(data.settings || DEFAULT_SETTINGS);
      fillSettingsForm();
      toast(t('toast.settings_reset'));
    } catch (err) {
      toast(err.message);
    }
  });

  if (el.btnResetCounters || el.btnClearDatabase) {
    const btn = el.btnResetCounters || el.btnClearDatabase;
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: t('confirm.reset_counters_title'),
        message: t('confirm.reset_counters_msg'),
        confirmLabel: t('confirm.reset'),
      });
      if (!ok) return;
      try {
        const data = await api('reset_counters', {});
        state.devices = data.devices || state.devices;
        state.connections = data.connections || state.connections;
        state.stats = data.stats || {};
        state.reports = null;
        state.reportApplied = false;
        state.reportFrom = null;
        state.reportTo = null;
        if (state.selectedId && isPropsModalOpen()) {
          const d = findDevice(state.selectedId);
          if (d) updateLive(d);
        }
        syncInspector();
        draw();
        closeSettings();
        toast(t('toast.counters_reset'));
      } catch (err) {
        toast(t('toast.counters_fail', { err: err.message || err }));
      }
    });
  }

  // Continuous rAF (~30fps) while link particles and/or status-lamp pulse
  // need frames. Drag/pan/zoom use scheduleDraw() (rAF-coalesced) from input.
  //
  // Large topology tip (~100+ nodes): prefer animate_links OFF or a cheap
  // style (pulse/beads) over comet/spark; hide grid while editing idle.
  const ANIM_MIN_MS = 1000 / 30; // ~30fps cap for continuous canvas anim
  let animRafId = 0;
  let animLastDraw = 0;
  let scheduledDrawRaf = 0;
  let hoverPassRaf = 0;

  function needsLinkAnimFrames() {
    return isPollingEnabled() && state.settings.animate_links !== false;
  }

  function needsStatusLampPulse() {
    // Status glow is static — no continuous frames for lamp blink.
    return false;
  }

  function needsContinuousFrames() {
    return needsLinkAnimFrames() || needsStatusLampPulse();
  }

  /** Coalesce bursty redraw requests to at most one draw per display frame. */
  function scheduleDraw() {
    if (scheduledDrawRaf) return;
    scheduledDrawRaf = requestAnimationFrame(() => {
      scheduledDrawRaf = 0;
      draw();
    });
  }

  function scheduleHoverPass() {
    if (hoverPassRaf) return;
    hoverPassRaf = requestAnimationFrame(() => {
      hoverPassRaf = 0;
      if (!state._mouseWorld) return;
      if (state.panning || state.marquee || state.rewiring || state.linking || state.dragging) return;
      const wx = state._mouseWorld.x;
      const wy = state._mouseWorld.y;
      const overPlus = hitPlus(wx, wy);
      const linkHit = hitConnection(wx, wy);
      const over = overPlus ? overPlus.device : hitDevice(wx, wy);
      const nextHover = over ? over.id : null;
      const nextLink = linkHit && !overPlus ? linkHit.conn.id : null;
      if (overPlus) el.stage.style.cursor = 'pointer';
      else if (linkHit && linkHit.end) el.stage.style.cursor = 'grab';
      else if (linkHit) el.stage.style.cursor = 'pointer';
      else el.stage.style.cursor = 'default';

      if (nextHover !== state.hoverId || nextLink !== state.hoverConnId) {
        state.hoverId = nextHover;
        state.hoverConnId = nextLink;
        draw();
      }
    });
  }

  function loop(now) {
    animRafId = 0;
    if (!needsContinuousFrames()) return;
    const t = typeof now === 'number' ? now : performance.now();
    if (t - animLastDraw >= ANIM_MIN_MS) {
      animLastDraw = t;
      // Advance link clock once per capped anim frame — not on hover/drag draws,
      // and not once per connection inside drawConnection.
      if (needsLinkAnimFrames()) advanceLinkAnimClock(t);
      // Drop a coalesced input redraw if one is pending; this frame covers it.
      if (scheduledDrawRaf) {
        cancelAnimationFrame(scheduledDrawRaf);
        scheduledDrawRaf = 0;
      }
      draw();
    }
    animRafId = requestAnimationFrame(loop);
  }

  function startAnimLoop() {
    if (animRafId || !needsContinuousFrames()) return;
    animLastDraw = 0;
    linkAnimLastWallMs = 0; // resume without applying paused wall time
    animRafId = requestAnimationFrame(loop);
  }

  function stopAnimLoop() {
    if (!animRafId) return;
    cancelAnimationFrame(animRafId);
    animRafId = 0;
    linkAnimLastWallMs = 0;
  }

  function syncAnimLoop() {
    if (needsContinuousFrames()) startAnimLoop();
    else stopAnimLoop();
  }

  function isPaletteFinePointer() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function isMobileInitialUi() {
    return window.matchMedia('(max-width: 760px), (hover: none), (pointer: coarse)').matches;
  }

  function readPalettePinned() {
    try {
      const pinned = localStorage.getItem(PALETTE_PINNED_KEY);
      if (pinned !== null) return pinned === 'true';
      // Migrate legacy click-to-pin preference once.
      const legacy = localStorage.getItem(PALETTE_VISIBLE_LEGACY_KEY);
      if (legacy !== null) {
        localStorage.removeItem(PALETTE_VISIBLE_LEGACY_KEY);
        const wasPinned = legacy === 'true';
        localStorage.setItem(PALETTE_PINNED_KEY, wasPinned ? 'true' : 'false');
        return wasPinned;
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function writePalettePinned(pinned) {
    try {
      localStorage.setItem(PALETTE_PINNED_KEY, pinned ? 'true' : 'false');
      localStorage.removeItem(PALETTE_VISIBLE_LEGACY_KEY);
    } catch (_) { /* ignore */ }
  }

  /** Pinned → overlay open; else desktop starts hamburger-only, touch/coarse starts overlay open. */
  function defaultPaletteVisible() {
    if (isMobileInitialUi()) return false;
    if (readPalettePinned()) return true;
    return false;
  }

  function syncPaletteToggleChrome(visible) {
    if (!el.btnTogglePalette) return;
    const key = visible ? 'palette.hide' : 'palette.show';
    const label = t(key);
    el.btnTogglePalette.setAttribute('aria-expanded', visible ? 'true' : 'false');
    el.btnTogglePalette.title = label;
    el.btnTogglePalette.setAttribute('aria-label', label);
    el.btnTogglePalette.setAttribute('data-i18n-title', key);
    el.btnTogglePalette.setAttribute('data-i18n-aria', key);
  }

  function syncPalettePinChrome(pinned) {
    if (!el.btnPinPalette) return;
    const key = pinned ? 'palette.unpin' : 'palette.pin';
    const label = t(key);
    el.btnPinPalette.classList.toggle('is-pinned', !!pinned);
    el.btnPinPalette.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    el.btnPinPalette.title = label;
    el.btnPinPalette.setAttribute('aria-label', label);
    el.btnPinPalette.setAttribute('data-i18n-title', key);
    el.btnPinPalette.setAttribute('data-i18n-aria', key);
  }

  /** Always-overlay: layout stays collapsed; open = palette-open overlay. Pin only persists stay-open. */
  function setPaletteVisible(visible, persistPin) {
    if (el.app) {
      el.app.classList.add('palette-collapsed');
      el.app.classList.toggle('palette-open', !!visible);
    }
    syncPaletteToggleChrome(visible);
    if (persistPin != null) {
      writePalettePinned(!!persistPin);
      syncPalettePinChrome(!!persistPin);
    } else {
      syncPalettePinChrome(readPalettePinned() && !!visible);
    }
    // No grid reflow / resize — canvas width never changes on open/pin.
  }

  /** Palette: click-to-open / leave-close when unpinned; pin keeps overlay open. No hover open. */
  (function initPaletteAutohide() {
    const app = el.app;
    const palette = el.palette;
    if (!app || !palette) return;

    let hideTimer = 0;
    let interacting = false;
    const fineMq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const HIDE_MS = 0; // immediate (near-immediate) hide on leave

    function clearHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = 0;
      }
    }

    function isAutohide() {
      return fineMq.matches;
    }

    function isPaletteOpen() {
      return app.classList.contains('palette-open');
    }

    function isPinned() {
      return readPalettePinned();
    }

    function paletteKeptOpen() {
      // Toggle lives inside palette, so hover/focus on either toggle or panel keeps overlay open.
      return interacting || palette.matches(':hover, :focus-within');
    }

    function setOpen(open) {
      if (isPinned()) {
        // Pinned → stay open (ignore leave/close via setOpen).
        app.classList.add('palette-open');
        syncPaletteToggleChrome(true);
        return;
      }
      app.classList.toggle('palette-open', !!open);
      syncPaletteToggleChrome(!!open);
    }

    function scheduleHide(ms) {
      clearHide();
      if (!isAutohide() || isPinned()) return;
      // Always async (incl. 0ms) so focus can settle inside palette before we check.
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        if (isPinned() || paletteKeptOpen()) return;
        setOpen(false);
      }, ms == null ? HIDE_MS : ms);
    }

    function openOverlay() {
      if (!isAutohide() || isPinned()) return;
      clearHide();
      setOpen(true);
    }

    function pinOpen() {
      clearHide();
      setPaletteVisible(true, true);
    }

    function unpinClose() {
      clearHide();
      setPaletteVisible(false, false);
    }

    if (el.btnTogglePalette) {
      el.btnTogglePalette.addEventListener('click', () => {
        if (isAutohide()) {
          if (isPinned()) {
            // Hamburger while pinned: unpin + close overlay.
            unpinClose();
            return;
          }
          // Temporary open/close only — pin is a separate control.
          if (isPaletteOpen()) {
            clearHide();
            setOpen(false);
          } else {
            openOverlay();
          }
          return;
        }
        // Touch/coarse: session open/close; pin button owns persistence.
        if (isPaletteOpen()) {
          if (isPinned()) unpinClose();
          else setPaletteVisible(false);
        } else {
          setPaletteVisible(true);
        }
      });
    }

    if (el.btnPinPalette) {
      el.btnPinPalette.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isPinned()) {
          unpinClose();
          return;
        }
        // Overlay open (or closed) → open overlay and persist pin.
        pinOpen();
      });
    }

    // No left-edge / hover open — open only via toggle click (unless pinned).
    // Leaving the palette (toggle + panel) closes immediately when unpinned.
    palette.addEventListener('pointerleave', () => {
      if (!isAutohide() || isPinned()) return;
      scheduleHide(HIDE_MS);
    });
    palette.addEventListener('focusout', () => {
      if (!isAutohide() || isPinned()) return;
      // Defer so focus can move to another element inside the palette.
      scheduleHide(0);
    });

    // Keep overlay open while dragging a component onto the canvas
    palette.addEventListener('dragstart', () => {
      if (!isAutohide() || isPinned()) return;
      interacting = true;
      openOverlay();
    });
    window.addEventListener('dragend', () => {
      if (!interacting) return;
      interacting = false;
      if (!isAutohide() || isPinned()) return;
      scheduleHide(HIDE_MS);
    });
    window.addEventListener('drop', () => {
      if (!interacting) return;
      interacting = false;
      if (!isAutohide() || isPinned()) return;
      scheduleHide(HIDE_MS);
    });

    fineMq.addEventListener('change', () => {
      clearHide();
      interacting = false;
      // Prefer persisted pin; else desktop → collapsed, touch → session-open.
      setPaletteVisible(defaultPaletteVisible());
    });

    syncPalettePinChrome(isPinned() && isPaletteOpen());
  })();

  /** Stage dock starts collapsed on every device; touch can toggle it explicitly. */
  (function initStageDockAutohide() {
    const host = el.stageDockHost || el.stageDock;
    if (!host || !el.stageDock) return;
    let hideTimer = 0;
    let edgeHot = false;
    let interacting = false;
    const fineMq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const EDGE_PX = 40;
    const EDGE_TOP_PX = 72;
    const HIDE_MS = 1000;
    const FLASH_MS = 1200;

    function clearHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = 0;
      }
    }

    function isAutohide() {
      return fineMq.matches;
    }

    function setOpen(open) {
      host.classList.toggle('dock-open', open);
      if (el.stageDockToggle) {
        el.stageDockToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    }

    function dockKeptOpen() {
      return edgeHot
        || interacting
        || host.matches(':hover, :focus-within');
    }

    function scheduleHide(ms) {
      clearHide();
      if (!isAutohide()) return;
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        if (dockKeptOpen()) return;
        setOpen(false);
      }, ms == null ? HIDE_MS : ms);
    }

    function openDock(ms) {
      if (!isAutohide()) {
        setOpen(false);
        return;
      }
      setOpen(true);
      if (ms === false) {
        clearHide();
        return;
      }
      scheduleHide(ms == null ? HIDE_MS : ms);
    }

    function flashDock() {
      if (!isAutohide()) return;
      openDock(FLASH_MS);
    }

    if (el.stageWrap) {
      el.stageWrap.addEventListener('pointermove', (e) => {
        if (!isAutohide() || e.pointerType === 'touch') return;
        const rect = el.stageWrap.getBoundingClientRect();
        const near = e.clientX >= rect.right - EDGE_PX
          && e.clientY <= rect.top + EDGE_TOP_PX;
        if (near === edgeHot) return;
        edgeHot = near;
        if (near) openDock(false);
        else scheduleHide(HIDE_MS);
      });
      el.stageWrap.addEventListener('pointerleave', () => {
        edgeHot = false;
        if (!isAutohide()) return;
        scheduleHide(HIDE_MS);
      });
    }

    host.addEventListener('pointerenter', () => {
      if (!isAutohide()) return;
      openDock(false);
    });
    host.addEventListener('pointerleave', () => {
      if (!isAutohide()) return;
      scheduleHide(HIDE_MS);
    });
    host.addEventListener('focusin', () => {
      // Moving focus to a touch control must not hide it before its click
      // fires. Focus-driven reveal/autohide only applies to fine pointers.
      if (!isAutohide()) return;
      openDock(4000);
    });
    host.addEventListener('focusout', () => {
      if (!isAutohide()) return;
      scheduleHide(HIDE_MS);
    });

    if (el.stageDockToggle) {
      el.stageDockToggle.addEventListener('click', () => {
        if (!isAutohide()) {
          setOpen(!host.classList.contains('dock-open'));
          return;
        }
        openDock(false);
      });
    }

    if (el.stage) {
      el.stage.addEventListener('pointerdown', (e) => {
        if (isAutohide() || e.pointerType !== 'touch') return;
        setOpen(false);
      });
    }

    // Keep open while dragging zoom slider / pressing dock controls
    el.stageDock.addEventListener('pointerdown', () => {
      if (!isAutohide()) return;
      interacting = true;
      openDock(false);
    });
    window.addEventListener('pointerup', () => {
      if (!interacting) return;
      interacting = false;
      if (!isAutohide()) return;
      scheduleHide(HIDE_MS);
    });
    window.addEventListener('pointercancel', () => {
      if (!interacting) return;
      interacting = false;
      if (!isAutohide()) return;
      scheduleHide(HIDE_MS);
    });

    // Brief reveal after wheel zoom on the stage
    if (el.stage) {
      el.stage.addEventListener('wheel', () => {
        if (!isAutohide()) return;
        flashDock();
      }, { passive: true });
    }

    // Brief reveal after zoom dock controls (slider stays open via interacting)
    ['btnZoomIn', 'btnZoomOut', 'btnZoomReset', 'btnZoomFit'].forEach((key) => {
      const btn = el[key];
      if (btn) btn.addEventListener('click', flashDock);
    });
    if (el.zoomSlider) {
      el.zoomSlider.addEventListener('input', () => {
        if (!isAutohide()) return;
        openDock(false);
      });
    }

    fineMq.addEventListener('change', () => {
      clearHide();
      edgeHot = false;
      interacting = false;
      setOpen(false);
    });
    setOpen(false);
  })();

  /** Human uptime with full i18n units, e.g. "9 Jam 24 Menit" / "9 Hours 24 Minutes". */
  function formatServerUptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const lang = I18N && typeof I18N.getLang === 'function' ? I18N.getLang() : 'id';
    const unit = (n, singularKey, pluralKey) => {
      const key = (lang === 'en' && n !== 1) ? pluralKey : singularKey;
      return `${n} ${t(key)}`;
    };
    const parts = [];
    if (days > 0) parts.push(unit(days, 'uptime.day', 'uptime.days'));
    if (hours > 0 || days > 0) parts.push(unit(hours, 'uptime.hour', 'uptime.hours'));
    parts.push(unit(mins, 'uptime.minute', 'uptime.minutes'));
    return parts.join(' ');
  }

  function applyServerUptime(data) {
    if (!el.serverUptimeValue) return;
    const secRaw = data && data.uptime_seconds != null ? Number(data.uptime_seconds) : NaN;
    if (Number.isFinite(secRaw) && secRaw >= 0) {
      lastServerUptimeSeconds = Math.floor(secRaw);
    }
    let human = '';
    if (lastServerUptimeSeconds != null) {
      human = formatServerUptime(lastServerUptimeSeconds);
    } else if (data && data.uptime_human) {
      human = String(data.uptime_human);
    }
    el.serverUptimeValue.textContent = human || '—';
    if (el.serverUptime) {
      if (human) {
        const tip = t('uptime.title_value', { value: human });
        el.serverUptime.title = tip;
        el.serverUptime.setAttribute('aria-label', tip);
      } else {
        const tip = t('uptime.title');
        el.serverUptime.title = tip;
        el.serverUptime.setAttribute('aria-label', tip);
      }
    }
  }

  async function refreshServerUptime() {
    try {
      const data = await api('uptime');
      if (data && data.ok) applyServerUptime(data);
    } catch (_) {
      /* keep last known value */
    }
  }

  async function boot() {
    populateDeviceTypeSelect();
    populateDeviceTypeCtxMenu();
    populateLinkTypeSelect();
    populateLinkTypeCtxMenu();
    setPaletteVisible(defaultPaletteVisible());
    renderPalette();
    resize();
    window.addEventListener('resize', resize);
    selectDevice(null);
    await loadIcons();
    syncAuthUi();
    try {
      const data = await api('bootstrap');
      const serverSnapshotLimit = Number(data.canvas_snapshot_upload_max_bytes);
      if (Number.isFinite(serverSnapshotLimit) && serverSnapshotLimit >= 128 * 1024) {
        telegramCanvasUploadLimitBytes = Math.min(9 * 1024 * 1024, serverSnapshotLimit);
      }
      state.devices = data.devices || [];
      state.connections = normalizeConnections(data.connections);
      applySettings(data.settings || DEFAULT_SETTINGS);
      state.stats = data.stats || {};
      applyServerUptime(data);
      history.stack = [];
      history.index = -1;
      pushHistory({ dirty: false });
      await restoreDocSession();
      resize();
      syncZoomUi();
      draw();
      if (HEADLESS_SNAPSHOT_MODE) {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        }
        // Headless Chromium may never fire rAF without virtual-time-budget.
        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          requestAnimationFrame(() => requestAnimationFrame(finish));
          setTimeout(finish, 400);
        });
        draw();
        await uploadTelegramCanvasSnapshot({
          action: 'complete_headless_snapshot',
          force: true,
        });
        document.title = 'PAMANTAU_HEADLESS_SNAPSHOT_COMPLETE';
        return;
      }
      if (!isPollingEnabled()) {
        stopPolling();
      } else {
        syncAnimLoop();
      }
      // Defer fit until stage layout/boundingClientRect is settled (icons already loaded above).
      requestAnimationFrame(() => {
        zoomToFit();
      });
    } catch (e) {
      if (HEADLESS_SNAPSHOT_MODE) {
        document.title = `PAMANTAU_HEADLESS_SNAPSHOT_ERROR: ${e.message}`;
        return;
      }
      toast(t('toast.load_fail', { err: e.message }));
      syncAnimLoop();
    }
    if (!HEADLESS_SNAPSHOT_MODE) setInterval(refreshServerUptime, 60000);
  }

  boot();
})();
