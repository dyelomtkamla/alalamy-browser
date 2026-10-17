'use strict';
/* القائمة الرئيسية زي كروم: قوائم فرعية (السجل، الإشارات، بحث وتعديل، البث والحفظ والمشاركة، المزيد من الأدوات، مساعدة)،
   صف التكبير، رمز QR، البحث في التبويبات، تسمية النافذة، مدير المهام */

applyIcons($('#menu'));
applyIcons($('#subMenus'));

/* ---- القوائم الفرعية: بتفتح جنب الزرار لما تقف عليه أو تدوس عليه ---- */
let subTimer = null;
function openSubMenu(btn) {
  const name = btn.dataset.sub;
  for (const m of document.querySelectorAll('.submenu')) if (m.dataset.menu !== name) m.classList.add('hidden');
  for (const b of document.querySelectorAll('#menu [data-sub]')) b.classList.toggle('open', b === btn);
  const sub = document.querySelector(`.submenu[data-menu="${name}"]`);
  if (!sub) return;
  sub.classList.remove('hidden');
  const r = btn.getBoundingClientRect(), menu = $('#menu').getBoundingClientRect();
  const w = sub.offsetWidth, h = sub.offsetHeight;
  // القايمة على الشمال، فالقايمة الفرعية بتفتح يمينها (ولو مفيش مكان تفتح شمالها)
  let left = menu.right - 4;
  if (left + w > innerWidth - 4) left = Math.max(4, menu.left - w + 4);
  sub.style.left = left + 'px';
  sub.style.top = Math.max(4, Math.min(r.top - 6, innerHeight - h - 8)) + 'px';
}
function closeSubMenus() {
  for (const m of document.querySelectorAll('.submenu')) m.classList.add('hidden');
  for (const b of document.querySelectorAll('#menu [data-sub]')) b.classList.remove('open');
}
$('#menu').addEventListener('mouseover', (e) => {
  const b = e.target.closest('#menu button, #menu .mzoom');
  if (!b) return;
  clearTimeout(subTimer);
  subTimer = setTimeout(() => { if (b.dataset && b.dataset.sub) openSubMenu(b); else closeSubMenus(); }, 120);
});
$('#subMenus').addEventListener('mouseover', () => clearTimeout(subTimer));
$('#subMenus').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.stopPropagation();
  hidePopups(); run(b.dataset.act);
});

/* صف التكبير جوه القايمة بيعرض نسبة التبويب الحالي */
function updateMenuZoom() {
  const t = state.active;
  $('#menuZoom').textContent = Math.round(Math.pow(1.2, (t && t.zoom) || 0) * 100) + '%';
}
$('#menuBtn').addEventListener('click', updateMenuZoom);

