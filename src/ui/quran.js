'use strict';
/* مشغّل القرآن MP3: كل القرّاء وكل المصاحف من mp3quran.net. التلاوة بتفضل شغالة لو قفلت اللوحة (شريط صغير تحت)،
   وأزرار الميديا في الكيبورد شغالة، وبيفتكر آخر قارئ وسورة ومكان وقفت فيه. */
const SURAHS = ['الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس', 'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر', 'المسد', 'الإخلاص', 'الفلق', 'الناس'];
const quran = { list: [], loaded: false, reciter: null, moshaf: 0, surah: 0, repeat: 'all', tab: 'reciters', q: '', favs: [] };
try { Object.assign(quran, JSON.parse(localStorage.getItem('quran') || '{}'), { list: [], loaded: false }); } catch { /* ignore */ }
const qAudio = el('audio', { id: 'quranAudio', preload: 'none' });
document.body.append(qAudio);
const qSave = () => { try { localStorage.setItem('quran', JSON.stringify({ reciter: quran.reciter, moshaf: quran.moshaf, surah: quran.surah, repeat: quran.repeat, favs: quran.favs, pos: Math.floor(qAudio.currentTime || 0), rate: qAudio.playbackRate })); } catch { /* ignore */ } };
const qPad = (n) => String(n).padStart(3, '0');
const qFmt = (s) => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const curReciter = () => quran.list.find(r => r.id === (quran.reciter && quran.reciter.id)) || quran.reciter;
const curMoshaf = () => { const r = curReciter(); return r && r.moshaf[Math.min(quran.moshaf || 0, r.moshaf.length - 1)]; };
const surahsOf = (m) => (m && m.list && m.list.length ? m.list : SURAHS.map((_, i) => i + 1));

async function loadReciters(force) {
  try {
    const r = await api.quranReciters(!!force);
    quran.list = (r && r.list) || [];
    quran.offline = !!(r && (r.offline || r.fallback));
  } catch { quran.list = []; quran.offline = true; }
  quran.loaded = true;
}

function playSurah(n, keepPos) {
  const m = curMoshaf(); if (!m) return;
  quran.surah = n;
  const src = m.server + qPad(n) + '.mp3';
  if (qAudio.src !== src) { qAudio.src = src; if (!keepPos) qAudio.currentTime = 0; }
  qAudio.play().catch(() => toast('مش قادر يشغّل التلاوة دلوقتي، اتأكد من النت'));
  qSave(); updateQuranUI();
}
function nextSurah(dir = 1) {
  const list = surahsOf(curMoshaf());
  if (!list.length) return;
  let i = list.indexOf(quran.surah) + dir;
  if (i >= list.length) { if (quran.repeat !== 'all') return; i = 0; }
  if (i < 0) i = list.length - 1;
  playSurah(list[i]);
}
qAudio.addEventListener('ended', () => { if (quran.repeat === 'one') { qAudio.currentTime = 0; qAudio.play().catch(() => {}); } else nextSurah(1); });
for (const ev of ['play', 'pause', 'loadedmetadata']) qAudio.addEventListener(ev, () => updateQuranUI());
qAudio.addEventListener('waiting', () => document.body.classList.add('quran-wait'));
qAudio.addEventListener('playing', () => document.body.classList.remove('quran-wait'));
qAudio.addEventListener('error', () => { if (qAudio.src) toast('التلاوة دي مش متاحة، جرّب سورة أو قارئ تاني'); });
let qLastSave = 0;
qAudio.addEventListener('timeupdate', () => {
  const seek = document.querySelector('.qseek'); if (seek && !seek.matches(':active')) seek.value = qAudio.duration ? qAudio.currentTime / qAudio.duration * 1000 : 0;
  for (const t of document.querySelectorAll('.qtime')) t.textContent = qFmt(qAudio.currentTime) + ' / ' + qFmt(qAudio.duration);
  if (Date.now() - qLastSave > 5000) { qLastSave = Date.now(); qSave(); }
});
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => qAudio.play());
  navigator.mediaSession.setActionHandler('pause', () => qAudio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => nextSurah(1));
  navigator.mediaSession.setActionHandler('previoustrack', () => nextSurah(-1));
}

