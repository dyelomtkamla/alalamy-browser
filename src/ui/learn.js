'use strict';
/* اتعلم وانت بتتصفح: مسارات للإعلانات الممولة والبرمجة، والمتصفح بيدوّر على أحسن فيديو لكل درس
   ويشغله في لوحة جنب الصفحة، فتكمل شغلك وانت بتتفرج */

ICON_PATHS.learn = 'M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5v4.2c1.6 1.5 3.4 2.3 5.5 2.3s3.9-.8 5.5-2.3v-4.2M21.5 9.5v5';

const LEARN_TRACKS = [
  { id: 'tiktok', group: 'ads', name: 'إعلانات تيك توك', color: '#111111', letter: 'T', fresh: true, lessons: [
    ['يعني إيه TikTok Ads Manager وإزاي تعمل حساب', 'شرح انشاء حساب TikTok Ads Manager'],
    ['أول حملة إعلانية على تيك توك خطوة بخطوة', 'شرح عمل اعلان ممول على تيك توك خطوة بخطوة'],
    ['اختيار الهدف والميزانية', 'اهداف الحملة والميزانية اعلانات تيك توك'],
    ['استهداف الجمهور الصح', 'استهداف الجمهور في اعلانات تيك توك'],
    ['TikTok Pixel وتتبع المبيعات', 'شرح TikTok Pixel تيك توك بكسل'],
    ['Spark Ads وترويج فيديوهاتك', 'شرح Spark Ads تيك توك'],
    ['الحملات الذكية Smart+', 'شرح حملات Smart+ تيك توك'],
    ['تقرا الأرقام وتحسّن الإعلان', 'تحليل نتائج اعلانات تيك توك وتحسينها']
  ] },
  { id: 'snap', group: 'ads', name: 'إعلانات سناب شات', color: '#fffc00', ink: '#111', letter: 'S', fresh: true, lessons: [
    ['إنشاء حساب Snapchat Ads Manager', 'شرح انشاء حساب اعلانات سناب شات'],
    ['أول إعلان ممول على سناب خطوة بخطوة', 'شرح عمل اعلان ممول على سناب شات خطوة بخطوة'],
    ['أنواع إعلانات سناب', 'انواع اعلانات سناب شات'],
    ['استهداف الجمهور في سناب', 'استهداف الجمهور اعلانات سناب شات'],
    ['Snap Pixel وتتبع النتايج', 'شرح Snap Pixel سناب بكسل'],
    ['تحليل وتحسين حملات سناب', 'تحليل نتائج اعلانات سناب شات']
  ] },
  { id: 'meta', group: 'ads', name: 'إعلانات ميتا (فيسبوك وانستجرام)', color: '#0866ff', letter: 'M', fresh: true, lessons: [
    ['Meta Business Suite ومدير الأعمال', 'شرح Meta Business Suite مدير الاعمال'],
    ['مدير الإعلانات من الصفر', 'شرح مدير الاعلانات فيسبوك من الصفر'],
    ['أول حملة ممولة على فيسبوك وانستجرام', 'عمل اعلان ممول فيسبوك وانستجرام خطوة بخطوة'],
    ['الجمهور المخصص والمشابه', 'الجمهور المخصص والجمهور المشابه فيسبوك'],
    ['البكسل وConversions API', 'شرح فيسبوك بكسل Conversions API'],
    ['حملات Advantage+ الذكية', 'شرح حملات Advantage+ ميتا'],
    ['إعلانات رسايل واتساب وماسنجر', 'اعلانات رسائل واتساب ماسنجر ميتا'],
    ['تحسين الإعلان وتقليل التكلفة', 'تقليل تكلفة اعلانات فيسبوك وتحسين النتائج']
  ] },
  { id: 'smart', group: 'ads', name: 'الحملات الذكية', color: '#34a853', letter: 'G', fresh: true, lessons: [
    ['يعني إيه حملة ذكية', 'ما هي الحملات الذكية في الاعلانات'],
    ['حملات جوجل الذكية Smart Campaigns', 'شرح الحملات الذكية جوجل ادز'],
    ['Performance Max من جوجل', 'شرح Performance Max جوجل'],
    ['Advantage+ Shopping من ميتا', 'شرح Advantage+ Shopping'],
    ['Smart+ من تيك توك', 'شرح Smart+ تيك توك'],
    ['تقسيم الميزانية بين المنصات', 'توزيع ميزانية الاعلانات بين المنصات']
  ] },
  { id: 'creative', group: 'ads', name: 'صناعة محتوى الإعلان', color: '#ff3d6e', letter: 'C', lessons: [
    ['كتابة إعلان بيبيع', 'كتابة محتوى اعلاني كوبي رايتنج'],
    ['تصميم إعلان بكانفا', 'تصميم اعلان على كانفا للمبتدئين'],
    ['فيديو إعلاني بالموبايل', 'تصوير ومونتاج فيديو اعلاني بالموبايل CapCut'],
    ['أفكار إعلانات تيك توك وريلز', 'افكار فيديوهات اعلانية ريلز تيك توك']
  ] },
  { id: 'basics', group: 'code', name: 'البرمجة من الصفر', color: '#3b82f6', letter: '</>', lessons: [
    ['يعني إيه برمجة وتبدأ منين', 'ازاي تبدأ تتعلم البرمجة من الصفر'],
    ['التفكير المنطقي والخوارزميات', 'شرح الخوارزميات للمبتدئين'],
    ['المتغيرات والشروط', 'شرح المتغيرات والشروط في البرمجة للمبتدئين'],
    ['الحلقات التكرارية', 'شرح الحلقات التكرارية loops للمبتدئين'],
    ['الدوال Functions', 'شرح الدوال functions في البرمجة للمبتدئين']
  ] },
  { id: 'python', group: 'code', name: 'بايثون', color: '#f7c948', ink: '#1e3a5f', letter: 'Py', lessons: [
    ['أساسيات بايثون', 'كورس بايثون للمبتدئين بالعربي الدرس الاول'],
    ['المتغيرات والشروط في بايثون', 'المتغيرات والشروط بايثون بالعربي'],
    ['القوائم والقواميس', 'شرح list و dictionary بايثون بالعربي'],
    ['الدوال في بايثون', 'شرح الدوال بايثون بالعربي'],
    ['التعامل مع الملفات', 'التعامل مع الملفات بايثون بالعربي'],
    ['أول مشروع بايثون', 'مشروع بايثون للمبتدئين بالعربي']
  ] },
  { id: 'web', group: 'code', name: 'تصميم المواقع HTML وCSS', color: '#e34c26', letter: 'H', lessons: [
    ['أساسيات HTML', 'كورس HTML للمبتدئين بالعربي'],
    ['تنسيق الصفحة بـ CSS', 'كورس CSS للمبتدئين بالعربي'],
    ['Flexbox وGrid', 'شرح Flexbox و Grid بالعربي'],
    ['موقع متجاوب مع الموبايل', 'تصميم موقع متجاوب responsive بالعربي'],
    ['أول موقع كامل', 'تصميم موقع كامل HTML CSS مشروع بالعربي']
  ] },
  { id: 'js', group: 'code', name: 'جافاسكريبت', color: '#f0db4f', ink: '#323330', letter: 'JS', lessons: [
    ['أساسيات جافاسكريبت', 'كورس جافاسكريبت للمبتدئين بالعربي'],
    ['التعامل مع الصفحة DOM', 'شرح DOM جافاسكريبت بالعربي'],
    ['الأحداث Events', 'شرح events جافاسكريبت بالعربي'],
    ['Fetch وAPI', 'شرح fetch api جافاسكريبت بالعربي'],
    ['مشروع عملي بجافاسكريبت', 'مشروع جافاسكريبت للمبتدئين بالعربي']
  ] },
  { id: 'aspnet', group: 'code', name: 'C# وASP.NET', color: '#512bd4', letter: 'C#', lessons: [
    ['أساسيات C#', 'كورس سي شارب للمبتدئين بالعربي'],
    ['البرمجة الكائنية OOP', 'شرح OOP سي شارب بالعربي'],
    ['أول موقع ASP.NET Core', 'كورس ASP.NET Core MVC بالعربي'],
    ['قواعد البيانات Entity Framework', 'شرح Entity Framework Core بالعربي'],
    ['تحسين موقعك لمحركات البحث SEO', 'SEO ASP.NET Core تحسين محركات البحث']
  ] },
  { id: 'mobile', group: 'code', name: 'تطبيقات الموبايل', color: '#02569b', letter: 'F', lessons: [
    ['يعني إيه Flutter', 'كورس فلاتر للمبتدئين بالعربي'],
    ['لغة Dart', 'شرح لغة دارت بالعربي'],
    ['تصميم شاشات التطبيق', 'تصميم واجهات فلاتر بالعربي'],
    ['أول تطبيق كامل', 'مشروع تطبيق فلاتر كامل بالعربي']
  ] }
];
const LEARN_GROUPS = [['ads', 'الإعلانات الممولة', 'من الصفر لحد الاحتراف'], ['code', 'تعلّم البرمجة', 'أحسن الشروحات مترتبة ليك']];
// لما تكون فاتح موقع شغل، بنقترح الدرس اللي يفيدك فيه
const LEARN_HINTS = [
  [/(^|\.)ads\.tiktok\.com$|(^|\.)business\.tiktok\.com$/, 'tiktok', 'انت في مدير إعلانات تيك توك'],
  [/(^|\.)tiktok\.com$/, 'tiktok', 'انت على تيك توك'],
  [/(^|\.)(ads|business|forbusiness)\.snapchat\.com$/, 'snap', 'انت في إعلانات سناب شات'],
  [/(^|\.)snapchat\.com$/, 'snap', 'انت على سناب شات'],
  [/(^|\.)(adsmanager|business)\.facebook\.com$|(^|\.)facebook\.com\/adsmanager/, 'meta', 'انت في مدير إعلانات ميتا'],
  [/(^|\.)(facebook|instagram|threads)\.(com|net)$/, 'meta', 'انت على فيسبوك وانستجرام'],
  [/(^|\.)ads\.google\.com$/, 'smart', 'انت في جوجل أدز'],
  [/(^|\.)canva\.com$/, 'creative', 'انت على كانفا'],
  [/(^|\.)(w3schools\.com|developer\.mozilla\.org|codepen\.io)$/, 'web', 'انت بتتعلم تصميم مواقع'],
  [/(^|\.)(python\.org|pypi\.org|kaggle\.com)$/, 'python', 'انت على موقع بايثون'],
  [/(^|\.)(learn\.microsoft\.com|dotnet\.microsoft\.com|nuget\.org)$/, 'aspnet', 'انت على موقع مايكروسوفت للمطورين'],
  [/(^|\.)(flutter\.dev|dart\.dev|pub\.dev)$/, 'mobile', 'انت على موقع فلاتر'],
  [/(^|\.)(github\.com|stackoverflow\.com)$/, 'basics', 'انت على موقع مبرمجين']
];
const YT_REFERRER = 'https://alalamy-browser.a7medxml.workers.dev/';

