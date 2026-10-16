'use strict';
/* متصفح العالمي - واجهة المستخدم: التبويبات، التصفح الخفي، السجل، المفضلة، التنزيلات، كلمات المرور */
const $ = (s) => document.querySelector(s);
// window.api يأتي من ui-preload.js

const NEWTAB = 'alalamy://newtab';

const state = {
  tabs: [], active: null, profiles: [], bookmarks: [], settings: {}, closed: [],
  grid: false, downloads: new Map(), pendingPw: null, nextId: 1
};

/* ---------------- أدوات ---------------- */
function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('hidden'), 2600);
}
function faviconFor(url) {
  try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`; } catch { return ''; }
}
function fmtBytes(n) {
  if (!n) return '0';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}
function profileById(id) { return state.profiles.find(p => p.id === id); }
// المتصفح بقى بحساب واحد (زي كروم) + التصفح الخفي
function defaultProfile() { return profileById('default') || state.profiles[0]; }
function profileForTab(tab) {
  if (tab.temp) return { id: tab.partition, name: tab.tempName || 'خفي 🕶', color: '#3c4043', partition: tab.partition };
  return defaultProfile();
}
function randomId() { return Math.random().toString(36).slice(2, 10); }

async function toURL(input) {
  const s = input.trim();
  if (!s) return null;
  if (s === NEWTAB) return NEWTAB;
  if (/^(https?|file|about|data|view-source):/i.test(s)) return s;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(s) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(s)) return 'http://' + s;
  if (!/\s/.test(s) && /^[^\s/]+\.[a-z؀-ۿ]{2,}(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
  return api.searchURL(s);
}

/* ---------------- التبويبات ---------------- */
function createTab({ url = NEWTAB, profileId, temp = false, partition, background = false, index, lazy = false, tempName } = {}) {
  const tab = { id: state.nextId++, url, title: 'تبويب جديد', favicon: '', loading: false, webview: null, zoom: typeof defaultZoomLevel === 'function' ? defaultZoomLevel() : 0, temp, tempName };
  if (temp) tab.partition = partition || 'temp_' + randomId();
  else {
    // كل التبويبات العادية على الحساب الرئيسي، إلا لو صفحة مفتوحة من جلسة قديمة (نافذة منبثقة) طلبت جلستها
    const p = (partition && state.profiles.find(x => x.partition === partition)) || defaultProfile();
    tab.profileId = p.id; tab.partition = p.partition;
  }
  if (partition && partition.startsWith('temp_')) { tab.temp = true; tab.partition = partition; delete tab.profileId; }

  tab.tabEl = el('div', { class: 'tab', draggable: 'true' });
  const badge = el('span', { class: 'badge' });
  const icon = el('span', { class: 'ph' });
  const title = el('span', { class: 'title' }, tab.title);
  const close = el('button', { class: 'close', title: 'إغلاق (Ctrl+W)' }, '✕');
  const spin = el('span', { class: 'spin' });
  const audio = el('button', { class: 'audio', title: 'كتم / تشغيل الصوت' });
  audio.innerHTML = window.icon ? window.icon('volume') : '🔊';
  audio.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(tab); });
  tab.tabEl.append(spin, icon, title, audio, badge, close);
  tab.ui = { badge, icon, title, audio };
  tab.tabEl.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab); } });
  tab.tabEl.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabMenu(tab, e.clientX, e.clientY); });
  tab.tabEl.addEventListener('click', (e) => { if (e.target !== close && !audio.contains(e.target)) activate(tab); });
  close.addEventListener('click', () => closeTab(tab));
  tab.tabEl.addEventListener('dragstart', () => { state.dragging = tab; tab.tabEl.classList.add('dragging'); });
  tab.tabEl.addEventListener('dragend', () => { tab.tabEl.classList.remove('dragging'); state.dragging = null; saveSession(); });
  tab.tabEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const d = state.dragging; if (!d || d === tab) return;
    const from = state.tabs.indexOf(d), to = state.tabs.indexOf(tab);
    state.tabs.splice(from, 1); state.tabs.splice(to, 0, d);
    $('#tabs').insertBefore(d.tabEl, from < to ? tab.tabEl.nextSibling : tab.tabEl);
  });

  if (typeof index === 'number') {
    state.tabs.splice(index, 0, tab);
    $('#tabs').insertBefore(tab.tabEl, $('#tabs').children[index] || null);
  } else {
    state.tabs.push(tab);
    $('#tabs').append(tab.tabEl);
  }
  renderTabBadge(tab);
  if (url !== NEWTAB) {
    if (lazy && background) markSleeping(tab);
    else ensureWebview(tab, url);
  }
  if (!background || !state.active) activate(tab);
  layoutGrid();
  saveSession();
  return tab;
}

function renderTabBadge(tab) {
  const p = profileForTab(tab);
  tab.ui.badge.textContent = tab.temp ? p.name : '';
  tab.ui.badge.style.background = p.color;
  tab.ui.badge.classList.toggle('hidden', !tab.temp);
  tab.tabEl.classList.toggle('incognito', !!tab.temp);
}

/* ---------------- تنويم التبويبات: الحساب يبقى مسجلاً لكن الصفحة لا تستهلك ذاكرة ---------------- */
function markSleeping(tab) {
  tab.sleeping = true;
  tab.tabEl.classList.add('sleeping');
  if (tab.title === 'تبويب جديد') {
    try { tab.title = new URL(tab.url).hostname; } catch { /* ignore */ }
    tab.ui.title.textContent = tab.title;
  }
  tab.tabEl.title = tab.title + ' (نائم — اضغط لتحميله)';
}
function sleepTab(tab) {
  if (!tab.webview || tab === state.active || tab.url === NEWTAB) return false;
  tab.webview.remove();
  tab.webview = null; tab.ready = false; tab.loading = false;
  tab.tabEl.classList.remove('loading');
  markSleeping(tab);
  layoutGrid();
  return true;
}
function wakeTab(tab) {
  if (!tab.sleeping) return;
  tab.sleeping = false;
  tab.tabEl.classList.remove('sleeping');
  ensureWebview(tab, tab.url);
  layoutGrid();
}
function sleepInactive(all = false) {
  const mins = Number(state.settings.sleepMinutes ?? 30);
  if (!all && !mins) return 0;
  const limit = Date.now() - mins * 60000;
  let n = 0;
  for (const t of state.tabs) {
    if (t === state.active || !t.webview) continue;
    if (state.grid && !all) continue; // في العرض الشبكي الحسابات المعروضة لا تُنوّم تلقائياً
    if (all || (t.lastActive || 0) < limit) if (sleepTab(t)) n++;
  }
  return n;
}
setInterval(() => sleepInactive(false), 60000);

function ensureWebview(tab, url) {
  if (tab.webview) { tab.webview.src = url; return; }
  const wv = document.createElement('webview');
  wv.setAttribute('partition', tab.partition);
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=yes, spellcheck=yes');
  wv.src = url;
  tab.webview = wv;
  tab.url = url;

  wv.addEventListener('dom-ready', () => {
    tab.ready = true;
    tab.wcId = wv.getWebContentsId();
    if (tab.zoom) wv.setZoomLevel(tab.zoom);
    if (tab === state.active) updateNav();
    if (typeof onTabReady === 'function') onTabReady(tab);
  });
  wv.addEventListener('did-start-loading', () => { tab.loading = true; tab.tabEl.classList.add('loading'); if (tab === state.active) updateNav(); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; tab.tabEl.classList.remove('loading'); if (tab === state.active) updateNav(); });
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title; tab.ui.title.textContent = e.title; tab.tabEl.title = e.title;
    if (tab === state.active) document.title = e.title + ' - متصفح العالمي';
    if (!tab.temp) api.updateHistoryTitle({ url: tab.url, title: e.title });
  });
  wv.addEventListener('page-favicon-updated', (e) => {
    if (!e.favicons.length) return;
    tab.favicon = e.favicons[0];
    const img = el('img', { src: tab.favicon });
    img.onerror = () => img.replaceWith(el('span', { class: 'ph' }));
    tab.ui.icon.replaceWith(img); tab.ui.icon = img;
  });
  const onNav = (e) => {
    if (e.isMainFrame === false) return;
    if (e.type === 'did-navigate') {
      try { tab.title = new URL(e.url).hostname || e.url; } catch { tab.title = e.url; }
      tab.ui.title.textContent = tab.title;
    }
    tab.url = e.url;
    if (tab === state.active) updateNav();
    if (!tab.temp && /^https?:/.test(e.url)) api.addHistory({ url: e.url, title: tab.title });
    saveSession();
  };
  wv.addEventListener('did-navigate', onNav);
  wv.addEventListener('did-navigate-in-page', onNav);
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    tab.title = 'تعذر فتح الصفحة'; tab.ui.title.textContent = tab.title;
  });
  wv.addEventListener('found-in-page', (e) => {
    const r = e.result;
    if (r.finalUpdate) $('#findCount').textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : 'لا نتائج';
  });
  wv.addEventListener('media-started-playing', () => tab.tabEl.classList.add('playing'));
  wv.addEventListener('media-paused', () => tab.tabEl.classList.remove('playing'));
  wv.addEventListener('enter-html-full-screen', () => document.body.classList.add('fs'));
  wv.addEventListener('leave-html-full-screen', () => document.body.classList.remove('fs'));
  wv.addEventListener('focus', () => { if (state.grid && state.active !== tab) activate(tab); });
  $('#content').append(wv);
  if (tab !== state.active) freezeHiddenTabs();
}

function activate(tab) {
  if (!tab) return;
  if (typeof closeSettingsPage === 'function') closeSettingsPage();
  if (state.active) state.active.lastActive = Date.now();
  state.active = tab;
  tab.lastActive = Date.now();
  if (tab.sleeping) wakeTab(tab);
  for (const t of state.tabs) {
    t.tabEl.classList.toggle('active', t === tab);
    if (t.webview) t.webview.classList.toggle('active', t === tab);
  }
  freezeHiddenTabs();
  $('#newtab').classList.toggle('hidden', !!tab.webview);
  tab.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.title = (tab.webview ? tab.title : 'تبويب جديد') + ' - متصفح العالمي';
  updateNav();
  if (typeof onTabActivated === 'function') onTabActivated(tab);
  if (!tab.webview) { renderSpeedDial(); setTimeout(() => $('#ntInput').focus(), 0); }
  else if (!state.grid) setTimeout(() => tab.webview && tab.webview.focus(), 0);
  saveSession();
}

function toggleMute(tab) {
  if (!tab.webview) return;
  const m = !tab.webview.isAudioMuted();
  tab.webview.setAudioMuted(m);
  tab.tabEl.classList.toggle('muted', m);
  tab.ui.audio.innerHTML = icon(m ? 'muted' : 'volume');
}

/* ---------------- قوائم التبويبات ---------------- */
function placePopup(m, x, y) {
  m.classList.remove('hidden');
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
  m.style.right = 'auto';
}
function closeMany(list) {
  for (const t of list) closeTab(t);
}
function showTabMenu(tab, x, y) {
  hidePopups();
  const m = $('#profileMenu');
  m.innerHTML = '';
  const others = state.tabs.filter(t => t !== tab);
  m.append(
    el('button', { onclick: () => { hidePopups(); closeTab(tab); } }, '✕ إغلاق التبويب'),
    el('button', { onclick: () => { hidePopups(); closeMany(others); } }, `إغلاق التبويبات الأخرى (${others.length})`),
    el('button', { onclick: () => { hidePopups(); closeMany([...state.tabs]); } }, `إغلاق كل التبويبات (${state.tabs.length})`),
    el('hr'),
    el('button', { onclick: () => { hidePopups(); if (tab.webview) tab.webview.reload(); else activate(tab); } }, '⟳ إعادة تحميل'),
    el('button', { onclick: () => { hidePopups(); createTab({ url: tab.url, profileId: tab.profileId, temp: tab.temp, index: state.tabs.indexOf(tab) + 1 }); } }, 'تكرار التبويب'),
    el('button', { onclick: () => { hidePopups(); toggleMute(tab); } }, tab.tabEl.classList.contains('muted') ? '🔊 تشغيل صوت التبويب' : '🔇 كتم صوت التبويب'),
    el('button', { onclick: () => { hidePopups(); if (!sleepTab(tab)) toast('لا يمكن تنويم التبويب النشط'); } }, '💤 تنويم التبويب'));
  placePopup(m, x, y);
}
function showTabList(anchor) {
  hidePopups();
  const m = $('#profileMenu');
  m.innerHTML = '';
  const search = el('input', { placeholder: `بحث في ${state.tabs.length} تبويب...`, style: 'margin:4px 12px 6px;width:calc(100% - 24px);padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--input)' });
  const list = el('div');
  const draw = () => {
    list.innerHTML = '';
    const q = search.value.toLowerCase();
    for (const t of state.tabs) {
      const p = profileForTab(t);
      if (q && !(t.title + ' ' + t.url).toLowerCase().includes(q)) continue;
      const row = el('button', { style: t === state.active ? 'font-weight:600' : '' },
        el('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, `${t.temp ? '🕶 ' : ''}${t.sleeping ? '💤 ' : ''}${t.title}`),
        el('span', { class: 'rowclose', title: 'إغلاق' }, '✕'));
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('rowclose')) { e.stopPropagation(); closeTab(t); draw(); return; }
        hidePopups(); activate(t);
      });
      list.append(row);
    }
  };
  search.addEventListener('input', draw);
  search.addEventListener('click', (e) => e.stopPropagation());
  m.append(search, list,
    el('hr'),
    el('button', { onclick: () => { hidePopups(); closeMany(state.tabs.filter(t => t !== state.active)); } }, 'إغلاق كل التبويبات ما عدا الحالي'));
  draw();
  const r = anchor.getBoundingClientRect();
  m.style.width = '360px';
  placePopup(m, r.left, r.bottom + 4);
  search.focus();
}

function closeTab(tab) {
  const i = state.tabs.indexOf(tab);
  if (i < 0) return;
  if (/^https?:/.test(tab.url) && !tab.temp) {
    state.closed.push({ url: tab.url, profileId: tab.profileId, index: i });
  }
  state.tabs.splice(i, 1);
  tab.tabEl.remove();
  if (tab.webview) tab.webview.remove();
  if (!state.tabs.length) { createTab({ profileId: tab.profileId }); return; }
  if (state.active === tab) activate(state.tabs[Math.min(i, state.tabs.length - 1)]);
  layoutGrid();
  saveSession();
}

async function navigate(input, tab = state.active) {
  const url = await toURL(input);
  if (!url || !tab) return;
  hideSuggestions();
  if (url === NEWTAB) {
    if (tab.webview) { tab.webview.remove(); tab.webview = null; }
    tab.url = NEWTAB; tab.title = 'تبويب جديد'; tab.ui.title.textContent = tab.title;
  } else {
    ensureWebview(tab, url);
  }
  activate(tab);
}

function updateNav() {
  const tab = state.active; if (!tab) return;
  document.body.classList.toggle('incognito', !!tab.temp);
  if (typeof updateVideoBtn === 'function') updateVideoBtn();
  $('#ntIncognito').classList.toggle('hidden', !tab.temp);
  const wv = tab.webview, ready = wv && tab.ready;
  $('#backBtn').disabled = !(ready && wv.canGoBack());
  $('#fwdBtn').disabled = !(ready && wv.canGoForward());
  // زي كروم: علامة التحميل بتلف على أيقونة التبويب، وزرار التحديث بيبقى ✕ للإيقاف
  const rl = tab.loading ? 'close' : 'reload';
  if ($('#reloadBtn').dataset.state !== rl) { $('#reloadBtn').dataset.state = rl; $('#reloadBtn').innerHTML = icon(rl); $('#reloadBtn').title = tab.loading ? 'إيقاف التحميل' : 'إعادة تحميل (F5)'; }
  if (document.activeElement !== $('#address')) $('#address').value = tab.url === NEWTAB ? '' : tab.url;
  const secure = /^https:/.test(tab.url);
  $('#secureIcon').innerHTML = icon(tab.url === NEWTAB ? 'search' : (secure ? 'lock' : 'info'));
  $('#secureIcon').title = secure ? 'الاتصال آمن' : '';
  $('#starBtn').classList.toggle('on', state.bookmarks.some(b => b.url === tab.url));
  $('#starBtn').innerHTML = icon(state.bookmarks.some(b => b.url === tab.url) ? 'star-on' : 'star');
}

let sessionTimer = null;
function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    const tabs = state.tabs.filter(t => !t.temp).map(t => ({ url: t.url, profileId: t.profileId }));
    const active = Math.max(0, state.tabs.filter(t => !t.temp).indexOf(state.active));
    api.saveSession({ tabs, active });
  }, 500);
}

/* ---------------- العرض الشبكي (كل الحسابات أمامك في نفس الوقت) ---------------- */
// التبويبات المخفية بتتثبت على مقاسها، علشان لما تكبّر أو تصغّر النافذة يتعاد رسم التبويب
// اللي قدامك بس، مش كل التبويبات المفتوحة (ده كان سبب اللاك وقت التكبير والتصغير)
function freezeHiddenTabs() {
  const c = $('#content');
  const w = c.clientWidth, h = c.clientHeight;
  for (const t of state.tabs) {
    const wv = t.webview;
    if (!wv) continue;
    if (state.grid || t === state.active || !w || !h) { wv.style.width = wv.style.height = ''; continue; }
    if (!wv.style.width) { wv.style.width = w + 'px'; wv.style.height = h + 'px'; }
  }
}
function layoutGrid() {
  const c = $('#content');
  c.classList.toggle('grid', state.grid);
  freezeHiddenTabs();
  if (!state.grid) { c.style.gridTemplateColumns = c.style.gridTemplateRows = ''; return; }
  const n = Math.max(1, state.tabs.filter(t => t.webview).length);
  const cols = Math.ceil(Math.sqrt(n * (c.clientWidth / Math.max(c.clientHeight, 1)) / 1.4)) || 1;
  const rows = Math.ceil(n / cols);
  c.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  c.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  // ترتيب الشبكة حسب ترتيب التبويبات (عبر CSS order؛ نقل عنصر webview في الصفحة يعيد تحميله)
  state.tabs.forEach((t, i) => { if (t.webview) t.webview.style.order = i; });
}
function toggleGrid(force) {
  state.grid = typeof force === 'boolean' ? force : !state.grid;
  layoutGrid();
  if (!state.grid && state.active) activate(state.active);
  saveSession();
}
// وقت تغيير المقاس: نوقف الحركات والظلال لحد ما المقاس يثبت، ونعيد ترتيب الشبكة مرة واحدة لكل فريم
let resizeFrame = 0, resizeTimer = 0;
window.addEventListener('resize', () => {
  document.body.classList.add('resizing');
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => document.body.classList.remove('resizing'), 200);
  if (state.grid && !resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; layoutGrid(); });
});

/* ---------------- شريط العنوان والاقتراحات ---------------- */
let sugSel = -1, sugItems = [];
async function showSuggestions(q) {
  const box = $('#suggestions');
  if (!q.trim()) return hideSuggestions();
  sugItems = [{ search: true, title: q }, ...(await api.suggest(q))];
  sugSel = -1;
  box.innerHTML = '';
  sugItems.forEach((s, i) => {
    const row = s.search
      ? el('div', {}, '🔍', el('span', {}, `${q}`), el('span', { class: 's', style: 'color:var(--muted)' }, '— بحث'))
      : el('div', {}, s.bookmark ? '★' : '🕘', el('span', {}, s.title || ''), el('span', { class: 'u' }, s.url));
    row.addEventListener('mousedown', (e) => { e.preventDefault(); pickSuggestion(i); });
    box.append(row);
  });
  box.classList.remove('hidden');
}
function hideSuggestions() { $('#suggestions').classList.add('hidden'); sugItems = []; }
function pickSuggestion(i) {
  const s = sugItems[i]; if (!s) return;
  const v = s.search ? $('#address').value : s.url;
  $('#address').blur();
  navigate(v);
}

/* ---------------- المفضلة ---------------- */
function renderBookmarksBar() {
  const bar = $('#bookmarksbar');
  bar.innerHTML = '';
  for (const b of state.bookmarks) {
    const img = el('img', { src: faviconFor(b.url) });
    img.onerror = () => img.remove();
    const btn = el('button', { title: b.url, 'data-url': b.url, 'data-bm': b.id }, img, b.title);
    btn.addEventListener('click', () => navigate(b.url));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) createTab({ url: b.url, background: true }); });
    bar.append(btn);
  }
  if (!state.bookmarks.length) bar.append(el('span', { style: 'color:var(--muted);padding:4px' }, 'اضغط ☆ لإضافة الصفحة إلى المفضلة'));
}
async function toggleBookmark() {
  const tab = state.active; if (!tab || !tab.webview) return;
  const i = state.bookmarks.findIndex(b => b.url === tab.url);
  if (i >= 0) { state.bookmarks.splice(i, 1); toast('أزيلت من المفضلة'); }
  else { state.bookmarks.push({ id: 'b' + Date.now(), title: tab.title || tab.url, url: tab.url }); toast('أضيفت إلى المفضلة ★'); }
  state.bookmarks = await api.saveBookmarks(state.bookmarks);
  renderBookmarksBar(); updateNav();
}

/* ---------------- اللوحة الجانبية ---------------- */
const panels = {
  async history(body) {
    const search = el('input', { class: 'search', placeholder: 'بحث في السجل' });
    const list = el('div');
    const row = el('div', { class: 'btnrow' },
      el('button', { onclick: async () => {
        if (!confirm('حذف كل السجل وذاكرة التخزين المؤقت؟ (لن يتم تسجيل خروجك من الحسابات)')) return;
        await api.clearHistory({ cache: true }); draw(); toast('تم مسح السجل');
      } }, 'مسح بيانات التصفح'));
    const draw = async () => {
      list.innerHTML = '';
      const items = await api.listHistory(search.value);
      let day = '';
      for (const h of items) {
        const d = new Date(h.time).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
        if (d !== day) { day = d; list.append(el('div', { class: 'sect' }, d)); }
        list.append(el('div', { class: 'item' },
          el('div', { class: 'main', onclick: () => navigate(h.url) },
            el('div', { class: 't' }, h.title || h.url), el('div', { class: 's' }, h.url)),
          el('span', { class: 's' }, new Date(h.time).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })),
          el('button', { class: 'del', title: 'حذف', onclick: async () => { await api.removeHistory(h.time); draw(); } }, '✕')));
      }
      if (!items.length) list.append(el('p', { style: 'color:var(--muted)' }, 'لا يوجد سجل'));
    };
    search.addEventListener('input', draw);
    body.append(search, row, list); draw(); search.focus();
  },
  async bookmarks(body) {
    const list = el('div');
    const draw = () => {
      list.innerHTML = '';
      state.bookmarks.forEach((b, i) => {
        list.append(el('div', { class: 'item' },
          el('div', { class: 'main', onclick: () => navigate(b.url) }, el('div', { class: 't' }, b.title), el('div', { class: 's' }, b.url)),
          el('button', { onclick: async () => {
            const t = prompt('اسم العلامة', b.title); if (t === null) return;
            b.title = t; state.bookmarks = await api.saveBookmarks(state.bookmarks); renderBookmarksBar(); draw();
          } }, 'تعديل'),
          el('button', { disabled: i === 0 ? '' : null, onclick: async () => {
            [state.bookmarks[i - 1], state.bookmarks[i]] = [state.bookmarks[i], state.bookmarks[i - 1]];
            state.bookmarks = await api.saveBookmarks(state.bookmarks); renderBookmarksBar(); draw();
          } }, '↑'),
          el('button', { class: 'del', onclick: async () => {
            state.bookmarks.splice(i, 1); state.bookmarks = await api.saveBookmarks(state.bookmarks); renderBookmarksBar(); updateNav(); draw();
          } }, '✕')));
      });
      if (!state.bookmarks.length) list.append(el('p', { style: 'color:var(--muted)' }, 'لا توجد علامات'));
    };
    body.append(list); draw();
  },
  async downloads(body) {
    const list = el('div'); body.append(list);
    const draw = async () => {
      list.innerHTML = '';
      const items = await api.listDownloads();
      for (const d of items) {
        const pct = d.total ? Math.round(d.received / d.total * 100) : 0;
        const labels = { progressing: d.video ? d.status : `${fmtBytes(d.received)} / ${fmtBytes(d.total)}`, paused: 'متوقف مؤقتاً',
          completed: fmtBytes(d.total || d.received), cancelled: 'ملغى', interrupted: d.status ? 'فشل: ' + d.status : 'فشل' };
        const actions = [];
        if (d.state === 'progressing') actions.push(...(d.video ? [] : [['إيقاف', 'pause']]), ['إلغاء', 'cancel']);
        if (d.state === 'paused') actions.push(['استئناف', 'resume'], ['إلغاء', 'cancel']);
        if (d.state === 'completed') actions.push(['فتح', 'open'], ['المجلد', 'show']);
        actions.push(['✕', 'remove']);
        list.append(el('div', { class: 'item' },
          el('div', { class: 'main' }, el('div', { class: 't' }, d.name), el('div', { class: 's' }, labels[d.state] || d.state),
            d.state === 'progressing' ? el('div', { class: 'progress' }, el('div', { style: `width:${pct}%` })) : null),
          ...actions.map(([l, a]) => el('button', { class: a === 'remove' ? 'del' : '', onclick: async () => { await api.downloadAction({ id: d.id, action: a }); draw(); } }, l))));
      }
      if (!items.length) list.append(el('p', { style: 'color:var(--muted)' }, 'لا توجد تنزيلات'));
    };
    panels.downloads.redraw = draw;
    draw();
  },
  async passwords(body) {
    const info = await api.init();
    body.append(el('p', { style: 'color:var(--muted);line-height:1.6' },
      info.encryption ? '🔐 كلمات المرور مشفرة بتشفير نظام التشغيل.'
        : '⚠ تشفير النظام غير متاح على هذا الجهاز؛ كلمات المرور محفوظة محلياً بدون تشفير قوي.'));
    const search = el('input', { class: 'search', placeholder: 'بحث عن موقع' });
    const list = el('div');
    const draw = async () => {
      list.innerHTML = '';
      const items = (await api.listPasswords()).filter(p => p.origin.includes(search.value));
      for (const p of items) {
        const pwSpan = el('span', { class: 's' }, p.never ? 'لا يُحفظ أبداً' : '••••••••');
        list.append(el('div', { class: 'item' },
          el('div', { class: 'main' }, el('div', { class: 't', dir: 'ltr', style: 'text-align:right' }, p.origin),
            el('div', { class: 's' }, p.username || ''), pwSpan),
          p.never ? null : el('button', { onclick: async () => {
            pwSpan.textContent = pwSpan.textContent.startsWith('•') ? await api.revealPassword(p.id) : '••••••••';
          } }, '👁'),
          p.never ? null : el('button', { onclick: async () => { navigator.clipboard.writeText(await api.revealPassword(p.id)); toast('تم النسخ'); } }, 'نسخ'),
          el('button', { class: 'del', onclick: async () => { await api.removePassword(p.id); draw(); } }, '✕')));
      }
      if (!items.length) list.append(el('p', { style: 'color:var(--muted)' }, 'لا توجد كلمات مرور محفوظة'));
    };
    search.addEventListener('input', draw);
    body.append(search, list); draw();
  },
  async settings(body) {
    const s = state.settings;
    const engine = el('select', {},
      ...[['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo'], ['yahoo', 'Yahoo']]
        .map(([v, l]) => el('option', { value: v, ...(s.searchEngine === v ? { selected: '' } : {}) }, l)));
    const home = el('input', { type: 'text', value: s.homepage === NEWTAB ? '' : s.homepage, placeholder: 'اتركه فارغاً لصفحة التبويب الجديد', dir: 'ltr' });
    const adblock = el('input', { type: 'checkbox', ...(s.adblock ? { checked: '' } : {}) });
    const restore = el('input', { type: 'checkbox', ...(s.restoreTabs ? { checked: '' } : {}) });
    const sleepSel = el('select', {},
      ...[[0, 'أبداً'], [10, 'بعد 10 دقائق'], [30, 'بعد 30 دقيقة'], [60, 'بعد ساعة'], [180, 'بعد 3 ساعات']]
        .map(([v, l]) => el('option', { value: v, ...(Number(s.sleepMinutes ?? 30) === v ? { selected: '' } : {}) }, l)));
    const save = async () => {
      state.settings = await api.saveSettings({ searchEngine: engine.value, homepage: home.value.trim() || NEWTAB,
        adblock: adblock.checked, restoreTabs: restore.checked, sleepMinutes: Number(sleepSel.value) });
      toast('تم حفظ الإعدادات');
    };
    [engine, home, adblock, restore, sleepSel].forEach(x => x.addEventListener('change', save));
    const defaultRow = el('div', { class: 'btnrow' });
    const drawDefault = async () => {
      const st = await api.defaultBrowserStatus();
      defaultRow.innerHTML = '';
      defaultRow.append(st.isDefault === true
        ? el('span', {}, '✅ متصفح العالمي هو المتصفح الافتراضي، والروابط من البرامج التانية هتفتح فيه.')
        : el('button', { class: 'primary', onclick: async () => {
            await api.setDefaultBrowser();
            toast(st.canOpenSettings ? 'اختار «متصفح العالمي» من صفحة ويندوز اللي اتفتحت' : 'تم');
            setTimeout(drawDefault, 1500);
          } }, st.canOpenSettings ? 'اختيار المتصفح الافتراضي' : 'اجعله المتصفح الافتراضي'));
    };
    drawDefault();
    body.append(el('div', { class: 'form' },
      el('label', {}, 'محرك البحث', engine),
      el('label', {}, 'الصفحة الرئيسية', home),
      el('label', {}, adblock, ' حظر الإعلانات والمتتبعات (أسرع وأكثر خصوصية)'),
      el('label', {}, restore, ' استعادة التبويبات المفتوحة عند بدء التشغيل'),
      el('label', {}, 'تنويم التبويبات غير المستخدمة (توفير الذاكرة مع الحسابات الكثيرة)', sleepSel)),
      el('div', { class: 'sect' }, 'المتصفح الافتراضي'),
      defaultRow,
      el('div', { class: 'sect' }, 'الخصوصية'),
      el('div', { class: 'btnrow' },
        el('button', { onclick: async () => { if (confirm('مسح السجل والكاش؟')) { await api.clearHistory({ cache: true }); toast('تم'); } } }, 'مسح السجل والكاش'),
        el('button', { onclick: async () => { if (confirm('سيتم تسجيل خروجك من كل الحسابات. متابعة؟')) { await api.clearHistory({ cache: true, cookies: true }); toast('تم'); } } }, 'مسح كل البيانات')));
  }
};
panels.about = (body) => {
  body.append(el('div', { class: 'about' },
    el('img', { src: 'icon.png', alt: '' }),
    el('h3', {}, 'متصفح العالمي'),
    el('div', { class: 'ver' }, 'الإصدار ' + (state.version || '') + ' · محرك Chromium ' + (state.chrome || '')),
    el('div', {}, 'متصفح سريع بمحرك كروم، فيه مميزات كروم وفايرفوكس وأوبرا مع بعض: إضافات كروم، وضع القراءة، الفيديو في نافذة صغيرة، لقطة الشاشة، شريط واتساب وماسنجر الجانبي، مانع الإعلانات، تحميل الفيديوهات، وترجمة لكل اللغات.'),
    el('button', { onclick: () => api.checkUpdates() }, 'البحث عن تحديثات'),
    el('div', { class: 'copy' }, 'جميع الحقوق محفوظة © 2026 ', el('bdi', {}, 'Ahmed Gamal Elshafey')),
    el('div', { class: 'lic' }, 'يستخدم البرنامج مكتبات مفتوحة المصدر (Electron و Chromium و electron-chrome-extensions) تحت رخصها الخاصة.')));
};
const panelTitles = { about: 'حول متصفح العالمي', extensions: 'الإضافات', translate: 'المترجم', history: 'السجل', bookmarks: 'المفضلة', downloads: 'التنزيلات', passwords: 'كلمات المرور', settings: 'الإعدادات' };
function openPanel(name) {
  hidePopups();
  state.panel = name;
  $('#panelTitle').textContent = panelTitles[name];
  const body = $('#panelBody'); body.innerHTML = '';
  $('#panel').classList.remove('hidden');
  panels[name](body);
}
function closePanel() { $('#panel').classList.add('hidden'); state.panel = null; }
function hidePopups() { $('#menu').classList.add('hidden'); $('#videoMenu').classList.add('hidden'); $('#profileMenu').classList.add('hidden'); $('#profileMenu').style.width = ''; }

/* ---------------- البحث داخل الصفحة ---------------- */
function openFind() {
  $('#findbar').classList.remove('hidden');
  $('#findInput').focus(); $('#findInput').select();
}
function closeFind() {
  $('#findbar').classList.add('hidden');
  const wv = state.active && state.active.webview;
  if (wv) wv.stopFindInPage('clearSelection');
}
function find(forward = true, findNext = true) {
  const wv = state.active && state.active.webview, q = $('#findInput').value;
  if (!wv || !q) return;
  wv.findInPage(q, { forward, findNext });
}

/* ---------------- الأوامر ---------------- */
function zoom(delta) {
  const t = state.active; if (!t || !t.webview) return;
  t.zoom = delta === 0 ? defaultZoomLevel() : Math.max(-5, Math.min(5, t.zoom + delta));
  t.webview.setZoomLevel(t.zoom);
  toast(`التكبير ${Math.round(Math.pow(1.2, t.zoom) * 100)}%`);
}
function newTabSameProfile() { createTab({}); }
const commands = {
  'new-tab': newTabSameProfile,
  'new-temp-tab': () => createTab({ temp: true }),
  'sleep-all': () => toast(`تم تنويم ${sleepInactive(true)} تبويب لتوفير الذاكرة — الحسابات تبقى مسجلة`),
  'close-tab': () => closeTab(state.active),
  'reopen-tab': () => { const c = state.closed.pop(); if (c) createTab({ url: c.url, profileId: c.profileId, index: c.index }); },
  'focus-address': () => { $('#address').focus(); $('#address').select(); },
  'reload': () => state.active && state.active.webview && state.active.webview.reload(),
  'back': () => { const w = state.active && state.active.webview; if (w && w.canGoBack()) w.goBack(); },
  'forward': () => { const w = state.active && state.active.webview; if (w && w.canGoForward()) w.goForward(); },
  'bookmark': toggleBookmark,
  'show-history': () => openPanel('history'),
  'show-bookmarks': () => openPanel('bookmarks'),
  'show-downloads': () => openPanel('downloads'),
  'show-passwords': () => openPanel('passwords'),
  'show-settings': () => openPanel('settings'),
  'show-about': () => openPanel('about'),
  'find': openFind,
  'print': () => state.active && state.active.webview && state.active.webview.print(),
  'view-source': () => { const t = state.active; if (t && /^https?:/.test(t.url)) createTab({ url: 'view-source:' + t.url, partition: t.partition }); },
  'save-page': () => state.active && state.active.webview && api.savePage(state.active.webview.getWebContentsId()),
  'zoom-in': () => zoom(1), 'zoom-out': () => zoom(-1), 'zoom-reset': () => zoom(0),
  'fullscreen': () => api.toggleFullscreen(),
  'devtools': () => { const w = state.active && state.active.webview; if (w) w.isDevToolsOpened() ? w.closeDevTools() : w.openDevTools(); },
  'next-tab': () => { const i = state.tabs.indexOf(state.active); activate(state.tabs[(i + 1) % state.tabs.length]); },
  'prev-tab': () => { const i = state.tabs.indexOf(state.active); activate(state.tabs[(i - 1 + state.tabs.length) % state.tabs.length]); },
  'escape': () => { hidePopups(); if (typeof hideTranslateMenu === 'function') hideTranslateMenu(); hideSuggestions(); if (!$('#findbar').classList.contains('hidden')) closeFind(); if (state.panel) closePanel(); }
};
for (let i = 1; i <= 9; i++) commands['tab-' + i] = () => activate(i === 9 ? state.tabs[state.tabs.length - 1] : state.tabs[i - 1]);
function run(cmd) { if (commands[cmd]) commands[cmd](); }

/* ---------------- ربط الأحداث ---------------- */
function bind() {
  $('#newTabBtn').addEventListener('click', newTabSameProfile);
  $('#backBtn').addEventListener('click', () => run('back'));
  $('#fwdBtn').addEventListener('click', () => run('forward'));
  $('#reloadBtn').addEventListener('click', () => {
    const w = state.active && state.active.webview; if (!w) return;
    state.active.loading ? w.stop() : w.reload();
  });
  $('#homeBtn').addEventListener('click', () => navigate(state.settings.homepage || NEWTAB));
  $('#starBtn').addEventListener('click', toggleBookmark);
  $('#tabListBtn').addEventListener('click', (e) => { e.stopPropagation(); showTabList(e.currentTarget); });
  // عجلة الماوس فوق شريط التبويبات تحركه يميناً ويساراً
  $('#tabs').addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $('#tabs').scrollLeft -= e.deltaY; } }, { passive: false });
  $('#incognitoBtn').addEventListener('click', () => run('new-temp-tab'));
  $('#downloadsBtn').addEventListener('click', () => openPanel('downloads'));
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#profileMenu').classList.add('hidden'); $('#menu').classList.toggle('hidden'); });
  $('#menu').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { hidePopups(); run(b.dataset.act); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.popup')) hidePopups(); });
  $('#panelClose').addEventListener('click', closePanel);

  const addr = $('#address');
  addr.addEventListener('focus', () => addr.select());
  addr.addEventListener('input', () => showSuggestions(addr.value));
  addr.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
  addr.addEventListener('keydown', (e) => {
    const rows = [...$('#suggestions').children];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!rows.length) return;
      sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('sel', i === sugSel));
      const s = sugItems[sugSel]; if (s && !s.search) addr.value = s.url;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = addr.value; addr.blur();
      if (e.altKey) createTab({ url: v }); // Alt+Enter في تبويب جديد
      navigate(v);
    } else if (e.key === 'Escape') { hideSuggestions(); updateNav(); addr.blur(); }
  });

  $('#findInput').addEventListener('input', () => find(true, false));
  $('#findInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') find(!e.shiftKey, true);
    if (e.key === 'Escape') closeFind();
  });
  $('#findNext').addEventListener('click', () => find(true));
  $('#findPrev').addEventListener('click', () => find(false));
  $('#findClose').addEventListener('click', closeFind);

  $('#pwSave').addEventListener('click', () => respondPw('save'));
  $('#pwNever').addEventListener('click', () => respondPw('never'));
  $('#pwDismiss').addEventListener('click', () => respondPw('dismiss'));

  api.on('shortcut', run);
  api.on('open-tab', ({ url, partition, background, temp }) => {
    const i = state.tabs.indexOf(state.active);
    createTab({ url, partition: temp ? undefined : partition, temp: !!temp || (partition || '').startsWith('temp_'), background, index: i + 1 });
  });
  api.on('pw:prompt', ({ id, origin, username, update }) => {
    state.pendingPw = id;
    let host = origin; try { host = new URL(origin).hostname; } catch { /* ignore */ }
    $('#pwText').textContent = `🔑 ${update ? 'تحديث' : 'حفظ'} كلمة المرور لـ ${username || 'هذا الحساب'} على ${host}؟`;
    $('#pwbar').classList.remove('hidden');
  });
  api.on('downloads:update', (d) => {
    state.downloads.set(d.id, d);
    const active = [...state.downloads.values()].filter(x => x.state === 'progressing').length;
    $('#dlCount').textContent = active; $('#dlCount').classList.toggle('hidden', !active);
    if (d.state === 'completed') toast(`اكتمل تنزيل ${d.name}`);
    if (state.panel === 'downloads' && panels.downloads.redraw) panels.downloads.redraw();
  });
  setInterval(() => refreshAdBadge(), 2000);
}
function respondPw(action) {
  if (state.pendingPw) api.respondPassword({ id: state.pendingPw, action });
  state.pendingPw = null;
  $('#pwbar').classList.add('hidden');
  if (action === 'save') toast('تم حفظ كلمة المرور 🔐');
}

/* ---------------- البدء ---------------- */
/* أزرار النافذة المخصصة على الشمال */
const MAX_ICON = '<svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" /></svg>';
const RESTORE_ICON = '<svg viewBox="0 0 10 10"><rect x=".5" y="2.5" width="7" height="7" /><path d="M2.5 2.5V.5h7v7h-2" /></svg>';
function setWinState({ maximized, fullscreen }) {
  document.body.classList.toggle('maximized', !!maximized);
  document.body.classList.toggle('fullscreen', !!fullscreen);
  const b = $('#winMax');
  b.innerHTML = maximized ? RESTORE_ICON : MAX_ICON;
  b.title = maximized ? 'استعادة الحجم' : 'تكبير';
}
function bindWindowControls(init) {
  if (init.platform === 'darwin') { document.body.classList.add('native-frame'); return; }
  $('#winMin').addEventListener('click', () => api.winMinimize());
  $('#winMax').addEventListener('click', () => api.winToggleMaximize());
  $('#winClose').addEventListener('click', () => api.winClose());
  $('#dragSpace').addEventListener('dblclick', () => api.winToggleMaximize());
  api.on('window:state', setWinState);
  setWinState({ maximized: init.maximized });
}

async function start() {
  const init = await api.init();
  bindWindowControls(init);
  bindSettingsPage();
  bindVideo();
  state.profiles = init.profiles;
  state.bookmarks = init.bookmarks;
  state.settings = init.settings;
  state.version = init.version; state.chrome = init.chrome; state.downloadsDefault = init.downloadsDefault;
  for (const d of init.downloads) state.downloads.set(d.id, d);
  bind();
  renderBookmarksBar();

  const s = init.session;
  if (s && Array.isArray(s.tabs) && s.tabs.length && !api.smokeTest) {
    for (const t of s.tabs) createTab({ url: t.url || NEWTAB, profileId: t.profileId, background: true, lazy: true });
    activate(state.tabs[Math.min(s.active || 0, state.tabs.length - 1)]);
  } else if (!(init.startUrl && !api.smokeTest)) {
    createTab({ url: state.settings.homepage || NEWTAB });
  }
  // رابط جاي من برنامج تاني (لما يكون المتصفح الافتراضي)
  if (init.startUrl && !api.smokeTest) createTab({ url: init.startUrl });
}

/* اختبار آلي للتشغيل بدون شاشة: npm start -- --smoke-test */
window.__smokeTest = async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !state.tabs.length; i++) await wait(100);
  const before = state.tabs.length;
  for (let i = 0; i < 5; i++) createTab({ url: 'about:blank', background: true, lazy: i > 1 });
  const inc = createTab({ temp: true });
  const normal = state.tabs.filter(t => !t.temp);
  const onePartition = new Set(normal.map(t => t.partition)).size === 1 && normal[0].partition === 'persist:default';
  const incIsolated = inc.partition.startsWith('temp_');
  activate(inc);
  await wait(300);
  const incNewtab = !$('#newtab').classList.contains('hidden') && document.body.classList.contains('incognito');
  activate(normal[normal.length - 1]); // تبويب نائم يصحى
  for (let i = 0; i < 50 && !normal[normal.length - 1].ready; i++) await wait(100);
  const woke = !!normal[normal.length - 1].webview && !normal[normal.length - 1].sleeping;
  const t = createTab({});
  for (let i = 0; i < 30 && !$('#speeddial .sc'); i++) await wait(100);
  const shortcuts = document.querySelectorAll('#speeddial .sc').length;
  const noAccountsUI = !$('#mailBtn') && !$('#profileChip') && !$('#modal') && !$('#newTabMenuBtn');
  return {
    ok: onePartition && incIsolated && incNewtab && woke && shortcuts >= 4 && noAccountsUI && !!t,
    tabsBefore: before, onePartition, incIsolated, incNewtab, wokeOnClick: woke, shortcuts, noAccountsUI
  };
};

// نبدأ بعد تحميل كل السكربتات (features.js و settings.js)
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
