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
const postponed = new Set();

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

async function install(info) {
  const win = getWindow();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alalamy-update-'));
  const file = path.join(dir, 'update.bin');
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
  // برنامج التثبيت يغلق المتصفح بنفسه ثم يثبّت الإصدار الجديد
  spawn(setup, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 800);
}

async function check({ manual = false } = {}) {
  if (busy) return { busy: true };
  busy = true;
  try {
    const info = await latest();
    const current = versionCode(app.getVersion());
    const code = Number(info.versionCode) || versionCode(info.version);
    if (!info.enabled || !info.url || code <= current) {
      if (manual) await dialog.showMessageBox(getWindow(), { type: 'info', title: 'التحديثات', message: `أنت تستخدم أحدث إصدار (${app.getVersion()}).`, buttons: ['حسنًا'] });
      return { upToDate: true, version: app.getVersion() };
    }
    if (!manual && postponed.has(code) && !info.mandatory) return { postponed: true };
    const { response } = await dialog.showMessageBox(getWindow(), {
      type: 'info',
      title: 'تحديث جديد',
      message: `إصدار جديد من متصفح العالمي متاح: ${info.version}`,
      detail: (info.notes ? info.notes + '\n\n' : '') + 'سيتم تنزيل التحديث وفتح برنامج التثبيت. حساباتك وبياناتك محفوظة.',
      buttons: ['تحديث الآن', 'لاحقًا'],
      defaultId: 0,
      cancelId: 1
    });
    if (response !== 0) { postponed.add(code); return { postponed: true }; }
    await install(info);
    return { installing: true };
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
  setInterval(() => check(), 6 * 60 * 60 * 1000);
}

module.exports = { init, check, versionCode };
