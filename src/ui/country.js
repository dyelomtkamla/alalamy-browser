'use strict';
/* بلد المستخدم: الرئيسية بتعرض أخبار وعملة ودهب ودوري ومواقيت بلده (COUNTRIES في countries.js).
   تلقائي من المنطقة الزمنية للجهاز، والمستخدم يقدر يغيّرها من الإعدادات ← المظهر. */
const COUNTRY_KEY = 'alalamy.country';
function autoCountry() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  const c = Object.values(COUNTRIES).find(x => x.tzs.includes(tz));
  return c ? c.code : 'XX';
}
function countryChoice() { try { return localStorage.getItem(COUNTRY_KEY) || 'auto'; } catch { return 'auto'; } }
function countryCode() { const c = countryChoice(); return COUNTRIES[c] ? c : autoCountry(); }
function country() { return COUNTRIES[countryCode()] || COUNTRIES.EG; }
// "الريال" ← "ريال" (للمحوّل: = ١٠٠ ريال)
const curWord = () => country().curAr.replace(/^ال/, '');
function setCountry(code) {
  try { if (code === 'auto' || !COUNTRIES[code]) localStorage.removeItem(COUNTRY_KEY); else localStorage.setItem(COUNTRY_KEY, code); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('alalamy-country')); } catch { /* ignore */ }
}
