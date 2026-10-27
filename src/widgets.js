'use strict';
/* بيانات أدوات صفحة التبويب الجديد: الطقس (Open-Meteo)، أسعار العملات (open.er-api.com)، والبحث عن مدينة.
   كلها مجانية ومن غير مفتاح. مواقيت الصلاة بتتحسب على الجهاز نفسه (src/ui/widgets.js) فمش محتاجة نت. */
const WEATHER = process.env.ALALAMY_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';
const GEO = process.env.ALALAMY_GEO_URL || 'https://geocoding-api.open-meteo.com/v1/search';
// أسعار لحظية: Coinbase (بتتحدث كل دقيقة) وبعدها ياهو فاينانس للجنيه، وopen.er-api (مرة في اليوم) آخر حل
const RATES = (process.env.ALALAMY_RATES_URL || 'https://api.coinbase.com/v2/exchange-rates?currency=USD,https://open.er-api.com/v6/latest/USD').split(',');
// سعر عملة البلد اللحظي من ياهو (EGP=X، SAR=X ...)
const LOCAL_LIVE = process.env.ALALAMY_EGP_URL || 'https://query1.finance.yahoo.com/v8/finance/chart/{CUR}=X?interval=1m&range=1d';
const LIVE_MS = 2 * 60000;
const GOLD = (process.env.ALALAMY_GOLD_URL || 'https://xaus.com/api/v1/spot?compact=1,https://api.gold-api.com/price/XAU').split(',');
const ESPN = process.env.ALALAMY_ESPN_URL || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
// لو ESPN مش بيفتح عند المستخدم (حصل في مصر): SofaScore وبعدين LiveScore
const SOFA = process.env.ALALAMY_SOFA_URL || 'https://api.sofascore.com/api/v1/sport/football/scheduled-events';
const LIVESCORE = process.env.ALALAMY_LIVESCORE_URL || 'https://prod-public-api.livescore.com/v1/api/app/date/soccer';
// نفس الدوريات بالاسم (بلد|بطولة) للمصادر التانية — الترتيب مهم (أبطال أفريقيا قبل دوري الأبطال)
const LEAGUE_RX = [[/^egypt\|premier league/i, 'الدوري المصري'], [/caf champions/i, 'أبطال أفريقيا'], [/world cup.*(caf|africa)|africa.*world cup/i, 'تصفيات أفريقيا'],
  [/^(world|international)\|(fifa )?world cup$/i, 'كأس العالم'], [/uefa champions league|^europe\|champions league|^champions league/i, 'دوري الأبطال'], [/europa league/i, 'الدوري الأوروبي'],
  [/^saudi|saudi pro|roshn/i, 'الدوري السعودي'], [/^england\|premier league$/i, 'الدوري الإنجليزي'], [/^spain\|(laliga|la liga|primera)/i, 'الدوري الإسباني'],
  [/^italy\|serie a/i, 'الدوري الإيطالي'], [/^germany\|bundesliga$/i, 'الدوري الألماني'], [/^france\|ligue 1/i, 'الدوري الفرنسي']];