const learn = { open: false, view: 'home', track: null, lesson: 0, query: '', videos: [], playing: null, hint: null, loading: false, seq: 0 };
const learnTrack = (id) => LEARN_TRACKS.find(t => t.id === id);

function learnStore() {
  try { return JSON.parse(localStorage.getItem('alalamy.learn')) || { done: {} }; } catch { return { done: {} }; }
}
function learnSave(s) { try { localStorage.setItem('alalamy.learn', JSON.stringify(s)); } catch {} }
function lessonDone(trackId, i) { return (learnStore().done[trackId] || []).includes(i); }
function markLesson(trackId, i, on = true) {
  const s = learnStore();
  const list = new Set(s.done[trackId] || []);
  on ? list.add(i) : list.delete(i);
  s.done[trackId] = [...list];
  learnSave(s);
}
function trackProgress(t) { return (learnStore().done[t.id] || []).filter(i => i < t.lessons.length).length; }

function learnBadge(t, size = 34) {
  return el('span', { class: 'lbadge', style: `background:${t.color};color:${t.ink || '#fff'};width:${size}px;height:${size}px` }, t.letter);
}

/* ---------- اللوحة نفسها ---------- */
function buildLearnUI() {
  const panel = el('div', { id: 'learnpanel', class: 'hidden' });
  panel.innerHTML = `
    <header><button id="lpBack" class="icon small2 hidden" title="رجوع"></button><span id="lpTitle">اتعلّم وانت بتتصفح</span>
      <button id="lpTab" class="icon small2 hidden" title="افتح الفيديو في تبويب"></button>
      <button id="lpClose" class="icon small2" title="إغلاق (Ctrl+Shift+L)"></button></header>
    <div id="lpPlayer" class="hidden"><div class="lp-frame"></div>
      <div class="lp-pbar"><span id="lpNow"></span><button id="lpFix" title="لو الفيديو مش شغال هنا">مش شغال؟</button><button id="lpStop" title="قفل الفيديو">إيقاف</button></div></div>
    <div id="lpBody"></div>`;
  const side = $('#sidepanel');
  side.after(panel);
  $('#lpBack').innerHTML = icon('forward');
  $('#lpTab').innerHTML = icon('external');
  $('#lpClose').innerHTML = icon('close');
  $('#lpClose').addEventListener('click', () => toggleLearn(false));
  $('#lpBack').addEventListener('click', learnBack);
  $('#lpTab').addEventListener('click', () => { if (learn.playing) createTab({ url: `https://www.youtube.com/watch?v=${learn.playing.id}` }); });
  $('#lpStop').addEventListener('click', stopLearnVideo);
  $('#lpFix').addEventListener('click', () => {
    // بعض القنوات قافلة التشغيل خارج يوتيوب، فنفتح صفحة الفيديو نفسها في نفس اللوحة
    const wv = $('#lpPlayer webview');
    if (wv && learn.playing) wv.loadURL(`https://www.youtube.com/watch?v=${learn.playing.id}`);
  });

  // زرار في شريط الأدوات
  const btn = el('button', { id: 'learnBtn', class: 'icon', title: 'اتعلّم وانت بتتصفح (Ctrl+Shift+L)' });
  btn.innerHTML = icon('learn');
  btn.addEventListener('click', () => toggleLearn());
  $('#videoBtn').before(btn);
}

