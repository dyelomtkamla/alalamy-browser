'use strict';
// تحديثات تلقائية لنسخة ويندوز: يسأل موقع المتصفح عن آخر إصدار، ينزّل برنامج التثبيت ويشغّله
const { app, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const SERVER = process.env.ALALAMY_SERVER || 'https://alalamy-browser.a7medxml.workers.dev';
const versionCode = (v) => { const [a = 0, b = 0, c = 0] = String(v).split('.').map(Number); return a * 10000 + b * 100 + c; };

let getWindow = () => null;
let busy = false;

async function latest() {
  const res = await net.fetch(`${SERVER}/api/app?platform=windows&v=${encodeURIComponent(app.getVersion())}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function download(url, file, onProgress) {
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => { got += chunk.length; if (total) onProgress(got / total); });
  await pipeline(body, fs.createWriteStream(file));
}

function unzip(zip, dir) {
  return new Promise((resolve, reject) => execFile('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`
  ], { windowsHide: true }, (err) => err ? reject(err) : resolve()));
}

function findSetup(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { const f = findSetup(full); if (f) return f; }
    else if (/\.exe$/i.test(name)) return full;
  }
  return null;
}

// ينزّل برنامج التثبيت الجديد ويرجّع مساره (zip أو exe)
async function fetchSetup(info) {
  const win = getWindow();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alalamy-update-'));
  const file = path.join(dir, 'update.bin');
  // حماية: التحديث بيتنزل بس من صفحة إصدارات المتصفح على GitHub أو من سيرفر المتصفح، وبـ https
  if (!process.env.ALALAMY_SERVER && !/^https:\/\/(github\.com\/dyelomtkamla\/alalamy-browser\/releases\/|alalamy-browser\.a7medxml\.workers\.dev\/)/i.test(String(info.url || ''))) {
    throw new Error('رابط التحديث مش من مصدر موثوق');
  }
  await download(info.url, file, (p) => win && !win.isDestroyed() && win.setProgressBar(p));
  if (win && !win.isDestroyed()) win.setProgressBar(-1);
  const head = Buffer.alloc(2);
  const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
  let setup;
  // الموقع قد يحوّل لملف zip أو exe، فنحدد النوع من أول بايتين
  if (head.toString() === 'PK') {
    fs.renameSync(file, file + '.zip');
    await unzip(file + '.zip', path.join(dir, 'x'));
    setup = findSetup(path.join(dir, 'x'));
  } else {
    setup = path.join(dir, 'AlalamyBrowser-Setup.exe');
    fs.renameSync(file, setup);
  }
  if (!setup) throw new Error('لم يتم العثور على برنامج التثبيت داخل الملف');
  return setup;
}

// تثبيت في صمت (/S). /RELAUNCH = يفتح المتصفح تاني بعد التثبيت، والتبويبات بترجع لوحدها
function runSetup(setup, relaunch) {
  if (relaunch) { try { fs.writeFileSync(path.join(app.getPath('userData'), 'restore-once'), String(Date.now())); } catch { /* ignore */ } }
  spawn(setup, relaunch ? ['/S', '/RELAUNCH'] : ['/S'], { detached: true, stdio: 'ignore' }).unref();
}

let readySetup = null, readyCode = 0;
// اتنزل وهيتثبت لما المستخدم يقفل المتصفح
app.on('will-quit', () => { if (readySetup) { const s = readySetup; readySetup = null; try { runSetup(s, false); } catch { /* ignore */ } } });

async function offerInstall(info, code, setup) {
  readySetup = setup; readyCode = code;
  const { response } = await dialog.showMessageBox(getWindow(), {
    type: 'info',
    title: 'تحديث جاهز',
    message: `نزّلنا الإصدار الجديد ${info.version} من متصفح العالمي`,
    detail: (info.notes ? info.notes + '\n\n' : '') + 'التحديث بياخد ثواني والمتصفح بيفتح تاني بنفس التبويبات. حساباتك وبياناتك محفوظة.' +
      (info.mandatory ? '' : '\nلو اخترت «بعدين» هيتثبت لوحده أول ما تقفل المتصفح.'),
    buttons: info.mandatory ? ['تحديث دلوقتي'] : ['تحديث دلوقتي', 'بعدين (لما أقفل المتصفح)'],
    defaultId: 0,
    cancelId: info.mandatory ? 0 : 1
  });
  if (response !== 0) return { pending: true };
  readySetup = null;
  runSetup(setup, true);
  setTimeout(() => app.quit(), 500);
  return { installing: true };
}

async function check({ manual = false } = {}) {
  if (busy) return { busy: true };
  // التحديث التلقائي لويندوز بس، على ماك بننزّل النسخة الجديدة يدويًا
  if (process.platform !== 'win32') {
    if (manual) await dialog.showMessageBox(getWindow(), { type: 'info', title: 'التحديثات', message: `الإصدار الحالي ${app.getVersion()}.`, detail: 'التحديث التلقائي متاح على ويندوز بس. على الجهاز ده نزّل أحدث نسخة يدويًا.', buttons: ['حسنًا'] });
    return { upToDate: true, version: app.getVersion() };
  }
  busy = true;
  try {
    const info = await latest();
    const current = versionCode(app.getVersion());
    const code = Number(info.versionCode) || versionCode(info.version);
    if (!info.enabled || !info.url || code <= current) {
      if (manual) await dialog.showMessageBox(getWindow(), { type: 'info', title: 'التحديثات', message: `أنت تستخدم أحدث إصدار (${app.getVersion()}).`, buttons: ['حسنًا'] });
      return { upToDate: true, version: app.getVersion() };
    }
    // نزّلناه قبل كده ومستني يتقفل المتصفح
    if (readySetup && readyCode >= code && fs.existsSync(readySetup)) {
      if (!manual) return { pending: true };
      return await offerInstall(info, code, readySetup);
    }
    // تحديث تلقائي: بننزّل في الخلفية من غير ما نسأل، وبعدين بنقول إنه جاهز
    const setup = await fetchSetup(info);
    return await offerInstall(info, code, setup);
  } catch (err) {
    if (manual) dialog.showMessageBox(getWindow(), { type: 'error', title: 'التحديثات', message: 'تعذر التحقق من التحديثات أو تنزيلها.', detail: String(err.message || err), buttons: ['حسنًا'] });
    return { error: String(err.message || err) };
  } finally {
    busy = false;
  }
}

function init(opts) {
  getWindow = opts.getWindow;
  // التحديث التلقائي لنسخة ويندوز المثبّتة فقط
  if (process.platform !== 'win32' || !app.isPackaged) return;
  setTimeout(() => check(), 20 * 1000);
  setInterval(() => check(), 3 * 60 * 60 * 1000);
}

module.exports = { init, check, versionCode };
