import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customerApi } from '../api/customerClient';

// ── Mobile breakpoint hook ────────────────────────────────────────────────────
function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return m;
}

// ── Light theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:           '#f5f5f7',
  white:        '#ffffff',
  border:       '#e5e7eb',
  text:         '#111827',
  muted:        '#6b7280',
  accent:       '#6c63ff',
  accentBg:     'rgba(108,99,255,.08)',
  accentBorder: 'rgba(108,99,255,.25)',
};

const INSTRUCTIONS_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

const SAMPLE_TEXT = `Once upon a time, in a land full of stories and wonder, a child opened a magical book that could speak in any voice — even yours.`;

// ── Shared style helpers ──────────────────────────────────────────────────────
const fullscreen = {
  minHeight: '100vh', background: T.bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: T.text,
};

const sw = (m) => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: m ? '70px 16px 108px' : '80px 24px 72px',
  width: '100%', maxWidth: 760,
});

const hd = (m) => ({
  fontSize: m ? 26 : 34, fontWeight: 800, color: T.text,
  letterSpacing: m ? -.5 : -.8, margin: '0 0 10px', textAlign: 'center',
});

const sb = (m) => ({
  fontSize: m ? 14 : 16, color: T.muted, margin: m ? '0 0 20px' : '0 0 32px',
  textAlign: 'center', maxWidth: 500, lineHeight: 1.6,
});

// ── Sub-components ────────────────────────────────────────────────────────────

function StepPill({ children }) {
  return (
    <div style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: .8,
      textTransform: 'uppercase', color: T.accent,
      background: T.accentBg, border: `1px solid ${T.accentBorder}`,
      borderRadius: 20, padding: '4px 12px', marginBottom: 16,
    }}>{children}</div>
  );
}

function StepDots({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 7, height: 7, borderRadius: 4,
          background: i === current ? T.accent : T.border,
          transition: 'all .25s',
        }} />
      ))}
    </div>
  );
}

// NavRow: fixed thumb-zone bar on mobile, inline on desktop
function NavRow({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false }) {
  const m = useIsMobile();

  const backStyle = {
    padding: m ? '15px 0' : '12px 28px',
    flex: m ? 1 : 'none',
    borderRadius: 10, border: `1.5px solid ${T.border}`,
    background: T.white, color: T.text, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', minHeight: 50,
  };
  const nextStyle = {
    padding: m ? '15px 0' : '12px 32px',
    flex: m ? (onBack ? 2 : 1) : 'none',
    borderRadius: 10, border: 'none',
    background: nextDisabled ? '#d1d5db' : T.accent,
    color: nextDisabled ? '#9ca3af' : '#fff',
    fontSize: 15, fontWeight: 700,
    cursor: nextDisabled ? 'not-allowed' : 'pointer',
    boxShadow: nextDisabled ? 'none' : '0 2px 10px rgba(108,99,255,.3)',
    minHeight: 50,
  };

  if (m) {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
        background: T.white, borderTop: `1px solid ${T.border}`,
        padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 10,
        boxShadow: '0 -2px 12px rgba(0,0,0,.06)',
      }}>
        {onBack && <button onClick={onBack} style={backStyle}>← Back</button>}
        <button onClick={onNext} disabled={nextDisabled} style={nextStyle}>{nextLabel}</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
      {onBack && (
        <button onClick={onBack} style={{ ...backStyle, flex: 'none' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
        >← Back</button>
      )}
      <button onClick={onNext} disabled={nextDisabled} style={{ ...nextStyle, flex: 'none' }}
        onMouseEnter={e => { if (!nextDisabled) e.currentTarget.style.background = '#5b52e0'; }}
        onMouseLeave={e => { if (!nextDisabled) e.currentTarget.style.background = T.accent; }}
      >{nextLabel}</button>
    </div>
  );
}

function VideoBox({ children }) {
  return (
    <div style={{
      width: '100%', aspectRatio: '16/9',
      background: T.white, borderRadius: 14,
      border: `1px solid ${T.border}`,
      boxShadow: '0 2px 12px rgba(0,0,0,.06)',
      overflow: 'hidden', marginBottom: 32,
    }}>{children}</div>
  );
}

function recBtnStyle(bg) {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 32px', borderRadius: 10, border: 'none',
    background: bg, color: '#fff', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', transition: 'background .15s',
    boxShadow: `0 2px 10px ${bg}55`,
  };
}

