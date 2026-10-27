'use strict';
/* أدوات أطراف الصفحة الرئيسية (الفراغ اللي بره عمود الأخبار والكورة على الشاشات العريضة):
   شمال: مهام النهارده، مؤقّت التركيز، أسعار الدهب، اللي اتقفل من شوية.
   يمين: آية اليوم + سبحة، تقويم الشهر بمواعيدك، ماتشات النهارده، الساعة في بلاد العملاء.
   وكمان: الأذان بصوت إسلام صبحي / عبد الرحمن مسعود / العفاسي بالتناوب، وتحية جنب اسم صاحب المتصفح. */

const arNum = (n) => Number(n).toLocaleString('ar-EG');
const ymdOf = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// الكارت لسه معروض؟ (علشان المؤقتات تقف لوحدها لما الأدوات تترسم من جديد)
const alive = (node, t) => { if (node.isConnected) return true; clearInterval(t); return false; };

/* ---------- مهام النهارده ---------- */
function todoWidget() {
  if (!Array.isArray(wg.todos)) wg.todos = [];
  const list = el('div', { class: 'wgTodos' });
  const count = el('span', { class: 'wgCount' });
  const inp = el('input', { class: 'wgInput', dir: 'auto', maxlength: 200, placeholder: '＋ ضيف مهمة واضغط Enter' });
  const draw = () => {
    list.innerHTML = '';
    for (const t of wg.todos) {
      const row = el('div', { class: 'wgTodo' + (t.done ? ' done' : '') },
        el('button', { class: 'wgCheck', title: t.done ? 'رجّعها' : 'خلصت', onclick: () => { t.done = !t.done; wgSave(); draw(); } }),
        el('span', { class: 'grow', dir: 'auto' }, t.t),
        el('button', { class: 'wgDel', title: 'حذف', onclick: () => { wg.todos = wg.todos.filter(x => x !== t); wgSave(); draw(); } }, '✕'));
      list.append(row);
    }
    const done = wg.todos.filter(t => t.done).length;
    count.textContent = wg.todos.length ? `${arNum(done)} من ${arNum(wg.todos.length)}` : '';
    clear.classList.toggle('hidden', !done);
  };
  const clear = el('button', { class: 'wgCity', onclick: () => { wg.todos = wg.todos.filter(t => !t.done); wgSave(); draw(); } }, 'امسح اللي خلص');
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    wg.todos.push({ id: uid(), t: inp.value.trim().slice(0, 200), done: false });
    if (wg.todos.length > 40) wg.todos.shift();
    inp.value = ''; wgSave(); draw();
  });
  draw();
  const c = wgCard('todo', 'مهام النهارده', '✅', list, inp, el('div', { class: 'wgFoot' }, el('span'), clear));
  c.querySelector('.ntListHead .grow').after(count);
  return c;
}

