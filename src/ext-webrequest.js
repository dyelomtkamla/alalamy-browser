'use strict';
/* الجزء الرئيسي من chrome.webRequest البديل للإضافات (شوف webrequest-preload.js).
   إضافات زي Snap Pixel Helper و TikTok Pixel Helper و Tag Assistant بتعرف البيكسل من طلبات الشبكة،
   وإلكترون مش بيوصّلها أي طلب طول ما المتصفح عنده session.webRequest، فبنوصّلها إحنا من هنا. */
const { ipcMain, webContents: allWebContents } = require('electron');

const TYPE = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image',
  font: 'font', object: 'object', xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media',
  webSocket: 'websocket', other: 'other'
};
const EVENTS = new Set(['onBeforeRequest', 'onBeforeSendHeaders', 'onSendHeaders', 'onHeadersReceived', 'onAuthRequired',
  'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred', 'onActionIgnored']);

// كل مكان في الإضافة مسجّل مستمعين: service worker أو صفحة (خلفية MV2 / popup)
// { ses, key, scope, send(id, details), listeners: Map(id -> { event, urls: RegExp[], types, tabId, spec }) }
const contexts = new Map();
// service worker اتقفل وهو كان مستني أحداث: بنصحّيه لما ييجي طلب يهمه
const dormant = new Map(); // scope -> { ses, listeners: [...], queue: [] }

function patternRe(p) {
  if (typeof p !== 'string') return null;
  if (p === '<all_urls>') return /^(https?|wss?|ftp|file):/i;
  const m = /^(\*|https?|wss?|ftp|file|urn):\/\/([^/]*)(\/.*)?$/i.exec(p);
  if (!m) return null;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const scheme = m[1] === '*' ? '(https?|wss?)' : esc(m[1]);
  let host = m[2];
  host = host === '*' ? '[^/]*' : host.startsWith('*.') ? '([^/]*\\.)?' + esc(host.slice(2)) : esc(host);
  // البورت اختياري زي كروم
  const pathPart = esc(m[3] || '/').replace(/\\\*/g, '.*').replace(/\*/g, '.*');
  return new RegExp('^' + scheme + '://' + host + '(:\\d+)?' + pathPart + '$', 'i');
}

function compile(l) {
  const f = (l && l.filter) || {};
  const urls = (Array.isArray(f.urls) && f.urls.length ? f.urls : ['<all_urls>']).map(patternRe).filter(Boolean);
  return {
    event: l.event,
    urls,
    types: Array.isArray(f.types) && f.types.length ? new Set(f.types) : null,
    tabId: typeof f.tabId === 'number' ? f.tabId : null,
    spec: new Set(Array.isArray(l.spec) ? l.spec : [])
  };
}

function addListener(ctx, l) {
  if (!l || typeof l.id !== 'number' || !EVENTS.has(l.event)) return;
  ctx.listeners.set(l.id, compile(l));
  // service worker عنده أحداث شبكة: نخليه صاحي زي ما كروم بيعمل طول ما فيه أحداث
  if (ctx.sw && !ctx.task) { try { ctx.task = ctx.sw.startTask(); } catch { /* ignore */ } }
  const d = ctx.scope && dormant.get(ctx.scope);
  if (d && d.queue.length) {
    clearTimeout(d.flush);
    // نستنى شوية لحد ما كل المستمعين يتسجلوا وبعدين نبعت اللي فاته
    d.flush = setTimeout(() => {
      dormant.delete(ctx.scope);
      for (const q of d.queue) deliver(ctx, q.event, q.build);
    }, 300);
  }
}

function hasAny(ses, event) {
  for (const c of contexts.values()) if (c.ses === ses) for (const l of c.listeners.values()) if (l.event === event) return true;
  for (const d of dormant.values()) if (d.ses === ses && d.listeners.some(l => l.event === event)) return true;
  return false;
}

function headerList(obj) {
  const out = [];
  for (const [name, v] of Object.entries(obj || {})) {
    for (const value of Array.isArray(v) ? v : [v]) out.push({ name, value: String(value) });
  }
  return out;
}

