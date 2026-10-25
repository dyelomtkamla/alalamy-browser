'use strict';
/* لغة الواجهة: الواجهة مكتوبة بالعربي، ولو اخترت لغة تانية (إنجليزي، فرنساوي، تركي... أكتر من 60 لغة)
   كل نص عربي بيظهر في الواجهة بيتبدل بترجمته. الترجمة بتتعمل مرة واحدة وبتتحفظ على الجهاز. */
const I18N = { lang: 'ar', rtl: true, dict: {}, langs: [], text: new WeakMap(), attrs: new WeakMap(), queue: new Set(), timer: null, obs: null, walkTimer: null };
const I18N_AR = /[؀-ۿ]/;
const I18N_ATTRS = ['title', 'placeholder', 'aria-label'];
// نصوص جاية من المواقع نفسها (عناوين الصفحات والأخبار والسجل) مابتتترجمش
const I18N_SKIP = 'script, style, webview, textarea, [contenteditable="true"], [translate="no"], .notr, #ntFeed, #historyList, .hist-title, #suggestions .u, #bookmarksBar .bm-title';
// من غير ما نستنى العملية الرئيسية: الاتجاه يتظبط من أول لحظة علشان الواجهة ماتتقلبش قدامك
try {
  const l = localStorage.getItem('uiLang');
  if (l && l !== 'ar') { document.documentElement.lang = l; if (localStorage.getItem('uiRtl') !== '1') document.documentElement.dir = 'ltr'; }
} catch (_) { /* ignore */ }

function i18nWorth(s) {
  if (!s || !I18N_AR.test(s)) return false;
  const letters = (s.match(/[ء-ي]/g) || []).length;
  return letters >= 2 && s.length < 600;
}
function i18nLookup(src) {
  const k = src.trim();
  const t = I18N.dict[k];
  if (t) return src.replace(k, t);
  I18N.queue.add(k);
  clearTimeout(I18N.timer);
  I18N.timer = setTimeout(i18nFlush, 150);
  return null;
}
async function i18nFlush() {
  const list = [...I18N.queue]; I18N.queue.clear();
  if (!list.length || I18N.lang === 'ar') return;
  const lang = I18N.lang;
  let got = {};
  try { got = await api.i18nEnsure(list) || {}; } catch (_) { return; }
  if (lang !== I18N.lang) return;
  Object.assign(I18N.dict, got);
  if (Object.keys(got).length) i18nWalkSoon();
}
function i18nSkip(elm) { return !elm || (elm.closest && !!elm.closest(I18N_SKIP)); }
function i18nTextNode(n) {
  const v = n.nodeValue;
  let rec = I18N.text.get(n);
  if (rec && v === rec.out) { if (I18N.lang === 'ar') { I18N.text.delete(n); n.nodeValue = rec.src; } return; }
  if (I18N.lang === 'ar') return;
  if (!i18nWorth(v)) return;
  const p = n.parentElement;
  if (i18nSkip(p)) {
    // عنوان التبويب الفاضي «تبويب جديد» بيتترجم، وعناوين المواقع لأ
    if (!(p && p.closest('.tab .title') && v.trim() === 'تبويب جديد')) return;
  }
  const out = i18nLookup(v);
  if (out == null) return;
  I18N.text.set(n, { src: v, out });
  n.nodeValue = out;
}
function i18nElement(elm) {
  if (!elm.getAttribute) return;
  let rec = I18N.attrs.get(elm);
  for (const a of I18N_ATTRS) {
    const v = elm.getAttribute(a);
    if (v == null) continue;
    const r = rec && rec[a];
    if (r && v === r.out) { if (I18N.lang === 'ar') elm.setAttribute(a, r.src); continue; }
    if (I18N.lang === 'ar' || !i18nWorth(v) || (elm.closest && elm.closest('[translate="no"], .notr, #ntFeed, #historyList'))) continue;
    const out = i18nLookup(v);
    if (out == null) continue;
    if (!rec) { rec = {}; I18N.attrs.set(elm, rec); }
    rec[a] = { src: v, out };
    elm.setAttribute(a, out);
  }
}
function i18nApply(root) {
  if (!root) return;
  if (root.nodeType === 3) { i18nTextNode(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) i18nElement(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) i18nTextNode(n);
    else i18nElement(n);
  }
}
function i18nWalkSoon() {
  clearTimeout(I18N.walkTimer);
  I18N.walkTimer = setTimeout(() => i18nApply(document.body), 30);
}
function i18nDirection() {
  const html = document.documentElement;
  html.lang = I18N.lang;
  html.dir = I18N.rtl ? 'rtl' : 'ltr';
  document.body.classList.toggle('ltr-ui', !I18N.rtl);
  try { localStorage.setItem('uiLang', I18N.lang); localStorage.setItem('uiRtl', I18N.rtl ? '1' : '0'); } catch (_) { /* ignore */ }
}
async function i18nInit() {
  let r;
  try { r = await api.i18nGet(); } catch (_) { return; }
  if (!r) return;
  I18N.lang = r.lang; I18N.rtl = !!r.rtl; I18N.dict = r.dict || {}; I18N.langs = r.langs || [];
  i18nDirection();
  if (!I18N.obs) {
    I18N.obs = new MutationObserver((muts) => {
      if (I18N.lang === 'ar') return;
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(i18nApply);
        else if (m.type === 'characterData') i18nTextNode(m.target);
        else if (m.type === 'attributes') i18nElement(m.target);
      }
    });
    I18N.obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
  }
  i18nApply(document.body);
}
// رسايل confirm/alert/prompt بتتترجم من القاموس
for (const fn of ['confirm', 'alert', 'prompt']) {
  const orig = window[fn].bind(window);
  window[fn] = (msg, ...rest) => {
    if (I18N.lang !== 'ar' && typeof msg === 'string' && i18nWorth(msg)) { const t = i18nLookup(msg); if (t) msg = t; }
    return orig(msg, ...rest);
  };
}
api.on('i18n:changed', () => { I18N.lang = 'ar'; I18N.queue.clear(); i18nApply(document.body); i18nInit(); });
// اللغات المتاحة لصفحة الإعدادات
window.uiLanguages = () => I18N.langs;
window.uiLang = () => I18N.lang;
i18nInit();