/* ---------- مؤقّت التركيز (بومودورو) ---------- */
const FOCUS_DEF = { len: 25, brk: 5, mode: 'work', endAt: 0, left: 25 * 60, n: 1 };
const focusState = () => (wg.focus = Object.assign({}, FOCUS_DEF, wg.focus || {}));
const fmtMS = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function chime(times = 3) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.45;
      o.frequency.value = i % 2 ? 660 : 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.start(t0); o.stop(t0 + 0.42);
    }
    setTimeout(() => ctx.close(), times * 450 + 500);
  } catch { /* ignore */ }
}
function sysNotify(title, body) { try { new Notification(title, { body, silent: true }); } catch { /* ignore */ } }
function focusTick() {
  const f = focusState();
  if (!f.endAt || Date.now() < f.endAt) return;
  const key = 'focus:' + f.endAt;
  const wasWork = f.mode === 'work';
  Object.assign(f, wasWork ? { mode: 'break', left: f.brk * 60 } : { mode: 'work', left: f.len * 60, n: f.n % 4 + 1 }, { endAt: 0 });
  wgSave();
  api.claim(key).then((ok) => {
    if (!ok) return;
    chime();
    sysNotify(wasWork ? 'خلصت جلسة التركيز 👏' : 'خلصت الاستراحة', wasWork ? `خد استراحة ${f.brk} دقايق` : 'يلا نبدأ جلسة جديدة');
  });
  toast(wasWork ? 'خلصت جلسة التركيز، خد استراحة 👏' : 'خلصت الاستراحة، يلا نكمّل');
}
setInterval(focusTick, 1000);
function focusWidget() {
  const ring = el('div', { class: 'wgRing' }, el('b', { dir: 'ltr' }));
  const mainBtn = el('button', { class: 'wgBtn primary' });
  const info = el('span', { class: 'wgCount' });
  const remaining = () => { const f = focusState(); return f.endAt ? Math.max(0, (f.endAt - Date.now()) / 1000) : f.left; };
  const draw = () => {
    const f = focusState();
    const total = (f.mode === 'work' ? f.len : f.brk) * 60, left = remaining();
    ring.style.setProperty('--p', (100 - left / total * 100).toFixed(1));
    ring.classList.toggle('brk', f.mode === 'break');
    ring.firstChild.textContent = fmtMS(Math.ceil(left));
    mainBtn.textContent = f.endAt ? '⏸ إيقاف' : left < total ? '▶ كمّل' : '▶ ابدأ';
    info.textContent = f.mode === 'work' ? `جلسة ${arNum(f.n)} من ٤` : 'استراحة';
  };
  mainBtn.onclick = () => {
    const f = focusState();
    if (f.endAt) { f.left = remaining(); f.endAt = 0; } else f.endAt = Date.now() + f.left * 1000;
    wgSave(); draw();
  };
  const preset = (label, mode, min) => el('button', { class: 'wgBtn', onclick: () => {
    const f = focusState();
    if (mode === 'work') f.len = min; else f.brk = min;
    Object.assign(f, { mode, left: min * 60, endAt: 0 }); wgSave(); draw();
  } }, label);
  const reset = el('button', { class: 'wgBtn', onclick: () => { const f = focusState(); Object.assign(f, { endAt: 0, left: (f.mode === 'work' ? f.len : f.brk) * 60 }); wgSave(); draw(); } }, '↺ من الأول');
  draw();
  const t = setInterval(() => { if (alive(ring, t)) draw(); }, 1000);
  const c = wgCard('focus', 'مؤقّت التركيز', '⏱', el('div', { class: 'wgFocus' }, ring,
    el('div', { class: 'wgFocusBtns' }, el('div', { class: 'row' }, mainBtn, reset),
      el('div', { class: 'row' }, preset('٢٥ د', 'work', 25), preset('٥٠ د', 'work', 50), preset('استراحة ٥', 'break', 5)))));
  c.querySelector('.ntListHead .grow').after(info);
  return c;
}

/* ---------- أسعار الدهب بالجنيه ---------- */
function goldWidget() {
  const body = el('div', { class: 'wgRates' }, el('div', { class: 'wgLoad' }, 'بنجيب أسعار الدهب...'));
  const load = () => Promise.all([api.gold(), api.rates()]).then(([g, r]) => {
    body.innerHTML = '';
    const egp = r && r.rates && r.rates.EGP;
    if (!g || !g.usdGram || !egp) { body.append(el('div', { class: 'wgLoad' }, 'مفيش اتصال بالنت دلوقتي')); return; }
    const fmt = (v) => Math.round(v).toLocaleString('ar-EG') + ' ج.م';
    const row = (label, mult) => {
      const now = g.usdGram * egp * mult;
      const diff = g.prevUsdGram ? (g.usdGram - g.prevUsdGram) * egp * mult : 0;
      const d = Math.round(diff);
      return el('div', { class: 'wgRate' }, el('span', {}, label), el('span', {}, el('b', {}, fmt(now)),
        d ? el('small', { class: d > 0 ? 'up' : 'dn' }, (d > 0 ? ' ▲ ' : ' ▼ ') + Math.abs(d).toLocaleString('ar-EG')) : null));
    };
    body.append(row('عيار ٢١', 21 / 24), row('عيار ٢٤', 1), row('عيار ١٨', 18 / 24), row('الجنيه الدهب', 21 / 24 * 8),
      el('small', { class: 'wgUpd' }, 'سعر لحظي بسعر الدولار دلوقتي، من غير مصنعية · ' + new Date(g.updated || Date.now()).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) + (g.stale || r.stale ? ' (من غير نت)' : '')));
  });
  // بيتحدث لوحده كل دقيقة طول ما الصفحة مفتوحة
  load();
  const t = setInterval(() => { if (alive(body, t) && !document.hidden) load(); }, 60000);
  return wgCard('gold', 'أسعار الدهب النهارده', '🪙', body, el('div', { class: 'wgFoot' }, el('span'),
    el('button', { class: 'wgCity', onclick: () => navigate('https://www.google.com/search?q=' + encodeURIComponent('سعر الدهب النهارده في مصر')) }, 'التفاصيل ↗')));
}

