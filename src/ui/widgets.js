'use strict';
/* أدوات صفحة التبويب الجديد اللي بتملا الفراغ تحت عمود الأخبار والكورة:
   الساعة والتاريخ الهجري + مواقيت الصلاة (بتتحسب على الجهاز، طريقة الهيئة المصرية)، ملاحظات سريعة،
   الطقس (Open-Meteo) وأسعار العملات بالجنيه مع محوّل صغير. المدينة الافتراضية القاهرة وتتغير بضغطة. */

const WG_KEY = 'alalamy.widgets';
const wg = { city: { name: 'القاهرة', lat: 30.0444, lon: 31.2357, tz: 'Africa/Cairo' }, convAmt: 100, convCur: 'USD', notes: '', hidden: [] };
try { Object.assign(wg, JSON.parse(localStorage.getItem(WG_KEY) || '{}')); } catch { /* ignore */ }
const wgSave = () => { try { localStorage.setItem(WG_KEY, JSON.stringify(wg)); } catch { /* ignore */ } };

/* ---- مواقيت الصلاة (خوارزمية PrayTimes.org) ---- */
const dtr = (d) => d * Math.PI / 180, rtd = (r) => r * 180 / Math.PI;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(dtr(g)) + 0.020 * Math.sin(dtr(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = rtd(Math.atan2(Math.cos(dtr(e)) * Math.sin(dtr(L)), Math.cos(dtr(L)))) / 15;
  return { decl: rtd(Math.asin(Math.sin(dtr(e)) * Math.sin(dtr(L)))), eqt: q / 15 - fix(RA, 24) };
}
function tzOffsetHours(tz, date) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date).map(x => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.round((asUTC - date.getTime()) / 60000) / 60;
  } catch { return -date.getTimezoneOffset() / 60; }
}
function prayerTimes(date, lat, lon, tz) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const A = Math.floor((m <= 2 ? y - 1 : y) / 100), B = 2 - A + Math.floor(A / 4);
  const jd0 = Math.floor(365.25 * ((m <= 2 ? y - 1 : y) + 4716)) + Math.floor(30.6001 * ((m <= 2 ? m + 12 : m) + 1)) + d + B - 1524.5;
  const jDate = jd0 - lon / (15 * 24);
  const midDay = (t) => fix(12 - sunPos(jDate + t).eqt, 24);
  const angleTime = (angle, t, ccw) => {
    const decl = sunPos(jDate + t).decl, noon = midDay(t);
    const T = rtd(Math.acos((-Math.sin(dtr(angle)) - Math.sin(dtr(decl)) * Math.sin(dtr(lat))) / (Math.cos(dtr(decl)) * Math.cos(dtr(lat))))) / 15;
    return noon + (ccw ? -T : T);
  };
  const asr = (t) => { const decl = sunPos(jDate + t).decl; return angleTime(-rtd(Math.atan(1 / (1 + Math.tan(dtr(Math.abs(lat - decl)))))), t); };
  const tzo = tzOffsetHours(tz, date);
  const raw = {
    fajr: angleTime(19.5, 5 / 24, true), sunrise: angleTime(0.833, 6 / 24, true), dhuhr: midDay(12 / 24) + 1 / 60,
    asr: asr(13 / 24), maghrib: angleTime(0.833, 18 / 24), isha: angleTime(17.5, 18 / 24)
  };
  // الأوقات بتوقيت المدينة؛ بنحوّلها لوقت حقيقي (Date) علشان العد التنازلي
  const base = Date.UTC(y, m - 1, d) - tzo * 3600000;
  const out = {};
  for (const [k, h] of Object.entries(raw)) out[k] = new Date(base + Math.round(fix(h + tzo - lon / 15, 24) * 60) * 60000);
  return out;
}
const PRAYER_NAMES = [['fajr', 'الفجر'], ['sunrise', 'الشروق'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];
const fmtTime = (d, tz) => d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined });

function wgCard(id, title, emoji, ...body) {
  return el('div', { class: 'ntList wgCard', 'data-wg': id },
    el('div', { class: 'ntListHead' }, el('span', { class: 'em' }, emoji), el('span', { class: 'grow' }, title),
      el('button', { class: 'wgX', title: 'إخفاء', onclick: () => { wg.hidden = [...new Set([...(wg.hidden || []), id])]; wgSave(); renderWidgets(); toast('اتخفت. ترجّعها من الإعدادات ← المظهر'); } }, '✕')),
    ...body);
}
async function chooseCity() {
  const q = await askText('اكتب اسم مدينتك (عربي أو إنجليزي)', '', { placeholder: 'مثلاً: الإسكندرية، الرياض، دبي' });
  if (!q) return;
  const res = await api.geocode(q);
  if (!res.length) return toast('مالقيناش المدينة دي، جرّب اسم تاني');
  let pick = res[0];
  if (res.length > 1) {
    const id = await api.uiMenu(res.map((r, i) => ({ id: String(i), label: [r.name, r.admin, r.country].filter(Boolean).join('، ') })));
    if (id == null) return;
    pick = res[Number(id)];
  }
  wg.city = { name: pick.name, lat: pick.lat, lon: pick.lon, tz: pick.tz || Intl.DateTimeFormat().resolvedOptions().timeZone };
  wgSave(); renderWidgets(); toast('المدينة: ' + pick.name);
}
const cityBtn = () => el('button', { class: 'wgCity', title: 'تغيير المدينة', onclick: chooseCity }, '📍 ' + wg.city.name);

