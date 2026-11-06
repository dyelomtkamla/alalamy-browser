'use strict';
/* صفحة السجل في تبويب لوحده (Ctrl+H) بنفس شكل chrome://history:
   بحث، تقسيم حسب اليوم، تحديد أكتر من صفحة وحذفها، «المزيد من هذا الموقع»، والتبويبات المقفولة مؤخراً. */
const hist = { all: [], list: [], shown: 0, sel: new Set(), view: 'all', built: false, timer: 0 };
const H_LOCALE = 'ar-EG-u-nu-latn';

function histDayLabel(t) {
  const d = new Date(t), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const full = d.toLocaleDateString(H_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return diff === 0 ? 'اليوم - ' + full : diff === 1 ? 'أمس - ' + full : full;
}
const histHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function buildHistoryPage() {
  const page = $('#historyPage');
  page.innerHTML = '';
  const logo = el('img', { src: 'icon.png', alt: '' });
  const search = el('input', { id: 'histSearch', type: 'search', placeholder: 'سجلّ البحث', autocomplete: 'off', spellcheck: 'false' });
  search.addEventListener('input', () => { clearTimeout(hist.timer); hist.timer = setTimeout(() => loadHistory(), 150); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; loadHistory(); } });
  const navBtn = (key, ic, label, fn) => {
    const b = el('button', { 'data-view': key, onclick: fn });
    const sp = el('span', { class: 'hicon' }); sp.innerHTML = window.icon ? window.icon(ic) : '';
    b.append(sp, el('span', {}, label));
    return b;
  };
  const nav = el('nav', { class: 'hnav' },
    navBtn('all', 'history', 'سجل العالمي', () => { hist.view = 'all'; loadHistory(); }),
    navBtn('closed', 'reset', 'التبويبات المغلقة مؤخراً', () => { hist.view = 'closed'; loadHistory(); }),
    navBtn('clear', 'trash', 'حذف بيانات التصفّح', () => run('clear-data')));
  const selbar = el('div', { id: 'histSelbar', class: 'hidden' },
    el('button', { class: 'icon', title: 'إلغاء التحديد', onclick: () => { hist.sel.clear(); drawHistory(true); } }, '✕'),
    el('span', { id: 'histSelCount' }),
    el('span', { class: 'grow' }),
    el('button', { class: 'pill', onclick: () => { hist.sel.clear(); drawHistory(true); } }, 'إلغاء'),
    el('button', { class: 'primary', onclick: removeSelectedHistory }, 'حذف'));
  const list = el('div', { id: 'histList' });
  const body = el('div', { class: 'hbody' }, selbar, list);
  body.addEventListener('scroll', () => { if (body.scrollTop + body.clientHeight > body.scrollHeight - 600) drawHistory(false); });
  page.append(
    el('header', { class: 'htop' }, el('div', { class: 'htitle' }, logo, el('span', {}, 'السجل')), el('div', { class: 'hsearch' }, search),
      el('button', { class: 'icon hclose', title: 'إغلاق (Ctrl+W)', onclick: () => closeTab(state.active) }, '✕')),
    el('div', { class: 'hmain' }, nav, body));
  hist.built = true;
}

async function loadHistory() {
  if (!hist.built) buildHistoryPage();
  for (const b of document.querySelectorAll('#historyPage .hnav button')) b.classList.toggle('active', b.dataset.view === hist.view);
  const q = ($('#histSearch').value || '').trim();
  if (hist.view === 'closed') hist.all = state.closed.slice().reverse().map(c => ({ url: c.url, title: c.title, time: c.time, closed: c }));
  else { try { hist.all = await api.listHistory(q); } catch { hist.all = []; } }
  hist.sel.clear();
  drawHistory(true);
}

function drawHistory(reset) {
  const list = $('#histList'); if (!list) return;
  if (reset) { list.innerHTML = ''; hist.shown = 0; list.parentElement.scrollTop = 0; }
  const bar = $('#histSelbar');
  bar.classList.toggle('hidden', !hist.sel.size);
  $('#histSelCount').textContent = `تم تحديد ${hist.sel.size}`;
  if (reset && !hist.all.length) {
    list.append(el('div', { class: 'hempty' }, hist.view === 'closed' ? 'مفيش تبويبات مقفولة مؤخراً' : ($('#histSearch').value ? 'مفيش نتايج للبحث ده' : 'السجل فاضي')));
    return;
  }
  const end = Math.min(hist.all.length, hist.shown + 200);
  if (hist.shown >= end) return;
  let card = list.lastElementChild && list.lastElementChild.classList.contains('hcard') ? list.lastElementChild : null;
  for (let i = hist.shown; i < end; i++) {
    const h = hist.all[i];
    const label = histDayLabel(h.time);
    if (!card || card.dataset.day !== label) {
      card = el('section', { class: 'hcard' }, el('h3', {}, label));
      card.dataset.day = label;
      list.append(card);
    }
    card.append(historyRow(h));
  }
  hist.shown = end;
}

