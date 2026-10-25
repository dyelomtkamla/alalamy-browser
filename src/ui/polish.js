'use strict';
/* لمسات كروم وفايرفوكس اللي كانت ناقصة:
   - «تخصيص المتصفح» زي كروم: لون للمتصفح كله + خلفيات فنية لصفحة البداية أو صورة من جهازك
   - بطاقة معاينة لما تقف بالماوس على تبويب (عنوان + موقع + صورة مصغرة للصفحة)
   - مؤشر التكبير في شريط العنوان (🔍 125%) يرجّع الحجم الطبيعي بضغطة
   - قائمة تطبيقات جوجل ⋮⋮⋮ وGmail والصور فوق صفحة البداية (المساحة اللي كانت فاضية) */

const LOOK_KEY = 'alalamy.look';
const look = { color: 'default', bg: 'none', img: '' };
try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')); } catch (_) { /* ignore */ }
const lookSave = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (_) { toast('الصورة كبيرة، جرّب صورة أصغر'); } };

// [المفتاح، الاسم، درجة اللون، التشبع]
const THEME_COLORS = [
  ['default', 'الافتراضي', null, 0], ['blue', 'أزرق', 214, 1], ['teal', 'فيروزي', 182, 1], ['green', 'أخضر', 145, 0.9],
  ['olive', 'زيتوني', 78, 0.7], ['gold', 'ذهبي', 43, 1], ['orange', 'برتقالي', 22, 1], ['red', 'أحمر', 356, 0.9],
  ['pink', 'وردي', 330, 0.9], ['purple', 'بنفسجي', 276, 0.8], ['indigo', 'نيلي', 238, 0.8], ['slate', 'رمادي', 215, 0.18]
];
const LOOK_VARS = ['--bg', '--tab', '--tab-active', '--toolbar', '--accent', '--input', '--popup', '--hover', '--nt-bg', '--nt-card', '--nt-chip', '--nt-tile', '--nt-box', '--nt-text', '--nt-muted'];
function themeVars(h, sat, dark) {
  const S = (p) => Math.round(p * sat) + '%';
  return dark ? {
    '--bg': `hsl(${h} ${S(22)} 11%)`, '--tab': `hsl(${h} ${S(18)} 14%)`, '--tab-active': `hsl(${h} ${S(18)} 20%)`, '--toolbar': `hsl(${h} ${S(18)} 20%)`,
    '--accent': `hsl(${h} ${S(85)} 76%)`, '--input': `hsl(${h} ${S(18)} 13%)`, '--popup': `hsl(${h} ${S(16)} 16%)`, '--hover': 'rgba(255,255,255,.08)',
    '--nt-bg': `hsl(${h} ${S(18)} 10%)`, '--nt-card': `hsl(${h} ${S(18)} 14%)`, '--nt-chip': `hsl(${h} ${S(22)} 22%)`, '--nt-tile': `hsl(${h} ${S(22)} 22%)`,
    '--nt-box': `hsl(${h} ${S(18)} 18%)`, '--nt-text': `hsl(${h} ${S(40)} 93%)`, '--nt-muted': `hsl(${h} ${S(14)} 72%)`
  } : {
    '--bg': `hsl(${h} ${S(42)} 88%)`, '--tab': `hsl(${h} ${S(40)} 92%)`, '--tab-active': `hsl(${h} ${S(60)} 98.5%)`, '--toolbar': `hsl(${h} ${S(60)} 98.5%)`,
    '--accent': `hsl(${h} ${S(78)} 40%)`, '--input': `hsl(${h} ${S(45)} 94%)`, '--popup': '#ffffff', '--hover': 'rgba(0,0,0,.06)',
    '--nt-bg': `hsl(${h} ${S(65)} 97%)`, '--nt-card': `hsl(${h} ${S(65)} 99%)`, '--nt-chip': `hsl(${h} ${S(48)} 89%)`, '--nt-tile': `hsl(${h} ${S(48)} 92%)`,
    '--nt-box': '#ffffff', '--nt-text': `hsl(${h} ${S(35)} 12%)`, '--nt-muted': `hsl(${h} ${S(14)} 38%)`
  };
}
// خلفيات فنية مرسومة بالكود (مفيش صور تتحمل): [المفتاح، الاسم، CSS، غامقة؟]
const NT_BACKS = [
  ['none', 'من غير خلفية', '', false],
  ['aurora', 'الشفق', 'radial-gradient(1100px 620px at 12% 8%, #7f5af0cc, transparent 62%), radial-gradient(900px 620px at 88% 18%, #2cb67dbb, transparent 60%), radial-gradient(1100px 760px at 50% 108%, #3da9fccc, transparent 62%), #0f0e17', true],
  ['nile', 'غروب النيل', 'linear-gradient(180deg, #23104d 0%, #5b3f9a 30%, #c86b8f 62%, #f4a259 86%, #f7c873 100%)', true],
  ['stars', 'ليل النجوم', 'radial-gradient(1.4px 1.4px at 22px 34px, #fff, transparent) 0 0/190px 190px, radial-gradient(1px 1px at 120px 80px, #ffffffcc, transparent) 0 0/170px 170px, radial-gradient(1.8px 1.8px at 60px 150px, #ffe9a8, transparent) 0 0/230px 230px, radial-gradient(1200px 500px at 70% 0%, #3b3a8f88, transparent 70%), linear-gradient(180deg, #070b1f, #18205a 70%, #2c2f7a)', true],
  ['arabesque', 'زخرفة إسلامية', 'repeating-conic-gradient(from 45deg at 50% 50%, #ffffff00 0 25%, #ffffff14 0 50%) 0 0/46px 46px, radial-gradient(circle at 50% 50%, #ffffff10 0 9px, transparent 10px) 0 0/46px 46px, linear-gradient(135deg, #0f4c5c, #1d7a6b 55%, #c9a227)', true],
  ['desert', 'الصحرا', 'radial-gradient(900px 400px at 75% 12%, #fff6d8, transparent 70%), linear-gradient(180deg, #fde6c8 0%, #f6c690 45%, #e39b67 78%, #c57b57 100%)', false],
  ['sea', 'البحر', 'radial-gradient(1000px 500px at 20% 0%, #ffffffaa, transparent 70%), linear-gradient(180deg, #a6d8ff 0%, #c7ecff 45%, #e6f8f6 100%)', false],
  ['blossom', 'ورد', 'radial-gradient(800px 520px at 8% 12%, #ffc2d6, transparent 65%), radial-gradient(800px 560px at 92% 30%, #d7c6ff, transparent 65%), radial-gradient(900px 600px at 50% 110%, #ffe0c2, transparent 60%), #fff6f8', false]
];