// ── WAV encoder ──────────────────────────────────────────────────────────────
// MediaRecorder blobs (webm/ogg) lack seek tables, causing replay delays.
// Re-encoding as WAV (raw PCM + header) gives instant seeking on every replay.
function encodeWav(audioBuf) {
  const numCh   = audioBuf.numberOfChannels;
  const sr      = audioBuf.sampleRate;
  const len     = audioBuf.length;
  const pcmLen  = len * numCh;
  const buf     = new ArrayBuffer(44 + pcmLen * 2);
  const view    = new DataView(buf);

  function str(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
  str(0, 'RIFF'); view.setUint32(4,  36 + pcmLen * 2, true);
  str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true);           // PCM chunk size
  view.setUint16(20, 1,  true);           // PCM format
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr,    true);
  view.setUint32(28, sr * numCh * 2, true); // byte rate
  view.setUint16(32, numCh * 2, true);    // block align
  view.setUint16(34, 16, true);           // bits per sample
  str(36, 'data'); view.setUint32(40, pcmLen * 2, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = audioBuf.getChannelData(ch)[i];
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

async function toWavUrl(rawBlob) {
  const arrayBuf = await rawBlob.arrayBuffer();
  const ctx      = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();
  return URL.createObjectURL(encodeWav(audioBuf));
}

// ── Shared recording hook ─────────────────────────────────────────────────────
function useRecorder() {
  const [state,    setState]    = useState('idle'); // idle | recording | recorded
  const [audioUrl, setAudioUrl] = useState(null);
  const [blob,     setBlob]     = useState(null);
  const [duration, setDuration] = useState(0);
  const [permErr,  setPermErr]  = useState('');
  const [analyser, setAnalyser] = useState(null);
  const mr       = useRef(null);
  const chunks   = useRef([]);
  const timerRef = useRef(null);
  const audioCtx = useRef(null);

  useEffect(() => {
    if (state === 'recording') {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [state]);

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null); setBlob(null); setState('idle'); setDuration(0);
  }

  async function start() {
    setPermErr('');
    try {
      // Browser-level noise suppression + echo cancellation; AGC off (we apply our own compression)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: false },
      });

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);

      // ── Enhancement chain ────────────────────────────────────────────────────
      // 1. High-pass filter — cut mic rumble / low-freq hum below 80 Hz
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 80;
      hp.Q.value = 0.7;

      // 2. Presence boost — +3 dB at 3 kHz for voice clarity / intelligibility
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 3000;
      presence.gain.value = 3;
      presence.Q.value = 1;

      // 3. Dynamics compressor — even out volume, tame peaks, lift quiet parts
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 6;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;

      // 4. Analyser — taps after full chain for accurate waveform visualisation
      const node = ctx.createAnalyser();
      node.fftSize = 1024;

      // 5. MediaStreamDestination — MediaRecorder captures the processed signal
      const dest = ctx.createMediaStreamDestination();

      // src → hp → presence → comp → analyser → dest
      src.connect(hp);
      hp.connect(presence);
      presence.connect(comp);
      comp.connect(node);
      node.connect(dest);

      audioCtx.current = ctx;
      setAnalyser(node);

      chunks.current = [];
      // Pick the best supported MIME type (Safari doesn't support webm)
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = mimeType
        ? new MediaRecorder(dest.stream, { mimeType })
        : new MediaRecorder(dest.stream);
      mr.current = rec;
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        audioCtx.current?.close();
        audioCtx.current = null;
        setAnalyser(null);
        const rawBlob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        setBlob(rawBlob); // keep compressed for upload
        // Re-encode as WAV for instant, delay-free replay
        try {
          const wavUrl = await toWavUrl(rawBlob);
          setAudioUrl(wavUrl);
        } catch {
          setAudioUrl(URL.createObjectURL(rawBlob)); // fallback
        }
        setState('recorded');
      };
      rec.start();
      setState('recording');
    } catch {
      setPermErr('Microphone access denied. Please allow microphone access in your browser settings.');
    }
  }

  function stop() { mr.current?.stop(); }

  function fmt(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return { state, audioUrl, blob, duration, permErr, start, stop, reset, fmt, analyser };
}

