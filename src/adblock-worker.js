'use strict';
/*
 * تحديث قوايم مانع الإعلانات في عملية منفصلة: تحليل القوايم بياخد 2-4 ثواني من المعالج،
 * ولو اتعمل في العملية الرئيسية كل التبويبات (وفيديوهات يوتيوب) بتقف لحد ما يخلص.
 */
const path = require('path');
const { FiltersEngine } = (() => {
  try { return require('@ghostery/adblocker'); } catch {}
  return require('@ghostery/adblocker', { paths: [path.dirname(require.resolve('@ghostery/adblocker-electron/package.json'))] });
})();

process.parentPort.once('message', (e) => {
  try {
    const engine = FiltersEngine.parse(e.data.lists.join('\n'), e.data.config);
    process.parentPort.postMessage({ ok: true, bin: engine.serialize() });
  } catch (err) {
    process.parentPort.postMessage({ ok: false, error: String(err && err.message || err) });
  }
});
