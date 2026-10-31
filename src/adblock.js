'use strict';
/*
 * مانع الإعلانات: نفس قوايم uBlock Origin و EasyList و EasyPrivacy و Liste AR (للمواقع العربية)
 * عن طريق محرك Ghostery. بيمنع الإعلانات في الشبكة، وبيخفي أماكنها في الصفحة، وبيشغّل
 * سكربتات uBlock الخاصة بيوتيوب. القوايم بتتحدث لوحدها كل 3 أيام.
 */
const fs = require('fs');
const path = require('path');
const { app, ipcMain, net, utilityProcess } = require('electron');
const { ElectronBlocker, adsAndTrackingLists } = require('@ghostery/adblocker-electron');
const { parse: parseDomain } = require('tldts-experimental');

// المكتبة ممكن تتحط جوه node_modules بتاعة adblocker-electron وقت البناء، فبندور في المكانين
const PRELOAD = (() => {
  try { return require.resolve('@ghostery/adblocker-electron-preload'); } catch {}
  return require.resolve('@ghostery/adblocker-electron-preload', { paths: [path.dirname(require.resolve('@ghostery/adblocker-electron/package.json'))] });
})();
const BUNDLED = path.join(__dirname, 'adblock-engine.bin');
const LISTS = [...adsAndTrackingLists, 'https://raw.githubusercontent.com/easylist/listear/master/Liste_AR.txt'];
const UPDATE_EVERY = 3 * 24 * 3600 * 1000;

let engine = null;
let settings = () => ({});
let total = 0;
const perTab = new Map(); // webContentsId -> عدد الحاجات الممنوعة في الصفحة الحالية

function cachePath() { return path.join(app.getPath('userData'), 'adblock-engine.bin'); }

function load() {
  for (const p of [cachePath(), BUNDLED]) {
    try {
      engine = ElectronBlocker.deserialize(fs.readFileSync(p));
      return p;
    } catch { /* نسخة قديمة أو مش موجودة، نجرب اللي بعدها */ }
  }
  engine = ElectronBlocker.empty();
  return null;
}

async function update(force = false) {
  let age = Infinity;
  try { age = Date.now() - fs.statSync(cachePath()).mtimeMs; } catch { /* first time */ }
  if (!force && age < UPDATE_EVERY) return false;
  const lists = await Promise.all(LISTS.map(async (url) => {
    const r = await net.fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }));
  const bin = await parseInWorker(lists);
  const fresh = ElectronBlocker.deserialize(bin);
  fs.writeFileSync(cachePath() + '.tmp', bin);
  fs.renameSync(cachePath() + '.tmp', cachePath());
  engine = fresh;
  return true;
}

// التحليل نفسه في عملية تانية علشان العملية الرئيسية (اللي كل طلبات الشبكة بتعدي عليها) ماتقفش
function parseInWorker(lists) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'adblock-worker.js'), [], { serviceName: 'adblock-update' });
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); try { child.kill(); } catch { /* ignore */ } fn(v); };
    const timer = setTimeout(() => finish(reject, new Error('timeout')), 2 * 60 * 1000);
    child.once('message', (m) => m && m.ok ? finish(resolve, new Uint8Array(m.bin)) : finish(reject, new Error((m && m.error) || 'worker failed')));
    child.once('exit', (code) => finish(reject, new Error('worker exited ' + code)));
    child.postMessage({ lists, config: { enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true } });
  });
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function siteAllowed(pageUrl) {
  const h = hostOf(pageUrl);
  if (!h) return false;
  return (settings().adAllow || []).some(d => h === d || h.endsWith('.' + d));
}
/** شغال على الصفحة دي ولا لأ (الإعداد عام + الموقع مش في قايمة المسموح). */
// صفحات تسجيل الدخول بتاعة جوجل: مانع الإعلانات لو منع أي سكربت فيها (زي فحص الأمان) جوجل بترفض الدخول
const LOGIN_PAGE = /^https:\/\/(accounts\.google\.[a-z.]+|accounts\.youtube\.com|myaccount\.google\.com|gds\.google\.com)\//;
const YT_PAGE = /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com)\//i;
function activeFor(pageUrl) {
  if (LOGIN_PAGE.test(pageUrl || '')) return false;
  return !!engine && settings().adblock !== false && /^https?:/.test(pageUrl || '') && !siteAllowed(pageUrl);
}

