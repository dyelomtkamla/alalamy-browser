'use strict';
/* صفحة «الملء التلقائي وكلمات المرور» زي chrome://settings/autofill بكل أقسامها،
   شريط «حفظ العنوان/البطاقة؟»، طلبات أذونات المواقع، الإشارات المرجعية المخفية، قائمة القراءة،
   وأوامر جديدة من كروم وفايرفوكس (حفظ PDF، قفل التبويبات المكررة، فحص كلمات المرور ومولّد كلمة مرور قوية). */

const AF_FORMS = {
  addresses: { title: 'العناوين', one: 'عنوان', icon: '✉', fields: [['name', 'الاسم بالكامل'], ['org', 'الشركة / المؤسسة'], ['street', 'عنوان الشارع', 'area'], ['city', 'المدينة'], ['state', 'المحافظة'], ['zip', 'الرمز البريدي'], ['country', 'الدولة'], ['phone', 'رقم الهاتف', 'tel'], ['email', 'البريد الإلكتروني', 'email']],
    line: (x) => [x.name, x.street, x.city].filter(Boolean).join('، ') || x.phone || x.email },
  cards: { title: 'بطاقات الائتمان والسحب الآلي', one: 'بطاقة', icon: '💳', secret: 'رقم البطاقة', fields: [['name', 'الاسم على البطاقة'], ['expMonth', 'شهر الانتهاء (MM)', 'mm'], ['expYear', 'سنة الانتهاء (YYYY)', 'yyyy'], ['nick', 'اسم مختصر (اختياري)']],
    line: (x) => `${x.brand || 'بطاقة'} •••• ${x.last4}${x.expMonth ? ` · تنتهي ${x.expMonth}/${String(x.expYear).slice(-2)}` : ''}${x.nick ? ` · ${x.nick}` : ''}` },
  ibans: { title: 'أرقام الحسابات بصيغة IBAN', one: 'رقم IBAN', icon: '🏦', secret: 'رقم IBAN', fields: [['nick', 'اسم الحساب (مثلاً: بنك مصر)']],
    line: (x) => `${x.nick || 'IBAN'} · •••• ${x.last4}` },
  loyalty: { title: 'بطاقات الولاء', one: 'بطاقة ولاء', icon: '🎁', fields: [['program', 'المتجر أو البرنامج'], ['name', 'الاسم'], ['number', 'رقم العضوية']],
    line: (x) => `${x.program || 'بطاقة ولاء'} · ${x.number || ''}` },
  licenses: { title: 'رخص القيادة', one: 'رخصة قيادة', icon: '🚗', secret: 'رقم الرخصة', fields: [['name', 'الاسم'], ['country', 'الدولة'], ['region', 'المحافظة / الولاية'], ['issued', 'تاريخ الإصدار', 'date'], ['expiry', 'تاريخ الانتهاء', 'date']],
    line: (x) => `${x.name || 'رخصة'} · •••• ${x.last4}${x.expiry ? ' · تنتهي ' + x.expiry : ''}` },
  idcards: { title: 'بطاقات الهوية', one: 'بطاقة هوية', icon: '🪪', secret: 'الرقم القومي / رقم الهوية', fields: [['name', 'الاسم'], ['country', 'الدولة'], ['issued', 'تاريخ الإصدار', 'date'], ['expiry', 'تاريخ الانتهاء', 'date']],
    line: (x) => `${x.name || 'بطاقة هوية'} · •••• ${x.last4}` },
  passports: { title: 'جوازات السفر', one: 'جواز سفر', icon: '🛂', secret: 'رقم الجواز', fields: [['name', 'الاسم كما في الجواز'], ['country', 'الدولة'], ['issued', 'تاريخ الإصدار', 'date'], ['expiry', 'تاريخ الانتهاء', 'date']],
    line: (x) => `${x.name || 'جواز سفر'} · •••• ${x.last4}${x.expiry ? ' · ينتهي ' + x.expiry : ''}` },
  travelers: { title: 'معلومات السفر', one: 'مسافر', icon: '🧳', fields: [['name', 'الاسم بالكامل'], ['birth', 'تاريخ الميلاد', 'date'], ['nationality', 'الجنسية'], ['phone', 'الهاتف', 'tel'], ['email', 'البريد الإلكتروني', 'email'], ['ktn', 'رقم المسافر الموثوق (اختياري)']],
    line: (x) => [x.name, x.nationality].filter(Boolean).join(' · ') },
  vehicles: { title: 'مركبات', one: 'مركبة', icon: '🚙', fields: [['name', 'اسم المالك'], ['make', 'الشركة المصنعة'], ['model', 'الموديل'], ['year', 'سنة الصنع', 'yyyy'], ['plate', 'رقم اللوحة'], ['vin', 'رقم الشاسيه (VIN)']],
    line: (x) => [x.make, x.model, x.year].filter(Boolean).join(' ') + (x.plate ? ` · ${x.plate}` : '') }
};

