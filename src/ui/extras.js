'use strict';
/* مميزات من فايرفوكس وأوبرا وكروم: وضع القراءة، الفيديو في نافذة صغيرة، لقطة الشاشة، الشريط الجانبي للمراسلة */

/* ---------------- وضع القراءة ---------------- */
const READER_SCRIPT = `(() => {
  let best = document.body, score = 0;
  for (const c of document.querySelectorAll('article, main, [role=main], div, section')) {
    let len = 0;
    for (const p of c.querySelectorAll(':scope > p, :scope > div > p, :scope > section > p')) len += p.innerText.length;
    if (len > score) { score = len; best = c; }
  }
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (out.length > 500) return;
      const t = c.tagName;
      if (/^(SCRIPT|STYLE|NAV|ASIDE|FOOTER|FORM|BUTTON|IFRAME|NOSCRIPT|SVG)$/.test(t)) continue;
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (t === 'P' || t === 'BLOCKQUOTE' || t === 'LI' || t === 'PRE') {
        const x = c.innerText.trim();
        if (x.length > 25 || (t === 'LI' && x)) out.push({ t: 'p', v: x });
      } else if (/^H[1-4]$/.test(t)) {
        const x = c.innerText.trim(); if (x) out.push({ t: 'h', v: x });
      } else if (t === 'IMG' || t === 'FIGURE' || t === 'PICTURE') {
        const im = t === 'IMG' ? c : c.querySelector('img');
        const src = im && (im.currentSrc || im.src);
        if (src && /^https?:/.test(src) && im.naturalWidth > 200) out.push({ t: 'img', v: src });
        const cap = t === 'FIGURE' && c.querySelector('figcaption');
        if (cap && cap.innerText.trim()) out.push({ t: 'cap', v: cap.innerText.trim() });
      } else walk(c);
    }
  };
  walk(best);
  const h1 = document.querySelector('h1');
  const title = ((h1 && h1.innerText) || document.title || '').trim();
  return JSON.stringify({ title, site: location.hostname, score, blocks: out.filter(b => !(b.t === 'h' && b.v === title)) });
})()`;

const readerPrefs = { size: 20, theme: '' };
try { Object.assign(readerPrefs, JSON.parse(localStorage.getItem('reader') || '{}')); } catch { /* ignore */ }

async function openReader() {
  const tab = state.active;
  if (!tab || !tab.webview || !tab.ready) return toast('افتح صفحة مقال الأول');
  if (!$('#reader').classList.contains('hidden')) return closeReader();
  let data;
  try { data = JSON.parse(await tab.webview.executeJavaScript(READER_SCRIPT)); } catch { data = null; }
  const text = data ? data.blocks.filter(b => b.t === 'p').reduce((n, b) => n + b.v.length, 0) : 0;
  if (!data || text < 300) return toast('الصفحة دي مفيهاش مقال يتقري');
  const r = $('#reader');
  r.innerHTML = '';
  const apply = () => {
    r.className = readerPrefs.theme;
    r.style.setProperty('--rd-size', readerPrefs.size + 'px');
    try { localStorage.setItem('reader', JSON.stringify(readerPrefs)); } catch { /* ignore */ }
  };
  const btn = (label, fn) => el('button', { onclick: () => { fn(); apply(); } }, label);
  const art = el('article', {}, el('h1', {}, data.title), el('div', { class: 'rsite' }, data.site));
  for (const b of data.blocks) {
    if (b.t === 'p') art.append(el('p', {}, b.v));
    else if (b.t === 'h') art.append(el('h2', {}, b.v));
    else if (b.t === 'cap') art.append(el('p', { style: 'opacity:.7;font-size:.8em' }, b.v));
    else if (b.t === 'img' && /^https?:/.test(b.v)) art.append(el('img', { src: b.v, alt: '', loading: 'lazy' }));
  }
  r.append(el('div', { class: 'rbar' },
    btn('أ−', () => { readerPrefs.size = Math.max(14, readerPrefs.size - 2); }),
    btn('أ+', () => { readerPrefs.size = Math.min(34, readerPrefs.size + 2); }),
    btn('☀ فاتح', () => { readerPrefs.theme = ''; }),
    btn('📜 سيبيا', () => { readerPrefs.theme = 'sepia'; }),
    btn('🌙 داكن', () => { readerPrefs.theme = 'dark'; }),
    btn('✕ خروج من وضع القراءة', closeReader)), art);
  apply();
  r.classList.remove('hidden');
  r.scrollTop = 0;
  $('#readerBtn').classList.add('on');
}
function closeReader() {
  $('#reader').classList.add('hidden');
  $('#reader').innerHTML = '';
  $('#readerBtn').classList.remove('on');
}

