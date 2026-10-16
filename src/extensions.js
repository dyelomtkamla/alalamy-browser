'use strict';
// دعم إضافات كروم: سوق إضافات كروم الرسمي + واجهات chrome.tabs/الأزرار/النوافذ المنبثقة لكل حساب
const { app, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store');

const WEB_STORE_URL = 'https://chromewebstore.google.com/category/extensions?hl=ar';
const byPartition = new Map(); // partition -> ElectronChromeExtensions
let hooks = null;              // { getWindow, openTab, selectTab, closeTab, getSettings, saveSettings }
const pendingTabs = [];        // تبويبات طلبتها إضافة وننتظر إنشاءها

const extensionsPath = () => path.join(app.getPath('userData'), 'Extensions');

function init(h) {
  hooks = h;
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
    if (!ses.getExtension(ext.id)) {
      try { await ses.loadExtension(ext.path, { allowFileAccess: true }); } catch { /* ignore */ }
    }
  }
}

function setup(partition) {
  if (byPartition.has(partition)) return;
  const ses = session.fromPartition(partition);
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

  ses.on('extension-loaded', (_e, extension) => { propagate(extension); });

  installChromeWebStore({
    session: ses,
    extensionsPath: extensionsPath(),
    autoUpdate: partition === 'persist:default',
    allowUnpackedExtensions: true
  }).catch(err => console.error('webstore', err));

  for (const dir of unpackedList()) {
    if (fs.existsSync(dir)) ses.loadExtension(dir, { allowFileAccess: true }).catch(() => {});
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
    for (const e of ses.getAllExtensions()) {
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
    if (ses.getExtension(id)) try { ses.removeExtension(id); } catch { /* ignore */ }
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
    try { loaded = await ses.loadExtension(dir, { allowFileAccess: true }); } catch (err) { if (!loaded) return { ok: false, error: String(err.message || err) }; }
  }
  return { ok: true, name: loaded && loaded.name };
}

module.exports = { init, setup, addTab, selectTab, contextMenuItems, list, remove, loadUnpacked, WEB_STORE_URL };