const leagueOf = (country, name, local) => {
  const k = `${country || ''}|${name || ''}`;
  if (local && local.rx.test(k)) return local.name;
  const m = LEAGUE_RX.find(([rx]) => rx.test(k)); return m ? m[1] : null;
};
// دوري بلد المستخدم من بيانات البلاد (src/ui/countries.js)
let COUNTRY_DATA = null;
function localLeague(cc, fs, path) {
  try {
    if (!COUNTRY_DATA) COUNTRY_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui', 'countries.js'), 'utf8').match(/const COUNTRIES = (\{[\s\S]*\});/)[1]);
    const c = COUNTRY_DATA[cc];
    if (!c || !c.league) return null;
    return { name: c.league[0], rx: new RegExp(c.league[1], 'i'), espn: c.espn || null };
  } catch { return null; }
}
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

  // طلب واحد بس في نفس الوقت (كذا أداة بتطلب الأسعار مع بعض)
  let ratesBusy = null;
  const liveLocal = {}; // CUR -> { time, v, at }
  ipcMain.handle('widgets:rates', async (_e, cur) => {
    const base = await (ratesBusy || (ratesBusy = fetchRates().finally(() => { ratesBusy = null; })));
    cur = /^[A-Z]{3}$/.test(String(cur || '')) ? String(cur) : 'EGP';
    if (!base || cur === 'USD') return base;
    // عملة البلد بسعر السوق اللحظي من ياهو لو متاح
    let l = liveLocal[cur];
    if (!l || Date.now() - l.time > LIVE_MS) {
      try {
        const y = await getJSON(LOCAL_LIVE.replace('{CUR}', cur));
        const m = y && y.chart && y.chart.result && y.chart.result[0] && y.chart.result[0].meta;
        const v = num(m && m.regularMarketPrice, 0.0001, 10000000);
        l = liveLocal[cur] = { time: Date.now(), v, at: m && m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now() };
      } catch { l = liveLocal[cur] = { time: Date.now() - LIVE_MS + 30000, v: l && l.v, at: l && l.at }; }
    }
    // سعر ياهو لو بعيد جداً عن المصدر التاني يبقى غلط (عملة مش مدعومة مثلاً)
    const ref = base.rates && base.rates[cur];
    if (!l.v || (ref && Math.abs(l.v / ref - 1) > 0.25)) return base;
    return Object.assign({}, base, { live: true, updated: l.at, rates: Object.assign({}, base.rates, { [cur]: l.v }) });
  });
  async function fetchRates() {
    if (cache.rates && Date.now() - cache.rates.time < LIVE_MS) return cache.rates.data;
    const pick = ['EGP', 'SAR', 'AED', 'KWD', 'EUR', 'GBP', 'QAR', 'JOD', 'TRY', 'BHD', 'OMR', 'IQD', 'LBP', 'SYP', 'ILS', 'MAD', 'DZD', 'TND', 'LYD', 'SDG', 'YER', 'INR'];
    for (const u of RATES) {
      try {
        const j = await getJSON(u.trim());
        const src = (j && j.data && j.data.rates) || (j && j.rates);
        if (!src) continue;
        const live = !!(j.data && j.data.rates);
        const data = { base: 'USD', live, updated: live ? Date.now() : (j.time_last_update_unix ? j.time_last_update_unix * 1000 : Date.now()), rates: {} };
        for (const k of pick) { const v = Number(src[k]); if (Number.isFinite(v) && v > 0) data.rates[k] = v; }
        if (!data.rates.EGP) continue;
        cache.rates = { time: Date.now(), data };
        persist();
        return data;
      } catch { /* المصدر اللي بعده */ }
    }
    return cache.rates ? Object.assign({ stale: true }, cache.rates.data) : null;
  }

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
    if (cache.gold && Date.now() - cache.gold.time < LIVE_MS) return cache.gold.data;
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
  async function espnMatches(ymd, local) {
    const leagues = local && local.espn && !LEAGUES.some(([id]) => id === local.espn) ? [[local.espn, local.name], ...LEAGUES] : LEAGUES;
    const lists = await Promise.all(leagues.map(async ([id, name]) => {
      try {
        const j = await getJSON(`${ESPN}/${id}/scoreboard?dates=${ymd}`);
        return ((j && j.events) || []).map((ev) => {
          const c = (ev.competitions || [])[0] || {};
          const side = (k) => (c.competitors || []).find(x => x.homeAway === k) || {};
          const h = side('home'), a = side('away'), st = (ev.status || c.status || {});
          const team = (x) => ({ name: (x.team && (x.team.shortDisplayName || x.team.displayName)) || '', logo: (x.team && x.team.logo) || '', score: x.score != null ? String(x.score) : '' });
          return { id: String(ev.id || ''), league: local && local.espn === id ? local.name : name, date: ev.date, state: (st.type && st.type.state) || 'pre', clock: st.displayClock || '', detail: (st.type && st.type.shortDetail) || '', home: team(h), away: team(a) };
        });
      } catch { return null; }
    }));
    return lists.every(l => l === null) ? null : lists.flat().filter(Boolean);
  }
  async function sofaMatches(ymd, local) {
    const j = await getJSON(`${SOFA}/${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`);
    if (!j || !Array.isArray(j.events)) throw new Error('bad');
    const out = [];
    for (const ev of j.events) {
      const t = ev.tournament || {}, ut = t.uniqueTournament || {};
      const league = leagueOf(t.category && t.category.name, ut.name || t.name, local);
      if (!league) continue;
      const type = (ev.status && ev.status.type) || '';
      const state = type === 'inprogress' ? 'in' : (type === 'finished' || type === 'canceled' || type === 'postponed') ? (type === 'finished' ? 'post' : 'pre') : 'pre';
      const team = (x, sc) => ({ name: (x && ((x.fieldTranslations && x.fieldTranslations.nameTranslation && x.fieldTranslations.nameTranslation.ar) || x.shortName || x.name)) || '',
        logo: x && x.id ? `https://api.sofascore.app/api/v1/team/${x.id}/image` : '', score: sc && sc.current != null ? String(sc.current) : '' });
      const desc = (ev.status && ev.status.description) || '';
      const clock = { '1st half': 'الشوط الأول', '2nd half': 'الشوط التاني', Halftime: 'استراحة', 'Extra time': 'وقت إضافي', Penalties: 'ركلات ترجيح' }[desc] || 'مباشر';
      out.push({ id: 's' + ev.id, league, date: new Date((ev.startTimestamp || 0) * 1000).toISOString(), state, clock: state === 'in' ? clock : '',
        detail: (ev.status && ev.status.description) || '', home: team(ev.homeTeam, ev.homeScore), away: team(ev.awayTeam, ev.awayScore) });
    }
    return out;
  }
  async function livescoreMatches(ymd, local) {
    const j = await getJSON(`${LIVESCORE}/${ymd}/0?locale=en&MD=1`);
    if (!j || !Array.isArray(j.Stages)) throw new Error('bad');
    const out = [];
    for (const st of j.Stages) {
      const league = leagueOf(st.Cnm, st.CompN || st.Snm, local);
      if (!league) continue;
      for (const ev of st.Events || []) {
        const eps = String(ev.Eps || '');
        const state = eps === 'NS' || eps === 'Postp.' || eps === 'Canc.' ? 'pre' : (eps === 'FT' || eps === 'AET' || eps === 'AP') ? 'post' : 'in';
        const d = String(ev.Esd || '');
        const date = d.length >= 12 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:00Z` : new Date().toISOString();
        const team = (t, sc) => ({ name: (t && t[0] && t[0].Nm) || '', logo: t && t[0] && t[0].Img ? 'https://lsm-static-prod.livescore.com/medium/' + t[0].Img : '', score: sc != null ? String(sc) : '' });
        out.push({ id: 'l' + ev.Eid, league, date, state, clock: state === 'in' ? eps : '', detail: eps, home: team(ev.T1, ev.Tr1), away: team(ev.T2, ev.Tr2) });
      }
    }
    return out;
  }
  ipcMain.handle('widgets:matches', async (_e, ymd, cc) => {
    ymd = /^\d{8}$/.test(String(ymd)) ? String(ymd) : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    cc = /^[A-Z]{2}$/.test(String(cc || '')) ? String(cc) : 'EG';
    if (matchCache && matchCache.ymd === ymd && matchCache.cc === cc && Date.now() - matchCache.time < 2 * 60000) return matchCache.data;
    const local = localLeague(cc, fs, path);
    let list = await espnMatches(ymd, local);
    let alts = [sofaMatches, livescoreMatches];
    for (const alt of alts) {
      if (list && list.length) break;
      try { const l = await alt(ymd, local); if (l && (l.length || !list)) list = l; } catch { /* المصدر اللي بعده */ }
    }
    // دوري البلد مش في ESPN (الكويت، قطر...) أو مالوش ماتشات هناك: نكمّله من SofaScore/LiveScore
    if (list && local && !list.some(m => m.league === local.name)) {
      for (const alt of alts) {
        try { const l = await alt(ymd, local); if (l) { list = list.concat(l.filter(m => m.league === local.name)); break; } } catch { /* اللي بعده */ }
      }
    }
    if (!list) return matchCache && matchCache.ymd === ymd && matchCache.cc === cc ? Object.assign([], matchCache.data, { stale: true }) : null;
    const order = { in: 0, pre: 1, post: 2 };
    // ماتشات دوري البلد الأول
    const mine = (m) => (local && m.league === local.name ? 0 : 1);
    const data = list.sort((x, y) => (order[x.state] - order[y.state]) || (mine(x) - mine(y)) || (new Date(x.date) - new Date(y.date)));
    matchCache = { ymd, cc, time: Date.now(), data };
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
