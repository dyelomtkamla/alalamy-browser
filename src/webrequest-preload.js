'use strict';
/* chrome.webRequest لإضافات كروم (زي Snap Pixel Helper و TikTok Pixel Helper و Tag Assistant):
   إلكترون بيوقف chrome.webRequest بتاع الإضافات خالص أول ما المتصفح نفسه يسجّل session.webRequest
   (وإحنا محتاجينه لمانع الإعلانات وهوية المتصفح)، وفي الـ service worker (MV3) أحداثه مابتوصلش أصلاً.
   فبنعمل نسخة بديلة: الإضافة بتسجّل اللي عايزاه هنا، والعملية الرئيسية (ext-webrequest.js) بتبعتلها
   كل طلب شبكة يطابق الفلتر بنفس شكل كروم. الأحداث للمراقبة بس (من غير منع أو تعديل للطلب). */
const { contextBridge, ipcRenderer } = require('electron');

const isExt = process.type === 'service-worker' || (typeof location !== 'undefined' && String(location.href).startsWith('chrome-extension://'));
if (isExt) {
  try {
    const cbs = new Map(); // listener id -> function في عالم الإضافة
    let seq = 0;
    const api = {
      add: (event, filter, spec, cb) => {
        const id = ++seq;
        cbs.set(id, cb);
        ipcRenderer.send('alalamy-wr:add', { id, event, filter, spec });
        return id;
      },
      remove: (id) => { cbs.delete(id); ipcRenderer.send('alalamy-wr:remove', id); }
    };
    ipcRenderer.on('alalamy-wr:event', (_e, id, details) => {
      const cb = cbs.get(id);
      if (!cb) return;
      try {
        // الـ Buffer بيوصل Uint8Array؛ كروم بيدي ArrayBuffer
        const raw = details && details.requestBody && details.requestBody.raw;
        if (Array.isArray(raw)) for (const r of raw) if (r && r.bytes && r.bytes.buffer) r.bytes = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength);
        cb(details);
      } catch (err) { /* غلطة جوه الإضافة نفسها */ }
    });

    const inject = (bridge) => {
      const c = globalThis.chrome;
      if (!bridge || !c || Object.isFrozen(c)) return;
      let m = {};
      try { m = (c.runtime && c.runtime.getManifest && c.runtime.getManifest()) || {}; } catch (e) { /* ignore */ }
      const perms = [].concat(m.permissions || [], m.optional_permissions || []);
      if (!perms.includes('webRequest')) return;
      const makeEvent = (name) => {
        const mine = new Map(); // function -> listener id
        return {
          addListener(fn, filter, spec) {
            if (typeof fn !== 'function' || mine.has(fn)) return;
            const f = filter && typeof filter === 'object' ? JSON.parse(JSON.stringify(filter)) : { urls: ['<all_urls>'] };
            const s = Array.isArray(spec) ? spec.filter(x => typeof x === 'string') : [];
            mine.set(fn, bridge.add(name, f, s, (d) => { try { fn(d); } catch (e) { setTimeout(() => { throw e; }); } }));
          },
          removeListener(fn) { const id = mine.get(fn); if (id) { mine.delete(fn); bridge.remove(id); } },
          hasListener(fn) { return mine.has(fn); },
          hasListeners() { return mine.size > 0; }
        };
      };
      const wr = {
        MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES: 20,
        handlerBehaviorChanged(cb) { if (typeof cb === 'function') { setTimeout(cb); return undefined; } return Promise.resolve(); },
        ResourceType: { MAIN_FRAME: 'main_frame', SUB_FRAME: 'sub_frame', STYLESHEET: 'stylesheet', SCRIPT: 'script', IMAGE: 'image', FONT: 'font', OBJECT: 'object', XMLHTTPREQUEST: 'xmlhttprequest', PING: 'ping', CSP_REPORT: 'csp_report', MEDIA: 'media', WEBSOCKET: 'websocket', WEBTRANSPORT: 'webtransport', WEBBUNDLE: 'webbundle', OTHER: 'other' },
        OnBeforeRequestOptions: { BLOCKING: 'blocking', REQUEST_BODY: 'requestBody', EXTRA_HEADERS: 'extraHeaders' },
        OnBeforeSendHeadersOptions: { REQUEST_HEADERS: 'requestHeaders', BLOCKING: 'blocking', EXTRA_HEADERS: 'extraHeaders' },
        OnSendHeadersOptions: { REQUEST_HEADERS: 'requestHeaders', EXTRA_HEADERS: 'extraHeaders' },
        OnHeadersReceivedOptions: { BLOCKING: 'blocking', RESPONSE_HEADERS: 'responseHeaders', EXTRA_HEADERS: 'extraHeaders' },
        OnResponseStartedOptions: { RESPONSE_HEADERS: 'responseHeaders', EXTRA_HEADERS: 'extraHeaders' },
        OnCompletedOptions: { RESPONSE_HEADERS: 'responseHeaders', EXTRA_HEADERS: 'extraHeaders' },
        OnErrorOccurredOptions: { EXTRA_HEADERS: 'extraHeaders' }
      };
      for (const n of ['onBeforeRequest', 'onBeforeSendHeaders', 'onSendHeaders', 'onHeadersReceived', 'onAuthRequired',
        'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred', 'onActionIgnored']) wr[n] = makeEvent(n);
      try { Object.defineProperty(c, 'webRequest', { enumerable: true, configurable: true, get: () => wr }); } catch (e) { /* ignore */ }
    };
    // صفحة خلفية MV2 من غير عزل (contextIsolation مقفول): نفس العالم، فبنعرّفها على طول
    if (process.contextIsolated === false) inject(api);
    else if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: inject, args: [api] });
  } catch (err) { console.error('webRequest inject', err); }
}