function applyLook() {
  const root = document.documentElement;
  for (const k of LOOK_VARS) root.style.removeProperty(k);
  const c = THEME_COLORS.find(x => x[0] === look.color);
  if (c && c[2] != null) {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    for (const [k, v] of Object.entries(themeVars(c[2], c[3], dark))) root.style.setProperty(k, v);
  }
  const nt = $('#newtab'); if (!nt) return;
  const b = NT_BACKS.find(x => x[0] === look.bg);
  let css = '', darkBg = false;
  if (look.bg === 'image' && look.img) { css = `linear-gradient(#0003, #0003), url("${look.img}") center/cover no-repeat`; darkBg = true; }
  else if (b && b[2]) { css = b[2]; darkBg = b[3]; }
  nt.style.background = css;
  nt.classList.toggle('nt-has-bg', !!css);
  nt.classList.toggle('nt-dark-bg', !!css && darkBg);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);

// صورة من الجهاز: بنصغرها لـ 1920 بكسل JPEG علشان تتحفظ وتفتح بسرعة
function pickBgImage(done) {
  const inp = el('input', { type: 'file', accept: 'image/*' });
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 1920 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      look.img = cv.toDataURL('image/jpeg', 0.84); look.bg = 'image';
      lookSave(); applyLook(); done && done();
    };
    img.onerror = () => toast('الملف ده مش صورة');
    img.src = URL.createObjectURL(f);
  });
  inp.click();
}

