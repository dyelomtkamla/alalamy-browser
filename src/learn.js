'use strict';
// اتعلم وانت بتتصفح: بيدوّر في يوتيوب على أحسن الفيديوهات لكل درس ويرتبها
const { net } = require('electron');

// ALALAMY_YT_SEARCH_URL للاختبار بس (سيرفر محلي بصفحة نتايج شبه يوتيوب)
const SEARCH_URL = process.env.ALALAMY_YT_SEARCH_URL || 'https://www.youtube.com/results';
const API_URL = process.env.ALALAMY_YT_API_URL || 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const cache = new Map();

const text = (t) => !t ? '' : t.simpleText || (Array.isArray(t.runs) ? t.runs.map(r => r.text).join('') : '');

// "1,234,567 views" أو "1.2M views" أو "No views"
function parseViews(s) {
  s = String(s || '').replace(/,/g, '');
  const m = s.match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult) || 0;
}
// "1:02:03" → ثواني
function parseDuration(s) {
  const p = String(s || '').trim().split(':').map(Number);
  if (!p.length || p.some(isNaN)) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
// "3 years ago" → عدد السنين التقريبي
function ageYears(s) {
  const m = String(s || '').match(/(\d+)\s*(second|minute|hour|day|week|month|year)/i);
  if (!m) return 0;
  const per = { second: 0, minute: 0, hour: 0, day: 1 / 365, week: 7 / 365, month: 1 / 12, year: 1 }[m[2].toLowerCase()];
  return Number(m[1]) * per;
}
function fmtDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
  if (h) return `${h} ساعة${m ? ` و${m} دقيقة` : ''}`;
  return `${m || 1} دقيقة`;
}
function fmtViews(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} مليون مشاهدة`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} ألف مشاهدة`;
  return `${n} مشاهدة`;
}

// بندوّر على كل videoRenderer في الرد مهما اتغير شكل الصفحة
function collect(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40) return;
  if (Array.isArray(node)) { for (const n of node) collect(n, out, depth + 1); return; }
  const v = node.videoRenderer;
  if (v && v.videoId) {
    const badges = JSON.stringify(v.badges || []) + JSON.stringify(v.thumbnailOverlays || []);
    out.push({
      id: v.videoId,
      title: text(v.title),
      channel: text(v.ownerText) || text(v.longBylineText),
      length: text(v.lengthText),
      seconds: parseDuration(text(v.lengthText)),
      views: parseViews(text(v.viewCountText)),
      age: ageYears(text(v.publishedTimeText)),
      live: /LIVE|BADGE_STYLE_TYPE_LIVE_NOW|UPCOMING/.test(badges) && !text(v.lengthText)
    });
  }
  for (const k in node) if (k !== 'videoRenderer') collect(node[k], out, depth + 1);
}
function initialData(html) {
  const i = html.search(/ytInitialData"?\]?\s*=\s*\{/);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  // نقفل القوس الصح من غير ما نتلخبط في النصوص اللي جواها أقواس
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, j + 1)); } catch { return null; }
    }
  }
  return null;
}

// الترتيب: المشاهدات + الطول المناسب للشرح + العربي + الحداثة + ترتيب يوتيوب نفسه
function score(v, idx, { arabic = true, fresh = false } = {}) {
  let s = Math.log10(v.views + 10) * 1.2;
  if (v.seconds < 120) s -= 6; // شورتس ومقاطع قصيرة مش شرح
  else if (v.seconds < 300) s -= 1;
  else if (v.seconds <= 5400) s += 1.5;
  else s += 0.6; // كورسات كاملة
  if (arabic && /[؀-ۿ]/.test(v.title)) s += 1.8;
  const old = fresh ? 1.5 : 4; // الإعلانات بتتغير بسرعة، البرمجة لأ
  if (v.age > old) s -= (v.age - old) * (fresh ? 0.7 : 0.25);
  s += Math.max(0, 20 - idx) * 0.08;
  return s;
}

async function fetchWithTimeout(url, opts, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await net.fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

async function fromPage(query, ua) {
  // hl=en علشان الأرقام والمدة تتقري صح، العناوين بتفضل بلغتها. sp = فيديوهات بس
  const url = `${SEARCH_URL}?search_query=${encodeURIComponent(query)}&hl=en&gl=EG&sp=EgIQAQ%253D%253D`;
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'ar,en;q=0.8', Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = initialData(await r.text());
  const out = [];
  collect(data, out);
  return out;
}
async function fromApi(query, ua) {
  const r = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'User-Agent': ua, 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20251015.01.00', hl: 'en', gl: 'EG' } }, query, params: 'EgIQAQ==' })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const out = [];
  collect(await r.json(), out);
  return out;
}

async function search(query, opts = {}, ua = '') {
  query = String(query || '').trim().slice(0, 200);
  if (!query) return { videos: [] };
  const key = query + '|' + !!opts.fresh + '|' + (opts.arabic !== false);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 6 * 3600e3) return { videos: hit.videos };
  let list = [];
  try { list = await fromPage(query, ua); } catch {}
  if (!list.length) { try { list = await fromApi(query, ua); } catch {} }
  if (!list.length) return { error: 'مش قادر أوصل ليوتيوب دلوقتي، اتأكد من الإنترنت وجرب تاني' };
  const seen = new Set();
  const videos = list
    .map((v, i) => ({ ...v, score: score(v, i, opts) }))
    .filter(v => !v.live && !seen.has(v.id) && seen.add(v.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(v => ({
      id: v.id, title: v.title, channel: v.channel, views: v.views,
      length: v.length, duration: fmtDuration(v.seconds), viewsText: v.views ? fmtViews(v.views) : '',
      thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`
    }));
  cache.set(key, { time: Date.now(), videos });
  return { videos };
}

module.exports = { search, _test: { parseViews, parseDuration, ageYears, initialData, collect, score } };
