'use strict';
// متصفح العالمي - العملية الرئيسية (Electron / Chromium)
const {
  app, BrowserWindow, ipcMain, session, safeStorage, Menu, clipboard,
  shell, dialog, nativeTheme, net, systemPreferences, webContents: allWebContents, desktopCapturer, WebContentsView
} = require('electron');
const path = require('path');
const downloader = require('./downloader');
const fs = require('fs');
const extensions = require('./extensions');
const translator = require('./translate');
const updater = require('./updater');
const adblock = require('./adblock');
const learn = require('./learn');
const i18n = require('./i18n');
const extWebRequest = require('./ext-webrequest');
i18n.patchElectron({ Menu, dialog });

// ---------- واجهة مستخدم بهوية كروم عادية حتى لا ترفض جوجل/مايكروسوفت تسجيل الدخول ----------
// نحذف أي رمز غير قياسي (مثل Electron/xx واسم التطبيق) ونبقي على Mozilla/AppleWebKit/Chrome/Safari فقط
const cleanUA = app.userAgentFallback
  .replace(/ (?!(?:Chrome|Safari|AppleWebKit|Mozilla)\/)[^\s()]+\/[\d.]+/g, '');
// المواقع بتشوف هوية كروم + علامة Electron (من غير اسم البرنامج العربي).
// جوجل بقت بترفض تسجيل الدخول («قد يكون هذا المتصفح غير آمن») لما الهوية تبقى نسخة طبق الأصل من كروم
// وهي مش كروم فعلاً، لكنها بتقبل علامة Electron العادية. cleanUA فاضل للتنزيلات بس.
const pageUA = cleanUA.replace(/ Safari\//, ` Electron/${process.versions.electron} Safari/`);
app.userAgentFallback = pageUA;
// مواقع بترفض أي هوية فيها كلمة Electron (سناب شات ويب: «Browser not supported») — بنديها هوية كروم العادية
const CHROME_ONLY_HOSTS = /(^|\.)(snapchat\.com|snap\.com)$/i;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const uaFor = (u) => CHROME_ONLY_HOSTS.test(hostOf(u)) ? cleanUA : pageUA;

const SMOKE_TEST = process.argv.includes('--smoke-test');
if (SMOKE_TEST) app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'alalamy-smoke-')));

// ---------- تخزين بسيط بملفات JSON داخل مجلد بيانات المستخدم ----------
const dataDir = () => app.getPath('userData');
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir(), name), 'utf8')); }
  catch { return fallback; }
}
const writeTimers = {};
const writeGen = {};   // رقم آخر كتابة لكل ملف: الكتابة القديمة ماتغطيش على أحدث منها
const writeChain = {}; // الكتابات في الخلفية لنفس الملف بتمشي واحدة ورا التانية
// الكتابة المؤجلة بتتعمل في الخلفية (مش في العملية الرئيسية): كل طلبات الشبكة في كل التبويبات
// بتعدي على العملية الرئيسية، فأي كتابة متزامنة على الهارد (خصوصًا fsync) كانت بتأخر تحميل الفيديو
async function writeInBackground(file, data, durable, isCurrent) {
  const tmp = file + '.atmp';
  const fh = await fs.promises.open(tmp, 'w');
  try { await fh.writeFile(data); if (durable) await fh.sync(); } finally { await fh.close(); }
  if (durable) await fs.promises.copyFile(file, file + '.bak').catch(() => { /* أول مرة */ });
  // التبديل نفسه متزامن (سريع جدًا) علشان مايتداخلش مع كتابة فورية حصلت في النص
  if (isCurrent()) fs.renameSync(tmp, file);
  else fs.promises.unlink(tmp).catch(() => {});
}
function writeJSON(name, value, immediate = false, durable = false, delay = 400) {
  const file = path.join(dataDir(), name);
  const serialize = () => JSON.stringify(value, null, durable || name === 'history.json' ? 0 : 1);
  clearTimeout(writeTimers[name]);
  const gen = writeGen[name] = (writeGen[name] || 0) + 1;
  if (immediate) {
    const data = serialize();
    if (durable) {
      // الجلسة: نكتبها على الهارد فعلاً (fsync) علشان لو الكهربا قطعت الملف مايضيعش أو يبوظ
      const fd = fs.openSync(file + '.tmp', 'w');
      try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      try { fs.copyFileSync(file, file + '.bak'); } catch { /* أول مرة */ }
    } else fs.writeFileSync(file + '.tmp', data);
    fs.renameSync(file + '.tmp', file);
    return;
  }
  writeTimers[name] = setTimeout(() => {
    if (writeGen[name] !== gen) return;
    const data = serialize();
    writeChain[name] = (writeChain[name] || Promise.resolve())
      .then(() => writeInBackground(file, data, durable, () => writeGen[name] === gen))
      .catch((err) => console.error('write', name, err.message));
  }, delay);
}

