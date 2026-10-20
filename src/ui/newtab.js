'use strict';
/* صفحة التبويب الجديد بشكل كروم: شعار جوجل، مربع البحث، وضع AI، التصفح المتخفي، الاختصارات، الأخبار */

const ENGINE_LOGOS = {
  google: [['G', '#4285f4'], ['o', '#ea4335'], ['o', '#fbbc05'], ['g', '#4285f4'], ['l', '#34a853'], ['e', '#ea4335']],
  bing: [['Bing', '#008373']],
  duckduckgo: [['DuckDuckGo', '#de5833']],
  yahoo: [['yahoo!', '#6001d2']]
};
const ENGINE_NAMES = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', yahoo: 'Yahoo' };
const nt = { ai: false, newsLoaded: 0 };

function renderLogo() {
  const eng = ENGINE_LOGOS[state.settings.searchEngine] ? state.settings.searchEngine : 'google';
  const logo = $('#ntLogo');
  logo.innerHTML = '';
  for (const [t, c] of ENGINE_LOGOS[eng]) logo.append(el('span', { style: `color:${c}` }, t));
  logo.setAttribute('aria-label', ENGINE_NAMES[eng]);
  $('#ntSearch .gIcon').style.display = eng === 'google' ? '' : 'none';
  setAiMode(nt.ai);
}
function setAiMode(on) {
  nt.ai = !!on;
  $('#ntAI').classList.toggle('on', nt.ai);
  const eng = ENGINE_NAMES[state.settings.searchEngine] || 'Google';
  $('#ntInput').placeholder = nt.ai ? 'اسأل أي سؤال... (وضع AI من جوجل)' : `ابحث في ${eng} أو اكتب عنوان URL`;
}

/* ---- الاختصارات (المواقع اللي بتزورها كتير) ---- */
async function renderSpeedDial() {
  renderLogo();
  const sd = $('#speeddial');
  const sites = await api.topSites();
  sd.innerHTML = '';
  for (const s of sites) {
    const letter = el('span', {}, (s.title || s.host).trim().charAt(0).toUpperCase());
    const ic = el('span', { class: 'ic' }, letter);
    const img = el('img', { src: `https://www.google.com/s2/favicons?sz=64&domain=${s.host}`, alt: '' });
    img.onload = () => { if (img.naturalWidth > 16) letter.replaceWith(img); };
    const x = el('span', { class: 'x', title: 'إزالة الاختصار' }, '✕');
    const btn = el('button', { class: 'sc', title: s.url, 'data-url': s.url, 'data-sc': s.host }, ic, el('span', { class: 'lb' }, s.title), x);
    btn.addEventListener('click', async (e) => {
      if (e.target === x) {
        e.stopPropagation();
        const hidden = [...(state.settings.hiddenShortcuts || []), s.host];
        state.settings = await api.saveSettings({ hiddenShortcuts: hidden });
        renderSpeedDial();
        return;
      }
      navigate(s.url);
    });
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) createTab({ url: s.url, background: true }); });
    sd.append(btn);
  }
  renderSites();
  renderFeed();
}

