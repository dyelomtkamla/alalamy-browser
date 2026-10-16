'use strict';
/* العملاء: لكل عميل جلسة مستقلة (persist:c_<id>) فيها فيسبوك وانستا وتيك توك وسناب وجوجل وتويتر.
   بتسجل دخول بنفسك مرة واحدة لكل عميل، وبعدها تبدّل بين العملاء من الزرار اللي في أول شريط التبويبات
   من غير تسجيل خروج ودخول. شريط التبويبات بيعرض تبويبات العميل المختار بس. */

const CLIENT_SITES = [
  { key: 'facebook', name: 'فيسبوك', url: 'https://www.facebook.com/', def: true },
  { key: 'instagram', name: 'انستجرام', url: 'https://www.instagram.com/', def: true },
  { key: 'tiktok', name: 'تيك توك', url: 'https://www.tiktok.com/login', def: true },
  { key: 'snapchat', name: 'سناب شات', url: 'https://www.snapchat.com/web', def: true },
  { key: 'google', name: 'جوجل (Gmail ويوتيوب)', url: 'https://accounts.google.com/', def: true },
  { key: 'x', name: 'إكس (تويتر)', url: 'https://x.com/login', def: true },
  { key: 'business', name: 'ميتا بيزنس سويت', url: 'https://business.facebook.com/' },
  { key: 'youtube', name: 'يوتيوب ستوديو', url: 'https://studio.youtube.com/' },
  { key: 'linkedin', name: 'لينكدإن', url: 'https://www.linkedin.com/login' },
  { key: 'threads', name: 'ثريدز', url: 'https://www.threads.com/' }
];
const CLIENT_COLORS = ['#1a73e8', '#d93025', '#188038', '#f29900', '#9334e6', '#e52592', '#12b5cb', '#5f6368', '#b06000', '#3949ab'];

function currentClient() { return clientById(state.client); }
function clientTabs(id) { return state.tabs.filter(t => (t.clientId || null) === (id || null)); }

// إخفاء تبويبات العملاء التانيين (التبويبات بتفضل مفتوحة ومسجلة، بس مش ظاهرة)
function applyClientFilter() {
  for (const t of state.tabs) {
    const other = (t.clientId || null) !== state.client;
    t.tabEl.classList.toggle('other-client', other);
    if (t.webview) t.webview.classList.toggle('other-client', other);
  }
}

function setCurrentClient(id) {
  state.client = clientById(id) ? id : null;
  applyClientFilter();
  renderClientChip();
}

// التبديل لعميل: يرجع لآخر تبويب كنت عليه عنده، ولو مفيش تبويبات مفتوحة يفتح مواقعه
function switchClient(id) {
  hidePopups();
  setCurrentClient(id);
  const vis = visibleTabs();
  if (!vis.length) {
    const c = currentClient();
    if (c) openClientSites(c);
    else createTab({ clientId: null });
  } else {
    activate(vis.reduce((a, b) => ((b.lastActive || 0) > (a.lastActive || 0) ? b : a)));
  }
  layoutGrid();
  const c = currentClient();
  toast(c ? `أنت دلوقتي على حسابات العميل «${c.name}»` : 'رجعت لحسابك الشخصي');
}

function openClientSites(c, only) {
  const sites = CLIENT_SITES.filter(s => (only || c.sites || []).includes(s.key));
  if (!sites.length) { createTab({ clientId: c.id }); return; }
  const open = new Set(clientTabs(c.id).map(t => { try { return new URL(t.url).hostname; } catch { return ''; } }));
  let first = null;
  for (const s of sites) {
    if (open.has(new URL(s.url).hostname)) continue; // الموقع مفتوح بالفعل للعميل ده
    const t = createTab({ url: s.url, clientId: c.id, background: !!first });
    first = first || t;
  }
  if (first) activate(first);
  else toast('كل مواقع العميل مفتوحة بالفعل');
}

function renderClientChip() {
  const chip = $('#clientChip');
  if (!chip) return;
  chip.classList.toggle('hidden', INCOGNITO_WIN);
  const c = currentClient();
  chip.innerHTML = '';
  chip.append(el('span', { class: 'dot', style: c ? `background:${c.color}` : '' }), el('span', { class: 'nm' }, c ? c.name : 'العملاء'));
  chip.title = c ? `العميل الحالي: ${c.name} — اضغط للتبديل (Ctrl+Shift+M)` : 'العملاء: افتح حسابات كل عميل لوحده وبدّل بينهم (Ctrl+Shift+M)';
  chip.classList.toggle('on', !!c);
  refreshProfileBtn();
  document.body.classList.toggle('client-mode', !!c);
  document.body.style.setProperty('--client', c ? c.color : 'transparent');
}