const store = {};
function defaultSettings() {
  return {
    homepage: 'alalamy://newtab',
    searchEngine: 'google',
    adblock: true,
    adAllow: [],
    restoreTabs: false,
    sleepMinutes: 30,
    translateTo: 'ar',
    theme: 'system',
    showBookmarksBar: true,
    defaultZoom: 100,
    downloadDir: '',
    askDownload: false,
    hardwareAcceleration: true,
    videoOverlay: true,
    showFeed: true,
    showSidebar: true,
    hiddenShortcuts: [],
    unpackedExtensions: [],
    siteLang: 'ar',
    askLocation: false,
    uiLang: 'ar'
  };
}
// ---------- لغة المواقع: كل الجلسات (الرئيسية والعملاء والمتخفي) بتطلب المواقع بالعربي ----------
// ويندوز لو إنجليزي كان Electron بيبعت Accept-Language إنجليزي، ففيسبوك وانستجرام ومدير الإعلانات يفتحوا إنجليزي
function siteLangCode() {
  const l = (store.settings && store.settings.siteLang) || (readJSON('settings.json', {}).siteLang) || 'ar';
  return /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/.test(l) ? l : (l === 'auto' ? 'auto' : 'ar');
}
function acceptLangs() {
  const l = siteLangCode();
  if (l === 'auto') return '';
  const base = l.split('-')[0];
  const list = [l];
  if (base === 'ar' && l === 'ar') list.push('ar-EG');
  if (base !== l) list.push(base);
  if (base !== 'en') list.push('en-US', 'en');
  return list.map((x, i) => i ? `${x};q=${Math.max(0.1, 1 - i * 0.1).toFixed(1)}` : x).join(',');
}
// فيسبوك وميتا (مدير الإعلانات، بيزنس سويت) بتشوف كوكي locale قبل أي حاجة
const META_LOCALES = { ar: 'ar_AR', en: 'en_US', fr: 'fr_FR', es: 'es_LA', de: 'de_DE', tr: 'tr_TR', it: 'it_IT', pt: 'pt_BR', ru: 'ru_RU', fa: 'fa_IR', ur: 'ur_PK', hi: 'hi_IN', id: 'id_ID', zh: 'zh_CN', ja: 'ja_JP', ko: 'ko_KR', nl: 'nl_NL' };
function setMetaLocale(ses) {
  const l = siteLangCode(); const loc = META_LOCALES[l.split('-')[0]];
  if (!loc) return;
  for (const d of ['facebook.com', 'instagram.com']) {
    const url = `https://www.${d}/`;
    ses.cookies.get({ url, name: 'locale' }).then((c) => {
      if (c.length && c[0].value === loc) return;
      return ses.cookies.set({ url, name: 'locale', value: loc, domain: '.' + d, path: '/', secure: true, sameSite: 'no_restriction', expirationDate: Math.floor(Date.now() / 1000) + 365 * 86400 });
    }).catch(() => {});
  }
}
const ZOOMS = [67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

function loadStore() {
  store.profiles = readJSON('profiles.json', [
    { id: 'default', name: 'الحساب الرئيسي', color: '#1a73e8', partition: 'persist:default' }
  ]);
  // العملاء: كل عميل له جلسة مستقلة persist:c_<id> (فيسبوك وانستا وتيك توك... مسجلين لكل عميل لوحده)
  store.clients = readJSON('clients.json', []);
  store.history = readJSON('history.json', []);
  store.bookmarks = readJSON('bookmarks.json', [
    { id: 'b1', title: 'Gmail', url: 'https://mail.google.com/' },
    { id: 'b2', title: 'Outlook', url: 'https://outlook.live.com/mail/' },
    { id: 'b3', title: 'YouTube', url: 'https://www.youtube.com/' }
  ]);
  store.passwords = readJSON('passwords.json', []);
  store.downloads = readJSON('downloads.json', []);
  store.settings = Object.assign(defaultSettings(), readJSON('settings.json', {}));
  nativeTheme.themeSource = store.settings.theme;
  loadSessions();
}

/* ---------- الجلسة زي كروم ----------
   كل النوافذ العادية بتتحفظ باستمرار في session.json (التبويبات بترتيبها، المثبت منها، تبويبات العملاء،
   التبويب النشط، مكان ومقاس كل نافذة). لو المتصفح اتقفل فجأة (الكهربا قطعت) أو اتقفل عادي، أول ما يفتح
   تاني Ctrl+Shift+T (أو زرار «استعادة») بيرجّع كل النوافذ والتبويبات زي ما كانت بالظبط. */
const isMeaningful = (sess) => !!(sess && Array.isArray(sess.windows) &&
  sess.windows.some(w => Array.isArray(w.tabs) && w.tabs.some(t => /^(https?|file):/i.test(t.url || ''))));
function normalizeSession(s) {
  if (!s || typeof s !== 'object') return null;
  if (Array.isArray(s.windows)) return s;
  if (Array.isArray(s.tabs)) return { v: 2, clean: true, time: 0, windows: [{ tabs: s.tabs, active: s.active || 0 }] }; // صيغة النسخ القديمة
  return null;
}
const live = new Map(); // window id -> بيانات النافذة
let lastSession = null, lastSessionUsed = false, crashed = false, quitting = false, restoreOnce = false;
const closedWindows = []; // النوافذ اللي اتقفلت (Ctrl+Shift+T بيرجعها)
function loadSessions() {
  const prev = normalizeSession(readJSON('session.json', null)) || normalizeSession(readJSON('session.json.bak', null));
  if (isMeaningful(prev)) {
    lastSession = prev;
    crashed = prev.clean === false;
    writeJSON('last-session.json', prev, true, true);
  } else lastSession = normalizeSession(readJSON('last-session.json', null));
  if (!isMeaningful(lastSession)) lastSession = null;
  store.session = lastSession;
  // بعد التحديث التلقائي المتصفح بيفتح تاني بنفس التبويبات
  try {
    const f = path.join(dataDir(), 'restore-once');
    if (fs.existsSync(f)) { fs.unlinkSync(f); restoreOnce = !!lastSession; crashed = false; }
  } catch { /* ignore */ }
}
function windowSnapshot(w) {
  const d = live.get(w.id);
  if (!d) return null;
  let bounds = d.bounds;
  try { if (!w.isDestroyed() && !w.isMinimized() && !w.isMaximized() && !w.isFullScreen()) bounds = w.getBounds(); } catch { /* ignore */ }
  let maximized = d.maximized;
  try { if (!w.isDestroyed()) maximized = w.isMaximized(); } catch { /* ignore */ }
  d.bounds = bounds; d.maximized = maximized;
  return { ...d, bounds, maximized };
}
function sessionNow(clean = false) {
  const wins = [...windows].filter(w => !w.__incognito && live.has(w.id)).map(windowSnapshot).filter(Boolean);
  return { v: 2, clean, time: Date.now(), windows: wins };
}
let sessionWriteTimer = null;
function persistSession(immediate = false, clean = false) {
  clearTimeout(sessionWriteTimer);
  const go = () => {
    const s = sessionNow(clean);
    // النافذة الأخيرة اتقفلت: نسيب آخر حالة محفوظة زي ما هي علشان تترجع المرة الجاية
    if (!s.windows.length) return;
    try { writeJSON('session.json', s, immediate, true, 0); } catch { /* ignore */ }
  };
  if (immediate) go(); else sessionWriteTimer = setTimeout(go, 250);
}
function markSessionClean() {
  clearTimeout(sessionWriteTimer);
  try {
    const s = normalizeSession(readJSON('session.json', null));
    if (s) { s.clean = true; writeJSON('session.json', s, true, true); }
  } catch { /* ignore */ }
}
// يفتح نوافذ جلسة محفوظة؛ أول نافذة تتحط في النافذة اللي طلبت الاستعادة
function openSessionWindows(list, target) {
  list = (list || []).filter(w => Array.isArray(w.tabs) && w.tabs.length);
  list.forEach((d, i) => {
    if (i === 0 && target && !target.isDestroyed()) { target.webContents.send('session:restore', { ...d, replaceEmpty: true }); return; }
    createWindow({ restore: d });
  });
  return list.length;
}
function restoreLastSession(target) {
  if (!lastSession || lastSessionUsed) return 0;
  lastSessionUsed = true;
  crashed = false;
  return openSessionWindows(lastSession.windows, target);
}

// ---------- مانع الإعلانات (قوايم uBlock Origin و EasyList) موجود في adblock.js ----------

// ---------- إعداد كل جلسة (كل حساب له جلسة معزولة بالكامل: كوكيز، تخزين، كاش) ----------
const PARTITION_RE = /^(persist:(default|p_[a-z0-9]+|c_[a-z0-9]+)|temp_[a-z0-9]+)$/;
const configured = new Map(); // partition -> session
async function askMacMedia(types) {
  let ok = true;
  if (types.includes('video')) ok = (await systemPreferences.askForMediaAccess('camera')) && ok;
  if (types.includes('audio')) ok = (await systemPreferences.askForMediaAccess('microphone')) && ok;
  return ok;
}
/* مفاتيح المرور (passkeys): مواقع زي فيسبوك وسناب شات بتطلبها أول ما الصفحة تفتح، والمتصفح مالوش قايمة الملء
   التلقائي بتاعت كروم، فويندوز كان بيفتح رسالة «أدخل مفتاح الأمان» لوحده. بنقفلها من الأساس بسياسة الصلاحيات
   (Permissions-Policy) على كل صفحة وإطار، فالموقع ياخد رفض فوري والرسالة ماتظهرش خالص.
   سياسة الموقع نفسه بتفضل زي ما هي؛ بنزوّد سطرنا في الآخر وهو اللي بيكسب لنفس المفتاح. */
const NO_PASSKEYS_POLICY = 'publickey-credentials-get=(), publickey-credentials-create=()';
function blockPasskeys(details, result) {
  if (store.settings.allowPasskeys) return result;
  if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return result;
  const headers = Object.assign({}, result.responseHeaders || details.responseHeaders || {});
  const key = Object.keys(headers).find(k => k.toLowerCase() === 'permissions-policy') || 'Permissions-Policy';
  const cur = headers[key];
  headers[key] = [...(Array.isArray(cur) ? cur : cur ? [cur] : []), NO_PASSKEYS_POLICY];
  return Object.assign({}, result, { responseHeaders: headers });
}

function setupSession(partition) {
  if (configured.has(partition)) return configured.get(partition);
  const ses = session.fromPartition(partition);
  configured.set(partition, ses);
  ses.setUserAgent(pageUA, acceptLangs() || undefined);
  setMetaLocale(ses);
  extensions.setup(partition);
  // كل طلب ياخد الهوية المناسبة لموقعه (كروم عادي لسناب شات، والهوية العادية لباقي المواقع زي جوجل)
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, cb) => {
    const h = details.requestHeaders;
    const want = uaFor(details.url);
    if (h['User-Agent'] && h['User-Agent'] !== want && (want === cleanUA || h['User-Agent'] === cleanUA)) h['User-Agent'] = want;
    // «عدم التتبع» زي كروم وفايرفوكس: بنبعت DNT و Sec-GPC لو المستخدم مفعّلها
    if (store.settings.doNotTrack) { h['DNT'] = '1'; h['Sec-GPC'] = '1'; }
    const al = acceptLangs();
    if (al) { for (const k of Object.keys(h)) if (k.toLowerCase() === 'accept-language') delete h[k]; h['Accept-Language'] = al; }
    extWebRequest.emit(ses, 'onBeforeSendHeaders', details);
    cb({ requestHeaders: h });
  });

  adblock.attach(ses, (details, result) => { extWebRequest.emit(ses, 'onHeadersReceived', details); return blockPasskeys(details, result); });
  extWebRequest.attachSession(ses);
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    extWebRequest.emit(ses, 'onBeforeRequest', details);
    try { if (adblock.onBeforeRequest(details, cb)) return; } catch { /* ignore */ }
    try { sniffMedia(details); } catch { /* ignore */ }
    cb({});
  });

  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const done = (ok) => {
      if (!ok || permission !== 'media' || process.platform !== 'darwin') return cb(!!ok);
      // ماك: لازم إذن النظام للكاميرا والمايك قبل ما الموقع يستخدمهم
      askMacMedia((details && details.mediaTypes) || ['video', 'audio']).then(cb, () => cb(false));
    };
    if (allowed.has(permission)) return cb(true);
    if (!ASKABLE.has(permission)) return cb(false);
    // إعدادات المواقع زي كروم: بنسأل المستخدم مرة لكل موقع ونفتكر اختياره
    askPermission(wc, permission, details, partition).then(done, () => cb(false));
  });

  // مشاركة الشاشة في المكالمات (فيسبوك/ميت/زوم ويب): بنسأل الأول وبعدين نشارك الشاشة كلها مع صوت الجهاز على ويندوز
  try {
    ses.setDisplayMediaRequestHandler((request, cb) => {
      let wc = null; try { wc = request.frame ? allWebContents.fromFrame(request.frame) : null; } catch { /* ignore */ }
      const w = winOf(wc) || win;
      const host = permHostOf((request.frame && request.frame.url) || request.securityOrigin || '');
      dialog.showMessageBox(w, { type: 'question', buttons: ['مشاركة الشاشة', 'إلغاء'], defaultId: 0, cancelId: 1, title: 'مشاركة الشاشة',
        message: `${host || 'الموقع'} عايز يشوف شاشتك`, detail: 'هيتشارك كل اللي على الشاشة لحد ما تقفل المشاركة من الموقع.' })
        .then(({ response }) => {
          if (response !== 0) return cb({});
          return desktopCapturer.getSources({ types: ['screen'] }).then((src) => {
            if (!src.length) return cb({});
            cb(process.platform === 'win32' ? { video: src[0], audio: 'loopback' } : { video: src[0] });
          });
        }).catch(() => cb({}));
    }, { useSystemPicker: true });
  } catch (err) { console.error('display media', err); }

  ses.on('will-download', (_e, item) => {
    const id = 'd' + Date.now() + Math.random().toString(36).slice(2, 6);
    let dir = store.settings.downloadDir;
    if (!dir || !fs.existsSync(dir)) dir = app.getPath('downloads');
    let name = item.getFilename();
    let target = path.join(dir, name);
    const ext = path.extname(name), base = path.basename(name, ext);
    for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${base} (${i})${ext}`);
    if (store.settings.askDownload) {
      // اسأل عن مكان الحفظ قبل كل تنزيل
      const chosen = dialog.showSaveDialogSync(win, { defaultPath: target });
      if (!chosen) { item.cancel(); return; }
      target = chosen;
    }
    item.setSavePath(target);
    const entry = { id, name: path.basename(target), path: target, url: item.getURL(),
      total: item.getTotalBytes(), received: 0, state: 'progressing', time: Date.now() };
    store.downloads.unshift(entry);
    sendUI('downloads:update', entry);
    item.on('updated', (_ev, state) => {
      entry.received = item.getReceivedBytes();
      entry.total = item.getTotalBytes();
      entry.state = state === 'interrupted' ? 'interrupted' : (item.isPaused() ? 'paused' : 'progressing');
      sendUI('downloads:update', entry);
    });
    item.once('done', (_ev, state) => {
      entry.state = state; // completed | cancelled | interrupted
      entry.received = item.getReceivedBytes();
      writeJSON('downloads.json', store.downloads);
      sendUI('downloads:update', entry);
    });
    activeDownloads.set(id, item);
  });
  return ses;
}
const activeDownloads = new Map();

// كروميوم بيكتب الكوكيز على الهارد كل 30 ثانية بس؛ لو المتصفح اتقفل قبلها تسجيل الدخول بيضيع.
// فبنكتبها بنفسنا بعد كل تنقل وقبل القفل وقبل التحديث
function flushSessions() {
  const jobs = [];
  for (const [p, ses] of configured) {
    if (!p.startsWith('persist:')) continue;
    jobs.push(ses.cookies.flushStore().catch(() => {}));
    try { ses.flushStorageData(); } catch { /* ignore */ }
  }
  return Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 3000))]);
}
let flushTimer = null;
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushSessions(); }, 2000);
}

function partitionOfWebContents(wc) {
  for (const [p, s] of configured) if (s === wc.session) return p;
  return null;
}

// ---------- النافذة الرئيسية ----------
// كل نافذة مفتوحة (عادية أو تصفح متخفي). win = آخر نافذة كان عليها التركيز، وهي اللي بتستقبل الأوامر
let win = null;
let primaryWin = null; // النافذة العادية اللي بتحفظ الجلسة
const windows = new Set();
function sendUI(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
const isIncognitoWin = (w) => !!(w && w.__incognito);
/* نافذة العميل: جلستين بس، النافذة الرئيسية (حسابك) ونافذة عميل واحدة.
   التبديل لعميل تاني بيبدّل نفس نافذة العميل له، وتبويبات العميل اللي قبله بتتحفظ وترجع لما تختاره تاني. */
const CLIENT_ID_RE = /^c_[a-z0-9]{4,20}$/;
const isClientWin = (w) => !!(w && w.__client);
// نافذة محفوظة كل تبويباتها لعميل واحد = نافذة العميل ده
function clientOfRestore(d) {
  if (!d || typeof d.client !== 'string' || !CLIENT_ID_RE.test(d.client) || !Array.isArray(d.tabs) || !d.tabs.length) return null;
  return d.tabs.every(t => t && t.clientId === d.client) ? d.client : null;
}
function clientName(id) { const c = (store.clients || []).find(x => x.id === id); return c ? c.name : ''; }
function clientWindowOf(id) { return [...windows].find(w => !w.isDestroyed() && w.__client === id) || null; }
// آخر تبويبات كل عميل (لما نافذة العميل تتبدل لعميل تاني)
let clientTabsMem = null;
function clientMem() {
  if (!clientTabsMem) { clientTabsMem = readJSON('client-tabs.json', {}); if (!clientTabsMem || typeof clientTabsMem !== 'object') clientTabsMem = {}; }
  return clientTabsMem;
}
function rememberClientTabs(id, d) {
  if (!CLIENT_ID_RE.test(id || '')) return;
  const tabs = d && Array.isArray(d.tabs) ? d.tabs.filter(t => t && /^https?:/i.test(t.url || '')).slice(0, 200).map(cleanTab).map(t => ({ ...t, clientId: id })) : [];
  const mem = clientMem();
  if (tabs.length) mem[id] = { tabs, active: Math.min(Math.max(0, Number(d.active) || 0), tabs.length - 1) };
  else delete mem[id];
  try { writeJSON('client-tabs.json', mem); } catch { /* ignore */ }
}
function takeClientMem(id) {
  const m = clientMem()[id];
  return m && Array.isArray(m.tabs) && m.tabs.length ? m : null;
}
function showWin(w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
// نافذة العميل الوحيدة تتبدل لعميل تاني: تبويبات العميل الحالي تتحفظ، وتتفتح تبويبات الجديد
function swapClientWindow(w, id, { only = null, tabs = null } = {}) {
  const prev = w.__client;
  const snap = windowSnapshot(w);
  if (prev && snap) rememberClientTabs(prev, snap);
  live.delete(w.id);
  const mem = takeClientMem(id);
  const all = [...(mem ? mem.tabs : []), ...(tabs || [])];
  w.__client = id;
  w.__restore = all.length ? { tabs: all, active: mem ? mem.active : 0, client: id, bounds: snap && snap.bounds, maximized: snap && snap.maximized } : null;
  w.__openSites = { only };
  w.setTitle(`${clientName(id)} - متصفح العالمي`);
  w.loadFile(path.join(__dirname, 'ui', 'index.html'), { query: { client: id } });
  showWin(w);
  return w;
}
function openClientWindow(id, { only = null, tabs = null } = {}) {
  if (!CLIENT_ID_RE.test(id || '') || !(store.clients || []).some(c => c.id === id)) return null;
  const existing = clientWindowOf(id);
  if (existing) {
    showWin(existing);
    existing.webContents.send('client:open-sites', { only, tabs });
    return existing;
  }
  const other = [...windows].find(w => !w.isDestroyed() && w.__client);
  if (other) return swapClientWindow(other, id, { only, tabs });
  const mem = takeClientMem(id);
  const all = [...(mem ? mem.tabs : []), ...(tabs || [])];
  const restore = all.length ? { tabs: all, active: mem ? mem.active : 0, client: id } : null;
  return createWindow({ clientId: id, restore, openSites: { only } });
}
// النافذة الرئيسية (حسابك الشخصي): مش متخفية ومش نافذة عميل
function mainWindow() { return [...windows].find(w => !w.isDestroyed() && !w.__incognito && !w.__client) || null; }
function winOf(wc) {
  if (!wc) return null;
  return BrowserWindow.fromWebContents(wc.hostWebContents || wc) || null;
}
// يبعت للنافذة اللي فيها الصفحة دي (مش لازم تكون اللي عليها التركيز)
function sendTo(wc, channel, payload) {
  const w = winOf(wc) || win;
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}
/* نافذة تصفح متخفي منفصلة زي كروم: لو فيه واحدة مفتوحة بنفتح فيها، وإلا نفتح نافذة جديدة */
function openIncognito(url, { forceNew = false } = {}) {
  const existing = forceNew ? null : [...windows].find(w => isIncognitoWin(w) && !w.isDestroyed());
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    if (url) existing.webContents.send('open-tab', { url });
    return existing;
  }
  return createWindow({ incognito: true, url });
}

function onScreen(b) {
  try {
    const { screen } = require('electron');
    return screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width - 60 && b.x + b.width > a.x + 60 && b.y >= a.y - 20 && b.y < a.y + a.height - 60; });
  } catch { return true; }
}
function createWindow({ incognito = false, url = null, restore = null, clientId = null, openSites = null } = {}) {
  if (!incognito && !clientId) clientId = clientOfRestore(restore);
  if (clientId && !(store.clients || []).some(c => c.id === clientId)) clientId = null;
  // نافذة عميل واحدة بس: لو فيه واحدة مفتوحة، تبويبات العميل ده تتحفظ لحد ما تختاره
  if (clientId && [...windows].some(x => !x.isDestroyed() && x.__client)) {
    if (restore && restore.tabs && restore.tabs.length && !takeClientMem(clientId)) rememberClientTabs(clientId, restore);
    const cw = clientWindowOf(clientId);
    if (cw) { showWin(cw); return cw; }
    return [...windows].find(x => !x.isDestroyed() && x.__client);
  }
  const saved = readJSON('window.json', { width: 1300, height: 850 });
  const bounds = { width: saved.width || 1300, height: saved.height || 850 };
  if (restore && restore.bounds && restore.bounds.width > 300 && onScreen(restore.bounds)) Object.assign(bounds, restore.bounds);
  else if (!windows.size) Object.assign(bounds, saved);
  else if (win && !win.isDestroyed()) { const b = win.getBounds(); bounds.x = b.x + 30; bounds.y = b.y + 30; }
  const w = new BrowserWindow({
    ...bounds,
    minWidth: 700,
    minHeight: 450,
    title: incognito ? 'متصفح العالمي (تصفح متخفي)' : clientId ? `${clientName(clientId)} - متصفح العالمي` : 'متصفح العالمي',
    backgroundColor: incognito ? '#202124' : '#f1f3f4',
    show: !SMOKE_TEST,
    // أزرار التحكم (تصغير/تكبير/إغلاق) مرسومة على الشمال داخل شريط التبويبات.
    // ويندوز: شريط العنوان مخفي لكن إطار النافذة الأصلي موجود (زي كروم)، فالتكبير والتصغير وتغيير
    // المقاس بيمشوا بحركة ويندوز الناعمة وSnap. لينكس: من غير إطار.
    frame: process.platform !== 'linux',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : process.platform === 'win32' ? 'hidden' : undefined,
    icon: path.join(__dirname, 'ui', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'ui-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      additionalArguments: SMOKE_TEST ? ['--smoke-test'] : []
    }
  });
  w.__incognito = incognito;
  w.__client = clientId || null;
  w.__openSites = clientId ? openSites : null;
  w.__startUrl = url;
  w.__restore = restore;
  if (restore && restore.maximized && !SMOKE_TEST) w.maximize();
  windows.add(w);
  if (!incognito && !clientId && !primaryWin) primaryWin = w;
  win = w;
  Menu.setApplicationMenu(null);
  w.loadFile(path.join(__dirname, 'ui', 'index.html'), incognito ? { query: { incognito: '1' } } : clientId ? { query: { client: clientId } } : undefined);
  w.on('focus', () => { win = w; });
  w.on('page-title-updated', (e) => e.preventDefault());
  setupWindow(w, incognito);
  return w;
}

function setupWindow(win, incognito) {
  if (SMOKE_TEST) win.webContents.on('console-message', (_e, level, message, line, src) => console.log('UI_CONSOLE', level, message, src + ':' + line));
  win.webContents.on('preload-error', (_e, p, err) => console.log('PRELOAD_ERROR', p, err));
  // حماية: واجهة المتصفح نفسها ماتروحش لأي صفحة تانية (زي لو حد سحب رابط وسابه فوق شريط التبويبات)،
  // لأن الصفحة دي كانت هتاخد صلاحيات الواجهة كلها (كلمات السر والملفات). الرابط بيتفتح في تبويب جديد بدل كده.
  const uiPage = require('url').pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href;
  win.webContents.on('will-navigate', (e, url) => {
    if (String(url).split(/[?#]/)[0] === uiPage) return;
    e.preventDefault();
    if (/^(https?|file):\/\//i.test(url)) win.webContents.send('open-tab', { url });
  });
  win.webContents.on('will-redirect', (e, url) => { if (String(url).split(/[?#]/)[0] !== uiPage) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) win.webContents.send('open-tab', { url });
    return { action: 'deny' };
  });

  const saveBounds = () => { if (!incognito && win === primaryWin && !win.isMaximized() && !win.isMinimized()) writeJSON('window.json', win.getBounds()); };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // تأمين الـ webview: لا يمكن للواجهة تحديد preload أو تفعيل node داخل الصفحات
  win.webContents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete webPreferences.preloadURL;
    // لوحة الإضافة الجانبية (زي Claude): صفحة إضافة، واجهات chrome بتيجي من مكتبة الإضافات مش من page-preload
    const extPanel = /^chrome-extension:\/\/[a-p]{32}\//.test(params.src || '');
    win.__nextExtPanel = extPanel;
    if (extPanel) delete webPreferences.preload;
    else webPreferences.preload = path.join(__dirname, 'page-preload.js');
    webPreferences.nodeIntegration = false;
    // الـ preload يشتغل كمان جوه الإطارات الداخلية علشان حماية مفاتيح المرور (فيسبوك/ميتا بتطلبها من iframe)
    webPreferences.nodeIntegrationInSubFrames = true;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = false;
    const partition = params.partition || 'persist:default';
    if (!PARTITION_RE.test(partition)) params.partition = 'persist:default';
    setupSession(params.partition);
  });

  win.webContents.on('did-attach-webview', (_e, guest) => {
    setupGuest(guest);
    if (win.__nextExtPanel) { win.__nextExtPanel = false; return; }
    extensions.addTab(guest, partitionOfWebContents(guest));
  });
  win.webContents.on('before-input-event', (e, input) => handleShortcut(e, input, win.webContents));
  const sendWinState = () => { if (!win.isDestroyed()) win.webContents.send('window:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() }); };
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, sendWinState);
  if (!incognito) {
    const touch = () => persistSession();
    for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, touch);
    // ويندوز بيقفل أو بيعمل تسجيل خروج: ده قفل طبيعي مش تعطّل
    win.on('session-end', () => { quitting = true; persistSession(true, true); });
    win.on('close', () => {
      const snap = windowSnapshot(win);
      // نافذة العميل اتقفلت: تبويباته ترجع المرة الجاية اللي تختاره فيها
      if (win.__client && snap) rememberClientTabs(win.__client, snap);
      const others = [...windows].filter(x => x !== win && !x.__incognito);
      if (!quitting && others.length) {
        // نافذة اتقفلت والباقي مفتوح: تتشال من الجلسة وتتحط في «المغلقة مؤخراً»
        if (snap && snap.tabs && snap.tabs.some(t => /^(https?|file):/i.test(t.url || ''))) {
          closedWindows.push({ ...snap, closedAt: Date.now() });
          if (closedWindows.length > 10) closedWindows.shift();
        }
        live.delete(win.id);
        persistSession(true);
      }
    });
  }
  win.on('closed', () => {
    windows.delete(win);
    if (primaryWin === win) primaryWin = [...windows].find(x => !x.__incognito && !x.__client) || null;
    // بيانات التصفح المتخفي بتتمسح أول ما النافذة تتقفل
    if (incognito && win.__partition) {
      try { session.fromPartition(win.__partition).clearStorageData(); session.fromPartition(win.__partition).clearCache(); } catch {}
    }
    const rest = [...windows];
    setFocusedWin(rest[rest.length - 1] || null);
  });
}
function setFocusedWin(w) { win = w; }

// ---------- اختصارات لوحة المفاتيح زي كروم بالظبط (تعمل حتى والتركيز داخل الصفحة) ----------
const { shortcutAction, PAGE_FIRST } = require('./shortcuts');
function handleShortcut(e, input, wc) {
  if (input.type !== 'keyDown') return;
  const action = shortcutAction(input);
  if (!action) return;
  const guest = wc && !wc.isDestroyed() && wc.getType() === 'webview';
  if (guest && PAGE_FIRST.has(action)) return; // الصفحة الأول
  if (action === 'escape') { sendTo(wc, 'shortcut', action); return; }
  e.preventDefault();
  if (action === 'open-menu' && input.isAutoRepeat) return;
  sendTo(wc, 'shortcut', action);
}
ipcMain.on('bgaudio:on', (e) => { e.returnValue = store.settings.backgroundAudio !== false; });
ipcMain.on('page:mouse-nav', (e, dir) => { if (dir === 'back' || dir === 'forward') sendTo(e.sender, 'shortcut', dir); });
ipcMain.on('page:shortcut', (e, action) => {
  if (typeof action === 'string' && PAGE_FIRST.has(action)) sendTo(e.sender, 'shortcut', action);
});

function textFragmentURL(pageURL, text) {
  const enc = (x) => encodeURIComponent(x).replace(/-/g, '%2D');
  const words = text.split(' ');
  const frag = words.length > 10 ? `${enc(words.slice(0, 4).join(' '))},${enc(words.slice(-4).join(' '))}` : enc(text);
  return pageURL.replace(/#.*$/, '') + '#:~:text=' + frag;
}
/* النوافذ اللي بتفضل مربوطة بالصفحة اللي فتحتها (window.opener) */
const KEEP_OPENER_FROM = /(^|\.)(ads\.snapchat\.com|business\.snapchat\.com|ads\.tiktok\.com|business\.tiktok\.com|ads\.google\.com|tagassistant\.google\.com|tagmanager\.google\.com|analytics\.google\.com|business\.facebook\.com|adsmanager\.facebook\.com|blogger\.com)$/i;
// صفحات مساعدة وسياسات بتتفتح عادي في تبويب
const HELP_HOST = /(^|\.)(support\.google\.com|businesshelp\.snapchat\.com|help\.snapchat\.com|support\.tiktok\.com|developers\.google\.com|developers\.facebook\.com|policies\.google\.com|accounts\.google\.com|youtube\.com|ads\.tiktok\.com|business\.tiktok\.com|forbusiness\.snapchat\.com)$/i;
function keepsOpener(details, guest) {
  const { url, disposition } = details;
  if (!/^(https?:|about:blank$)/i.test(url || '')) return false;
  // فورم بيتبعت لنافذة جديدة (POST): لو فتحناه تبويب البيانات بتضيع
  if (details.postBody && /^https?:/i.test(url)) return true;
  if (disposition === 'background-tab') return false;
  let from = '';
  try { from = new URL(guest.getURL()).hostname; } catch { return false; }
  if (!KEEP_OPENER_FROM.test(from)) return false;
  // بلوجر بيفتح نافذة فاضية وبعدين يكتب فيها الرابط: بنفضل نحوّلها لتبويب إلا لو طلعت معاينة (شوف did-create-window)
  if (url === 'about:blank') return !/(^|\.)blogger\.com$/i.test(from);
  const to = hostOf(url);
  if (/(^|\.)blogger\.com$/i.test(from)) {
    // بلوجر: المعاينة بس (عرض المدونة نفسها بيتفتح في تبويب عادي)
    return /preview/i.test(url) && !HELP_HOST.test(to);
  }
  // أداة الأحداث بتفتح موقعك أنت (أو صفحة من الأداة نفسها) وبتكلمه من خلال window.opener
  return !HELP_HOST.test(to) || /tagassistant\.google\.com$/i.test(to);
}
function setupPopup(child, opener) {
  const wc = child.webContents;
  const partition = partitionOfWebContents(opener) || partitionOfWebContents(wc) || 'persist:default';
  // الإضافات (Pixel Helper) تشوف النافذة دي كتبويب
  try { extensions.addTab(wc, partition); } catch { /* ignore */ }
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = String(input.key || '').toLowerCase();
    if (k === 'f12' || ((input.control || input.meta) && input.shift && k === 'i')) { e.preventDefault(); wc.toggleDevTools(); }
    else if (k === 'f5' || ((input.control || input.meta) && k === 'r')) { e.preventDefault(); wc.reload(); }
  });
  wc.on('page-title-updated', (_e, title) => { try { child.setTitle(title || 'متصفح العالمي'); } catch { /* ignore */ } });
}
function setupGuest(guest) {
  guest.on('before-input-event', (e, input) => handleShortcut(e, input, guest));
  // هوية كروم العادية لسناب شات (لازم تتغير قبل ما الصفحة تتحمل علشان navigator.userAgent كمان)
  const fixUA = (url) => { const want = uaFor(url); if (guest.getUserAgent() !== want) { guest.setUserAgent(want); return true; } return false; };
  guest.on('will-navigate', (_e, url) => fixUA(url));
  // تحويل لسناب شات (زي روابط جيميل اللي بتعدي على google.com/url): تغيير الهوية في نص التحويل
  // كان بيعلّق التبويب على «جاري التحميل» للأبد، فبنوقف التحويل ونفتح الرابط من جديد بالهوية الصح
  guest.on('will-redirect', (e, url, _inPlace, isMainFrame) => {
    if (!isMainFrame || guest.getUserAgent() === uaFor(url)) return;
    e.preventDefault();
    fixUA(url);
    setImmediate(() => { if (!guest.isDestroyed()) guest.loadURL(url); });
  });
  guest.on('did-start-navigation', (_e, url, _inPlace, isMainFrame) => { if (isMainFrame) fixUA(url); });
  guest.on('did-navigate', (_e, url) => {
    if (!CHROME_ONLY_HOSTS.test(hostOf(url))) return;
    guest.executeJavaScript('navigator.userAgent').then((ua) => {
      if (/Electron\//.test(ua) && !guest.__uaReload) { guest.__uaReload = true; guest.reload(); }
    }).catch(() => {});
  });
  // تشغيل الصوت في الخلفية: التبويب اللي بيشغل صوت مايتبطّأش لما النافذة تتصغر أو التبويب يستخبى
  guest.on('media-started-playing', () => { if (store.settings.backgroundAudio !== false) try { guest.setBackgroundThrottling(false); } catch { /* ignore */ } });
  guest.on('media-paused', () => { try { guest.setBackgroundThrottling(true); } catch { /* ignore */ } });
  // بعد كل تنقل (زي تسجيل الدخول في جيميل) نكتب الكوكيز على الهارد على طول
  guest.on('did-navigate', () => scheduleFlush());

  // الروابط التي تفتح في نافذة جديدة تفتح كتبويب جديد بنفس الحساب
  guest.setWindowOpenHandler((details) => {
    const { url, disposition } = details;
    const partition = partitionOfWebContents(guest);
    // نافذة لازم تفضل مربوطة بالصفحة اللي فتحتها (window.opener): أداة إعداد أحداث البيكسل في سناب وتيك توك،
    // Tag Assistant بتاع جوجل، ومعاينة بلوجر. التبويب العادي بيقطع الربط ده فكانت بتلف ومش بتحفظ.
    if (keepsOpener(details, guest)) {
      return { action: 'allow', outlivesOpener: true, overrideBrowserWindowOptions: { width: 1280, height: 860, show: true, autoHideMenuBar: true,
        backgroundColor: '#ffffff', webPreferences: { partition, contextIsolation: true, nodeIntegration: false } } };
    }
    if (disposition === 'new-window' && /^https?:/.test(url)) {
      // نوافذ منبثقة حقيقية (مثل نوافذ تسجيل الدخول OAuth) تبقى منبثقة بنفس الجلسة
      return { action: 'allow', overrideBrowserWindowOptions: { width: 600, height: 720,
        webPreferences: { partition, contextIsolation: true, nodeIntegration: false } } };
    }
    if (url === 'about:blank' && disposition === 'new-window') return { action: 'allow' };
    if (url === 'about:blank') {
      // جيميل وغيره بيفتحوا تبويب فاضي وبعدين يكتبوا فيه الرابط (علشان يخفوا المصدر)،
      // فبنفتحه مخفي ولما يروح لرابط حقيقي نفتح الرابط ده في تبويب جديد بنفس الحساب
      let from = ''; try { from = new URL(guest.getURL()).hostname; } catch { /* ignore */ }
      pendingBlank.push({ partition, background: disposition === 'background-tab', keepPreview: /(^|\.)blogger\.com$/i.test(from) });
      return { action: 'allow', overrideBrowserWindowOptions: { show: false,
        webPreferences: { partition, contextIsolation: true, nodeIntegration: false } } };
    }
    // بس روابط الويب: مانفتحش file:// أو بروتوكولات غريبة من صفحة
    if (/^(https?:|about:blank$)/i.test(url)) sendTo(guest, 'open-tab', { url, partition, background: disposition === 'background-tab' });
    return { action: 'deny' };
  });
  const pendingBlank = [];
  guest.on('did-create-window', (child, { url }) => {
    if (child.isVisible()) setupPopup(child, guest);
    if (url !== 'about:blank' || child.isVisible()) return;
    const info = pendingBlank.shift() || { partition: partitionOfWebContents(guest) };
    const wc = child.webContents;
    let done = false;
    const toTab = (e, target, isMainFrame = true) => {
      if (done || !isMainFrame || !/^https?:/i.test(target || '')) return;
      done = true;
      // معاينة بلوجر: محتاجة النافذة اللي فتحتها (window.opener) فبتفضل نافذة لوحدها بدل تبويب
      if (info.keepPreview && /preview/i.test(target)) {
        try { child.setBounds({ width: 1280, height: 860 }); child.center(); child.setMenuBarVisibility(false); child.show(); } catch { /* ignore */ }
        setupPopup(child, guest);
        return;
      }
      if (e && e.preventDefault) e.preventDefault();
      if (!guest.isDestroyed()) sendTo(guest, 'open-tab', { url: target, partition: info.partition, background: info.background });
      setImmediate(() => { if (!child.isDestroyed()) child.destroy(); });
    };
    wc.on('will-navigate', (e, target) => toTab(e, target));
    wc.on('will-redirect', (e, target, _inPlace, isMainFrame) => toTab(e, target, isMainFrame));
    wc.on('did-start-navigation', (_e, target, _inPlace, isMainFrame) => toTab(null, target, isMainFrame));
    // لو الصفحة كتبت محتوى في التبويب الفاضي من غير ما تروح لرابط، نظهره زي ما هو
    setTimeout(() => { if (!done && !child.isDestroyed()) child.show(); }, 2000);
  });

  guest.on('context-menu', (_e, p) => {
    Menu.buildFromTemplate(pageMenu(guest, p)).popup({ window: winOf(guest) || win });
  });
}

/* قايمة الكليك اليمين جوه الصفحات، بنفس ترتيب كروم */
const key = (label, accelerator, extra) => ({ label, accelerator, registerAccelerator: false, ...extra });
const sep = { type: 'separator' };
function lensURL(img) { return 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(img); }
function pageMenu(guest, p) {
  const partition = partitionOfWebContents(guest);
  const f = p.editFlags || {};
  const web = /^https?:/.test(p.pageURL || '');
  const groups = [];
  const add = (...items) => groups.push(items.filter(Boolean));

  if (p.isEditable) {
    if (p.misspelledWord) {
      const sug = (p.dictionarySuggestions || []).slice(0, 5);
      add(...(sug.length ? sug.map(w => ({ label: w, click: () => guest.replaceMisspelling(w) }))
        : [{ label: 'مفيش اقتراحات', enabled: false }]),
        { label: 'إضافة للقاموس', click: () => guest.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    }
    add(app.isEmojiPanelSupported() ? key('رموز تعبيرية', 'Super+.', { click: () => app.showEmojiPanel() }) : null);
    add(key('تراجع', 'CmdOrCtrl+Z', { enabled: f.canUndo !== false, click: () => guest.undo() }),
      key('إعادة', 'CmdOrCtrl+Y', { enabled: f.canRedo !== false, click: () => guest.redo() }));
    add(key('قص', 'CmdOrCtrl+X', { enabled: f.canCut !== false, click: () => guest.cut() }),
      key('نسخ', 'CmdOrCtrl+C', { enabled: f.canCopy !== false, click: () => guest.copy() }),
      key('لصق', 'CmdOrCtrl+V', { enabled: f.canPaste !== false, click: () => guest.paste() }),
      key('لصق كنص عادي', 'CmdOrCtrl+Shift+V', { enabled: f.canPaste !== false, click: () => guest.pasteAndMatchStyle() }),
      key('تحديد الكل', 'CmdOrCtrl+A', { enabled: f.canSelectAll !== false, click: () => guest.selectAll() }));
  }
  if (p.linkURL) {
    add({ label: 'فتح الرابط في تبويب جديد', click: () => sendUI('open-tab', { url: p.linkURL, partition, background: true }) },
      partition && partition.startsWith('temp_') ? null : { label: 'فتح الرابط في نافذة جديدة', click: () => createWindow({ url: p.linkURL }) },
      { label: 'فتح الرابط في نافذة التصفح المتخفي', click: () => openIncognito(p.linkURL) });
    add({ label: 'حفظ الرابط باسم...', click: () => guest.downloadURL(p.linkURL) },
      { label: 'نسخ عنوان الرابط', click: () => clipboard.writeText(p.linkURL) },
      p.linkText && p.linkText.trim() ? { label: 'نسخ نص الرابط', click: () => clipboard.writeText(p.linkText.trim()) } : null,
      { label: '🎬 تحميل الفيديو من الرابط ده', click: () => sendUI('video:open', { url: p.linkURL, partition }) });
  }
  if (p.mediaType === 'image' && p.srcURL) {
    add({ label: 'فتح الصورة في تبويب جديد', click: () => sendUI('open-tab', { url: p.srcURL, partition, background: true }) },
      { label: 'حفظ الصورة باسم...', click: () => guest.downloadURL(p.srcURL) },
      { label: 'نسخ الصورة', click: () => guest.copyImageAt(p.x, p.y) },
      { label: 'نسخ عنوان الصورة', click: () => clipboard.writeText(p.srcURL) });
    if (/^https?:/.test(p.srcURL)) add({ label: 'البحث عن الصورة باستخدام Google Lens', click: () => sendUI('open-tab', { url: lensURL(p.srcURL), partition }) });
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL) {
    add({ label: p.mediaType === 'video' ? 'فتح الفيديو في تبويب جديد' : 'فتح الصوت في تبويب جديد', click: () => sendUI('open-tab', { url: p.srcURL, partition, background: true }) },
      { label: 'نسخ عنوان الملف', click: () => clipboard.writeText(p.srcURL) });
  }
  if (p.selectionText && p.selectionText.trim()) {
    const s = p.selectionText.trim().replace(/\s+/g, ' ');
    const short = s.length > 40 ? s.slice(0, 40) + '…' : s;
    const toAr = !/[؀-ۿ]/.test(s);
    if (!p.isEditable) add(key('نسخ', 'CmdOrCtrl+C', { click: () => guest.copy() }));
    // زي كروم: «نسخ رابط للنص المميز» — اللي يفتح الرابط بتنزل الصفحة على الجملة دي وتتلوّن
    if (!p.isEditable && /^https?:/.test(p.pageURL || '')) add({ label: 'نسخ رابط للنص المميز', click: () => clipboard.writeText(textFragmentURL(p.pageURL, s)) });
    add({ label: `البحث عن "${short}"`, click: () => sendUI('open-tab', { url: searchURL(s), partition }) },
      /^\S+\.\S{2,}$/.test(s) && !/\s/.test(s) ? { label: `الانتقال إلى ${short}`, click: () => sendUI('open-tab', { url: /^https?:/.test(s) ? s : 'https://' + s, partition }) } : null,
      { label: toAr ? '🌐 ترجمة التحديد إلى العربية' : '🌐 ترجمة التحديد إلى الإنجليزية',
        click: () => sendUI('translate-selection', { text: s, target: toAr ? 'ar' : 'en' }) },
      { label: '🌐 ترجمة التحديد إلى لغة أخرى...', click: () => sendUI('translate-selection', { text: s, choose: true }) });
    if (!p.isEditable) add(key('طباعة...', 'CmdOrCtrl+P', { click: () => guest.print() }));
  }
  const plainPage = !p.linkURL && !p.isEditable && !(p.selectionText && p.selectionText.trim()) && p.mediaType === 'none';
  if (plainPage || (p.mediaType === 'image' && !p.linkURL)) {
    if (plainPage) {
      add(key('إلى الوراء', 'Alt+Left', { enabled: guest.navigationHistory.canGoBack(), click: () => guest.navigationHistory.goBack() }),
        key('إعادة توجيه', 'Alt+Right', { enabled: guest.navigationHistory.canGoForward(), click: () => guest.navigationHistory.goForward() }),
        key('إعادة تحميل', 'CmdOrCtrl+R', { click: () => guest.reload() }));
      add(key('حفظ باسم...', 'CmdOrCtrl+S', { click: () => savePage(guest) }),
        key('طباعة...', 'CmdOrCtrl+P', { click: () => guest.print() }),
        web ? { label: 'إرسال...', click: () => sendTo(guest, 'shortcut', 'share-page') } : null,
        web ? { label: 'البحث في علامة التبويب هذه باستخدام "عدسة Google"', click: () => lensPage(guest, partition) } : null,
        web ? key('الفتح في وضع القراءة', 'Alt+Shift+R', { click: () => sendTo(guest, 'shortcut', 'reader') }) : null);
      if (web) add({ label: 'الإرسال إلى جهازك', click: () => sendTo(guest, 'shortcut', 'qr-code') },
        { label: 'إنشاء رمز استجابة سريعة لهذه الصفحة', click: () => sendTo(guest, 'shortcut', 'qr-code') });
      if (web) add(key('ترجمة إلى العربية', undefined, { click: () => sendTo(guest, 'shortcut', 'translate-ar') }));
    }
    if (web) add({ label: '🎬 تحميل الفيديو ده', click: () => guest.send('video:resolve', { x: p.x, y: p.y, open: true }) },
      { label: '🎵 تحميل الصوت MP3', click: () => guest.send('video:resolve', { x: p.x, y: p.y, open: true, mp3: true }) });
  }
  const extItems = extensions.contextMenuItems(guest, partition, p);
  if (extItems.length) add(...extItems);
  add(web && plainPage ? key('عرض مصدر الصفحة', 'CmdOrCtrl+U', { click: () => sendUI('open-tab', { url: 'view-source:' + p.pageURL, partition }) }) : null,
    key('فحص', 'CmdOrCtrl+Shift+I', { click: () => sendTo(guest, 'devtools:open', { wcId: guest.id, x: p.x, y: p.y }) }));

  const t = [];
  for (const g of groups) if (g.length) { if (t.length) t.push(sep); t.push(...g); }
  return t;
}

/* «البحث في الصفحة باستخدام Google Lens»: صورة للجزء الظاهر من الصفحة وبنرفعها لعدسة جوجل */
async function lensPage(guest, partition) {
  try {
    const img = await guest.capturePage();
    await lensUpload(img.toPNG(), guest.session, partition);
  } catch {
    sendUI('open-tab', { url: 'https://lens.google.com/', partition });
  }
}
async function lensUpload(png, ses, partition) {
  try {
    const form = new FormData();
    form.append('encoded_image', new Blob([png], { type: 'image/png' }), 'page.png');
    const res = await ses.fetch('https://lens.google.com/v3/upload?hl=ar', { method: 'POST', body: form, redirect: 'manual' });
    const loc = res.headers.get('location');
    sendUI('open-tab', { url: loc && /^https:\/\/lens\.google\.com\//.test(loc) ? loc : 'https://lens.google.com/', partition });
  } catch {
    sendUI('open-tab', { url: 'https://lens.google.com/', partition });
  }
}

/* قايمة الكليك اليمين في واجهة المتصفح نفسها (شريط العنوان، الصفحة الرئيسية...): الواجهة بتبعت العناصر وإحنا بنرجّع اختيار المستخدم */
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('ui:menu', (e, items) => new Promise((resolve) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !windows.has(w) || !Array.isArray(items)) return resolve(null);
  const ROLES = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll']);
  let chosen = null;
  const tpl = items.slice(0, 40).map((it) => {
    if (!it || it.type === 'separator') return sep;
    const o = { label: String(it.label || '').slice(0, 120), enabled: it.enabled !== false };
    if (it.accelerator) { o.accelerator = String(it.accelerator); o.registerAccelerator = false; }
    if (it.role && ROLES.has(it.role)) o.role = it.role;
    else o.click = () => { chosen = it.id || null; };
    if (it.role === 'emoji') { delete o.role; o.click = () => app.showEmojiPanel(); o.visible = app.isEmojiPanelSupported(); }
    return o;
  });
  Menu.buildFromTemplate(tpl).popup({ window: w, callback: () => setTimeout(() => resolve(chosen), 0) });
}));

async function savePage(wc) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('downloads'), (wc.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_') + '.html')
  });
  if (!canceled && filePath) wc.savePage(filePath, 'HTMLComplete').catch(() => {});
}

function searchURL(q) {
  const engines = {
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    yahoo: 'https://search.yahoo.com/search?p='
  };
  return (engines[store.settings.searchEngine] || engines.google) + encodeURIComponent(q);
}

// ---------- كلمات المرور (مشفرة بتشفير نظام التشغيل safeStorage) ----------
function encrypt(text) {
  if (safeStorage.isEncryptionAvailable()) return { enc: true, v: safeStorage.encryptString(text).toString('base64') };
  return { enc: false, v: Buffer.from(text, 'utf8').toString('base64') };
}
function decrypt(obj) {
  try {
    if (obj.enc) return safeStorage.decryptString(Buffer.from(obj.v, 'base64'));
    return Buffer.from(obj.v, 'base64').toString('utf8');
  } catch { return ''; }
}
const pendingPw = new Map();

ipcMain.on('pw:capture', (e, data) => {
  if (!data || typeof data.password !== 'string' || !data.password || typeof data.origin !== 'string') return;
  const partition = partitionOfWebContents(e.sender) || 'persist:default';
  if (partition.startsWith('temp_')) return; // لا نحفظ شيئاً في التبويبات المؤقتة
  const username = String(data.username || '').slice(0, 200);
  const existing = store.passwords.find(p => p.origin === data.origin && p.username === username && p.partition === partition);
  if (existing && decrypt(existing.secret) === data.password) return;
  if (store.passwords.some(p => p.origin === data.origin && p.never)) return;
  const id = 'pw' + Date.now();
  pendingPw.set(id, { origin: data.origin, username, password: data.password, partition });
  sendUI('pw:prompt', { id, origin: data.origin, username, update: !!existing });
});

ipcMain.handle('pw:get', (e, origin) => {
  const partition = partitionOfWebContents(e.sender) || 'persist:default';
  // الأصل لازم يكون أصل الإطار اللي طالب فعلاً، وكمان نفس أصل الصفحة الرئيسية (مش إعلان جوه iframe)
  const frameOrigin = safeOrigin((e.senderFrame && e.senderFrame.url) || e.sender.getURL());
  if (typeof origin !== 'string' || origin !== frameOrigin || origin !== safeOrigin(e.sender.getURL())) return [];
  return store.passwords
    .filter(p => !p.never && p.origin === origin && p.partition === partition)
    .map(p => ({ username: p.username, password: decrypt(p.secret) }));
});

function safeOrigin(u) { try { return new URL(u).origin; } catch { return ''; } }

// ---------- إعدادات المواقع (الكاميرا والمايك، الموقع الجغرافي، الإشعارات، قراءة الحافظة) ----------
const ASKABLE = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'midiSysex']);
const pendingPerm = new Map();
function permKey(permission, details) {
  if (permission !== 'media') return permission;
  const t = (details && details.mediaTypes) || [];
  return t.includes('video') ? 'camera' : t.includes('audio') ? 'microphone' : 'camera';
}
function permHostOf(u) { try { return new URL(u).host; } catch { return ''; } }
function askPermission(wc, permission, details, partition) {
  const host = permHostOf((details && (details.requestingUrl || details.securityOrigin)) || (wc && wc.getURL()) || '');
  if (!host) return Promise.resolve(false);
  const key = permKey(permission, details);
  const keys = permission === 'media' ? (((details && details.mediaTypes) || []).length ? details.mediaTypes.map(t => t === 'video' ? 'camera' : 'microphone') : [key]) : [key];
  const saved = (store.settings.sitePerms || {})[host] || {};
  if (keys.some(k => saved[k] === 'block')) return Promise.resolve(false);
  if (keys.every(k => saved[k] === 'allow')) return Promise.resolve(true);
  // «يريد معرفة موقعك»: بيترفض بهدوء من غير رسالة، إلا لو المستخدم فعّل السؤال من الإعدادات أو سمح للموقع ده بالذات
  if (keys.includes('geolocation') && !store.settings.askLocation) return Promise.resolve(false);
  if (SMOKE_TEST) return Promise.resolve(false);
  // نافذة منبثقة من الموقع (زي نافذة مكالمة فيسبوك/ماسنجر): مفيهاش شريط المتصفح، فبنسأل برسالة فوقها
  // (قبل كده الطلب كان بيروح لصفحة الموقع نفسها فمكانش بيظهر ويترفض بعد دقيقتين → المكالمة من غير مايك وكاميرا)
  const ownerWin = winOf(wc);
  if (ownerWin && !windows.has(ownerWin)) {
    const names = { camera: 'الكاميرا', microphone: 'الميكروفون', geolocation: 'موقعك الجغرافي', notifications: 'الإشعارات', 'clipboard-read': 'قراءة الحافظة', midiSysex: 'أجهزة MIDI' };
    return dialog.showMessageBox(ownerWin, {
      type: 'question', buttons: ['سماح', 'منع'], defaultId: 0, cancelId: 1,
      title: 'إذن الموقع', message: `${host} عايز يستخدم: ${keys.map(k => names[k] || k).join(' و ')}`,
      detail: 'لو دي مكالمة فيسبوك أو ماسنجر اختار «سماح» علشان الطرف التاني يسمعك ويشوفك.',
      checkboxLabel: 'افتكر اختياري للموقع ده', checkboxChecked: true
    }).then(({ response, checkboxChecked }) => {
      const allow = response === 0;
      if (checkboxChecked && !String(partition).startsWith('temp_')) {
        const all = store.settings.sitePerms = Object.assign({}, store.settings.sitePerms);
        const cur = all[host] = Object.assign({}, all[host]);
        for (const k of keys) cur[k] = allow ? 'allow' : 'block';
        writeJSON('settings.json', store.settings);
      }
      return allow;
    }, () => false);
  }
  return new Promise((resolve) => {
    const id = 'perm' + Date.now() + Math.random().toString(36).slice(2, 5);
    const timer = setTimeout(() => { pendingPerm.delete(id); resolve(false); }, 120000);
    pendingPerm.set(id, { host, keys, temp: String(partition).startsWith('temp_'), resolve: (ok) => { clearTimeout(timer); resolve(ok); } });
    sendTo(wc, 'perm:prompt', { id, host, keys });
  });
}
ipcMain.handle('perm:respond', (_e, { id, allow, remember } = {}) => {
  const p = pendingPerm.get(id);
  if (!p) return;
  pendingPerm.delete(id);
  if (remember !== false && !p.temp) {
    const all = store.settings.sitePerms = Object.assign({}, store.settings.sitePerms);
    const cur = all[p.host] = Object.assign({}, all[p.host]);
    for (const k of p.keys) cur[k] = allow ? 'allow' : 'block';
    writeJSON('settings.json', store.settings);
  }
  p.resolve(!!allow);
});
// مسجّل الصوت النقي: WAV من الواجهة → التنزيلات/تسجيلات العالمي (MP3 بـ ffmpeg اللي جاي مع المتصفح)
ipcMain.handle('rec:save', async (_e, { data, name, format } = {}) => {
  try {
    if (!(data instanceof Uint8Array) || data.length < 44 || data.length > 1024 * 1024 * 1024) return { ok: false, error: 'تسجيل فاضي' };
    let dir = store.settings.downloadDir;
    if (!dir || !fs.existsSync(dir)) dir = app.getPath('downloads');
    dir = path.join(dir, 'تسجيلات العالمي');
    fs.mkdirSync(dir, { recursive: true });
    const base = String(name || 'تسجيل').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 80) || 'تسجيل';
    const uniq = (ext) => { let p = path.join(dir, base + ext); for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`); return p; };
    const wav = uniq('.wav');
    fs.writeFileSync(wav, Buffer.from(data));
    if (format !== 'mp3') { shell.showItemInFolder(wav); return { ok: true, path: wav }; }
    const mp3 = uniq('.mp3');
    await new Promise((resolve, reject) => {
      const p = require('child_process').spawn(downloader.ffmpegPath(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', mp3], { windowsHide: true });
      let err = ''; p.stderr.on('data', d => { err += d; });
      p.on('error', reject);
      p.on('close', (code) => code === 0 ? resolve() : reject(new Error(err.trim().slice(-200) || 'ffmpeg ' + code)));
    });
    try { fs.unlinkSync(wav); } catch { /* ignore */ }
    shell.showItemInFolder(mp3);
    return { ok: true, path: mp3 };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});
