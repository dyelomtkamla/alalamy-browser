'use strict';
/* استعادة الجلسة زي كروم: شريط «استعادة الصفحات؟» بعد التعطل، قايمة «المغلقة مؤخراً» في السجل،
   ودليل اختصارات لوحة المفاتيح (Ctrl+/ أو F1) */

applyIcons($('#crashbar'));
$('#crashRestore').addEventListener('click', async () => {
  hideCrashBar();
  const r = await api.reopenClosed({ force: 'session' });
  if (r && r.done === 'session') toast(r.windows > 1 ? `رجّعنا ${r.windows} نوافذ بكل تبويباتها` : 'رجّعنا التبويبات اللي كانت مفتوحة');
});
$('#crashDismiss').addEventListener('click', () => { hideCrashBar(); api.dismissCrash(); toast('تقدر ترجّعها في أي وقت بـ Ctrl+Shift+T'); });

/* ---- المغلقة مؤخراً (جوه قايمة السجل زي كروم) ---- */
function fmtAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'دلوقتي';
  if (m < 60) return `من ${m} دقيقة`;
  const h = Math.round(m / 60);
  return h < 24 ? `من ${h} ساعة` : `من ${Math.round(h / 24)} يوم`;
}
async function renderRecentClosed() {
  const box = $('#recentClosed');
  if (!box) return;
  box.innerHTML = '';
  if (INCOGNITO_WIN) return;
  let info = { windows: [], canRestore: false };
  try { info = await api.recentClosed(); } catch { /* ignore */ }
  const rows = [];
  for (let i = state.closed.length - 1; i >= 0 && rows.length < 8; i--) {
    const c = state.closed[i];
    rows.push({ time: c.time, el: el('button', { class: 'recent', title: c.url, onclick: () => { hidePopups(); reopenClosedTab(i); } },
      el('img', { src: faviconFor(c.url), onerror: (e) => { e.target.style.visibility = 'hidden'; } }),
      el('span', { class: 'rt' }, c.title || c.url), el('small', {}, fmtAgo(c.time))) });
  }
  for (const w of info.windows || []) {
    rows.push({ time: w.time, el: el('button', { class: 'recent', onclick: () => { hidePopups(); api.reopenWindow(w.i); } },
      el('i', { 'data-icon': 'newwin' }), el('span', { class: 'rt' }, `نافذة فيها ${w.count} تبويب${w.title ? ' — ' + w.title : ''}`), el('small', {}, fmtAgo(w.time))) });
  }
  rows.sort((a, b) => b.time - a.time);
  if (info.canRestore) {
    rows.unshift({ el: el('button', { class: 'recent strong', onclick: () => { hidePopups(); run('restore-session'); } },
      el('i', { 'data-icon': 'reset' }), el('span', { class: 'rt' }, `استعادة الجلسة السابقة (${info.lastCount} تبويب)`), el('kbd', {}, 'Ctrl+Shift+T')) });
  }
  if (!rows.length) return;
  box.append(el('hr'), el('div', { class: 'subhead' }, 'المغلقة مؤخراً'), ...rows.slice(0, 10).map(r => r.el));
  applyIcons(box);
}
$('#menu').addEventListener('mouseover', (e) => { const b = e.target.closest('[data-sub="history"]'); if (b && !b.classList.contains('open')) renderRecentClosed(); });
$('#menu').addEventListener('click', (e) => { if (e.target.closest('[data-sub="history"]')) renderRecentClosed(); });

