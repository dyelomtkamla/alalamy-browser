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
// أدوات المعلنين وبلوجر: القوايم بتمنع حاجات جوه لوحات الإعلانات نفسها (سكربتات البيكسل، «Event Builder»،
// أماكن فيها كلمة ad) فحفظ الأحداث كان بيفشل. المانع بيتقفل في الصفحات دي زي ما المعلن محتاج.
const AD_TOOL_PAGE = /^https:\/\/([a-z0-9-]+\.)*(ads\.snapchat\.com|business\.snapchat\.com|forbusiness\.snapchat\.com|businesshelp\.snapchat\.com|ads\.tiktok\.com|business\.tiktok\.com|getstarted\.tiktok\.com|ads\.google\.com|tagassistant\.google\.com|tagmanager\.google\.com|analytics\.google\.com|search\.google\.com|business\.google\.com|merchants\.google\.com|adsense\.google\.com|business\.facebook\.com|adsmanager\.facebook\.com|blogger\.com)(:\d+)?\//i;
// معاينة بلوجر (بتتفتح على مدونتك نفسها في blogspot)
const BLOGGER_PREVIEW = /^https:\/\/[^/]+\/b\/(post|page)-preview\b/i;
// سكربتات وطلبات البيكسل نفسها (سناب، تيك توك، جوجل، ميتا، بنترست، إكس، لينكدإن): من غيرها
// البيكسل مش بيشتغل على موقعك ولا «Pixel Helper» بيشوفه ولا أداة إعداد الأحداث بتحفظ
const PIXEL_HOST = /(^|\.)(tr\.snapchat\.com|tr-shadow\.snapchat\.com|sc-static\.net|analytics\.tiktok\.com|analytics-sg\.tiktok\.com|analytics\.us\.tiktok\.com|business-api\.tiktok\.com|googletagmanager\.com|google-analytics\.com|googleadservices\.com|googleads\.g\.doubleclick\.net|td\.doubleclick\.net|stats\.g\.doubleclick\.net|connect\.facebook\.net|ct\.pinterest\.com|analytics\.twitter\.com|static\.ads-twitter\.com|px\.ads\.linkedin\.com|snap\.licdn\.com)$/i;
const PIXEL_PATH = /^https:\/\/(www\.)?(google\.[a-z.]+\/(pagead\/|ccm\/|ads\/ga-audiences|rmkt\/)|facebook\.com\/tr\b|s\.pinimg\.com\/ct\/)/i;
// يوتيوب بيكشف مانع الإعلانات لو طلبات الإعلانات اتمنعت نص نص («تخالف أدوات حظر الإعلانات بنود الخدمة»)،
// فهناك بنفضل نمنعها كلها زي الأول
const NO_PIXEL_PAGE = /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtubekids\.com)(:\d+)?\//i;
function isPixel(url, pageUrl) {
  if (settings().allowAdPixels === false) return false;
  if (NO_PIXEL_PAGE.test(pageUrl || '')) return false;
  try { if (PIXEL_HOST.test(new URL(url).hostname)) return true; } catch { return false; }
  return PIXEL_PATH.test(url);
}
function activeFor(pageUrl) {
  if (LOGIN_PAGE.test(pageUrl || '')) return false;
  if (AD_TOOL_PAGE.test(pageUrl || '') || BLOGGER_PREVIEW.test(pageUrl || '')) return false;
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
  if (isPixel(details.url, pageUrlOf(details))) return false;
  let result = {};
  engine.onBeforeRequest(details, (r) => { result = r; });
  if (!result.cancel && !result.redirectURL) return false;
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

module.exports = { init, attach, onBeforeRequest, activeFor, isPixel, siteAllowed, hostOf, stats, update, load, PRELOAD };