/* ---------- اللي اتقفل من شوية ---------- */
function closedWidget() {
  const list = el('div', { class: 'wgClosed' });
  let sig = '';
  const draw = () => {
    const s = state.closed.map(c => c.time).join(',');
    if (s === sig) return;
    sig = s; list.innerHTML = '';
    const items = [];
    for (let i = state.closed.length - 1; i >= 0 && items.length < 5; i--) {
      const c = state.closed[i];
      if (!/^https?:/i.test(c.url || '')) continue;
      items.push(el('button', { class: 'wgTab', title: c.url, onclick: () => reopenClosedTab(i) },
        el('img', { src: faviconFor(c.url), alt: '' }), el('span', { dir: 'auto' }, c.title || c.url)));
    }
    if (!items.length) list.append(el('div', { class: 'wgLoad' }, 'مفيش تابات اتقفلت لسه'));
    list.append(...items);
  };
  draw();
  const t = setInterval(() => { if (alive(list, t)) draw(); }, 1500);
  const c = wgCard('closed', 'اتقفلت من شوية', '↩', list);
  c.querySelector('.ntListHead .grow').after(el('span', { class: 'wgCount', dir: 'ltr' }, 'Ctrl+Shift+T'));
  return c;
}

/* ---------- آية اليوم + سبحة ---------- */
// [سورة، من آية، لحد آية]: النص والصوت بيتجابوا من مصدر موثوق (alquran.cloud) مش مكتوبين هنا
const AYAT = [[94, 5, 6], [13, 28, 28], [2, 152, 152], [3, 139, 139], [14, 7, 7], [16, 128, 128], [29, 69, 69], [40, 60, 60], [65, 3, 3],
  [93, 3, 5], [94, 7, 8], [2, 153, 153], [20, 25, 28], [28, 24, 24], [2, 186, 186], [3, 8, 8], [2, 201, 201], [12, 87, 87], [18, 10, 10],
  [25, 74, 74], [17, 24, 24], [71, 10, 12], [51, 22, 22], [39, 53, 53], [21, 87, 87], [20, 114, 114], [8, 46, 46], [2, 286, 286]];