/* window.prompt مش شغال في Electron، فده مربع إدخال بسيط بدله */
function askText(title, value = '', { type = 'text', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const inp = el('input', { type, value, placeholder, dir: 'auto', class: 'qrurl' });
    const close = (v) => { ov.remove(); resolve(v); };
    const ov = el('div', { class: 'askOverlay', onclick: (e) => { if (e.target === ov) close(null); } },
      el('div', { class: 'askBox' }, el('h3', {}, title), inp,
        el('div', { class: 'btnrow' }, el('button', { class: 'primary', onclick: () => close(inp.value) }, 'تمام'), el('button', { onclick: () => close(null) }, 'إلغاء'))));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(inp.value); if (e.key === 'Escape') close(null); });
    document.body.append(ov);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

const svgIcon = (n) => { const s = el('span', { class: 'afi' }); s.innerHTML = window.icon(n); return s; };
const emIcon = (t) => el('span', { class: 'afi em' }, t);
const afState = { data: null };
async function afLoad() { afState.data = await api.afList(); return afState.data; }

function afRowLink(icon, label, onclick) {
  return el('button', { class: 'afLink', onclick }, icon, el('span', {}, label));
}
function afCard(title, ...links) {
  return el('div', { class: 'scard afCard' }, el('div', { class: 'afHead' }, el('b', {}, title)), el('div', { class: 'afLinks' }, ...links));
}

/* الصفحة الأساسية زي كروم */
function autofillMain() {
  const box = el('div', { class: 'afMain' });
  const draw = async () => {
    const d = await afLoad();
    const pw = (await api.listPasswords()).filter(p => !p.never).length;
    const n = (k) => d[k].length ? ` (${d[k].length})` : '';
    box.innerHTML = '';
    box.append(
      el('p', { class: 'afIntro' }, 'يمكنك إدارة معلومات الملء التلقائي لتصفّح الإنترنت بشكل أسرع، مثل كلمات المرور وطرق الدفع والعناوين وبطاقات تعريف الهوية.'),
      el('div', { class: 'afSect' }, 'الملء التلقائي وكلمات المرور'),
      afCard('مدير كلمات المرور',
        afRowLink(svgIcon('key'), `كلمات المرور (${pw})`, () => afOpenSub('passwords')),
        afRowLink(emIcon('👤'), 'مفاتيح المرور', () => afOpenSub('passkeys'))),
      afCard('عمليات الدفع',
        afRowLink(emIcon('💳'), 'بطاقات الائتمان والسحب الآلي' + n('cards'), () => afOpenSub('cards')),
        afRowLink(emIcon('🏦'), 'أرقام الحسابات بصيغة IBAN' + n('ibans'), () => afOpenSub('ibans')),
        afRowLink(emIcon('🎁'), 'بطاقات الولاء' + n('loyalty'), () => afOpenSub('loyalty'))),
      afCard('معلومات الاتصال',
        afRowLink(emIcon('✉'), 'العناوين' + n('addresses'), () => afOpenSub('addresses'))),
      afCard('مستندات الهوية',
        afRowLink(emIcon('🚗'), 'رخص القيادة' + n('licenses'), () => afOpenSub('licenses')),
        afRowLink(emIcon('🪪'), 'بطاقات الهوية' + n('idcards'), () => afOpenSub('idcards')),
        afRowLink(emIcon('🛂'), 'جوازات السفر' + n('passports'), () => afOpenSub('passports'))),
      afCard('السفر',
        afRowLink(emIcon('🧳'), 'معلومات السفر' + n('travelers'), () => afOpenSub('travelers')),
        afRowLink(emIcon('🚙'), 'مركبات' + n('vehicles'), () => afOpenSub('vehicles'))),
      el('div', { class: 'afSect' }, 'إعدادات الملء التلقائي'),
      afSettingsCard(d.prefs));
  };
  draw();
  return box;
}

