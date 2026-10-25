'use strict';
/* مسجّل الصوت النقي: المايك → إلغاء الدوشة بتاع كروم (WebRTC) → فلتر للهمهمة والتكييف → بوابة ذكية
   بتقيس دوشة الأوضة وتكتم اللي تحتها (الأصوات البعيدة والمراوح) → تسجيل WAV/MP3 بمستوى مظبوط */
// القرآن كان فيه «ضبط الصوت التلقائي» (AGC) وإلغاء الصدى: بيعلّوا الصوت ويوطّوه لوحدهم مع كل نفَس ووقفة،
// والبوابة كانت بتقفل بسرعة وبقوة بين الآيات، وكتم الدوشة بتاع كروم بيوطّي المد الطويل لأنه بيحسبه دوشة ثابتة.
// دلوقتي القرآن ثابت: من غير AGC ولا كتم كروم (فلتر الهمهمة والتكييف بس)، وبوابة ناعمة
// بتوطّي الدوشة بس (مش بتكتمها) ومستنية لحد ما الوقفة تطول قبل ما توطّي.
const REC_MODES = {
  voice: { name: 'قرآن / كلام / فويس', ec: false, ns: false, agc: false, hp: 75, gate: 1.8, floor: 0.35, hold: 450, release: 0.35 },
  sing: { name: 'غناء / إنشاد', ec: false, ns: true, agc: false, hp: 70, gate: 1.6, floor: 0.3, hold: 350, release: 0.3 },
  raw: { name: 'خام من غير معالجة', ec: false, ns: false, agc: false, hp: 0, gate: 0, floor: 1, hold: 0, release: 0.3 }
};
const rec = { mode: 'voice', deviceId: '', stream: null, ctx: null, nodes: null, chunks: [], recording: false, startAt: 0, floor: 0.004, calib: null, level: 0, gateOpen: 0, wav: null, timer: null };
try { const m = localStorage.getItem('recMode'); if (REC_MODES[m]) rec.mode = m; rec.deviceId = localStorage.getItem('recMic') || ''; } catch (_) { /* ignore */ }