const TASBIH = ['سبحان الله', 'الحمد لله', 'الله أكبر', 'لا إله إلا الله', 'سبحان الله وبحمده', 'أستغفر الله', 'اللهم صلّ على محمد', 'لا حول ولا قوة إلا بالله'];
let ayaAudio = null;
function ayaWidget() {
  const dayIdx = Math.floor((Date.now() / 86400000)) + (wg.ayaShift || 0);
  const [s, a1, a2] = AYAT[((dayIdx % AYAT.length) + AYAT.length) % AYAT.length];
  const text = el('div', { class: 'wgAya' }, el('div', { class: 'wgLoad' }, '...'));
  const ref = el('div', { class: 'wgRef' });
  const play = el('button', { class: 'wgCity' }, '▶ استمع');
  const nums = []; for (let a = a1; a <= a2; a++) nums.push(a);
  Promise.all(nums.map(a => api.ayah(s, a))).then((res) => {
    text.innerHTML = '';
    if (res.some(r => !r)) { text.append(el('div', { class: 'wgLoad' }, 'محتاج نت أول مرة علشان نجيب الآية')); return; }
    text.append(...res.flatMap((r, i) => [r.text + ' ', el('span', { class: 'ayaNo' }, `﴿${arNum(nums[i])}﴾`), ' ']));
    ref.textContent = `${res[0].surah} · ${arNum(a1)}${a2 > a1 ? '–' + arNum(a2) : ''}`;
    play.onclick = () => {
      if (ayaAudio) { ayaAudio.pause(); ayaAudio = null; play.textContent = '▶ استمع'; return; }
      let i = 0;
      const next = () => {
        if (i >= res.length) { ayaAudio = null; play.textContent = '▶ استمع'; return; }
        ayaAudio = new Audio(res[i++].audio); ayaAudio.onended = next; ayaAudio.onerror = () => { ayaAudio = null; play.textContent = '▶ استمع'; toast('مش قادر أشغل الصوت دلوقتي'); };
        ayaAudio.play().catch(() => {});
      };
      play.textContent = '⏸ وقف'; next();
    };
  });
  // السبحة
  const tb = wg.tasbih = Object.assign({ i: 0, n: 0, goal: 33 }, wg.tasbih || {});
  const phrase = el('button', { class: 'wgPhrase', title: 'غيّر الذكر' });
  const goal = el('small', {});
  const counter = el('button', { class: 'wgTasbihN', title: 'اضغط للعد' });
  const draw = () => {
    phrase.textContent = TASBIH[tb.i % TASBIH.length];
    goal.textContent = `الهدف ${arNum(tb.goal)} · اضغط للعد`;
    counter.textContent = arNum(tb.n);
    counter.classList.toggle('full', tb.n >= tb.goal);
  };
  phrase.onclick = () => { tb.i = (tb.i + 1) % TASBIH.length; tb.n = 0; wgSave(); draw(); };
  goal.onclick = () => { tb.goal = tb.goal === 33 ? 100 : 33; wgSave(); draw(); };
  counter.onclick = () => { tb.n++; if (tb.n === tb.goal) chime(1); wgSave(); draw(); };
  const reset = el('button', { class: 'wgDel', title: 'صفّر العداد', onclick: () => { tb.n = 0; wgSave(); draw(); } }, '↺');
  draw();
  return wgCard('aya', 'آية اليوم', '📖', text, el('div', { class: 'wgFoot' }, el('span', { class: 'wgRef' }, ref), play),
    el('div', { class: 'wgTasbih' }, el('div', { class: 'grow' }, phrase, goal), reset, counter),
    el('div', { class: 'wgFoot' }, el('span'), el('button', { class: 'wgCity', onclick: () => { wg.ayaShift = (wg.ayaShift || 0) + 1; wgSave(); renderWidgets(); } }, '⟳ آية تانية')));
}

