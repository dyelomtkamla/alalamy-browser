'use strict';
/* قفل أي حاجة مفتوحة في المتصفح: كل قايمة أو لوحة ليها ✕، و Esc بيقفل اللي فوق، والضغط برّه (حتى جوه الصفحة) بيقفل القوايم. */

function visible(sel) { const e = typeof sel === 'string' ? $(sel) : sel; return !!(e && !e.classList.contains('hidden') && e.getClientRects().length > 0); }
function anyPopupOpen() { return [...document.querySelectorAll('.popup')].some(p => !p.classList.contains('hidden')); }
function closeAllPopups() {
  hidePopups();
  if (typeof hideTranslateMenu === 'function') hideTranslateMenu();
  if (typeof hideVideoMenu === 'function' && visible('#videoMenu')) hideVideoMenu();
  for (const p of document.querySelectorAll('.popup')) p.classList.add('hidden');
}

// بيقفل طبقة واحدة (اللي فوق) ويرجع true لو قفل حاجة
function closeTopLayer() {
  const ask = [...document.querySelectorAll('.askOverlay')].pop();
  if (ask) { ask.click(); if (document.body.contains(ask)) ask.remove(); return true; }
  const dlg = $('#clientDialog');
  if (dlg) { dlg.remove(); return true; }
  const ov = [...document.querySelectorAll('.qrOverlay, .modal-ov')].pop();
  if (ov) { ov.remove(); return true; }
  if (anyPopupOpen()) { closeAllPopups(); return true; }
  if (visible('#suggestions')) { hideSuggestions(); $('#address').blur(); return true; }
  if (visible('#findbar')) { closeFind(); return true; }
  if (state.panel) { closePanel(); return true; }
  if (visible('#settingsPage')) { closeSettingsPage(); return true; }
  if (visible('#reader') && typeof closeReader === 'function') { closeReader(); return true; }
  if (visible('#learnpanel') && $('#lpClose')) { $('#lpClose').click(); return true; }
  if (visible('#sidepanel') && $('#spClose')) { $('#spClose').click(); return true; }
  if (visible('#trbar') && $('#trClose')) { $('#trClose').click(); return true; }
  if (visible('#crashbar') && $('#crashDismiss')) { $('#crashDismiss').click(); return true; }
  return false;
}

let lastEsc = 0;
// Esc جوه واجهة المتصفح نفسها
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (closeTopLayer()) { lastEsc = Date.now(); e.preventDefault(); e.stopPropagation(); }
}, true);
// Esc من جوه الصفحة (بيوصل كأمر)، أو من الواجهة لو ماكانش فيه حاجة اتقفلت فوق
commands.escape = () => {
  if (Date.now() - lastEsc < 400) return;
  if (closeTopLayer()) return;
  const t = state.active;
  if (t && t.loading && t.webview) t.webview.stop();
};

// الضغط جوه الصفحة نفسها (الـ webview) مش بيوصل لـ document، فبنقفل القوايم لما الصفحة تاخد الفوكس
const KEEP_PANELS = new Set(['recorder', 'camera']);
function onPageFocused(t) {
  closeAllPopups();
  hideSuggestions();
  // اللوحة الجانبية (التنزيلات، المفضلة...) بتتقفل لما تضغط في الصفحة، زي فقاعات كروم
  if (state.panel && !KEEP_PANELS.has(state.panel) && t.closest('#content')) closePanel();
}
document.addEventListener('focusin', (e) => { if (e.target && e.target.tagName === 'WEBVIEW') onPageFocused(e.target); }, true);
// الضغط جوه الصفحة بيخلّي نافذة الواجهة تفقد التركيز (blur) والفوكس يروح للـ webview
window.addEventListener('blur', () => setTimeout(() => {
  const a = document.activeElement;
  if (a && a.tagName === 'WEBVIEW') onPageFocused(a);
  else if (!document.hasFocus()) closeAllPopups(); // دوست على برنامج تاني
}, 0));

// ✕ في كل قايمة منبثقة
function addPopupClose(p) {
  if (!p || p.querySelector(':scope > .popclose')) return;
  const b = el('button', { class: 'popclose', title: 'إغلاق (Esc)', type: 'button' }, '✕');
  b.addEventListener('click', (e) => { e.stopPropagation(); closeAllPopups(); });
  p.prepend(b);
}
// لو الصفحة ماسكة الفوكس وقت ما القايمة اتفتحت (من اختصار كيبورد مثلاً)، الضغطة الجاية على الصفحة مش هتطلع focus،
// فبنشيل الفوكس من الصفحة أول ما أي قايمة أو لوحة تظهر علشان الضغطة عليها تقفلها
function releasePageFocus() {
  const a = document.activeElement;
  if (a && a.tagName === 'WEBVIEW' && a.closest('#content')) a.blur();
}
for (const p of document.querySelectorAll('.popup')) {
  addPopupClose(p);
  new MutationObserver(() => { if (!p.classList.contains('hidden')) { addPopupClose(p); releasePageFocus(); } }).observe(p, { childList: true, attributes: true, attributeFilter: ['class'] });
}
new MutationObserver(() => { if (!$('#panel').classList.contains('hidden')) releasePageFocus(); }).observe($('#panel'), { attributes: true, attributeFilter: ['class'] });
