'use strict';
/* العملاء: لكل عميل جلسة مستقلة (persist:c_<id>) فيها فيسبوك وانستا وتيك توك وسناب وجوجل وتويتر.
   بتسجل دخول بنفسك مرة واحدة لكل عميل، وبعدها تبدّل بين العملاء من الزرار اللي في أول شريط التبويبات
   من غير تسجيل خروج ودخول. شريط التبويبات بيعرض تبويبات العميل المختار بس. */

const CLIENT_SITES = [
  // منصات ميتا كلها
  { key: 'facebook', name: 'فيسبوك', url: 'https://www.facebook.com/', def: true, meta: true },
  { key: 'instagram', name: 'انستجرام', url: 'https://www.instagram.com/', def: true, meta: true },
  { key: 'messenger', name: 'ماسنجر', url: 'https://www.messenger.com/', meta: true },
  { key: 'whatsapp', name: 'واتساب ويب', url: 'https://web.whatsapp.com/', meta: true },
  { key: 'threads', name: 'ثريدز', url: 'https://www.threads.com/', meta: true },
  { key: 'business', name: 'ميتا بيزنس سويت', url: 'https://business.facebook.com/', meta: true },
  { key: 'adsmanager', name: 'مدير إعلانات ميتا', url: 'https://adsmanager.facebook.com/', meta: true },
  // باقي المنصات
  { key: 'tiktok', name: 'تيك توك', url: 'https://www.tiktok.com/login', def: true },
  { key: 'snapchat', name: 'سناب شات إعلانات', url: 'https://ads.snapchat.com/', def: true },
  { key: 'google', name: 'جوجل (Gmail ويوتيوب)', url: 'https://accounts.google.com/', def: true },
  { key: 'googleads', name: 'جوجل ادز (إعلانات جوجل)', url: 'https://ads.google.com/', def: true },
  { key: 'x', name: 'إكس (تويتر)', url: 'https://x.com/login', def: true },
  { key: 'youtube', name: 'يوتيوب ستوديو', url: 'https://studio.youtube.com/' },
  { key: 'linkedin', name: 'لينكدإن', url: 'https://www.linkedin.com/login' }
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

// تبويبات العميل اللي في النافذة دي (من جلسة قديمة) بتتنقل لنافذته
function takeClientTabs(id) {
  if (CLIENT_WIN === id) return null;
  const list = clientTabs(id);
  if (!list.length) return null;
  const tabs = list.map(t => ({ url: t.url, title: t.title, pinned: !!t.pinned }));
  for (const t of list) closeTab(t);
  if (state.client === id) setCurrentClient(null);
  return tabs;
}

// كل عميل في نافذة لوحده: الاختيار بيفتح نافذته (أو يروح لها لو مفتوحة)،
// و«حسابي الشخصي» بيرجعك للنافذة الرئيسية. تبويباتك في النافذة الرئيسية بتفضل زي ما هي.
function switchClient(id) {
  hidePopups();
  id = clientById(id) ? id : null;
  if (id !== (CLIENT_WIN || null)) {
    const c = clientById(id);
    if (c) { api.openClientWindow(id, { tabs: takeClientTabs(id) }); toast(`اتفتحت نافذة العميل «${c.name}»`); }
    else api.focusMainWindow();
    return;
  }
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
  if (CLIENT_WIN !== c.id) {
    // منصات العميل بتتفتح في نافذته هو، مش في النافذة دي
    api.openClientWindow(c.id, { only: only || c.sites || [], tabs: takeClientTabs(c.id) });
    return;
  }
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
  else {
    // المنصة مفتوحة بالفعل: نروح لتبويبها
    const host = new URL(sites[0].url).hostname;
    const t = clientTabs(c.id).find(x => { try { return new URL(x.url).hostname === host; } catch { return false; } });
    if (t) activate(t);
    if (sites.length > 1) toast('كل منصات العميل مفتوحة بالفعل');
  }
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
      el('span', { class: 'ccount', 'data-cid': id || '' }, n ? `${n} تبويب` : ''),
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
  if (c) {
    // منصات العميل الحالي: دوسة تفتح أي منصة لوحدها، وتعديل المنصات في أي وقت
    const chips = el('div', { class: 'cplat' }, ...CLIENT_SITES.filter(s => (c.sites || []).includes(s.key)).map(s => {
      const img = el('img', { src: faviconFor(s.url), alt: '' });
      img.onerror = () => img.remove();
      return el('button', { title: 'فتح ' + s.name, onclick: () => { hidePopups(); openClientSites(c, [s.key]); } }, img, s.name);
    }));
    m.append(el('hr'), el('div', { class: 'mhead' }, 'منصات ', el('bdi', {}, c.name)), chips,
      el('button', { onclick: () => { hidePopups(); openClientDialog(c); } }, '✎ تعديل منصات ', el('bdi', {}, c.name)),
      el('button', { onclick: () => { hidePopups(); openClientSites(c); } }, '↗ فتح كل منصات ', el('bdi', {}, c.name)));
  }
  // العملاء اللي نافذتهم مفتوحة دلوقتي
  api.clientWindows().then((ids) => {
    for (const x of m.querySelectorAll('.ccount[data-cid]')) {
      const cid = x.getAttribute('data-cid');
      if (cid && ids.includes(cid) && cid !== CLIENT_WIN) x.textContent = 'نافذة مفتوحة';
    }
  }).catch(() => {});
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
  const siteBox = (s) => {
    const cb = el('input', { type: 'checkbox', value: s.key, ...(chosen.has(s.key) ? { checked: '' } : {}) });
    const img = el('img', { src: faviconFor(s.url), alt: '' });
    img.onerror = () => img.remove();
    return el('label', {}, cb, img, s.name);
  };
  const metaGrid = el('div', { class: 'csites' }, ...CLIENT_SITES.filter(s => s.meta).map(siteBox));
  const otherGrid = el('div', { class: 'csites' }, ...CLIENT_SITES.filter(s => !s.meta).map(siteBox));
  const allMeta = el('button', { type: 'button', class: 'pill cselall', onclick: () => {
    const boxes = [...metaGrid.querySelectorAll('input')];
    const on = !boxes.every(b => b.checked);
    boxes.forEach(b => { b.checked = on; });
  } }, 'كل منصات ميتا');
  const sites = el('div', {},
    el('div', { class: 'cgroup' }, el('span', {}, 'ميتا'), allMeta), metaGrid,
    el('div', { class: 'cgroup' }, el('span', {}, 'منصات تانية')), otherGrid);
  const err = el('div', { class: 'cerr' });
  const submit = async () => {
    const nm = name.value.trim();
    if (!nm) { err.textContent = 'اكتب اسم العميل'; name.focus(); return; }
    if (state.clients.some(c => c.name === nm && (!edit || c.id !== edit.id))) { err.textContent = 'فيه عميل بنفس الاسم'; name.focus(); return; }
    const keys = [...sites.querySelectorAll('input:checked')].map(x => x.value);
    if (edit) {
      const added = keys.filter(k => !(edit.sites || []).includes(k));
      state.clients = await api.saveClients(state.clients.map(c => c.id === edit.id ? { ...c, name: nm, color, sites: keys } : c));
      closeClientDialog();
      for (const t of state.tabs) renderTabBadge(t);
      renderClientChip();
      // المنصات اللي اتعلم عليها جديد تتفتح للعميل على طول
      if (added.length) {
        openClientSites(clientById(edit.id), added);
        layoutGrid();
      }
      toast(added.length ? `تم الحفظ، واتفتح ${added.length} منصة جديدة للعميل` : 'تم حفظ العميل');
      return;
    }
    const id = 'c_' + randomId();
    state.clients = await api.saveClients([...state.clients, { id, name: nm, color, sites: keys, created: Date.now() }]);
    closeClientDialog();
    const c = clientById(id);
    if (!c) return toast('تعذر إضافة العميل');
    openClientSites(c);
    toast(`اتعمل العميل «${c.name}» واتفتحت منصاته في نافذة لوحده. سجّل دخول حساباته مرة واحدة وهتفضل محفوظة ليه`);
  };
  const box = el('div', { class: 'cdialog', role: 'dialog' },
    el('h3', {}, edit ? 'تعديل العميل' : 'عميل جديد'),
    el('label', { class: 'cfield' }, 'الاسم', name),
    el('div', { class: 'cfield' }, 'اللون', swatches),
    el('div', { class: 'cfield' }, edit ? 'منصات العميل (علّم أو شيل العلامة وقت ما تحب)' : 'افتح المنصات دي للعميل', sites),
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
  if (CLIENT_WIN === c.id) {
    // حذف العميل من نافذته: النافذة نفسها بتتقفل
    await api.focusMainWindow();
    await api.removeClient(c.id);
    return;
  }
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
  if (CLIENT_WIN && !clientById(CLIENT_WIN)) return; // النافذة دي هتتقفل
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

// العميل اتفتح تاني من نافذة تانية: تبويبات منقولة و/أو منصات معينة
api.on('client:open-sites', ({ only, tabs } = {}) => {
  const c = clientById(CLIENT_WIN);
  if (!c) return;
  if (Array.isArray(tabs) && tabs.length) {
    const made = tabs.map(t => createTab({ url: t.url, title: t.title, pinned: !!t.pinned, background: true, lazy: true }));
    activate(made[0]);
  }
  if (Array.isArray(only) && only.length) openClientSites(c, only);
  layoutGrid();
});

/* اختبار آلي للعملاء (بيتنادى من __smokeTest) */
window.__clientsTest = async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const id = 'c_smoketest';
  state.clients = await api.saveClients([...state.clients, { id, name: 'محمود', color: '#d93025', sites: ['facebook', 'x'] }]);
  const saved = !!clientById(id) && clientById(id).partition === 'persist:c_smoketest';
  const mine = visibleTabs().slice();
  const a = createTab({ url: 'about:blank', clientId: id, background: true }); // تبويب عميل من جلسة قديمة
  const clientPartition = a.partition === 'persist:c_smoketest' && a.clientId === id;
  switchClient(id); // يفتح نافذة العميل وينقل تبويبه ليها
  let wins = [];
  for (let i = 0; i < 50 && !wins.includes(id); i++) { await wait(100); wins = await api.clientWindows(); }
  const ownWindow = wins.includes(id);
  const movedOut = !state.tabs.includes(a) && state.client === null;
  const mainKept = mine.every(t => state.tabs.includes(t)) && visibleTabs().every(t => !t.clientId);
  const chipShows = $('#clientChip').textContent.includes('العملاء');
  switchClient(id); // مرة تانية: نفس النافذة مش نافذة جديدة
  await wait(300);
  const sameWindow = (await api.clientWindows()).filter(x => x === id).length === 1;
  await removeClient(clientById(id), true);
  await wait(300);
  const removed = !clientById(id) && !(await api.clientWindows()).includes(id) && state.client === null;
  return { saved, clientPartition, ownWindow, movedOut, mainKept, chipShows, sameWindow, removed };
};