/* ---------- تقويم الشهر + مواعيدك ---------- */
let calOffset = 0;
function calWidget() {
  if (!wg.events || typeof wg.events !== 'object') wg.events = {};
  const tz = wg.city.tz;
  const todayKey = ymdOf(new Date(), tz);
  const [ty, tm] = todayKey.split('-').map(Number);
  const first = new Date(Date.UTC(ty, tm - 1 + calOffset, 1, 12));
  const y = first.getUTCFullYear(), m = first.getUTCMonth();
  const title = el('span', { class: 'grow' }, first.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
  const grid = el('div', { class: 'wgCal' });
  for (const d of ['سبت', 'حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة']) grid.append(el('span', { class: 'd' }, d));
  const lead = (first.getUTCDay() + 1) % 7; // السبت أول الأسبوع
  const start = new Date(Date.UTC(y, m, 1 - lead, 12));
  let hijriFmt = null;
  try { hijriFmt = new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { /* ignore */ }
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (i >= 35 && d.getUTCMonth() !== m) break;
    const key = d.toISOString().slice(0, 10);
    const ev = wg.events[key] || [];
    const cell = el('button', {
      class: ['day', d.getUTCMonth() !== m ? 'o' : '', key === todayKey ? 't' : '', ev.length ? 'ev' : ''].filter(Boolean).join(' '),
      title: [hijriFmt ? hijriFmt.format(d) : '', ...ev].filter(Boolean).join('\n'),
      onclick: () => dayMenu(key, d)
    }, arNum(d.getUTCDate()));
    grid.append(cell);
  }
  // أقرب موعد جاي
  const next = Object.keys(wg.events).filter(k => k >= todayKey && wg.events[k].length).sort()[0];
  const nextLine = el('div', { class: 'wgNextEv' }, next
    ? `● ${next === todayKey ? 'النهارده' : new Date(next + 'T12:00Z').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${wg.events[next][0]}`
    : 'اضغط على أي يوم علشان تضيف موعد');
  const nav = (n) => el('button', { class: 'wgDel', onclick: () => { calOffset = n ? calOffset + n : 0; renderWidgets(); } }, n > 0 ? '‹' : n < 0 ? '›' : '•');
  const c = wgCard('calendar', '', '📅', grid, nextLine);
  const head = c.querySelector('.ntListHead');
  head.querySelector('.grow').replaceWith(title);
  title.after(nav(-1), nav(0), nav(1));
  return c;
}
async function dayMenu(key, d) {
  const ev = wg.events[key] || [];
  const label = d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  let pick = 'add';
  if (ev.length) {
    pick = await api.uiMenu([...ev.map((t, i) => ({ id: 'd' + i, label: '🗑 امسح: ' + t })), { id: 'add', label: '＋ ضيف موعد يوم ' + label }]);
    if (pick == null) return;
  }
  if (pick === 'add') {
    const t = await askText('موعد يوم ' + label, '', { placeholder: 'مثلاً: اجتماع العميل الساعة ١١' });
    if (!t || !t.trim()) return;
    wg.events[key] = [...ev, t.trim().slice(0, 120)];
  } else {
    ev.splice(Number(pick.slice(1)), 1);
    if (ev.length) wg.events[key] = ev; else delete wg.events[key];
  }
  wgSave(); renderWidgets();
}

/* ---------- ماتشات النهارده ---------- */
function matchesWidget() {
  const body = el('div', { class: 'wgMatches' }, el('div', { class: 'wgLoad' }, 'بنجيب الماتشات...'));
  const tz = wg.city.tz;
  const load = () => api.matches(ymdOf(new Date(), tz).replace(/-/g, '')).then((list) => {
    body.innerHTML = '';
    if (!list) { body.append(el('div', { class: 'wgLoad' }, 'مفيش اتصال بالنت دلوقتي')); return; }
    if (!list.length) { body.append(el('div', { class: 'wgLoad' }, 'مفيش ماتشات مهمة النهارده')); return; }
    for (const mt of list.slice(0, 7)) {
      const logo = (t) => t.logo ? el('img', { src: t.logo, alt: '' }) : null;
      const mid = mt.state === 'pre'
        ? new Date(mt.date).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: tz })
        : `${mt.home.score} - ${mt.away.score}`;
      body.append(el('button', { class: 'wgMatch' + (mt.state === 'in' ? ' live' : ''), title: mt.league + (mt.detail ? ' · ' + mt.detail : ''),
        onclick: () => navigate('https://www.google.com/search?q=' + encodeURIComponent(`${mt.home.name} vs ${mt.away.name}`)) },
      el('span', { class: 'tm' }, logo(mt.home), el('span', {}, mt.home.name)),
      el('span', { class: 'sc', dir: 'ltr' }, mid, mt.state === 'in' ? el('i', {}, mt.clock || 'مباشر') : null),
      el('span', { class: 'tm a' }, el('span', {}, mt.away.name), logo(mt.away))));
    }
    if (list.some(x => x.state === 'in') && body.isConnected) setTimeout(() => { if (body.isConnected) load(); }, 60000);
  });
  load();
  const c = wgCard('matches', 'ماتشات النهارده', '⚽', body);
  c.querySelector('.ntListHead .grow').after(el('span', { class: 'wgCount' }, 'بتوقيتك'));
  return c;
}