/* أدوات المطور جوه النافذة على اليمين زي كروم (بدل نافذة لوحدها): WebContentsView فوق مكان محجوز في الواجهة */
const dockedDevtools = new Map(); // guestId -> { view, win }
// لغة كروم عربي (--lang=ar) بتخلي إحداثيات WebContentsView معكوسة (x من اليمين)، فالأدوات كانت بتظهر على الشمال
// والمكان المحجوز على اليمين فاضي. بنعكس x علشان تقع مكانها بالظبط.
const RTL_UI = () => /^(ar|he|iw|fa|ur|ps|sd|ug|yi|ckb|dv)\b/i.test(app.getLocale() || '');
function devtoolsRect(b, win) {
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  if (!b) return null;
  const r = { x: n(b.x), y: n(b.y), width: n(b.width), height: n(b.height) };
  if (win && !win.isDestroyed() && RTL_UI()) r.x = Math.max(0, win.getContentBounds().width - r.x - r.width);
  return r;
}
function closeDockedDevtools(id) {
  const d = dockedDevtools.get(id);
  if (!d) return;
  dockedDevtools.delete(id);
  try { if (!d.win.isDestroyed()) d.win.contentView.removeChildView(d.view); } catch { /* ignore */ }
  try { d.view.webContents.close(); } catch { /* ignore */ }
}
// wcId = 0 يعني واجهة المتصفح نفسها (الصفحة الرئيسية / التبويب الجديد)
const devtoolsTarget = (e, wcId) => Number(wcId) === 0 ? e.sender : allWebContents.fromId(Number(wcId));
ipcMain.handle('devtools:open', (e, { wcId, bounds, x, y, console: toConsole } = {}) => {
  const guest = devtoolsTarget(e, wcId);
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!guest || guest.isDestroyed() || !w || (guest !== e.sender && guest.hostWebContents !== e.sender)) return false;
  let d = dockedDevtools.get(guest.id);
  if (!d || d.win !== w) {
    if (d) closeDockedDevtools(guest.id);
    if (guest.isDevToolsOpened()) guest.closeDevTools();
    const view = new WebContentsView();
    w.contentView.addChildView(view);
    d = { view, win: w };
    dockedDevtools.set(guest.id, d);
    guest.setDevToolsWebContents(view.webContents);
    guest.openDevTools();
    guest.once('destroyed', () => closeDockedDevtools(guest.id));
    view.webContents.once('destroyed', () => { if (dockedDevtools.get(guest.id) === d) dockedDevtools.delete(guest.id); });
  }
  for (const [id, o] of dockedDevtools) if (o.win === w) o.view.setVisible(id === guest.id);
  const r = devtoolsRect(bounds, w);
  if (r) d.view.setBounds(r);
  if (Number.isFinite(x) && Number.isFinite(y)) guest.inspectElement(Math.round(x), Math.round(y));
  if (toConsole) try { d.view.webContents.executeJavaScript('DevToolsAPI && DevToolsAPI.showPanel && DevToolsAPI.showPanel("console")').catch(() => {}); } catch { /* ignore */ }
  return true;
});
ipcMain.handle('devtools:show', (e, { wcId, bounds } = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const want = Number(wcId) === 0 ? e.sender.id : Number(wcId);
  for (const [id, o] of dockedDevtools) {
    if (o.win !== w) continue;
    const on = id === want;
    o.view.setVisible(on);
    if (on && bounds) o.view.setBounds(devtoolsRect(bounds, w));
  }
  return dockedDevtools.has(want);
});
ipcMain.handle('devtools:close', (e, wcId) => {
  const guest = devtoolsTarget(e, wcId);
  if (guest) closeDockedDevtools(guest.id);
  try { if (guest && !guest.isDestroyed() && guest.isDevToolsOpened()) guest.closeDevTools(); } catch { /* ignore */ }
  return true;
});
ipcMain.handle('perm:list', () => store.settings.sitePerms || {});
ipcMain.handle('perm:set', (_e, host, key, value) => {
  if (typeof host !== 'string' || !/^[\w.-]+(:\d+)?$/.test(host)) return store.settings.sitePerms || {};
  const all = store.settings.sitePerms = Object.assign({}, store.settings.sitePerms);
  if (key === '*') delete all[host];
  else if (['camera', 'microphone', 'geolocation', 'notifications', 'clipboard-read', 'midiSysex'].includes(key)) {
    const cur = all[host] = Object.assign({}, all[host]);
    if (value === 'allow' || value === 'block') cur[key] = value; else delete cur[key];
    if (!Object.keys(cur).length) delete all[host];
  }
  writeJSON('settings.json', store.settings);
  return all;
});