function historyRow(h) {
  const key = h.time;
  const cb = el('input', { type: 'checkbox', title: 'تحديد', ...(hist.sel.has(key) ? { checked: '' } : {}) });
  cb.addEventListener('change', () => { cb.checked ? hist.sel.add(key) : hist.sel.delete(key); $('#histSelbar').classList.toggle('hidden', !hist.sel.size); $('#histSelCount').textContent = `تم تحديد ${hist.sel.size}`; row.classList.toggle('sel', cb.checked); });
  const fav = el('img', { class: 'hfav', src: faviconFor(h.url), alt: '' });
  fav.onerror = () => fav.replaceWith(el('span', { class: 'hfav ph' }));
  const host = histHost(h.url);
  const title = el('a', { class: 'htt', href: '#', title: h.url }, h.title || h.url);
  const open = (e) => {
    e.preventDefault();
    if (h.closed) { const i = state.closed.indexOf(h.closed); if (i >= 0) { reopenClosedTab(i); loadHistory(); return; } }
    if (e.ctrlKey || e.metaKey || e.button === 1) createTab({ url: h.url, background: true, index: state.tabs.indexOf(state.active) + 1 });
    else if (e.shiftKey) api.newWindow({ url: h.url });
    else navigate(h.url);
  };
  title.addEventListener('click', open);
  title.addEventListener('auxclick', (e) => { if (e.button === 1) open(e); });
  const dom = el('button', { class: 'hdom', title: 'المزيد من هذا الموقع', onclick: () => { $('#histSearch').value = host; hist.view = 'all'; loadHistory(); } }, host);
  const more = el('button', { class: 'icon hmore', title: 'إجراءات أخرى' }, '⋮');
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePopups();
    const m = $('#profileMenu'); m.innerHTML = '';
    m.append(
      el('button', { onclick: () => { hidePopups(); $('#histSearch').value = host; hist.view = 'all'; loadHistory(); } }, 'المزيد من هذا الموقع'),
      el('button', { onclick: () => { hidePopups(); createTab({ url: h.url, background: true }); toast('اتفتحت في تبويب جديد'); } }, 'فتح في تبويب جديد'),
      el('button', { onclick: async () => { hidePopups(); await navigator.clipboard.writeText(h.url).catch(() => {}); toast('تم نسخ الرابط'); } }, 'نسخ الرابط'),
      h.closed ? null : el('button', { onclick: async () => { hidePopups(); await api.removeHistory(h.time); row.remove(); hist.all = hist.all.filter(x => x !== h); } }, 'إزالة من السجل'));
    const r = more.getBoundingClientRect();
    m.style.width = '220px';
    placePopup(m, r.left, r.bottom + 2);
  });
  const time = el('span', { class: 'htime' }, new Date(h.time).toLocaleTimeString(H_LOCALE, { hour: 'numeric', minute: '2-digit' }));
  const row = el('div', { class: 'hrow' + (hist.sel.has(key) ? ' sel' : '') }, h.closed ? el('span', { class: 'hcbspace' }) : cb, time, fav, el('div', { class: 'hmid' }, title, dom), more);
  return row;
}

async function removeSelectedHistory() {
  const times = [...hist.sel];
  if (!times.length) return;
  if (!confirm(`حذف ${times.length} صفحة من السجل؟`)) return;
  await api.removeHistory(times);
  toast(`اتحذف ${times.length} من السجل`);
  loadHistory();
}

// بيتنادى من activate() في renderer.js: يظهر صفحة السجل لما التبويب الحالي هو alalamy://history
function showInternalPage(url) {
  const page = $('#historyPage');
  if (!page) return;
  const show = url === HISTORY_URL;
  const was = !page.classList.contains('hidden');
  page.classList.toggle('hidden', !show);
  if (show && !was) { loadHistory(); setTimeout(() => { const s = $('#histSearch'); if (s) s.focus(); }, 0); }
}