async function recStart() {
  recStop();
  const m = REC_MODES[rec.mode];
  const audio = { echoCancellation: m.ec, noiseSuppression: m.ns, autoGainControl: m.agc, channelCount: 1, sampleRate: 48000 };
  if (rec.deviceId) audio.deviceId = { exact: rec.deviceId };
  try { rec.stream = await navigator.mediaDevices.getUserMedia({ audio }); } catch (e) {
    if (rec.deviceId) { rec.deviceId = ''; return recStart(); }
    throw e;
  }
  const ctx = rec.ctx = new AudioContext({ sampleRate: 48000 });
  const src = ctx.createMediaStreamSource(rec.stream);
  let node = src;
  if (m.hp) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = m.hp; hp.Q.value = 0.7; node.connect(hp); node = hp; }
  // همهمة الكهربا 50 هيرتز (مصر) بتتشال
  if (m.hp) { const notch = ctx.createBiquadFilter(); notch.type = 'notch'; notch.frequency.value = 50; notch.Q.value = 8; node.connect(notch); node = notch; }
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  let env = 1, lastLoud = 0;
  const attack = 1 - Math.exp(-1 / (0.008 * ctx.sampleRate));          // بتفتح في ~8ms
  const release = 1 - Math.exp(-1 / (m.release * ctx.sampleRate));     // وبتوطّي براحة (~300ms)
  proc.onaudioprocess = (ev) => {
    const inp = ev.inputBuffer.getChannelData(0), out = ev.outputBuffer.getChannelData(0);
    let sum = 0; for (let i = 0; i < inp.length; i++) sum += inp[i] * inp[i];
    const rms = Math.sqrt(sum / inp.length);
    rec.level = rms;
    if (rec.calib) { rec.calib.push(rms); }
    // بوابة ناعمة: الصوت أعلى من دوشة المكان → مفتوحة. سكوت أطول من «hold» → بتوطّي الدوشة لحد floor بس
    let target = 1;
    const now = ev.playbackTime * 1000;
    if (m.gate) {
      const th = rec.floor * m.gate;
      if (rms >= th) lastLoud = now;
      if (now - lastLoud > m.hold) target = Math.max(m.floor, Math.min(1, Math.pow(rms / th, 1.5)));
    }
    for (let i = 0; i < inp.length; i++) {
      env += (target - env) * (target > env ? attack : release);
      out[i] = inp[i] * env;
    }
    rec.gateOpen = env;
    if (rec.recording) rec.chunks.push(new Float32Array(out));
  };
  node.connect(proc); node = proc;
  const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute); mute.connect(ctx.destination);
  rec.nodes = { src, proc, mute };
}
function recStop() {
  if (rec.nodes) { try { rec.nodes.src.disconnect(); rec.nodes.proc.disconnect(); rec.nodes.proc.onaudioprocess = null; } catch (_) { /* ignore */ } }
  if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
  if (rec.ctx) rec.ctx.close().catch(() => {});
  rec.stream = rec.ctx = rec.nodes = null; rec.recording = false;
}
// قياس دوشة الأوضة: ثانيتين سكوت
function recCalibrate(ms = 1800) {
  rec.calib = [];
  return new Promise(res => setTimeout(() => {
    const v = (rec.calib || []).slice().sort((a, b) => a - b);
    rec.calib = null;
    if (v.length) rec.floor = Math.max(0.0015, Math.min(0.05, v[Math.floor(v.length * 0.6)]));
    res(rec.floor);
  }, ms));
}
// WAV 16-bit مع تطبيع خفيف للمستوى (أعلى قمة -1 ديسيبل)
function recWav(chunks, rate) {
  let n = 0; for (const c of chunks) n += c.length;
  let peak = 0; for (const c of chunks) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  const gain = peak > 0.001 ? Math.min(6, 0.89 / peak) : 1;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, c[i] * gain)); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Uint8Array(buf);
}
const recFmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

