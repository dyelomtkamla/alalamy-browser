'use strict';
// متصفح العالمي - العملية الرئيسية (Electron / Chromium)
const {
  app, BrowserWindow, ipcMain, session, safeStorage, Menu, clipboard,
  shell, dialog, nativeTheme, net, webContents: allWebContents
} = require('electron');
const path = require('path');
const downloader = require('./downloader');
const fs = require('fs');
const extensions = require('./extensions');
const translator = require('./translate');
const updater = require('./updater');
const adblock = require('./adblock');

// ---------- واجهة مستخدم بهوية كروم عادية حتى لا ترفض جوجل/مايكروسوفت تسجيل الدخول ----------
// نحذف أي رمز غير قياسي (مثل Electron/xx واسم التطبيق) ونبقي على Mozilla/AppleWebKit/Chrome/Safari فقط
const cleanUA = app.userAgentFallback
  .replace(/ (?!(?:Chrome|Safari|AppleWebKit|Mozilla)\/)[^\s()]+\/[\d.]+/g, '');
app.userAgentFallback = cleanUA;

const SMOKE_TEST = process.argv.includes('--smoke-test');
if (SMOKE_TEST) app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'alalamy-smoke-')));

// ---------- تخزين بسيط بملفات JSON داخل مجلد بيانات المستخدم ----------
const dataDir = () => app.getPath('userData');
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir(), name), 'utf8')); }
  catch { return fallback; }
}
const writeTimers = {};
function writeJSON(name, value, immediate = false) {
  const doWrite = () => {
    const file = path.join(dataDir(), name);
    fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 1));
    fs.renameSync(file + '.tmp', file);
  };
  clearTimeout(writeTimers[name]);
  if (immediate) return doWrite();
  writeTimers[name] = setTimeout(doWrite, 400);
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
    unpackedExtensions: []
  };
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
  store.session = readJSON('session.json', null);
}

// ---------- مانع الإعلانات (قوايم uBlock Origin و EasyList) موجود في adblock.js ----------

// ---------- إعداد كل جلسة (كل حساب له جلسة معزولة بالكامل: كوكيز، تخزين، كاش) ----------
const PARTITION_RE = /^(persist:(default|p_[a-z0-9]+|c_[a-z0-9]+)|temp_[a-z0-9]+)$/;
const configured = new Map(); // partition -> session
function setupSession(partition) {
  if (configured.has(partition)) return configured.get(partition);
  const ses = session.fromPartition(partition);
  configured.set(partition, ses);
  ses.setUserAgent(cleanUA);
  extensions.setup(partition);

  adblock.attach(ses);
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    try { if (adblock.onBeforeRequest(details, cb)) return; } catch { /* ignore */ }
    cb({});
  });

  const allowed = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write', 'media', 'pointerLock']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));

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

