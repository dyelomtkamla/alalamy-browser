'use strict';
/* متصفح العالمي - الترجمة لكل اللغات وإدارة إضافات كروم (يعتمد على renderer.js) */

const LANGS = {
  ar: 'العربية', en: 'الإنجليزية', fr: 'الفرنسية', es: 'الإسبانية', de: 'الألمانية', it: 'الإيطالية',
  pt: 'البرتغالية', ru: 'الروسية', tr: 'التركية', fa: 'الفارسية', ur: 'الأردية', hi: 'الهندية',
  bn: 'البنغالية', 'zh-CN': 'الصينية (المبسطة)', 'zh-TW': 'الصينية (التقليدية)', ja: 'اليابانية', ko: 'الكورية',
  id: 'الإندونيسية', ms: 'الملايوية', th: 'التايلاندية', vi: 'الفيتنامية', tl: 'الفلبينية', nl: 'الهولندية',
  sv: 'السويدية', no: 'النرويجية', da: 'الدنماركية', fi: 'الفنلندية', pl: 'البولندية', cs: 'التشيكية',
  sk: 'السلوفاكية', hu: 'المجرية', ro: 'الرومانية', bg: 'البلغارية', el: 'اليونانية', uk: 'الأوكرانية',
  sr: 'الصربية', hr: 'الكرواتية', bs: 'البوسنية', sl: 'السلوفينية', sq: 'الألبانية', mk: 'المقدونية',
  lt: 'الليتوانية', lv: 'اللاتفية', et: 'الإستونية', iw: 'العبرية', ku: 'الكردية (الكرمانجية)',
  ckb: 'الكردية (السورانية)', ps: 'البشتو', sd: 'السندية', pa: 'البنجابية', gu: 'الغوجاراتية', mr: 'الماراثية',
  ta: 'التاميلية', te: 'التيلوغوية', kn: 'الكنادية', ml: 'المالايالامية', si: 'السنهالية', ne: 'النيبالية',
  my: 'البورمية', km: 'الخميرية', lo: 'اللاوية', mn: 'المنغولية', kk: 'الكازاخية', uz: 'الأوزبكية',
  ky: 'القيرغيزية', tg: 'الطاجيكية', tk: 'التركمانية', az: 'الأذربيجانية', hy: 'الأرمنية', ka: 'الجورجية',
  sw: 'السواحيلية', am: 'الأمهرية', so: 'الصومالية', ha: 'الهوسا', yo: 'اليوروبا', ig: 'الإيجبو',
  zu: 'الزولو', xh: 'الخوسا', af: 'الأفريكانية', mg: 'الملغاشية', rw: 'الكينيارواندا', ti: 'التغرينية',
  om: 'الأورومو', ln: 'اللينغالا', ny: 'الشيشيوا', sn: 'الشونا', st: 'السوتو', ca: 'الكتالونية',
  eu: 'الباسكية', gl: 'الجاليكية', cy: 'الويلزية', ga: 'الأيرلندية', gd: 'الغيلية الاسكتلندية', is: 'الآيسلندية',
  lb: 'اللوكسمبورغية', mt: 'المالطية', fy: 'الفريزية', be: 'البيلاروسية', eo: 'الإسبرانتو', la: 'اللاتينية',
  haw: 'الهاوائية', mi: 'الماورية', sm: 'الساموية', ht: 'الكريولية الهايتية', jw: 'الجاوية', su: 'السوندية',
  ceb: 'السيبيونو', hmn: 'الهمونغ', yi: 'اليديشية', ug: 'الأويغورية', tt: 'التتارية', or: 'الأوديا',
  as: 'الأسامية', dv: 'الديفيهي', qu: 'الكيتشوا', ay: 'الأيمارا', gn: 'الغوارانية', co: 'الكورسيكية'
};
const langName = (c) => LANGS[c] || c;
function langOptions(selected, withAuto = false) {
  const opts = [];
  if (withAuto) opts.push(el('option', { value: 'auto', ...(selected === 'auto' ? { selected: '' } : {}) }, 'اكتشاف تلقائي'));
  for (const [code, name] of Object.entries(LANGS)) {
    opts.push(el('option', { value: code, ...(code === selected ? { selected: '' } : {}) }, name));
  }
  return opts;
}
function defaultTarget(pageLang) {
  const t = state.settings.translateTo || 'ar';
  if (pageLang && pageLang.toLowerCase().startsWith(t.slice(0, 2))) return t === 'en' ? 'ar' : 'en';
  return t;
}

