'use strict';
// إلكترون 36+ نقل دوال الإضافات لـ session.extensions
const exts = (ses) => ses.extensions || ses;
// دعم إضافات كروم: سوق إضافات كروم الرسمي + واجهات chrome.tabs/الأزرار/النوافذ المنبثقة لكل حساب
const { app, session, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store');

const WEB_STORE_URL = 'https://chromewebstore.google.com/category/extensions?hl=ar';
const byPartition = new Map(); // partition -> ElectronChromeExtensions
let hooks = null;              // { getWindow, openTab, selectTab, closeTab, getSettings, saveSettings }
const pendingTabs = [];        // تبويبات طلبتها إضافة وننتظر إنشاءها

const extensionsPath = () => path.join(app.getPath('userData'), 'Extensions');

// ---- chrome.sidePanel (لوحة الإضافة الجانبية زي كروم) ----
const spOptions = new Map(); // extensionId -> { path, enabled }
function spExtension(ses, id) { try { return exts(ses).getExtension(id); } catch { return null; } }
// إضافة Claude مش كاتبة side_panel في الـ manifest: بتحدد صفحة اللوحة من الكود (setOptions)، فبندوّر على الملف
function guessPanelPath(e) {
  const m = (e && e.manifest) || {};
  if (!e || !e.path || !(Array.isArray(m.permissions) && m.permissions.includes('sidePanel'))) return null;
  for (const f of ['sidepanel.html', 'side_panel.html', 'side-panel.html', 'sidepanel/index.html', 'panel.html']) {
    if (fs.existsSync(path.join(e.path, f))) return f;
  }
  return null;
}
function spBehavior(id) { const b = (hooks.getSettings().extPanelBehavior || {})[id]; return typeof b === 'boolean' ? b : null; }
function spInfo(ses, id) {
  const e = spExtension(ses, id); if (!e) return null;
  const m = e.manifest || {};
  const o = spOptions.get(id) || {};
  const p = o.path || (m.side_panel && m.side_panel.default_path) || guessPanelPath(e);
  if (!p || o.enabled === false) return null;
  const partition = [...byPartition.keys()].find(k => session.fromPartition(k) === ses) || 'persist:default';
  return { id, name: list().find(x => x.id === id)?.name || m.name || e.name, url: new URL(p, `chrome-extension://${id}/`).href, partition };
}
function spOpen(ses, id, win, toggle) {
  const info = spInfo(ses, id); if (!info) return false;
  const w = (win && !win.isDestroyed()) ? win : hooks.getWindow();
  if (w && !w.isDestroyed()) w.webContents.send('ext:sidepanel', { ...info, toggle: !!toggle });
  return true;
}
async function spHandle(ses, id, method, arg, win) {
  if (!id) return undefined;
  const a = arg || {};
  switch (method) {
    case 'setPanelBehavior':
      if (typeof a.openPanelOnActionClick === 'boolean') {
        hooks.saveSettings({ extPanelBehavior: { ...(hooks.getSettings().extPanelBehavior || {}), [id]: a.openPanelOnActionClick } });
      }
      return undefined;
    case 'getPanelBehavior': return { openPanelOnActionClick: !!spBehavior(id) };
    case 'setOptions': {
      const o = { ...(spOptions.get(id) || {}) };
      if (typeof a.path === 'string') o.path = a.path;
      if (typeof a.enabled === 'boolean') o.enabled = a.enabled;
      spOptions.set(id, o);
      return undefined;
    }
    case 'getOptions': {
      const m = (spExtension(ses, id) || {}).manifest || {};
      const o = spOptions.get(id) || {};
      return { path: o.path || (m.side_panel && m.side_panel.default_path), enabled: o.enabled !== false };
    }
    case 'open': spOpen(ses, id, win, false); return undefined;
    case 'close': { const w = win || hooks.getWindow(); if (w && !w.isDestroyed()) w.webContents.send('ext:sidepanel-close', id); return undefined; }
    case 'getLayout': return { side: 'left' };
    default: return undefined;
  }
}
const idFromUrl = (u) => (/^chrome-extension:\/\/([a-p]{32})\//.exec(u || '') || [])[1];

/* الـ preload مش بيشتغل جوه service worker الإضافات (إلكترون 44)، فإضافة زي Claude اللي بتنادي
   chrome.sidePanel أول ما تشتغل كانت بتقع. الحل: بنضيف قبل سكربت الخلفية بتاعها ملف صغير بيعرّف chrome.sidePanel. */
const SW_SHIM = '__alalamy_sw.js', SP_SHIM = '__alalamy_sp.js';
const SP_SHIM_CODE = `(() => {
  const c = globalThis.chrome;
  if (!c || c.sidePanel) return;
  let behavior = { openPanelOnActionClick: false };
  const opts = {};
  const m = (c.runtime && c.runtime.getManifest && c.runtime.getManifest()) || {};
  const done = (v, cb) => { if (typeof cb === 'function') { try { cb(v); } catch (e) {} return undefined; } return Promise.resolve(v); };
  const ev = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; }, hasListeners() { return false; } });
  try {
    Object.defineProperty(c, 'sidePanel', { enumerable: true, configurable: true, value: {
      setPanelBehavior: (b, cb) => { behavior = Object.assign({}, behavior, b || {}); return done(undefined, cb); },
      getPanelBehavior: (cb) => done(Object.assign({}, behavior), cb),
      setOptions: (o, cb) => { Object.assign(opts, o || {}); return done(undefined, cb); },
      getOptions: (o, cb) => { if (typeof o === 'function') cb = o; return done({ path: opts.path || (m.side_panel && m.side_panel.default_path), enabled: opts.enabled !== false }, cb); },
      open: (o, cb) => done(undefined, typeof o === 'function' ? o : cb),
      close: (o, cb) => done(undefined, typeof o === 'function' ? o : cb),
      getLayout: (cb) => done({ side: 'left' }, cb),
      onOpened: ev(), onClosed: ev()
    } });
  } catch (e) {}
})();
`;
function needsShim(m) {
  const sw = m && m.background && m.background.service_worker;
  return !!sw && (!!m.side_panel || (Array.isArray(m.permissions) && m.permissions.includes('sidePanel')));
}
// بيرجع true لو غيّر حاجة
function patchExtensionDir(dir) {
  try {
    const mf = path.join(dir, 'manifest.json');
    const m = JSON.parse(fs.readFileSync(mf, 'utf8').replace(/^\uFEFF/, ''));
    if (!needsShim(m)) return false;
    const bg = m.background;
    let orig = bg.service_worker;
    const origFile = path.join(dir, '__alalamy_orig.txt');
    if (orig === SW_SHIM) { try { orig = fs.readFileSync(origFile, 'utf8').trim(); } catch { return false; } }
    if (!orig || orig.includes('..') || !fs.existsSync(path.join(dir, orig))) return false;
    const rel = './' + orig.replace(/^\.?\//, '');
    const shim = bg.type === 'module'
      ? `import './${SP_SHIM}';\nimport '${rel}';\n`
      : `importScripts('${SP_SHIM}');\nimportScripts('${rel.slice(2)}');\n`;
    let changed = false;
    const write = (f, txt) => { const p = path.join(dir, f); try { if (fs.readFileSync(p, 'utf8') === txt) return; } catch { /* جديد */ } fs.writeFileSync(p, txt); changed = true; };
    write(SP_SHIM, SP_SHIM_CODE);
    write(SW_SHIM, shim);
    write('__alalamy_orig.txt', orig);
    if (bg.service_worker !== SW_SHIM) { bg.service_worker = SW_SHIM; fs.writeFileSync(mf, JSON.stringify(m, null, 2)); changed = true; }
    return changed;
  } catch { return false; }
}
function patchInstalledExtensions() {
  const root = extensionsPath();
  let ids = [];
  try { ids = fs.readdirSync(root); } catch { return; }
  for (const id of ids) {
    let vers = [];
    try { vers = fs.readdirSync(path.join(root, id)); } catch { continue; }
    for (const v of vers) if (fs.existsSync(path.join(root, id, v, 'manifest.json'))) patchExtensionDir(path.join(root, id, v));
  }
}

function init(h) {
  hooks = h;
  patchInstalledExtensions();
  // من صفحات الإضافة (لوحتها أو الـ popup)
  ipcMain.handle('alalamy-sp', (e, method, arg) => {
    const url = (e.senderFrame && e.senderFrame.url) || e.sender.getURL();
    let win = null;
    try { const host = e.sender.hostWebContents; win = require('electron').BrowserWindow.fromWebContents(host || e.sender); } catch { /* ignore */ }
    return spHandle(e.sender.session, idFromUrl(url), method, arg, win);
  });
  // أيقونات الإضافات في شريط الأدوات تُعرض عبر بروتوكول crx:// داخل جلسة الواجهة
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
}

function unpackedList() {
  const s = hooks.getSettings();
  return Array.isArray(s.unpackedExtensions) ? s.unpackedExtensions.filter(p => typeof p === 'string') : [];
}

function sessionsLoaded() { return [...byPartition.keys()].map(p => session.fromPartition(p)); }

// كل إضافة تُثبت في أي حساب تُحمّل تلقائياً في كل الحسابات المفتوحة
async function propagate(ext) {
  for (const ses of sessionsLoaded()) {
    if (!exts(ses).getExtension(ext.id)) {
      try { await exts(ses).loadExtension(ext.path, { allowFileAccess: true }); } catch { /* ignore */ }
    }
  }
}

function setup(partition) {
  if (byPartition.has(partition)) return;
  const ses = session.fromPartition(partition);
  // لازم تتسجل قبل مكتبة الإضافات علشان نضيف chrome.sidePanel قبل ما تجمّد chrome
  try {
    const file = path.join(__dirname, 'sidepanel-preload.js');
    ses.registerPreloadScript({ id: 'alalamy-sp-frame', type: 'frame', filePath: file });
    ses.registerPreloadScript({ id: 'alalamy-sp-sw', type: 'service-worker', filePath: file });
  } catch (err) { console.error('sidepanel preload', err); }
  const spWorkers = new WeakSet();
  ses.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
    if (runningStatus !== 'starting') return;
    const sw = ses.serviceWorkers.getWorkerFromVersionID(versionId);
    if (!sw || spWorkers.has(sw) || !String(sw.scope || '').startsWith('chrome-extension://')) return;
    spWorkers.add(sw);
    try { sw.ipc.handle('alalamy-sp', (_e, method, arg) => spHandle(ses, idFromUrl(sw.scope), method, arg, null)); } catch { /* ignore */ }
  });
  const ext = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab: (details) => new Promise((resolve, reject) => {
      pendingTabs.push({ partition, resolve });
      hooks.openTab({ url: details.url || 'about:blank', partition, background: details.active === false });
      setTimeout(() => reject(new Error('tab timeout')), 15000);
    }),
    selectTab: (wc) => hooks.selectTab(wc.id),
    removeTab: (wc) => hooks.closeTab(wc.id),
    createWindow: (details) => new Promise((resolve) => {
      const urls = [].concat(details.url || 'about:blank');
      urls.forEach(url => hooks.openTab({ url, partition }));
      resolve(hooks.getWindow());
    })
  });
  byPartition.set(partition, ext);

  // الضغط على أيقونة إضافة ليها لوحة جانبية (زي Claude) يفتح اللوحة على الشمال زي كروم
  const ba = ext.api && ext.api.browserAction;
  if (ba && typeof ba.activateClick === 'function') {
    const orig = ba.activateClick.bind(ba);
    ba.activateClick = (details) => {
      try {
        const id = details.extensionId;
        const m = (spExtension(ses, id) || {}).manifest || {};
        const b = spBehavior(id);
        const tab = details.tabId >= 0 ? ba.ctx.store.getTabById(details.tabId) : ba.ctx.store.getActiveTabOfCurrentWindow();
        const hasPopup = tab ? !!ba.getPopupUrl(id, tab.id) : !!(m.action || m.browser_action || {}).default_popup;
        // كروم: openPanelOnActionClick. لو الإضافة ماقالتش، ولها لوحة ومالهاش popup → نفتح اللوحة
        if (b === true || (b === null && !hasPopup && ((m.side_panel && m.side_panel.default_path) || guessPanelPath(spExtension(ses, id))))) {
          const win = tab ? ba.ctx.store.tabToWindow.get(tab) : null;
          if (spOpen(ses, id, win, true)) return;
        }
      } catch (err) { console.error('sidepanel click', err); }
      return orig(details);
    };
  }

  ses.on('extension-loaded', (_e, extension) => {
    // إضافة لسه متثبتة من السوق ومحتاجة chrome.sidePanel: نعدّلها ونحمّلها تاني مرة واحدة
    if (extension.path && extension.path.startsWith(extensionsPath()) && patchExtensionDir(extension.path)) {
      setTimeout(async () => {
        for (const s2 of [session.fromPartition('persist:default'), ...sessionsLoaded()]) {
          if (!exts(s2).getExtension(extension.id)) continue;
          try { exts(s2).removeExtension(extension.id); await exts(s2).loadExtension(extension.path, { allowFileAccess: true }); } catch { /* ignore */ }
        }
      }, 300);
      return;
    }
    propagate(extension);
  });

  installChromeWebStore({
    session: ses,
    extensionsPath: extensionsPath(),
    autoUpdate: partition === 'persist:default',
    allowUnpackedExtensions: true
  }).catch(err => console.error('webstore', err));

  for (const dir of unpackedList()) {
    if (fs.existsSync(dir)) exts(ses).loadExtension(dir, { allowFileAccess: true }).catch(() => {});
  }
}

