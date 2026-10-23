'use strict';
// تحميل الفيديوهات والصوت (يوتيوب، تيك توك، انستجرام، فيس بوك، وآلاف المواقع) عبر yt-dlp و ffmpeg
const { app, session } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';

// الأدوات المرفقة مع البرنامج
function vendorDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'vendor');
  return path.join(__dirname, '..', 'vendor', IS_WIN ? 'win' : process.platform);
}
const toolsDir = () => path.join(app.getPath('userData'), 'tools');

// نسخة yt-dlp في مجلد المستخدم حتى نقدر نحدّثها (المواقع بتتغير باستمرار)
function ytdlpPath() {
  const local = path.join(toolsDir(), 'yt-dlp' + EXE);
  if (fs.existsSync(local)) return local;
  const bundled = path.join(vendorDir(), 'yt-dlp' + EXE);
  if (fs.existsSync(bundled)) {
    fs.mkdirSync(toolsDir(), { recursive: true });
    fs.copyFileSync(bundled, local);
    if (!IS_WIN) fs.chmodSync(local, 0o755);
    return local;
  }
  return 'yt-dlp'; // من النظام
}
function ffmpegDir() {
  const d = vendorDir();
  return fs.existsSync(path.join(d, 'ffmpeg' + EXE)) ? d : null; // null = من النظام
}

function run(args, { onLine, timeout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ytdlpPath(), args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = '', err = '', buf = '';
    const timer = timeout ? setTimeout(() => { p.kill(); reject(new Error('انتهت المهلة')); }, timeout) : null;
    p.stdout.on('data', (d) => {
      const s = d.toString('utf8'); out += s;
      if (onLine) { buf += s; const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(onLine); }
    });
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (buf && onLine) onLine(buf);
      if (code === 0) resolve(out);
      else reject(new Error(cleanError(err) || `خطأ ${code}`));
    });
    run.last = p;
  });
}
function cleanError(err) {
  const lines = err.split(/\r?\n/).filter(l => /ERROR/.test(l));
  return (lines.pop() || err.trim().split(/\r?\n/).pop() || '').replace(/^ERROR:\s*/, '').slice(0, 300);
}

