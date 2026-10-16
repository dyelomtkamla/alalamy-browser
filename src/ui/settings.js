'use strict';
/* صفحة الإعدادات الكاملة بقائمة جانبية زي كروم */

const ZOOM_OPTIONS = [67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
const zoomLevelFor = (pct) => Math.log((pct || 100) / 100) / Math.log(1.2);
const defaultZoomLevel = () => zoomLevelFor(state.settings && state.settings.defaultZoom);

const SETTINGS_SECTIONS = [
  ['autofill', 'key', 'الملء التلقائي وكلمات المرور'],
  ['privacy', 'shield', 'الخصوصية والأمان'],
  ['performance', 'gauge', 'الأداء'],
  ['appearance', 'palette', 'المظهر'],
  ['search', 'search', 'محرك البحث'],
  ['default', 'window', 'المتصفح الافتراضي'],
  ['startup', 'power', 'عند بدء التشغيل'],
  '-',
  ['languages', 'translate', 'اللغات والترجمة'],
  ['downloads', 'download', 'عمليات التنزيل'],
  ['accessibility', 'person', 'تسهيل الاستخدام'],
  ['system', 'wrench', 'النظام'],
  ['reset', 'reset', 'إعادة ضبط الإعدادات'],
  '-',
  ['extensions', 'puzzle', 'الإضافات'],
  ['about', 'info', 'حول متصفح العالمي']
];

async function saveSetting(patch) {
  state.settings = await api.saveSettings(patch);
  applySettingsUI();
  toast('تم الحفظ');
}

// تطبيق الإعدادات اللي ليها أثر على الواجهة
function applySettingsUI() {
  document.body.classList.toggle('hide-bookmarks', state.settings.showBookmarksBar === false);
}

function settingRow(title, desc, control) {
  return el('div', { class: 'srow' },
    el('div', { class: 'stext' }, el('div', { class: 'stitle' }, title), desc ? el('div', { class: 'sdesc' }, desc) : null),
    control ? el('div', { class: 'sctl' }, control) : null);
}
function toggle(key, onChange) {
  const i = el('input', { type: 'checkbox', class: 'switch', ...(state.settings[key] !== false ? { checked: '' } : {}) });
  i.addEventListener('change', async () => { await saveSetting({ [key]: i.checked }); if (onChange) onChange(i.checked); });
  return i;
}
function selectOf(options, value, onChange) {
  const s = el('select', {}, ...options.map(([v, l]) => el('option', { value: v, ...(String(v) === String(value) ? { selected: '' } : {}) }, l)));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
function card(...children) { return el('div', { class: 'scard' }, ...children); }
// إعادة استخدام لوحات السجل وكلمات المرور وغيرها داخل الصفحة
function embedPanel(name) {
  const box = el('div', { class: 'sembed' });
  panels[name](box);
  return box;
}

const settingsSections = {
  autofill() {
    const count = el('span', {}, 'كلمات المرور');
    api.listPasswords().then(l => { count.textContent = `كلمات المرور (${l.filter(p => !p.never).length})`; });
    const ico = (n) => { const s = el('span'); s.innerHTML = window.icon(n); return s; };
    return [card(settingRow('مدير كلمات المرور', 'المتصفح بيعرض حفظ كلمة المرور بعد تسجيل الدخول ويملأها تلقائياً بعد كده. محفوظة مشفرة بتشفير ويندوز.'),
        el('div', { class: 'pwgrid' }, el('div', {}, ico('key'), count), el('div', {}, ico('shield'), 'مشفرة على جهازك بس'))),
      card(embedPanel('passwords'))];
  },
  privacy() {
    const allowList = el('div', { class: 'adallow' });
    const drawAllow = () => {
      allowList.innerHTML = '';
      const list = state.settings.adAllow || [];
      if (!list.length) allowList.append(el('div', { class: 'sdesc' }, 'مفيش مواقع مسموح فيها بالإعلانات. تقدر تسمح لموقع من زرار الدرع 🛡 جنب شريط العنوان.'));
      for (const h of list) {
        allowList.append(el('div', { class: 'srow' }, el('div', { class: 'stext' }, h),
          el('button', { onclick: async () => { state.settings = await api.adblockAllow('https://' + h + '/', false); drawAllow(); } }, 'شيل')));
      }
    };
    drawAllow();
    return [card(
      settingRow('مانع الإعلانات', 'بيمنع إعلانات يوتيوب (قبل الفيديو وفي النص) وإعلانات المواقع والنوافذ المزعجة والمتتبعات. بيستخدم نفس قوايم uBlock Origin و EasyList وبيحدّثها لوحده.', toggle('adblock')),
      settingRow('تحديث قوايم الإعلانات', 'بتتحدث لوحدها كل 3 أيام.',
        el('button', { onclick: async () => { toast('بنحدّث...'); const r = await api.adblockUpdate(); toast(r.ok ? 'اتحدثت ✅' : 'ما نجحش، اتأكد من الإنترنت'); } }, 'تحديث دلوقتي')),
      el('div', { class: 'stitle', style: 'margin:10px 0 4px' }, 'مواقع مسموح فيها بالإعلانات'), allowList),
      card(
      settingRow('مسح السجل والكاش', 'يمسح سجل التصفح والملفات المؤقتة. الحسابات تفضل مسجلة.',
        el('button', { onclick: async () => { if (confirm('مسح السجل والكاش؟')) { await api.clearHistory({ cache: true }); toast('تم'); } } }, 'مسح')),
      settingRow('مسح كل البيانات', 'يسجل خروجك من كل الحسابات ويمسح الكوكيز والسجل.',
        el('button', { class: 'danger', onclick: async () => { if (confirm('سيتم تسجيل خروجك من كل الحسابات. متابعة؟')) { await api.clearHistory({ cache: true, cookies: true }); toast('تم'); } } }, 'مسح الكل')),
      settingRow('تصفح خفي', 'تبويب لا يحفظ أي شيء ويتمسح كل حاجة فيه عند قفله.',
        el('button', { onclick: () => { closeSettingsPage(); commands['new-temp-tab'](); } }, 'فتح تبويب خفي'))),
      card(el('div', { class: 'stitle', style: 'margin-bottom:8px' }, 'السجل'), embedPanel('history'))];
  },
  performance() {
    return [card(
      settingRow('تنويم التبويبات غير المستخدمة', 'يوفر الذاكرة مع التبويبات الكتير. التبويب النائم يصحى لما تضغط عليه.',
        selectOf([[0, 'أبداً'], [10, 'بعد 10 دقائق'], [30, 'بعد 30 دقيقة'], [60, 'بعد ساعة'], [180, 'بعد 3 ساعات']],
          Number(state.settings.sleepMinutes ?? 30), (v) => saveSetting({ sleepMinutes: Number(v) }))),
      settingRow('تنويم كل التبويبات دلوقتي', 'ما عدا التبويب المفتوح قدامك.',
        el('button', { onclick: () => commands['sleep-all']() }, 'تنويم')))];
  },
  appearance() {
    return [card(
      settingRow('المظهر', 'فاتح أو داكن أو حسب ويندوز.',
        selectOf([['system', 'حسب النظام'], ['light', 'فاتح'], ['dark', 'داكن']], state.settings.theme || 'system', (v) => saveSetting({ theme: v }))),
      settingRow('إظهار شريط المفضلة', null, toggle('showBookmarksBar')),
      settingRow('الشريط الجانبي (واتساب وماسنجر وتليجرام)', 'شريط صغير على جنب الشاشة بيفتح المراسلة جنب الصفحة زي أوبرا.', toggle('showSidebar', () => applySidebar())),
      settingRow('عرض الأخبار في صفحة التبويب الجديد', 'أخبار من بي بي سي عربي وأخبار جوجل تحت الاختصارات.', toggle('showFeed')),
      settingRow('إرجاع الاختصارات المخفية', 'لو شلت اختصار من صفحة التبويب الجديد ترجعه من هنا.',
        el('button', { onclick: () => saveSetting({ hiddenShortcuts: [] }) }, 'إرجاع')),
      settingRow('الصفحة الرئيسية', 'اللي بتفتح لما تضغط زرار البيت.', (() => {
        const i = el('input', { type: 'text', dir: 'ltr', value: state.settings.homepage === NEWTAB ? '' : state.settings.homepage, placeholder: 'صفحة التبويب الجديد' });
        i.addEventListener('change', () => saveSetting({ homepage: i.value.trim() || NEWTAB }));
        return i;
      })()))];
  },
  search() {
    return [card(settingRow('محرك البحث المستخدم في شريط العنوان', null,
      selectOf([['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo'], ['yahoo', 'Yahoo']],
        state.settings.searchEngine, (v) => saveSetting({ searchEngine: v }))))];
  },
  default() {
    const row = el('div');
    (async () => {
      const st = await api.defaultBrowserStatus();
      row.append(settingRow('المتصفح الافتراضي',
        st.isDefault === true ? '✅ متصفح العالمي هو المتصفح الافتراضي.' : 'خلي اللينكات اللي بتفتحها من واتساب والإيميل والبرامج التانية تفتح في متصفح العالمي.',
        st.isDefault === true ? null : el('button', { class: 'primary', onclick: async () => {
          await api.setDefaultBrowser();
          toast(st.canOpenSettings ? 'اختار «متصفح العالمي» من صفحة ويندوز اللي اتفتحت' : 'تم');
        } }, st.canOpenSettings ? 'اختيار المتصفح الافتراضي' : 'اجعله الافتراضي')));
    })();
    return [card(row)];
  },
  startup() {
    const s = state.settings;
    const mode = s.restoreTabs ? 'restore' : (s.homepage && s.homepage !== NEWTAB ? 'page' : 'newtab');
    const radio = (v, label) => {
      const r = el('input', { type: 'radio', name: 'startup', value: v, ...(mode === v ? { checked: '' } : {}) });
      r.addEventListener('change', () => {
        if (v === 'restore') saveSetting({ restoreTabs: true });
        else if (v === 'newtab') saveSetting({ restoreTabs: false, homepage: NEWTAB });
        else { saveSetting({ restoreTabs: false }); url.focus(); }
      });
      return el('label', { class: 'sradio' }, r, ' ', label);
    };
    const url = el('input', { type: 'text', dir: 'ltr', placeholder: 'https://', value: s.homepage === NEWTAB ? '' : s.homepage });
    url.addEventListener('change', () => saveSetting({ restoreTabs: false, homepage: url.value.trim() || NEWTAB }));
    return [card(
      radio('newtab', 'فتح صفحة «تبويب جديد»'),
      radio('restore', 'متابعة من حيث توقفت (ترجع التبويبات اللي كانت مفتوحة)'),
      radio('page', 'فتح صفحة معينة'),
      el('div', { class: 'sindent' }, url))];
  },
  languages() {
    return [card(settingRow('ترجمة الصفحات إلى', 'اللغة اللي زرار 🌐 بيترجم ليها الصفحات.',
      selectOf(Object.entries(LANGS), state.settings.translateTo || 'ar', (v) => saveSetting({ translateTo: v })))),
      card(el('div', { class: 'stitle', style: 'margin-bottom:8px' }, 'المترجم'), embedPanel('translate'))];
  },
  downloads() {
    const loc = el('span', { dir: 'ltr', class: 'sdesc' }, state.settings.downloadDir || state.downloadsDefault || 'Downloads');
    return [card(
      settingRow('مكان الحفظ', loc, el('div', { class: 'btnrow' },
        el('button', { onclick: async () => { state.settings = await api.chooseDownloadDir(); openSettingsPage('downloads'); } }, 'تغيير'),
        state.settings.downloadDir ? el('button', { onclick: () => saveSetting({ downloadDir: '' }).then(() => openSettingsPage('downloads')) }, 'الافتراضي') : null)),
      settingRow('اسألني عن مكان حفظ كل ملف قبل التنزيل', null, toggle('askDownload'))),
      card(el('div', { class: 'stitle', style: 'margin-bottom:8px' }, 'التنزيلات'), embedPanel('downloads'))];
  },
  accessibility() {
    return [card(
      settingRow('حجم الصفحات الافتراضي', 'بيتطبق على التبويبات الجديدة. لتكبير صفحة واحدة استخدم Ctrl و + أو -.',
        selectOf(ZOOM_OPTIONS.map(z => [z, z + '%']), state.settings.defaultZoom || 100, (v) => saveSetting({ defaultZoom: Number(v) }))),
      settingRow('البحث في الصفحة', 'Ctrl+F', null),
      settingRow('ملء الشاشة', 'F11', null))];
  },
  system() {
    return [card(
      settingRow('استخدام تسريع الأجهزة عند توفره', 'بيخلي الفيديو والصفحات أنعم. اقفله لو الشاشة بتعلّق أو بتظهر سودا. محتاج إعادة تشغيل.',
        toggle('hardwareAcceleration', () => {
          if (confirm('لازم المتصفح يعيد تشغيل نفسه علشان التغيير يتطبق. إعادة التشغيل دلوقتي؟')) api.relaunch();
        })),
      settingRow('أدوات المطور', 'F12', el('button', { onclick: () => commands.devtools() }, 'فتح')))];
  },
  reset() {
    return [card(settingRow('استعادة الإعدادات الأصلية', 'بيرجع كل الإعدادات للوضع الافتراضي. الحسابات وكلمات المرور والسجل والمفضلة مش هتتمسح.',
      el('button', { class: 'danger', onclick: async () => {
        if (!confirm('إعادة كل الإعدادات للوضع الافتراضي؟')) return;
        state.settings = await api.resetSettings();
        applySettingsUI(); toast('تمت إعادة الضبط'); openSettingsPage('reset');
      } }, 'إعادة الضبط')))];
  },
  extensions() {
    return [card(embedPanel('extensions'))];
  },
  about() {
    return [card(embedPanel('about'))];
  }
};

function openSettingsPage(section = 'autofill') {
  hidePopups();
  if (typeof closePanel === 'function') closePanel();
  const page = $('#settingsPage');
  page.classList.remove('hidden');
  page.dataset.section = section;
  const nav = $('#settingsNav'); nav.innerHTML = '';
  for (const item of SETTINGS_SECTIONS) {
    if (item === '-') { nav.append(el('hr')); continue; }
    const [key, icon, label] = item;
    nav.append(el('button', { class: key === section ? 'active' : '', onclick: () => openSettingsPage(key) },
      (() => { const sp = el('span', { class: 'sicon' }); sp.innerHTML = window.icon(icon); return sp; })(), label));
  }
  const main = $('#settingsMain'); main.innerHTML = '';
  const label = SETTINGS_SECTIONS.find(x => x[0] === section)[2];
  main.append(el('h2', {}, label), ...settingsSections[section]());
  $('#settingsSearch').value = '';
}
function closeSettingsPage() { $('#settingsPage').classList.add('hidden'); }

// البحث في الإعدادات: يعرض كل الأقسام ويخفي اللي مش مطابق
function searchSettings(q) {
  q = q.trim();
  const main = $('#settingsMain'); main.innerHTML = '';
  if (!q) return openSettingsPage($('#settingsPage').dataset.section || 'autofill');
  for (const item of SETTINGS_SECTIONS) {
    if (item === '-' || ['extensions', 'about', 'autofill'].includes(item[0]) && !item[2].includes(q)) continue;
    const [key, , label] = item;
    const cards = settingsSections[key]().filter(c => label.includes(q) || c.textContent.includes(q));
    if (cards.length) main.append(el('h2', {}, label), ...cards);
  }
  if (!main.children.length) main.append(el('div', { class: 'empty' }, 'مفيش نتايج'));
}

function bindSettingsPage() {
  $('#settingsClose').addEventListener('click', closeSettingsPage);
  $('#settingsSearch').addEventListener('input', (e) => searchSettings(e.target.value));
  commands['show-settings'] = () => openSettingsPage('autofill');
  commands['show-about'] = () => openSettingsPage('about');
  commands['show-extensions'] = () => openSettingsPage('extensions');
  commands['show-passwords'] = () => openSettingsPage('autofill');
  applySettingsUI();
}
