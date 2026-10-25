'use strict';
// يعمل داخل كل صفحة ويب (معزول): التقاط كلمات المرور عند تسجيل الدخول وتعبئتها تلقائياً
const { ipcRenderer } = require('electron');

const USER_KEY = '__alalamy_last_user';

/* مفاتيح المرور (passkeys): المواقع زي جوجل بتطلبها «في الخلفية» علشان تظهر في قايمة الملء التلقائي،
   والمتصفح مالوش القايمة دي فكانت بتطلع رسالة ويندوز «أدخل مفتاح الأمان» لوحدها كل شوية.
   بنقول للمواقع إن الطريقة دي مش متاحة؛ مفتاح المرور بيشتغل عادي لو المستخدم اختاره بنفسه. */
const NO_CONDITIONAL_PASSKEYS = `(() => {
  const root = window;
  const active = (x) => { try { return !x.navigator.userActivation || x.navigator.userActivation.isActive; } catch (e) { return false; } };
  // بنعدّل الدالة الأصلية نفسها (prototype) في الصفحة وفي أي إطار فاضي (about:blank) بيتعمل جواها،
  // لأن ميتا بتوصل للنسخة الأصلية من غير navigator.credentials.get العادية
  const patch = (w) => {
    try {
      if (!w || w.__alalamyPK) return;
      Object.defineProperty(w, '__alalamyPK', { value: true });
    } catch (e) { return; }
    const D = w.DOMException || DOMException;
    const P = w.Promise || Promise;
    try {
      const PKC = w.PublicKeyCredential;
      if (PKC) {
        PKC.isConditionalMediationAvailable = () => P.resolve(false);
        if (PKC.getClientCapabilities) {
          const orig = PKC.getClientCapabilities.bind(PKC);
          PKC.getClientCapabilities = () => orig().then(c => Object.assign({}, c, { conditionalGet: false, conditionalCreate: false }));
        }
      }
    } catch (e) {}
    try {
      const CC = w.CredentialsContainer && w.CredentialsContainer.prototype;
      if (CC && CC.get) {
        const nativeGet = CC.get;
        const wrapped = function get(opts) {
          if (opts && opts.publicKey) {
            if (opts.mediation === 'conditional') {
              return new P((_, reject) => {
                const sig = opts.signal;
                if (sig) sig.addEventListener('abort', () => reject(sig.reason || new D('Aborted', 'AbortError')), { once: true });
              });
            }
            // طلب مفتاح مرور من غير ما المستخدم يضغط على حاجة: نرفضه بهدوء كأنه داس Cancel
            if (opts.mediation === 'immediate' || opts.mediation === 'silent' || !(active(root) || active(w))) {
              try { root.__alalamyPKBlocked = (root.__alalamyPKBlocked || 0) + 1; } catch (e) {}
              return P.reject(new D('The operation either timed out or was not allowed.', 'NotAllowedError'));
            }
          }
          return nativeGet.call(this, opts);
        };
        Object.defineProperty(CC, 'get', { value: wrapped, writable: true, configurable: true, enumerable: true });
      }
    } catch (e) {}
    // أي إطار جوه الإطار ده يتعدّل هو كمان
    const sub = (x) => { try { if (x && x !== w && x.document) patch(x); } catch (e) {} };
    const scan = (n) => {
      try {
        if (!n) return;
        if (n.nodeType === 9) n = n.documentElement;
        if (!n || (n.nodeType !== 1 && n.nodeType !== 11)) return;
        if (n.nodeType === 1 && /^(IFRAME|FRAME|OBJECT|EMBED)$/.test(n.tagName)) sub(n.contentWindow);
        if (n.querySelectorAll) for (const f of n.querySelectorAll('iframe,frame,object')) sub(f.contentWindow);
      } catch (e) {}
    };
    const all = () => { try { for (let i = 0; i < w.length; i++) sub(w[i]); } catch (e) {} };
    try {
      const hookGetter = (proto, prop, toWin) => {
        const d = proto && Object.getOwnPropertyDescriptor(proto, prop);
        if (!d || !d.get) return;
        Object.defineProperty(proto, prop, Object.assign({}, d, { get() { const v = d.get.call(this); sub(toWin(v)); return v; } }));
      };
      for (const C of [w.HTMLIFrameElement, w.HTMLFrameElement, w.HTMLObjectElement]) {
        if (!C) continue;
        hookGetter(C.prototype, 'contentWindow', v => v);
        hookGetter(C.prototype, 'contentDocument', v => v && v.defaultView);
      }
      const after = (proto, name, pick) => {
        const orig = proto && proto[name];
        if (typeof orig !== 'function') return;
        proto[name] = function (...args) { const r = orig.apply(this, args); for (const n of pick.call(this, args, r)) scan(n); all(); return r; };
      };
      const N = w.Node.prototype, E = w.Element.prototype;
      after(N, 'appendChild', a => [a[0]]);
      after(N, 'insertBefore', a => [a[0]]);
      after(N, 'replaceChild', a => [a[0]]);
      for (const m of ['append', 'prepend', 'after', 'before', 'replaceWith', 'replaceChildren']) after(E, m, a => a);
      after(E, 'insertAdjacentElement', a => [a[1]]);
      after(E, 'insertAdjacentHTML', function () { return [this.parentNode || this]; });
      after(E, 'setHTMLUnsafe', function () { return [this]; });
      if (w.Document) { after(w.Document.prototype, 'write', function () { return [this]; }); after(w.Document.prototype, 'writeln', function () { return [this]; }); }
      if (w.Range) after(w.Range.prototype, 'insertNode', a => [a[0]]);
      for (const prop of ['innerHTML', 'outerHTML']) {
        const d = Object.getOwnPropertyDescriptor(E, prop);
        if (d && d.set) Object.defineProperty(E, prop, Object.assign({}, d, { set(v) { const p = this.parentNode; d.set.call(this, v); scan(prop === 'outerHTML' ? p : this); all(); } }));
      }
      const open = w.open;
      if (typeof open === 'function') w.open = function (...args) { const x = open.apply(this, args); sub(x); return x; };
      // الإطارات اللي جاية من الـ HTML نفسه (مش من سكربت) بتتمسك هنا قبل ما أي سكربت بعدها يشتغل
      const mo = new w.MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) scan(n); });
      const watch = () => { try { mo.observe(w.document, { childList: true, subtree: true }); } catch (e) {} };
      watch();
      all();
    } catch (e) {}
  };
  patch(window);
})();`;
try {
  const { contextBridge, webFrame } = require('electron');
  if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: new Function(NO_CONDITIONAL_PASSKEYS) });
  else webFrame.executeJavaScript(NO_CONDITIONAL_PASSKEYS);
} catch { /* ignore */ }