// ── Waveform visualizer ───────────────────────────────────────────────────────
function WaveformVisualizer({ analyser }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!analyser) {
      // Draw a flat centre line when idle
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(108,99,255,.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      return;
    }

    const bufLen  = analyser.frequencyBinCount;
    const data    = new Uint8Array(bufLen);
    const W       = canvas.width;
    const H       = canvas.height;
    const sliceW  = W / bufLen;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);

      ctx.clearRect(0, 0, W, H);

      // Filled mirror waveform
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0 - 1; // -1 … 1
        ctx.lineTo(i * sliceW, H / 2 + v * H / 2);
      }
      ctx.lineTo(W, H / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(108,99,255,.12)';
      ctx.fill();

      // Waveform line
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6c63ff';
      ctx.lineJoin = 'round';
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0 - 1;
        const y = H / 2 + v * H / 2;
        i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sliceW, y);
      }
      ctx.stroke();

      // Centre line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(108,99,255,.18)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return (
    <div style={{
      width: '100%', maxWidth: 560, borderRadius: 12, overflow: 'hidden',
      background: T.white, border: `1px solid ${T.accentBorder}`,
      boxShadow: '0 2px 8px rgba(108,99,255,.1)',
    }}>
      <canvas
        ref={canvasRef}
        width={560} height={80}
        style={{ display: 'block', width: '100%', height: 80 }}
      />
    </div>
  );
}

// ── Screen 1: Book Preview ────────────────────────────────────────────────────
function BookPreviewScreen({ book, onNext }) {
  const m = useIsMobile();
  return (
    <div style={sw(m)}>
      <StepPill>Step 1 of 4</StepPill>
      <h1 style={hd(m)}>Your Book Preview</h1>
      <p style={sb(m)}>Watch a preview of <strong style={{ color: T.text }}>{book.title}</strong> before adding your voice.</p>

      <VideoBox>
        {book.preview_video_url ? (
          <video src={book.preview_video_url} controls autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: 48, opacity: .2 }}>◈</div>
            <div style={{ fontSize: 13, color: T.muted }}>No preview video uploaded yet.</div>
          </div>
        )}
      </VideoBox>

      <StepDots current={0} total={4} />
      <NavRow onNext={onNext} nextLabel="Continue →" />
    </div>
  );
}

// ── Screen 2: Instructions ────────────────────────────────────────────────────
function InstructionsScreen({ onBack, onNext }) {
  const m = useIsMobile();
  return (
    <div style={sw(m)}>
      <StepPill>Step 2 of 4</StepPill>
      <h1 style={hd(m)}>How to Record</h1>
      <p style={sb(m)}>Watch this short guide before you start recording your voice.</p>

      <VideoBox>
        <video src={INSTRUCTIONS_VIDEO_URL} controls autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </VideoBox>

      <StepDots current={1} total={4} />
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Practice First →" />
    </div>
  );
}

// ── FFT (Cooley-Tukey, in-place, power-of-2) ─────────────────────────────────
function fft(re, im) {
  const n = re.length;
  // Bit-reversal
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len >> 1; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + (len >> 1)] * curRe - im[i + k + (len >> 1)] * curIm;
        const vIm = re[i + k + (len >> 1)] * curIm + im[i + k + (len >> 1)] * curRe;
        re[i + k] = uRe + vRe;           im[i + k] = uIm + vIm;
        re[i + k + (len >> 1)] = uRe - vRe; im[i + k + (len >> 1)] = uIm - vIm;
        const tmp = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe; curRe = tmp;
      }
    }
  }
}

// ── Spectral flatness over energy-active windows ──────────────────────────────
// Returns 0 (tonal/voice) → 1 (flat/noise).
// Only considers bins above 1% of each window's peak magnitude, so near-zero
// bins don't collapse the geometric mean to ~0 for every signal.
function spectralFlatness(samples, fftSize = 2048) {
  const hop = fftSize >> 1;
  const flatnesses = [];
  for (let start = 0; start + fftSize <= samples.length; start += hop) {
    // Skip silent windows
    let rms = 0;
    for (let i = start; i < start + fftSize; i++) rms += samples[i] * samples[i];
    if (Math.sqrt(rms / fftSize) < 0.001) continue;

    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[start + i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }
    fft(re, im);

    const half = fftSize >> 1;
    const mags = new Float32Array(half);
    let maxMag = 0;
    for (let i = 1; i < half; i++) {
      mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      if (mags[i] > maxMag) maxMag = mags[i];
    }

    // Only compute over bins with meaningful energy (> 1% of peak)
    const thr = maxMag * 0.01;
    let logSum = 0, linSum = 0, count = 0;
    for (let i = 1; i < half; i++) {
      if (mags[i] > thr) { logSum += Math.log(mags[i]); linSum += mags[i]; count++; }
    }
    if (count < 10) continue;
    flatnesses.push(Math.exp(logSum / count) / (linSum / count));
  }
  if (!flatnesses.length) return 0;
  flatnesses.sort((a, b) => a - b);
  return flatnesses[Math.floor(flatnesses.length / 2)];
}