/* ---------- الساعة في بلاد العملاء ---------- */
const CLOCKS_DEF = [{ name: 'مكة', tz: 'Asia/Riyadh' }, { name: 'دبي', tz: 'Asia/Dubai' }, { name: 'لندن', tz: 'Europe/London' }, { name: 'نيويورك', tz: 'America/New_York' }];
function clocksWidget() {
  if (!Array.isArray(wg.clocks)) wg.clocks = CLOCKS_DEF.slice();
  const grid = el('div', { class: 'wgClocks' });
  const draw = () => {
    grid.innerHTML = '';
    const now = new Date(), here = ymdOf(now, wg.city.tz);
    wg.clocks.forEach((c, i) => {
      let time = '', day = '';
      try {
        time = now.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: c.tz });
        const d = ymdOf(now, c.tz);
        day = d > here ? ' (بكرة)' : d < here ? ' (امبارح)' : '';
      } catch { time = '؟'; }
      grid.append(el('button', { class: 'wgClk', title: 'اضغط علشان تشيلها', onclick: async () => {
        const r = await api.uiMenu([{ id: 'rm', label: '🗑 شيل ' + c.name }]);
        if (r === 'rm') { wg.clocks.splice(i, 1); wgSave(); draw(); }
      } }, el('span', {}, c.name), el('b', {}, time, el('small', {}, day))));
    });
    if (wg.clocks.length < 8) grid.append(el('button', { class: 'wgClk add', onclick: addClock }, '＋ مدينة'));
  };
  async function addClock() {
    const q = await askText('اكتب اسم المدينة', '', { placeholder: 'مثلاً: الكويت، باريس، تورونتو' });
    if (!q) return;
    const res = await api.geocode(q);
    if (!res.length) return toast('مالقيناش المدينة دي');
    let pick = res[0];
    if (res.length > 1) {
      const id = await api.uiMenu(res.map((r, i) => ({ id: String(i), label: [r.name, r.admin, r.country].filter(Boolean).join('، ') })));
      if (id == null) return;
      pick = res[Number(id)];
    }
    if (!pick.tz) return toast('مش عارف توقيت المدينة دي');
    wg.clocks.push({ name: pick.name, tz: pick.tz }); wgSave(); draw();
  }
  draw();
  const t = setInterval(() => { if (alive(grid, t)) draw(); }, 30000);
  return wgCard('clocks', 'الساعة في بلاد العملاء', '🌍', grid);
}

// ترتيب الأدوات في الطرفين (الواجهة عربي: اليمين أول عمود)
const EDGE_WIDGETS = {
  right: [['aya', ayaWidget], ['calendar', calWidget], ['matches', matchesWidget], ['clocks', clocksWidget]],
  left: [['todo', todoWidget], ['focus', focusWidget], ['gold', goldWidget], ['closed', closedWidget]]
};
const EDGE_NAMES = { todo: 'مهام النهارده', focus: 'مؤقّت التركيز', gold: 'أسعار الدهب', closed: 'اتقفلت من شوية', aya: 'آية اليوم والسبحة', calendar: 'التقويم', matches: 'ماتشات النهارده', clocks: 'الساعة في بلاد العملاء' };