function requestBody(upload) {
  if (!Array.isArray(upload) || !upload.length) return undefined;
  const raw = [];
  let text = '';
  for (const u of upload) {
    if (u && u.bytes) { raw.push({ bytes: u.bytes }); text += Buffer.from(u.bytes).toString('utf8'); }
    else if (u && u.file) raw.push({ file: u.file });
  }
  // كروم بيفك الفورم (a=1&b=2) في formData؛ غير كده بيدي البيانات زي ما هي في raw
  if (raw.length && raw.every(r => r.bytes) && /^[\w.%+\-\[\]]+=[^\s{}]*(&[\w.%+\-\[\]]+=[^\s{}]*)*$/.test(text.trim())) {
    const formData = {};
    try { for (const [k, v] of new URLSearchParams(text.trim())) (formData[k] = formData[k] || []).push(v); return { formData }; } catch { /* raw */ }
  }
  return { raw };
}

function frameIds(d) {
  if (d.resourceType === 'mainFrame') return { frameId: 0, parentFrameId: -1 };
  const f = d.frame;
  try {
    if (!f || !f.parent) return { frameId: 0, parentFrameId: -1 };
    return { frameId: f.frameTreeNodeId || f.routingId || 1, parentFrameId: f.parent.parent ? (f.parent.frameTreeNodeId || 1) : 0 };
  } catch { return { frameId: 0, parentFrameId: -1 }; }
}

function originOf(u) { try { const o = new URL(u).origin; return o === 'null' ? undefined : o; } catch { return undefined; } }

function tabIdOf(d) {
  const id = d.webContentsId;
  if (!id) return -1;
  try {
    const wc = d.webContents || allWebContents.fromId(id);
    if (!wc || wc.isDestroyed() || /^chrome-extension:/.test(wc.getURL())) return -1;
  } catch { return -1; }
  return id;
}

// شكل تفاصيل الطلب زي كروم بالظبط
function chromeDetails(event, d, spec) {
  const out = Object.assign({
    requestId: String(d.id),
    url: d.url,
    method: d.method || 'GET',
    type: TYPE[d.resourceType] || 'other',
    tabId: tabIdOf(d),
    timeStamp: d.timestamp || Date.now(),
    documentLifecycle: 'active',
    frameType: d.resourceType === 'subFrame' ? 'sub_frame' : 'outermost_frame'
  }, frameIds(d));
  let page = '';
  try { if (d.frame && d.resourceType !== 'mainFrame') page = d.frame.url; } catch { /* ignore */ }
  if (!page && d.resourceType !== 'mainFrame') { try { page = d.webContents ? d.webContents.getURL() : ''; } catch { /* ignore */ } }
  const initiator = originOf(page || d.referrer || '');
  if (initiator) out.initiator = initiator;
  if (page) out.documentUrl = page;
  if (event === 'onBeforeRequest' && spec.has('requestBody')) {
    const b = requestBody(d.uploadData);
    if (b) out.requestBody = b;
  }
  if ((event === 'onBeforeSendHeaders' || event === 'onSendHeaders') && spec.has('requestHeaders')) out.requestHeaders = headerList(d.requestHeaders);
  if (d.statusCode != null && event !== 'onBeforeRequest' && event !== 'onBeforeSendHeaders' && event !== 'onSendHeaders') {
    out.statusCode = d.statusCode;
    out.statusLine = d.statusLine || `HTTP/1.1 ${d.statusCode}`;
    if (spec.has('responseHeaders')) out.responseHeaders = headerList(d.responseHeaders);
  }
  if ('fromCache' in d && event !== 'onHeadersReceived') out.fromCache = !!d.fromCache;
  if (d.ip) out.ip = d.ip;
  if (event === 'onBeforeRedirect') out.redirectUrl = d.redirectURL;
  if (event === 'onErrorOccurred') out.error = d.error || 'net::ERR_FAILED';
  return out;
}

function matches(l, event, d, typeName, tabId) {
  if (l.event !== event) return false;
  if (l.types && !l.types.has(typeName)) return false;
  if (l.tabId !== null && l.tabId !== tabId) return false;
  return l.urls.some(re => re.test(d.url));
}

function deliver(ctx, event, build) {
  for (const [id, l] of ctx.listeners) {
    const det = build(l);
    if (!det || !matches(l, event, det.__raw, det.type, det.tabId)) continue;
    const copy = Object.assign({}, det); delete copy.__raw;
    try { ctx.send(id, copy); } catch { /* اتقفل */ }
  }
}