/* ---------------- ترجمة الصفحة كاملة ---------------- */
const COLLECT = `(() => {
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','INPUT','SELECT','OPTION','SVG','MATH','IFRAME','KBD']);
  const T = window.__alalamyTr = window.__alalamyTr || { orig: new Map() };
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, { acceptNode(n) {
    const v = n.nodeValue; if (!v || !/\\p{L}/u.test(v)) return NodeFilter.FILTER_REJECT;
    for (let p = n.parentElement; p; p = p.parentElement) if (SKIP.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT; } });
  const nodes = []; while (walker.nextNode() && nodes.length < 8000) nodes.push(walker.currentNode);
  T.nodes = nodes;
  T.apply = (start, list) => list.forEach((t, k) => {
    const n = T.nodes[start + k]; if (!n || t == null) return;
    const src = T.orig.has(n) ? T.orig.get(n) : n.nodeValue;
    if (!T.orig.has(n)) T.orig.set(n, src);
    const lead = src.match(/^\\s*/)[0], trail = src.match(/\\s*$/)[0];
    n.nodeValue = lead + t.trim() + trail;
  });
  T.restore = () => { T.orig.forEach((v, n) => { n.nodeValue = v; }); T.orig.clear(); };
  return nodes.map(n => (T.orig.has(n) ? T.orig.get(n) : n.nodeValue).trim());
})()`;

async function translatePage(target, tab = state.active) {
  if (!tab || !tab.webview || !tab.ready) return toast('افتح صفحة أولاً');
  const wv = tab.webview;
  hideTranslateMenu();
  showTrBar(tab, `جارٍ ترجمة الصفحة إلى ${langName(target)}...`, target, true);
  let texts;
  try { texts = await wv.executeJavaScript(COLLECT); } catch { return toast('لا يمكن ترجمة هذه الصفحة'); }
  if (!texts.length) { hideTrBar(); return toast('لا يوجد نص للترجمة'); }
  const CHUNK = 250;
  let failed = 0;
  for (let start = 0; start < texts.length; start += CHUNK) {
    if (tab.webview !== wv) return; // التبويب تغير أو نام
    const part = texts.slice(start, start + CHUNK);
    const r = await api.translateMany({ texts: part, target });
    if (!r.ok) { failed++; if (start === 0) { showTrBar(tab, `تعذرت الترجمة: ${r.error}`, target); return; } continue; }
    if (r.detected) tab.pageLang = r.detected;
    try { await wv.executeJavaScript(`window.__alalamyTr.apply(${start}, ${JSON.stringify(r.texts)})`); } catch { /* ignore */ }
  }
  tab.translatedTo = target;
  showTrBar(tab, `تمت ترجمة الصفحة${tab.pageLang && LANGS[tab.pageLang] ? ' من ' + langName(tab.pageLang) : ''} إلى ${langName(target)}` + (failed ? ' (بعض الأجزاء لم تُترجم)' : ''), target);
}
async function restorePage(tab = state.active) {
  if (!tab || !tab.webview) return;
  try { await tab.webview.executeJavaScript('window.__alalamyTr && window.__alalamyTr.restore()'); } catch { /* ignore */ }
  tab.translatedTo = null;
  hideTrBar();
}

function showTrBar(tab, text, target, busy = false) {
  if (tab !== state.active) return;
  $('#trText').textContent = '🌐 ' + text;
  const sel = $('#trLang');
  if (!sel.options.length) sel.append(...langOptions(target));
  sel.value = target;
  $('#trGo').disabled = busy;
  $('#trOrig').classList.toggle('hidden', !tab.translatedTo);
  $('#trbar').classList.remove('hidden');
}
function hideTrBar() { $('#trbar').classList.add('hidden'); }

