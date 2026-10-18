'use strict';
// يعمل داخل كل صفحة ويب (معزول): التقاط كلمات المرور عند تسجيل الدخول وتعبئتها تلقائياً
const { ipcRenderer } = require('electron');

const USER_KEY = '__alalamy_last_user';

/* مفاتيح المرور (passkeys): المواقع زي جوجل بتطلبها «في الخلفية» علشان تظهر في قايمة الملء التلقائي،
   والمتصفح مالوش القايمة دي فكانت بتطلع رسالة ويندوز «أدخل مفتاح الأمان» لوحدها كل شوية.
   بنقول للمواقع إن الطريقة دي مش متاحة؛ مفتاح المرور بيشتغل عادي لو المستخدم اختاره بنفسه. */
const NO_CONDITIONAL_PASSKEYS = `(() => {
  try {
    const PKC = window.PublicKeyCredential;
    if (PKC) {
      PKC.isConditionalMediationAvailable = () => Promise.resolve(false);
      if (PKC.getClientCapabilities) {
        const orig = PKC.getClientCapabilities.bind(PKC);
        PKC.getClientCapabilities = () => orig().then(c => Object.assign({}, c, { conditionalGet: false, conditionalCreate: false }));
      }
    }
    const cred = navigator.credentials;
    if (cred && cred.get) {
      const get = cred.get.bind(cred);
      const clicked = () => !navigator.userActivation || navigator.userActivation.isActive;
      cred.get = function (opts) {
        if (opts && opts.publicKey) {
          if (opts.mediation === 'conditional') {
            return new Promise((_, reject) => {
              const sig = opts.signal;
              if (sig) sig.addEventListener('abort', () => reject(sig.reason || new DOMException('Aborted', 'AbortError')), { once: true });
            });
          }
          // طلب مفتاح مرور من غير ما المستخدم يضغط على حاجة (زي صفحة الباسورد في جوجل):
          // نرفضه بهدوء كأن المستخدم ضغط Cancel، فالموقع يكمل بالباسورد ومافيش رسالة ويندوز
          if (opts.mediation === 'immediate' || opts.mediation === 'silent' || !clicked()) {
            return Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
          }
        }
        return get(opts);
      };
    }
  } catch (e) {}
})();`;
try {
  const { contextBridge, webFrame } = require('electron');
  if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: new Function(NO_CONDITIONAL_PASSKEYS) });
  else webFrame.executeJavaScript(NO_CONDITIONAL_PASSKEYS);
} catch { /* ignore */ }

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}
function passwordFields(root = document) {
  return [...root.querySelectorAll('input[type="password"]')].filter(visible);
}
function userFieldFor(pw) {
  const scope = pw.form || document;
  const candidates = [...scope.querySelectorAll(
    'input[type="email"], input[type="text"], input[type="tel"], input:not([type]), input[autocomplete="username"]'
  )].filter(visible);
  let best = null;
  for (const c of candidates) {
    if (c.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) best = c;
  }
  return best;
}
function setValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// تذكر البريد في خطوات تسجيل الدخول المتعددة (مثل Gmail و Outlook)
function rememberUser() {
  const u = document.querySelector('input[type="email"], input[autocomplete="username"], input[name="identifier"], input[name="loginfmt"]');
  if (u && u.value && visible(u)) {
    try { sessionStorage.setItem(USER_KEY, u.value); } catch { /* ignore */ }
  }
}

let lastSent = '';
function capture() {
  const pw = passwordFields().find(p => p.value);
  if (!pw) return rememberUser();
  const uf = userFieldFor(pw);
  let username = uf && uf.value ? uf.value : '';
  if (!username) { try { username = sessionStorage.getItem(USER_KEY) || ''; } catch { /* ignore */ } }
  const key = location.origin + '|' + username + '|' + pw.value;
  if (key === lastSent) return;
  lastSent = key;
  ipcRenderer.send('pw:capture', { origin: location.origin, username, password: pw.value });
}

document.addEventListener('submit', capture, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter') setTimeout(capture, 0); }, true);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
  if (b) setTimeout(capture, 0);
}, true);
window.addEventListener('beforeunload', capture);