panels.customize = (body) => {
  body.innerHTML = '';
  const draw = () => panels.customize(body);
  const colors = el('div', { class: 'lk-colors' }, ...THEME_COLORS.map(([k, name, h, sat]) => {
    const sw = el('button', { class: 'lk-color' + (look.color === k ? ' on' : ''), title: name,
      style: h == null ? 'background: conic-gradient(#4285f4 0 25%, #ea4335 0 50%, #fbbc05 0 75%, #34a853 0)' : `background: linear-gradient(135deg, hsl(${h} ${Math.round(80 * sat)}% 45%) 50%, hsl(${h} ${Math.round(60 * sat)}% 85%) 50%)` });
    sw.addEventListener('click', () => { look.color = k; lookSave(); applyLook(); draw(); });
    return sw;
  }));
  const backs = el('div', { class: 'lk-backs' }, ...NT_BACKS.map(([k, name, css]) => {
    const b = el('button', { class: 'lk-back' + (look.bg === k ? ' on' : ''), title: name }, el('i', { style: css ? `background:${css}` : '' }), el('span', {}, name));
    b.addEventListener('click', () => { look.bg = k; if (k !== 'image') look.img = ''; lookSave(); applyLook(); draw(); });
    return b;
  }), (() => {
    const b = el('button', { class: 'lk-back' + (look.bg === 'image' ? ' on' : ''), title: 'صورة من جهازك' },
      el('i', { class: 'lk-up', style: look.img ? `background:url("${look.img}") center/cover` : '' }, look.img ? '' : '⬆'), el('span', {}, 'صورة من جهازك'));
    b.addEventListener('click', () => pickBgImage(draw));
    return b;
  })());
  body.append(
    el('div', { class: 'lk-preview' }, el('div', { class: 'lk-mini' }, el('b', {}, 'متصفح العالمي'), el('span', {}, 'كده هيبقى شكله'))),
    el('h3', { class: 'lk-h' }, 'لون المتصفح'), colors,
    el('p', { class: 'note' }, 'اللون بيتطبق على شريط التبويبات والأدوات وصفحة البداية، وبيمشي مع الوضع الفاتح والداكن.'),
    el('h3', { class: 'lk-h' }, 'خلفية صفحة البداية'), backs,
    el('div', { class: 'btnrow', style: 'margin-top:14px' },
      el('button', { onclick: () => { Object.assign(look, { color: 'default', bg: 'none', img: '' }); lookSave(); applyLook(); draw(); } }, 'رجّع الشكل الأصلي'),
      el('button', { onclick: () => { closePanel(); openSettingsPage && openSettingsPage('appearance'); } }, 'إعدادات المظهر')));
  const pv = body.querySelector('.lk-mini');
  const nt = $('#newtab');
  if (nt && nt.style.background) pv.style.background = nt.style.background;
};
panelTitles.customize = 'تخصيص المتصفح';
commands['customize'] = () => openPanel('customize');