// ── Energy-gated zero crossing rate ──────────────────────────────────────────
// Only measures ZCR in windows above energy threshold so mic self-noise in
// silence doesn't produce spurious high readings.
// Voice: ~200–800/s on active frames. Static/noise: typically > 3000/s.
function energyGatedZCR(samples, sampleRate, maxRms) {
  const winSize = 1024;
  const threshold = Math.max(maxRms * 0.15, 0.005);
  let totalZcr = 0, frames = 0;
  for (let start = 0; start + winSize <= samples.length; start += winSize) {
    let sum = 0, crossings = 0;
    for (let i = start; i < start + winSize; i++) {
      sum += samples[i] * samples[i];
      if (i > start && (samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
    }
    if (Math.sqrt(sum / winSize) < threshold) continue;
    totalZcr += (crossings * sampleRate) / winSize;
    frames++;
  }
  return frames > 0 ? totalZcr / frames : 0;
}

// ── Audio quality analysis ────────────────────────────────────────────────────
async function analyzeAudio(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try { audioBuffer = await ctx.decodeAudioData(arrayBuffer); }
  finally { ctx.close(); }

  const data       = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const winSize    = Math.floor(sampleRate * 0.05); // 50 ms windows

  // Per-window RMS
  const rmsValues = [];
  for (let i = 0; i < data.length; i += winSize) {
    const end = Math.min(i + winSize, data.length);
    let sum = 0;
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    rmsValues.push(Math.sqrt(sum / (end - i)));
  }

  const sorted = [...rmsValues].sort((a, b) => a - b);
  const n = sorted.length;
  const noiseFloor = sorted[Math.floor(n * 0.10)] || 0;
  const speechRms  = sorted[Math.floor(n * 0.85)] || 0;
  const maxRms     = sorted[n - 1] || 0;

  // Peak amplitude and clipping ratio (fraction of samples above 0.99)
  let peak = 0, clippedSamples = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (a > 0.99) clippedSamples++;
  }
  const clippingRatio = clippedSamples / data.length;

  // Voice activity ratio
  const voiceThreshold = Math.max(noiseFloor * 1.5, maxRms * 0.15, 0.0005);
  const voiceRatio = rmsValues.filter(r => r > voiceThreshold).length / n;

  // Voice vs noise detection
  const flatness = spectralFlatness(data);              // 0=tonal/voice, 1=flat/noise
  const zcr      = energyGatedZCR(data, sampleRate, maxRms); // active-frame ZCR only

  const toDb = v => 20 * Math.log10(Math.max(v, 1e-6));

  return {
    peak, clippingRatio, maxRms, noiseFloor,
    noiseDb:  toDb(noiseFloor),
    speechDb: toDb(speechRms),
    snr:      toDb(speechRms) - toDb(noiseFloor),
    voiceRatio,
    flatness,
    zcr,
    duration: audioBuffer.duration,
  };
}

function buildFeedback(a) {
  const items = [];

  // Gate everything on having meaningful audio. Below -50 dB speech level is
  // essentially silence — no point running volume or noise checks.
  if (a.speechDb < -50) {
    items.push({ level: 'error', icon: '🎤', msg: 'No voice detected. Check your microphone settings.' });
    return { grade: 'poor', items };
  }

  // Noise/static detection: high spectral flatness = flat spectrum = noise.
  // ZCR > 2000/s = too many zero crossings for speech. Either alone is a signal;
  // together they're definitive.
  // Calibrated thresholds:
  //   normal voice: flatness ~0.41, zcr ~1100
  //   loud voice:   flatness ~0.49, zcr ~2200
  //   static noise: flatness ~0.59, zcr ~8800
  const looksLikeNoise = a.flatness > 0.54 || (a.flatness > 0.50 && a.zcr > 5000);

  if (looksLikeNoise) {
    items.push({ level: 'error', icon: '🌫', msg: 'Sounds like noise, not voice. Check your microphone.' });
  } else {
    if (a.clippingRatio > 0.001)
      items.push({ level: 'error', icon: '🎙', msg: 'Move back from the mic.' });

    if (a.speechDb < -26)
      items.push({ level: 'error', icon: '🔈', msg: 'Too quiet. Move closer to the microphone.' });
    else if (a.speechDb < -20)
      items.push({ level: 'warn', icon: '🔈', msg: 'A bit quiet. Speak up a little.' });
    else if (a.speechDb > -8 && a.clippingRatio <= 0.001)
      items.push({ level: 'warn', icon: '🔊', msg: 'Too loud. Speak more softly.' });

    if (a.snr < 10)
      items.push({ level: 'error', icon: '🌫', msg: 'Too much noise. Find a quieter spot.' });
    else if (a.snr < 20)
      items.push({ level: 'warn', icon: '🌫', msg: 'Background noise detected. Find a quieter spot.' });
  }

  const hasError = items.some(i => i.level === 'error');
  if (!items.length) return { grade: 'good', items };
  if (hasError)      return { grade: 'poor', items };
  return               { grade: 'ok',   items };
}

const GRADE_STYLE = {
  good: { bg: '#f0fdf4', border: '#bbf7d0', headerText: '#15803d', icon: '✓', label: 'Sounds great — ready to record!' },
  ok:   { bg: '#fffbeb', border: '#fde68a', headerText: '#92400e', icon: '⚠', label: 'Usable, but a few tweaks will help.' },
  poor: { bg: '#fef2f2', border: '#fecaca', headerText: '#dc2626', icon: '✗', label: 'Fix the issues below before recording.' },
};

// ── Screen 3: Recording Test ──────────────────────────────────────────────────
function RecordingTestScreen({ onBack, onNext }) {
  const m = useIsMobile();
  const rec = useRecorder();
  const [analyzing, setAnalyzing] = useState(false);
  const [feedback,  setFeedback]  = useState(null);
  useEffect(() => {
    if (!rec.blob) { setFeedback(null); return; }
    setAnalyzing(true);
    analyzeAudio(rec.blob)
      .then(a  => setFeedback(buildFeedback(a)))
      .catch(() => setFeedback(null))
      .finally(() => setAnalyzing(false));
  }, [rec.blob]);

  const grade = feedback ? GRADE_STYLE[feedback.grade] : null;

  return (
    <div style={sw(m)}>
      <StepPill>Step 3 of 4</StepPill>
      <h1 style={hd(m)}>Practice Recording</h1>
      <p style={sb(m)}>Read the text aloud. We'll check your audio quality automatically.</p>

      <div style={{
        background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: m ? '20px' : '28px 36px', maxWidth: 660, width: '100%',
        lineHeight: 2.0, fontSize: m ? 18 : 22, color: T.text,
        fontFamily: "'Lexend', sans-serif", whiteSpace: 'pre-line',
        textAlign: 'left', marginBottom: m ? 20 : 28,
        boxShadow: '0 2px 12px rgba(0,0,0,.05)',
      }}>{SAMPLE_TEXT}</div>

      {rec.permErr && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{rec.permErr}</div>
      )}

      {/* Content area — waveform / playback / feedback (no buttons here) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', maxWidth: 560 }}>

        {rec.state === 'recording' && (
          <>
            <WaveformVisualizer analyser={rec.analyser} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444',
                animation: 'recPulse 1s ease-in-out infinite' }} />
              <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: T.text }}>
                {rec.fmt(rec.duration)}
              </span>
            </div>
          </>
        )}

        {rec.state === 'recorded' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <audio src={rec.audioUrl} controls preload="auto" style={{ width: '100%', borderRadius: 8 }} />

            {analyzing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
                background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
                fontSize: 14, color: T.muted }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${T.accent}`,
                  borderTopColor: 'transparent', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
                Analysing your audio…
              </div>
            )}

            {!analyzing && feedback && grade && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', borderRadius: 10,
                  background: grade.bg, border: `1px solid ${grade.border}`,
                }}>
                  <span style={{ fontSize: 18 }}>{grade.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: grade.headerText }}>{grade.label}</span>
                </div>
                {feedback.items.map((item, i) => {
                  const isErr = item.level === 'error';
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 10, background: T.white,
                      border: `1px solid ${isErr ? '#fca5a5' : '#fde68a'}`,
                      borderLeft: `4px solid ${isErr ? '#ef4444' : '#f59e0b'}`,
                    }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{item.msg}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>


<div style={{ marginTop: 32 }}><StepDots current={2} total={4} /></div>

      {/* Three-button row: Back | Action | Next */}
      <div style={{
        display: 'flex', gap: 12, width: '100%', maxWidth: 560, marginTop: 16,
      }}>
        {/* Back */}
        <button onClick={onBack} disabled={rec.state === 'recording'} style={{
          flex: 1, padding: '13px 0', borderRadius: 10,
          border: `1.5px solid ${T.border}`, background: T.white,
          color: rec.state === 'recording' ? T.muted : T.text,
          fontSize: 15, fontWeight: 600, cursor: rec.state === 'recording' ? 'default' : 'pointer',
        }}>← Back</button>

        {/* Centre action */}
        {rec.state === 'idle' && (
          <button onClick={rec.start} style={{
            flex: 2, padding: '13px 0', borderRadius: 10, border: 'none',
            background: T.accent, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#5b52e0'}
            onMouseLeave={e => e.currentTarget.style.background = T.accent}
          ><span>🎙</span> Practice Recording</button>
        )}
        {rec.state === 'recording' && (
          <button onClick={rec.stop} style={{
            flex: 2, padding: '13px 0', borderRadius: 10, border: 'none',
            background: '#ef4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
            onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
          >■ Stop</button>
        )}
        {rec.state === 'recorded' && (
          <button onClick={() => { rec.reset(); setFeedback(null); }} style={{
            flex: 2, padding: '13px 0', borderRadius: 10,
            border: `1.5px solid ${T.border}`, background: T.white,
            color: T.text, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>↻ Try Again</button>
        )}

        {/* Next */}
        {(() => {
          const disabled = rec.state === 'recording' || (rec.state === 'recorded' && (!feedback || feedback.grade === 'poor'));
          const isPurple = rec.state === 'recorded' && feedback && feedback.grade !== 'poor';
          return (
            <button onClick={disabled ? undefined : onNext} style={{
              flex: 1, padding: '13px 0', borderRadius: 10,
              border: isPurple ? 'none' : `1.5px solid ${T.border}`,
              background: disabled ? '#d1d5db' : isPurple ? T.accent : T.white,
              color: disabled ? '#9ca3af' : isPurple ? '#fff' : T.text,
              fontSize: 15, fontWeight: 700,
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: isPurple ? '0 2px 10px rgba(108,99,255,.3)' : 'none',
            }}>Next →</button>
          );
        })()}
      </div>

      <style>{`
        @keyframes recPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Screen 4: Record Audio (page by page) ─────────────────────────────────────
function RecordAudioScreen({ slug, orderItemId, onBack }) {
  const m        = useIsMobile();
  const navigate = useNavigate();
  const [pages,       setPages]       = useState([]);
  const [saved,       setSaved]       = useState({}); // pageId → { url, duration_sec }
  const [loading,     setLoading]     = useState(true);
  const [pageIdx,     setPageIdx]     = useState(0);
  const [uploading,   setUploading]   = useState(false);
  const [uploadErr,   setUploadErr]   = useState('');
  const rec = useRecorder();

  // Fetch pages + existing recordings
  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/public/books/${slug}/read-aloud`).then(r => r.json()),
      customerApi.get(`/recordings/${orderItemId}`).catch(() => []),
    ]).then(([bookData, recs]) => {
      setPages(bookData.pages || []);
      const map = {};
      recs.forEach(r => { map[r.page_id] = r; });
      setSaved(map);
    }).finally(() => setLoading(false));
  }, [slug, orderItemId]);

  // Reset recorder when page changes
  useEffect(() => {
    rec.reset();
  }, [pageIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPage  = pages[pageIdx];
  const isLastPage   = pageIdx === pages.length - 1;
  const savedCount   = Object.keys(saved).length;
  const allDone      = pages.length > 0 && savedCount >= pages.length;

  async function saveRecording(andAdvance) {
    if (!rec.blob || !currentPage) return;
    setUploadErr('');
    setUploading(true);
    const fd = new FormData();
    fd.append('audio', rec.blob, 'recording.webm');
    fd.append('duration_sec', String(Math.round(rec.duration)));
    try {
      const result = await customerApi.post(
        `/recordings/${orderItemId}/pages/${currentPage.id}`,
        fd
      );
      setSaved(s => ({ ...s, [currentPage.id]: result }));
      rec.reset();
      if (andAdvance && !isLastPage) setPageIdx(i => i + 1);
    } catch (err) {
      setUploadErr('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  function goFinish() {
    // Mark order item as personalized, then go to orders
    customerApi.patch(`/order-items/${orderItemId}/advance`, {})
      .catch(() => {})
      .finally(() => navigate('/account/orders'));
  }

  if (loading) return (
    <div style={screenWrap}>
      <div style={{ color: T.muted, fontSize: 14, marginTop: 40 }}>Loading pages…</div>
    </div>
  );

  if (!pages.length) return (
    <div style={screenWrap}>
      <div style={{ color: T.muted, fontSize: 14, marginTop: 40 }}>No pages found for this book.</div>
    </div>
  );

  const existingSave = saved[currentPage?.id];

  // Derive button states
  const isRecording = rec.state === 'recording';
  const isRecorded  = rec.state === 'recorded';
  const isIdle      = rec.state === 'idle';

  // Center (Record) button
  let recLabel, recFn, recBg, recColor, recBorder;
  if (isRecording) {
    recLabel = '■ Stop'; recFn = rec.stop;
    recBg = '#ef4444'; recColor = '#fff'; recBorder = 'none';
  } else if (isRecorded || (isIdle && existingSave)) {
    recLabel = '↻ Re-record'; recFn = rec.start;
    recBg = T.white; recColor = T.text; recBorder = `1.5px solid ${T.border}`;
  } else {
    recLabel = '🎙 Record'; recFn = rec.start;
    recBg = T.accent; recColor = '#fff'; recBorder = 'none';
  }

  // Next button
  let nextLabel, nextFn, nextDisabled = false;
  if (isRecorded) {
    nextLabel = uploading ? 'Saving…' : isLastPage ? 'Save & Finish ✓' : 'Save & Next →';
    nextFn = () => saveRecording(!isLastPage);
    nextDisabled = uploading;
  } else if (isIdle && existingSave && !isLastPage) {
    nextLabel = 'Next →'; nextFn = () => setPageIdx(i => i + 1);
  } else if (isIdle && existingSave && isLastPage) {
    nextLabel = 'Finish ✓'; nextFn = goFinish;
  } else {
    nextLabel = 'Next →'; nextFn = null; nextDisabled = true;
  }

  // Playback audio — fresh recording takes priority over saved
  const playbackUrl = isRecorded ? rec.audioUrl : (isIdle && existingSave ? existingSave.url : null);

  const backLabel = pageIdx === 0 ? '← Practice' : '← Previous';
  const backFn    = pageIdx === 0 ? onBack : () => { rec.reset(); setPageIdx(i => i - 1); };

  return (
    <div style={sw(m)}>
      <StepPill>Step 4 of 4</StepPill>
      <h1 style={hd(m)}>Record Your Voice</h1>
      <p style={sb(m)}>Read and record each page. You can re-record any page before finishing.</p>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 660, marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: T.muted }}>Page {pageIdx + 1} of {pages.length}</span>
          <span style={{ color: T.accent, fontWeight: 700 }}>{savedCount} / {pages.length} recorded</span>
        </div>
        {/* Segmented progress bar */}
        <div style={{ display: 'flex', gap: 3 }}>
          {pages.map((p, i) => (
            <div key={p.id} onClick={() => { rec.reset(); setPageIdx(i); }}
              title={`Page ${i + 1}${saved[p.id] ? ' ✓' : ''}`}
              style={{
                flex: 1, height: 6, borderRadius: 3, cursor: 'pointer',
                background: saved[p.id] ? T.accent
                          : i === pageIdx ? 'rgba(108,99,255,.35)'
                          : T.border,
                transition: 'background .2s',
              }} />
          ))}
        </div>
      </div>

      {/* Page text */}
      <div style={{
        background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: m ? '18px 20px' : '28px 36px', width: '100%', maxWidth: 660,
        boxShadow: '0 2px 12px rgba(0,0,0,.05)', marginBottom: m ? 16 : 24,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: .8,
          textTransform: 'uppercase', marginBottom: m ? 12 : 16 }}>
          Page {pageIdx + 1}
        </div>
        <div style={{
          fontFamily: "'Lexend', sans-serif", fontSize: m ? 18 : 22, lineHeight: 2.0,
          color: currentPage?.read_aloud_text ? T.text : T.muted,
          fontStyle: currentPage?.read_aloud_text ? 'normal' : 'italic',
          whiteSpace: 'pre-wrap',
        }}>
          {currentPage?.read_aloud_text || 'No text has been added for this page yet.'}
        </div>
      </div>

      {/* Reference audio */}
      {currentPage?.read_aloud_audio && (
        <div style={{
          width: '100%', maxWidth: 660, marginBottom: 24,
          background: T.white, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 10 }}>
            Listen to this audio and use it as your guide.
          </div>
          <audio src={`/uploads/${currentPage.read_aloud_audio}`} controls
            style={{ width: '100%', borderRadius: 8 }} />
        </div>
      )}

      {/* Waveform while recording */}
      {isRecording && (
        <div style={{ width: '100%', maxWidth: 660, marginBottom: 16 }}>
          <WaveformVisualizer analyser={rec.analyser} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444',
              animation: 'recPulse 1s ease-in-out infinite' }} />
            <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: T.text }}>
              {rec.fmt(rec.duration)}
            </span>
          </div>
        </div>
      )}

      {/* Three-button row: Back | Record | Next */}
      {rec.permErr && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8, width: '100%', maxWidth: 660 }}>{rec.permErr}</div>
      )}
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 660, marginBottom: 24 }}>
        <button onClick={isRecording ? undefined : backFn} disabled={isRecording} style={{
          flex: 1, padding: '13px 0', borderRadius: 10,
          border: `1.5px solid ${T.border}`, background: T.white,
          color: isRecording ? T.muted : T.text,
          fontSize: 15, fontWeight: 600, cursor: isRecording ? 'default' : 'pointer',
        }}>{backLabel}</button>

        <button onClick={recFn} style={{
          flex: 2, padding: '13px 0', borderRadius: 10,
          border: recBorder, background: recBg, color: recColor,
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>{recLabel}</button>

        <button onClick={nextDisabled || !nextFn ? undefined : nextFn}
          disabled={nextDisabled || !nextFn} style={{
          flex: 1, padding: '13px 0', borderRadius: 10, border: 'none',
          background: nextDisabled || !nextFn ? '#d1d5db' : T.accent,
          color: nextDisabled || !nextFn ? '#9ca3af' : '#fff',
          fontSize: 15, fontWeight: 700,
          cursor: nextDisabled || !nextFn ? 'not-allowed' : 'pointer',
          boxShadow: nextDisabled || !nextFn ? 'none' : '0 2px 10px rgba(108,99,255,.3)',
        }}>{nextLabel}</button>
      </div>

      {/* Playback — shown after recording or when an existing save is present */}
      {playbackUrl && !isRecording && (
        <div style={{
          width: '100%', maxWidth: 660, marginBottom: 16,
          background: T.white, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 10 }}>
            Listen to your recording.
          </div>
          <audio src={playbackUrl} controls preload="auto" style={{ width: '100%', borderRadius: 8 }} />
        </div>
      )}

      {uploadErr && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{uploadErr}</div>
      )}

      <div style={{ marginTop: 8 }}><StepDots current={3} total={4} /></div>

      <style>{`
        @keyframes recPulse {
          0%, 100% { opacity:1; transform:scale(1); }
          50%       { opacity:.4; transform:scale(.7); }
        }
      `}</style>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PersonalizePage() {
  const { slug, orderItemId } = useParams();
  const navigate = useNavigate();
  const [book,    setBook]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [step,    setStep]    = useState(0);

  useEffect(() => {
    fetch(`/api/v1/public/books/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Book not found')))
      .then(data => setBook(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div style={fullscreen}>
      <div style={{ color: T.muted, fontSize: 14 }}>Loading…</div>
    </div>
  );

  if (error) return (
    <div style={fullscreen}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: .2 }}>◈</div>
        <div style={{ color: T.text, fontWeight: 700, marginBottom: 6 }}>Book not found</div>
        <div style={{ color: T.muted, fontSize: 13 }}>{error}</div>
      </div>
    </div>
  );

  return (
    <div style={fullscreen}>
      {/* Top nav */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10,
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: `1px solid ${T.border}`, borderRadius: 7,
          color: T.muted, fontSize: 13, fontWeight: 600, padding: '6px 14px', cursor: 'pointer',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
        >← My Account</button>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3,
          background: 'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ◈ Flipbook
        </div>
      </div>

      {step === 0 && <BookPreviewScreen book={book} onNext={() => setStep(1)} />}
      {step === 1 && <InstructionsScreen onBack={() => setStep(0)} onNext={() => setStep(2)} />}
      {step === 2 && <RecordingTestScreen onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && (
        <RecordAudioScreen
          slug={slug}
          orderItemId={orderItemId}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}
