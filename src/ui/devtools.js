'use strict';
/* أدوات المطور («فحص») جوه النافذة على اليمين زي كروم، بدل ما تفتح في نافذة لوحدها */
function devDockEl() {
  let d = $('#devDock');
  if (d) return d;
  d = el('div', { id: 'devDock', class: 'hidden' },
    el('div', { class: 'dd-resize', title: 'اسحب لتغيير العرض' }),
    el('header', {}, el('span', {}, 'أدوات المطور'),
      el('button', { class: 'icon small2', title: 'إغلاق (F12)', onclick: () => devtoolsClose(state.active) })),
    el('div', { id: 'devDockBody' }));
  d.querySelector('header button').innerHTML = icon('close');
  $('#main').insertBefore(d, $('#content'));
  try { const w = +localStorage.getItem('devDockWidth'); if (w >= 260 && w <= 1400) d.style.width = w + 'px'; } catch (_) { /* ignore */ }
  const grip = d.querySelector('.dd-resize');
  grip.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = d.offsetWidth;
    document.body.classList.add('xp-dragging');
    const move = (ev) => { d.style.width = Math.max(260, Math.min(1400, startW - (ev.clientX - startX))) + 'px'; };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.body.classList.remove('xp-dragging');
      try { localStorage.setItem('devDockWidth', String(d.offsetWidth)); } catch (_) { /* ignore */ }
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  new ResizeObserver(() => devtoolsSync()).observe(d.querySelector('#devDockBody'));
  window.addEventListener('resize', () => devtoolsSync());
  return d;
}
function devDockBounds() {
  const r = $('#devDockBody').getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
function devtoolsSync() {
  const d = $('#devDock'); if (!d) return;
  const t = state.active;
  const on = !!(t && t.devtools && t.webview && t.wcId);
  d.classList.toggle('hidden', !on);
  api.devtoolsShow({ wcId: on ? t.wcId : -1, bounds: on ? devDockBounds() : null });
}
function devtoolsOpen(tab, opts = {}) {
  if (!tab || !tab.webview || !tab.wcId) return;
  devDockEl();
  tab.devtools = true;
  if (tab !== state.active) activate(tab);
  $('#devDock').classList.remove('hidden');
  requestAnimationFrame(() => api.devtoolsOpen({ wcId: tab.wcId, bounds: devDockBounds(), ...opts }));
}
function devtoolsClose(tab) {
  if (!tab) return;
  tab.devtools = false;
  if (tab.wcId) api.devtoolsClose(tab.wcId);
  devtoolsSync();
}
window.devtoolsOnActivate = () => devtoolsSync();
api.on('devtools:open', ({ wcId, x, y }) => {
  const t = state.tabs.find(x2 => x2.wcId === wcId);
  if (t) devtoolsOpen(t, { x, y });
});
Object.assign(commands, {
  'devtools': () => { const t = state.active; if (t) (t.devtools ? devtoolsClose(t) : devtoolsOpen(t)); },
  'devtools-console': () => { const t = state.active; if (t) devtoolsOpen(t, { console: true }); },
  'inspect': () => { const t = state.active, w = t && t.webview; if (w) devtoolsOpen(t, { x: Math.round(w.clientWidth / 2), y: Math.round(w.clientHeight / 2) }); }
});