function toggleLearn(on = !learn.open) {
  learn.open = on;
  $('#learnpanel').classList.toggle('hidden', !on);
  $('#learnBtn').classList.toggle('on', on);
  if (on && typeof side !== 'undefined' && side.open) toggleSide(side.open); // لوحة واحدة في نفس الوقت
  if (on) { learnHintCheck(true); renderLearn(); }
  renderSidestrip();
}

function setLearnHeader(title, back) {
  $('#lpTitle').textContent = title;
  $('#lpBack').classList.toggle('hidden', !back);
}

function renderLearn() {
  const body = $('#lpBody');
  body.innerHTML = '';
  if (learn.view === 'track') return renderLearnTrack(body);
  if (learn.view === 'videos') return renderLearnVideos(body);
  setLearnHeader('اتعلّم وانت بتتصفح', false);

  const input = el('input', { id: 'lpSearch', placeholder: 'عايز تتعلم إيه؟ مثلاً: إعلانات انستجرام', value: learn.query, dir: 'auto' });
  const form = el('form', { class: 'lp-search', onsubmit: (e) => { e.preventDefault(); const q = input.value.trim(); if (q) learnSearch(q); } });
  form.innerHTML = icon('search');
  form.append(input, el('button', { class: 'primary', type: 'submit' }, 'دوّر'));
  body.append(el('p', { class: 'lp-intro' }, 'اختار مسار والمتصفح هيدوّر لك على أحسن فيديو لكل درس ويشغله هنا جنب الصفحة، فتتعلم وانت شغال.'), form);

  if (learn.hint) {
    const t = learnTrack(learn.hint.track);
    const next = learnNextLesson(t);
    body.append(el('button', { class: 'lp-hint', onclick: () => openLesson(t.id, next) },
      learnBadge(t, 30),
      el('div', {}, el('b', {}, learn.hint.label), el('span', {}, `اتفرج على: ${t.lessons[next][0]}`))));
  }
  const s = learnStore();
  if (s.last && learnTrack(s.last.track)) {
    const t = learnTrack(s.last.track);
    const i = Math.min(s.last.lesson, t.lessons.length - 1);
    body.append(el('button', { class: 'lp-continue', onclick: () => openLesson(t.id, i) },
      el('span', {}, '▶'), el('div', {}, el('b', {}, 'كمّل من مكان ما وقفت'), el('span', {}, `${t.name}: ${t.lessons[i][0]}`))));
  }
  for (const [g, title, sub] of LEARN_GROUPS) {
    body.append(el('h3', { class: 'lp-group' }, title, el('small', {}, sub)));
    const grid = el('div', { class: 'lp-tracks' });
    for (const t of LEARN_TRACKS.filter(x => x.group === g)) {
      const done = trackProgress(t);
      grid.append(el('button', { class: 'lp-track', onclick: () => { learn.view = 'track'; learn.track = t.id; renderLearn(); } },
        learnBadge(t),
        el('div', { class: 'lp-tinfo' }, el('b', {}, t.name), el('span', {}, done ? `${done} من ${t.lessons.length} دروس` : `${t.lessons.length} دروس`),
          el('i', { class: 'lp-prog' }, el('i', { style: `width:${Math.round(done / t.lessons.length * 100)}%` })))));
    }
    body.append(grid);
  }
}

