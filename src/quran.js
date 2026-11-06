'use strict';
/* مشغّل القرآن: قايمة كل القرّاء والمصاحف من mp3quran.net (API مجاني)، بتتحفظ أسبوع وبتشتغل من الكاش لو النت فاصل */
const fs = require('fs');
const path = require('path');
const { app, net } = require('electron');

const API = process.env.ALALAMY_QURAN_API || 'https://mp3quran.net/api/v3/reciters?language=ar';
const WEEK = 7 * 24 * 3600 * 1000;
// لو أول مرة ومفيش نت: شوية قرّاء معروفين (السيرفرات دي ثابتة على mp3quran من سنين)
const FALLBACK = [
  ['مشاري العفاسي', 'https://server8.mp3quran.net/afs/'],
  ['عبدالباسط عبدالصمد', 'https://server7.mp3quran.net/basit/'],
  ['محمد صديق المنشاوي', 'https://server10.mp3quran.net/minsh/'],
  ['محمود خليل الحصري', 'https://server13.mp3quran.net/husr/'],
  ['عبدالرحمن السديس', 'https://server11.mp3quran.net/sds/'],
  ['سعد الغامدي', 'https://server7.mp3quran.net/s_gmd/'],
  ['ماهر المعيقلي', 'https://server12.mp3quran.net/maher/'],
  ['ياسر الدوسري', 'https://server11.mp3quran.net/yasser/'],
  ['ناصر القطامي', 'https://server6.mp3quran.net/qtm/']
].map(([name, server], i) => ({ id: -(i + 1), name, moshaf: [{ name: 'حفص عن عاصم - مرتل', server, list: [] }] }));

function cacheFile() { return path.join(app.getPath('userData'), 'quran-reciters.json'); }
function readCache() {
  try { const d = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); if (Array.isArray(d.list) && d.list.length) return d; } catch { /* ignore */ }
  return null;
}
function clean(json) {
  const out = [];
  for (const r of (json && json.reciters) || []) {
    const moshaf = [];
    for (const m of r.moshaf || []) {
      const server = String(m.server || '');
      if (!/^https:\/\/[a-z0-9.-]+\.mp3quran\.net\/[\w\-./]*\/$/i.test(server)) continue;
      const list = String(m.surah_list || '').split(',').map(Number).filter(n => n >= 1 && n <= 114);
      moshaf.push({ name: String(m.name || '').slice(0, 120), server, list });
    }
    if (moshaf.length) out.push({ id: Number(r.id) || 0, name: String(r.name || '').trim().slice(0, 120), moshaf });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

let pending = null;
async function reciters(force = false) {
  const c = readCache();
  if (c && !force && Date.now() - c.time < WEEK) return { list: c.list, cached: true };
  if (!pending) {
    pending = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await net.fetch(API, { signal: ctrl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const list = clean(await r.json());
        if (!list.length) throw new Error('empty');
        try { fs.writeFileSync(cacheFile(), JSON.stringify({ time: Date.now(), list })); } catch { /* ignore */ }
        return { list };
      } finally { clearTimeout(t); pending = null; }
    })();
  }
  try { return await pending; } catch (e) {
    if (c) return { list: c.list, cached: true, offline: true };
    return { list: FALLBACK, fallback: true, error: String(e.message || e) };
  }
}

module.exports = { reciters, clean };
