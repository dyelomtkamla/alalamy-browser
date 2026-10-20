'use strict';
/* كليك يمين في واجهة المتصفح نفسها (شريط العنوان، مربع البحث، الصفحة الرئيسية، المفضلة) بنفس شكل كروم.
   الكليك اليمين جوه المواقع بيتعمل في main.js (pageMenu). */

const SEP = { type: 'separator' };

function editableItems(t) {
  const sel = (t.selectionStart ?? 0) !== (t.selectionEnd ?? 0);
  const urlBox = t.id === 'address' || t.id === 'ntInput';
  return [
    { role: 'emoji', label: 'رموز تعبيرية', accelerator: 'Super+.' }, SEP,
    { role: 'undo', label: 'تراجع' }, { role: 'redo', label: 'إعادة' }, SEP,
    { role: 'cut', label: 'قص', enabled: sel }, { role: 'copy', label: 'نسخ', enabled: sel },
    { role: 'paste', label: 'لصق' },
    urlBox ? { id: 'paste-go', label: t.id === 'address' ? 'لصق والانتقال' : 'لصق والبحث' } : { role: 'pasteAndMatchStyle', label: 'لصق كنص عادي' },
    { role: 'selectAll', label: 'تحديد الكل' }
  ];
}

function linkItems(a) {
  const items = [
    { id: 'open', label: 'فتح' },
    { id: 'open-bg', label: 'فتح في تبويب جديد' },
    { id: 'open-temp', label: 'فتح في نافذة التصفح المتخفي' }, SEP,
    { id: 'copy-link', label: 'نسخ عنوان الرابط' }
  ];
  if (a.dataset.sc) items.push(SEP, { id: 'remove-sc', label: 'إزالة الاختصار' });
  if (a.dataset.bm) items.push(SEP, { id: 'remove-bm', label: 'إزالة من المفضلة' });
  return items;
}

function homeItems() {
  return [
    { label: 'رجوع', accelerator: 'Alt+Left', enabled: false },
    { label: 'تقدم', accelerator: 'Alt+Right', enabled: false },
    { id: 'home-reload', label: 'إعادة تحميل', accelerator: 'CmdOrCtrl+R' }, SEP,
    { id: 'interests', label: '✨ اختيار مجالك واهتماماتك' },
    { id: 'toggle-feed', label: state.settings.showFeed === false ? 'إظهار الأخبار' : 'إخفاء الأخبار' }, SEP,
    { id: 'new-tab', label: 'علامة تبويب جديدة', accelerator: 'CmdOrCtrl+T' },
    { id: 'new-temp', label: 'نافذة جديدة للتصفح المتخفي', accelerator: 'CmdOrCtrl+Shift+N' }
  ];
}

async function runMenuChoice(id, ctx) {
  const url = ctx.url;
  switch (id) {
    case 'paste-go': {
      const text = ((await api.readClipboard()) || '').trim();
      if (!text) return;
      if (ctx.target) ctx.target.value = '';
      navigate(text);
      return;
    }
    case 'open': return navigate(url);
    case 'open-bg': createTab({ url, background: true }); return toast('اتفتح في تبويب جديد');
    case 'open-temp': return api.newWindow({ incognito: true, url });
    case 'copy-link': await navigator.clipboard.writeText(url); return toast('تم نسخ الرابط');
    case 'copy-text': return navigator.clipboard.writeText(ctx.text);
    case 'search-text': return createTab({ url: await api.searchURL(ctx.text) });
    case 'remove-sc': {
      state.settings = await api.saveSettings({ hiddenShortcuts: [...(state.settings.hiddenShortcuts || []), ctx.el.dataset.sc] });
      return renderSpeedDial();
    }
    case 'remove-bm': {
      state.bookmarks = await api.saveBookmarks(state.bookmarks.filter(b => b.id !== ctx.el.dataset.bm));
      renderBookmarksBar(); return updateNav();
    }
    case 'home-reload': nt.newsLoaded = 0; return renderSpeedDial();
    case 'interests': return openInterests();
    case 'toggle-feed':
      state.settings = await api.saveSettings({ showFeed: state.settings.showFeed === false });
      nt.newsLoaded = 0; $('#ntFeed').innerHTML = ''; return renderFeed();
    case 'new-tab': return run('new-tab');
    case 'new-temp': return run('new-temp-tab');
  }
}

document.addEventListener('contextmenu', async (e) => {
  const t = e.target;
  // التبويبات ليها قايمتها الخاصة
  if (t.closest('.tab')) return;
  let items = null;
  const ctx = {};
  const editable = t.closest('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]), textarea, [contenteditable=""], [contenteditable=true]');
  const link = t.closest('[data-url]');
  const selText = String(window.getSelection() || '').trim();
  if (editable) {
    items = editableItems(editable);
    ctx.target = editable;
  } else if (selText) {
    const short = selText.length > 40 ? selText.slice(0, 40) + '…' : selText;
    ctx.text = selText;
    items = [{ id: 'copy-text', label: 'نسخ', accelerator: 'CmdOrCtrl+C' }, { id: 'search-text', label: `البحث عن "${short}"` }];
  } else if (link) {
    ctx.url = link.dataset.url; ctx.el = link;
    items = linkItems(link);
  } else if (t.closest('#newtab')) {
    items = homeItems();
  }
  if (!items) return;
  e.preventDefault();
  const id = await api.uiMenu(items);
  if (id) runMenuChoice(id, ctx);
});