function learnNextLesson(t) {
  const i = t.lessons.findIndex((_, n) => !lessonDone(t.id, n));
  return i < 0 ? 0 : i;
}

function renderLearnTrack(body) {
  const t = learnTrack(learn.track);
  setLearnHeader(t.name, true);
  const done = trackProgress(t);
  body.append(el('div', { class: 'lp-thead' }, learnBadge(t, 44),
    el('div', {}, el('b', {}, t.name), el('span', {}, done === t.lessons.length ? 'خلّصت المسار ده 🎉' : `خلّصت ${done} من ${t.lessons.length}`))));
  const list = el('ol', { class: 'lp-lessons' });
  t.lessons.forEach(([title], i) => {
    const ok = lessonDone(t.id, i);
    list.append(el('li', { class: ok ? 'done' : '', onclick: () => openLesson(t.id, i) },
      el('span', { class: 'lp-num' }, ok ? '✓' : String(i + 1)), el('span', {}, title)));
  });
  body.append(list);
}

function renderLearnVideos(body) {
  const t = learn.track && learnTrack(learn.track);
  setLearnHeader(t ? t.name : 'نتايج البحث', true);
  if (t) {
    const [title] = t.lessons[learn.lesson];
    const ok = lessonDone(t.id, learn.lesson);
    body.append(el('div', { class: 'lp-lesson' },
      el('small', {}, `الدرس ${learn.lesson + 1} من ${t.lessons.length}`), el('b', {}, title),
      el('div', { class: 'lp-actions' },
        el('button', { class: ok ? 'pill on' : 'pill', onclick: () => { markLesson(t.id, learn.lesson, !ok); renderLearn(); } }, ok ? '✓ خلّصته' : 'خلّصت الدرس ده'),
        learn.lesson < t.lessons.length - 1
          ? el('button', { class: 'primary', onclick: () => { markLesson(t.id, learn.lesson); openLesson(t.id, learn.lesson + 1); } }, 'الدرس اللي بعده ←')
          : null)));
  } else {
    body.append(el('div', { class: 'lp-lesson' }, el('small', {}, 'أحسن فيديوهات عن'), el('b', {}, learn.query)));
  }
  if (learn.loading) { body.append(el('div', { class: 'lp-msg' }, el('i', { class: 'lp-spin' }), 'بدوّر لك على أحسن الفيديوهات...')); return; }
  if (learn.error) {
    body.append(el('div', { class: 'lp-msg' }, learn.error, el('button', { class: 'pill', onclick: () => learnRunSearch() }, 'جرّب تاني')));
    return;
  }
  if (!learn.videos.length) { body.append(el('div', { class: 'lp-msg' }, 'مالقيتش فيديوهات، جرّب كلمات تانية')); return; }
  const list = el('div', { class: 'lp-videos' });
  learn.videos.forEach((v, i) => {
    const meta = [v.channel, v.viewsText].filter(Boolean).join(' · ');
    const thumb = el('span', { class: 'lp-thumb' }, el('img', { src: v.thumb, alt: '', loading: 'lazy' }));
    if (v.length) thumb.append(el('em', {}, v.length));
    list.append(el('button', { class: 'lp-video' + (learn.playing && learn.playing.id === v.id ? ' on' : ''), onclick: () => playLearnVideo(v) },
      thumb,
      el('span', { class: 'lp-vinfo' }, i === 0 ? el('span', { class: 'lp-star' }, '★ الأفضل') : null, el('b', {}, v.title), el('span', {}, meta))));
  });
  body.append(list);
}

