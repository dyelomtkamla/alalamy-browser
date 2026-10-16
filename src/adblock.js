'use strict';
/*
 * مانع الإعلانات: نفس قوايم uBlock Origin و EasyList و EasyPrivacy و Liste AR (للمواقع العربية)
 * عن طريق محرك Ghostery. بيمنع الإعلانات في الشبكة، وبيخفي أماكنها في الصفحة، وبيشغّل
 * سكربتات uBlock الخاصة بيوتيوب. القوايم بتتحدث لوحدها كل 3 أيام.
 */
const fs = require('fs');
const path = require('path');
const { app, ipcMain, net } = require('electron');
const { ElectronBlocker, adsAndTrackingLists } = require('@ghostery/adblocker-electron');
const { parse: parseDomain } = require('tldts-experimental');

const PRELOAD = require.resolve('@ghostery/adblocker-electron-preload');
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
  const fetchImpl = (url) => net.fetch(url, { cache: 'no-store' });
  const fresh = await ElectronBlocker.fromLists(fetchImpl, LISTS,
    { enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true });
  const bin = fresh.serialize();
  fs.writeFileSync(cachePath() + '.tmp', bin);
  fs.renameSync(cachePath() + '.tmp', cachePath());
  engine = fresh;
  return true;
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
function activeFor(pageUrl) {
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
  total++;
  if (details.webContentsId) perTab.set(details.webContentsId, (perTab.get(details.webContentsId) || 0) + 1);
  // التحويل لـ data: بيفشل في كروميوم (ERR_UNSAFE_REDIRECT)، فنمنع الطلب على طول
  cb({ cancel: true });
  return true;
}

function attach(ses) {
  ses.setPreloads([...ses.getPreloads().filter(p => p !== PRELOAD), PRELOAD]);
  ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, cb) => {
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