/** بيتنادى من مستمعي session.webRequest في main.js لكل حدث. */
function emit(ses, event, d) {
  if (!d || !/^(https?|wss?):/i.test(d.url || '') || !hasAny(ses, event)) return;
  const cache = new Map();
  const build = (l) => {
    const k = [...l.spec].sort().join(',');
    if (!cache.has(k)) { const det = chromeDetails(event, d, l.spec); det.__raw = { url: d.url }; cache.set(k, det); }
    return cache.get(k);
  };
  for (const c of contexts.values()) if (c.ses === ses) deliver(c, event, build);
  for (const [scope, dm] of dormant) {
    if (dm.ses !== ses) continue;
    const det = chromeDetails(event, d, new Set(['requestBody', 'requestHeaders', 'responseHeaders']));
    if (!dm.listeners.some(l => matches(l, event, d, det.type, det.tabId))) continue;
    if (dm.queue.length < 200) dm.queue.push({ event, build: (l) => Object.assign(chromeDetails(event, d, l.spec), { __raw: { url: d.url } }) });
    if (!dm.waking) {
      dm.waking = true;
      ses.serviceWorkers.startWorkerForScope(scope).catch(() => { dormant.delete(scope); });
      setTimeout(() => { dm.waking = false; }, 10000);
    }
  }
}

/** service worker بتاع إضافة بدأ يشتغل (من extensions.js). */
function attachWorker(ses, sw) {
  const key = 'sw:' + sw.versionId;
  if (contexts.has(key)) return;
  const ctx = { ses, key, sw, scope: sw.scope, listeners: new Map(), send: (id, det) => sw.send('alalamy-wr:event', id, det) };
  contexts.set(key, ctx);
  try {
    sw.ipc.on('alalamy-wr:add', (_e, l) => addListener(ctx, l));
    sw.ipc.on('alalamy-wr:remove', (_e, id) => ctx.listeners.delete(id));
  } catch { contexts.delete(key); }
}
/** service worker اتقفل: نفتكر هو كان مستني إيه علشان نصحّيه. */
function workerStopped(ses, versionId) {
  const ctx = contexts.get('sw:' + versionId);
  if (!ctx) return;
  contexts.delete(ctx.key);
  try { if (ctx.task) ctx.task.end(); } catch { /* ignore */ }
  if (ctx.listeners.size && ctx.scope) dormant.set(ctx.scope, { ses, listeners: [...ctx.listeners.values()], queue: [] });
}

// صفحات الإضافات (خلفية MV2، popup، options)
ipcMain.on('alalamy-wr:add', (e, l) => {
  const wc = e.sender;
  const frame = e.senderFrame;
  if (!frame || !/^chrome-extension:\/\//.test(frame.url || '')) return;
  const key = `wc:${wc.id}:${frame.processId}:${frame.routingId}`;
  let ctx = contexts.get(key);
  if (!ctx) {
    ctx = { ses: wc.session, key, listeners: new Map(), send: (id, det) => { if (!frame.isDestroyed()) frame.send('alalamy-wr:event', id, det); } };
    contexts.set(key, ctx);
    const drop = () => contexts.delete(key);
    wc.once('destroyed', drop);
    wc.on('did-start-navigation', (_ev, _u, inPlace, isMain) => { if (isMain && !inPlace) drop(); });
  }
  addListener(ctx, l);
});
ipcMain.on('alalamy-wr:remove', (e, id) => {
  const frame = e.senderFrame;
  if (!frame) return;
  const ctx = contexts.get(`wc:${e.sender.id}:${frame.processId}:${frame.routingId}`);
  if (ctx) ctx.listeners.delete(id);
});

/** بيسجّل الأحداث اللي المتصفح نفسه مش بيستخدمها على الجلسة (مستمع واحد بس لكل حدث في إلكترون). */
function attachSession(ses) {
  const wr = ses.webRequest;
  wr.onSendHeaders({ urls: ['*://*/*'] }, (d) => { try { emit(ses, 'onSendHeaders', d); } catch { /* ignore */ } });
  wr.onResponseStarted({ urls: ['*://*/*'] }, (d) => { try { emit(ses, 'onResponseStarted', d); } catch { /* ignore */ } });
  wr.onBeforeRedirect({ urls: ['*://*/*'] }, (d) => { try { emit(ses, 'onBeforeRedirect', d); } catch { /* ignore */ } });
  wr.onCompleted({ urls: ['*://*/*'] }, (d) => { try { emit(ses, 'onCompleted', d); } catch { /* ignore */ } });
  wr.onErrorOccurred({ urls: ['*://*/*'] }, (d) => { try { emit(ses, 'onErrorOccurred', d); } catch { /* ignore */ } });
}

const safeEmit = (ses, event, d) => { try { emit(ses, event, d); } catch { /* ignore */ } };

module.exports = { emit: safeEmit, attachWorker, workerStopped, attachSession, patternRe };