/* تشغيل الصوت في الخلفية زي يوتيوب بريميوم: الصفحة دايمًا شايفة نفسها ظاهرة،
   فالمواقع (يوتيوب، ساوند كلاود، الراديو...) ماتوقفش الصوت لما تصغّر المتصفح أو تروح لتبويب تاني */
const BG_AUDIO = `(() => {
  try {
    const D = Document.prototype;
    Object.defineProperty(D, 'hidden', { configurable: true, get() { return false; } });
    Object.defineProperty(D, 'webkitHidden', { configurable: true, get() { return false; } });
    Object.defineProperty(D, 'visibilityState', { configurable: true, get() { return 'visible'; } });
    Object.defineProperty(D, 'webkitVisibilityState', { configurable: true, get() { return 'visible'; } });
    const stop = (e) => { e.stopImmediatePropagation(); };
    for (const t of ['visibilitychange', 'webkitvisibilitychange', 'freeze']) {
      window.addEventListener(t, stop, true); document.addEventListener(t, stop, true);
    }
  } catch (e) {}
})();`;
try {
  if (process.isMainFrame && ipcRenderer.sendSync('bgaudio:on')) {
    const { contextBridge, webFrame } = require('electron');
    if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: new Function(BG_AUDIO) });
    else webFrame.executeJavaScript(BG_AUDIO);
  }
} catch { /* ignore */ }

// الإطارات الداخلية (iframe) محتاجة الحماية دي بس: فيسبوك بيطلب مفتاح المرور من إطار مخفي تبع accounts.meta.com
// باقي الملف (حفظ الباسورد، الفيديو، الاختصارات...) للصفحة الرئيسية فقط
if (!process.isMainFrame) return;

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}
function passwordFields(root = document) {
  return [...root.querySelectorAll('input[type="password"]')].filter(visible);
}
function userFieldFor(pw) {
  const scope = pw.form || document;
  const candidates = [...scope.querySelectorAll(
    'input[type="email"], input[type="text"], input[type="tel"], input:not([type]), input[autocomplete="username"]'
  )].filter(visible);
  let best = null;
  for (const c of candidates) {
    if (c.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) best = c;
  }
  return best;
}
function setValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// تذكر البريد في خطوات تسجيل الدخول المتعددة (مثل Gmail و Outlook)
function rememberUser() {
  const u = document.querySelector('input[type="email"], input[autocomplete="username"], input[name="identifier"], input[name="loginfmt"]');
  if (u && u.value && visible(u)) {
    try { sessionStorage.setItem(USER_KEY, u.value); } catch { /* ignore */ }
  }
}

let lastSent = '';
function capture() {
  const pw = passwordFields().find(p => p.value);
  if (!pw) return rememberUser();
  const uf = userFieldFor(pw);
  let username = uf && uf.value ? uf.value : '';
  if (!username) { try { username = sessionStorage.getItem(USER_KEY) || ''; } catch { /* ignore */ } }
  const key = location.origin + '|' + username + '|' + pw.value;
  if (key === lastSent) return;
  lastSent = key;
  ipcRenderer.send('pw:capture', { origin: location.origin, username, password: pw.value });
}

document.addEventListener('submit', capture, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter') setTimeout(capture, 0); }, true);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
  if (b) setTimeout(capture, 0);
}, true);
window.addEventListener('beforeunload', capture);

