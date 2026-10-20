'use strict';
// اختصارات كروم: نفس الجدول بيستخدمه main.js (قبل الصفحة) و page-preload.js (بعد الصفحة لو ماستخدمتهوش)
function shortcutAction(input) {
  const ctrl = input.control || input.meta;
  const shift = !!input.shift, alt = !!input.alt;
  const k = String(input.key || '').toLowerCase();
  const code = input.code || '';
  // حروف بالعربي: نعتمد على مكان الزرار (KeyT...) علشان الاختصارات تشتغل والكيبورد عربي
  const letter = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : k;
  if (ctrl && !alt) {
    if (shift) {
      switch (letter) {
        case 't': return 'reopen-tab';
        case 'n': return 'new-incognito-window';
        case 'w': return 'close-window';
        case 'a': return 'search-tabs';
        case 'm': return 'clients';
        case 'l': return 'learn';
        case 'b': return 'toggle-bookmarks-bar';
        case 'o': return 'show-bookmarks';
        case 'd': return 'bookmark-all';
        case 's': return 'screenshot';
        case 'i': return 'devtools';
        case 'j': return 'devtools-console';
        case 'c': return 'inspect';
        case 'r': return 'hard-reload';
        case 'g': return 'find-prev';
        case 'q': return null;
      }
      if (k === 'delete') return 'clear-data';
      if (k === 'tab') return 'prev-tab';
      if (k === 'pageup') return 'move-tab-prev';
      if (k === 'pagedown') return 'move-tab-next';
      if (k === '+' || k === '=') return 'zoom-in';
      if (k === '_') return 'zoom-out';
      return null;
    }
    switch (letter) {
      case 't': return 'new-tab';
      case 'n': return 'new-window';
      case 'w': return 'close-tab';
      case 'l': case 'e': case 'k': return 'focus-address';
      case 'r': return 'reload';
      case 'd': return 'bookmark';
      case 'h': return 'show-history';
      case 'j': return 'show-downloads';
      case 'f': return 'find';
      case 'g': return 'find-next';
      case 'p': return 'print';
      case 's': return 'save-page';
      case 'u': return 'view-source';
      case 'o': return 'open-file';
    }
    if (k === 'f4') return 'close-tab';
    if (k === 'f5') return 'hard-reload';
    if (k === 'tab' || k === 'pagedown') return 'next-tab';
    if (k === 'pageup') return 'prev-tab';
    if (k === '=' || k === '+') return 'zoom-in';
    if (k === '-') return 'zoom-out';
    if (k === '0') return 'zoom-reset';
    if (k === '/') return 'shortcuts-help';
    const digit = /^(Digit|Numpad)[1-9]$/.test(code) ? code.slice(-1) : (/^[1-9]$/.test(k) ? k : null);
    if (digit) return 'tab-' + digit;
    return null;
  }
  if (alt && !ctrl) {
    if (shift && letter === 'r') return 'reader';
    if (k === 'arrowleft') return 'back';
    if (k === 'arrowright') return 'forward';
    if (k === 'home') return 'home';
    if (!shift && (letter === 'd')) return 'focus-address';
    if (!shift && (letter === 'f' || letter === 'e')) return 'open-menu';
    return null;
  }
  if (shift && k === 'escape') return 'task-manager';
  if (shift && k === 'f5') return 'hard-reload';
  if (shift && k === 'f3') return 'find-prev';
  if (shift) return null;
  switch (k) {
    case 'f1': return 'shortcuts-help';
    case 'f3': return 'find-next';
    case 'f5': return 'reload';
    case 'f6': return 'focus-address';
    case 'f9': return 'reader';
    case 'f10': return 'open-menu';
    case 'f11': return 'fullscreen';
    case 'f12': return 'devtools';
    case 'escape': return 'escape';
    case 'browserback': return 'back';
    case 'browserforward': return 'forward';
    case 'browserrefresh': return 'reload';
    case 'browserhome': return 'home';
  }
  return null;
}
// زي كروم: الاختصارات دي الصفحة ليها الأولوية فيها (Ctrl+F في Google Docs، Ctrl+S في الفيجما، Ctrl+K في سلاك،
// Ctrl+U تسطير في الدوكس...). لو الصفحة ماستخدمتهاش المتصفح بينفذها (عن طريق page-preload.js)
const PAGE_FIRST = new Set(['find', 'find-next', 'find-prev', 'save-page', 'print', 'bookmark', 'bookmark-all', 'view-source',
  'focus-address', 'show-history', 'show-downloads', 'open-file', 'zoom-in', 'zoom-out', 'zoom-reset', 'reader', 'open-menu', 'shortcuts-help', 'escape']);
module.exports = { shortcutAction, PAGE_FIRST };