/* ---- مواقع الأخبار والكورة والتواصل الاجتماعي (يمين وشمال الصفحة) ---- */
const SOCIAL_SITES = [
  ['Facebook', 'https://www.facebook.com/', '#1877f2'], ['WhatsApp', 'https://web.whatsapp.com/', '#25d366'],
  ['YouTube', 'https://www.youtube.com/', '#ff0000'], ['TikTok', 'https://www.tiktok.com/', '#111111'],
  ['Instagram', 'https://www.instagram.com/', '#e1306c'], ['X', 'https://x.com/', '#000000'],
  ['Telegram', 'https://web.telegram.org/', '#229ed9'], ['Messenger', 'https://www.messenger.com/', '#a033ff'],
  ['Snapchat', 'https://web.snapchat.com/', '#f7d000'], ['Gmail', 'https://mail.google.com/', '#ea4335']
];
const NEWS_SITES = [
  ['اليوم السابع', 'https://www.youm7.com/'], ['مصراوي', 'https://www.masrawy.com/'], ['الأهرام', 'https://gate.ahram.org.eg/'],
  ['المصري اليوم', 'https://www.almasryalyoum.com/'], ['الوطن', 'https://www.elwatannews.com/'], ['الجزيرة', 'https://www.aljazeera.net/'],
  ['BBC عربي', 'https://www.bbc.com/arabic'], ['سكاي نيوز عربية', 'https://www.skynewsarabia.com/'], ['العربية', 'https://www.alarabiya.net/'],
  ['CNN بالعربية', 'https://arabic.cnn.com/']
];
const SPORTS_SITES = [
  ['يلا كورة', 'https://www.yallakora.com/'], ['في الجول', 'https://www.filgoal.com/'], ['كووورة', 'https://www.kooora.com/'],
  ['بطولات', 'https://www.btolat.com/'], ['beIN SPORTS', 'https://www.beinsports.com/ar-mena/'], ['جول بالعربي', 'https://www.goal.com/ar'],
  ['الأهلي', 'https://www.alahlyegypt.com/'], ['FIFA', 'https://www.fifa.com/ar'], ['نتائج مباشرة', 'https://www.livescore.com/ar/'],
  ['ESPN', 'https://www.espn.com/soccer/']
];
/* ---- «مواقع مجالك»: كل واحد يختار مجاله والصفحة تتظبط عليه ---- */
const WORK_CATS = [
  { id: 'meta', name: 'ميتا للمعلنين', em: '📣', sites: [
    ['مدير الإعلانات', 'https://adsmanager.facebook.com/', '#0866ff'], ['Business Suite', 'https://business.facebook.com/', '#0866ff'],
    ['Meta for Business', 'https://www.facebook.com/business', '#0866ff'], ['مكتبة الإعلانات', 'https://www.facebook.com/ads/library/', '#0866ff'],
    ['Events Manager', 'https://business.facebook.com/events_manager2', '#0866ff'], ['Commerce Manager', 'https://business.facebook.com/commerce', '#0866ff'],
    ['إعدادات النشاط', 'https://business.facebook.com/settings', '#0866ff'], ['Instagram للأعمال', 'https://business.instagram.com/', '#e1306c'],
    ['WhatsApp Business', 'https://business.whatsapp.com/', '#25d366'], ['Threads', 'https://www.threads.net/', '#000000'],
    ['مركز المساعدة', 'https://www.facebook.com/business/help', '#0866ff'], ['Meta للمطورين', 'https://developers.facebook.com/', '#0866ff']] },
  { id: 'ads', name: 'إعلانات وتسويق', em: '📈', sites: [
    ['Google Ads', 'https://ads.google.com/', '#4285f4'], ['TikTok Ads', 'https://ads.tiktok.com/', '#111111'],
    ['Snapchat Ads', 'https://ads.snapchat.com/', '#f7d000'], ['X Ads', 'https://ads.x.com/', '#000000'],
    ['LinkedIn Ads', 'https://www.linkedin.com/campaignmanager/', '#0a66c2'], ['YouTube Studio', 'https://studio.youtube.com/', '#ff0000'],
    ['Google Analytics', 'https://analytics.google.com/', '#e37400'], ['Tag Manager', 'https://tagmanager.google.com/', '#4285f4'],
    ['Mailchimp', 'https://mailchimp.com/', '#ffe01b'], ['HubSpot', 'https://www.hubspot.com/', '#ff7a59']] },
  { id: 'seo', name: 'SEO وتحليل المواقع', em: '🔎', sites: [
    ['Search Console', 'https://search.google.com/search-console', '#4285f4'], ['Google Analytics', 'https://analytics.google.com/', '#e37400'],
    ['Google Trends', 'https://trends.google.com/', '#4285f4'], ['Keyword Planner', 'https://ads.google.com/aw/keywordplanner/home', '#4285f4'],
    ['PageSpeed Insights', 'https://pagespeed.web.dev/', '#34a853'], ['Rich Results Test', 'https://search.google.com/test/rich-results', '#4285f4'],
    ['Bing Webmaster', 'https://www.bing.com/webmasters', '#008373'], ['Ahrefs', 'https://ahrefs.com/', '#ff8800'],
    ['Semrush', 'https://www.semrush.com/', '#ff642d'], ['Ubersuggest', 'https://neilpatel.com/ubersuggest/', '#f26522'],
    ['Schema Validator', 'https://validator.schema.org/', '#c33'], ['GTmetrix', 'https://gtmetrix.com/', '#2a6ead']] },
  { id: 'dev', name: 'برمجة', em: '💻', sites: [
    ['GitHub', 'https://github.com/', '#181717'], ['Stack Overflow', 'https://stackoverflow.com/', '#f48024'],
    ['MDN', 'https://developer.mozilla.org/ar/', '#000000'], ['Microsoft Learn', 'https://learn.microsoft.com/ar-sa/dotnet/', '#0078d4'],
    ['ASP.NET', 'https://dotnet.microsoft.com/apps/aspnet', '#512bd4'], ['W3Schools', 'https://www.w3schools.com/', '#04aa6d'],
    ['GeeksforGeeks', 'https://www.geeksforgeeks.org/', '#2f8d46'], ['LeetCode', 'https://leetcode.com/', '#ffa116'],
    ['npm', 'https://www.npmjs.com/', '#cb3837'], ['NuGet', 'https://www.nuget.org/', '#004880'],
    ['CodePen', 'https://codepen.io/', '#000000'], ['Elzero', 'https://elzero.org/', '#2196f3']] },
  { id: 'design', name: 'تصميم', em: '🎨', sites: [
    ['Figma', 'https://www.figma.com/', '#a259ff'], ['Canva', 'https://www.canva.com/', '#00c4cc'],
    ['Behance', 'https://www.behance.net/', '#1769ff'], ['Dribbble', 'https://dribbble.com/', '#ea4c89'],
    ['Adobe Express', 'https://new.express.adobe.com/', '#eb1000'], ['Photopea', 'https://www.photopea.com/', '#18a497'],
    ['Freepik', 'https://www.freepik.com/', '#1273eb'], ['Pinterest', 'https://www.pinterest.com/', '#e60023'],
    ['Unsplash', 'https://unsplash.com/', '#000000'], ['Coolors', 'https://coolors.co/', '#0066ff'],
    ['Google Fonts', 'https://fonts.google.com/', '#4285f4'], ['remove.bg', 'https://www.remove.bg/', '#2b7de9']] },
  { id: 'ai', name: 'ذكاء اصطناعي', em: '🤖', sites: [
    ['ChatGPT', 'https://chatgpt.com/', '#10a37f'], ['Claude', 'https://claude.ai/', '#d97757'],
    ['Gemini', 'https://gemini.google.com/', '#4285f4'], ['Copilot', 'https://copilot.microsoft.com/', '#0078d4'],
    ['Perplexity', 'https://www.perplexity.ai/', '#20808d'], ['DeepSeek', 'https://chat.deepseek.com/', '#4d6bfe'],
    ['Meta AI', 'https://www.meta.ai/', '#0866ff'], ['Grok', 'https://grok.com/', '#000000']] },
  { id: 'learn', name: 'تعليم ودراسة', em: '📚', sites: [
    ['Google Classroom', 'https://classroom.google.com/', '#0f9d58'], ['Coursera', 'https://www.coursera.org/', '#0056d2'],
    ['Udemy', 'https://www.udemy.com/', '#a435f0'], ['إدراك', 'https://www.edraak.org/', '#e3342f'],
    ['Khan Academy', 'https://ar.khanacademy.org/', '#14bf96'], ['ويكيبيديا', 'https://ar.wikipedia.org/', '#000000'],
    ['Google Scholar', 'https://scholar.google.com/', '#4285f4'], ['Duolingo', 'https://www.duolingo.com/', '#58cc02']] },
  { id: 'shop', name: 'تسوق', em: '🛒', sites: [
    ['Amazon مصر', 'https://www.amazon.eg/', '#ff9900'], ['Noon', 'https://www.noon.com/egypt-ar/', '#feee00'],
    ['Jumia', 'https://www.jumia.com.eg/ar/', '#f68b1e'], ['AliExpress', 'https://ar.aliexpress.com/', '#e62e04'],
    ['Temu', 'https://www.temu.com/', '#fb7701'], ['SHEIN', 'https://ar.shein.com/', '#000000'],
    ['دوبيزل', 'https://www.dubizzle.com.eg/', '#e00000'], ['B.TECH', 'https://btech.com/ar/', '#e30613']] }
];
const BASE_CATS = [{ id: 'news', name: 'أخبار', em: '📰' }, { id: 'sports', name: 'كورة ورياضة', em: '⚽' }];
const ALL_CATS = [...BASE_CATS, ...WORK_CATS];
const hostOfUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function interests() { return Array.isArray(state.settings.interests) ? state.settings.interests : ['news', 'sports']; }
async function saveInterests(list) {
  const s = { interests: list };
  if (!list.includes(state.settings.workTab)) s.workTab = (WORK_CATS.find(c => list.includes(c.id)) || {}).id;
  state.settings = await api.saveSettings(s);
  renderSites();
}