function afSettingsCard(prefs) {
  const body = el('div', { class: 'hidden' });
  const sw = (key, title, desc) => {
    const i = el('input', { type: 'checkbox', class: 'switch', ...(prefs[key] !== false ? { checked: '' } : {}) });
    i.addEventListener('change', async () => { afState.data.prefs = await api.afPrefs({ [key]: i.checked }); toast('تم الحفظ'); });
    return settingRow(title, desc, i);
  };
  body.append(
    sw('suggest', 'اقتراح الملء التلقائي في الفورمات', 'لما تقف في خانة اسم أو عنوان أو بطاقة، تظهر قايمة صغيرة تختار منها البيانات المحفوظة.'),
    sw('addresses', 'حفظ العناوين ومعلومات الاتصال وملؤها', 'الاسم والعنوان والتليفون والإيميل.'),
    sw('payments', 'حفظ طرق الدفع وملؤها', 'رقم البطاقة بيتحفظ مشفّر، والـ CVV عمره ما بيتحفظ.'),
    sw('ids', 'حفظ مستندات الهوية وملؤها', 'رخص القيادة وبطاقات الهوية وجوازات السفر (الأرقام مشفّرة).'),
    sw('travel', 'معلومات السفر والمركبات', 'بيانات المسافرين والعربيات لمواقع الحجز والتأمين.'),
    sw('saveOffers', 'عرض حفظ البيانات الجديدة', 'بعد ما تكتب عنوان أو بطاقة جديدة في موقع، المتصفح يسألك تحفظها ولا لأ.'),
    settingRow('مسح كل بيانات الملء التلقائي', 'العناوين والبطاقات والهويات والسفر (كلمات المرور مش هتتمسح).',
      el('button', { onclick: async () => { if (!confirm('مسح كل بيانات الملء التلقائي؟')) return; await api.afClear(); toast('اتمسحت'); openSettingsPage('autofill'); } }, 'مسح')));
  const head = el('button', { class: 'afExpand', onclick: () => { body.classList.toggle('hidden'); head.classList.toggle('open'); } },
    el('span', { class: 'stext' }, el('div', { class: 'stitle' }, 'إعدادات الملء التلقائي'), el('div', { class: 'sdesc' }, 'الإعدادات التي تحدّد كيفية ملء أنواع البيانات المختلفة تلقائيًا')),
    el('span', { class: 'chev' }, '⌄'));
  return el('div', { class: 'scard afCard' }, head, body);
}