/* ---------- الأذان ---------- */
const RECITERS = [['sobhy', 'الشيخ إسلام صبحي'], ['mosaad', 'الشيخ عبد الرحمن مسعود'], ['afasy', 'الشيخ مشاري العفاسي']];
const ADHAN_PRAYERS = PRAYER_NAMES.filter(([k]) => k !== 'sunrise');
// صوت الأذان مقفول من الأول (ناس انزعجت): بيشتغل بس لو المستخدم شغّله بنفسه (chosen)، حتى للي كان عندهم مفتوح لوحده
const adhanCfg = () => {
  const c = wg.adhan = Object.assign({ on: false, mode: 'rotate', next: 0, vol: 0.9 }, wg.adhan || {});
  if (!c.chosen) c.on = false;
  return c;
};
let adhanAudio = null;
const adhanPlayed = new Set();
function stopAdhan() {
  if (adhanAudio) { adhanAudio.pause(); adhanAudio = null; }
  const b = $('#adhanBar'); if (b) b.remove();
}
async function playAdhan(prayerName, test) {
  const cfg = adhanCfg();
  stopAdhan();
  let order;
  if (cfg.mode === 'rotate') {
    const i = cfg.next % RECITERS.length;
    if (!test) { cfg.next = i + 1; wgSave(); }
    order = [...RECITERS.slice(i), ...RECITERS.slice(0, i)].map(r => r[0]);
  } else order = [cfg.mode, ...RECITERS.map(r => r[0]).filter(x => x !== cfg.mode)];
  const bar = el('div', { id: 'adhanBar' }, el('span', { class: 'em' }, '🕌'),
    el('div', { class: 'grow' }, el('b', {}, test ? 'تجربة صوت الأذان' : `حان الآن موعد أذان ${prayerName}`), el('small', {}, 'بنجهّز الصوت...')),
    el('button', { onclick: stopAdhan }, '⏹ إيقاف'));
  document.body.append(bar);
  if (!test) sysNotify(`حان الآن موعد أذان ${prayerName}`, wg.city.name);
  let url = null, who = '';
  for (const id of order) {
    url = await api.adhanFile(id);
    if (url) { who = id === 'custom' ? 'الصوت اللي اخترته' : 'بصوت ' + RECITERS.find(r => r[0] === id)[1]; break; }
  }
  if (!bar.isConnected) return;
  if (!url) { bar.querySelector('small').textContent = 'مقدرتش أنزّل صوت الأذان (محتاج نت أول مرة)'; chime(4); setTimeout(() => bar.remove(), 20000); return; }
  bar.querySelector('small').textContent = who;
  adhanAudio = new Audio(url);
  adhanAudio.volume = Math.max(0, Math.min(1, cfg.vol));
  adhanAudio.onended = () => { adhanAudio = null; bar.remove(); };
  adhanAudio.play().catch(() => { bar.querySelector('small').textContent = 'مقدرتش أشغل الصوت'; });
}
function adhanTick() {
  const cfg = adhanCfg();
  if (!cfg.on || api.smokeTest) return;
  const now = new Date();
  const t = prayerTimes(now, wg.city.lat, wg.city.lon, wg.city.tz);
  for (const [k, name] of ADHAN_PRAYERS) {
    const late = now - t[k];
    if (late < 0 || late > 3 * 60000) continue;
    const key = `adhan:${ymdOf(now, wg.city.tz)}:${k}`;
    if (adhanPlayed.has(key)) continue;
    adhanPlayed.add(key);
    api.claim(key).then(ok => { if (ok) playAdhan(name); });
  }
}
setInterval(adhanTick, 15000);
setTimeout(adhanTick, 3000);
// الأصوات بتتنزل مرة واحدة في الخلفية (نافذة واحدة بس هي اللي تبدأ التنزيل)
if (adhanCfg().on && !api.smokeTest) setTimeout(() => api.claim('adhan:prepare').then(ok => ok && api.adhanPrepare()), 20000);

