'use strict';
/* تحميل الفيديوهات والصوت MP3 من يوتيوب وتيك توك وانستجرام وفيس بوك وغيرها */

const VIDEO_SITES = /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com\/(watch|shorts|live)|youtu\.be\/|tiktok\.com\/|instagram\.com\/|facebook\.com\/|fb\.watch|(twitter|x)\.com\/.+\/status\/|vimeo\.com\/\d|dailymotion\.com\/video|twitch\.tv\/|snapchat\.com\/(spotlight|t)\/|pinterest\.[a-z.]+\/pin\/|reddit\.com\/r\/.+\/comments\/|soundcloud\.com\/)/i;

function updateVideoBtn() {
  const t = state.active;
  $('#videoBtn').classList.toggle('hot', !!(t && VIDEO_SITES.test(t.url || '')));
}

function fmtDuration(s) {
  if (!s) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}
function qualityName(h) {
  return h >= 4320 ? '8K' : h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? 'Full HD' : h >= 720 ? 'HD' : '';
}

let videoReq = 0;
async function openVideoMenu({ url, candidates, partition, anchor, mp3 } = {}) {
  const tab = state.active;
  const m = $('#videoMenu');
  hidePopups(); if (typeof hideTranslateMenu === 'function') hideTranslateMenu();
  m.innerHTML = '';
  // من زرار 🎬: نسأل الصفحة عن الفيديو اللي ظاهر (في الفيد رابط الصفحة مش رابط الفيديو)
  if (!url && tab && tab.wcId && /^https?:/i.test(tab.url || '')) {
    try { candidates = await api.resolveVideo({ wcId: tab.wcId }); } catch { candidates = null; }
    url = candidates && candidates[0];
  }
  url = url || (tab && tab.url);
  candidates = (candidates && candidates.length) ? candidates : [url];
  partition = partition || (tab && tab.partition);
  if (!url || !/^https?:/i.test(url)) {
    m.append(el('div', { class: 'vmsg' }, 'افتح صفحة فيها فيديو (يوتيوب، تيك توك، انستجرام، فيس بوك...) وبعدين اضغط الزرار ده.'));
    return showVideoMenu(anchor);
  }
  const req = ++videoReq;
  m.append(el('div', { class: 'vmsg' }, el('span', { class: 'spinner' }), ' بيقرا الفيديو والجودات المتاحة...'));
  showVideoMenu(anchor);
  // نجرب الروابط واحد ورا التاني لحد ما واحد يطلع فيه فيديو
  let info = null, firstErr = null;
  for (const c of candidates) {
    info = await api.probeVideo({ url: c, partition });
    if (req !== videoReq || m.classList.contains('hidden')) return;
    if (info && !info.error) { url = c; break; }
    if (!firstErr || /Unsupported URL/i.test(firstErr.error || '')) firstErr = info;
  }
  if (!info || info.error) info = firstErr || info;
  m.innerHTML = '';
  if (!info || info.error) {
    const unsupported = /Unsupported URL/i.test((info && info.error) || '');
    m.append(el('div', { class: 'vmsg' }, el('b', {}, unsupported ? 'مش لاقي فيديو في الصفحة دي.' : 'الفيديو ده مش راضي يتحمل.'),
      el('div', { class: 'vsub' }, unsupported
        ? 'شغّل الفيديو أو حط الماوس عليه، وهيظهر فوقه زرار «⬇ تحميل» اضغط عليه. أو كليك يمين على الفيديو واختار «تحميل الفيديو ده».'
        : 'لو الفيديو خاص، اتأكد إنك مسجل دخول في التبويب ده. ولو الموقع اتغير، حدّث أداة التحميل من الإعدادات ← عمليات التنزيل.'),
      info && info.error ? el('div', { class: 'verr', dir: 'ltr' }, info.error) : null));
    return showVideoMenu(anchor);
  }
  const head = el('div', { class: 'vhead' },
    info.thumbnail ? el('img', { src: info.thumbnail, alt: '', referrerpolicy: 'no-referrer' }) : null,
    el('div', { class: 'vinfo' }, el('div', { class: 'vtitle' }, info.title),
      el('div', { class: 'vsub' }, [info.site, info.uploader, fmtDuration(info.duration)].filter(Boolean).join(' · '))));
  m.append(head);
  const start = async (choice) => {
    hideVideoMenu();
    await api.downloadVideo({ url, partition, choice, title: info.title, useCookies: info.useCookies });
    toast(choice.kind === 'mp3' ? '🎵 بدأ تحميل الصوت MP3، تابعه من زرار التنزيلات ⬇' : '🎬 بدأ تحميل الفيديو، تابعه من زرار التنزيلات ⬇');
  };
  if (mp3 && info.hasAudio) return start({ kind: 'mp3' }); // زرار 🎵 MP3 اللي فوق الفيديو
  m.append(el('div', { class: 'vsect' }, '🎬 فيديو MP4'));
  if (info.qualities.length) {
    info.qualities.forEach((q, i) => {
      const tag = qualityName(q.height);
      m.append(el('button', { class: 'vopt', onclick: () => start({ kind: 'video', height: q.height }) },
        el('span', { class: 'vq' }, q.height + 'p' + (q.fps > 30 ? q.fps : '')),
        tag ? el('span', { class: 'vtag' + (q.height >= 1080 ? ' hi' : '') }, tag) : null,
        i === 0 ? el('span', { class: 'vbest' }, 'أعلى جودة') : null,
        el('span', { class: 'vsize' }, q.size ? '~' + fmtBytes(q.size) : '')));
    });
  } else {
    m.append(el('button', { class: 'vopt', onclick: () => start({ kind: 'video', height: 0 }) },
      el('span', { class: 'vq' }, 'تحميل الفيديو'), el('span', { class: 'vbest' }, 'أعلى جودة')));
  }
  if (info.hasAudio) {
    m.append(el('div', { class: 'vsect' }, '🎵 صوت'));
    m.append(el('button', { class: 'vopt', onclick: () => start({ kind: 'mp3' }) },
      el('span', { class: 'vq' }, 'MP3'), el('span', { class: 'vbest' }, 'أعلى جودة'),
      el('span', { class: 'vsize' }, info.audioSize ? '~' + fmtBytes(info.audioSize) : '')));
  }
  m.append(el('div', { class: 'vnote' }, 'حمّل بس المحتوى اللي من حقك أو مسموح بتحميله.'));
  showVideoMenu(anchor);
}
function showVideoMenu(anchor) {
  const m = $('#videoMenu');
  const b = (anchor || $('#videoBtn')).getBoundingClientRect();
  placePopup(m, b.left - 300 + b.width, b.bottom + 4);
}
function hideVideoMenu() { $('#videoMenu').classList.add('hidden'); videoReq++; }

