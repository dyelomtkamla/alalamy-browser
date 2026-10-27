'use strict';
/* بيانات أدوات صفحة التبويب الجديد: الطقس (Open-Meteo)، أسعار العملات (open.er-api.com)، والبحث عن مدينة.
   كلها مجانية ومن غير مفتاح. مواقيت الصلاة بتتحسب على الجهاز نفسه (src/ui/widgets.js) فمش محتاجة نت. */
const WEATHER = process.env.ALALAMY_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';
const GEO = process.env.ALALAMY_GEO_URL || 'https://geocoding-api.open-meteo.com/v1/search';
const RATES = process.env.ALALAMY_RATES_URL || 'https://open.er-api.com/v6/latest/USD';
const GOLD = (process.env.ALALAMY_GOLD_URL || 'https://xaus.com/api/v1/spot?compact=1,https://api.gold-api.com/price/XAU').split(',');
const ESPN = process.env.ALALAMY_ESPN_URL || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const QURAN = process.env.ALALAMY_QURAN_URL || 'https://api.alquran.cloud/v1/ayah';
// الدوريات اللي بتظهر في «ماتشات النهارده»
const LEAGUES = [['egy.1', 'الدوري المصري'], ['uefa.champions', 'دوري الأبطال'], ['ksa.1', 'الدوري السعودي'], ['eng.1', 'الدوري الإنجليزي'],
  ['esp.1', 'الدوري الإسباني'], ['ita.1', 'الدوري الإيطالي'], ['ger.1', 'الدوري الألماني'], ['fra.1', 'الدوري الفرنسي'],
  ['uefa.europa', 'الدوري الأوروبي'], ['caf.champions', 'أبطال أفريقيا'], ['fifa.world', 'كأس العالم'], ['fifa.worldq.caf', 'تصفيات أفريقيا']];