/* ---------------- الفيديو في نافذة صغيرة (Picture in Picture) ---------------- */
const PIP_SCRIPT = `(async () => {
  if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'exit'; }
  const v = [...document.querySelectorAll('video')].filter(v => v.readyState > 0)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!v) return 'none';
  v.disablePictureInPicture = false;
  await v.requestPictureInPicture();
  return 'ok';
})()`;
async function pictureInPicture() {
  const w = state.active && state.active.webview;
  if (!w) return toast('افتح صفحة فيها فيديو الأول');
  try {
    const r = await w.executeJavaScript(PIP_SCRIPT, true);
    if (r === 'none') toast('مفيش فيديو شغال في الصفحة دي');
    else if (r === 'ok') toast('الفيديو اتفتح في نافذة صغيرة فوق كل البرامج');
  } catch { toast('الموقع ده مش سامح بالنافذة الصغيرة'); }
}

/* ---------------- لقطة الشاشة ---------------- */
async function takeScreenshot() {
  const t = state.active;
  if (!t || !t.webview || !t.ready) return toast('افتح صفحة الأول');
  const r = await api.screenshot(t.webview.getWebContentsId());
  if (r.error) return toast(r.error);
  toast('📸 اتحفظت اللقطة في الصور ← Alalamy Screenshots واتنسخت، تقدر تلزقها على طول');
  api.showFile(r.file);
}

/* ---------------- الشريط الجانبي للمراسلة (زي أوبرا) ---------------- */
const MESSENGERS = [
  ['whatsapp', 'واتساب', 'https://web.whatsapp.com/', '#25d366', 'W'],
  ['messenger', 'ماسنجر', 'https://www.messenger.com/', '#0866ff', 'M'],
  ['telegram', 'تليجرام', 'https://web.telegram.org/', '#229ed9', 'T'],
  ['instagram', 'انستجرام', 'https://www.instagram.com/direct/inbox/', '#e1306c', 'I'],
  ['x', 'X (تويتر)', 'https://x.com/', '#000000', 'X'],
  ['translate', 'ترجمة جوجل', 'https://translate.google.com/', '#4285f4', 'G'],
  ['gemini', 'Gemini', 'https://gemini.google.com/', '#8e75b2', 'G']
];
const side = { open: null, views: {} };
function renderSidestrip() {
  const strip = $('#sidestrip');
  strip.innerHTML = '';
  for (const [key, name, url, color, letter] of MESSENGERS) {
    const img = el('img', { src: `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`, alt: '' });
    const b = el('button', { title: name, class: side.open === key ? 'on' : '' }, img);
    // لو الأيقونة ما اتحملتش نعرض أول حرف بلون الموقع
    img.onerror = () => { b.innerHTML = ''; b.append(el('span', { class: 'sletter', style: `background:${color}` }, letter)); };
    b.addEventListener('click', () => toggleSide(key));
    strip.append(b);
  }
  strip.append(el('hr'));
  const hide = el('button', { title: 'إخفاء الشريط الجانبي' });
  hide.innerHTML = icon('sidebar');
  hide.addEventListener('click', () => setSidebar(false));
  strip.append(hide);
}
function toggleSide(key) {
  if (side.open === key) { side.open = null; $('#sidepanel').classList.add('hidden'); renderSidestrip(); return; }
  const [, name, url] = MESSENGERS.find(m => m[0] === key);
  side.open = key;
  $('#spTitle').textContent = name;
  if (!side.views[key]) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:default');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('webpreferences', 'contextIsolation=yes, spellcheck=yes');
    wv.src = url;
    side.views[key] = wv;
    $('#spBody').append(wv);
  }
  // نفس فكرة التبويبات: الشات المخفي بيتثبت على مقاسه علشان تغيير مقاس النافذة يبقى ناعم
  const bh = $('#spBody').clientHeight;
  for (const [k, v] of Object.entries(side.views)) {
    v.classList.toggle('on', k === key);
    v.style.height = k === key || !bh ? '' : (v.style.height || bh + 'px');
  }
  $('#sidepanel').classList.remove('hidden');
  renderSidestrip();
}
async function setSidebar(on) {
  state.settings = await api.saveSettings({ showSidebar: on });
  applySidebar();
  if (!on) toast('الشريط الجانبي اتخفى. ترجعه من القائمة ⋮ أو الإعدادات ← المظهر');
}
function applySidebar() {
  const on = state.settings.showSidebar !== false;
  document.body.classList.toggle('no-sidebar', !on);
  if (!on) { side.open = null; $('#sidepanel').classList.add('hidden'); }
  renderSidestrip();
}

