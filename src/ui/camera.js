'use strict';
/* قارئ الكاميرا والمايك: معاينة الكاميرا، قراءة رموز QR (jsQR)، البحث بالصورة في عدسة جوجل،
   ومؤشر صوت المايك علشان تتأكد إنه شغال. الكاميرا بتقفل أول ما اللوحة تتقفل. */

const camPanel = {
  camera(body) {
    const video = el('video', { class: 'camvideo', autoplay: '', muted: '', playsinline: '' });
    const camSel = el('select', { class: 'qrurl' });
    const micSel = el('select', { class: 'qrurl' });
    const level = el('i');
    const meter = el('div', { class: 'cammeter' }, level);
    const status = el('p', { class: 'note' }, 'بنشغّل الكاميرا...');
    const result = el('div', { class: 'camresult hidden' });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stream = null, audio = null, timer = null, lastCode = '';

    const stop = () => {
      clearInterval(timer); timer = null;
      if (stream) for (const tr of stream.getTracks()) tr.stop();
      stream = null;
      if (audio) { try { audio.close(); } catch { /* ignore */ } audio = null; }
    };
    const alive = () => body.isConnected && state.panel === 'camera' && !$('#panel').classList.contains('hidden');

    const showCode = (text) => {
      if (text === lastCode) return;
      lastCode = text;
      result.innerHTML = '';
      const isUrl = /^https?:\/\//i.test(text);
      result.append(
        el('b', {}, 'لقينا رمز QR:'),
        el('div', { class: 'camtext', dir: 'auto' }, text),
        el('div', { class: 'btnrow' },
          isUrl ? el('button', { class: 'primary', onclick: () => { closePanel(); createTab({ url: text }); } }, 'فتح الرابط') : null,
          !isUrl ? el('button', { class: 'primary', onclick: async () => { closePanel(); createTab({ url: await api.searchURL(text) }); } }, 'بحث في جوجل') : null,
          el('button', { onclick: async () => { await navigator.clipboard.writeText(text); toast('تم النسخ'); } }, 'نسخ')));
      result.classList.remove('hidden');
    };

    const frame = () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      return ctx;
    };
    const scan = () => {
      if (!alive()) return stop();
      const c = frame();
      if (c && typeof jsQR === 'function') {
        const img = c.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) showCode(code.data);
      }
      if (audio && audio.an) {
        const buf = new Uint8Array(audio.an.fftSize);
        audio.an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        level.style.width = Math.min(100, peak / 0.9) + '%';
      }
    };

    const fillDevices = async () => {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const fill = (sel, kind, label) => {
        const cur = sel.value;
        sel.innerHTML = '';
        devs.filter(d => d.kind === kind).forEach((d, i) => sel.append(el('option', { value: d.deviceId }, d.label || `${label} ${i + 1}`)));
        if (cur) sel.value = cur;
      };
      fill(camSel, 'videoinput', 'كاميرا');
      fill(micSel, 'audioinput', 'ميكروفون');
    };

    const start = async () => {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camSel.value ? { deviceId: { exact: camSel.value } } : { width: { ideal: 1280 } },
          audio: micSel.value ? { deviceId: { exact: micSel.value } } : true
        });
      } catch (err) {
        // ممكن يكون مفيش مايك: نجرّب الكاميرا لوحدها
        try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch {
          status.textContent = err && err.name === 'NotFoundError'
            ? 'مفيش كاميرا متوصلة بالجهاز.'
            : 'الكاميرا مش متاحة. اتأكد إن مفيش برنامج تاني بيستخدمها، وإن ويندوز سامح للتطبيقات بالكاميرا والميكروفون (الإعدادات ← الخصوصية والأمان).';
          return;
        }
      }
      if (!alive()) return stop();
      video.srcObject = stream;
      const hasMic = stream.getAudioTracks().length > 0;
      if (hasMic) {
        audio = new AudioContext();
        audio.an = audio.createAnalyser();
        audio.an.fftSize = 512;
        audio.createMediaStreamSource(stream).connect(audio.an);
      }
      status.textContent = hasMic ? 'وجّه الكاميرا لرمز QR، أو اتكلم وشوف مؤشر المايك بيتحرك.' : 'وجّه الكاميرا لرمز QR. (مفيش ميكروفون متاح)';
      await fillDevices().catch(() => {});
      timer = setInterval(scan, 250);
    };

    camSel.addEventListener('change', start);
    micSel.addEventListener('change', start);

    const lensBtn = el('button', { class: 'primary', onclick: () => {
      const c = frame();
      if (!c) return toast('الكاميرا لسه مش جاهزة');
      const t = state.active;
      api.lensImage(canvas.toDataURL('image/jpeg', 0.9), (t && t.partition) || 'persist:default');
      toast('بنبحث بالصورة في عدسة جوجل...');
      closePanel();
    } }, 'ابحث باللي في الكاميرا (عدسة جوجل)');

    body.append(status, el('div', { class: 'camwrap' }, video), result,
      el('div', { class: 'btnrow' }, lensBtn),
      el('label', { class: 'camlbl' }, 'الكاميرا'), camSel,
      el('label', { class: 'camlbl' }, 'الميكروفون'), micSel, meter);
    start();
  }
};
Object.assign(panels, camPanel);
Object.assign(panelTitles, { camera: 'قارئ الكاميرا والمايك' });
Object.assign(commands, { 'camera-reader': () => openPanel('camera') });
$('#ntCam').addEventListener('click', () => openPanel('camera'));