// زرار الحساب زي كروم: الإيميل الرئيسي (حساب جوجل المسجل) وتحته العملاء
const ADD_GOOGLE = 'https://accounts.google.com/AddSession?continue=' + encodeURIComponent('https://www.google.com/');
function accountCard() {
  const c = currentClient();
  const card = el('div', { class: 'acard' }, el('div', { class: 'awho' }, 'جاري التحقق من حساب جوجل...'));
  api.googleAccounts(c ? c.partition : 'persist:default').then((list) => {
    card.innerHTML = '';
    const owner = c ? `حساب جوجل للعميل «${c.name}»` : 'الإيميل الرئيسي';
    if (!list || !list.length) {
      card.append(el('div', { class: 'aavatar empty' }, el('span', { class: 'ph2' })),
        el('div', { class: 'aname' }, owner),
        el('div', { class: 'amail' }, 'مش مسجل دخول بحساب جوجل'),
        el('button', { class: 'primary aadd', onclick: () => { hidePopups(); createTab({ url: ADD_GOOGLE, clientId: state.client }); } }, c ? 'إضافة إيميل العميل' : 'إضافة الإيميل الرئيسي'));
      return;
    }
    const a = list[0];
    const av = el('div', { class: 'aavatar', style: `background:${c ? c.color : 'var(--accent)'}` }, (a.name || a.email).trim().charAt(0).toUpperCase());
    if (a.photo) { const img = el('img', { src: a.photo, alt: '' }); img.onerror = () => img.remove(); av.append(img); }
    card.append(el('div', { class: 'aowner' }, owner), av, el('div', { class: 'aname' }, a.name || ''), el('div', { class: 'amail', dir: 'ltr' }, a.email),
      el('div', { class: 'abtns' },
        el('button', { class: 'pill', onclick: () => { hidePopups(); createTab({ url: 'https://myaccount.google.com/?authuser=' + encodeURIComponent(a.email), clientId: state.client }); } }, 'إدارة حسابك على Google'),
        el('button', { class: 'pill', onclick: () => { hidePopups(); createTab({ url: ADD_GOOGLE, clientId: state.client }); } }, '+ إيميل تاني')));
    for (const o of list.slice(1, 4)) card.append(el('div', { class: 'aother', dir: 'ltr' }, o.email));
    renderProfileBtn(a);
  }).catch(() => { card.innerHTML = ''; card.append(el('button', { class: 'primary aadd', onclick: () => { hidePopups(); createTab({ url: ADD_GOOGLE, clientId: state.client }); } }, 'إضافة الإيميل الرئيسي')); });
  return card;
}
function renderProfileBtn(acc) {
  const b = $('#profileBtn');
  if (!b) return;
  b.classList.toggle('hidden', INCOGNITO_WIN);
  const c = currentClient();
  b.innerHTML = '';
  if (acc && acc.photo) {
    const img = el('img', { src: acc.photo, alt: '' });
    img.onerror = () => renderProfileBtn(null);
    b.append(img);
  } else if (c || acc) {
    b.append(el('span', { class: 'pletter', style: `background:${c ? c.color : 'var(--accent)'}` }, ((c && c.name) || acc.name || acc.email || '؟').trim().charAt(0).toUpperCase()));
  } else b.innerHTML = icon('person-circle');
  b.title = (c ? `العميل: ${c.name}` : 'حسابك') + (acc ? ` — ${acc.email}` : ' — إضافة الإيميل الرئيسي');
}
let profileBtnTimer = 0;
function refreshProfileBtn() {
  clearTimeout(profileBtnTimer);
  profileBtnTimer = setTimeout(async () => {
    const c = currentClient();
    try { renderProfileBtn(((await api.googleAccounts(c ? c.partition : 'persist:default')) || [])[0] || null); } catch { renderProfileBtn(null); }
  }, 300);
}