// عرض اقتراح الترجمة مثل كروم عندما تكون لغة الصفحة مختلفة
async function onTabReady(tab) {
  tab.translatedTo = null;
  if (tab !== state.active) return;
  syncExtBar(tab);
  hideTrBar();
  if (!/^https?:/.test(tab.url || '')) return;
  // لغة الصفحة من وسم lang + نسبة الحروف في النص نفسه (مواقع عربي كتير حاطة lang="en" غلط)
  let info = null;
  try {
    info = await tab.webview.executeJavaScript(`(() => {
      const t = ((document.body && document.body.innerText) || '').slice(0, 4000);
      const ar = (t.match(/[\\u0600-\\u06FF]/g) || []).length, la = (t.match(/[A-Za-z]/g) || []).length;
      return { lang: document.documentElement.lang || '', ar, la };
    })()`);
  } catch { return; }
  if (!info) return;
  tab.pageLang = (info.lang || '').split('-')[0].toLowerCase();
  const letters = info.ar + info.la;
  const mostlyLatin = letters > 40 && info.la / letters > 0.75;
  if (!tab.pageLang && mostlyLatin) tab.pageLang = 'en';
  const target = state.settings.translateTo || 'ar';
  // زي ما طلبت: اقتراح الترجمة يظهر بس لو المحتوى إنجليزي فعلاً (مش لأي صفحة عربي أو لغة تانية)
  const english = tab.pageLang === 'en' && mostlyLatin;
  if (english && !target.startsWith('en') && tab === state.active && !tab.dismissedTr && state.settings.translateOffer !== false) {
    showTrBar(tab, `هذه الصفحة بالإنجليزية. ترجمتها إلى:`, target);
  }
}

function onTabActivated(tab) {
  hideTrBar();
  if (tab.translatedTo) showTrBar(tab, `الصفحة مترجمة إلى ${langName(tab.translatedTo)}`, tab.translatedTo);
  syncExtBar(tab);
}
// إبلاغ نظام الإضافات بالتبويب النشط وتحديث أزرار الإضافات لحساب هذا التبويب
function syncExtBar(tab) {
  const bar = $('#extActions');
  if (!tab || !tab.wcId) return;
  api.tabActivated(tab.wcId);
  if (bar.getAttribute('partition') !== tab.partition) bar.setAttribute('partition', tab.partition);
  bar.setAttribute('tab', String(tab.wcId));
}

/* ---------------- قائمة زر الترجمة ---------------- */
function showTranslateMenu(anchor) {
  const m = $('#translateMenu');
  m.innerHTML = '';
  const tab = state.active;
  const other = el('select', {}, el('option', { value: '' }, 'لغة أخرى...'), ...langOptions(''));
  other.addEventListener('change', () => { if (other.value) translatePage(other.value); });
  m.append(
    el('button', { onclick: () => translatePage('ar') }, '🇸🇦 ترجمة الصفحة إلى العربية'),
    el('button', { onclick: () => translatePage('en') }, '🇬🇧 ترجمة الصفحة إلى الإنجليزية'),
    other,
    tab && tab.translatedTo ? el('button', { onclick: () => { hideTranslateMenu(); restorePage(); } }, '↩ إظهار الصفحة الأصلية') : null,
    el('hr'),
    el('button', { onclick: () => { hideTranslateMenu(); openPanel('translate'); } }, '📝 المترجم (ترجمة نص)'));
  const r = anchor.getBoundingClientRect();
  m.style.top = (r.bottom + 4) + 'px';
  m.style.left = Math.max(4, r.left - 200) + 'px';
  m.classList.remove('hidden');
}
function hideTranslateMenu() { $('#translateMenu').classList.add('hidden'); }