async function adhanMenu() {
  const cfg = adhanCfg();
  const st = await api.adhanStatus();
  const mark = (on) => (on ? '✓ ' : '    ');
  const note = (id) => (st[id] === 'ready' ? '' : st[id] === 'loading' ? ' (بيتنزل...)' : ' (هيتنزل أول مرة)');
  const items = [
    { id: 'toggle', label: cfg.on ? '🔕 إيقاف صوت الأذان' : '🔔 تشغيل صوت الأذان مع كل صلاة' },
    { id: 'm:rotate', label: mark(cfg.mode === 'rotate') + 'بالتناوب: إسلام صبحي ← عبد الرحمن مسعود ← العفاسي' },
    ...RECITERS.map(([id, n]) => ({ id: 'm:' + id, label: mark(cfg.mode === id) + n + note(id) })),
    { id: 'm:custom', label: mark(cfg.mode === 'custom') + (st.custom === 'ready' ? 'الصوت اللي اخترته من جهازك' : 'اختار صوت أذان من جهازك...') },
    { id: 'vol', label: `🔊 علو الصوت: ${arNum(Math.round(cfg.vol * 100))}٪` },
    { id: 'test', label: '▶ جرّب الصوت دلوقتي' }
  ];
  const r = await api.uiMenu(items);
  if (r == null) return;
  if (r === 'toggle') { cfg.on = !cfg.on; cfg.chosen = true; toast(cfg.on ? 'هيشتغل الأذان مع كل صلاة 🕌' : 'اتوقف صوت الأذان'); if (cfg.on) api.adhanPrepare(); }
  else if (r === 'test') { wgSave(); return playAdhan('', true); }
  else if (r === 'vol') {
    const v = await askText('علو صوت الأذان (من ١٠ لـ ١٠٠)', String(Math.round(cfg.vol * 100)), { type: 'number' });
    const n = Number(String(v || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
    if (n >= 10 && n <= 100) cfg.vol = n / 100;
  } else if (r === 'm:custom' && st.custom !== 'ready') {
    if (!(await api.adhanPick())) return;
    cfg.mode = 'custom'; cfg.on = cfg.chosen = true;
  } else if (r.startsWith('m:')) {
    // اختيار شيخ = المستخدم اختار الأذان بالصوت
    cfg.mode = r.slice(2); cfg.on = cfg.chosen = true;
    if (cfg.mode !== 'custom') api.adhanPrepare();
  }
  wgSave(); renderWidgets();
}
// زرار الجرس في كارت مواقيت الصلاة
function adhanBtn() {
  const cfg = adhanCfg();
  return el('button', { class: 'wgCity', title: 'صوت الأذان', onclick: adhanMenu }, cfg.on ? '🔔 الأذان' : '🔕 الأذان');
}

/* ---------- تحية جنب اسم صاحب المتصفح ---------- */
(() => {
  const own = $('#ntOwner');
  if (!own) return;
  const hi = el('span', { class: 'ownHi', dir: 'rtl' });
  own.append(hi);
  const draw = () => { const h = new Date().getHours(); hi.textContent = (h >= 4 && h < 12 ? 'صباح الخير' : 'مساء الخير') + ' 👋'; };
  draw(); setInterval(draw, 60000);
})();

// الأدوات في نافذة تانية اتغيرت (مهمة اتضافت، عداد السبحة...): نحدّث هنا كمان
window.addEventListener('storage', (e) => {
  if (e.key !== WG_KEY || !e.newValue) return;
  try { Object.assign(wg, JSON.parse(e.newValue)); } catch { return; }
  clearTimeout(window.__wgSync); window.__wgSync = setTimeout(() => { try { renderWidgets(); } catch { /* ignore */ } }, 300);
});
// تغيير عرض النافذة: الأدوات تتنقل بين الأطراف وتحت الأعمدة
for (const q of ['(min-width: 1800px)', '(min-width: 1240px)']) matchMedia(q).addEventListener('change', () => { try { renderWidgets(); } catch { /* ignore */ } });
try { if ($('#ntNewsSide').children.length) renderWidgets(); } catch (e) { console.error(e); }
// ارتفاع الصفحة الرئيسية علشان الأعمدة الثابتة ماتطلعش بره الشاشة
(() => {
  const nt = $('#newtab');
  if (!nt) return;
  const set = () => { if (nt.clientHeight) nt.style.setProperty('--ntH', nt.clientHeight + 'px'); };
  new ResizeObserver(set).observe(nt); set();
})();