function showClientMenu(fromProfile = false) {
  hidePopups();
  if (INCOGNITO_WIN) return;
  const m = $('#profileMenu');
  m.innerHTML = '';
  m.classList.add('client-menu');
  if (fromProfile) m.append(accountCard(), el('hr'));
  const row = (c) => {
    const id = c ? c.id : null;
    const n = clientTabs(id).length;
    const b = el('button', { class: 'crow' + (state.client === id ? ' cur' : '') },
      el('span', { class: 'dot', style: c ? `background:${c.color}` : 'background:var(--muted)' }),
      el('span', { class: 'cname' }, c ? c.name : 'حسابي الشخصي'),
      el('span', { class: 'ccount' }, n ? `${n} تبويب` : ''),
      state.client === id ? el('span', { class: 'check' }, '✓') : null);
    if (c) {
      const edit = el('span', { class: 'rowclose', title: 'تعديل العميل' }, '✎');
      edit.addEventListener('click', (e) => { e.stopPropagation(); hidePopups(); openClientDialog(c); });
      b.append(edit);
    }
    b.addEventListener('click', () => switchClient(id));
    return b;
  };
  m.append(el('div', { class: 'mhead' }, 'العملاء'), row(null), ...state.clients.map(row));
  if (!state.clients.length) m.append(el('p', { class: 'mhint' }, 'ضيف كل عميل باسمه، وسجّل دخول حساباته مرة واحدة. بعد كده تبدّل بينهم من هنا من غير تسجيل خروج.'));
  m.append(el('hr'), el('button', { onclick: () => { hidePopups(); openClientDialog(); } }, el('b', {}, '+'), ' إضافة عميل جديد'));
  const c = currentClient();
  if (c) m.append(el('button', { onclick: () => { hidePopups(); openClientSites(c); } }, '↗ فتح كل مواقع ', el('bdi', {}, c.name)));
  const r = (fromProfile ? $('#profileBtn') : $('#clientChip')).getBoundingClientRect();
  m.style.width = '320px';
  placePopup(m, fromProfile ? r.left : r.right - 320, r.bottom + 4);
}