/* ---- الساعة + التاريخ + الصلاة ---- */
function prayerWidget() {
  const clock = el('div', { class: 'wgClock' });
  const dates = el('div', { class: 'wgDates' });
  const next = el('div', { class: 'wgNext' });
  const rows = el('div', { class: 'wgPrayers' });
  const tz = wg.city.tz;
  const draw = () => {
    if (!clock.isConnected && clock._started) return clearInterval(clock._t);
    clock._started = true;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    let hijri = '';
    try { hijri = new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(now); } catch { /* ignore */ }
    dates.textContent = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }) + (hijri ? ' · ' + hijri : '');
    const today = prayerTimes(now, wg.city.lat, wg.city.lon, tz);
    let nx = PRAYER_NAMES.find(([k]) => k !== 'sunrise' && today[k] > now);
    let nxTime = nx && today[nx[0]];
    if (!nx) { nx = PRAYER_NAMES[0]; nxTime = prayerTimes(new Date(now.getTime() + 86400000), wg.city.lat, wg.city.lon, tz).fajr; }
    const mins = Math.max(0, Math.round((nxTime - now) / 60000));
    next.textContent = `${nx[1]} بعد ${mins >= 60 ? Math.floor(mins / 60) + ' س ' : ''}${mins % 60} د`;
    rows.innerHTML = '';
    for (const [k, n] of PRAYER_NAMES) {
      rows.append(el('div', { class: 'wgPr' + (k === nx[0] ? ' on' : '') }, el('span', {}, n), el('b', {}, fmtTime(today[k], tz))));
    }
  };
  draw();
  clock._t = setInterval(draw, 30000);
  return wgCard('prayer', 'مواقيت الصلاة', '🕌', clock, dates, next, rows, el('div', { class: 'wgFoot' }, cityBtn()));
}

/* ---- ملاحظات سريعة ---- */
function notesWidget() {
  const ta = el('textarea', { class: 'wgNotes', rows: 4, dir: 'auto', placeholder: 'اكتب ملاحظة سريعة... (بتتحفظ لوحدها)' });
  ta.value = wg.notes || '';
  ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(() => { wg.notes = ta.value.slice(0, 5000); wgSave(); for (const o of document.querySelectorAll('.wgNotes')) if (o !== ta) o.value = ta.value; }, 300); });
  return wgCard('notes', 'ملاحظات سريعة', '📝', ta);
}

/* ---- الطقس ---- */
const WMO = (c, day = true) => {
  if (c === 0) return [day ? '☀️' : '🌙', 'صافي'];
  if (c <= 2) return [day ? '⛅' : '☁️', 'غائم جزئياً'];
  if (c === 3) return ['☁️', 'غائم'];
  if (c === 45 || c === 48) return ['🌫️', 'ضباب'];
  if (c >= 51 && c <= 57) return ['🌦️', 'رذاذ'];
  if (c >= 61 && c <= 67) return ['🌧️', 'مطر'];
  if (c >= 71 && c <= 77) return ['❄️', 'ثلج'];
  if (c >= 80 && c <= 82) return ['🌦️', 'زخات مطر'];
  if (c >= 95) return ['⛈️', 'عاصفة رعدية'];
  return ['🌡️', ''];
};
function weatherWidget() {
  const body = el('div', { class: 'wgWeather' }, el('div', { class: 'wgLoad' }, 'بنجيب الطقس...'));
  api.weather(wg.city.lat, wg.city.lon).then((w) => {
    body.innerHTML = '';
    if (!w || w.temp == null) { body.append(el('div', { class: 'wgLoad' }, 'مفيش اتصال بالنت دلوقتي')); return; }
    const [ic, label] = WMO(w.code, w.day);
    body.append(
      el('div', { class: 'wgNow' }, el('span', { class: 'wgIc' }, ic), el('b', {}, Math.round(w.temp) + '°'),
        el('div', {}, el('div', {}, label), el('small', {}, `محسوسة ${Math.round(w.feels)}° · رطوبة ${w.humidity}% · رياح ${Math.round(w.wind)} كم/س`))),
      el('div', { class: 'wgDays' }, ...w.daily.slice(1, 4).map(d => {
        const [di] = WMO(d.code);
        return el('div', {}, el('small', {}, new Date(d.date + 'T12:00').toLocaleDateString('ar-EG', { weekday: 'short' })), el('span', {}, di), el('b', {}, `${Math.round(d.max)}°`), el('small', {}, `${Math.round(d.min)}°`));
      })));
  });
  return wgCard('weather', 'الطقس', '🌤', body, el('div', { class: 'wgFoot' }, cityBtn(),
    el('button', { class: 'wgCity', onclick: () => navigate('https://www.google.com/search?q=' + encodeURIComponent('الطقس ' + wg.city.name)) }, 'التفاصيل ↗')));
}

