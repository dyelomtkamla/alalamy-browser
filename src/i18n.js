'use strict';
// لغة واجهة المتصفح: الواجهة مكتوبة بالعربي، وأي لغة تانية بتتترجم مرة واحدة (ترجمة جوجل)
// وبتتحفظ في userData/i18n/<lang>.json فتشتغل بعد كده من غير إنترنت وبسرعة
const fs = require('fs');
const path = require('path');

// اللغات اللي بتظهر في الاختيار (الاسم بلغته). الكود هو كود ترجمة جوجل
const UI_LANGS = [
  ['ar', 'العربية'], ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'], ['it', 'Italiano'],
  ['pt', 'Português'], ['ru', 'Русский'], ['tr', 'Türkçe'], ['fa', 'فارسی'], ['ur', 'اردو'], ['hi', 'हिन्दी'],
  ['bn', 'বাংলা'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['zh-CN', '中文 (简体)'], ['zh-TW', '中文 (繁體)'],
  ['ja', '日本語'], ['ko', '한국어'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['tl', 'Filipino'], ['nl', 'Nederlands'],
  ['sv', 'Svenska'], ['no', 'Norsk'], ['da', 'Dansk'], ['fi', 'Suomi'], ['pl', 'Polski'], ['cs', 'Čeština'],
  ['sk', 'Slovenčina'], ['hu', 'Magyar'], ['ro', 'Română'], ['bg', 'Български'], ['el', 'Ελληνικά'], ['uk', 'Українська'],
  ['sr', 'Српски'], ['hr', 'Hrvatski'], ['sq', 'Shqip'], ['iw', 'עברית'], ['ku', 'Kurdî'], ['ckb', 'کوردی'],
  ['ps', 'پښتو'], ['sd', 'سنڌي'], ['pa', 'ਪੰਜਾਬੀ'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['ml', 'മലയാളം'], ['mr', 'मराठी'],
  ['ne', 'नेपाली'], ['si', 'සිංහල'], ['my', 'မြန်မာ'], ['km', 'ខ្មែរ'], ['kk', 'Қазақ'], ['uz', 'Oʻzbek'], ['az', 'Azərbaycan'],
  ['hy', 'Հայերեն'], ['ka', 'ქართული'], ['sw', 'Kiswahili'], ['am', 'አማርኛ'], ['so', 'Soomaali'], ['ha', 'Hausa'],
  ['yo', 'Yorùbá'], ['zu', 'isiZulu'], ['af', 'Afrikaans'], ['ca', 'Català'], ['ug', 'ئۇيغۇرچە'], ['tg', 'Тоҷикӣ']
];
const RTL = new Set(['ar', 'fa', 'ur', 'iw', 'he', 'ps', 'ckb', 'sd', 'ug', 'yi', 'dv']);
const AR = /[؀-ۿ]/;

let lang = 'ar';
let dict = {};
let dir = '';
let translator = null;
const pending = new Set();
let timer = null;
let saveTimer = null;
const listeners = new Set();

function setup(opts) { dir = path.join(opts.userData, 'i18n'); translator = opts.translator; }
function file(l) { return path.join(dir, l.replace(/[^\w-]/g, '') + '.json'); }
function load(l) {
  try { return JSON.parse(fs.readFileSync(file(l), 'utf8')); } catch { return {}; }
}
function setLang(l) {
  l = UI_LANGS.some(x => x[0] === l) ? l : 'ar';
  if (l === lang) return;
  lang = l; dict = l === 'ar' ? {} : load(l);
  pending.clear();
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const keys = Object.keys(dict);
      if (keys.length > 30000) for (const k of keys.slice(0, keys.length - 30000)) delete dict[k];
      fs.writeFile(file(lang), JSON.stringify(dict), () => {});
    } catch { /* ignore */ }
  }, 1500);
}
// ترجمة نصوص ناقصة (دفعة واحدة) — بترجع القاموس للنصوص المطلوبة
async function ensure(list) {
  const want = lang;
  if (want === 'ar' || !translator) return {};
  const missing = [...new Set(list.map(s => String(s).trim()).filter(s => s && s.length < 600 && AR.test(s) && !(s in dict)))];
  for (let i = 0; i < missing.length; i += 120) {
    const part = missing.slice(i, i + 120);
    try {
      const r = await translator.translateMany(part, want, 'ar');
      if (want !== lang) return {};
      part.forEach((s, k) => { const t = r.texts[k]; if (t && t.trim()) dict[s] = t.trim(); });
    } catch { break; }
  }
  if (missing.length) { save(); for (const fn of listeners) try { fn(); } catch { /* ignore */ } }
  const out = {};
  for (const s of list) { const k = String(s).trim(); if (dict[k]) out[k] = dict[k]; }
  return out;
}
function queue(k) {
  pending.add(k);
  clearTimeout(timer);
  timer = setTimeout(() => { const l = [...pending]; pending.clear(); ensure(l); }, 300);
}
// ترجمة فورية من القاموس (والناقص بيتترجم في الخلفية للمرة الجاية)
function t(s) {
  if (lang === 'ar' || typeof s !== 'string' || !AR.test(s)) return s;
  const k = s.trim();
  if (dict[k]) return s.replace(k, dict[k]);
  queue(k);
  return s;
}
// القوائم ورسائل النظام اللي بتطلع من العملية الرئيسية
function patchElectron({ Menu, dialog }) {
  const fixItems = (items) => (items || []).map((it) => {
    if (!it || typeof it !== 'object') return it;
    const c = Object.assign({}, it);
    if (c.label) c.label = t(c.label);
    if (c.sublabel) c.sublabel = t(c.sublabel);
    if (c.toolTip) c.toolTip = t(c.toolTip);
    if (Array.isArray(c.submenu)) c.submenu = fixItems(c.submenu);
    return c;
  });
  const build = Menu.buildFromTemplate.bind(Menu);
  Menu.buildFromTemplate = (tpl) => build(lang === 'ar' ? tpl : fixItems(tpl));
  const fixOpts = (o) => {
    if (lang === 'ar' || !o || typeof o !== 'object') return o;
    const c = Object.assign({}, o);
    for (const k of ['title', 'message', 'detail', 'checkboxLabel', 'buttonLabel']) if (typeof c[k] === 'string') c[k] = t(c[k]);
    if (Array.isArray(c.buttons)) c.buttons = c.buttons.map(t);
    return c;
  };
  for (const fn of ['showMessageBox', 'showMessageBoxSync', 'showSaveDialog', 'showSaveDialogSync', 'showOpenDialog', 'showOpenDialogSync']) {
    const orig = dialog[fn].bind(dialog);
    dialog[fn] = (...args) => orig(...args.map(a => (a && typeof a === 'object' && !a.webContents && !a.isDestroyed) ? fixOpts(a) : a));
  }
}

module.exports = {
  UI_LANGS, RTL, setup, setLang, ensure, t, patchElectron,
  get lang() { return lang; },
  get dict() { return dict; },
  onChange: (fn) => listeners.add(fn)
};
