'use strict';
/* بيانات أدوات صفحة التبويب الجديد: الطقس (Open-Meteo)، أسعار العملات (open.er-api.com)، والبحث عن مدينة.
   كلها مجانية ومن غير مفتاح. مواقيت الصلاة بتتحسب على الجهاز نفسه (src/ui/widgets.js) فمش محتاجة نت. */
const WEATHER = process.env.ALALAMY_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';
const GEO = process.env.ALALAMY_GEO_URL || 'https://geocoding-api.open-meteo.com/v1/search';
const RATES = process.env.ALALAMY_RATES_URL || 'https://open.er-api.com/v6/latest/USD';

function setup({ ipcMain, net, readJSON, writeJSON }) {
  const cache = Object.assign({ weather: {}, rates: null }, readJSON('widgets-cache.json', {}));
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
}

module.exports = { setup };