/* أداة التحميل في الإعدادات ← عمليات التنزيل */
function videoToolCard() {
  const ver = el('span', { class: 'sdesc', dir: 'ltr' }, '...');
  api.videoTools().then(r => { ver.textContent = r.version ? 'yt-dlp ' + r.version : 'مش متاحة'; });
  const btn = el('button', { onclick: async () => {
    btn.disabled = true; btn.textContent = 'بيحدّث...';
    const r = await api.updateVideoTool();
    btn.disabled = false; btn.textContent = 'تحديث';
    if (r.error) toast('فشل التحديث: ' + r.error); else { ver.textContent = 'yt-dlp ' + r.version; toast('أداة التحميل محدّثة'); }
  } }, 'تحديث');
  return card(settingRow('إظهار زرار «⬇ تحميل» فوق الفيديوهات', 'بيظهر لما تقف بالماوس على أي فيديو في يوتيوب وتيك توك وانستجرام وفيس بوك وغيرهم. محتاج تحديث الصفحة بعد التغيير.', toggle('videoOverlay')),
    settingRow('أداة تحميل الفيديوهات', el('span', {}, 'بتتحدث لوحدها كل يوم علشان تفضل شغالة مع يوتيوب وتيك توك وغيرهم. ', ver), btn));
}

function bindVideo() {
  $('#videoBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!$('#videoMenu').classList.contains('hidden')) return hideVideoMenu();
    openVideoMenu({ anchor: e.currentTarget });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#videoMenu') && !e.target.closest('#videoBtn')) hideVideoMenu(); });
  api.on('video:open', ({ url, candidates, partition, mp3 }) => openVideoMenu({ url, candidates, partition, mp3 }));
  commands['download-video'] = () => openVideoMenu();
  const orig = settingsSections.downloads;
  settingsSections.downloads = () => { const c = orig(); c.splice(1, 0, videoToolCard()); return c; };
}