/* ---- أسعار العملات + محوّل ---- */
const CUR = { USD: ['دولار', '🇺🇸'], EUR: ['يورو', '🇪🇺'], SAR: ['ريال سعودي', '🇸🇦'], AED: ['درهم إماراتي', '🇦🇪'], KWD: ['دينار كويتي', '🇰🇼'], GBP: ['جنيه إسترليني', '🇬🇧'], QAR: ['ريال قطري', '🇶🇦'] };
function ratesWidget() {
  const body = el('div', { class: 'wgRates' }, el('div', { class: 'wgLoad' }, 'بنجيب الأسعار...'));
  api.rates().then((r) => {
    body.innerHTML = '';
    if (!r || !r.rates || !r.rates.EGP) { body.append(el('div', { class: 'wgLoad' }, 'مفيش اتصال بالنت دلوقتي')); return; }
    const inEGP = (c) => c === 'USD' ? r.rates.EGP : r.rates.EGP / r.rates[c];
    for (const c of ['USD', 'EUR', 'SAR', 'AED', 'KWD']) {
      if (c !== 'USD' && !r.rates[c]) continue;
      body.append(el('div', { class: 'wgRate' }, el('span', {}, CUR[c][1] + ' ' + CUR[c][0]), el('b', {}, inEGP(c).toFixed(2) + ' ج.م')));
    }
    const amt = el('input', { type: 'number', min: 0, value: wg.convAmt, dir: 'ltr' });
    const cur = selectOf(Object.keys(CUR).filter(c => c === 'USD' || r.rates[c]).map(c => [c, CUR[c][0]]), wg.convCur, () => calc());
    const res = el('b', { class: 'wgConvRes' });
    const calc = () => {
      wg.convAmt = Number(amt.value) || 0; wg.convCur = cur.value; wgSave();
      res.textContent = '= ' + (wg.convAmt * inEGP(cur.value)).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' جنيه';
    };
    amt.addEventListener('input', calc);
    calc();
    body.append(el('div', { class: 'wgConv' }, amt, cur), res,
      el('small', { class: 'wgUpd' }, 'آخر تحديث: ' + new Date(r.updated).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) + (r.stale ? ' (من غير نت)' : '')));
  });
  return wgCard('rates', 'أسعار العملات بالجنيه', '💱', body);
}

function renderWidgets() {
  for (const sel of ['#ntNewsSide', '#ntSportsSide']) { const old = $(sel + ' .wgStack'); if (old) old.remove(); }
  const inline = $('#ntWidgetsInline'); if (inline) inline.innerHTML = '';
  if (state.settings.showWidgets === false) return;
  const hide = new Set(wg.hidden || []);
  const right = [['prayer', prayerWidget], ['notes', notesWidget]].filter(([k]) => !hide.has(k));
  const left = [['weather', weatherWidget], ['rates', ratesWidget]].filter(([k]) => !hide.has(k));
  $('#ntNewsSide').append(el('div', { class: 'wgStack' }, ...right.map(([, f]) => f())));
  $('#ntSportsSide').append(el('div', { class: 'wgStack' }, ...left.map(([, f]) => f())));
  if (inline) inline.append(...[...right, ...left].map(([, f]) => f()));
}

// بعد ما الأعمدة تترسم نحط الأدوات تحتها
(() => {
  const col = $('#ntSitesInline');
  if (col && !$('#ntWidgetsInline')) col.after(el('div', { id: 'ntWidgetsInline' }));
  const orig = renderSites;
  renderSites = function () { orig.apply(this, arguments); try { renderWidgets(); } catch (e) { console.error(e); } };
  try { if ($('#ntNewsSide').children.length) renderWidgets(); } catch { /* ignore */ }
})();

/* زرار في الإعدادات ← المظهر علشان تظهر/تخفي الأدوات */
const oldAppearance = settingsSections.appearance;
settingsSections.appearance = () => {
  const cards = oldAppearance();
  const hiddenNames = { prayer: 'مواقيت الصلاة', notes: 'الملاحظات', weather: 'الطقس', rates: 'أسعار العملات' };
  const back = el('div', { class: 'btnrow' });
  for (const k of wg.hidden || []) back.append(el('button', { onclick: () => { wg.hidden = wg.hidden.filter(x => x !== k); wgSave(); back.querySelector(`[data-k="${k}"]`)?.remove(); renderWidgets(); }, 'data-k': k }, 'إظهار ' + (hiddenNames[k] || k)));
  cards.push(card(settingRow('أدوات الصفحة الرئيسية', 'الطقس، مواقيت الصلاة والتاريخ الهجري، أسعار العملات ومحوّل، وملاحظات سريعة جنب الأخبار والكورة.', toggle('showWidgets', () => renderWidgets())),
    settingRow('المدينة', 'للطقس ومواقيت الصلاة', el('button', { onclick: chooseCity }, '📍 ' + wg.city.name)), back));
  return cards;
};