// نافذة إضافة / تعديل عميل
function openClientDialog(edit) {
  closeClientDialog();
  const used = new Set(state.clients.map(c => c.color));
  let color = edit ? edit.color : (CLIENT_COLORS.find(x => !used.has(x)) || CLIENT_COLORS[state.clients.length % CLIENT_COLORS.length]);
  const name = el('input', { type: 'text', maxlength: '40', placeholder: 'اسم العميل، مثلاً: محمود', value: edit ? edit.name : '' });
  const swatches = el('div', { class: 'swatches' });
  const drawSw = () => {
    swatches.innerHTML = '';
    for (const x of CLIENT_COLORS) {
      const b = el('button', { type: 'button', class: x === color ? 'on' : '', style: `background:${x}`, title: x });
      b.addEventListener('click', () => { color = x; drawSw(); });
      swatches.append(b);
    }
  };
  drawSw();
  const chosen = new Set(edit ? edit.sites : CLIENT_SITES.filter(s => s.def).map(s => s.key));
  const sites = el('div', { class: 'csites' }, ...CLIENT_SITES.map(s => {
    const cb = el('input', { type: 'checkbox', value: s.key, ...(chosen.has(s.key) ? { checked: '' } : {}) });
    const img = el('img', { src: faviconFor(s.url), alt: '' });
    img.onerror = () => img.remove();
    return el('label', {}, cb, img, s.name);
  }));
  const err = el('div', { class: 'cerr' });
  const submit = async () => {
    const nm = name.value.trim();
    if (!nm) { err.textContent = 'اكتب اسم العميل'; name.focus(); return; }
    if (state.clients.some(c => c.name === nm && (!edit || c.id !== edit.id))) { err.textContent = 'فيه عميل بنفس الاسم'; name.focus(); return; }
    const keys = [...sites.querySelectorAll('input:checked')].map(x => x.value);
    if (edit) {
      state.clients = await api.saveClients(state.clients.map(c => c.id === edit.id ? { ...c, name: nm, color, sites: keys } : c));
      closeClientDialog();
      for (const t of state.tabs) renderTabBadge(t);
      renderClientChip();
      toast('تم حفظ العميل');
      return;
    }
    const id = 'c_' + randomId();
    state.clients = await api.saveClients([...state.clients, { id, name: nm, color, sites: keys, created: Date.now() }]);
    closeClientDialog();
    const c = clientById(id);
    if (!c) return toast('تعذر إضافة العميل');
    setCurrentClient(id);
    openClientSites(c);
    layoutGrid();
    toast(`اتعمل العميل «${c.name}». سجّل دخول حساباته مرة واحدة وهتفضل محفوظة ليه لوحده`);
  };
  const box = el('div', { class: 'cdialog', role: 'dialog' },
    el('h3', {}, edit ? 'تعديل العميل' : 'عميل جديد'),
    el('label', { class: 'cfield' }, 'الاسم', name),
    el('div', { class: 'cfield' }, 'اللون', swatches),
    el('div', { class: 'cfield' }, edit ? 'مواقع العميل' : 'افتح المواقع دي للعميل', sites),
    el('p', { class: 'cnote' }, '🔒 كل عميل له جلسة لوحده: الكوكيز وتسجيل الدخول بتاعه منفصلين عن حسابك وعن باقي العملاء. هتسجل دخول بنفسك مرة واحدة في كل موقع.'),
    err,
    el('div', { class: 'cbtns' },
      el('button', { class: 'primary', onclick: submit }, edit ? 'حفظ' : 'إنشاء وفتح المواقع'),
      el('button', { class: 'pill', onclick: closeClientDialog }, 'إلغاء'),
      edit ? el('button', { class: 'cdel', onclick: () => removeClient(edit) }, 'حذف العميل') : null));
  const ov = el('div', { id: 'clientDialog' }, box);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeClientDialog(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') submit(); if (e.key === 'Escape') closeClientDialog(); });
  document.body.append(ov);
  setTimeout(() => name.focus(), 0);
}
function closeClientDialog() { const d = $('#clientDialog'); if (d) d.remove(); }

async function removeClient(c, force = false) {
  if (!force && !confirm(`حذف العميل «${c.name}»؟\nهيتقفل كل تبويباته ويتعمل تسجيل خروج من كل حساباته في المتصفح.`)) return;
  closeClientDialog();
  if (state.client === c.id) switchClient(null);
  for (const t of clientTabs(c.id)) closeTab(t);
  state.clients = await api.removeClient(c.id);
  renderClientChip();
  toast(`اتحذف العميل «${c.name}»`);
}

// لو اتعدلت قايمة العملاء من نافذة تانية
api.on('clients:changed', (list) => {
  if (INCOGNITO_WIN || !Array.isArray(list)) return;
  state.clients = list;
  // تبويبات عميل اتحذف تتقفل
  for (const t of state.tabs.filter(x => x.clientId && !clientById(x.clientId))) {
    if (state.client === t.clientId) switchClient(null);
    closeTab(t);
  }
  for (const t of state.tabs) renderTabBadge(t);
  renderClientChip();
});

$('#profileBtn').addEventListener('click', (e) => { e.stopPropagation(); if ($('#profileMenu').classList.contains('client-menu') && !$('#profileMenu').classList.contains('hidden')) hidePopups(); else showClientMenu(true); });
// بعد تسجيل الدخول في جوجل، الصورة والإيميل يتحدثوا
window.addEventListener('focus', refreshProfileBtn);
$('#clientChip').addEventListener('click', (e) => { e.stopPropagation(); if ($('#profileMenu').classList.contains('client-menu') && !$('#profileMenu').classList.contains('hidden')) hidePopups(); else showClientMenu(); });
Object.assign(commands, {
  'clients': () => showClientMenu(),
  'profile': () => showClientMenu(true),
  'new-client': () => openClientDialog()
});
const _hidePopups = hidePopups;
// eslint-disable-next-line no-global-assign
hidePopups = function () { _hidePopups(); $('#profileMenu').classList.remove('client-menu'); };
renderClientChip();

/* اختبار آلي للعملاء (بيتنادى من __smokeTest) */
window.__clientsTest = async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const id = 'c_smoketest';
  state.clients = await api.saveClients([...state.clients, { id, name: 'محمود', color: '#d93025', sites: ['facebook', 'x'] }]);
  const saved = !!clientById(id) && clientById(id).partition === 'persist:c_smoketest';
  setCurrentClient(id);
  const a = createTab({ url: 'about:blank', clientId: id });
  const b = createTab({}); // تبويب جديد وانت على العميل = تبويب للعميل
  const clientPartition = a.partition === 'persist:c_smoketest' && b.clientId === id && b.partition === a.partition;
  const chipShows = $('#clientChip').textContent.includes('محمود');
  switchClient(null);
  const hidden = a.tabEl.classList.contains('other-client') && visibleTabs().every(t => !t.clientId);
  await wait(200);
  switchClient(id);
  const back = state.active.clientId === id && visibleTabs().length === 2;
  await removeClient(clientById(id), true);
  const removed = !clientById(id) && !state.tabs.some(t => t.clientId === id) && state.client === null;
  return { saved, clientPartition, chipShows, hidden, back, removed };
};