function qControls() {
  const play = el('button', { class: 'qbig', title: 'تشغيل / إيقاف', onclick: () => { if (!quran.surah) return playSurah(surahsOf(curMoshaf())[0]); qAudio.src && !qAudio.paused ? qAudio.pause() : playSurah(quran.surah, true); } }, qAudio.src && !qAudio.paused ? '⏸' : '▶');
  return el('div', { class: 'qctl' },
    el('button', { title: 'السورة اللي قبلها', onclick: () => nextSurah(-1) }, '⏭'),
    el('button', { title: 'رجوع 10 ثواني', onclick: () => { qAudio.currentTime = Math.max(0, qAudio.currentTime - 10); } }, '↻10'),
    play,
    el('button', { title: 'تقديم 10 ثواني', onclick: () => { qAudio.currentTime = Math.min(qAudio.duration || 0, qAudio.currentTime + 10); } }, '10↺'),
    el('button', { title: 'السورة اللي بعدها', onclick: () => nextSurah(1) }, '⏮'));
}

function updateQuranUI() {
  const r = curReciter(), m = curMoshaf();
  const title = quran.surah ? 'سورة ' + SURAHS[quran.surah - 1] : 'اختار سورة';
  if ('mediaSession' in navigator && quran.surah) navigator.mediaSession.metadata = new MediaMetadata({ title, artist: r ? r.name : '', album: m ? m.name : 'القرآن الكريم' });
  // الشريط الصغير تحت (لما اللوحة مقفولة والتلاوة شغالة)
  let bar = $('#quranBar');
  const showBar = !!qAudio.src && state.panel !== 'quran' && !(qAudio.paused && qAudio.currentTime === 0);
  if (!bar && showBar) {
    bar = el('div', { id: 'quranBar' });
    document.body.append(bar);
  }
  if (bar) {
    bar.classList.toggle('hidden', !showBar);
    bar.innerHTML = '';
    bar.append(el('span', { class: 'qbic' }, '📖'),
      el('div', { class: 'qbt', title: 'افتح مشغّل القرآن', onclick: () => run('quran') }, el('b', {}, title), el('small', {}, r ? r.name : '')),
      el('button', { title: 'السابقة', onclick: () => nextSurah(-1) }, '⏭'),
      el('button', { class: 'qbplay', title: 'تشغيل / إيقاف', onclick: () => qAudio.paused ? qAudio.play() : qAudio.pause() }, qAudio.paused ? '▶' : '⏸'),
      el('button', { title: 'التالية', onclick: () => nextSurah(1) }, '⏮'),
      el('span', { class: 'qtime' }, qFmt(qAudio.currentTime) + ' / ' + qFmt(qAudio.duration)),
      el('button', { class: 'qbx', title: 'قفل المشغّل', onclick: () => { qAudio.pause(); qAudio.removeAttribute('src'); qAudio.load(); updateQuranUI(); } }, '✕'));
  }
  if (state.panel === 'quran' && panels.quran.redraw) panels.quran.redraw(true);
}

