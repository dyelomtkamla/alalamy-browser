'use strict';
// يبني محرك مانع الإعلانات مرة واحدة وقت تجهيز البرنامج ويحفظه في src/adblock-engine.bin
// علشان المانع يشتغل من أول تشغيل حتى من غير إنترنت. البرنامج بعد كده بيحدّث القوايم لوحده.
const fs = require('fs');
const path = require('path');
const { ElectronBlocker, adsAndTrackingLists } = require('@ghostery/adblocker-electron');

const EXTRA_LISTS = ['https://raw.githubusercontent.com/easylist/listear/master/Liste_AR.txt'];
const LISTS = [...adsAndTrackingLists, ...EXTRA_LISTS];

async function build(fetchImpl) {
  return ElectronBlocker.fromLists(fetchImpl, LISTS, { enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true });
}
module.exports = { LISTS, build };

if (require.main === module) {
  build(fetch).then((engine) => {
    const out = path.join(__dirname, '..', 'src', 'adblock-engine.bin');
    fs.writeFileSync(out, engine.serialize());
    console.log('wrote', out, fs.statSync(out).size, 'bytes');
  }).catch((e) => { console.error(e); process.exit(1); });
}