function learnBack() {
  if (learn.view === 'videos' && learn.track) learn.view = 'track';
  else { learn.view = 'home'; learn.track = null; }
  renderLearn();
}

function openLesson(trackId, i) {
  const t = learnTrack(trackId);
  learn.track = trackId; learn.lesson = i; learn.view = 'videos';
  learn.query = t.lessons[i][1];
  const s = learnStore(); s.last = { track: trackId, lesson: i }; learnSave(s);
  learnRunSearch(true);
}
function learnSearch(q) {
  learn.track = null; learn.view = 'videos'; learn.query = q;
  learnRunSearch(true);
}
async function learnRunSearch(autoplay = false) {
  const seq = ++learn.seq;
  const t = learn.track && learnTrack(learn.track);
  learn.loading = true; learn.error = ''; learn.videos = [];
  renderLearn();
  let r;
  try { r = await api.learnSearch(learn.query, { fresh: !!(t && t.fresh) }); } catch { r = { error: 'حصلت مشكلة، جرّب تاني' }; }
  if (seq !== learn.seq) return; // المستخدم اختار درس تاني
  learn.loading = false;
  learn.videos = (r && r.videos) || [];
  learn.error = (r && r.error) || '';
  if (autoplay && learn.videos.length) playLearnVideo(learn.videos[0]);
  renderLearn();
  $('#lpBody').scrollTop = 0;
}