// يُستدعى عند ظهور تبويب جديد (webview)
function addTab(guest, partition) {
  const ext = byPartition.get(partition);
  if (!ext) return;
  try { ext.addTab(guest, hooks.getWindow()); } catch { /* ignore */ }
  const i = pendingTabs.findIndex(p => p.partition === partition);
  if (i >= 0) pendingTabs.splice(i, 1)[0].resolve([guest, hooks.getWindow()]);
}

function selectTab(wc, partition) {
  const ext = byPartition.get(partition);
  if (ext && wc) try { ext.selectTab(wc); } catch { /* ignore */ }
}

function contextMenuItems(guest, partition, params) {
  const ext = byPartition.get(partition);
  if (!ext) return [];
  try { return ext.getContextMenuItems(guest, params); } catch { return []; }
}

function list() {
  const seen = new Map();
  const sessions = [session.fromPartition('persist:default'), ...sessionsLoaded()];
  for (const ses of sessions) {
    for (const e of exts(ses).getAllExtensions()) {
      if (seen.has(e.id)) continue;
      const m = e.manifest || {};
      let name = m.name || e.name;
      // ترجمة اسم الإضافة إذا كان من نوع __MSG_name__
      const msg = /^__MSG_(.+)__$/.exec(name || '');
      if (msg) {
        for (const loc of ['ar', m.default_locale || 'en', 'en']) {
          try {
            const j = JSON.parse(fs.readFileSync(path.join(e.path, '_locales', loc, 'messages.json'), 'utf8'));
            const key = Object.keys(j).find(k => k.toLowerCase() === msg[1].toLowerCase());
            if (key) { name = j[key].message; break; }
          } catch { /* ignore */ }
        }
      }
      seen.set(e.id, {
        id: e.id, name, version: e.version || m.version, description: (m.description || '').slice(0, 200),
        unpacked: unpackedList().includes(e.path), path: e.path
      });
    }
  }
  return [...seen.values()];
}