function pageUrlOf(details) {
  try { if (details.webContents && !details.webContents.isDestroyed()) return details.webContents.getURL(); } catch { /* ignore */ }
  return details.referrer || '';
}

/** بيرجع true لو اتعامل مع الطلب (منعه أو حوّله). */
function onBeforeRequest(details, cb) {
  if (details.resourceType === 'mainFrame') {
    if (details.webContentsId) perTab.set(details.webContentsId, 0);
    return false;
  }
  if (!activeFor(pageUrlOf(details))) return false;
  let result = {};
  engine.onBeforeRequest(details, (r) => { result = r; });
  if (!result.cancel && !result.redirectURL) return false;
  // uBlock بيرد على طلبات زي ad_status.js و pagead/id بملف بديل فاضي، وإحنا ماينفعش نحوّل لـ data: فكنا بنمنعها.
  // يوتيوب بقى بيبص على الطلبات دي: لو فشلت يعرف إن فيه مانع ويقفل الفيديو («تخالف أدوات حظر الإعلانات...»).
  // فعلى يوتيوب بنسيب الطلبات اللي ليها بديل تعدّي زي ما هي (مش إعلانات، دي فحوصات بس)
  if (result.redirectURL && YT_PAGE.test(pageUrlOf(details))) return false;
  total++;
  if (details.webContentsId) perTab.set(details.webContentsId, (perTab.get(details.webContentsId) || 0) + 1);
  // التحويل لـ data: بيفشل في كروميوم (ERR_UNSAFE_REDIRECT)، فنمنع الطلب على طول
  cb({ cancel: true });
  return true;
}

function attach(ses, fixHeaders) {
  if (typeof ses.registerPreloadScript === 'function') {
    if (!ses.getPreloadScripts().some(p => p.filePath === PRELOAD)) ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD });
  } else ses.setPreloads([...ses.getPreloads().filter(p => p !== PRELOAD), PRELOAD]);
  ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, done) => {
    // مستمع واحد بس مسموح لكل جلسة، فتعديلات المتصفح نفسه على الهيدرز بتعدي من هنا كمان
    const cb = fixHeaders ? (r) => done(fixHeaders(details, r || {})) : done;
    if (!activeFor(pageUrlOf(details)) && details.resourceType !== 'mainFrame') return cb({});
    if (details.resourceType === 'mainFrame' && !activeFor(details.url)) return cb({});
    engine.onHeadersReceived(details, cb);
  });
}

function init(getSettings) {
  settings = getSettings;
  load();
  // إخفاء أماكن الإعلانات بـ CSS بس. سكربتات uBlock (scriptlets) مقفولة: كانت بتتحقن مرتين
  // وبتعمل «Maximum call stack» في يوتيوب فالفيديو ما يشتغلش غير بعد ريفرش.
  ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
    if (!activeFor(url)) return undefined;
    const p = parseDomain(url);
    const first = msg === undefined;
    const { active, styles } = engine.getCosmeticsFilters({
      domain: p.domain || '', hostname: p.hostname || '', url,
      classes: msg && msg.classes, hrefs: msg && msg.hrefs, ids: msg && msg.ids,
      getBaseRules: first, getInjectionRules: false, getExtendedRules: false,
      getRulesFromHostname: first, getRulesFromDOM: !first,
      callerContext: { frameId: event.frameId, processId: event.processId }
    });
    if (active !== false && styles && styles.length) event.sender.insertCSS(styles, { cssOrigin: 'user' }).catch(() => {});
    return undefined;
  });
  // من غير مراقبة مستمرة للصفحة: كانت بتبعت رسالة مع كل تغيير في الصفحة (تقيلة في يوتيوب ووقت تغيير المقاس)
  ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', () => false);
  // صفحة يوتيوب بتسأل هل تشغّل تخطي الإعلانات
  ipcMain.on('adblock:active', (e, url) => { e.returnValue = activeFor(url); });
  const tryUpdate = () => update().catch(e => console.log('adblock update failed:', e.message));
  setTimeout(tryUpdate, 60 * 1000);
  setInterval(tryUpdate, 6 * 3600 * 1000);
}

function stats(wcId) {
  return { blocked: total, tab: perTab.get(wcId) || 0 };
}

module.exports = { init, attach, onBeforeRequest, activeFor, siteAllowed, hostOf, stats, update, load, PRELOAD };