/* ---------------- لوحة المترجم ---------------- */
state.trDraft = { text: '', source: 'auto', target: 'en' };
panels.translate = async (body) => {
  const d = state.trDraft;
  const src = el('select', {}, ...langOptions(d.source, true));
  const dst = el('select', {}, ...langOptions(d.target));
  const input = el('textarea', { dir: 'auto', placeholder: 'اكتب أو الصق النص هنا...' });
  input.value = d.text;
  const out = el('div', { class: 'out', dir: 'auto' });
  const info = el('div', { class: 'note' });
  const run = async () => {
    d.text = input.value; d.source = src.value; d.target = dst.value;
    if (!input.value.trim()) { out.textContent = ''; return; }
    out.textContent = '...';
    const r = await api.translateText({ text: input.value, target: dst.value, source: src.value });
    if (!r.ok) { out.textContent = '⚠ ' + r.error; return; }
    out.textContent = r.text;
    info.textContent = src.value === 'auto' && r.detected ? `اللغة المكتشفة: ${langName(r.detected)}` : '';
  };
  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 600); });
  src.addEventListener('change', run); dst.addEventListener('change', run);
  const swap = el('button', { title: 'تبديل اللغتين', onclick: () => {
    if (src.value === 'auto') src.value = dst.value === 'ar' ? 'en' : 'ar';
    const a = src.value; src.value = dst.value; dst.value = a;
    if (out.textContent && !out.textContent.startsWith('⚠')) input.value = out.textContent;
    run();
  } }, '⇄');
  body.append(el('div', { class: 'tr-box' },
    el('div', { class: 'tr-row' }, src, swap, dst),
    input,
    el('div', { class: 'tr-row' },
      el('button', { class: 'primary', onclick: run }, 'ترجمة'),
      el('button', { onclick: () => { navigator.clipboard.writeText(out.textContent); toast('تم نسخ الترجمة'); } }, 'نسخ الترجمة'),
      el('button', { onclick: () => { input.value = ''; out.textContent = ''; d.text = ''; } }, 'مسح')),
    out, info,
    el('p', { class: 'note' }, `يدعم ${Object.keys(LANGS).length} لغة. حدّد أي نص في صفحة واضغط بالزر الأيمن لترجمته، أو استخدم زر 🌐 لترجمة الصفحة كاملة.`)));
  input.focus();
  if (input.value.trim()) run();
};

/* ---------------- لوحة الإضافات ---------------- */
panels.extensions = async (body) => {
  body.append(
    el('div', { class: 'btnrow' },
      el('button', { class: 'primary', onclick: () => run('open-webstore') }, '🛒 فتح سوق إضافات كروم'),
      el('button', { onclick: async () => {
        const r = await api.loadUnpackedExtension();
        if (r.ok) { toast(`تم تحميل ${r.name || 'الإضافة'}`); draw(); } else if (r.error) toast(r.error);
      } }, '📁 تحميل إضافة من مجلد')),
    el('p', { class: 'note' },
      'افتح السوق واضغط «إضافة إلى Chrome» على أي إضافة لتثبيتها. الإضافة تعمل في كل الحسابات. ' +
      'معظم الإضافات تعمل (مانع إعلانات، الوضع الليلي، مديري كلمات المرور، أدوات الصفحات)، لكن بعض الإضافات التي تعتمد على ميزات خاصة بكروم أو بحساب جوجل (مثل المزامنة أو التحكم بالبروكسي والتنزيلات) قد لا تعمل بالكامل.'));
  const list = el('div');
  body.append(list);
  const draw = async () => {
    list.innerHTML = '';
    const items = await api.listExtensions();
    for (const e of items) {
      list.append(el('div', { class: 'item' },
        el('div', { class: 'main' },
          el('div', { class: 't' }, `🧩 ${e.name} `, el('span', { class: 's', style: 'display:inline' }, e.version ? 'v' + e.version : '')),
          e.description ? el('div', { class: 's', style: 'direction:auto;white-space:normal' }, e.description) : null,
          e.unpacked ? el('div', { class: 's' }, 'محمّلة من مجلد') : null),
        el('button', { class: 'del', onclick: async () => {
          if (!confirm(`إزالة إضافة "${e.name}" من كل الحسابات؟`)) return;
          await api.removeExtension(e.id); toast('تمت الإزالة'); draw();
        } }, 'إزالة')));
    }
    if (!items.length) list.append(el('p', { class: 'note' }, 'لا توجد إضافات مثبتة بعد.'));
  };
  draw();
};