/* ---- لوحات جديدة ---- */
const extraPanels = {
  qr(body) {
    const t = state.active;
    const url = t && /^https?:/.test(t.url) ? t.url : '';
    if (!url) { body.append(el('p', { class: 'note' }, 'افتح صفحة موقع الأول علشان نعمل لها رمز QR.')); return; }
    const img = el('img', { class: 'qrimg', alt: 'QR' });
    const input = el('input', { class: 'qrurl', value: url, dir: 'ltr' });
    const draw = async () => { const d = await api.qrCode(input.value.trim()); if (d) img.src = d; };
    input.addEventListener('input', () => { clearTimeout(input._t); input._t = setTimeout(draw, 250); });
    body.append(
      el('p', { class: 'note' }, 'امسح الرمز بكاميرا موبايلك علشان تفتح الصفحة دي عليه.'),
      el('div', { class: 'qrbox' }, img), input,
      el('div', { class: 'btnrow' },
        el('button', { class: 'primary', onclick: () => { const a = el('a', { href: img.src, download: 'qr-code.png' }); a.click(); } }, 'تنزيل الصورة'),
        el('button', { onclick: async () => { await navigator.clipboard.writeText(input.value); toast('تم نسخ الرابط'); } }, 'نسخ الرابط')));
    draw();
  },
  share(body) {
    const t = state.active;
    const url = t && /^https?:/.test(t.url) ? t.url : '';
    if (!url) { body.append(el('p', { class: 'note' }, 'افتح صفحة موقع الأول علشان تشاركها.')); return; }
    const u = encodeURIComponent(url), title = encodeURIComponent(t.title || '');
    const targets = [
      ['واتساب', `https://wa.me/?text=${title}%20${u}`, '#25d366'],
      ['فيسبوك', `https://www.facebook.com/sharer/sharer.php?u=${u}`, '#1877f2'],
      ['تليجرام', `https://t.me/share/url?url=${u}&text=${title}`, '#229ed9'],
      ['X (تويتر)', `https://twitter.com/intent/tweet?url=${u}&text=${title}`, '#111'],
      ['ماسنجر', `https://www.facebook.com/dialog/send?link=${u}&app_id=291494419107518&redirect_uri=${u}`, '#a033ff'],
      ['لينكدإن', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, '#0a66c2']
    ];
    const grid = el('div', { class: 'sharegrid' });
    for (const [name, link, color] of targets) {
      grid.append(el('button', { style: `--brand:${color}`, onclick: () => { closePanel(); createTab({ url: link }); } },
        el('span', { class: 'dot' }), name));
    }
    grid.append(el('button', { style: '--brand:#5f6368', onclick: async () => { await navigator.clipboard.writeText(url); toast('تم نسخ الرابط'); } }, el('span', { class: 'dot' }), 'نسخ الرابط'));
    grid.append(el('button', { style: '--brand:#188038', onclick: () => openPanel('qr') }, el('span', { class: 'dot' }), 'رمز QR'));
    body.append(el('p', { class: 'note', dir: 'auto' }, t.title || url), grid);
  },
  tabsearch(body) {
    const input = el('input', { class: 'qrurl', placeholder: 'ابحث في التبويبات المفتوحة', dir: 'auto' });
    const list = el('div', { class: 'tslist' });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      const rows = state.tabs.filter(t => !q || (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
      for (const t of rows) {
        const fav = t.favicon ? el('img', { src: t.favicon, alt: '' }) : el('span', { class: 'ph' });
        list.append(el('button', { class: t === state.active ? 'on' : '', onclick: () => { activate(t); closePanel(); } },
          fav, el('span', { class: 'tt' }, el('b', {}, t.title || 'تبويب جديد'), el('small', { dir: 'ltr' }, t.url === NEWTAB ? '' : t.url))));
      }
      if (!rows.length) list.append(el('p', { class: 'note' }, 'مفيش تبويبات بالاسم ده.'));
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = list.querySelector('button'); if (b) b.click(); } });
    body.append(input, list);
    draw();
    setTimeout(() => input.focus(), 50);
  },
  namewin(body) {
    const input = el('input', { class: 'qrurl', value: state.windowName || '', placeholder: 'مثلاً: الشغل، المذاكرة، الإعلانات', dir: 'auto' });
    const save = async () => {
      await setWindowName(input.value.trim());
      closePanel(); toast(state.windowName ? 'تم تسمية النافذة' : 'تم مسح اسم النافذة');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    body.append(el('p', { class: 'note' }, 'الاسم بيظهر في شريط المهام في ويندوز وفوق التبويبات، علشان تفرق بين النوافذ.'), input,
      el('div', { class: 'btnrow' }, el('button', { class: 'primary', onclick: save }, 'حفظ'),
        el('button', { onclick: () => { input.value = ''; save(); } }, 'مسح الاسم')));
    setTimeout(() => { input.focus(); input.select(); }, 50);
  },
  tasks(body) {
    const table = el('div', { class: 'tasktable' });
    let selected = null;
    const endBtn = el('button', { class: 'danger', disabled: true, onclick: async () => {
      if (!selected) return;
      const tab = state.tabs.find(t => t.webview && t.ready && safeWcId(t) === selected);
      if (tab) closeTab(tab); else await api.taskEnd(selected);
      selected = null; endBtn.disabled = true; draw();
    } }, 'إنهاء العملية');
    const draw = async () => {
      if (state.panel !== 'tasks') return;
      const rows = await api.taskList();
      table.innerHTML = '';
      table.append(el('div', { class: 'trow head' }, el('span', {}, 'المهمة'), el('span', {}, 'الذاكرة'), el('span', {}, 'المعالج'), el('span', {}, 'المعرّف')));
      for (const r of rows) {
        const tab = r.wcId && state.tabs.find(t => t.webview && t.ready && safeWcId(t) === r.wcId);
        const name = tab ? `تبويب: ${tab.title}` : r.name;
        const row = el('div', { class: 'trow' + (selected && selected === r.wcId ? ' sel' : '') },
          el('span', { class: 'tn', title: r.url || '' }, name), el('span', {}, (r.mem / 1024).toFixed(1) + ' م.ب'),
          el('span', {}, r.cpu.toFixed(1) + '%'), el('span', {}, String(r.pid)));
        if (r.wcId) row.addEventListener('click', () => { selected = r.wcId; endBtn.disabled = false; draw(); });
        table.append(row);
      }
      clearTimeout(table._t); table._t = setTimeout(draw, 2000);
    };
    body.append(el('p', { class: 'note' }, 'استهلاك كل تبويب وعملية للذاكرة والمعالج. اختار تبويب واضغط «إنهاء العملية» لو معلّق.'), table, el('div', { class: 'btnrow' }, endBtn));
    draw();
  }
};
function safeWcId(t) { try { return t.webview.getWebContentsId(); } catch { return null; } }
Object.assign(panels, extraPanels);
Object.assign(panelTitles, { qr: 'رمز الاستجابة السريعة (QR)', share: 'مشاركة الصفحة', tabsearch: 'البحث في التبويبات', namewin: 'تسمية النافذة', tasks: 'مدير المهام' });