panels.recorder = async (body) => {
  body.innerHTML = '';
  const alive = () => body.isConnected && state.panel === 'recorder' && !$('#panel').classList.contains('hidden');
  const status = el('div', { class: 'rec-status' }, 'بيجهّز المايك...');
  const meter = el('div', { class: 'rec-meter' }, el('i'));
  const gateDot = el('span', { class: 'rec-gate', title: 'أخضر = صوتك بيتسجل، رمادي = سكوت/دوشة بتتكتم' });
  const time = el('b', { class: 'rec-time' }, '00:00');
  const micSel = el('select', { class: 'rec-sel' });
  const modeSel = el('select', { class: 'rec-sel' }, ...Object.entries(REC_MODES).map(([k, m]) => el('option', { value: k, ...(k === rec.mode ? { selected: '' } : {}) }, m.name)));
  const strength = el('input', { type: 'range', min: '0', max: '6', step: '0.2', value: String(REC_MODES[rec.mode].gate) });
  const recBtn = el('button', { class: 'primary rec-btn' }, '● تسجيل');
  const calBtn = el('button', {}, '🔇 قيس دوشة المكان');
  const result = el('div', { class: 'rec-result hidden' });
  body.append(
    el('p', { class: 'rec-intro' }, 'سجّل قرآن أو غنا أو فويس بصوت نقي: المتصفح بيشيل الوش ودوشة المراوح والتكييف، وبيكتم الأصوات البعيدة اللي أوطى من صوتك. قرّب من المايك (شبر تقريبًا) علشان صوتك يبقى أعلى من أي حد جنبك.'),
    el('label', { class: 'rec-row' }, 'المايك', micSel),
    el('label', { class: 'rec-row' }, 'نوع التسجيل', modeSel),
    el('label', { class: 'rec-row' }, 'قوة كتم الدوشة', strength),
    el('div', { class: 'rec-live' }, gateDot, meter, time),
    status,
    el('div', { class: 'rec-actions' }, recBtn, calBtn),
    result);

  const fillMics = async () => {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    micSel.innerHTML = '';
    micSel.append(el('option', { value: '' }, 'المايك الافتراضي'), ...devs.filter(d => d.deviceId && d.deviceId !== 'default').map(d => el('option', { value: d.deviceId, ...(d.deviceId === rec.deviceId ? { selected: '' } : {}) }, d.label || 'مايك')));
  };
  const restart = async () => {
    try {
      await recStart();
      await fillMics();
      status.textContent = 'اسكت ثانيتين... بنقيس دوشة المكان';
      await recCalibrate();
      if (alive()) status.textContent = 'جاهز. دوس «تسجيل» وابدأ.';
    } catch (e) {
      status.textContent = 'مش قادر يوصل للمايك: اتأكد إن المايك متوصل ومسموح في إعدادات ويندوز (الخصوصية ← الميكروفون).';
    }
  };
  micSel.addEventListener('change', () => { rec.deviceId = micSel.value; try { localStorage.setItem('recMic', rec.deviceId); } catch (_) { /* ignore */ } restart(); });
  modeSel.addEventListener('change', () => {
    rec.mode = modeSel.value; strength.value = String(REC_MODES[rec.mode].gate);
    try { localStorage.setItem('recMode', rec.mode); } catch (_) { /* ignore */ }
    restart();
  });
  strength.addEventListener('input', () => { REC_MODES[rec.mode].gate = +strength.value; });
  calBtn.addEventListener('click', async () => { status.textContent = 'اسكت ثانيتين...'; await recCalibrate(); status.textContent = 'تمام، اتقاست دوشة المكان.'; });

  recBtn.addEventListener('click', async () => {
    if (!rec.stream) await restart();
    if (!rec.recording) {
      rec.chunks = []; rec.recording = true; rec.startAt = Date.now();
      recBtn.textContent = '■ إيقاف'; recBtn.classList.add('on');
      result.classList.add('hidden');
      status.textContent = 'بيسجّل...';
      return;
    }
    rec.recording = false;
    recBtn.textContent = '● تسجيل'; recBtn.classList.remove('on');
    const rate = rec.ctx ? rec.ctx.sampleRate : 48000;
    rec.wav = recWav(rec.chunks, rate); rec.chunks = [];
    const url = URL.createObjectURL(new Blob([rec.wav], { type: 'audio/wav' }));
    const name = 'تسجيل ' + new Date().toLocaleString('ar-EG').replace(/[\\/:]/g, '-');
    const save = (format) => async () => {
      status.textContent = format === 'mp3' ? 'بيحوّل لـ MP3...' : 'بيحفظ...';
      const r = await api.saveRecording({ data: rec.wav, name, format });
      status.textContent = r && r.ok ? `اتحفظ: ${r.path}` : ('ماتحفظش: ' + ((r && r.error) || ''));
      if (r && r.ok) toast('اتحفظ التسجيل في التنزيلات');
    };
    result.innerHTML = '';
    result.append(el('audio', { controls: '', src: url }),
      el('div', { class: 'rec-actions' },
        el('button', { class: 'primary', onclick: save('mp3') }, '⬇ حفظ MP3'),
        el('button', { onclick: save('wav') }, '⬇ حفظ WAV (أعلى جودة)')));
    result.classList.remove('hidden');
    status.textContent = 'اسمع التسجيل واحفظه.';
  });

  const tick = () => {
    if (!alive()) { recStop(); return; }
    const db = rec.level > 0 ? 20 * Math.log10(rec.level) : -90;
    meter.firstChild.style.width = Math.max(0, Math.min(100, (db + 60) * 1.7)) + '%';
    gateDot.classList.toggle('open', rec.gateOpen > 0.5);
    if (rec.recording) time.textContent = recFmt((Date.now() - rec.startAt) / 1000);
    requestAnimationFrame(tick);
  };
  await restart();
  requestAnimationFrame(tick);
};
panelTitles.recorder = 'مسجّل الصوت النقي';
Object.assign(commands, { 'voice-recorder': () => openPanel('recorder') });