// كوكيز حساب التبويب علشان الفيديوهات اللي محتاجة تسجيل دخول (فيس بوك، انستجرام)
async function writeCookies(partition) {
  if (!partition) return null;
  const cookies = await session.fromPartition(partition).cookies.get({});
  if (!cookies.length) return null;
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) {
    const domain = c.domain || '';
    const sub = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const exp = c.expirationDate ? Math.floor(c.expirationDate) : 0;
    lines.push([c.httpOnly ? '#HttpOnly_' + domain : domain, sub, c.path || '/', c.secure ? 'TRUE' : 'FALSE', exp, c.name, c.value].join('\t'));
  }
  fs.mkdirSync(toolsDir(), { recursive: true });
  const file = path.join(toolsDir(), `cookies-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  return file;
}
const rm = (f) => { if (f) fs.rm(f, { force: true }, () => {}); };

// يوتيوب محتاج محرك جافاسكربت (Deno) علشان يفك حماية الفيديو، من غيره بيطلع «The page needs to be reloaded»
function denoPath() {
  const d = path.join(vendorDir(), 'deno' + EXE);
  return fs.existsSync(d) ? d : null;
}
const isYouTube = (u) => /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(u);
// أخطاء معناها إن الفيديو محتاج تسجيل دخول
const NEEDS_LOGIN = /sign in|log ?in|login|age|private|members|confirm you|not a bot|cookies|authenticat|rate.?limit|unavailable|registered users/i;

function baseArgs(userAgent, cookieFile, referer) {
  const a = ['--no-playlist', '--no-warnings', '--no-check-certificates', '--encoding', 'utf-8'];
  // روابط الفيديو اللي اتلقطت من صفحة: سيرفرات كتير بترفض من غير الصفحة اللي جاي منها
  if (referer) {
    a.push('--referer', referer);
    try { a.push('--add-headers', 'Origin:' + new URL(referer).origin); } catch { /* ignore */ }
    // التوكن اللي في رابط m3u8 الرئيسي لازم يتبعت مع باقي الملفات
    a.push('--extractor-args', 'generic:fragment_query;variant_query');
  }
  const deno = denoPath();
  if (deno) a.push('--js-runtimes', 'deno:' + deno);
  if (userAgent) a.push('--user-agent', userAgent);
  if (cookieFile) a.push('--cookies', cookieFile);
  const ff = ffmpegDir();
  if (ff) a.push('--ffmpeg-location', ff);
  return a;
}

// قراءة الفيديو والجودات المتاحة
async function probe(url, opts) {
  // يوتيوب: من غير كوكيز الأول (الكوكيز بتعمل مشاكل مع يوتيوب)، وباقي المواقع بكوكيز حسابك الأول
  const first = !isYouTube(url);
  try {
    return await probeOnce(url, opts, first);
  } catch (e) {
    if (!first && !NEEDS_LOGIN.test(e.message)) throw e;
    return await probeOnce(url, opts, !first);
  }
}
async function probeOnce(url, { partition, userAgent, referer }, useCookies) {
  const cookieFile = useCookies ? await writeCookies(partition) : null;
  try {
    const out = await run([...baseArgs(userAgent, cookieFile, referer), '-J', url], { timeout: 120000 });
    const info = JSON.parse(out);
    const formats = info.formats || [info];
    const audioSize = Math.max(0, ...formats.filter(f => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
      .map(f => f.filesize || f.filesize_approx || 0));
    const byHeight = new Map();
    for (const f of formats) {
      if (!f.height || f.vcodec === 'none') continue;
      if (/watermark/i.test(f.format_note || '')) continue;
      const size = (f.filesize || f.filesize_approx || 0) + (f.acodec === 'none' ? audioSize : 0);
      const cur = byHeight.get(f.height);
      if (!cur || size > cur.size || (f.fps || 0) > cur.fps) byHeight.set(f.height, { height: f.height, fps: f.fps || 0, size });
    }
    const qualities = [...byHeight.values()].sort((a, b) => b.height - a.height);
    const hasAudio = formats.some(f => f.acodec && f.acodec !== 'none') || formats.some(f => !f.acodec);
    return {
      title: info.title || info.id || 'video', thumbnail: info.thumbnail || '', duration: info.duration || 0,
      site: info.extractor_key || '', uploader: info.uploader || '', webpage: info.webpage_url || url,
      qualities, hasAudio, audioSize, useCookies
    };
  } finally { rm(cookieFile); }
}

// التحميل: choice = { kind: 'video', height } أو { kind: 'mp3' }
const jobs = new Map();
async function download(id, url, choice, { partition, userAgent, dir, useCookies, referer, fileTitle, onProgress, onDone }) {
  if (useCookies === undefined) useCookies = !isYouTube(url);
  const cookieFile = useCookies ? await writeCookies(partition) : null;
  // ملف m3u8/mp4 مباشر اسمه بيبقى «index» أو «master»، فبنسميه باسم الصفحة
  const name = String(fileTitle || '').replace(/[\\/:*?"<>|%\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const title = name || '%(title).120B';
  const tpl = choice.kind === 'mp3' ? (name || '%(title).150B') + '.%(ext)s' : title + '%(height& - {}p|)s.%(ext)s';
  const args = [...baseArgs(userAgent, cookieFile, referer), '-P', dir, '-o', tpl, '--force-overwrites',
    '--newline', '--progress', '--no-simulate', '--no-mtime',
    '--progress-template', 'download:ALALAMY_PROG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print', 'after_move:ALALAMY_FILE %(filepath)s'];
  if (choice.kind === 'mp3') {
    args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-metadata');
  } else {
    const h = Number(choice.height) || 0;
    // بدون علامة مائية (تيك توك) + أعلى جودة لحد الجودة المختارة + صيغة MP4 تشتغل على أي جهاز
    args.push('-f', 'bv*[format_note!*=atermark]+ba/b[format_note!*=atermark]/bv*+ba/b',
      '-S', (h ? `res:${h},` : '') + 'vcodec:h264,acodec:aac', '--merge-output-format', 'mp4');
  }
  args.push(url);
  let file = null, phase = 'download', parts = 0, lastPct = 0;
  const p = run(args, {
    onLine: (line) => {
      if (line.startsWith('ALALAMY_FILE ')) { file = line.slice(13).trim(); return; }
      const m = line.match(/ALALAMY_PROG\s*([\d.]+)%\|([^|]*)\|(.*)/);
      if (m) {
        const pct = parseFloat(m[1]);
        if (pct < lastPct - 50) parts++; // بدأ ملف الصوت بعد الفيديو
        lastPct = pct;
        onProgress({ pct, speed: m[2].trim(), eta: m[3].trim(), part: parts });
      } else if (/\[(Merger|ExtractAudio|FixupM3u8|VideoConvertor|Metadata)\]/.test(line) && phase !== 'post') {
        phase = 'post'; onProgress({ post: true });
      }
    }
  });
  const proc = run.last;
  jobs.set(id, proc);
  try {
    await p;
    onDone({ ok: true, file });
  } catch (e) {
    onDone({ ok: false, error: e.message, cancelled: !!proc.killed });
  } finally {
    jobs.delete(id); rm(cookieFile);
  }
}
function cancel(id) { const p = jobs.get(id); if (p) { p.killed = true; p.kill(); return true; } return false; }

// تحديث yt-dlp مرة في اليوم في الخلفية
let lastUpdate = 0;
function autoUpdate() {
  if (Date.now() - lastUpdate < 24 * 3600 * 1000) return;
  lastUpdate = Date.now();
  if (!fs.existsSync(path.join(toolsDir(), 'yt-dlp' + EXE)) && ytdlpPath() === 'yt-dlp') return;
  run(['-U'], { timeout: 120000 }).catch(() => {});
}
async function version() {
  try { return (await run(['--version'], { timeout: 20000 })).trim(); } catch { return null; }
}
async function update() {
  const out = await run(['-U'], { timeout: 180000 });
  lastUpdate = Date.now();
  return { output: out.trim().split(/\r?\n/).pop(), version: await version() };
}

function ffmpegPath() { const d = ffmpegDir(); return d ? path.join(d, 'ffmpeg' + EXE) : 'ffmpeg'; }
module.exports = { probe, download, cancel, autoUpdate, version, update, ffmpegPath };