/* ---------------- الأوامر والأحداث ---------------- */
Object.assign(commands, {
  'translate-ar': () => translatePage('ar'),
  'translate-en': () => translatePage('en'),
  'show-translator': () => openPanel('translate'),
  'show-extensions': () => openPanel('extensions'),
  'open-webstore': async () => {
    const url = await api.webStoreURL();
    const a = state.active;
    if (a && !a.webview && !a.sleeping) navigate(url);
    else createTab({ url, profileId: a && !a.temp ? a.profileId : undefined, index: state.tabs.indexOf(a) + 1 });
  }
});

$('#translateBtn').addEventListener('click', (e) => { e.stopPropagation(); hidePopups(); showTranslateMenu(e.currentTarget); });
$('#extBtn').addEventListener('click', () => openPanel('extensions'));
document.addEventListener('click', (e) => { if (!e.target.closest('#translateMenu') && !e.target.closest('#translateBtn')) hideTranslateMenu(); });
$('#trGo').addEventListener('click', () => {
  const t = $('#trLang').value;
  state.settings.translateTo = t;
  api.saveSettings({ translateTo: t });
  translatePage(t);
});
$('#trOrig').addEventListener('click', () => restorePage());
$('#trClose').addEventListener('click', () => { if (state.active) state.active.dismissedTr = true; hideTrBar(); });

api.on('translate-selection', ({ text, target, choose }) => {
  state.trDraft.text = text;
  state.trDraft.source = 'auto';
  if (target) state.trDraft.target = target;
  else if (choose) state.trDraft.target = state.trDraft.target || 'en';
  openPanel('translate');
});
api.on('select-tab-wc', (id) => { const t = state.tabs.find(x => x.wcId === id); if (t) activate(t); });
api.on('close-tab-wc', (id) => { const t = state.tabs.find(x => x.wcId === id); if (t) closeTab(t); });

/* ---------------- لوحة الإضافة الجانبية (chrome.sidePanel) زي كروم: على الشمال ---------------- */
function extPanelEl() {
  let p = $('#extPanel');
  if (p) return p;
  p = el('div', { id: 'extPanel', class: 'hidden' },
    el('div', { class: 'xp-resize', title: 'اسحب لتغيير العرض' }),
    el('header', {}, el('span', { id: 'xpTitle' }), el('button', { id: 'xpClose', class: 'icon small2', title: 'إغلاق', onclick: () => closeExtPanel() })),
    el('div', { id: 'xpBody' }));
  $('#main').appendChild(p);
  p.querySelector('#xpClose').innerHTML = icon('close');
  try { const w = +localStorage.getItem('extPanelWidth'); if (w >= 280 && w <= 900) p.style.width = w + 'px'; } catch (_) { /* ignore */ }
  const grip = p.querySelector('.xp-resize');
  grip.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = p.offsetWidth;
    document.body.classList.add('xp-dragging');
    const move = (ev) => { p.style.width = Math.max(280, Math.min(900, startW + (ev.clientX - startX))) + 'px'; };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.body.classList.remove('xp-dragging');
      try { localStorage.setItem('extPanelWidth', String(p.offsetWidth)); } catch (_) { /* ignore */ }
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  return p;
}
function openExtPanel({ id, name, url, partition, toggle }) {
  const p = extPanelEl();
  if (toggle && !p.classList.contains('hidden') && p.dataset.ext === id) { closeExtPanel(); return; }
  const body = p.querySelector('#xpBody');
  let wv = body.querySelector(`webview[data-ext="${id}"][partition="${partition}"]`);
  body.querySelectorAll('webview').forEach(x => x.classList.remove('on'));
  if (!wv) {
    wv = document.createElement('webview');
    wv.dataset.ext = id;
    wv.setAttribute('partition', partition);
    wv.setAttribute('src', url);
    body.appendChild(wv);
  }
  wv.classList.add('on');
  p.dataset.ext = id;
  p.querySelector('#xpTitle').textContent = name || 'الإضافة';
  p.classList.remove('hidden');
}
function closeExtPanel(id) {
  const p = $('#extPanel');
  if (!p || (id && p.dataset.ext !== id)) return;
  p.classList.add('hidden'); delete p.dataset.ext;
}
api.on('ext:sidepanel', openExtPanel);
api.on('ext:sidepanel-close', closeExtPanel);
window.__extPanel = { open: openExtPanel, close: closeExtPanel };