function createWindow({ incognito = false, url = null } = {}) {
  const saved = readJSON('window.json', { width: 1300, height: 850 });
  const bounds = { width: saved.width || 1300, height: saved.height || 850 };
  if (!windows.size) Object.assign(bounds, saved);
  else if (win && !win.isDestroyed()) { const b = win.getBounds(); bounds.x = b.x + 30; bounds.y = b.y + 30; }
  const w = new BrowserWindow({
    ...bounds,
    minWidth: 700,
    minHeight: 450,
    title: incognito ? 'متصفح العالمي (تصفح متخفي)' : 'متصفح العالمي',
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
  w.__startUrl = url;
  windows.add(w);
  if (!incognito && !primaryWin) primaryWin = w;
  win = w;
  Menu.setApplicationMenu(null);
  w.loadFile(path.join(__dirname, 'ui', 'index.html'), incognito ? { query: { incognito: '1' } } : undefined);
  w.on('focus', () => { win = w; });
  w.on('page-title-updated', (e) => e.preventDefault());
  setupWindow(w, incognito);
  return w;
}

function setupWindow(win, incognito) {
  if (SMOKE_TEST) win.webContents.on('console-message', (_e, level, message, line, src) => console.log('UI_CONSOLE', level, message, src + ':' + line));
  win.webContents.on('preload-error', (_e, p, err) => console.log('PRELOAD_ERROR', p, err));

  const saveBounds = () => { if (!incognito && win === primaryWin && !win.isMaximized() && !win.isMinimized()) writeJSON('window.json', win.getBounds()); };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // تأمين الـ webview: لا يمكن للواجهة تحديد preload أو تفعيل node داخل الصفحات
  win.webContents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete webPreferences.preloadURL;
    webPreferences.preload = path.join(__dirname, 'page-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = false;
    const partition = params.partition || 'persist:default';
    if (!PARTITION_RE.test(partition)) params.partition = 'persist:default';
    setupSession(params.partition);
  });

  win.webContents.on('did-attach-webview', (_e, guest) => {
    setupGuest(guest);
    extensions.addTab(guest, partitionOfWebContents(guest));
  });
  win.webContents.on('before-input-event', (e, input) => handleShortcut(e, input));
  const sendWinState = () => { if (!win.isDestroyed()) win.webContents.send('window:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() }); };
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, sendWinState);
  win.on('closed', () => {
    windows.delete(win);
    if (primaryWin === win) primaryWin = [...windows].find(x => !x.__incognito) || null;
    // بيانات التصفح المتخفي بتتمسح أول ما النافذة تتقفل
    if (incognito && win.__partition) {
      try { session.fromPartition(win.__partition).clearStorageData(); session.fromPartition(win.__partition).clearCache(); } catch {}
    }
    const rest = [...windows];
    setFocusedWin(rest[rest.length - 1] || null);
  });
}
function setFocusedWin(w) { win = w; }

// ---------- اختصارات لوحة المفاتيح (تعمل حتى والتركيز داخل الصفحة) ----------
function handleShortcut(e, input) {
  if (input.type !== 'keyDown') return;
  const ctrl = input.control || input.meta;
  const k = input.key.toLowerCase();
  let action = null;
  if (ctrl && input.shift && k === 't') action = 'reopen-tab';
  else if (ctrl && input.shift && k === 'n') action = 'new-incognito-window';
  else if (ctrl && !input.shift && k === 'n') action = 'new-window';
  else if (ctrl && input.shift && k === 'a') action = 'search-tabs';
  else if (ctrl && input.shift && k === 'm') action = 'clients';
  else if (input.shift && !ctrl && k === 'escape') action = 'task-manager';
  else if (ctrl && input.shift && k === 'b') action = 'toggle-bookmarks-bar';
  else if (ctrl && input.shift && k === 'delete') action = 'show-history';
  else if (ctrl && input.shift && k === 's') action = 'screenshot';
  else if (k === 'f9') action = 'reader';
  else if (input.alt && input.shift && k === 'r') action = 'reader';
  else if (ctrl && input.shift && k === 'i') action = 'devtools';
  else if (ctrl && k === 'u') action = 'view-source';
  else if (ctrl && k === 's') action = 'save-page';
  else if (ctrl && k === 't') action = 'new-tab';
  else if (ctrl && k === 'w') action = 'close-tab';
  else if (ctrl && k === 'l') action = 'focus-address';
  else if (ctrl && k === 'r') action = 'reload';
  else if (ctrl && k === 'd') action = 'bookmark';
  else if (ctrl && k === 'h') action = 'show-history';
  else if (ctrl && k === 'j') action = 'show-downloads';
  else if (ctrl && k === 'f') action = 'find';
  else if (ctrl && k === 'p') action = 'print';
  else if (ctrl && (k === '=' || k === '+')) action = 'zoom-in';
  else if (ctrl && k === '-') action = 'zoom-out';
  else if (ctrl && k === '0') action = 'zoom-reset';
  else if (ctrl && k === 'tab') action = input.shift ? 'prev-tab' : 'next-tab';
  else if (ctrl && /^[1-9]$/.test(k)) action = 'tab-' + k;
  else if (k === 'f5') action = 'reload';
  else if (k === 'f11') action = 'fullscreen';
  else if (k === 'f12') action = 'devtools';
  else if (input.alt && k === 'arrowleft') action = 'back';
  else if (input.alt && k === 'arrowright') action = 'forward';
  else if (k === 'escape') action = 'escape';
  if (action) {
    if (action !== 'escape') e.preventDefault();
    sendTo(e.sender, 'shortcut', action);
  }
}

function setupGuest(guest) {
  guest.on('before-input-event', (e, input) => handleShortcut(e, input));

  // الروابط التي تفتح في نافذة جديدة تفتح كتبويب جديد بنفس الحساب
  guest.setWindowOpenHandler(({ url, disposition }) => {
    const partition = partitionOfWebContents(guest);
    if (disposition === 'new-window' && /^https?:/.test(url)) {
      // نوافذ منبثقة حقيقية (مثل نوافذ تسجيل الدخول OAuth) تبقى منبثقة بنفس الجلسة
      return { action: 'allow', overrideBrowserWindowOptions: { width: 600, height: 720,
        webPreferences: { partition, contextIsolation: true, nodeIntegration: false } } };
    }
    if (url === 'about:blank') return { action: 'allow' };
    sendTo(guest, 'open-tab', { url, partition, background: disposition === 'background-tab' });
    return { action: 'deny' };
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
    key('فحص', 'CmdOrCtrl+Shift+I', { click: () => guest.inspectElement(p.x, p.y) }));

  const t = [];
  for (const g of groups) if (g.length) { if (t.length) t.push(sep); t.push(...g); }
  return t;
}

/* «البحث في الصفحة باستخدام Google Lens»: صورة للجزء الظاهر من الصفحة وبنرفعها لعدسة جوجل */
async function lensPage(guest, partition) {
  try {
    const img = await guest.capturePage();
    const png = img.toPNG();
    const ses = guest.session;
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
  if (typeof origin !== 'string' || origin !== safeOrigin(e.sender.getURL())) return [];
  return store.passwords
    .filter(p => !p.never && p.origin === origin && p.partition === partition)
    .map(p => ({ username: p.username, password: decrypt(p.secret) }));
});

function safeOrigin(u) { try { return new URL(u).origin; } catch { return ''; } }

// ---------- واجهة برمجية للواجهة الرسومية ----------
ipcMain.handle('init', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const first = w && w === primaryWin && !w.__restored;
  if (w) w.__restored = true;
  return {
  profiles: store.profiles,
  clients: store.clients,
  bookmarks: store.bookmarks,
  settings: store.settings,
  session: first && store.settings.restoreTabs ? store.session : null,
  incognito: isIncognitoWin(w),
  primary: !!(w && w === primaryWin),
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
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
// ---------- تحميل الفيديوهات والصوت ----------
const validPartition = (p) => typeof p === 'string' && PARTITION_RE.test(p) ? p : 'persist:default';
ipcMain.handle('video:probe', async (_e, { url, partition }) => {
  if (!/^https?:\/\//i.test(url || '')) return { error: 'الرابط مش صالح' };
  downloader.autoUpdate();
  try { return await downloader.probe(url, { partition: validPartition(partition), userAgent: cleanUA }); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('video:download', (_e, { url, partition, choice, title, useCookies }) => {
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
  if (r) { pendingResolves.delete(reqId); const list = httpList(candidates); r(list.length ? list : null); }
});
ipcMain.handle('video:resolve-tab', (_e, { wcId } = {}) => new Promise((resolve) => {
  const wc = allWebContents.fromId(Number(wcId));
  if (!wc || wc.isDestroyed()) return resolve(null);
  const reqId = ++resolveSeq;
  pendingResolves.set(reqId, resolve);
  setTimeout(() => { if (pendingResolves.delete(reqId)) resolve(null); }, 2000);
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
const CLIENT_SITES = ['facebook', 'instagram', 'tiktok', 'snapchat', 'google', 'x', 'business', 'youtube', 'linkedin', 'threads'];
function cleanClient(c) {
  return { id: c.id, name: String(c.name || '').trim().slice(0, 40) || 'عميل', color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#1a73e8',
    partition: 'persist:' + c.id, sites: Array.isArray(c.sites) ? c.sites.filter(x => CLIENT_SITES.includes(x)) : [], created: Number(c.created) || Date.now() };
}
function broadcastClients() {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send('clients:changed', store.clients);
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
  try { const ses = session.fromPartition(c.partition); await ses.clearStorageData(); await ses.clearCache(); } catch { /* ignore */ }
  store.passwords = store.passwords.filter(p => p.partition !== c.partition);
  writeJSON('passwords.json', store.passwords);
  broadcastClients();
  return store.clients;
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
  writeJSON('history.json', store.history);
});
ipcMain.handle('history:update-title', (_e, { url, title }) => {
  const h = store.history.find(x => x.url === url);
  if (h && title) { h.title = String(title).slice(0, 300); writeJSON('history.json', store.history); }
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
const NEWS_FEEDS = process.env.ALALAMY_NEWS_URLS ? process.env.ALALAMY_NEWS_URLS.split(',') : [
  'https://feeds.bbci.co.uk/arabic/rss.xml',
  'https://news.google.com/rss?hl=ar&gl=EG&ceid=EG:ar'
];
let newsCache = { time: 0, items: [] };
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
ipcMain.handle('news:get', async () => {
  if (Date.now() - newsCache.time < 20 * 60000 && newsCache.items.length) return newsCache.items;
  const lists = await Promise.all(NEWS_FEEDS.map(u => fetchText(u).then(parseRss).catch(() => [])));
  // نخلط المصادر: خبر بصورة ثم خبر من غير صورة، والأحدث الأول
  const seen = new Set(), items = [];
  const withImg = lists.flat().filter(i => i.image).sort((a, b) => b.time - a.time);
  const noImg = lists.flat().filter(i => !i.image).sort((a, b) => b.time - a.time);
  while ((withImg.length || noImg.length) && items.length < 40) {
    for (const i of [withImg.shift(), noImg.shift(), withImg.shift()]) {
      if (i && !seen.has(i.title)) { seen.add(i.title); items.push(i); }
    }
  }
  if (items.length) newsCache = { time: Date.now(), items };
  return items;
});

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
    if (typeof s.translateTo === 'string' && /^[a-zA-Z-]{2,8}$/.test(s.translateTo)) store.settings.translateTo = s.translateTo;
    if (['system', 'light', 'dark'].includes(s.theme)) { store.settings.theme = s.theme; nativeTheme.themeSource = s.theme; }
    if (Array.isArray(s.hiddenShortcuts)) store.settings.hiddenShortcuts = s.hiddenShortcuts.filter(x => typeof x === 'string').slice(-200);
    for (const k of ['showBookmarksBar', 'askDownload', 'hardwareAcceleration', 'videoOverlay', 'showFeed', 'showSidebar']) if (typeof s[k] === 'boolean') store.settings[k] = s[k];
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

// ---------- الترجمة ----------
ipcMain.handle('translate:text', async (_e, { text, target, source }) => {
  try { return { ok: true, ...(await translator.translateOne(String(text).slice(0, 20000), String(target), source ? String(source) : 'auto')) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('translate:many', async (_e, { texts, target, source }) => {
  try { return { ok: true, ...(await translator.translateMany(texts.map(String), String(target), source ? String(source) : 'auto')) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});

ipcMain.handle('session:save', (e, s) => {
  if (BrowserWindow.fromWebContents(e.sender) !== primaryWin) return; // النوافذ التانية والمتخفية مابتحفظش جلسة
  store.session = s;
  writeJSON('session.json', s);
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
  const base = w.__incognito ? 'متصفح العالمي (تصفح متخفي)' : 'متصفح العالمي';
  const n = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  w.setTitle(n ? `${n} - ${base}` : base);
});

ipcMain.handle('page:save', (_e, wcId) => {
  const wc = allWebContents.fromId(wcId);
  if (wc) savePage(wc);
});

// ---------- بدء التشغيل ----------
// تسريع الأجهزة (يتطلب إعادة تشغيل)
try { if (readJSON('settings.json', {}).hardwareAcceleration === false) app.disableHardwareAcceleration(); } catch {}
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
        result.userAgent = cleanUA;
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

app.on('window-all-closed', () => {
  for (const name of Object.keys(writeTimers)) {
    clearTimeout(writeTimers[name]);
  }
  writeJSON('history.json', store.history, true);
  writeJSON('session.json', store.session, true);
  app.quit();
});