// الملء التلقائي، الإشارات المخفية، قائمة القراءة + أدوات الصفحة الرئيسية
require('./autofill').setup({ ipcMain, readJSON, writeJSON, encrypt, decrypt, sendUI, partitionOfWebContents, shell, safeOrigin, store, BrowserWindow });
require('./widgets').setup({ ipcMain, net, readJSON, writeJSON, app, path, fs, downloader });

// ---------- واجهة برمجية للواجهة الرسومية ----------
ipcMain.handle('init', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const first = w && w === primaryWin && !w.__restored;
  if (w) w.__restored = true;
  let restore = (w && w.__restore) || null;
  if (w) w.__restore = null;
  // لو المستخدم مفعّل «استعادة التبويبات عند الفتح»: النافذة الأولى تاخد أول نافذة محفوظة والباقي يتفتح
  if (first && (store.settings.restoreTabs || restoreOnce) && lastSession && !lastSessionUsed && !SMOKE_TEST) {
    lastSessionUsed = true;
    // النافذة الرئيسية تاخد أول نافذة مش بتاعة عميل، ونوافذ العملاء تتفتح لوحدها
    const all = lastSession.windows.filter(x => Array.isArray(x.tabs) && x.tabs.length);
    const one = all.find(x => !clientOfRestore(x)) || null;
    const rest = all.filter(x => x !== one);
    restore = one || null;
    setTimeout(() => rest.forEach(d => createWindow({ restore: d })), 300);
  }
  return {
  profiles: store.profiles,
  clients: store.clients,
  bookmarks: store.bookmarks,
  settings: store.settings,
  restore,
  crashed: !!(first && crashed && !lastSessionUsed && !SMOKE_TEST),
  canRestore: !!(lastSession && !lastSessionUsed),
  incognito: isIncognitoWin(w),
  primary: !!(w && w === primaryWin),
  clientWin: (w && w.__client) || null,
  openSites: (() => { const o = w && w.__openSites; if (w) w.__openSites = null; return o || null; })(),
  downloads: store.downloads,
  encryption: safeStorage.isEncryptionAvailable(),
  platform: process.platform,
  version: app.getVersion(),
  downloadsDefault: app.getPath('downloads'),
  chrome: process.versions.chrome,
  startUrl: first ? urlFromArgs(process.argv) : (w && w.__startUrl) || null,
  maximized: w ? w.isMaximized() : false
  };
});
ipcMain.handle('window:new', (e, opts) => {
  const o = opts || {};
  if (o.incognito) openIncognito(typeof o.url === 'string' ? o.url : null, { forceNew: !!o.forceNew });
  else createWindow({ url: typeof o.url === 'string' ? o.url : null });
});
// فتح نافذة العميل (أو التركيز عليها لو مفتوحة)، ومعاها تبويبات العميل اللي كانت في نافذة تانية
ipcMain.handle('client:window', (_e, id, opts) => {
  const o = opts || {};
  const only = Array.isArray(o.only) ? o.only.filter(k => typeof k === 'string').slice(0, 40) : null;
  const tabs = Array.isArray(o.tabs) ? o.tabs.slice(0, 200).map(cleanTab).map(t => ({ ...t, clientId: id })) : null;
  return !!openClientWindow(String(id || ''), { only, tabs });
});
ipcMain.handle('client:windows', () => [...windows].filter(w => !w.isDestroyed() && w.__client).map(w => w.__client));
// الرجوع لحسابك الشخصي = النافذة الرئيسية
ipcMain.handle('window:focus-main', () => {
  const m = mainWindow();
  if (!m) { createWindow(); return true; }
  if (m.isMinimized()) m.restore();
  m.show(); m.focus();
  return true;
});
ipcMain.handle('window:incognito-partition', (e, p) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w.__incognito && typeof p === 'string' && /^temp_[a-z0-9]+$/.test(p)) w.__partition = p;
});