// التعبئة التلقائية
let creds = null;
let filled = new WeakSet();
async function autofill() {
  const pws = passwordFields().filter(p => !p.value && !filled.has(p));
  const userOnly = document.querySelector('input[type="email"]:not([value]), input[name="identifier"], input[name="loginfmt"]');
  if (!pws.length && !userOnly) return;
  if (!creds) {
    try { creds = await ipcRenderer.invoke('pw:get', location.origin); } catch { creds = []; }
  }
  if (!creds || !creds.length) return;
  for (const pw of pws) {
    const uf = userFieldFor(pw);
    let remembered = '';
    try { remembered = sessionStorage.getItem(USER_KEY) || ''; } catch { /* ignore */ }
    const typed = (uf && uf.value) || remembered;
    const c = creds.find(x => x.username === typed) || creds[0];
    if (uf && !uf.value && c.username) setValue(uf, c.username);
    setValue(pw, c.password);
    filled.add(pw);
  }
  if (!pws.length && userOnly && visible(userOnly) && !userOnly.value && creds[0].username && !filled.has(userOnly)) {
    setValue(userOnly, creds[0].username);
    filled.add(userOnly);
  }
}

let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(autofill, 350); }
window.addEventListener('DOMContentLoaded', () => {
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
});

// ---------------- الملء التلقائي للعناوين والبطاقات والهوية + اقتراح كلمة مرور قوية (زي كروم) ----------------
const AF_RULES = [
  // [النوع, regex على autocomplete أو الاسم/المعرف/النص الظاهر]
  ['email', /e-?mail|البريد|الايميل|الإيميل/i],
  ['tel', /phone|mobile|tel\b|telephone|cell|الهاتف|الموبايل|المحمول|التليفون|رقم الجوال|الجوال/i],
  ['cc-number', /card.?number|cc.?num|cardnum|ccnumber|credit.?card|card.?no|رقم البطاقة/i],
  ['cc-name', /name.?on.?card|card.?holder|cc.?name|holder.?name|الاسم على البطاقة|اسم حامل/i],
  ['cc-exp-month', /exp.*month|cc.?month|month.*exp|شهر الانتهاء/i],
  ['cc-exp-year', /exp.*year|cc.?year|year.*exp|سنة الانتهاء/i],
  ['cc-exp', /expir|exp.?date|valid.?thru|mm.?\/?.?yy|cc.?exp|تاريخ الانتهاء|الصلاحية/i],
  ['cc-csc', /cvv|cvc|csc|security.?code|رمز الأمان/i],
  ['passport', /passport|جواز/i],
  ['national-id', /national.?id|id.?number|nid\b|الرقم القومي|رقم الهوية|الهوية الوطنية/i],
  ['given-name', /first.?name|given.?name|fname|الاسم الأول/i],
  ['family-name', /last.?name|family.?name|surname|lname|اسم العائلة|الاسم الأخير/i],
  ['org', /company|organi[sz]ation|business|الشركة|المؤسسة/i],
  ['zip', /zip|postal|post.?code|postcode|الرمز البريدي|الكود البريدي/i],
  ['city', /city|town|locality|المدينة/i],
  ['state', /state|province|region|county|governorate|المحافظة|الولاية|المنطقة/i],
  ['country', /country|الدولة|البلد/i],
  ['street2', /address.?(line)?.?2|apartment|suite|apt|الشقة|الدور/i],
  ['street', /address|street|addr|line1|العنوان|الشارع/i],
  ['name', /full.?name|^name$|your.?name|\bname\b|الاسم/i]
];
const AC_MAP = {
  'name': 'name', 'given-name': 'given-name', 'family-name': 'family-name', 'organization': 'org', 'street-address': 'street', 'address-line1': 'street',
  'address-line2': 'street2', 'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'zip', 'country': 'country', 'country-name': 'country',
  'tel': 'tel', 'tel-national': 'tel', 'email': 'email', 'cc-number': 'cc-number', 'cc-name': 'cc-name', 'cc-exp': 'cc-exp', 'cc-exp-month': 'cc-exp-month',
  'cc-exp-year': 'cc-exp-year', 'cc-csc': 'cc-csc', 'new-password': 'new-password'
};
const ADDR_TYPES = new Set(['name', 'given-name', 'family-name', 'org', 'street', 'street2', 'city', 'state', 'zip', 'country', 'tel', 'email']);
const CARD_TYPES = new Set(['cc-number', 'cc-name', 'cc-exp', 'cc-exp-month', 'cc-exp-year']);
const ID_TYPES = new Set(['passport', 'national-id']);