// زرار «تخصيص» في ركن صفحة البداية + قائمة تطبيقات جوجل فوق
const GOOGLE_APPS = [
  ['بحث', 'https://www.google.com/', '#4285f4'], ['خرائط', 'https://maps.google.com/', '#34a853'], ['يوتيوب', 'https://www.youtube.com/', '#ff0000'],
  ['Gmail', 'https://mail.google.com/', '#ea4335'], ['Drive', 'https://drive.google.com/', '#fbbc05'], ['التقويم', 'https://calendar.google.com/', '#4285f4'],
  ['Meet', 'https://meet.google.com/', '#00897b'], ['الصور', 'https://photos.google.com/', '#f4b400'], ['ترجمة', 'https://translate.google.com/', '#1a73e8'],
  ['Gemini', 'https://gemini.google.com/', '#8e44ef'], ['مستندات', 'https://docs.google.com/document/', '#4285f4'], ['جداول', 'https://docs.google.com/spreadsheets/', '#0f9d58'],
  ['عروض', 'https://docs.google.com/presentation/', '#f4b400'], ['Keep', 'https://keep.google.com/', '#fbbc05'], ['الأخبار', 'https://news.google.com/?hl=ar', '#4285f4'],
  ['Play', 'https://play.google.com/', '#01875f'], ['حسابك', 'https://myaccount.google.com/', '#5f6368'], ['جهات الاتصال', 'https://contacts.google.com/', '#1a73e8']
];
function buildNewtabExtras() {
  const nt = $('#newtab'); if (!nt || $('#ntTopBar')) return;
  const appsPop = el('div', { id: 'ntAppsPop', class: 'hidden' }, ...GOOGLE_APPS.map(([name, url, color]) => {
    const img = el('img', { src: faviconFor(url).replace('sz=32', 'sz=64'), alt: '' });
    const ic = el('span', { class: 'ap-ic', style: `--c:${color}` }, img);
    img.onerror = () => { img.remove(); ic.textContent = name[0]; };
    const a = el('button', { class: 'ap', title: url }, ic, el('span', {}, name));
    a.addEventListener('click', () => { appsPop.classList.add('hidden'); navigate(url); });
    a.addEventListener('auxclick', (e) => { if (e.button === 1) createTab({ url, background: true }); });
    return a;
  }));
  const appsBtn = el('button', { class: 'ntTopBtn apps', title: 'تطبيقات Google' });
  appsBtn.innerHTML = '<svg viewBox="0 0 24 24"><g>' + [4, 12, 20].flatMap(y => [4, 12, 20].map(x => `<circle cx="${x}" cy="${y}" r="2.2"/>`)).join('') + '</g></svg>';
  appsBtn.addEventListener('click', (e) => { e.stopPropagation(); appsPop.classList.toggle('hidden'); });
  document.addEventListener('click', (e) => { if (!appsPop.contains(e.target) && e.target !== appsBtn) appsPop.classList.add('hidden'); });
  const link = (txt, url) => { const b = el('button', { class: 'ntTopLink' }, txt); b.addEventListener('click', () => navigate(url)); return b; };
  const bar = el('div', { id: 'ntTopBar' }, link('Gmail', 'https://mail.google.com/'), link('الصور', 'https://www.google.com/imghp?hl=ar'), appsBtn, appsPop);
  const custom = el('button', { id: 'ntCustomize', title: 'تخصيص المتصفح (اللون والخلفية)' });
  custom.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><span>تخصيص</span>';
  custom.addEventListener('click', () => openPanel('customize'));
  nt.prepend(bar);
  nt.append(custom);
}