async function setWindowName(name) {
  state.windowName = name || '';
  await api.setWindowTitle(state.windowName);
  document.documentElement.dataset.winName = state.windowName;
  $('#winName').textContent = state.windowName;
  $('#winName').classList.toggle('hidden', !state.windowName);
  saveSession();
}
const activeWV = () => state.active && state.active.webview;
Object.assign(commands, {
  'clear-data': () => openSettingsPage('privacy'),
  'performance': () => openSettingsPage('performance'),
  'customize': () => openSettingsPage('appearance'),
  'lens-page': () => { const w = activeWV(); if (w) api.lensPage(w.getWebContentsId()); else createTab({ url: 'https://lens.google.com/' }); },
  'edit-cut': () => { const w = activeWV(); if (w) w.cut(); },
  'edit-copy': () => { const w = activeWV(); if (w) w.copy(); },
  'edit-paste': () => { const w = activeWV(); if (w) w.paste(); },
  'copy-link': async () => { const t = state.active; if (t && t.url !== NEWTAB) { await navigator.clipboard.writeText(t.url); toast('تم نسخ الرابط'); } },
  'qr-code': () => openPanel('qr'),
  'share-page': () => openPanel('share'),
  'search-tabs': () => openPanel('tabsearch'),
  'name-window': () => openPanel('namewin'),
  'task-manager': () => openPanel('tasks'),
  'show-tab-list': () => setTimeout(() => showTabList($('#tabListBtn')), 0),
  'toggle-bookmarks-bar': async () => {
    state.settings = await api.saveSettings({ showBookmarksBar: state.settings.showBookmarksBar === false });
    document.body.classList.toggle('hide-bookmarks', state.settings.showBookmarksBar === false);
  },
  'check-updates': async () => {
    toast('بندوّر على تحديثات...');
    try {
      const r = await api.checkUpdates();
      if (r && r.upToDate) toast(`إنت على آخر نسخة ✓ (${r.version})`);
      else if (r && r.error) toast('مقدرناش نوصل لسيرفر التحديثات');
    } catch { toast('مقدرناش نوصل لسيرفر التحديثات'); }
  },
  'help-center': () => createTab({ url: 'https://alalamy-browser.a7medxml.workers.dev/' }),
  'exit': () => api.quitApp()
});
for (const k of ['zoom-in', 'zoom-out', 'zoom-reset']) {
  const f = commands[k];
  commands[k] = () => { f(); updateMenuZoom(); };
}
