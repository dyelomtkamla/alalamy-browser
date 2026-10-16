'use strict';
// الترجمة: نصوص وصفحات كاملة بين العربية والإنجليزية وكل اللغات (خدمة ترجمة جوجل المجانية)
const { net } = require('electron');

const ENDPOINT = process.env.ALALAMY_TRANSLATE_URL || 'https://translate.googleapis.com/translate_a/single';
const cache = new Map();
const MAX_CHUNK = 1800;

async function translateOne(text, target, source = 'auto') {
  const key = source + '|' + target + '|' + text;
  if (cache.has(key)) return cache.get(key);
  const url = `${ENDPOINT}?client=gtx&dt=t&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}`;
  const res = await net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'q=' + encodeURIComponent(text)
  });
  if (!res.ok) throw new Error('خدمة الترجمة غير متاحة (' + res.status + ')');
  const data = await res.json();
  const out = { text: (data[0] || []).map(s => s[0] || '').join(''), detected: data[2] || source };
  if (cache.size > 5000) cache.clear();
  cache.set(key, out);
  return out;
}

// ترجمة مجموعة نصوص (عُقد صفحة) بدمجها في دفعات لتقليل عدد الطلبات
async function translateMany(texts, target, source = 'auto') {
  const result = new Array(texts.length);
  const groups = [];
  let cur = [], len = 0;
  texts.forEach((t, i) => {
    const clean = String(t).replace(/\n+/g, ' ');
    if (len + clean.length > MAX_CHUNK && cur.length) { groups.push(cur); cur = []; len = 0; }
    cur.push({ i, t: clean }); len += clean.length + 1;
  });
  if (cur.length) groups.push(cur);

  let detected = source;
  const worker = async (group) => {
    try {
      const r = await translateOne(group.map(g => g.t).join('\n'), target, source);
      detected = r.detected || detected;
      const parts = r.text.split('\n');
      if (parts.length === group.length) { group.forEach((g, k) => { result[g.i] = parts[k]; }); return; }
    } catch (err) {
      if (group.length === 1) throw err;
    }
    // إذا لم تتطابق الأسطر نترجم كل نص على حدة
    for (const g of group) {
      try { result[g.i] = (await translateOne(g.t, target, source)).text; } catch { result[g.i] = null; }
    }
  };
  // 4 طلبات في نفس الوقت
  const queue = [...groups];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
  return { texts: result, detected };
}

module.exports = { translateOne, translateMany };