/* ---------------- مانع الإعلانات (زرار الدرع) ---------------- */
function adHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function adSiteAllowed(url) {
  const h = adHost(url);
  return !!h && (state.settings.adAllow || []).some(d => h === d || h.endsWith('.' + d));
}
async function refreshAdBadge() {
  const t = state.active;
  if (!state.settings) return;
  const s = await api.stats(t && t.wcId);
  const web = t && /^https?:/.test(t.url || '');
  const on = state.settings.adblock !== false && !(web && adSiteAllowed(t.url));
  const b = $('#adBadge');
  b.classList.toggle('off', !on);
  b.querySelector('b').textContent = on && web ? s.tab : '';
  b.title = !on ? 'مانع الإعلانات مقفول هنا' : `مانع الإعلانات شغال: ${s.tab} في الصفحة دي، ${s.blocked} من أول ما فتحت`;
}
async function showAdMenu() {
  hidePopups();
  const m = $('#profileMenu');
  m.innerHTML = '';
  const t = state.active;
  const host = t && /^https?:/.test(t.url || '') ? adHost(t.url) : '';
  const s = await api.stats(t && t.wcId);
  const globalOn = state.settings.adblock !== false;
  const allowed = host && adSiteAllowed(t.url);
  const head = el('div', { class: 'admenu-head' },
    el('b', {}, globalOn && !allowed ? 'مانع الإعلانات شغال' : 'مانع الإعلانات مقفول'),
    el('div', {}, host ? `اتمنع ${s.tab} إعلان ومتتبع في ${host}` : 'بيمنع إعلانات يوتيوب والمواقع والمتتبعات'),
    el('div', {}, `المجموع من أول ما فتحت المتصفح: ${s.blocked}`));
  m.append(head, el('hr'));
  const reload = () => { if (t && t.webview) t.webview.reload(); };
  if (host && globalOn) {
    m.append(el('button', { onclick: async () => {
      state.settings = await api.adblockAllow(t.url, !allowed);
      hidePopups(); reload(); refreshAdBadge();
      toast(allowed ? `رجع مانع الإعلانات في ${host}` : `الإعلانات مسموحة في ${host} بس`);
    } }, allowed ? '🛡 شغّل المانع في الموقع ده تاني' : '⏸ اسمح بالإعلانات في الموقع ده'));
  }
  m.append(el('button', { onclick: async () => {
    state.settings = await api.saveSettings({ adblock: !globalOn });
    hidePopups(); reload(); refreshAdBadge();
  } }, globalOn ? 'إيقاف مانع الإعلانات في كل المواقع' : '🛡 تشغيل مانع الإعلانات'));
  m.append(el('button', { onclick: async () => {
    hidePopups();
    toast('بنحدّث قوايم الإعلانات...');
    const r = await api.adblockUpdate();
    toast(r.ok ? 'قوايم الإعلانات اتحدثت ✅' : 'التحديث ما نجحش، اتأكد من الإنترنت');
  } }, '🔄 تحديث قوايم الإعلانات دلوقتي'));
  const r = $('#adBadge').getBoundingClientRect();
  placePopup(m, r.left - 160, r.bottom + 4);
}

function bindExtras() {
  commands['reader'] = openReader;
  commands['pip'] = pictureInPicture;
  commands['screenshot'] = takeScreenshot;
  commands['toggle-sidebar'] = () => setSidebar(document.body.classList.contains('no-sidebar'));
  $('#readerBtn').addEventListener('click', openReader);
  $('#adBadge').addEventListener('click', (e) => { e.stopPropagation(); showAdMenu(); });
  $('#spClose').addEventListener('click', () => toggleSide(side.open));
  $('#spOpen').addEventListener('click', () => {
    const wv = side.open && side.views[side.open];
    if (wv) createTab({ url: wv.getURL() });
  });
  // وضع القراءة يتقفل لما تغيّر التبويب أو الصفحة
  const _activate = activate;
  activate = (t) => { if (t !== state.active) closeReader(); _activate(t); };
  const _navigate = navigate;
  navigate = (...a) => { closeReader(); return _navigate(...a); };
  // نستنى الإعدادات تتحمل
  const wait = setInterval(() => { if (state.settings && state.version) { clearInterval(wait); applySidebar(); } }, 100);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindExtras); else bindExtras();