function playLearnVideo(v) {
  learn.playing = v;
  const frame = $('#lpPlayer .lp-frame');
  let wv = frame.querySelector('webview');
  const url = `https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&hl=ar&enablejsapi=0`;
  if (!wv) {
    wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:default');
    // يوتيوب بيرفض يشغل الفيديو المضمن من غير مصدر (خطأ 153)
    wv.setAttribute('httpreferrer', YT_REFERRER);
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('webpreferences', 'contextIsolation=yes');
    wv.src = url;
    frame.append(wv);
  } else {
    wv.loadURL(url, { httpReferrer: YT_REFERRER });
  }
  $('#lpNow').textContent = v.title;
  $('#lpPlayer').classList.remove('hidden');
  $('#lpTab').classList.remove('hidden');
  for (const b of document.querySelectorAll('.lp-video')) b.classList.remove('on');
  renderLearn();
}
function stopLearnVideo() {
  const wv = $('#lpPlayer webview');
  if (wv) wv.remove();
  learn.playing = null;
  $('#lpPlayer').classList.add('hidden');
  $('#lpTab').classList.add('hidden');
  renderLearn();
}

/* ---------- اقتراح حسب الموقع اللي انت فاتحه ---------- */
function learnHintFor(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '');
  for (const [re, track, label] of LEARN_HINTS) {
    if (re.test(host) || re.test(host + u.pathname)) return { track, label, host };
  }
  return null;
}
let learnLastUrl = '';
function learnHintCheck(force) {
  const t = state.active;
  const url = (t && !t.temp && t.url) || '';
  if (!force && url === learnLastUrl) return;
  learnLastUrl = url;
  const h = learnHintFor(url);
  const changed = (h && h.track) !== (learn.hint && learn.hint.track);
  learn.hint = h;
  const b = $('#learnBtn');
  if (b) {
    b.classList.toggle('hint', !!h && !learn.open);
    b.title = h ? `${h.label}، فيه دروس تفيدك هنا (Ctrl+Shift+L)` : 'اتعلّم وانت بتتصفح (Ctrl+Shift+L)';
  }
  if (changed && learn.open && learn.view === 'home') renderLearn();
}

function bindLearn() {
  buildLearnUI();
  applyIcons(document.querySelector('[data-menu="alalamy"]'));
  commands['learn'] = () => toggleLearn();
  // زرار في الشريط الجانبي فوق المراسلة
  const _renderStrip = renderSidestrip;
  renderSidestrip = () => {
    _renderStrip();
    const strip = $('#sidestrip');
    const b = el('button', { title: 'اتعلّم وانت بتتصفح', class: 'learn-strip' + (learn.open ? ' on' : '') });
    b.innerHTML = icon('learn');
    b.addEventListener('click', () => toggleLearn());
    strip.prepend(b, el('hr'));
  };
  const _toggleSide = toggleSide;
  toggleSide = (key) => {
    if (learn.open && key && side.open !== key) { learn.open = false; $('#learnpanel').classList.add('hidden'); $('#learnBtn').classList.remove('on'); }
    _toggleSide(key);
  };
  renderSidestrip();
  setInterval(() => learnHintCheck(false), 1500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindLearn); else bindLearn();

/* اختبار آلي */
window.__learnTest = async () => {
  const r = {};
  r.tracks = LEARN_TRACKS.length >= 8 && LEARN_TRACKS.every(t => t.lessons.length >= 4);
  r.hintTikTok = (learnHintFor('https://ads.tiktok.com/i18n/dashboard') || {}).track === 'tiktok';
  r.hintMeta = (learnHintFor('https://adsmanager.facebook.com/adsmanager/manage') || {}).track === 'meta';
  r.hintNone = learnHintFor('https://example.com/') === null;
  toggleLearn(true);
  r.panelOpen = !$('#learnpanel').classList.contains('hidden') && document.querySelectorAll('.lp-track').length === LEARN_TRACKS.length;
  toggleLearn(false);
  return r;
};