/* اختيار المجالات: كروت بتتعلم عليها وتحفظ */
function interestPicker(first) {
  const chosen = new Set(interests());
  const chips = ALL_CATS.map(c => {
    const b = el('button', { class: 'ichip' + (chosen.has(c.id) ? ' on' : ''), type: 'button' }, el('span', { class: 'em' }, c.em), c.name);
    b.addEventListener('click', () => { chosen.has(c.id) ? chosen.delete(c.id) : chosen.add(c.id); b.classList.toggle('on', chosen.has(c.id)); });
    return b;
  });
  const save = el('button', { class: 'primary', type: 'button' }, 'تمام، ظبّطلي الصفحة');
  save.addEventListener('click', () => { saveInterests(ALL_CATS.map(c => c.id).filter(id => chosen.has(id))); toast('الصفحة الرئيسية اتظبطت على اهتماماتك'); });
  const later = el('button', { class: 'ghost', type: 'button' }, first ? 'بعدين' : 'إلغاء');
  later.addEventListener('click', () => { if (first) saveInterests(interests()); else renderSites(); });
  return el('div', { class: 'wcard picker' },
    el('div', { class: 'whead' }, el('b', {}, first ? '✨ اختار مجالك وأنا أظبطلك الصفحة' : '✨ اختار مجالاتك واهتماماتك'),
      el('span', { class: 'sub' }, 'هتظهرلك مواقع شغلك على طول، وتقدر تغيرها في أي وقت')),
    el('div', { class: 'ichips' }, ...chips), el('div', { class: 'wact' }, later, save));
}
function openInterests() {
  const w = $('#ntWork');
  w.innerHTML = '';
  w.append(interestPicker(false));
  w.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* لمسة ذكية: لو بتفتح مواقع مجال معين كتير ومش مختاره، نقترحه عليك مرة واحدة */
async function smartHint() {
  const mine = new Set(interests());
  const dismissed = new Set(state.settings.interestsDismissed || []);
  let hosts = [];
  try { hosts = await api.historyHosts(); } catch { return null; }
  const visits = new Map(hosts);
  let best = null;
  for (const c of WORK_CATS) {
    if (mine.has(c.id) || dismissed.has(c.id)) continue;
    let n = 0, sites = 0;
    for (const [, url] of c.sites) { const v = visits.get(hostOfUrl(url)) || 0; if (v) { n += v; sites++; } }
    if (sites >= 2 && n >= 4 && (!best || n > best.n)) best = { c, n };
  }
  if (!best) return null;
  const add = el('button', { class: 'primary', type: 'button' }, 'ضيفه');
  const no = el('button', { class: 'ghost', type: 'button' }, 'لا شكرًا');
  const box = el('div', { class: 'whint' }, el('span', {}, `${best.c.em} لاحظت إنك بتفتح مواقع «${best.c.name}» كتير. أضيفلك قسمها؟`), no, add);
  add.addEventListener('click', () => saveInterests([...mine, best.c.id]));
  no.addEventListener('click', async () => { state.settings = await api.saveSettings({ interestsDismissed: [...dismissed, best.c.id] }); box.remove(); });
  return box;
}

async function renderWork() {
  const w = $('#ntWork');
  w.innerHTML = '';
  if (state.active && state.active.temp) return;
  if (!Array.isArray(state.settings.interests)) { w.append(interestPicker(true)); return; }
  const cats = WORK_CATS.filter(c => interests().includes(c.id));
  if (cats.length) {
    let cur = cats.find(c => c.id === state.settings.workTab) || cats[0];
    const body = el('div', { class: 'wgrid' });
    const fill = () => { body.innerHTML = ''; body.append(...cur.sites.map(s => siteLink(s, 'soc'))); };
    const tabs = cats.map(c => {
      const b = el('button', { class: 'wtab' + (c === cur ? ' on' : ''), type: 'button' }, el('span', { class: 'em' }, c.em), c.name);
      b.addEventListener('click', () => {
        cur = c; fill();
        for (const x of tabs) x.classList.toggle('on', x === b);
        api.saveSettings({ workTab: c.id }).then(s => { state.settings = s; });
      });
      return b;
    });
    const edit = el('button', { class: 'wedit', type: 'button', title: 'تغيير مجالاتك' }, '✏️');
    edit.addEventListener('click', openInterests);
    fill();
    w.append(el('div', { class: 'wcard' }, el('div', { class: 'wtabs' }, ...tabs, edit), body));
  }
  const hint = await smartHint();
  if (hint && !w.querySelector('.picker')) w.append(hint);
}

const favUrl = (u) => { try { return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(u).hostname}`; } catch { return ''; } };
function siteLink([name, url, color], cls) {
  const img = el('img', { src: favUrl(url), alt: '' });
  const letter = el('span', { class: 'lt' }, name.replace(/^ال/, '').charAt(0));
  img.onerror = () => img.remove();
  img.onload = () => { if (img.naturalWidth > 16) letter.remove(); else img.remove(); };
  const ic = el('span', { class: 'ic' }, letter, img);
  if (color) ic.style.setProperty('--brand', color);
  const a = el('button', { class: cls, title: url, 'data-url': url }, ic, el('span', { class: 'lb' }, name));
  a.addEventListener('click', () => navigate(url));
  a.addEventListener('auxclick', (e) => { if (e.button === 1) createTab({ url, background: true }); });
  return a;
}
function siteList(title, emoji, sites) {
  return el('div', { class: 'ntList' }, el('div', { class: 'ntListHead' }, el('span', { class: 'em' }, emoji), title),
    el('div', { class: 'ntListBody' }, ...sites.map(s => siteLink(s, 'site'))));
}
function renderSites() {
  const temp = state.active && state.active.temp;
  const social = $('#ntSocial');
  social.innerHTML = '';
  if (!temp) social.append(...SOCIAL_SITES.map(s => siteLink(s, 'soc')));
  for (const id of ['#ntNewsSide', '#ntSportsSide', '#ntSitesInline']) $(id).innerHTML = '';
  renderWork();
  if (temp) return;
  const mine = interests();
  const news = mine.includes('news'), sports = mine.includes('sports');
  if (news) $('#ntNewsSide').append(siteList('أخبار', '📰', NEWS_SITES));
  if (sports) $('#ntSportsSide').append(siteList('كورة ورياضة', '⚽', SPORTS_SITES));
  $('#ntSitesInline').append(...[news && siteList('أخبار', '📰', NEWS_SITES), sports && siteList('كورة ورياضة', '⚽', SPORTS_SITES)].filter(Boolean));
}

/* ---- الأخبار ---- */
function timeAgo(t) {
  if (!t) return '';
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return `منذ ${Math.round(h / 24)} يوم`;
}
const SHARE_SVG = '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';
const NEWTAB_SVG = '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
async function renderFeed() {
  const feed = $('#ntFeed');
  if (state.settings.showFeed === false || (state.active && state.active.temp)) { feed.innerHTML = ''; return; }
  // ما نحملش الأخبار كل ما تفتح تبويب؛ كل 20 دقيقة كفاية
  if (feed.children.length && Date.now() - nt.newsLoaded < 20 * 60000) return;
  let items = [];
  try { items = await api.getNews(); } catch { items = []; }
  if (!items.length) { if (!feed.children.length) feed.innerHTML = ''; return; }
  nt.newsLoaded = Date.now();
  feed.innerHTML = '';
  feed.append(el('div', { class: 'nfeedhead' }, el('span', {}, 'أخبار ليك'),
    el('button', { onclick: async () => { state.settings = await api.saveSettings({ showFeed: false }); feed.innerHTML = ''; toast('اتخفت الأخبار. ترجعها من الإعدادات ← المظهر'); } }, 'إخفاء')));
  let imgCount = 0;
  items.slice(0, 30).forEach((n) => {
    const big = !!n.image && imgCount++ % 2 === 1; // خبر بصورة صغيرة وخبر بصورة كبيرة زي كروم
    const share = el('button', { title: 'نسخ الرابط' }); share.innerHTML = SHARE_SVG;
    const open = el('button', { title: 'فتح في تبويب جديد' }); open.innerHTML = NEWTAB_SVG;
    const row = el('div', { class: 'nrow' }, el('div', { class: 'nt' }, n.title));
    if (n.image && !big) {
      const th = el('img', { class: 'thumb', src: n.image, alt: '', loading: 'lazy' });
      th.onerror = () => th.remove();
      row.append(th);
    }
    const card = el('div', { class: 'ncard', 'data-url': n.link }, row,
      el('div', { class: 'meta' }, el('span', { class: 'src' }, [n.source, timeAgo(n.time)].filter(Boolean).join(' · ')), share, open));
    if (big) {
      const im = el('img', { class: 'big', src: n.image, alt: '', loading: 'lazy' });
      im.onerror = () => im.remove();
      card.append(im);
    }
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') === share) { e.stopPropagation(); navigator.clipboard.writeText(n.link); toast('تم نسخ رابط الخبر'); return; }
      if (e.target.closest('button') === open) { e.stopPropagation(); createTab({ url: n.link, background: true }); toast('اتفتح في تبويب جديد'); return; }
      navigate(n.link);
    });
    card.addEventListener('auxclick', (e) => { if (e.button === 1) createTab({ url: n.link, background: true }); });
    feed.append(card);
  });
}

/* ---- مربع البحث والأزرار ---- */
function bindNewTab() {
  $('#ntSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#ntInput').value.trim();
    if (!q) return;
    $('#ntInput').value = '';
    if (nt.ai) { navigate('https://www.google.com/search?udm=50&q=' + encodeURIComponent(q)); setAiMode(false); }
    else navigate(q);
  });
  $('#ntAI').addEventListener('click', () => {
    const q = $('#ntInput').value.trim();
    if (q) { $('#ntInput').value = ''; navigate('https://www.google.com/search?udm=50&q=' + encodeURIComponent(q)); return; }
    setAiMode(!nt.ai);
    $('#ntInput').focus();
  });
  $('#ntNewTab').addEventListener('click', () => run('new-tab'));
  $('#ntIncog').addEventListener('click', () => run('new-temp-tab'));
  $('#ntLens').addEventListener('click', () => navigate('https://lens.google.com/'));
  $('#ntMic').addEventListener('click', () => {
    // الكتابة بالصوت في ويندوز شغالة في أي مربع كتابة
    $('#ntInput').focus();
    toast('🎤 اضغط زرار ويندوز + H وابدأ اتكلم، الكلام هيتكتب في مربع البحث');
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindNewTab); else bindNewTab();
