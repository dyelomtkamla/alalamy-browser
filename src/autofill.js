'use strict';
/* الملء التلقائي زي صفحة chrome://settings/autofill: العناوين ومعلومات الاتصال، بطاقات الدفع وIBAN وبطاقات الولاء،
   مستندات الهوية (رخص القيادة، بطاقات الهوية، جوازات السفر)، السفر (المسافرين والمركبات)، وإعدادات الملء.
   الأرقام الحساسة (رقم البطاقة، IBAN، أرقام الهوية والجواز) بتتحفظ مشفرة بتشفير النظام زي كلمات المرور.
   كمان: الإشارات المرجعية المخفية (مقفولة برقم سري) وقائمة القراءة. */
const crypto = require('crypto');

const KINDS = {
  addresses: ['name', 'org', 'street', 'city', 'state', 'zip', 'country', 'phone', 'email'],
  cards: ['name', 'expMonth', 'expYear', 'nick'],
  ibans: ['nick'],
  loyalty: ['program', 'name', 'number'],
  licenses: ['name', 'country', 'region', 'issued', 'expiry'],
  idcards: ['name', 'country', 'issued', 'expiry'],
  passports: ['name', 'country', 'issued', 'expiry'],
  travelers: ['name', 'birth', 'nationality', 'phone', 'email', 'ktn'],
  vehicles: ['name', 'make', 'model', 'year', 'plate', 'vin']
};
// الأنواع اللي فيها رقم سري بنشفّره ونعرض آخر 4 أرقام بس
const SECRET = new Set(['cards', 'ibans', 'licenses', 'idcards', 'passports']);
const DEFAULT_PREFS = { addresses: true, payments: true, ids: true, travel: true, suggest: true, saveOffers: true };