function setup({ ipcMain, net, readJSON, writeJSON, app, path, fs, downloader }) {
  const cache = Object.assign({ weather: {}, rates: null, gold: null, goldDays: {}, ayat: {} }, readJSON('widgets-cache.json', {}));
  const persist = () => writeJSON('widgets-cache.json', cache);
  async function getJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await net.fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

  ipcMain.handle('widgets:weather', async (_e, lat, lon) => {
    lat = num(lat, -90, 90); lon = num(lon, -180, 180);
    if (lat == null || lon == null) return null;
    const key = lat.toFixed(2) + ',' + lon.toFixed(2);
    const c = cache.weather[key];
    if (c && Date.now() - c.time < 30 * 60000) return c.data;
    try {
      const u = `${WEATHER}?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4';
      const j = await getJSON(u);
      const data = {
        temp: j.current && j.current.temperature_2m, feels: j.current && j.current.apparent_temperature,
        humidity: j.current && j.current.relative_humidity_2m, wind: j.current && j.current.wind_speed_10m,
        code: j.current && j.current.weather_code, day: j.current ? j.current.is_day !== 0 : true,
        daily: ((j.daily && j.daily.time) || []).map((d, i) => ({ date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i] }))
      };
      cache.weather = { [key]: { time: Date.now(), data } };
      persist();
      return data;
    } catch {
      return c ? Object.assign({ stale: true }, c.data) : null;
    }
  });

  ipcMain.handle('widgets:rates', async () => {
    if (cache.rates && Date.now() - cache.rates.time < 3 * 3600000) return cache.rates.data;
    try {
      const j = await getJSON(RATES);
      if (!j || !j.rates) throw new Error('bad');
      const pick = ['EGP', 'SAR', 'AED', 'KWD', 'EUR', 'GBP', 'QAR', 'JOD', 'TRY'];
      const data = { base: 'USD', updated: j.time_last_update_unix ? j.time_last_update_unix * 1000 : Date.now(), rates: {} };
      for (const k of pick) if (typeof j.rates[k] === 'number') data.rates[k] = j.rates[k];
      cache.rates = { time: Date.now(), data };
      persist();
      return data;
    } catch {
      return cache.rates ? Object.assign({ stale: true }, cache.rates.data) : null;
    }
  });

  ipcMain.handle('widgets:geocode', async (_e, q) => {
    q = String(q || '').trim().slice(0, 80);
    if (q.length < 2) return [];
    try {
      const j = await getJSON(`${GEO}?name=${encodeURIComponent(q)}&count=6&language=ar&format=json`);
      return ((j && j.results) || []).map(r => ({ name: r.name, country: r.country || '', admin: r.admin1 || '', lat: r.latitude, lon: r.longitude, tz: r.timezone || '' }));
    } catch { return []; }
  });

  /* ---- سعر الدهب العالمي بالدولار للجرام (الواجهة بتحوله للجنيه بسعر الدولار) ---- */
  ipcMain.handle('widgets:gold', async () => {
    if (cache.gold && Date.now() - cache.gold.time < 20 * 60000) return cache.gold.data;
    for (const u of GOLD) {
      try {
        const j = await getJSON(u.trim());
        const oz = num(j && (j.spot_usd_oz || (j.xau && j.xau.price) || j.price), 100, 100000);
        if (oz == null) continue;
        const day = new Date().toISOString().slice(0, 10);
        // سعر أول قراية في اليوم علشان نعرض الفرق (طالع ولا نازل)
        if (!cache.goldDays[day]) cache.goldDays = { ...Object.fromEntries(Object.entries(cache.goldDays).slice(-6)), [day]: oz };
        const prevDay = Object.keys(cache.goldDays).filter(d => d < day).sort().pop();
        const data = { usdGram: oz / 31.1034768, prevUsdGram: prevDay ? cache.goldDays[prevDay] / 31.1034768 : null, updated: Date.now() };
        cache.gold = { time: Date.now(), data };
        persist();
        return data;
      } catch { /* جرّب المصدر اللي بعده */ }
    }
    return cache.gold ? Object.assign({ stale: true }, cache.gold.data) : null;
  });

  /* ---- ماتشات النهارده (ESPN) ---- */
  let matchCache = null;
  ipcMain.handle('widgets:matches', async (_e, ymd) => {
    ymd = /^\d{8}$/.test(String(ymd)) ? String(ymd) : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (matchCache && matchCache.ymd === ymd && Date.now() - matchCache.time < 2 * 60000) return matchCache.data;
    const lists = await Promise.all(LEAGUES.map(async ([id, name]) => {
      try {
        const j = await getJSON(`${ESPN}/${id}/scoreboard?dates=${ymd}`);
        return ((j && j.events) || []).map((ev) => {
          const c = (ev.competitions || [])[0] || {};
          const side = (k) => (c.competitors || []).find(x => x.homeAway === k) || {};
          const h = side('home'), a = side('away'), st = (ev.status || c.status || {});
          const team = (x) => ({ name: (x.team && (x.team.shortDisplayName || x.team.displayName)) || '', logo: (x.team && x.team.logo) || '', score: x.score != null ? String(x.score) : '' });
          return { id: String(ev.id || ''), league: name, date: ev.date, state: (st.type && st.type.state) || 'pre', clock: st.displayClock || '', detail: (st.type && st.type.shortDetail) || '', home: team(h), away: team(a) };
        });
      } catch { return null; }
    }));
    if (lists.every(l => l === null)) return matchCache && matchCache.ymd === ymd ? Object.assign([], matchCache.data, { stale: true }) : null;
    const order = { in: 0, pre: 1, post: 2 };
    const data = lists.flat().filter(Boolean).sort((x, y) => (order[x.state] - order[y.state]) || (new Date(x.date) - new Date(y.date)));
    matchCache = { ymd, time: Date.now(), data };
    return data;
  });

  /* ---- آية اليوم: النص الصحيح والصوت من alquran.cloud (بتتحفظ بعد أول مرة) ---- */
  ipcMain.handle('widgets:ayah', async (_e, s, a) => {
    s = num(s, 1, 114); a = num(a, 1, 286);
    if (s == null || a == null) return null;
    const key = s + ':' + a;
    if (cache.ayat[key]) return cache.ayat[key];
    try {
      const j = await getJSON(`${QURAN}/${key}/quran-uthmani`);
      const d = j && j.data;
      if (!d || !d.text) return null;
      const out = { text: d.text, surah: (d.surah && d.surah.name) || '', number: d.number, audio: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${d.number}.mp3` };
      cache.ayat[key] = out;
      persist();
      return out;
    } catch { return null; }
  });

  /* ---- علم الدول للمواقع: الخط بيتبعت للصفحة لما يكون فيها أعلام (ويندوز مافيهوش أعلام إيموجي) ---- */
  let flagsFont = null;
  ipcMain.handle('flags:font', () => {
    if (!flagsFont) try { flagsFont = fs.readFileSync(path.join(__dirname, 'ui', 'flags.woff2')); } catch { return null; }
    return flagsFont;
  });

  /* ---- حاجة تحصل مرة واحدة بس حتى لو فيه كذا نافذة مفتوحة (الأذان، جرس مؤقت التركيز) ---- */
  const claimed = new Map();
  ipcMain.handle('ui:claim', (_e, key) => {
    key = String(key || '').slice(0, 100);
    const now = Date.now();
    for (const [k, t] of claimed) if (now - t > 6 * 3600000) claimed.delete(k);
    if (!key || claimed.has(key)) return false;
    claimed.set(key, now);
    return true;
  });

  /* ---- الأذان: إسلام صبحي، عبد الرحمن مسعود، مشاري العفاسي (بيتنزل من يوتيوب مرة واحدة) أو ملف من الجهاز ---- */
  const ADHAN = { sobhy: 'أذان بصوت القارئ إسلام صبحي', mosaad: 'أذان بصوت القارئ عبد الرحمن مسعود', afasy: 'أذان مشاري راشد العفاسي' };
  const adhanDir = () => path.join(app.getPath('userData'), 'adhan');
  const adhanFile = (id) => path.join(adhanDir(), id + '.mp3');
  const fileUrl = (f) => require('url').pathToFileURL(f).href;
  const busy = new Map();
  function ensureAdhan(id) {
    if (fs.existsSync(adhanFile(id))) return Promise.resolve(adhanFile(id));
    if (!ADHAN[id]) return Promise.resolve(null);
    if (!busy.has(id)) {
      fs.mkdirSync(adhanDir(), { recursive: true });
      busy.set(id, downloader.fetchAudio(ADHAN[id], path.join(adhanDir(), id))
        .then((f) => (fs.existsSync(f) && fs.statSync(f).size > 20000 ? f : null), () => null)
        .finally(() => busy.delete(id)));
    }
    return busy.get(id);
  }
  ipcMain.handle('adhan:status', () => Object.fromEntries([...Object.keys(ADHAN), 'custom'].map(id => [id, fs.existsSync(adhanFile(id)) ? 'ready' : busy.has(id) ? 'loading' : 'missing'])));
  // بنجهز الأصوات الناقصة واحد ورا التاني في الخلفية
  ipcMain.handle('adhan:prepare', async () => {
    for (const id of Object.keys(ADHAN)) await ensureAdhan(id);
    return true;
  });
  ipcMain.handle('adhan:file', async (_e, id) => {
    id = String(id || '');
    if (id === 'custom') return fs.existsSync(adhanFile('custom')) ? fileUrl(adhanFile('custom')) : null;
    const f = await ensureAdhan(id);
    return f ? fileUrl(f) : null;
  });
  ipcMain.handle('adhan:pick', async (e) => {
    const { dialog, BrowserWindow } = require('electron');
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'اختار ملف صوت الأذان', properties: ['openFile'], filters: [{ name: 'صوت', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'aac'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    fs.mkdirSync(adhanDir(), { recursive: true });
    fs.copyFileSync(r.filePaths[0], adhanFile('custom'));
    return fileUrl(adhanFile('custom'));
  });
}

module.exports = { setup };