async function remove(id) {
  const item = list().find(e => e.id === id);
  for (const ses of [session.fromPartition('persist:default'), ...sessionsLoaded()]) {
    if (exts(ses).getExtension(id)) try { exts(ses).removeExtension(id); } catch { /* ignore */ }
  }
  if (item && item.unpacked) {
    hooks.saveSettings({ unpackedExtensions: unpackedList().filter(p => p !== item.path) });
  } else {
    try { await uninstallExtension(id, { session: session.fromPartition('persist:default'), extensionsPath: extensionsPath() }); } catch { /* ignore */ }
    // تأكيد حذف ملفات الإضافة
    const dir = path.join(extensionsPath(), id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

// تحميل إضافة من مجلد (وضع المطور) — مفيد للإضافات غير الموجودة في السوق
async function loadUnpacked(dir) {
  if (!dir) {
    const r = await dialog.showOpenDialog(hooks.getWindow(), {
      title: 'اختر مجلد الإضافة (الذي يحتوي manifest.json)', properties: ['openDirectory']
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    dir = r.filePaths[0];
  }
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return { ok: false, error: 'المجلد لا يحتوي على manifest.json' };
  const listNow = unpackedList();
  if (!listNow.includes(dir)) hooks.saveSettings({ unpackedExtensions: [...listNow, dir] });
  let loaded = null;
  for (const ses of [session.fromPartition('persist:default'), ...sessionsLoaded()]) {
    try { loaded = await exts(ses).loadExtension(dir, { allowFileAccess: true }); } catch (err) { if (!loaded) return { ok: false, error: String(err.message || err) }; }
  }
  return { ok: true, name: loaded && loaded.name };
}

module.exports = { init, setup, addTab, selectTab, contextMenuItems, list, remove, loadUnpacked, WEB_STORE_URL };