panels.quran = async function (body) {
  const wrap = el('div', { class: 'qbody' });
  body.append(wrap);
  const now = el('div', { class: 'qnow' });
  const tabs = el('div', { class: 'qtabs' });
  const search = el('input', { class: 'search', type: 'search', placeholder: 'ابحث عن قارئ...', value: quran.q || '' });
  const list = el('div', { class: 'qlist' });
  wrap.append(now, tabs, search, list);
  const drawNow = () => {
    const r = curReciter(), m = curMoshaf();
    now.innerHTML = '';
    const seek = el('input', { type: 'range', dir: 'ltr', class: 'qseek', min: '0', max: '1000', value: qAudio.duration ? String(qAudio.currentTime / qAudio.duration * 1000) : '0' });
    seek.addEventListener('input', () => { if (qAudio.duration) qAudio.currentTime = seek.value / 1000 * qAudio.duration; });
    const moshafSel = r && r.moshaf.length > 1 ? el('select', { class: 'qmoshaf', title: 'الرواية / المصحف' }, ...r.moshaf.map((x, i) => el('option', { value: String(i), ...(i === (quran.moshaf || 0) ? { selected: '' } : {}) }, x.name))) : null;
    if (moshafSel) moshafSel.addEventListener('change', () => { quran.moshaf = Number(moshafSel.value); qSave(); if (quran.surah && surahsOf(curMoshaf()).includes(quran.surah)) playSurah(quran.surah); draw(); });
    const rep = el('button', { class: 'qrep', title: 'التكرار', onclick: () => { quran.repeat = quran.repeat === 'all' ? 'one' : quran.repeat === 'one' ? 'off' : 'all'; qSave(); drawNow(); } },
      quran.repeat === 'one' ? '🔂 تكرار السورة' : quran.repeat === 'all' ? '🔁 كمّل السور' : '⏹ وقف بعد السورة');
    const rate = el('select', { class: 'qrate', title: 'سرعة التلاوة' }, ...[0.75, 1, 1.25, 1.5].map(v => el('option', { value: String(v), ...(Math.abs((qAudio.playbackRate || 1) - v) < 0.01 ? { selected: '' } : {}) }, v + 'x')));
    rate.addEventListener('change', () => { qAudio.playbackRate = Number(rate.value); qSave(); });
    now.append(
      el('div', { class: 'qtitle' }, el('b', {}, quran.surah ? 'سورة ' + SURAHS[quran.surah - 1] : (r ? 'اختار سورة من «السور»' : 'اختار القارئ')), el('span', {}, r ? r.name : 'كل قرّاء mp3quran.net')),
      moshafSel || (m ? el('div', { class: 'qmname' }, m.name) : null),
      seek, el('div', { class: 'qtime' }, qFmt(qAudio.currentTime) + ' / ' + qFmt(qAudio.duration)),
      qControls(), el('div', { class: 'qopts' }, rep, rate,
        quran.surah && m ? el('button', { class: 'qdl', title: 'تحميل السورة MP3', onclick: async () => { const ok = await api.quranDownload(m.server + qPad(quran.surah) + '.mp3', `سورة ${SURAHS[quran.surah - 1]} - ${(curReciter() || {}).name || ''}`); toast(ok ? 'بيتحمّل في التنزيلات ⬇' : 'تعذر التحميل'); } }, '⬇ تحميل') : null));
  };
  const drawTabs = () => {
    tabs.innerHTML = '';
    for (const [k, l] of [['reciters', `القرّاء (${quran.list.length || '...'})`], ['surahs', 'السور'], ['favs', '⭐ المفضلين']]) {
      tabs.append(el('button', { class: quran.tab === k ? 'on' : '', onclick: () => { quran.tab = k; search.value = ''; quran.q = ''; drawTabs(); draw(); } }, l));
    }
    search.placeholder = quran.tab === 'surahs' ? 'ابحث عن سورة...' : 'ابحث عن قارئ...';
  };
  const norm = (x) => String(x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').toLowerCase();
  const draw = () => {
    list.innerHTML = '';
    const q = norm(search.value.trim());
    if (!quran.loaded) { list.append(el('div', { class: 'qmsg' }, el('span', { class: 'spinner' }), ' بيجيب قايمة القرّاء...')); return; }
    if (quran.tab === 'surahs') {
      const m = curMoshaf();
      if (!m) { list.append(el('div', { class: 'qmsg' }, 'اختار القارئ الأول من «القرّاء»')); return; }
      for (const n of surahsOf(m)) {
        if (q && !norm(SURAHS[n - 1]).includes(q) && String(n) !== q) continue;
        list.append(el('button', { class: 'qrow' + (n === quran.surah ? ' cur' : ''), onclick: () => playSurah(n) },
          el('span', { class: 'qnum' }, String(n)), el('span', { class: 'qname' }, SURAHS[n - 1]), n === quran.surah && !qAudio.paused ? el('span', { class: 'qeq' }, '♫') : null));
      }
      return;
    }
    let rs = quran.list;
    if (quran.tab === 'favs') rs = rs.filter(r => quran.favs.includes(r.id));
    if (q) rs = rs.filter(r => norm(r.name).includes(q));
    if (!rs.length) list.append(el('div', { class: 'qmsg' }, quran.tab === 'favs' ? 'دوس ☆ جنب أي قارئ علشان يتحط هنا' : 'مفيش قارئ بالاسم ده'));
    for (const r of rs.slice(0, 400)) {
      const fav = quran.favs.includes(r.id);
      const star = el('span', { class: 'qstar' + (fav ? ' on' : ''), title: fav ? 'شيله من المفضلين' : 'ضيفه للمفضلين' }, fav ? '★' : '☆');
      star.addEventListener('click', (e) => { e.stopPropagation(); quran.favs = fav ? quran.favs.filter(x => x !== r.id) : [...quran.favs, r.id]; qSave(); draw(); });
      const cur = quran.reciter && quran.reciter.id === r.id;
      list.append(el('button', { class: 'qrow' + (cur ? ' cur' : ''), onclick: () => {
        const was = quran.reciter && quran.reciter.id;
        quran.reciter = { id: r.id, name: r.name, moshaf: r.moshaf };
        if (was !== r.id) quran.moshaf = 0;
        qSave();
        // نكمّل نفس السورة بصوت القارئ الجديد لو عنده، غير كده نروح للسور
        if (quran.surah && surahsOf(curMoshaf()).includes(quran.surah) && was !== r.id && qAudio.src) playSurah(quran.surah);
        quran.tab = 'surahs'; search.value = ''; drawTabs(); drawNow(); draw();
      } }, el('span', { class: 'qav' }, r.name.replace(/^(ال)/, '').charAt(0)), el('span', { class: 'qname' }, r.name),
        el('small', {}, r.moshaf.length > 1 ? `${r.moshaf.length} روايات` : (r.moshaf[0].list.length && r.moshaf[0].list.length < 114 ? `${r.moshaf[0].list.length} سورة` : '')), star));
    }
    if (quran.offline) list.append(el('div', { class: 'qmsg' }, 'النت فاصل أو الموقع مش راد، دي آخر قايمة اتحفظت. ', el('button', { class: 'pill', onclick: async () => { quran.loaded = false; draw(); await loadReciters(true); drawTabs(); draw(); } }, 'حاول تاني')));
  };
  search.addEventListener('input', () => { quran.q = search.value; draw(); });
  panels.quran.redraw = (soft) => { drawNow(); if (!soft || quran.tab === 'surahs') draw(); };
  drawNow(); drawTabs(); draw();
  if (!quran.loaded) { await loadReciters(false); drawTabs(); drawNow(); draw(); }
};
panelTitles.quran = 'القرآن الكريم';

Object.assign(commands, { quran: () => { if (state.panel === 'quran') closePanel(); else openPanel('quran'); updateQuranUI(); } });
// اللوحة اتقفلت: يظهر الشريط الصغير لو التلاوة شغالة
const _closePanelQ = closePanel;
// eslint-disable-next-line no-global-assign
closePanel = function () { _closePanelQ(); updateQuranUI(); };
// نرجّع آخر مكان (من غير تشغيل لوحده)
if (quran.reciter && quran.surah) {
  const m = curMoshaf();
  if (m) { qAudio.src = m.server + qPad(quran.surah) + '.mp3'; qAudio.preload = 'metadata'; qAudio.addEventListener('loadedmetadata', function once() { qAudio.removeEventListener('loadedmetadata', once); const p = Number(JSON.parse(localStorage.getItem('quran') || '{}').pos) || 0; if (p && p < qAudio.duration) qAudio.currentTime = p; }); }
  try { const rt = Number(JSON.parse(localStorage.getItem('quran') || '{}').rate); if (rt) qAudio.playbackRate = rt; } catch { /* ignore */ }
}