/* ---- دليل الاختصارات ---- */
const SHORTCUTS = [
  ['التبويبات والنوافذ', [
    ['Ctrl+T', 'تبويب جديد'], ['Ctrl+Shift+T', 'رجّع آخر تبويب اتقفل — وبعد قفل المتصفح أو قطع الكهربا بيرجّع كل النوافذ والتبويبات'],
    ['Ctrl+W / Ctrl+F4', 'قفل التبويب'], ['Ctrl+N', 'نافذة جديدة'], ['Ctrl+Shift+N', 'نافذة تصفح متخفي'], ['Ctrl+Shift+W', 'قفل النافذة'],
    ['Ctrl+Tab / Ctrl+PgDn', 'التبويب اللي بعده'], ['Ctrl+Shift+Tab / Ctrl+PgUp', 'التبويب اللي قبله'], ['Ctrl+1 … Ctrl+8', 'روح لتبويب برقمه'], ['Ctrl+9', 'آخر تبويب'],
    ['Ctrl+Shift+PgUp / PgDn', 'حرّك التبويب'], ['Ctrl+Shift+A', 'البحث في التبويبات'], ['Ctrl+Shift+M', 'التبديل بين العملاء'], ['Shift+Esc', 'مدير المهام']]],
  ['التصفح', [
    ['Alt+← / Alt+→', 'رجوع / تقدم'], ['Alt+Home', 'الصفحة الرئيسية'], ['F5 / Ctrl+R', 'إعادة تحميل'], ['Ctrl+F5 / Shift+F5 / Ctrl+Shift+R', 'إعادة تحميل من غير الكاش'],
    ['Esc', 'إيقاف التحميل'], ['Ctrl+L / Alt+D / F6', 'شريط العنوان'], ['Ctrl+K / Ctrl+E', 'بحث من شريط العنوان'], ['Ctrl+Enter', 'يكمّل www. و .com'],
    ['Alt+Enter', 'افتح اللي كتبته في تبويب جديد'], ['Ctrl+O', 'فتح ملف من الجهاز'], ['F11', 'ملء الشاشة']]],
  ['الصفحة', [
    ['Ctrl+F', 'بحث في الصفحة'], ['F3 / Ctrl+G', 'النتيجة اللي بعدها'], ['Shift+F3 / Ctrl+Shift+G', 'النتيجة اللي قبلها'], ['Ctrl+P', 'طباعة'], ['Ctrl+S', 'حفظ الصفحة'],
    ['Ctrl+ + / Ctrl+ - / Ctrl+0', 'تكبير / تصغير / الحجم الطبيعي'], ['Ctrl+U', 'مصدر الصفحة'], ['F12 / Ctrl+Shift+I', 'أدوات المطور'], ['Ctrl+Shift+J', 'الكونسول'], ['Ctrl+Shift+C', 'فحص عنصر'],
    ['F9 / Alt+Shift+R', 'وضع القراءة'], ['Ctrl+Shift+S', 'لقطة شاشة']]],
  ['المفضلة والسجل', [
    ['Ctrl+D', 'إضافة الصفحة للمفضلة'], ['Ctrl+Shift+D', 'كل التبويبات للمفضلة'], ['Ctrl+Shift+B', 'إظهار/إخفاء شريط المفضلة'], ['Ctrl+Shift+O', 'إدارة المفضلة'],
    ['Ctrl+H', 'السجل'], ['Ctrl+J', 'التنزيلات'], ['Ctrl+Shift+Delete', 'حذف بيانات التصفح'], ['Alt+F / Alt+E / F10', 'القائمة'], ['F1 / Ctrl+/', 'الدليل ده']]]
];
panels.shortcuts = (body) => {
  const search = el('input', { class: 'search', placeholder: 'دوّر على اختصار...' });
  const list = el('div', { class: 'kbdlist' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = '';
    for (const [group, items] of SHORTCUTS) {
      const shown = items.filter(([k, d]) => !q || (k + ' ' + d).toLowerCase().includes(q));
      if (!shown.length) continue;
      list.append(el('h4', {}, group), ...shown.map(([k, d]) => el('div', { class: 'kbdrow' }, el('span', {}, d), el('kbd', { dir: 'ltr' }, k))));
    }
  };
  search.addEventListener('input', draw);
  body.append(el('p', { class: 'note' }, 'نفس اختصارات جوجل كروم بالظبط، وبتشتغل والكيبورد عربي كمان.'), search, list);
  draw();
  setTimeout(() => search.focus(), 50);
};
panelTitles.shortcuts = 'اختصارات لوحة المفاتيح';
Object.assign(commands, {
  'shortcuts-help': () => openPanel('shortcuts'),
  'restore-session': async () => {
    const r = await api.reopenClosed({ force: 'session' });
    hideCrashBar();
    if (r && r.done === 'session') toast(r.windows > 1 ? `رجّعنا ${r.windows} نوافذ بكل تبويباتها` : 'رجّعنا التبويبات اللي كانت مفتوحة');
    else toast('مفيش جلسة سابقة نرجّعها');
  }
});

/* Ctrl+Enter في شريط العنوان: يكمّل www. و .com زي كروم */
$('#address').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.ctrlKey) return;
  const v = $('#address').value.trim();
  if (!v || /[\s./:]/.test(v)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  $('#address').blur();
  navigate('https://www.' + v + '.com/');
}, true);