function cardBrand(num) {
  const n = String(num || '').replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'American Express';
  if (/^507803|^507808|^5078/.test(n)) return 'ميزة';
  if (/^6(011|5)/.test(n)) return 'Discover';
  if (/^62/.test(n)) return 'UnionPay';
  if (/^35/.test(n)) return 'JCB';
  if (/^(4|5|6)/.test(n) && n.length >= 15) return 'بطاقة';
  return 'بطاقة';
}
function luhn(num) {
  const n = String(num || '').replace(/\D/g, '');
  if (n.length < 12 || n.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = +n[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function setup({ ipcMain, readJSON, writeJSON, encrypt, decrypt, sendUI, partitionOfWebContents, shell, safeOrigin, store, BrowserWindow }) {
  const data = Object.assign({}, readJSON('autofill.json', {}));
  for (const k of Object.keys(KINDS)) if (!Array.isArray(data[k])) data[k] = [];
  data.prefs = Object.assign({}, DEFAULT_PREFS, data.prefs || {});
  const save = () => writeJSON('autofill.json', data);

  const str = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  // اللي بيروح للواجهة: من غير الأرقام السرية
  const pub = (kind, it) => {
    const o = { id: it.id, time: it.time, used: it.used || 0 };
    for (const f of KINDS[kind]) o[f] = it[f] || '';
    if (SECRET.has(kind)) { o.last4 = it.last4 || ''; }
    if (kind === 'cards') o.brand = it.brand || '';
    return o;
  };
  const list = () => {
    const out = { prefs: data.prefs };
    for (const k of Object.keys(KINDS)) out[k] = data[k].map(it => pub(k, it));
    return out;
  };
  function upsert(kind, item) {
    if (!KINDS[kind] || !item || typeof item !== 'object') return null;
    let it = item.id ? data[kind].find(x => x.id === item.id) : null;
    if (!it) { it = { id: kind.slice(0, 2) + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), time: Date.now() }; data[kind].unshift(it); }
    for (const f of KINDS[kind]) if (item[f] !== undefined) it[f] = str(item[f], f === 'street' ? 400 : 200);
    if (SECRET.has(kind) && typeof item.number === 'string' && item.number.trim()) {
      const num = kind === 'cards' ? item.number.replace(/[^\d]/g, '').slice(0, 19) : str(item.number, 64).replace(/\s+/g, kind === 'ibans' ? '' : ' ');
      it.secret = encrypt(num);
      it.last4 = num.replace(/\s/g, '').slice(-4);
      if (kind === 'cards') it.brand = cardBrand(num);
    }
    data[kind] = data[kind].slice(0, 200);
    save();
    return pub(kind, it);
  }

  ipcMain.handle('af:list', () => list());
  ipcMain.handle('af:save', (_e, kind, item) => upsert(String(kind), item));
  ipcMain.handle('af:remove', (_e, kind, id) => {
    if (!KINDS[kind]) return;
    data[kind] = data[kind].filter(x => x.id !== id);
    save();
  });
  ipcMain.handle('af:reveal', (_e, kind, id) => {
    const it = KINDS[kind] && data[kind].find(x => x.id === id);
    return it && it.secret ? decrypt(it.secret) : '';
  });
  ipcMain.handle('af:prefs', (_e, patch) => {
    if (patch && typeof patch === 'object') for (const k of Object.keys(DEFAULT_PREFS)) if (typeof patch[k] === 'boolean') data.prefs[k] = patch[k];
    save();
    return data.prefs;
  });
  ipcMain.handle('af:clear', () => { for (const k of Object.keys(KINDS)) data[k] = []; save(); });
  ipcMain.handle('af:passkeys', () => {
    if (process.platform === 'win32') return shell.openExternal('ms-settings:savedpasskeys').then(() => true, () => false);
    if (process.platform === 'darwin') return shell.openExternal('x-apple.systempreferences:com.apple.Passwords-Settings.extension').then(() => true, () => false);
    return false;
  });

  // ---- من الصفحة: الاقتراحات لما تقف في خانة عنوان أو بطاقة ----
  ipcMain.handle('af:suggest', (e) => {
    if (!data.prefs.suggest) return { addresses: [], cards: [], ids: [] };
    if (!/^https?:/.test(e.sender.getURL())) return { addresses: [], cards: [], ids: [] };
    const addresses = data.prefs.addresses ? data.addresses.map(a => pub('addresses', a)) : [];
    const cards = data.prefs.payments ? data.cards.map(c => pub('cards', c)) : [];
    const ids = data.prefs.ids ? [...data.idcards.map(x => ({ ...pub('idcards', x), kind: 'idcards' })), ...data.passports.map(x => ({ ...pub('passports', x), kind: 'passports' })), ...data.licenses.map(x => ({ ...pub('licenses', x), kind: 'licenses' }))] : [];
    return { addresses, cards, ids };
  });
  // رقم البطاقة/الهوية بيتبعت للصفحة بس لما المستخدم يختار البطاقة بنفسه من القايمة
  ipcMain.handle('af:fill-secret', (e, kind, id) => {
    if (!['cards', 'idcards', 'passports', 'licenses'].includes(kind)) return '';
    if (!/^https?:/.test(e.sender.getURL())) return '';
    const it = data[kind].find(x => x.id === id);
    if (!it) return '';
    it.used = (it.used || 0) + 1; save();
    return it.secret ? decrypt(it.secret) : '';
  });
  ipcMain.on('af:used', (_e, kind, id) => {
    const it = KINDS[kind] && data[kind].find(x => x.id === id);
    if (it) { it.used = (it.used || 0) + 1; save(); }
  });

  // ---- بعد ما المستخدم يبعت فورم فيه عنوان أو بطاقة: نعرض «حفظ العنوان؟» زي كروم ----
  const pending = new Map();
  ipcMain.on('af:capture', (e, payload) => {
    if (!data.prefs.saveOffers || !payload || typeof payload !== 'object') return;
    const partition = partitionOfWebContents(e.sender) || '';
    if (partition.startsWith('temp_')) return; // التصفح المتخفي مابيحفظش
    const origin = safeOrigin(e.sender.getURL());
    if (payload.address && data.prefs.addresses) {
      const a = {};
      for (const f of KINDS.addresses) a[f] = str(payload.address[f]);
      const filled = KINDS.addresses.filter(f => a[f]).length;
      const same = data.addresses.some(x => KINDS.addresses.every(f => !a[f] || (x[f] || '') === a[f]));
      if (filled >= 3 && (a.street || a.city || a.phone) && !same) {
        const id = 'afp' + Date.now();
        pending.set(id, { kind: 'addresses', item: a });
        sendUI('af:prompt', { id, kind: 'addresses', origin, summary: [a.name, a.street, a.city, a.phone].filter(Boolean).join('، ') });
      }
    }
    if (payload.card && data.prefs.payments) {
      const num = String(payload.card.number || '').replace(/\D/g, '');
      if (luhn(num) && !data.cards.some(c => c.last4 === num.slice(-4) && decrypt(c.secret) === num)) {
        const id = 'afc' + Date.now();
        const exp = String(payload.card.exp || '');
        let expMonth = str(payload.card.expMonth, 2), expYear = str(payload.card.expYear, 4);
        const m = exp.match(/(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
        if (m) { expMonth = m[1]; expYear = m[2]; }
        if (expYear.length === 2) expYear = '20' + expYear;
        pending.set(id, { kind: 'cards', item: { name: str(payload.card.name), number: num, expMonth: expMonth.padStart(2, '0').replace(/^00$/, ''), expYear } });
        sendUI('af:prompt', { id, kind: 'cards', origin, summary: `${cardBrand(num)} •••• ${num.slice(-4)}` });
      }
    }
  });
  ipcMain.handle('af:respond', (_e, id, action) => {
    const p = pending.get(id); pending.delete(id);
    if (p && action === 'save') upsert(p.kind, p.item);
    if (action === 'never') { data.prefs.saveOffers = false; save(); }
  });

  // ---- الإشارات المرجعية المخفية: مش بتظهر في الشريط ولا في الإدارة، ومقفولة برقم سري ----
  const hidden = Object.assign({ pin: null, items: null }, readJSON('hidden-bookmarks.json', {}));
  const saveHidden = () => writeJSON('hidden-bookmarks.json', hidden);
  let hiddenItems = [];
  try { hiddenItems = hidden.items ? JSON.parse(decrypt(hidden.items) || '[]') : []; } catch { hiddenItems = []; }
  const unlocked = new Set(); // webContents ids اللي فتحت القفل في الجلسة دي
  const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const checkPin = (pin) => hidden.pin && crypto.timingSafeEqual(Buffer.from(hashPin(pin, hidden.pin.salt), 'hex'), Buffer.from(hidden.pin.hash, 'hex'));
  const persistItems = () => { hidden.items = encrypt(JSON.stringify(hiddenItems)); saveHidden(); };
  const isUnlocked = (e) => unlocked.has(e.sender.id);
  let failures = 0, lockUntil = 0;

  ipcMain.handle('hb:status', (e) => ({ hasPin: !!hidden.pin, unlocked: isUnlocked(e), count: hidden.pin ? null : hiddenItems.length }));
  ipcMain.handle('hb:set-pin', (e, pin, oldPin) => {
    pin = String(pin || '');
    if (!/^\d{4,12}$/.test(pin)) return { error: 'الرقم السري لازم يكون من 4 لـ 12 رقم' };
    if (hidden.pin && !isUnlocked(e) && !checkPin(oldPin)) return { error: 'الرقم السري القديم غلط' };
    const salt = crypto.randomBytes(16).toString('hex');
    hidden.pin = { salt, hash: hashPin(pin, salt) };
    unlocked.add(e.sender.id);
    persistItems();
    return { ok: true };
  });
  ipcMain.handle('hb:unlock', (e, pin) => {
    if (Date.now() < lockUntil) return { error: `استنى ${Math.ceil((lockUntil - Date.now()) / 1000)} ثانية وجرب تاني` };
    if (!hidden.pin) return { error: 'مفيش رقم سري' };
    if (!checkPin(pin)) {
      failures++;
      if (failures >= 5) { lockUntil = Date.now() + 30000 * Math.min(10, failures - 4); }
      return { error: 'الرقم السري غلط' };
    }
    failures = 0; unlocked.add(e.sender.id);
    return { ok: true };
  });
  ipcMain.handle('hb:lock', (e) => { unlocked.delete(e.sender.id); });
  ipcMain.handle('hb:list', (e) => isUnlocked(e) ? hiddenItems : null);
  ipcMain.handle('hb:add', (e, b) => {
    if (!hidden.pin || !b || typeof b.url !== 'string' || !/^(https?|file):/.test(b.url)) return { error: 'bad' };
    // الإضافة مسموحة من غير فتح القفل (زي ما تحط حاجة في خزنة)، بس العرض محتاج الرقم السري
    hiddenItems = hiddenItems.filter(x => x.url !== b.url);
    hiddenItems.unshift({ id: 'h' + Date.now().toString(36), title: str(b.title || b.url), url: b.url.slice(0, 2000), time: Date.now() });
    persistItems();
    return { ok: true };
  });
  ipcMain.handle('hb:save', (e, list) => {
    if (!isUnlocked(e) || !Array.isArray(list)) return null;
    hiddenItems = list.filter(b => b && typeof b.url === 'string').slice(0, 2000)
      .map(b => ({ id: String(b.id || 'h' + Date.now()), title: str(b.title || b.url), url: b.url.slice(0, 2000), time: Number(b.time) || Date.now() }));
    persistItems();
    return hiddenItems;
  });
  ipcMain.handle('hb:forget', (e) => {
    // نسيت الرقم السري: بنمسح الإشارات المخفية كلها والرقم (مفيش طريقة نرجّعها من غير الرقم)
    hiddenItems = []; hidden.pin = null; hidden.items = null; unlocked.clear(); saveHidden();
    return { ok: true };
  });

  // ---- قائمة القراءة (زي كروم): صفحات محفوظة تقراها بعدين، مقروءة/غير مقروءة ----
  let reading = readJSON('reading-list.json', []);
  if (!Array.isArray(reading)) reading = [];
  const saveReading = () => writeJSON('reading-list.json', reading);
  ipcMain.handle('rl:list', () => reading);
  ipcMain.handle('rl:add', (_e, it) => {
    if (!it || typeof it.url !== 'string' || !/^https?:/.test(it.url)) return reading;
    reading = reading.filter(x => x.url !== it.url);
    reading.unshift({ id: 'r' + Date.now().toString(36), url: it.url.slice(0, 2000), title: str(it.title || it.url), favicon: typeof it.favicon === 'string' && /^(https?|data):/.test(it.favicon) ? it.favicon.slice(0, 3000) : '', read: false, time: Date.now() });
    reading = reading.slice(0, 500); saveReading();
    return reading;
  });
  ipcMain.handle('rl:mark', (_e, id, read) => { const x = reading.find(r => r.id === id); if (x) { x.read = !!read; saveReading(); } return reading; });
  ipcMain.handle('rl:remove', (_e, id) => { reading = reading.filter(r => r.id !== id); saveReading(); return reading; });

  return { data };
}

module.exports = { setup, cardBrand, luhn };
