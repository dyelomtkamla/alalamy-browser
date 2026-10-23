'use strict';
// واجهة chrome.sidePanel لإضافات كروم (زي إضافة Claude): electron-chrome-extensions مش بيدعمها،
// فبنعرّفها هنا قبل ما المكتبة تجمّد كائن chrome. الطلبات بتروح لـ main (alalamy-sp) واللوحة بتتفتح على الشمال زي كروم العربي.
const { contextBridge, ipcRenderer } = require('electron');

if (process.type === 'service-worker' || (typeof location !== 'undefined' && location.href.startsWith('chrome-extension://'))) {
  try {
    const api = { call: (m, a) => ipcRenderer.invoke('alalamy-sp', m, a) };
    // الجسر بيتبعت كـ argument (في الـ service worker مفيش exposeInMainWorld بيوصل لـ globalThis)
    const inject = (bridgeArg) => {
      const bridge = bridgeArg || globalThis.__alalamySP;
      try { delete globalThis.__alalamySP; } catch (_) { /* ignore */ }
      const c = globalThis.chrome;
      if (!bridge || !c || c.sidePanel || Object.isFrozen(c)) return;
      const wrap = (m) => (arg, cb) => {
        if (typeof arg === 'function') { cb = arg; arg = undefined; }
        const p = bridge.call(m, arg === undefined ? null : JSON.parse(JSON.stringify(arg)));
        if (typeof cb === 'function') { p.then(cb, () => cb()); return undefined; }
        return p;
      };
      const ev = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; }, hasListeners() { return false; } });
      Object.defineProperty(c, 'sidePanel', {
        enumerable: true, configurable: true,
        value: {
          setPanelBehavior: wrap('setPanelBehavior'), getPanelBehavior: wrap('getPanelBehavior'),
          setOptions: wrap('setOptions'), getOptions: wrap('getOptions'),
          open: wrap('open'), close: wrap('close'), getLayout: wrap('getLayout'),
          onOpened: ev(), onClosed: ev()
        }
      });
    };
    if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: inject, args: [api] });
    else {
      contextBridge.exposeInMainWorld('__alalamySP', api);
      require('electron').webFrame.executeJavaScript('(' + inject + ')()');
    }
  } catch (err) { console.error('sidePanel inject', err); }
}