function fieldText(inp) {
  let t = [inp.name, inp.id, inp.getAttribute('placeholder'), inp.getAttribute('aria-label'), inp.getAttribute('data-testid')].filter(Boolean).join(' ');
  try {
    if (inp.labels && inp.labels.length) t += ' ' + [...inp.labels].map(l => l.textContent).join(' ');
    else { const l = inp.closest('label'); if (l) t += ' ' + l.textContent; }
  } catch { /* ignore */ }
  return t.slice(0, 300);
}
function afType(inp) {
  if (!inp || !(inp instanceof HTMLInputElement || inp instanceof HTMLSelectElement || inp instanceof HTMLTextAreaElement)) return null;
  const type = (inp.type || '').toLowerCase();
  if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'search'].includes(type)) return null;
  const ac = (inp.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).filter(t => !/^(section-|shipping|billing|home|work|mobile|fax|on|off)$/.test(t)).pop();
  if (type === 'password') {
    if (ac === 'new-password') return 'new-password';
    const form = inp.form || document;
    const pws = [...form.querySelectorAll('input[type="password"]')].filter(visible);
    if (pws.length >= 2 || /new|confirm|signup|register|create|جديد|تأكيد/i.test(fieldText(inp) + ' ' + ((inp.form && inp.form.action) || '') + ' ' + location.pathname)) return 'new-password';
    return null;
  }
  if (ac && AC_MAP[ac]) return AC_MAP[ac];
  if (type === 'email') return 'email';
  if (type === 'tel') return 'tel';
  // خانات تسجيل الدخول والبحث مش عناوين
  if (/user.?name|login|search|query|captcha|otp|coupon|promo|q$/i.test((inp.name || '') + ' ' + (inp.id || ''))) return null;
  const txt = fieldText(inp);
  for (const [t, re] of AF_RULES) if (re.test(txt)) return t;
  return null;
}
function setAny(elm, value) {
  if (value == null || value === '') return false;
  value = String(value);
  if (elm instanceof HTMLSelectElement) {
    const v = value.toLowerCase();
    const opt = [...elm.options].find(o => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v)
      || [...elm.options].find(o => v.length > 2 && (o.text.toLowerCase().includes(v) || v.includes(o.text.trim().toLowerCase()) && o.text.trim().length > 2))
      || (/^\d+$/.test(v) ? [...elm.options].find(o => Number(o.value) === Number(v) || Number(o.text) === Number(v) || o.value.endsWith(v.slice(-2)) && v.length === 4 && o.value.length === 2) : null);
    if (!opt) return false;
    elm.value = opt.value;
  } else {
    const proto = elm instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(elm, value);
    elm.dispatchEvent(new Event('input', { bubbles: true }));
  }
  elm.dispatchEvent(new Event('change', { bubbles: true }));
  elm.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}
function afFields(scope) {
  return [...(scope || document).querySelectorAll('input, select, textarea')].filter(x => visible(x) && !x.disabled && !x.readOnly).map(x => [x, afType(x)]).filter(([, t]) => t);
}
function addrValue(a, t) {
  const parts = String(a.name || '').trim().split(/\s+/);
  switch (t) {
    case 'name': return a.name;
    case 'given-name': return parts[0];
    case 'family-name': return parts.length > 1 ? parts.slice(1).join(' ') : '';
    case 'org': return a.org;
    case 'street': return a.street;
    case 'street2': return '';
    case 'city': return a.city; case 'state': return a.state; case 'zip': return a.zip; case 'country': return a.country;
    case 'tel': return a.phone; case 'email': return a.email;
  }
  return '';
}

let afCache = null, afCacheTime = 0;
async function afSuggestions() {
  if (afCache && Date.now() - afCacheTime < 20000) return afCache;
  try { afCache = await ipcRenderer.invoke('af:suggest'); } catch { afCache = { addresses: [], cards: [], ids: [] }; }
  afCacheTime = Date.now();
  return afCache;
}
function afGenPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_?'];
  const all = sets.join('');
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const out = sets.map(s => s[rnd(s.length)]);
  while (out.length < 16) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