/* ---- بطاقة معاينة التبويب (زي كروم) ---- */
const hover = { timer: null, tab: null, card: null, shots: new WeakMap() };
function hoverCard() {
  if (hover.card) return hover.card;
  hover.card = el('div', { id: 'tabHover', class: 'hidden' }, el('b', { class: 'th-title' }), el('div', { class: 'th-host' }), el('img', { class: 'th-shot', alt: '' }), el('div', { class: 'th-state' }));
  document.body.append(hover.card);
  return hover.card;
}
function hideHover() { clearTimeout(hover.timer); hover.tab = null; if (hover.card) hover.card.classList.add('hidden'); }
async function showHover(tab) {
  const c = hoverCard();
  const r = tab.tabEl.getBoundingClientRect();
  c.querySelector('.th-title').textContent = tab.url === NEWTAB ? 'تبويب جديد' : (tab.title || tab.url);
  let host = ''; try { host = tab.url === NEWTAB ? '' : new URL(tab.url).hostname.replace(/^www\./, ''); } catch (_) { /* ignore */ }
  c.querySelector('.th-host').textContent = host;
  const st = [];
  if (tab.sleeping) st.push('💤 نايم علشان يوفّر الذاكرة');
  if (tab.tabEl.classList.contains('playing')) st.push('🔊 بيشغّل صوت');
  if (tab.temp) st.push('🕶 تصفح متخفي');
  const cl = typeof clientById === 'function' && clientById(tab.clientId);
  if (cl) st.push('👤 ' + cl.name);
  c.querySelector('.th-state').textContent = st.join(' · ');
  const img = c.querySelector('.th-shot');
  img.classList.add('hidden');
  c.style.top = (r.bottom + 6) + 'px';
  const w = 280;
  c.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  c.classList.remove('hidden');
  // صورة مصغرة للتبويبات اللي مش قدامك (التبويب المفتوح شايفه أصلاً)
  if (tab !== state.active && tab.webview && tab.ready && !tab.sleeping) {
    const old = hover.shots.get(tab);
    if (old && Date.now() - old.t < 20000) { img.src = old.src; img.classList.remove('hidden'); return; }
    try {
      const shot = await tab.webview.capturePage();
      if (hover.tab !== tab) return;
      const src = shot.resize({ width: 280 }).toDataURL();
      if (shot.isEmpty() || !src || src.length < 200) return;
      hover.shots.set(tab, { src, t: Date.now() });
      img.src = src; img.classList.remove('hidden');
    } catch (_) { /* ignore */ }
  }
}
function setupHoverCards() {
  const tabs = $('#tabs'); if (!tabs) return;
  tabs.addEventListener('mouseover', (e) => {
    const te = e.target.closest('.tab'); if (!te) return;
    const tab = state.tabs.find(t => t.tabEl === te);
    if (!tab || tab === hover.tab) return;
    clearTimeout(hover.timer);
    const visible = hover.card && !hover.card.classList.contains('hidden');
    hover.tab = tab;
    hover.timer = setTimeout(() => { if (hover.tab === tab && !state.dragging) showHover(tab); }, visible ? 60 : 550);
  });
  tabs.addEventListener('mouseleave', hideHover);
  tabs.addEventListener('mousedown', hideHover);
  window.addEventListener('blur', hideHover);
}

/* ---- مؤشر التكبير في شريط العنوان ---- */
function setupZoomBadge() {
  const wrap = $('#addressWrap'); if (!wrap || $('#zoomBadge')) return;
  const b = el('button', { id: 'zoomBadge', class: 'hidden', title: 'التكبير — اضغط للرجوع للحجم الطبيعي' });
  b.addEventListener('click', () => { if (typeof zoom === 'function') zoom(0); syncZoomBadge(); });
  wrap.insertBefore(b, $('#readerBtn'));
  const origZoom = zoom;
  zoom = function (delta) { origZoom(delta); syncZoomBadge(); };
  const origNav = updateNav;
  updateNav = function () { origNav.apply(this, arguments); syncZoomBadge(); };
}
function syncZoomBadge() {
  const b = $('#zoomBadge'); if (!b) return;
  const t = state.active;
  const pct = t && t.webview ? Math.round(Math.pow(1.2, t.zoom || 0) * 100) : 100;
  const def = (state.settings && state.settings.defaultZoom) || 100;
  b.classList.toggle('hidden', !t || !t.webview || Math.abs(pct - def) < 1);
  b.textContent = '🔍 ' + pct + '%';
}

/* ---- قفل التبويبات المكررة (فايرفوكس) ---- */
commands['close-duplicates'] = () => {
  const seen = new Set(); let n = 0;
  for (const t of [...visibleTabs()]) {
    if (t.url === NEWTAB || t.pinned) continue;
    const k = (t.partition || '') + '|' + String(t.url).replace(/#.*$/, '');
    if (seen.has(k) && t !== state.active) { closeTab(t); n++; } else seen.add(k);
  }
  toast(n ? `اتقفل ${n} تبويب مكرر` : 'مفيش تبويبات مكررة');
};

applyLook();
buildNewtabExtras();
setupHoverCards();
setupZoomBadge();