ipcMain.handle('update:check', () => updater.check({ manual: true }));

// أزرار النافذة المخصصة
ipcMain.handle('settings:reset', () => {
  const keep = { unpackedExtensions: store.settings.unpackedExtensions };
  store.settings = Object.assign(defaultSettings(), keep);
  nativeTheme.themeSource = store.settings.theme;
  writeJSON('settings.json', store.settings);
  return store.settings;
});
ipcMain.handle('settings:choose-download-dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'],
    defaultPath: store.settings.downloadDir || app.getPath('downloads') });
  if (!r.canceled && r.filePaths[0]) { store.settings.downloadDir = r.filePaths[0]; writeJSON('settings.json', store.settings); }
  return store.settings;
});
ipcMain.handle('app:relaunch', async () => { await flushSessions(); app.relaunch(); app.exit(0); });
// ---------- تحميل الفيديوهات والصوت ----------
const validPartition = (p) => typeof p === 'string' && PARTITION_RE.test(p) ? p : 'persist:default';
// الرابط اللي اتلقط من الشبكة بيتبعت بنفس الصفحة اللي طلبته (ممكن تكون iframe المشغّل نفسه)
function sniffedReferrer(url) {
  for (const list of sniffed.values()) { const x = list.find(i => i.url === url); if (x && x.referrer) return x.referrer; }
  return '';
}
const validReferer = (r, url) => {
  r = sniffedReferrer(url) || r;
  return typeof r === 'string' && /^https?:\/\//i.test(r) && r !== url ? r : undefined;
};
ipcMain.handle('video:probe', async (_e, { url, partition, referer }) => {
  if (!/^https?:\/\//i.test(url || '')) return { error: 'الرابط مش صالح' };
  downloader.autoUpdate();
  try { return await downloader.probe(url, { partition: validPartition(partition), userAgent: cleanUA, referer: validReferer(referer, url) }); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('video:download', (_e, { url, partition, choice, title, useCookies, referer, fileTitle }) => {
  if (!/^https?:\/\//i.test(url || '')) return null;
  let dir = store.settings.downloadDir;
  if (!dir || !fs.existsSync(dir)) dir = app.getPath('downloads');
  const id = 'v' + Date.now() + Math.random().toString(36).slice(2, 6);
  const label = choice.kind === 'mp3' ? 'MP3' : (choice.height ? choice.height + 'p' : 'فيديو');
  const entry = { id, video: true, name: `${String(title || 'video').slice(0, 120)} (${label})`, path: '', url,
    total: 100, received: 0, state: 'progressing', status: 'بيبدأ التحميل...', time: Date.now() };
  store.downloads.unshift(entry);
  sendUI('downloads:update', entry);
  downloader.download(id, url, choice, {
    partition: validPartition(partition), userAgent: cleanUA, dir, useCookies: typeof useCookies === 'boolean' ? useCookies : undefined,
    referer: validReferer(referer, url), fileTitle: typeof fileTitle === 'string' ? fileTitle : undefined,
    onProgress: (pr) => {
      if (pr.post) { entry.received = 100; entry.status = choice.kind === 'mp3' ? 'بيحوّل لـ MP3...' : 'بيجمع الصوت مع الصورة...'; }
      else {
        entry.received = Math.round(pr.pct);
        entry.status = `${Math.round(pr.pct)}%` + (pr.part ? ' (الصوت)' : '') + (pr.speed && !/N\/A|Unknown/.test(pr.speed) ? ` · ${pr.speed}` : '') +
          (pr.eta && !/N\/A|Unknown/.test(pr.eta) ? ` · فاضل ${pr.eta}` : '');
      }
      sendUI('downloads:update', entry);
    },
    onDone: (r) => {
      if (r.ok) {
        entry.state = 'completed'; entry.received = 100; entry.status = '';
        if (r.file) { entry.path = r.file; entry.name = path.basename(r.file); try { entry.total = entry.received = fs.statSync(r.file).size; } catch {} }
      } else {
        entry.state = r.cancelled ? 'cancelled' : 'interrupted';
        entry.status = r.cancelled ? '' : r.error;
      }
      writeJSON('downloads.json', store.downloads);
      sendUI('downloads:update', entry);
    }
  });
  return id;
});
// أي موقع: بنلقط روابط الفيديو اللي الصفحة بتطلبها (m3u8 / mpd / mp4...) علشان نحملها لو yt-dlp مش عارف الموقع
const sniffed = new Map(); // webContentsId -> [{ url, key, manifest }]
const MEDIA_PATH = /\.(m3u8|mpd|mp4|m4v|webm|mov|mkv|flv)$/i;
const SEGMENT_PATH = /\.(ts|m4s|aac|vtt)$|(^|[\/_-])(seg|frag|fragment|chunk|init)[-_]?\d*[^\/]*$/i;
function sniffMedia(d) {
  const id = d.webContentsId;
  if (!id) return;
  if (d.resourceType === 'mainFrame') { sniffed.delete(id); return; }
  if (!/^https?:/i.test(d.url) || /googlevideo\.com|youtube\.com|ytimg\.com|doubleclick|googlesyndication/i.test(d.url)) return;
  let u; try { u = new URL(d.url); } catch { return; }
  const manifest = /\.(m3u8|mpd)$/i.test(u.pathname) || /[=.](m3u8|mpegurl)(&|$)/i.test(u.search);
  if (!manifest && !(MEDIA_PATH.test(u.pathname) || d.resourceType === 'media')) return;
  if (!manifest && SEGMENT_PATH.test(u.pathname)) return;
  const key = u.origin + u.pathname;
  let list = sniffed.get(id);
  if (!list) sniffed.set(id, list = []);
  const old = list.findIndex(x => x.key === key);
  if (old >= 0) list.splice(old, 1);
  const first = !list.length;
  list.push({ url: d.url, key, manifest, referrer: /^https?:/i.test(d.referrer || '') ? d.referrer : '' });
  if (list.length > 12) list.shift();
  if (first) { const wc = allWebContents.fromId(id); if (wc && !wc.isDestroyed()) sendTo(wc, 'video:sniffed', { wcId: id, page: wc.getURL() }); }
}
// الأول ملفات التشغيل (m3u8/mpd) لأنها فيها كل الجودات، وأول واحد اتطلب غالبًا هو الرئيسي
function sniffedList(id) {
  const list = sniffed.get(Number(id)) || [];
  return [...list.filter(x => x.manifest), ...list.filter(x => !x.manifest).reverse()].map(x => x.url).slice(0, 4);
}
const httpList = (list) => (Array.isArray(list) ? list : []).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 6);
ipcMain.on('video:open-request', (e, { url, candidates, mp3 } = {}) => {
  const list = httpList(candidates); if (!list.length && /^https?:\/\//i.test(url || '')) list.push(url);
  if (!list.length) return;
  sendUI('video:open', { url: list[0], candidates: list, partition: partitionOfWebContents(e.sender), mp3: !!mp3 });
});
ipcMain.handle('video:overlay-enabled', () => store.settings.videoOverlay !== false);
// زرار 🎬: نسأل الصفحة عن الفيديو اللي ظاهر فيها
const pendingResolves = new Map();
let resolveSeq = 0;
ipcMain.on('video:resolved', (_e, { reqId, candidates } = {}) => {
  const r = pendingResolves.get(reqId);
  if (r) { pendingResolves.delete(reqId); r(httpList(candidates)); }
});
ipcMain.handle('video:resolve-tab', (_e, { wcId } = {}) => new Promise((resolve) => {
  const wc = allWebContents.fromId(Number(wcId));
  if (!wc || wc.isDestroyed()) return resolve(null);
  const reqId = ++resolveSeq;
  // بعد روابط الصفحة نضيف روابط الفيديو اللي اتلقطت من الشبكة
  const done = (list) => {
    const all = [...new Set([...(list || []), ...sniffedList(wcId)])];
    resolve(all.length ? all : null);
  };
  pendingResolves.set(reqId, done);
  setTimeout(() => { if (pendingResolves.delete(reqId)) done(null); }, 2000);
  wc.send('video:resolve', { reqId });
}));
ipcMain.handle('video:tools', async () => ({ version: await downloader.version() }));
ipcMain.handle('video:update', async () => { try { return await downloader.update(); } catch (e) { return { error: e.message }; } });

app.setAboutPanelOptions({ applicationName: 'متصفح العالمي', copyright: '© 2026 Ahmed Gamal Elshafey. جميع الحقوق محفوظة' });
ipcMain.handle('window:minimize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize(); });
ipcMain.handle('window:toggle-maximize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.handle('window:close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });

// المتصفح الافتراضي: ويندوز 10/11 لا يسمح بالتغيير من البرنامج، فنفتح صفحة التطبيقات الافتراضية
// (برنامج التسطيب يسجّل المتصفح عند ويندوز، والاختيار النهائي من المستخدم في صفحة ويندوز)
ipcMain.handle('default-browser:status', () => ({
  isDefault: process.platform === 'win32' ? null : (app.isDefaultProtocolClient('https') && app.isDefaultProtocolClient('http')),
  canOpenSettings: process.platform === 'win32'
}));
ipcMain.handle('default-browser:set', () => {
  if (process.platform === 'win32') return shell.openExternal('ms-settings:defaultapps?registeredAppUser=AlalamyBrowser');
  app.setAsDefaultProtocolClient('http');
  app.setAsDefaultProtocolClient('https');
});

ipcMain.handle('search-url', (_e, q) => searchURL(String(q)));

ipcMain.handle('profiles:save', (_e, profiles) => {
  if (!Array.isArray(profiles)) return store.profiles;
  store.profiles = profiles
    .filter(p => p && /^(default|p_[a-z0-9]+)$/.test(p.id))
    .map(p => ({ id: p.id, name: String(p.name).slice(0, 60), color: String(p.color).slice(0, 20),
      partition: p.id === 'default' ? 'persist:default' : 'persist:' + p.id, service: p.service || '' }));
  if (!store.profiles.some(p => p.id === 'default'))
    store.profiles.unshift({ id: 'default', name: 'الحساب الرئيسي', color: '#1a73e8', partition: 'persist:default' });
  writeJSON('profiles.json', store.profiles);
  return store.profiles;
});

// ---------- العملاء ----------
const CLIENT_SITES = ['facebook', 'instagram', 'messenger', 'whatsapp', 'threads', 'business', 'adsmanager', 'tiktok', 'snapchat', 'google', 'googleads', 'x', 'youtube', 'linkedin'];
function cleanClient(c) {
  return { id: c.id, name: String(c.name || '').trim().slice(0, 40) || 'عميل', color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#1a73e8',
    partition: 'persist:' + c.id, sites: Array.isArray(c.sites) ? c.sites.filter(x => CLIENT_SITES.includes(x)) : [], created: Number(c.created) || Date.now() };
}
function broadcastClients() {
  for (const w of windows) {
    if (w.isDestroyed()) continue;
    w.webContents.send('clients:changed', store.clients);
    if (w.__client && clientName(w.__client)) w.setTitle(`${clientName(w.__client)} - متصفح العالمي`);
  }
}
ipcMain.handle('clients:save', (_e, list) => {
  if (!Array.isArray(list)) return store.clients;
  const seen = new Set();
  store.clients = list.filter(c => c && /^c_[a-z0-9]{4,20}$/.test(c.id) && !seen.has(c.id) && seen.add(c.id)).slice(0, 500).map(cleanClient);
  writeJSON('clients.json', store.clients, true);
  broadcastClients();
  return store.clients;
});
ipcMain.handle('clients:remove', async (_e, id) => {
  const c = store.clients.find(x => x.id === id);
  if (!c) return store.clients;
  store.clients = store.clients.filter(x => x !== c);
  writeJSON('clients.json', store.clients, true);
  // نافذة العميل تتقفل ومترجعش في «المغلقة مؤخراً»
  const cw = clientWindowOf(c.id);
  if (cw) { live.delete(cw.id); cw.destroy(); persistSession(true); }
  if (clientMem()[c.id]) { delete clientMem()[c.id]; try { writeJSON('client-tabs.json', clientMem()); } catch { /* ignore */ } }
  try { const ses = session.fromPartition(c.partition); await ses.clearStorageData(); await ses.clearCache(); } catch { /* ignore */ }
  store.passwords = store.passwords.filter(p => p.partition !== c.partition);
  writeJSON('passwords.json', store.passwords);
  broadcastClients();
  return store.clients;
});

// حساب جوجل المسجل في جلسة (للإيميل الرئيسي في زرار الحساب زي كروم)
function parseGoogleAccounts(text) {
  const out = [];
  try {
    const data = JSON.parse(text.slice(text.indexOf('[')));
    for (const e of (Array.isArray(data[1]) ? data[1] : [])) {
      if (Array.isArray(e) && typeof e[3] === 'string' && e[3].includes('@'))
        out.push({ name: String(e[2] || ''), email: e[3], photo: /^https:\/\/[^"]+$/.test(e[4] || '') ? e[4] : '' });
    }
  } catch { /* ignore */ }
  return out;
}
// آخر حساب جوجل اتعرف لكل جلسة: بيفضل ظاهر بعد قفل المتصفح وفتحه حتى لو النت بطيء
const googleCache = readJSON('google-accounts.json', {});
function fetchGoogleAccounts(ses) {
  return new Promise((resolve) => {
    // جوجل بترجع 400 لو الطلب GET، كروم نفسه بيبعته POST بجسم فاضي
    const req = net.request({ url: process.env.ALALAMY_GOOGLE_ACCOUNTS_URL || 'https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard', session: ses, useSessionCookies: true, method: 'POST' });
    req.setHeader('User-Agent', pageUA);
    req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    let body = '';
    const timer = setTimeout(() => { try { req.abort(); } catch {} resolve(null); }, 8000);
    req.on('response', (res) => {
      res.on('data', (d) => { body += d; });
      res.on('end', () => { clearTimeout(timer); resolve(res.statusCode === 200 ? parseGoogleAccounts(body) : null); });
    });
    req.on('error', () => { clearTimeout(timer); resolve(null); });
    req.end(' ');
  });
}
ipcMain.handle('google:accounts', async (_e, partition) => {
  const p = validPartition(partition);
  if (p.startsWith('temp_')) return [];
  const ses = setupSession(p);
  const cookies = await ses.cookies.get({ url: 'https://accounts.google.com/' }).catch(() => []);
  if (!cookies.some(c => /^(SID|__Secure-1PSID|__Secure-3PSID|LSID)$/.test(c.name))) {
    if (googleCache[p]) { delete googleCache[p]; writeJSON('google-accounts.json', googleCache); }
    return [];
  }
  const list = await fetchGoogleAccounts(ses);
  if (!list) return googleCache[p] || []; // النت فاصل أو جوجل مردتش: نعرض آخر حساب معروف
  if (JSON.stringify(list) !== JSON.stringify(googleCache[p] || [])) {
    if (list.length) googleCache[p] = list; else delete googleCache[p];
    writeJSON('google-accounts.json', googleCache);
  }
  return list;
});

ipcMain.handle('profiles:clear-data', async (_e, partition) => {
  if (typeof partition !== 'string') return false;
  const ses = setupSession(partition);
  await ses.clearStorageData();
  await ses.clearCache();
  store.passwords = store.passwords.filter(p => p.partition !== partition);
  writeJSON('passwords.json', store.passwords);
  return true;
});

ipcMain.handle('history:add', (_e, entry) => {
  if (!entry || typeof entry.url !== 'string' || !/^https?:/.test(entry.url)) return;
  const last = store.history[0];
  if (last && last.url === entry.url) { last.title = entry.title || last.title; last.time = Date.now(); }
  else store.history.unshift({ url: entry.url, title: String(entry.title || entry.url).slice(0, 300), time: Date.now() });
  // السجل ممكن يبقى كبير: بنكتبه بعد ما التصفح يهدى شوية بدل مع كل تنقل (يوتيوب بيعمل كذا تنقل لكل فيديو)
  writeJSON('history.json', store.history, false, false, 3000);
});
ipcMain.handle('history:update-title', (_e, { url, title }) => {
  const h = store.history.find(x => x.url === url);
  if (h && title) { h.title = String(title).slice(0, 300); writeJSON('history.json', store.history, false, false, 3000); }
});
ipcMain.handle('history:list', (_e, q) => {
  q = String(q || '').toLowerCase();
  const list = q ? store.history.filter(h => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)) : store.history;
  return list;
});
ipcMain.handle('history:suggest', (_e, q) => {
  q = String(q || '').toLowerCase();
  if (!q) return [];
  const seen = new Set(), out = [];
  for (const b of store.bookmarks) if ((b.url + b.title).toLowerCase().includes(q) && !seen.has(b.url)) { seen.add(b.url); out.push({ ...b, bookmark: true }); }
  for (const h of store.history) {
    if (out.length >= 8) break;
    if ((h.url + h.title).toLowerCase().includes(q) && !seen.has(h.url)) { seen.add(h.url); out.push(h); }
  }
  return out.slice(0, 8);
});
ipcMain.handle('history:remove', (_e, time) => {
  store.history = store.history.filter(h => h.time !== time);
  writeJSON('history.json', store.history);
});
ipcMain.handle('history:clear', async (_e, opts = {}) => {
  store.history = [];
  writeJSON('history.json', store.history, true);
  const all = new Set([...configured.values(), ...store.profiles.map(p => session.fromPartition(p.partition))]);
  if (opts.cache) for (const s of all) await s.clearCache();
  if (opts.cookies) for (const s of all) await s.clearStorageData();
  return true;
});

// ---------- صفحة التبويب الجديد: الاختصارات (المواقع الأكثر زيارة) والأخبار ----------
const DEFAULT_SHORTCUTS = [
  ['Google', 'https://www.google.com/'], ['Gmail', 'https://mail.google.com/'], ['خرائط جوجل', 'https://www.google.com/maps'],
  ['ترجمة جوجل', 'https://translate.google.com/'], ['ويكيبيديا', 'https://ar.wikipedia.org/'], ['شاهد', 'https://shahid.mbc.net/ar'],
  ['Netflix', 'https://www.netflix.com/'], ['أمازون مصر', 'https://www.amazon.eg/']
];
// أكتر المواقع زيارة (للاقتراح الذكي لأقسام الصفحة الرئيسية)
ipcMain.handle('history:hosts', () => {
  const c = new Map();
  for (const h of store.history) {
    let host; try { host = new URL(h.url).hostname.replace(/^www\./, ''); } catch { continue; }
    c.set(host, (c.get(host) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
});
ipcMain.handle('topsites', () => {
  const hidden = new Set(store.settings.hiddenShortcuts || []);
  const byHost = new Map();
  for (const h of store.history) {
    let u; try { u = new URL(h.url); } catch { continue; }
    if (hidden.has(u.hostname)) continue;
    const e = byHost.get(u.hostname) || { host: u.hostname, url: u.origin + '/', title: '', count: 0 };
    e.count++;
    if (!e.title && h.title && !/^https?:/.test(h.title)) e.title = h.title;
    byHost.set(u.hostname, e);
  }
  const out = [...byHost.values()].filter(e => e.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8)
    .map(e => ({ host: e.host, url: e.url, title: (e.title || e.host.replace(/^www\./, '')).split(/ [-|–] /)[0].slice(0, 40) }));
  for (const [title, url] of DEFAULT_SHORTCUTS) {
    if (out.length >= 8) break;
    const host = new URL(url).hostname;
    if (!hidden.has(host) && !out.some(o => o.url === url || (o.host === host && host !== 'www.google.com'))) out.push({ host, url, title });
  }
  return out;
});

// الأخبار من مصادر RSS مجانية (من غير أي مفتاح): بي بي سي عربي + أخبار جوجل مصر
// أخبار جوجل حسب بلد المستخدم (gl=SA ...)، والبلاد اللي مالهاش نسخة عربي بتاخد الأخبار العربية العامة
const NEWS_FEEDS = (cc) => process.env.ALALAMY_NEWS_URLS ? process.env.ALALAMY_NEWS_URLS.split(',') : [
  'https://feeds.bbci.co.uk/arabic/rss.xml',
  /^[A-Z]{2}$/.test(cc) && cc !== 'XX' ? `https://news.google.com/rss?hl=ar&gl=${cc}&ceid=${cc}:ar` : 'https://news.google.com/rss?hl=ar&gl=EG&ceid=EG:ar'
];
let newsCache = { time: 0, items: [], cc: '' };
function decodeXml(s) {
  return String(s || '').replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').trim();
}
function parseRss(xml) {
  const items = [];
  const feedTitle = decodeXml((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/) || [])[1]);
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const it = m[0];
    const tag = (t) => decodeXml((it.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
    let title = tag('title'), link = tag('link');
    if (!title || !/^https?:/.test(link)) continue;
    const itemSource = tag('source');
    const source = itemSource || feedTitle;
    // أخبار جوجل بتحط اسم المصدر في آخر العنوان
    if (itemSource && title.endsWith(' - ' + itemSource)) title = title.slice(0, -(itemSource.length + 3));
    const desc = tag('description');
    let image = (it.match(/<media:thumbnail[^>]*url="([^"]+)"/) || it.match(/<media:content[^>]*url="([^"]+)"/) ||
      it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/) || desc.match(/<img[^>]*src="([^"]+)"/) || [])[1] || '';
    image = decodeXml(image);
    if (/bbc/.test(image)) image = image.replace(/\/ace\/(standard|ws)\/\d+\//, '/ace/ws/640/');
    const time = Date.parse(tag('pubDate')) || 0;
    items.push({ title, link, source: source.replace(/^BBC News$/, 'BBC News عربي'), image: /^https:/.test(image) || process.env.ALALAMY_NEWS_URLS ? image : '', time });
  }
  return items;
}
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await net.fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': cleanUA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}
ipcMain.handle('news:get', async (_e, cc) => {
  cc = /^[A-Z]{2}$/.test(String(cc || '')) ? String(cc) : 'EG';
  if (newsCache.cc === cc && Date.now() - newsCache.time < 20 * 60000 && newsCache.items.length) return newsCache.items;
  const lists = await Promise.all(NEWS_FEEDS(cc).map(u => fetchText(u).then(parseRss).catch(() => [])));
  // نخلط المصادر: خبر بصورة ثم خبر من غير صورة، والأحدث الأول
  const seen = new Set(), items = [];
  const withImg = lists.flat().filter(i => i.image).sort((a, b) => b.time - a.time);
  const noImg = lists.flat().filter(i => !i.image).sort((a, b) => b.time - a.time);
  while ((withImg.length || noImg.length) && items.length < 40) {
    for (const i of [withImg.shift(), noImg.shift(), withImg.shift()]) {
      if (i && !seen.has(i.title)) { seen.add(i.title); items.push(i); }
    }
  }
  if (items.length) newsCache = { time: Date.now(), items, cc };
  return items;
});

ipcMain.handle('learn:search', (_e, query, opts) => learn.search(query, opts && typeof opts === 'object' ? opts : {}, cleanUA));

ipcMain.handle('bookmarks:save', (_e, list) => {
  if (!Array.isArray(list)) return store.bookmarks;
  store.bookmarks = list.filter(b => b && typeof b.url === 'string')
    .map(b => ({ id: String(b.id), title: String(b.title || b.url).slice(0, 200), url: b.url }));
  writeJSON('bookmarks.json', store.bookmarks);
  return store.bookmarks;
});

ipcMain.handle('pw:respond', (_e, { id, action }) => {
  const p = pendingPw.get(id);
  pendingPw.delete(id);
  if (!p) return;
  if (action === 'save') {
    store.passwords = store.passwords.filter(x => !(x.origin === p.origin && x.username === p.username && x.partition === p.partition));
    store.passwords.push({ id, origin: p.origin, username: p.username, partition: p.partition, secret: encrypt(p.password), time: Date.now() });
  } else if (action === 'never') {
    store.passwords.push({ id, origin: p.origin, never: true, username: '', partition: '', secret: encrypt(''), time: Date.now() });
  }
  writeJSON('passwords.json', store.passwords);
});
// استيراد كلمات المرور من ملف CSV بتاع جوجل (مدير كلمات مرور Google / كروم / إيدج / فايرفوكس)
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}
function importPasswordsCSV(text, partition = 'persist:default') {
  const rows = parseCSV(text);
  if (!rows.length) return { ok: false, error: 'الملف فاضي' };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => head.findIndex(h => names.includes(h));
  const iu = col('url', 'origin', 'website', 'login_uri'), iname = col('username', 'login', 'login_username', 'user'), ipw = col('password', 'login_password');
  if (iu < 0 || ipw < 0) return { ok: false, error: 'ده مش ملف كلمات مرور (لازم يبقى فيه عمود url و password)' };
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const pw = r[ipw] || '';
    let origin = '';
    try { const raw = (r[iu] || '').trim(); const u = new URL(/^[a-z][\w+.-]*:/i.test(raw) ? raw : 'https://' + raw); origin = /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { /* ignore */ }
    if (!origin || !pw) { skipped++; continue; }
    const username = iname >= 0 ? (r[iname] || '').trim() : '';
    const old = store.passwords.find(x => !x.never && x.origin === origin && x.username === username && x.partition === partition);
    if (old) { if (decrypt(old.secret) !== pw) { old.secret = encrypt(pw); old.time = Date.now(); updated++; } else skipped++; continue; }
    store.passwords.push({ id: 'imp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), origin, username, partition, secret: encrypt(pw), time: Date.now(), imported: true });
    added++;
  }
  writeJSON('passwords.json', store.passwords);
  return { ok: true, added, updated, skipped };
}
ipcMain.handle('pw:import', async (e, { partition } = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const r = await dialog.showOpenDialog(w, { title: 'اختار ملف كلمات المرور اللي نزّلته من جوجل (CSV)', properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const file = r.filePaths[0];
  let text = '';
  try { if (fs.statSync(file).size > 20 * 1024 * 1024) return { ok: false, error: 'الملف كبير جدًا' }; text = fs.readFileSync(file, 'utf8'); } catch (err) { return { ok: false, error: String(err.message || err) }; }
  const res = importPasswordsCSV(text, typeof partition === 'string' && PARTITION_RE.test(partition) ? partition : 'persist:default');
  if (res.ok) {
    // الملف فيه كل كلمات المرور مكشوفة: بننصح بمسحه
    const { response } = await dialog.showMessageBox(w, { type: 'warning', buttons: ['امسح الملف', 'سيبه'], defaultId: 0, cancelId: 1, title: 'تم الاستيراد',
      message: `اتضاف ${res.added} كلمة مرور${res.updated ? ` واتحدّث ${res.updated}` : ''}.`,
      detail: 'ملف CSV فيه كل كلمات المرور مكتوبة من غير تشفير. الأفضل تمسحه دلوقتي.' });
    if (response === 0) { try { await shell.trashItem(file); res.deleted = true; } catch { try { fs.unlinkSync(file); res.deleted = true; } catch { /* ignore */ } } }
  }
  return res;
});
ipcMain.handle('pw:list', () => store.passwords.map(p => ({
  id: p.id, origin: p.origin, username: p.username, partition: p.partition, never: !!p.never, time: p.time
})));
ipcMain.handle('pw:reveal', (_e, id) => {
  const p = store.passwords.find(x => x.id === id);
  return p ? decrypt(p.secret) : '';
});
ipcMain.handle('pw:remove', (_e, id) => {
  store.passwords = store.passwords.filter(x => x.id !== id);
  writeJSON('passwords.json', store.passwords);
});

ipcMain.handle('downloads:list', () => store.downloads);
ipcMain.handle('downloads:action', (_e, { id, action }) => {
  const item = activeDownloads.get(id);
  const entry = store.downloads.find(d => d.id === id);
  if (action === 'cancel' && entry && entry.video) downloader.cancel(id);
  else if (action === 'cancel' && item) item.cancel();
  else if (action === 'pause' && item) item.pause();
  else if (action === 'resume' && item && item.canResume()) item.resume();
  else if (action === 'open' && entry) shell.openPath(entry.path);
  else if (action === 'show' && entry) shell.showItemInFolder(entry.path);
  else if (action === 'remove') {
    store.downloads = store.downloads.filter(d => d.id !== id);
    writeJSON('downloads.json', store.downloads);
  }
});

ipcMain.handle('settings:save', (_e, s) => {
  const allowedEngines = ['google', 'bing', 'duckduckgo', 'yahoo'];
  if (s && typeof s === 'object') {
    if (typeof s.homepage === 'string') store.settings.homepage = s.homepage.slice(0, 500);
    if (allowedEngines.includes(s.searchEngine)) store.settings.searchEngine = s.searchEngine;
    if (typeof s.adblock === 'boolean') store.settings.adblock = s.adblock;
    if (typeof s.restoreTabs === 'boolean') store.settings.restoreTabs = s.restoreTabs;
    if ([0, 10, 30, 60, 180].includes(s.sleepMinutes)) store.settings.sleepMinutes = s.sleepMinutes;
    if (typeof s.siteLang === 'string' && /^([a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?|auto)$/.test(s.siteLang) && s.siteLang !== store.settings.siteLang) {
      store.settings.siteLang = s.siteLang;
      for (const [, ses] of configured) { try { ses.setUserAgent(pageUA, acceptLangs() || undefined); setMetaLocale(ses); } catch { /* ignore */ } }
    }
    if (typeof s.uiLang === 'string' && i18n.UI_LANGS.some(x => x[0] === s.uiLang) && s.uiLang !== store.settings.uiLang) {
      store.settings.uiLang = s.uiLang;
      i18n.setLang(s.uiLang);
      for (const w of windows) if (!w.isDestroyed()) w.webContents.send('i18n:changed', s.uiLang);
    }
    if (typeof s.translateTo === 'string' && /^[a-zA-Z-]{2,8}$/.test(s.translateTo)) store.settings.translateTo = s.translateTo;
    if (['system', 'light', 'dark'].includes(s.theme)) { store.settings.theme = s.theme; nativeTheme.themeSource = s.theme; }
    if (Array.isArray(s.hiddenShortcuts)) store.settings.hiddenShortcuts = s.hiddenShortcuts.filter(x => typeof x === 'string').slice(-200);
    for (const k of ['showBookmarksBar', 'askDownload', 'hardwareAcceleration', 'videoOverlay', 'showFeed', 'showSidebar', 'doNotTrack', 'showWidgets', 'httpsFirst', 'allowPasskeys', 'askLocation', 'translateOffer']) if (typeof s[k] === 'boolean') store.settings[k] = s[k];
    if (ZOOMS.includes(s.defaultZoom)) store.settings.defaultZoom = s.defaultZoom;
    if (s.downloadDir === '') store.settings.downloadDir = '';
    const ids = (v) => v.filter(x => typeof x === 'string' && /^[a-z]{2,12}$/.test(x)).slice(0, 30);
    if (Array.isArray(s.interests)) store.settings.interests = ids(s.interests);
    if (Array.isArray(s.interestsDismissed)) store.settings.interestsDismissed = ids(s.interestsDismissed);
    if (typeof s.workTab === 'string' && /^[a-z]{2,12}$/.test(s.workTab)) store.settings.workTab = s.workTab;
  }
  writeJSON('settings.json', store.settings);
  return store.settings;
});

// ---------- الإضافات ----------
ipcMain.handle('ext:list', () => extensions.list());
ipcMain.handle('ext:remove', (_e, id) => extensions.remove(String(id)));
ipcMain.handle('ext:load-unpacked', () => extensions.loadUnpacked());
ipcMain.handle('ext:store-url', () => extensions.WEB_STORE_URL);
ipcMain.handle('tab:activated', (_e, wcId) => {
  const wc = allWebContents.fromId(wcId);
  if (wc) extensions.selectTab(wc, partitionOfWebContents(wc));
});

// ---------- لغة الواجهة ----------
ipcMain.handle('i18n:get', () => ({ lang: i18n.lang, rtl: i18n.RTL.has(i18n.lang), dict: i18n.dict, langs: i18n.UI_LANGS }));
ipcMain.handle('i18n:ensure', (_e, list) => Array.isArray(list) ? i18n.ensure(list.slice(0, 2000).map(String)) : {});

// ---------- الترجمة ----------
ipcMain.handle('translate:text', async (_e, { text, target, source }) => {
  try { return { ok: true, ...(await translator.translateOne(String(text).slice(0, 20000), String(target), source ? String(source) : 'auto')) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('translate:many', async (_e, { texts, target, source }) => {
  try { return { ok: true, ...(await translator.translateMany(texts.map(String), String(target), source ? String(source) : 'auto')) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});

const cleanTab = (t) => ({
  url: String(t.url || '').slice(0, 4000), title: String(t.title || '').slice(0, 300),
  clientId: typeof t.clientId === 'string' && /^c_[a-z0-9]{4,20}$/.test(t.clientId) ? t.clientId : null,
  pinned: !!t.pinned, muted: !!t.muted
});
ipcMain.handle('session:save', (e, s) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.__incognito || !s || !Array.isArray(s.tabs)) return; // التصفح المتخفي مابيتحفظش
  const prev = live.get(w.id) || {};
  live.set(w.id, {
    ...prev,
    tabs: s.tabs.slice(0, 500).map(cleanTab),
    active: Number(s.active) || 0,
    client: typeof s.client === 'string' && /^c_[a-z0-9]{4,20}$/.test(s.client) ? s.client : null,
    name: typeof s.name === 'string' ? s.name.slice(0, 60) : ''
  });
  persistSession();
});
// Ctrl+Shift+T زي كروم: آخر تبويب أو نافذة اتقفلت، ولو مفيش (بعد قفل المتصفح أو قطع الكهربا) ترجع الجلسة كلها
ipcMain.handle('session:reopen', (e, { tabTime = 0, force = '' } = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const lastWin = closedWindows[closedWindows.length - 1];
  if (force !== 'session' && lastWin && lastWin.closedAt > (tabTime || 0) && force !== 'tab') {
    closedWindows.pop();
    createWindow({ restore: lastWin });
    return { done: 'window' };
  }
  if (tabTime && force !== 'session') return { done: 'tab' };
  const n = restoreLastSession(w);
  return n ? { done: 'session', windows: n } : { done: null };
});
ipcMain.handle('session:recent', () => ({
  windows: closedWindows.slice().reverse().map((x, i) => ({ i: closedWindows.length - 1 - i, count: x.tabs.length, title: (x.tabs[x.active] || x.tabs[0] || {}).title || '', time: x.closedAt })),
  canRestore: !!(lastSession && !lastSessionUsed),
  lastCount: lastSession ? lastSession.windows.reduce((n, x) => n + ((x.tabs && x.tabs.length) || 0), 0) : 0
}));
ipcMain.handle('session:reopen-window', (_e, i) => {
  const x = closedWindows[i];
  if (!x) return false;
  closedWindows.splice(i, 1);
  createWindow({ restore: x });
  return true;
});
ipcMain.handle('session:dismiss-crash', () => { crashed = false; });
// تبويب يتنقل لنافذة جديدة (زي كروم)
ipcMain.handle('tab:to-new-window', (_e, t) => { if (t && typeof t.url === 'string') createWindow({ restore: { tabs: [cleanTab(t)], active: 0, client: cleanTab(t).clientId } }); });
// فتح ملف من الجهاز (Ctrl+O)
ipcMain.handle('file:open', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const r = await dialog.showOpenDialog(w, { properties: ['openFile'], filters: [{ name: 'صفحات وملفات', extensions: ['html', 'htm', 'pdf', 'svg', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mp3', 'json', 'xml'] }, { name: 'كل الملفات', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return require('url').pathToFileURL(r.filePaths[0]).href;
});

// لقطة شاشة للجزء الظاهر من الصفحة: تتحفظ في التنزيلات وتتنسخ للحافظة
ipcMain.handle('page:screenshot', async (_e, id) => {
  const wc = allWebContents.fromId(Number(id));
  if (!wc) return { error: 'الصفحة مش موجودة' };
  const img = await wc.capturePage();
  const dir = path.join(app.getPath('pictures'), 'Alalamy Screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const name = 'لقطة ' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.png';
  const file = path.join(dir, name);
  fs.writeFileSync(file, img.toPNG());
  clipboard.writeImage(img);
  return { file };
});
ipcMain.handle('page:show-file', (_e, file) => { if (typeof file === 'string' && fs.existsSync(file)) shell.showItemInFolder(file); });
ipcMain.handle('stats', (_e, wcId) => adblock.stats(Number(wcId)));
// السماح بالإعلانات في موقع معيّن (أو منعها تاني)
ipcMain.handle('adblock:allow', (_e, url, allow) => {
  const host = adblock.hostOf(String(url || ''));
  if (!host) return store.settings;
  const list = (store.settings.adAllow || []).filter(d => d !== host);
  if (allow) list.push(host);
  store.settings.adAllow = list.slice(-500);
  writeJSON('settings.json', store.settings);
  return store.settings;
});
ipcMain.handle('adblock:update', async () => {
  try { await adblock.update(true); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('window:fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender) || win; if (w) w.setFullScreen(!w.isFullScreen()); });

ipcMain.handle('page:lens', (_e, wcId) => {
  const wc = allWebContents.fromId(wcId);
  if (wc) lensPage(wc, partitionOfWebContents(wc));
});
// صورة من «قارئ الكاميرا» بتترفع لعدسة جوجل في جلسة التبويب الحالي (حسابك أو حساب العميل)
ipcMain.handle('camera:lens', (_e, dataURL, partition) => {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(dataURL || ''));
  if (!m || m[2].length > 15e6) return;
  const p = typeof partition === 'string' && /^(persist:|temp_)[\w:-]+$/.test(partition) ? partition : 'persist:default';
  lensUpload(Buffer.from(m[2], 'base64'), setupSession(p), p);
});
// رمز QR للصفحة (زي كروم)
ipcMain.handle('qr:make', async (_e, text) => {
  if (typeof text !== 'string' || !text || text.length > 2000) return null;
  try { return await require('qrcode').toDataURL(text, { width: 320, margin: 2, errorCorrectionLevel: 'M' }); } catch { return null; }
});
// مدير المهام: الذاكرة والمعالج لكل تبويب وعملية
ipcMain.handle('task:list', () => {
  const metrics = new Map(app.getAppMetrics().map(m => [m.pid, m]));
  const rows = [];
  const used = new Set();
  for (const wc of allWebContents.getAllWebContents()) {
    if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
    const pid = wc.getOSProcessId();
    const m = metrics.get(pid);
    if (!m) continue;
    used.add(pid);
    rows.push({ wcId: wc.id, pid, name: wc.getTitle() || wc.getURL(), url: wc.getURL(), mem: m.memory.workingSetSize, cpu: m.cpu.percentCPUUsage });
  }
  const names = { Browser: 'المتصفح', GPU: 'معالج الرسوميات', Utility: 'خدمة مساعدة', Tab: 'واجهة المتصفح', Zygote: 'عملية النظام' };
  for (const m of metrics.values()) {
    if (used.has(m.pid)) continue;
    rows.push({ wcId: null, pid: m.pid, name: (names[m.type] || m.type) + (m.serviceName ? ` (${m.serviceName})` : ''), mem: m.memory.workingSetSize, cpu: m.cpu.percentCPUUsage });
  }
  return rows.sort((a, b) => b.mem - a.mem);
});
ipcMain.handle('task:end', (_e, wcId) => {
  const wc = allWebContents.fromId(wcId);
  if (wc && wc.getType() === 'webview') wc.forcefullyCrashRenderer();
});
ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('window:set-title', (e, name) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  const base = w.__incognito ? 'متصفح العالمي (تصفح متخفي)' : w.__client ? `${clientName(w.__client)} - متصفح العالمي` : 'متصفح العالمي';
  const n = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  w.setTitle(n ? `${n} - ${base}` : base);
});

ipcMain.handle('page:save', (_e, wcId) => {
  const wc = allWebContents.fromId(wcId);
  if (wc) savePage(wc);
});
// حفظ الصفحة كملف PDF (زي «حفظ كـ PDF» في كروم وفايرفوكس)
ipcMain.handle('page:pdf', async (_e, wcId) => {
  const wc = allWebContents.fromId(wcId);
  if (!wc) return null;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('downloads'), (wc.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) + '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return null;
  const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(filePath, data);
  return filePath;
});

// ---------- بدء التشغيل ----------
// تسريع الأجهزة (يتطلب إعادة تشغيل)
try { if (readJSON('settings.json', {}).hardwareAcceleration === false) app.disableHardwareAcceleration(); } catch {}
// لغة Chromium نفسها = لغة المواقع (navigator.language في كل الصفحات + Accept-Language الافتراضي)
try { const l = siteLangCode(); if (l !== 'auto') app.commandLine.appendSwitch('lang', l); } catch {}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock && !SMOKE_TEST) app.quit();
// رابط مفتوح من برنامج آخر (لما يكون المتصفح الافتراضي) أو ملف html
function urlFromArgs(argv) {
  for (const a of argv.slice(1)) {
    if (/^(https?|ftp):\/\//i.test(a)) return a;
    if (/\.(html?|pdf|svg|xhtml)$/i.test(a) && !a.startsWith('-') && fs.existsSync(a)) return require('url').pathToFileURL(path.resolve(a)).href;
  }
  return null;
}
app.on('second-instance', (_e, argv) => {
  if (!win) { createWindow({ url: urlFromArgs(argv) }); return; }
  if (win.isMinimized()) win.restore();
  win.focus();
  const url = urlFromArgs(argv);
  if (url) sendUI('open-tab', { url });
});

app.whenReady().then(() => {
  loadStore();
  i18n.setup({ userData: dataDir(), translator });
  i18n.setLang(store.settings.uiLang || 'ar');
  adblock.init(() => store.settings);
  extensions.init({
    getWindow: () => win,
    openTab: (o) => sendUI('open-tab', o),
    selectTab: (id) => sendUI('select-tab-wc', id),
    closeTab: (id) => sendUI('close-tab-wc', id),
    getSettings: () => store.settings,
    saveSettings: (s) => { Object.assign(store.settings, s); writeJSON('settings.json', store.settings); }
  });
  // جلسة الحساب الرئيسي فقط عند البدء؛ باقي الحسابات تُجهز عند فتحها (أسرع مع مئات الحسابات)
  setupSession('persist:default');
  createWindow();
  if (!SMOKE_TEST) updater.init({ getWindow: () => win });

  if (SMOKE_TEST) {
    // اختبار آلي: يفتح الواجهة، ينشئ تبويبات وتبويب خفي ويتأكد من العزل ثم يخرج
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript('window.__smokeTest ? window.__smokeTest() : Promise.resolve({ok:false, error:"no hook"})');
        // تحقق من عزل الكوكيز بين الجلسة العادية والتصفح الخفي
        const a = session.fromPartition('persist:default'), b = session.fromPartition('temp_smoketest');
        await a.cookies.set({ url: 'https://mail.example.com', name: 'SID', value: 'account-A' });
        const inA = await a.cookies.get({ url: 'https://mail.example.com' });
        const inB = await b.cookies.get({ url: 'https://mail.example.com' });
        result.cookieIsolation = inA.length === 1 && inB.length === 0;
        const enc = encrypt('secret-123');
        result.passwordRoundTrip = decrypt(enc) === 'secret-123';
        result.encryptionAvailable = safeStorage.isEncryptionAvailable();
        result.userAgent = pageUA;
        // مانع الإعلانات: لازم يمنع إعلان جوجل ويسيب سكربت عادي
        const probe = (url) => { let hit = false; adblock.onBeforeRequest({ url, resourceType: 'script', referrer: 'https://www.youm7.com/' }, () => { hit = true; }); return hit; };
        result.adblock = probe('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js') && !probe('https://www.youm7.com/js/main.js');
        result.ok = result.ok && result.cookieIsolation && result.passwordRoundTrip && result.adblock;
        console.log('SMOKE_RESULT ' + JSON.stringify(result));
        app.exit(result && result.ok ? 0 : 1);
      } catch (err) {
        console.log('SMOKE_RESULT ' + JSON.stringify({ ok: false, error: String(err) }));
        app.exit(1);
      }
    });
  }
});

let quitFlushed = false;
app.on('before-quit', (e) => {
  if (!quitting) { quitting = true; persistSession(true, true); }
  if (quitFlushed || SMOKE_TEST) return;
  // نستنى الكوكيز وبيانات المواقع تتكتب على الهارد الأول، وبعدين نقفل
  e.preventDefault();
  quitFlushed = true;
  clearTimeout(flushTimer);
  flushSessions().finally(() => app.quit());
});
app.on('window-all-closed', () => {
  for (const name of Object.keys(writeTimers)) {
    clearTimeout(writeTimers[name]);
  }
  writeJSON('history.json', store.history, true);
  // قفل عادي: الجلسة تفضل محفوظة (Ctrl+Shift+T يرجعها) ونعلّم إنها اتقفلت مظبوط
  markSessionClean();
  app.quit();
});