// القايمة الصغيرة تحت الخانة (Shadow DOM علشان ستايل الموقع مايأثرش عليها)
let afHost = null, afBox = null, afItems = [], afSel = -1, afFor = null;
function afHide() { if (afHost) afHost.style.display = 'none'; afFor = null; afItems = []; afSel = -1; }
function afShow(inp, rows) {
  if (!rows.length) return afHide();
  if (!afHost) {
    afHost = document.createElement('alalamy-autofill');
    const root = afHost.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .box{position:fixed;z-index:2147483647;min-width:260px;max-width:420px;background:#fff;color:#202124;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.25);
        font:13px/1.4 "Segoe UI",Tahoma,Arial,sans-serif;padding:6px 0;direction:rtl;text-align:right;overflow:hidden}
      .it{display:flex;gap:10px;align-items:center;padding:8px 14px;cursor:pointer}
      .it:hover,.it.on{background:#e8f0fe}
      .ic{width:22px;text-align:center;font-size:16px;flex:none}
      .tx{display:flex;flex-direction:column;min-width:0}
      .tx b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tx small{color:#5f6368;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ft{border-top:1px solid #e0e0e0;margin-top:4px;padding:6px 14px 2px;color:#5f6368;font-size:12px}
      @media (prefers-color-scheme: dark){.box{background:#2d2e31;color:#e8eaed}.it:hover,.it.on{background:#394457}.ft{border-color:#444;color:#9aa0a6}.tx small{color:#9aa0a6}}
    </style><div class="box"></div>`;
    afBox = root.querySelector('.box');
    afBox.addEventListener('mousedown', (e) => e.preventDefault());
    document.documentElement.appendChild(afHost);
  }
  afFor = inp; afItems = rows; afSel = -1;
  afBox.textContent = '';
  rows.forEach((r, i) => {
    const it = document.createElement('div'); it.className = 'it';
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = r.icon;
    const tx = document.createElement('span'); tx.className = 'tx';
    const b = document.createElement('b'); b.textContent = r.title; b.dir = 'auto';
    tx.append(b);
    if (r.sub) { const s = document.createElement('small'); s.textContent = r.sub; s.dir = 'auto'; tx.append(s); }
    it.append(ic, tx);
    it.addEventListener('click', () => { afHide(); r.run(); });
    afBox.append(it);
  });
  const ft = document.createElement('div'); ft.className = 'ft'; ft.textContent = 'الملء التلقائي من متصفح العالمي';
  afBox.append(ft);
  const rc = inp.getBoundingClientRect();
  afHost.style.display = 'block';
  afBox.style.width = Math.max(260, Math.min(420, rc.width)) + 'px';
  const h = afBox.offsetHeight || 200;
  afBox.style.top = (rc.bottom + 4 + h > innerHeight && rc.top > h ? rc.top - h - 4 : rc.bottom + 4) + 'px';
  const rtl = getComputedStyle(inp).direction === 'rtl';
  afBox.style.left = Math.max(4, Math.min(rtl ? rc.right - afBox.offsetWidth : rc.left, innerWidth - afBox.offsetWidth - 4)) + 'px';
}
function afMark(i) {
  afSel = (i + afItems.length) % afItems.length;
  [...afBox.querySelectorAll('.it')].forEach((x, j) => x.classList.toggle('on', j === afSel));
}
async function afOnFocus(inp) {
  const t = afType(inp);
  if (!t || t === 'cc-csc') return afHide();
  const scope = inp.form || document;
  if (t === 'new-password') {
    if (inp.value) return afHide();
    const pw = afGenPassword();
    return afShow(inp, [{ icon: '🔑', title: 'استخدام كلمة مرور قوية', sub: pw, run: () => {
      for (const p of [...scope.querySelectorAll('input[type="password"]')].filter(visible)) { if (!p.value || p === inp) setValue(p, pw); }
      // تظهر الكلمة لحظة علشان المستخدم يعرف إنها اتكتبت، والمتصفح هيعرض يحفظها بعد التسجيل
      ipcRenderer.send('af:used', 'gen', '');
    } }]);
  }
  const s = await afSuggestions();
  if (document.activeElement !== inp) return;
  const rows = [];
  if (ADDR_TYPES.has(t)) {
    for (const a of s.addresses) {
      const main = addrValue(a, t) || a.name || a.street;
      if (!main) continue;
      if (inp.value && !String(main).toLowerCase().startsWith(inp.value.toLowerCase())) continue;
      rows.push({ icon: '📍', title: main, sub: [a.name, a.street, a.city, a.phone].filter(x => x && x !== main).join('، '), run: () => {
        for (const [f, ft] of afFields(scope)) if (ADDR_TYPES.has(ft) && (!f.value || f === inp)) setAny(f, addrValue(a, ft));
        ipcRenderer.send('af:used', 'addresses', a.id);
      } });
    }
  } else if (CARD_TYPES.has(t)) {
    for (const c of s.cards) {
      rows.push({ icon: '💳', title: `${c.brand || 'بطاقة'} •••• ${c.last4}`, sub: [c.name, c.expMonth && `${c.expMonth}/${String(c.expYear).slice(-2)}`, c.nick].filter(Boolean).join(' · '), run: async () => {
        const num = await ipcRenderer.invoke('af:fill-secret', 'cards', c.id);
        const yy = String(c.expYear || ''), mm = String(c.expMonth || '');
        for (const [f, ft] of afFields(scope)) {
          if (f.value && f !== inp) continue;
          if (ft === 'cc-number') setAny(f, num);
          else if (ft === 'cc-name') setAny(f, c.name);
          else if (ft === 'cc-exp-month') setAny(f, mm);
          else if (ft === 'cc-exp-year') setAny(f, f instanceof HTMLSelectElement || (f.maxLength > 0 && f.maxLength <= 2) ? (f.maxLength === 2 ? yy.slice(-2) : yy) : yy);
          else if (ft === 'cc-exp') setAny(f, mm && yy ? `${mm}/${f.maxLength === 7 ? yy : yy.slice(-2)}` : '');
        }
      } });
    }
  } else if (ID_TYPES.has(t)) {
    for (const x of s.ids.filter(x => (t === 'passport') === (x.kind === 'passports'))) {
      rows.push({ icon: t === 'passport' ? '🛂' : '🪪', title: `${x.name || ''} •••• ${x.last4}`, sub: x.country || '', run: async () => {
        setAny(inp, await ipcRenderer.invoke('af:fill-secret', x.kind, x.id));
      } });
    }
  }
  afShow(inp, rows.slice(0, 6));
}
document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.matches && t.matches('input, textarea')) afOnFocus(t).catch(() => {}); }, true);
document.addEventListener('mousedown', (e) => { if (afFor && e.target !== afFor && e.target !== afHost) afHide(); }, true);
document.addEventListener('input', (e) => { if (afFor && e.target === afFor && afFor.type !== 'password') afOnFocus(afFor).catch(() => {}); }, true);
document.addEventListener('keydown', (e) => {
  if (!afFor || !afItems.length || afHost.style.display === 'none') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); afMark(afSel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); afMark(afSel - 1); }
  else if (e.key === 'Enter' && afSel >= 0) { e.preventDefault(); e.stopPropagation(); const r = afItems[afSel]; afHide(); r.run(); }
  else if (e.key === 'Escape') afHide();
}, true);
window.addEventListener('scroll', () => { if (afFor) afHide(); }, true);
window.addEventListener('resize', afHide);

// بعد إرسال الفورم: لو فيه عنوان أو بطاقة جديدة نعرض حفظها
let afLastCapture = '';
function afCapture(scope) {
  const fields = afFields(scope);
  if (fields.length < 2) return;
  const addr = {}, card = {};
  const first = {}, last = {};
  for (const [f, t] of fields) {
    const v = (f instanceof HTMLSelectElement ? (f.selectedOptions[0] ? f.selectedOptions[0].text : '') : f.value || '').trim();
    if (!v) continue;
    if (t === 'given-name') first.v = v; else if (t === 'family-name') last.v = v;
    else if (t === 'tel') addr.phone = v; else if (t === 'street2') addr.street = (addr.street ? addr.street + '، ' : '') + v;
    else if (ADDR_TYPES.has(t)) addr[t] = addr[t] || v;
    else if (t === 'cc-number') card.number = v; else if (t === 'cc-name') card.name = v;
    else if (t === 'cc-exp') card.exp = v; else if (t === 'cc-exp-month') card.expMonth = v; else if (t === 'cc-exp-year') card.expYear = v;
  }
  if (!addr.name && (first.v || last.v)) addr.name = [first.v, last.v].filter(Boolean).join(' ');
  const payload = {};
  if (Object.keys(addr).length >= 3) payload.address = addr;
  if (card.number) payload.card = card;
  if (!payload.address && !payload.card) return;
  const key = JSON.stringify(payload);
  if (key === afLastCapture) return;
  afLastCapture = key;
  ipcRenderer.send('af:capture', payload);
}
document.addEventListener('submit', (e) => { try { afCapture(e.target); } catch { /* ignore */ } }, true);
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
  if (b) setTimeout(() => { try { afCapture(b.form || b.closest('form') || document); } catch { /* ignore */ } }, 0);
}, true);

// ---------------- تحميل الفيديو: معرفة رابط الفيديو اللي قدامك ----------------
// في صفحات الفيد (تيك توك For You، انستجرام، فيس بوك، X، يوتيوب) رابط الصفحة مش رابط الفيديو،
// فبندوّر على الفيديو اللي شغال/ظاهر ونجيب الرابط الحقيقي بتاعه من البوست اللي هو فيه.
const SITES = [
  { host: /(^|\.)tiktok\.com$/, page: /\/(video|photo)\/\d+/, link: /\/@[^/?#]+\/(video|photo)\/\d+/ },
  // انستجرام: كود الفيديو 6 حروف أو أكتر، علشان صفحات زي /reels/audio/ مش فيديو
  { host: /(^|\.)instagram\.com$/, page: /^\/(([^/]+\/)?(p|reel|reels|tv)\/[\w-]{6,}\/?$|stories\/[^/]+\/\d+)/,
    link: /^\/([^/]+\/)?(p|reel|reels|tv)\/[\w-]{6,}\/?(\?|$)/ },
  { host: /(^|\.)(x|twitter)\.com$/, page: /\/status\/\d+/, link: /^\/[^/]+\/status\/\d+(\/video\/\d)?\/?$/ },
  { host: /(^|\.)youtube\.com$/, page: /^\/(watch|shorts\/[\w-]+|live\/[\w-]+)/, link: /^\/(watch\?v=[\w-]+|shorts\/[\w-]+)/ },
  { host: /(^|\.)facebook\.com$|^fb\.watch$/, page: /\/videos\/\d|\/reel\/\d|\/watch\/?\?v=\d|\/share\/[vr]\//,
    link: /\/videos\/(\d|[^/]+\/\d)|\/reel\/\d+|\/watch\/?\?v=\d+|\/share\/[vr]\/\w+|\/posts\/|\/permalink\.php|story_fbid=/ }
];
const site = () => SITES.find(s => s.host.test(location.hostname));
const pathOf = (u) => { try { const x = new URL(u, location.href); return x.pathname + x.search; } catch { return ''; } };

function videoArea(v) {
  const r = v.getBoundingClientRect();
  const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  return w * h;
}
function pickVideo(x, y) {
  const vids = [...document.querySelectorAll('video')].filter(v => videoArea(v) > 2000);
  if (x != null) {
    const under = vids.filter(v => { const r = v.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    if (under.length) return under.sort((a, b) => videoArea(a) - videoArea(b))[0];
  }
  let best = null, score = 0;
  for (const v of vids) {
    const s = videoArea(v) * (!v.paused && v.currentTime > 0 ? 4 : 1);
    if (s > score) { score = s; best = v; }
  }
  return best;
}
function tiktokFromVideo(v) {
  let id = null, user = null;
  for (let el = v, i = 0; el && i < 25; el = el.parentElement, i++) {
    if (!id) { const m = (el.id || '').match(/(\d{17,21})/) || (el.getAttribute && (el.getAttribute('data-video-id') || '').match(/(\d{17,21})/)); if (m) id = m[1]; }
    if (!user && el.querySelector) {
      const a = el.querySelector('a[href*="/@"]');
      if (a) { const m = pathOf(a.href).match(/\/@([^/?#]+)/); if (m) user = m[1]; }
    }
    if (id && user) break;
  }
  return id ? `https://www.tiktok.com/@${user || 'i'}/video/${id}` : null;
}
function linkFromVideo(v, s) {
  const own = v.closest('a[href]');
  if (own && s && s.link.test(pathOf(own.href))) return own.href;
  if (s && /tiktok/.test(location.hostname)) {
    // الأول رقم الفيديو من العناصر اللي حوالين المشغّل نفسه
    const t = tiktokFromVideo(v);
    if (t) return t;
    // وبعدين لينك فيديو جوه نفس البوست. بنوقف أول ما نوصل لجزء فيه لينكات فيديوهات تانية
    // (زي «You may like» جنب الفيديو) علشان مانحمّلش الفيديو اللي بعده
    for (let el = v.parentElement, i = 0; el && i < 12; el = el.parentElement, i++) {
      const links = [...new Set([...el.querySelectorAll('a[href*="/video/"]')].filter(x => s.link.test(pathOf(x.href))).map(x => x.href.split(/[?#]/)[0]))];
      if (links.length > 1 || [...el.querySelectorAll('video')].length > 1) break;
      if (links.length === 1) return links[0];
    }
    // صفحة فيديو (مش الفيد): رابط الصفحة هو الفيديو اللي شغال
    if (s.page.test(location.pathname)) return location.href;
  }
  if (s) {
    for (let el = v.parentElement, i = 0; el && i < 40; el = el.parentElement, i++) {
      const a = [...el.querySelectorAll('a[href]')].find(x => s.link.test(pathOf(x.href)));
      if (a) return a.href;
    }
  }
  return null;
}
// بيرجع كذا رابط بالترتيب، والبرنامج بيجرب واحد ورا التاني لحد ما واحد ينفع
function resolveVideoCandidates({ x, y } = {}) {
  const s = site();
  const here = location.pathname + location.search;
  const pageSpecific = s ? s.page.test(here) : true;
  const v = pickVideo(x, y);
  const list = [];
  const add = (u) => { if (u && /^https?:/.test(u) && !list.includes(u)) list.push(u); };
  const pageFirst = pageSpecific && (x == null || !s || /youtube/.test(location.hostname));
  if (pageFirst) add(location.href);
  if (v) add(linkFromVideo(v, s));
  // من غير فيديو شغال: اللينك اللي تحت الماوس (زي مربعات الريلز في صفحة الصوت أو البروفايل)
  if (x != null && s) {
    const a = document.elementFromPoint(x, y);
    const link = a && a.closest && a.closest('a[href]');
    if (link && s.link.test(pathOf(link.href))) add(link.href);
  }
  if (pageSpecific) add(location.href);
  if (v && /^https?:/.test(v.currentSrc || '')) add(v.currentSrc); // فيديو مباشر
  add(location.href);
  return list;
}
function resolveVideoURL(opts) { return resolveVideoCandidates(opts)[0]; }
ipcRenderer.on('video:resolve', (_e, req) => {
  let candidates = [location.href];
  try { candidates = resolveVideoCandidates(req || {}); } catch { /* ignore */ }
  if (req && req.open) ipcRenderer.send('video:open-request', { url: candidates[0], candidates, mp3: !!req.mp3 });
  else ipcRenderer.send('video:resolved', { reqId: req && req.reqId, url: candidates[0], candidates });
});

// زرار «⬇ تحميل» بيظهر فوق أي فيديو لما تقف عليه بالماوس
function setupOverlay() {
  if (window.top !== window || !/^https?:/.test(location.protocol)) return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;display:none;top:0;left:0;';
  const root = host.attachShadow({ mode: 'closed' });
  // بدون innerHTML علشان مواقع زي يوتيوب بتمنعه (Trusted Types)
  const style = document.createElement('style');
  style.textContent = `button{all:initial;font:600 13px system-ui,Segoe UI,Tahoma,sans-serif;color:#fff;background:rgba(20,20,20,.78);
      border:1px solid rgba(255,255,255,.35);border-radius:16px;padding:5px 12px;cursor:pointer;direction:rtl;
      box-shadow:0 2px 8px rgba(0,0,0,.35);display:inline-flex;gap:6px;align-items:center;margin-inline-end:6px}
    button:hover{background:#e53935;border-color:#e53935}`;
  root.appendChild(style);
  for (const [id, label] of [['v', '⬇ تحميل'], ['a', '🎵 MP3']]) {
    const b = document.createElement('button'); b.id = id; b.textContent = label; root.appendChild(b);
  }
  let current = null, hideTimer = null, last = 0;
  const place = (v) => {
    const r = v.getBoundingClientRect();
    host.style.left = Math.max(4, r.left + 10) + 'px';
    host.style.top = Math.max(4, r.top + 10) + 'px';
    host.style.display = 'block';
  };
  const send = (mp3) => (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!current) return;
    let candidates = [location.href];
    try { const r = current.getBoundingClientRect(); candidates = resolveVideoCandidates({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); } catch { /* ignore */ }
    ipcRenderer.send('video:open-request', { url: candidates[0], candidates, mp3 });
  };
  for (const id of ['v', 'a']) {
    const b = root.getElementById(id);
    b.addEventListener('click', send(id === 'a'), true);
    for (const ev of ['mousedown', 'pointerdown', 'mouseup', 'pointerup']) b.addEventListener(ev, (e) => e.stopPropagation(), true);
  }
  host.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  document.addEventListener('mousemove', (e) => {
    const now = Date.now(); if (now - last < 120) return; last = now;
    const v = pickVideo(e.clientX, e.clientY);
    const r = v && v.getBoundingClientRect();
    if (v && r.width >= 180 && r.height >= 120 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      clearTimeout(hideTimer); current = v; place(v);
    } else if (current && !host.matches(':hover')) {
      clearTimeout(hideTimer); hideTimer = setTimeout(() => { host.style.display = 'none'; current = null; }, 700);
    }
  }, { passive: true, capture: true });
  window.addEventListener('scroll', () => { if (current) place(current); }, { passive: true, capture: true });
  (document.body || document.documentElement).appendChild(host);
}
window.addEventListener('DOMContentLoaded', async () => {
  let on = true;
  try { on = await ipcRenderer.invoke('video:overlay-enabled'); } catch { /* ignore */ }
  if (on) setupOverlay();
});

// ---------------- تخطي إعلانات يوتيوب ----------------
// بيشيل الإعلانات من بيانات الفيديو قبل ما المشغّل يشوفها، ولو إعلان ظهر برضه
// بيكتم صوته ويخلّصه في لحظة ويدوس «تخطي» لوحده.
const YT_SHIELD = `(() => {
  if (window.__alalamyYT) return; window.__alalamyYT = 1;
  const KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const clean = (o) => {
    if (!o || typeof o !== 'object') return o;
    for (const k of KEYS) if (k in o) { try { delete o[k]; } catch (e) {} }
    if (o.playerResponse) clean(o.playerResponse);
    if (Array.isArray(o)) for (const x of o) if (x && x.playerResponse) clean(x.playerResponse);
    return o;
  };
  const hasAds = (o) => o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || o.playerResponse || Array.isArray(o));
  const jp = JSON.parse;
  JSON.parse = function () { const r = jp.apply(this, arguments); try { if (hasAds(r)) clean(r); } catch (e) {} return r; };
  const rj = Response.prototype.json;
  Response.prototype.json = function () { return rj.call(this).then((r) => { try { if (hasAds(r)) clean(r); } catch (e) {} return r; }); };
  let ipr;
  try { Object.defineProperty(window, 'ytInitialPlayerResponse', { configurable: true, get() { return ipr; }, set(v) { ipr = clean(v); } }); } catch (e) {}
  let saved = null;
  setInterval(() => {
    const p = document.querySelector('#movie_player, .html5-video-player');
    const v = p && p.querySelector('video');
    if (!v) return;
    if (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')) {
      if (!saved) saved = { muted: v.muted, rate: v.playbackRate };
      v.muted = true;
      try { v.playbackRate = 16; } catch (e) {}
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.1) v.currentTime = v.duration - 0.05;
      const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, .ytp-ad-skip-button-container button');
      if (b) b.click();
    } else if (saved) {
      v.muted = saved.muted; v.playbackRate = saved.rate || 1; saved = null;
    }
  }, 250);
})();`;
const YT_CSS = `#player-ads, #masthead-ad, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,
ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer, ytd-companion-slot-renderer,
ytd-action-companion-ad-renderer, ytd-statement-banner-renderer, ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer),
.ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-text-overlay, .video-ads.ytp-ad-module > .ytp-ad-player-overlay-layout__ad-info-container,
ytm-promoted-sparkles-web-renderer, ytm-companion-ad-renderer, ytm-ad-slot-renderer, ad-slot-renderer, ytm-promoted-video-renderer
{ display: none !important; }`;
if (/(^|\.)youtube\.com$/.test(location.hostname)) {
  let on = true;
  try { on = ipcRenderer.sendSync('adblock:active', location.href); } catch { /* ignore */ }
  if (on) {
    try { require('electron').webFrame.executeJavaScript(YT_SHIELD); } catch { /* ignore */ }
    const addCss = () => {
      const st = document.createElement('style');
      st.textContent = YT_CSS;
      (document.head || document.documentElement).appendChild(st);
    };
    if (document.documentElement) addCss(); else window.addEventListener('DOMContentLoaded', addCss);
  }
}

// ---------- اختصارات كروم اللي الصفحة ليها الأولوية فيها (Ctrl+F، Ctrl+S، Ctrl+U...) ----------
// لو الصفحة نفسها ماستخدمتش الاختصار (preventDefault) المتصفح بينفذه، زي كروم بالظبط
try {
  const { shortcutAction, PAGE_FIRST } = require('./shortcuts');
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    const action = shortcutAction({ control: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, key: e.key, code: e.code });
    if (!action || !PAGE_FIRST.has(action)) return;
    // نستنى لحد ما كل أكواد الصفحة تخلص
    setTimeout(() => {
      if (e.defaultPrevented) return;
      if (action === 'open-menu' && e.repeat) return;
      ipcRenderer.send('page:shortcut', action);
    }, 0);
  }, true);
} catch { /* ignore */ }

// ---------- زراير الماوس الجانبية: رجوع / تقدم (ولو الصفحة اتفتحت من الرئيسية، الرجوع بيوديك للرئيسية) ----------
window.addEventListener('mouseup', (e) => {
  if (!e.isTrusted || (e.button !== 3 && e.button !== 4) || e.defaultPrevented) return;
  e.preventDefault();
  ipcRenderer.send('page:mouse-nav', e.button === 3 ? 'back' : 'forward');
}, true);