/* صفحة فرعية: قايمة + إضافة/تعديل */
function afSubHeader(title) {
  const main = $('#settingsMain');
  main.innerHTML = '';
  main.append(el('div', { class: 'afSubHead' },
    el('button', { class: 'icon afBack', title: 'رجوع', onclick: () => openSettingsPage('autofill') }, '→'),
    el('h2', {}, title)));
  return main;
}
async function afOpenSub(kind) {
  if (kind === 'passwords') return afPasswordsPage();
  if (kind === 'passkeys') return afPasskeysPage();
  const f = AF_FORMS[kind];
  const main = afSubHeader(f.title);
  const list = el('div', { class: 'scard afList' });
  const formBox = el('div');
  const addBtn = el('button', { class: 'primary afAdd', onclick: () => showForm() }, '+ إضافة ' + f.one);
  main.append(el('div', { class: 'afTools' }, addBtn), formBox, list);
  if (f.secret) main.append(el('p', { class: 'sdesc afNote' }, '🔐 ' + f.secret + ' بيتحفظ مشفّر على جهازك بتشفير النظام، وبيظهر آخر 4 أرقام بس.'));
  const draw = async () => {
    const d = await afLoad();
    list.innerHTML = '';
    for (const x of d[kind]) {
      const secretSpan = el('span', { class: 'afSecret' });
      list.append(el('div', { class: 'srow afItem' },
        el('span', { class: 'afi em' }, f.icon),
        el('div', { class: 'stext' }, el('div', { class: 'stitle', dir: 'auto' }, f.line(x) || f.one), secretSpan),
        f.secret ? el('button', { title: 'إظهار الرقم', onclick: async () => {
          secretSpan.textContent = secretSpan.textContent ? '' : await api.afReveal(kind, x.id);
        } }, '👁') : null,
        f.secret ? el('button', { title: 'نسخ الرقم', onclick: async () => { await navigator.clipboard.writeText(await api.afReveal(kind, x.id)); toast('تم النسخ'); } }, 'نسخ') : null,
        el('button', { onclick: () => showForm(x) }, 'تعديل'),
        el('button', { class: 'del', title: 'حذف', onclick: async () => { if (!confirm('حذف ' + f.one + '؟')) return; await api.afRemove(kind, x.id); draw(); } }, '✕')));
    }
    if (!d[kind].length) list.append(el('div', { class: 'srow' }, el('div', { class: 'sdesc' }, `مفيش ${f.title} محفوظة. اضغط «إضافة ${f.one}» أو اكتبها في أي موقع والمتصفح هيعرض يحفظها.`)));
  };
  const showForm = (x = {}) => {
    formBox.innerHTML = '';
    const inputs = {};
    const fields = el('div', { class: 'afForm' });
    if (f.secret) {
      inputs.number = el('input', { dir: 'ltr', placeholder: x.id ? `•••• ${x.last4} (سيبه فاضي علشان مايتغيرش)` : f.secret, inputmode: kind === 'cards' ? 'numeric' : 'text', autocomplete: 'off' });
      fields.append(el('label', { class: 'wide' }, f.secret, inputs.number));
    }
    for (const [k, label, type] of f.fields) {
      const inp = type === 'area' ? el('textarea', { rows: 2, dir: 'auto' }) : el('input', { dir: ['tel', 'email', 'mm', 'yyyy'].includes(type) ? 'ltr' : 'auto', type: type === 'date' ? 'date' : type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text', ...(type === 'mm' ? { maxlength: 2, inputmode: 'numeric' } : {}), ...(type === 'yyyy' ? { maxlength: 4, inputmode: 'numeric' } : {}) });
      inp.value = x[k] || '';
      inputs[k] = inp;
      fields.append(el('label', { class: type === 'area' ? 'wide' : '' }, label, inp));
    }
    const save = async () => {
      const item = { id: x.id };
      for (const [k] of f.fields) item[k] = inputs[k].value.trim();
      if (inputs.number) {
        const v = inputs.number.value.trim();
        if (v) {
          if (kind === 'cards' && !/^\d{12,19}$/.test(v.replace(/[\s-]/g, ''))) return toast('رقم البطاقة مش صحيح');
          if (kind === 'ibans' && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/i.test(v)) return toast('رقم الـ IBAN مش صحيح (بيبدأ بحرفين زي EG)');
          item.number = kind === 'ibans' ? v.toUpperCase() : v;
        } else if (!x.id) return toast('اكتب ' + f.secret);
      }
      if (!Object.values(item).some(v => v && v !== x.id)) return toast('اكتب بيانات الأول');
      await api.afSave(kind, item);
      formBox.innerHTML = ''; toast('تم الحفظ ✓'); draw();
    };
    formBox.append(el('div', { class: 'scard afFormCard' },
      el('h3', {}, (x.id ? 'تعديل ' : 'إضافة ') + f.one), fields,
      el('div', { class: 'btnrow' }, el('button', { class: 'primary', onclick: save }, 'حفظ'), el('button', { onclick: () => { formBox.innerHTML = ''; } }, 'إلغاء'))));
    const first = fields.querySelector('input, textarea'); if (first) first.focus();
  };
  draw();
}

/* كلمات المرور: القايمة + فحص الأمان + مولّد كلمة مرور قوية */
function strongPassword(len = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_?'];
  const all = sets.join('');
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const out = sets.map(s => s[rnd(s.length)]);
  while (out.length < len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
const COMMON_PW = new Set(['123456', '12345678', '123456789', '1234567890', 'password', '111111', '000000', 'qwerty', 'abc123', '123123', 'password1', 'iloveyou', '1q2w3e4r', '112233', '654321', '666666', '123321', 'admin', 'welcome']);
function pwWeak(p) {
  if (!p) return false;
  if (p.length < 8 || COMMON_PW.has(p.toLowerCase())) return true;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter(r => r.test(p)).length;
  return kinds < 2 || /^(\d)\1+$/.test(p);
}
async function afPasswordsPage() {
  const main = afSubHeader('مدير كلمات المرور');
  const gen = el('input', { class: 'afGen', dir: 'ltr', readonly: '' });
  const newPw = () => { gen.value = strongPassword(16); };
  newPw();
  const check = el('div', { class: 'afCheck' }, el('div', { class: 'sdesc' }, 'اضغط «فحص» علشان نشوف كلمات المرور الضعيفة والمكررة.'));
  const runCheck = async () => {
    const all = (await api.listPasswords()).filter(p => !p.never);
    const vals = await Promise.all(all.map(p => api.revealPassword(p.id)));
    const count = {};
    vals.forEach(v => { if (v) count[v] = (count[v] || 0) + 1; });
    const weak = [], reused = [];
    all.forEach((p, i) => { if (pwWeak(vals[i])) weak.push(p); if (vals[i] && count[vals[i]] > 1) reused.push(p); });
    check.innerHTML = '';
    const item = (p) => el('div', { class: 'afCk' }, el('span', { dir: 'ltr' }, p.origin.replace(/^https?:\/\//, '')), el('small', {}, p.username || ''),
      el('button', { onclick: () => { createTab({ url: p.origin }); } }, 'غيّرها'));
    check.append(
      el('div', { class: 'afCkSum ' + (weak.length || reused.length ? 'bad' : 'ok') },
        weak.length || reused.length ? `⚠ ${weak.length} كلمة مرور ضعيفة و ${reused.length} مكررة على أكتر من موقع` : `✅ كل كلمات المرور (${all.length}) قوية ومش مكررة`));
    if (weak.length) check.append(el('b', {}, 'ضعيفة (سهل تتخمن):'), ...weak.map(item));
    if (reused.length) check.append(el('b', {}, 'مكررة (لو موقع اتسرق الباقي يتسرق):'), ...reused.map(item));
  };
  main.append(
    card(settingRow('فحص كلمات المرور', 'زي «فحص كلمات المرور» في كروم: بيدور على الضعيفة والمكررة. الفحص على جهازك بس ومفيش حاجة بتطلع برا.',
      el('button', { onclick: runCheck }, 'فحص')), check),
    card(settingRow('مولّد كلمة مرور قوية', 'لما تعمل حساب جديد، المتصفح بيقترح كلمة مرور قوية في الخانة نفسها. وتقدر تولّد واحدة من هنا.', null),
      el('div', { class: 'btnrow afGenRow' }, gen,
        el('button', { onclick: newPw }, '↻ جديدة'),
        el('button', { class: 'primary', onclick: async () => { await navigator.clipboard.writeText(gen.value); toast('تم نسخ كلمة المرور'); } }, 'نسخ'))),
    card(settingRow('استيراد كلمات المرور من جوجل', 'هات كل الباسوردات اللي متسجلة على حساب جوجل (أو كروم) في خطوتين: ١) افتح صفحة جوجل ودوس «تصدير كلمات المرور» (Export passwords) هتنزل ملف CSV. ٢) دوس «اختار الملف» هنا.', null),
      el('div', { class: 'btnrow' },
        el('button', { onclick: () => createTab({ url: 'https://passwords.google.com/options?ep=1' }) }, '١) افتح صفحة التصدير في جوجل'),
        el('button', { class: 'primary', onclick: () => importPasswordsUI() }, '٢) اختار الملف (CSV)'))),
    card(embedPanel('passwords')));
}
async function importPasswordsUI() {
  const r = await api.importPasswords({});
  if (!r || r.canceled) return;
  if (!r.ok) { toast('ماتستوردتش: ' + (r.error || '')); return; }
  toast(`تم: اتضاف ${r.added} كلمة مرور` + (r.updated ? ` واتحدّث ${r.updated}` : '') + (r.deleted ? '، واتمسح ملف CSV' : ''));
  if (state.panel === 'passwords') openPanel('passwords');
}
commands['import-passwords'] = () => { if (typeof openSettingsPage === 'function') openSettingsPage('autofill'); importPasswordsUI(); };
function afPasskeysPage() {
  const main = afSubHeader('مفاتيح المرور');
  main.append(card(
    settingRow('مفاتيح المرور (Passkeys)', 'مفاتيح المرور بتسجّلك في المواقع ببصمتك أو وشك أو رقم الـ PIN بتاع الجهاز بدل كلمة المرور. ' +
      'المتصفح بيستخدم مفاتيح المرور المحفوظة في ويندوز Hello (أو آيكلاود على الماك)، فبتشوفها وتمسحها من إعدادات النظام.',
    el('button', { class: 'primary', onclick: async () => { const ok = await api.openPasskeys(); if (!ok) toast('افتح إعدادات النظام ← الحسابات ← مفاتيح المرور'); } }, 'إدارة مفاتيح المرور')),
    settingRow('إنشاء مفتاح مرور لموقع', 'افتح إعدادات الأمان في الموقع (جوجل، مايكروسوفت، أمازون...) واختار «إنشاء مفتاح مرور»؛ ويندوز هيطلب منك البصمة أو الـ PIN.', null)));
}

/* نستبدل قسم الإعدادات القديم بالصفحة الجديدة */
settingsSections.autofill = () => [autofillMain()];

/* ---------------- شريط «حفظ العنوان/البطاقة؟» ---------------- */
function bar(id, ...children) {
  let b = document.getElementById(id);
  if (!b) { b = el('div', { id, class: 'bar hidden' }); $('#pwbar').after(b); }
  b.innerHTML = ''; b.append(...children); b.classList.remove('hidden');
  return b;
}
const afQueue = [];
function showNextAf() {
  const p = afQueue[0];
  if (!p) { const b = $('#afbar'); if (b) b.classList.add('hidden'); return; }
  let host = p.origin; try { host = new URL(p.origin).hostname; } catch { /* ignore */ }
  const done = (action) => {
    afQueue.shift(); api.afRespond(p.id, action);
    if (action === 'save') toast('تم الحفظ في الملء التلقائي ✓');
    if (action === 'never') afQueue.length = 0;
    showNextAf();
  };
  bar('afbar', el('span', { class: 'grow' }, `${p.kind === 'cards' ? '💳 حفظ البطاقة' : '📍 حفظ العنوان'} «${p.summary}» من ${host}؟ هتقدر تملاه بضغطة بعد كده.`),
    el('button', { class: 'primary', onclick: () => done('save') }, 'حفظ'),
    el('button', { onclick: () => done('dismiss') }, 'لا شكراً'),
    el('button', { onclick: () => done('never') }, 'ماتسألنيش تاني'));
}
api.on('af:prompt', (p) => { afQueue.push(p); if (afQueue.length === 1) showNextAf(); });

/* ---------------- أذونات المواقع (زي كروم) ---------------- */
const PERM_NAMES = { camera: 'الكاميرا', microphone: 'الميكروفون', geolocation: 'معرفة موقعك الجغرافي', notifications: 'إرسال إشعارات', 'clipboard-read': 'قراءة الحافظة (اللي نسخته)', midiSysex: 'التحكم في أجهزة MIDI' };
const permQueue = [];
function showNextPerm() {
  const p = permQueue[0];
  if (!p) { const b = $('#permbar'); if (b) b.classList.add('hidden'); return; }
  const what = p.keys.map(k => PERM_NAMES[k] || k).join(' و');
  const answer = (allow, remember = true) => { permQueue.shift(); api.permRespond({ id: p.id, allow, remember }); showNextPerm(); };
  bar('permbar', el('span', { class: 'grow' }, el('b', { dir: 'ltr' }, p.host), ` عايز يستخدم ${what}`),
    el('button', { class: 'primary', onclick: () => answer(true) }, 'سماح'),
    el('button', { onclick: () => answer(true, false) }, 'المرة دي بس'),
    el('button', { onclick: () => answer(false) }, 'منع'));
}
api.on('perm:prompt', (p) => { permQueue.push(p); if (permQueue.length === 1) showNextPerm(); });

/* إعدادات المواقع + عدم التتبع: كروت جديدة تحت قسم الخصوصية */
const oldPrivacy = settingsSections.privacy;
settingsSections.privacy = () => {
  const cards = oldPrivacy();
  const listBox = el('div');
  const draw = async (all) => {
    all = all || await api.permList();
    listBox.innerHTML = '';
    const hosts = Object.keys(all);
    if (!hosts.length) listBox.append(el('div', { class: 'sdesc', style: 'padding:10px 0' }, 'لسه مفيش مواقع طلبت أذونات. لما موقع يطلب الكاميرا أو الموقع الجغرافي أو الإشعارات هيظهر شريط تختار منه، واختيارك يتحفظ هنا.'));
    for (const h of hosts) {
      const row = el('div', { class: 'permRow' }, el('b', { dir: 'ltr' }, h));
      for (const [k, v] of Object.entries(all[h])) {
        const s = selectOf([['allow', 'مسموح'], ['block', 'ممنوع'], ['ask', 'اسأل']], v, async (nv) => draw(await api.permSet(h, k, nv)));
        row.append(el('label', {}, PERM_NAMES[k] || k, s));
      }
      row.append(el('button', { class: 'del', title: 'نسيان الموقع', onclick: async () => draw(await api.permSet(h, '*')) }, '✕'));
      listBox.append(row);
    }
  };
  draw();
  cards.push(
    card(settingRow('إعدادات المواقع', 'زي كروم: كل موقع بيطلب إذن الكاميرا والمايك والموقع الجغرافي والإشعارات مرة واحدة، وتقدر تغيّر رأيك من هنا.', null), listBox),
    card(settingRow('إرسال طلب «عدم التتبع» مع التصفح', 'زي كروم وفايرفوكس: بيبعت للمواقع إنك مش عايز تتتبع (Do Not Track و Global Privacy Control).', toggleOff('doNotTrack'))),
    card(settingRow('السماح بمفاتيح المرور (Passkeys)', 'مقفولة علشان رسالة ويندوز «أدخل مفتاح الأمان» ماتظهرش لوحدها في فيسبوك وسناب وغيرهم. شغّلها بس لو بتدخل بمفتاح أمان أو Windows Hello، وبعدها اعمل تحديث للصفحة.', toggleOff('allowPasskeys'))));
  return cards;
};
// زرار تشغيل افتراضه مقفول
function toggleOff(key) {
  const i = el('input', { type: 'checkbox', class: 'switch', ...(state.settings[key] === true ? { checked: '' } : {}) });
  i.addEventListener('change', () => saveSetting({ [key]: i.checked }));
  return i;
}

/* ---------------- الإشارات المرجعية المخفية ---------------- */
panels.hiddenbm = async (body) => {
  const st = await api.hbStatus();
  const pinBox = (title, note, onOk, extra) => {
    const inp = el('input', { type: 'password', inputmode: 'numeric', maxlength: 12, class: 'qrurl hbPin', placeholder: 'الرقم السري', dir: 'ltr', autocomplete: 'off' });
    const go = () => onOk(inp.value.trim(), inp);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    body.append(el('div', { class: 'hbLock' }, el('div', { class: 'hbIcon' }, '🔒'), el('h3', {}, title), el('p', { class: 'note' }, note), inp,
      el('div', { class: 'btnrow' }, el('button', { class: 'primary', onclick: go }, 'تمام'), extra || null)));
    setTimeout(() => inp.focus(), 50);
  };
  if (!st.hasPin) {
    return pinBox('اعمل رقم سري للإشارات المخفية', 'الإشارات المخفية مابتظهرش في شريط المفضلة ولا في إدارة الإشارات ولا في اقتراحات العنوان، وبتتفتح بالرقم السري بس. اختار رقم من 4 لـ 12 رقم.',
      async (pin) => { const r = await api.hbSetPin(pin); if (r.error) return toast(r.error); toast('تم ✓ دلوقتي تقدر تخفي أي صفحة من ⭐ أو من القائمة'); openPanel('hiddenbm'); });
  }
  if (!st.unlocked) {
    return pinBox('الإشارات المرجعية المخفية', 'اكتب الرقم السري علشان تشوفها.',
      async (pin, inp) => { const r = await api.hbUnlock(pin); if (r.error) { inp.value = ''; return toast(r.error); } openPanel('hiddenbm'); },
      el('button', { onclick: async () => { if (!confirm('نسيت الرقم السري؟ هنمسح الإشارات المخفية كلها علشان محدش غيرك يشوفها، وتعمل رقم جديد. متأكد؟')) return; await api.hbForget(); openPanel('hiddenbm'); } }, 'نسيت الرقم'));
  }
  let items = await api.hbList() || [];
  const search = el('input', { class: 'search', placeholder: 'بحث في الإشارات المخفية' });
  const list = el('div');
  const save = async () => { items = await api.hbSave(items) || items; draw(); };
  const draw = () => {
    list.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    const rows = items.filter(b => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
    for (const b of rows) {
      list.append(el('div', { class: 'item' },
        el('div', { class: 'main', onclick: () => { createTab({ url: b.url }); } }, el('div', { class: 't' }, b.title), el('div', { class: 's', dir: 'ltr' }, b.url)),
        el('button', { title: 'افتح في نافذة متخفية', onclick: () => api.newWindow({ incognito: true, url: b.url }) }, '🕶'),
        el('button', { title: 'إعادة تسمية', onclick: async () => { const t = await askText('الاسم', b.title); if (t) { b.title = t; save(); } } }, '✎'),
        el('button', { class: 'del', title: 'حذف', onclick: () => { items = items.filter(x => x !== b); save(); } }, '✕')));
    }
    if (!rows.length) list.append(el('p', { class: 'note' }, 'مفيش إشارات مخفية. افتح أي صفحة واضغط «إخفاء الصفحة دي» أو من ⭐ ← «إضافة للمخفية».'));
  };
  search.addEventListener('input', draw);
  const t = state.active;
  body.append(
    el('div', { class: 'btnrow' },
      t && /^https?:/.test(t.url) ? el('button', { class: 'primary', onclick: async () => { await api.hbAdd({ title: t.title, url: t.url }); items = await api.hbList() || items; draw(); toast('اتخفت ✓'); } }, '+ إخفاء الصفحة دي') : null,
      el('button', { onclick: async () => { await api.hbLock(); closePanel(); toast('اتقفلت 🔒'); } }, '🔒 قفل'),
      el('button', { onclick: async () => {
        const pin = await askText('الرقم السري الجديد (4 لـ 12 رقم)', '', { type: 'password' });
        if (!pin) return; const r = await api.hbSetPin(pin); toast(r.error || 'اتغيّر الرقم السري ✓');
      } }, 'تغيير الرقم')),
    search, list);
  draw();
};
async function hideCurrentPage() {
  const t = state.active;
  if (!t || !/^https?:/.test(t.url)) return toast('افتح صفحة موقع الأول');
  const st = await api.hbStatus();
  if (!st.hasPin) return openPanel('hiddenbm');
  await api.hbAdd({ title: t.title, url: t.url });
  // لو كانت في المفضلة العادية نشيلها منها علشان ماتبانش
  const i = state.bookmarks.findIndex(b => b.url === t.url);
  if (i >= 0) { state.bookmarks.splice(i, 1); state.bookmarks = await api.saveBookmarks(state.bookmarks); renderBookmarksBar(); updateNav(); }
  toast('🔒 اتضافت للإشارات المخفية (من القائمة ← الإشارات المرجعية ← المخفية)');
}

/* ---------------- قائمة القراءة ---------------- */
panels.reading = async (body) => {
  let items = await api.rlList();
  const tabsRow = el('div', { class: 'rlTabs' });
  let show = 'unread';
  const list = el('div');
  const draw = () => {
    tabsRow.innerHTML = '';
    for (const [k, l] of [['unread', `لم تتم قراءتها (${items.filter(x => !x.read).length})`], ['read', `تمت قراءتها (${items.filter(x => x.read).length})`]]) {
      tabsRow.append(el('button', { class: show === k ? 'on' : '', onclick: () => { show = k; draw(); } }, l));
    }
    list.innerHTML = '';
    const rows = items.filter(x => (show === 'read') === !!x.read);
    for (const r of rows) {
      list.append(el('div', { class: 'item' },
        r.favicon ? el('img', { src: r.favicon, alt: '', class: 'rlFav' }) : null,
        el('div', { class: 'main', onclick: async () => { createTab({ url: r.url }); items = await api.rlMark(r.id, true); draw(); } },
          el('div', { class: 't' }, r.title), el('div', { class: 's', dir: 'ltr' }, (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })())),
        el('button', { title: r.read ? 'تعليم كغير مقروءة' : 'تعليم كمقروءة', onclick: async () => { items = await api.rlMark(r.id, !r.read); draw(); } }, r.read ? '↺' : '✓'),
        el('button', { class: 'del', title: 'حذف', onclick: async () => { items = await api.rlRemove(r.id); draw(); } }, '✕')));
    }
    if (!rows.length) list.append(el('p', { class: 'note' }, show === 'unread' ? 'مفيش صفحات مستنياك. اضغط «إضافة الصفحة الحالية» علشان تقراها بعدين حتى لو قفلت التبويب.' : 'لسه مقريتش حاجة من القائمة.'));
  };
  const t = state.active;
  body.append(el('div', { class: 'btnrow' },
    t && /^https?:/.test(t.url) ? el('button', { class: 'primary', onclick: async () => { items = await api.rlAdd({ url: t.url, title: t.title, favicon: t.favicon }); show = 'unread'; draw(); toast('اتضافت لقائمة القراءة 📖'); } }, '+ إضافة الصفحة الحالية') : null),
    tabsRow, list);
  draw();
};
Object.assign(panelTitles, { hiddenbm: 'الإشارات المرجعية المخفية', reading: 'قائمة القراءة' });

/* ---------------- أوامر جديدة ---------------- */
Object.assign(commands, {
  'hidden-bookmarks': () => openPanel('hiddenbm'),
  'hide-page': hideCurrentPage,
  'reading-list': () => openPanel('reading'),
  'add-reading': async () => {
    const t = state.active;
    if (!t || !/^https?:/.test(t.url)) return toast('افتح صفحة موقع الأول');
    await api.rlAdd({ url: t.url, title: t.title, favicon: t.favicon });
    toast('📖 اتضافت لقائمة القراءة');
  },
  'save-pdf': async () => {
    const w = state.active && state.active.webview;
    if (!w || !/^(https?|file):/.test(state.active.url)) return toast('افتح صفحة الأول');
    toast('بنجهز ملف PDF...');
    try { const f = await api.savePdf(w.getWebContentsId()); if (f) { toast('اتحفظت PDF ✓'); api.showFile(f); } } catch { toast('مقدرناش نحفظ PDF'); }
  },
  'close-duplicates': () => {
    const seen = new Set(); let n = 0;
    for (const t of [...visibleTabs()]) {
      if (!t.url || t.url === NEWTAB) continue;
      const k = (t.partition || '') + '|' + t.url.replace(/#.*$/, '');
      if (seen.has(k) && t !== state.active) { closeTab(t); n++; } else seen.add(k);
    }
    toast(n ? `اتقفل ${n} تبويب مكرر` : 'مفيش تبويبات مكررة');
  },
  'autofill-settings': () => openSettingsPage('autofill'),
  'addresses': () => { openSettingsPage('autofill'); afOpenSub('addresses'); },
  'payment-methods': () => { openSettingsPage('autofill'); afOpenSub('cards'); }
});

/* زرار ⭐ بكليك يمين: إضافة للمخفية أو قائمة القراءة */
$('#starBtn').addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const id = await api.uiMenu([
    { id: 'bookmark', label: 'إضافة/إزالة من المفضلة' },
    { id: 'hide-page', label: '🔒 إضافة للإشارات المخفية' },
    { id: 'add-reading', label: '📖 إضافة لقائمة القراءة' },
    { type: 'separator' },
    { id: 'hidden-bookmarks', label: 'فتح الإشارات المخفية' },
    { id: 'reading-list', label: 'فتح قائمة القراءة' }
  ]);
  if (id) run(id);
});