// التعبئة التلقائية
let creds = null;
let filled = new WeakSet();
async function autofill() {
  const pws = passwordFields().filter(p => !p.value && !filled.has(p));
  const userOnly = document.querySelector('input[type="email"]:not([value]), input[name="identifier"], input[name="loginfmt"]');
  if (!pws.length && !userOnly) return;
  if (!creds) {
    try { creds = await ipcRenderer.invoke('pw:get', location.origin); } catch { creds = []; }
  }
  if (!creds || !creds.length) return;
  for (const pw of pws) {
    const uf = userFieldFor(pw);
    let remembered = '';
    try { remembered = sessionStorage.getItem(USER_KEY) || ''; } catch { /* ignore */ }
    const typed = (uf && uf.value) || remembered;
    const c = creds.find(x => x.username === typed) || creds[0];
    if (uf && !uf.value && c.username) setValue(uf, c.username);
    setValue(pw, c.password);
    filled.add(pw);
  }
  if (!pws.length && userOnly && visible(userOnly) && !userOnly.value && creds[0].username && !filled.has(userOnly)) {
    setValue(userOnly, creds[0].username);
    filled.add(userOnly);
  }
}

let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(autofill, 350); }
window.addEventListener('DOMContentLoaded', () => {
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
});

// ---------------- تحميل الفيديو: معرفة رابط الفيديو اللي قدامك ----------------
// في صفحات الفيد (تيك توك For You، انستجرام، فيس بوك، X، يوتيوب) رابط الصفحة مش رابط الفيديو،
// فبندوّر على الفيديو اللي شغال/ظاهر ونجيب الرابط الحقيقي بتاعه من البوست اللي هو فيه.
const SITES = [
  { host: /(^|\.)tiktok\.com$/, page: /\/(video|photo)\/\d+/, link: /\/@[^/?#]+\/(video|photo)\/\d+/ },
  // انستجرام: كود الفيديو 6 حروف أو أكتر، علشان صفحات زي /reels/audio/ مش فيديو
  { host: /(^|\.)instagram\.com$/, page: /^\/(([^/]+\/)?(p|reel|reels|tv)\/[\w-]{6,}\/?$|stories\/[^/]+\/\d+)/,
    link: /^\/([^/]+\/)?(p|reel|reels|tv)\/[\w-]{6,}\/?(\?|$)/ },
  { host: /(^|\.)(x|twitter)\.com$/, page: /\/status\/\d+/, link: /^\/[^/]+\/status\/\d+(\/video\/\d)?\/?$/ },
  { host: /(^|\.)youtube\.com$/, page: /^\/(watch|shorts\/[\w-]+|live\/[\w-]+)/, link: /^\/(watch\?v=[\w-]+|shorts\/[\w-]+)/ },
  { host: /(^|\.)facebook\.com$|^fb\.watch$/, page: /\/videos\/\d|\/reel\/\d|\/watch\/?\?v=\d|\/share\/[vr]\//,
    link: /\/videos\/(\d|[^/]+\/\d)|\/reel\/\d+|\/watch\/?\?v=\d+|\/share\/[vr]\/\w+|\/posts\/|\/permalink\.php|story_fbid=/ }
];
const site = () => SITES.find(s => s.host.test(location.hostname));
const pathOf = (u) => { try { const x = new URL(u, location.href); return x.pathname + x.search; } catch { return ''; } };

function videoArea(v) {
  const r = v.getBoundingClientRect();
  const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  return w * h;
}
function pickVideo(x, y) {
  const vids = [...document.querySelectorAll('video')].filter(v => videoArea(v) > 2000);
  if (x != null) {
    const under = vids.filter(v => { const r = v.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    if (under.length) return under.sort((a, b) => videoArea(a) - videoArea(b))[0];
  }
  let best = null, score = 0;
  for (const v of vids) {
    const s = videoArea(v) * (!v.paused && v.currentTime > 0 ? 4 : 1);
    if (s > score) { score = s; best = v; }
  }
  return best;
}
function tiktokFromVideo(v) {
  let id = null, user = null;
  for (let el = v, i = 0; el && i < 25; el = el.parentElement, i++) {
    if (!id) { const m = (el.id || '').match(/(\d{17,21})/) || (el.getAttribute && (el.getAttribute('data-video-id') || '').match(/(\d{17,21})/)); if (m) id = m[1]; }
    if (!user && el.querySelector) {
      const a = el.querySelector('a[href*="/@"]');
      if (a) { const m = pathOf(a.href).match(/\/@([^/?#]+)/); if (m) user = m[1]; }
    }
    if (id && user) break;
  }
  return id ? `https://www.tiktok.com/@${user || 'i'}/video/${id}` : null;
}
function linkFromVideo(v, s) {
  const own = v.closest('a[href]');
  if (own && s && s.link.test(pathOf(own.href))) return own.href;
  if (s && /tiktok/.test(location.hostname)) {
    // الأول: لينك فيديو جوه نفس البوست، وبعدين رقم الفيديو من عناصر الصفحة
    for (let el = v.parentElement, i = 0; el && i < 12; el = el.parentElement, i++) {
      const a = [...el.querySelectorAll('a[href*="/video/"]')].find(x => s.link.test(pathOf(x.href)));
      if (a) return a.href;
    }
    const t = tiktokFromVideo(v);
    if (t) return t;
  }
  if (s) {
    for (let el = v.parentElement, i = 0; el && i < 40; el = el.parentElement, i++) {
      const a = [...el.querySelectorAll('a[href]')].find(x => s.link.test(pathOf(x.href)));
      if (a) return a.href;
    }
  }
  return null;
}
// بيرجع كذا رابط بالترتيب، والبرنامج بيجرب واحد ورا التاني لحد ما واحد ينفع
function resolveVideoCandidates({ x, y } = {}) {
  const s = site();
  const here = location.pathname + location.search;
  const pageSpecific = s ? s.page.test(here) : true;
  const v = pickVideo(x, y);
  const list = [];
  const add = (u) => { if (u && /^https?:/.test(u) && !list.includes(u)) list.push(u); };
  const pageFirst = pageSpecific && (x == null || !s || /youtube/.test(location.hostname));
  if (pageFirst) add(location.href);
  if (v) add(linkFromVideo(v, s));
  // من غير فيديو شغال: اللينك اللي تحت الماوس (زي مربعات الريلز في صفحة الصوت أو البروفايل)
  if (x != null && s) {
    const a = document.elementFromPoint(x, y);
    const link = a && a.closest && a.closest('a[href]');
    if (link && s.link.test(pathOf(link.href))) add(link.href);
  }
  if (pageSpecific) add(location.href);
  if (v && /^https?:/.test(v.currentSrc || '')) add(v.currentSrc); // فيديو مباشر
  add(location.href);
  return list;
}
function resolveVideoURL(opts) { return resolveVideoCandidates(opts)[0]; }
ipcRenderer.on('video:resolve', (_e, req) => {
  let candidates = [location.href];
  try { candidates = resolveVideoCandidates(req || {}); } catch { /* ignore */ }
  if (req && req.open) ipcRenderer.send('video:open-request', { url: candidates[0], candidates, mp3: !!req.mp3 });
  else ipcRenderer.send('video:resolved', { reqId: req && req.reqId, url: candidates[0], candidates });
});

// زرار «⬇ تحميل» بيظهر فوق أي فيديو لما تقف عليه بالماوس
function setupOverlay() {
  if (window.top !== window || !/^https?:/.test(location.protocol)) return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;display:none;top:0;left:0;';
  const root = host.attachShadow({ mode: 'closed' });
  // بدون innerHTML علشان مواقع زي يوتيوب بتمنعه (Trusted Types)
  const style = document.createElement('style');
  style.textContent = `button{all:initial;font:600 13px system-ui,Segoe UI,Tahoma,sans-serif;color:#fff;background:rgba(20,20,20,.78);
      border:1px solid rgba(255,255,255,.35);border-radius:16px;padding:5px 12px;cursor:pointer;direction:rtl;
      box-shadow:0 2px 8px rgba(0,0,0,.35);display:inline-flex;gap:6px;align-items:center;margin-inline-end:6px}
    button:hover{background:#e53935;border-color:#e53935}`;
  root.appendChild(style);
  for (const [id, label] of [['v', '⬇ تحميل'], ['a', '🎵 MP3']]) {
    const b = document.createElement('button'); b.id = id; b.textContent = label; root.appendChild(b);
  }
  let current = null, hideTimer = null, last = 0;
  const place = (v) => {
    const r = v.getBoundingClientRect();
    host.style.left = Math.max(4, r.left + 10) + 'px';
    host.style.top = Math.max(4, r.top + 10) + 'px';
    host.style.display = 'block';
  };
  const send = (mp3) => (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!current) return;
    let candidates = [location.href];
    try { const r = current.getBoundingClientRect(); candidates = resolveVideoCandidates({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); } catch { /* ignore */ }
    ipcRenderer.send('video:open-request', { url: candidates[0], candidates, mp3 });
  };
  for (const id of ['v', 'a']) {
    const b = root.getElementById(id);
    b.addEventListener('click', send(id === 'a'), true);
    for (const ev of ['mousedown', 'pointerdown', 'mouseup', 'pointerup']) b.addEventListener(ev, (e) => e.stopPropagation(), true);
  }
  host.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  document.addEventListener('mousemove', (e) => {
    const now = Date.now(); if (now - last < 120) return; last = now;
    const v = pickVideo(e.clientX, e.clientY);
    const r = v && v.getBoundingClientRect();
    if (v && r.width >= 180 && r.height >= 120 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      clearTimeout(hideTimer); current = v; place(v);
    } else if (current && !host.matches(':hover')) {
      clearTimeout(hideTimer); hideTimer = setTimeout(() => { host.style.display = 'none'; current = null; }, 700);
    }
  }, { passive: true, capture: true });
  window.addEventListener('scroll', () => { if (current) place(current); }, { passive: true, capture: true });
  (document.body || document.documentElement).appendChild(host);
}
window.addEventListener('DOMContentLoaded', async () => {
  let on = true;
  try { on = await ipcRenderer.invoke('video:overlay-enabled'); } catch { /* ignore */ }
  if (on) setupOverlay();
});

// ---------------- تخطي إعلانات يوتيوب ----------------
// بيشيل الإعلانات من بيانات الفيديو قبل ما المشغّل يشوفها، ولو إعلان ظهر برضه
// بيكتم صوته ويخلّصه في لحظة ويدوس «تخطي» لوحده.
const YT_SHIELD = `(() => {
  if (window.__alalamyYT) return; window.__alalamyYT = 1;
  const KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const clean = (o) => {
    if (!o || typeof o !== 'object') return o;
    for (const k of KEYS) if (k in o) { try { delete o[k]; } catch (e) {} }
    if (o.playerResponse) clean(o.playerResponse);
    if (Array.isArray(o)) for (const x of o) if (x && x.playerResponse) clean(x.playerResponse);
    return o;
  };
  const hasAds = (o) => o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || o.playerResponse || Array.isArray(o));
  const jp = JSON.parse;
  JSON.parse = function () { const r = jp.apply(this, arguments); try { if (hasAds(r)) clean(r); } catch (e) {} return r; };
  const rj = Response.prototype.json;
  Response.prototype.json = function () { return rj.call(this).then((r) => { try { if (hasAds(r)) clean(r); } catch (e) {} return r; }); };
  let ipr;
  try { Object.defineProperty(window, 'ytInitialPlayerResponse', { configurable: true, get() { return ipr; }, set(v) { ipr = clean(v); } }); } catch (e) {}
  let saved = null;
  setInterval(() => {
    const p = document.querySelector('#movie_player, .html5-video-player');
    const v = p && p.querySelector('video');
    if (!v) return;
    if (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')) {
      if (!saved) saved = { muted: v.muted, rate: v.playbackRate };
      v.muted = true;
      try { v.playbackRate = 16; } catch (e) {}
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.1) v.currentTime = v.duration - 0.05;
      const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, .ytp-ad-skip-button-container button');
      if (b) b.click();
    } else if (saved) {
      v.muted = saved.muted; v.playbackRate = saved.rate || 1; saved = null;
    }
  }, 250);
})();`;
const YT_CSS = `#player-ads, #masthead-ad, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,
ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer, ytd-companion-slot-renderer,
ytd-action-companion-ad-renderer, ytd-statement-banner-renderer, ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer),
.ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-text-overlay, .video-ads.ytp-ad-module > .ytp-ad-player-overlay-layout__ad-info-container,
ytm-promoted-sparkles-web-renderer, ytm-companion-ad-renderer, ytm-ad-slot-renderer, ad-slot-renderer, ytm-promoted-video-renderer
{ display: none !important; }`;
if (/(^|\.)youtube\.com$/.test(location.hostname)) {
  let on = true;
  try { on = ipcRenderer.sendSync('adblock:active', location.href); } catch { /* ignore */ }
  if (on) {
    try { require('electron').webFrame.executeJavaScript(YT_SHIELD); } catch { /* ignore */ }
    const addCss = () => {
      const st = document.createElement('style');
      st.textContent = YT_CSS;
      (document.head || document.documentElement).appendChild(st);
    };
    if (document.documentElement) addCss(); else window.addEventListener('DOMContentLoaded', addCss);
  }
}

// ---------- اختصارات كروم اللي الصفحة ليها الأولوية فيها (Ctrl+F، Ctrl+S، Ctrl+U...) ----------
// لو الصفحة نفسها ماستخدمتش الاختصار (preventDefault) المتصفح بينفذه، زي كروم بالظبط
try {
  const { shortcutAction, PAGE_FIRST } = require('./shortcuts');
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    const action = shortcutAction({ control: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, key: e.key, code: e.code });
    if (!action || !PAGE_FIRST.has(action)) return;
    // نستنى لحد ما كل أكواد الصفحة تخلص
    setTimeout(() => {
      if (e.defaultPrevented) return;
      if (action === 'open-menu' && e.repeat) return;
      ipcRenderer.send('page:shortcut', action);
    }, 0);
  }, true);
} catch { /* ignore */ }
