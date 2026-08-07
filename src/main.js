// TIMESHIFT_STUDIO — entry point and main loop.
import { $, clamp } from './util/dom.js';
import { toast, fatal } from './ui/toast.js';
import { state, on, emit } from './state.js';
import { Engine } from './engine/renderer.js';
import { loadVideoFile, estimateFps, SeekStepper } from './engine/video.js';
import { initTransport, enableTransport, updateTransport } from './ui/transport.js';
import { registry, effectReach } from './effects/registry.js';
import { initChain } from './ui/chain.js';
import { initTimemap, setTimemapResolver } from './ui/timemap.js';
import { initAnim } from './ui/anim.js';
import { resolveParams } from './animation/resolver.js';
import { initPresets } from './ui/presets.js';
import { initExport } from './ui/exportui.js';
import { initZoom } from './ui/zoom.js';
import { initBrowser } from './ui/browser.js';
import { initTrackPoints } from './ui/trackpoints.js';

// ---------- capability check ----------
function checkWebGL2() {
  const probe = document.createElement('canvas');
  return !!probe.getContext('webgl2');
}
if (!checkWebGL2()) {
  fatal('WEBGL2_NO_DISPONIBLE',
    'Este navegador no soporta WebGL2, requerido por el motor de render. ' +
    'Prueba con una versión reciente de Chrome, Edge o Firefox, y verifica ' +
    'que la aceleración por hardware esté activada.');
  throw new Error('WebGL2 unavailable');
}

// ---------- engine ----------
const engine = new Engine($('#gl-canvas'));
$('#gl-canvas').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  toast('Contexto WebGL perdido (memoria GPU agotada). Reduce PREVIEW/BUFFER y recarga la página.', 'error');
});
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

// Live luminance sampler for luma-driven time-map previews (CELL_MAP).
state.lumaSampler = (x, yTop) => {
  const g = engine.lumaGrid(64);
  if (!g) return 0.5;
  const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(x * g.cols)));
  const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(yTop * g.rows)));
  return g.luma[cy * g.cols + cx];
};


// ---------- video loading ----------
async function loadFile(file) {
  if (!file.type.startsWith('video/')) {
    toast('Formato no soportado — arrastra un archivo de video (mp4/webm/mov).', 'error');
    return;
  }
  try {
    const meta = await loadVideoFile(file);
    if (state.video) {
      state.video.el.pause();
      URL.revokeObjectURL(state.video.url);
    }
    state.video = meta;
    state.playing = false;
    state.trim = { in: 0, out: meta.duration };
    disposePrimeStepper();
    reconfigureEngine();
    pumpFrames(meta.el);
    // A seek also delivers a frame — without rVFC this is the only signal,
    // and with it, it makes the paused viewport update immediately.
    meta.el.addEventListener('seeked', () => ingest(meta.el));
    meta.el.muted = $('#chk-mute').checked;

    $('#dropzone').classList.add('hidden');
    $('#btn-export').disabled = false;
    enableTransport(true);
    updateClipChip();
    emit('video-loaded');
    toast(`Clip cargado: ${meta.name} — todo se procesa en tu equipo.`);
    if (state.chain.length === 0) {
      setTimeout(() => toast('Consejo: dale play y pulsa un LOOK para empezar. El botón «?» abre la guía.'), 1200);
    }
  } catch {
    toast('No se pudo decodificar el video. Prueba con otro códec/contenedor.', 'error');
  }
}

function updateClipChip() {
  const v = state.video;
  const chip = $('#clip-chip');
  chip.classList.remove('hidden');
  chip.textContent = `${v.name} · ${v.width}×${v.height} · ${v.fps}fps · ${v.duration.toFixed(1)}s`;
  chip.title = chip.textContent;
}

/** (Re)allocate ring buffer for current settings; warn if memory-capped. */
function reconfigureEngine() {
  const v = state.video;
  if (!v) return;
  const requestedDepth = Math.min(300, Math.max(8, Math.round(state.settings.bufferSecs * v.fps)));
  const info = engine.configure({
    srcWidth: v.width,
    srcHeight: v.height,
    targetWidth: state.settings.previewWidth,
    depth: requestedDepth,
  });
  state.bufferInfo = info;
  headFrame = -1;   // fresh ring: no real history yet
  headRun = 0;
  if (info.depth < info.requestedDepth) {
    const secs = (info.depth / v.fps).toFixed(1);
    toast(`Buffer limitado por memoria GPU: ${info.depth} frames (~${secs}s) disponibles.`, 'warn');
  }
  emit('buffer-changed');
}

// ---------- frame pump: decoded frames → ring buffer ----------
// The ring keeps its own bookkeeping: which clip time sits at the head and
// how many *consecutive real* frames precede it. That is what lets a seek
// reuse history it already has instead of re-decoding it (stepping one frame
// forward costs one frame, not a whole rebuild).
let headFrame = -1;  // index of the newest frame in the ring (-1 = unknown)
let headRun = 0;     // consecutive real frames ending at headFrame

/** Frame index containing clip time `t`; robust to seek-time rounding. */
function frameIndex(t, fps) {
  return Math.floor(t * fps + 0.001);
}

function resetRingHistory() {
  engine.resetHistory();
  headFrame = -1;
  headRun = 0;
}

/** Record that the frame at clip time `t` just became the ring head. */
function noteHead(t, fps) {
  const f = frameIndex(t, fps);
  headRun = f === headFrame + 1 && headFrame >= 0
    ? Math.min(headRun + 1, state.bufferInfo?.depth ?? 1)
    : 1;
  headFrame = f;
}

/**
 * Push a decoded frame into the ring, unless the buffer is being rebuilt or
 * the very same frame is already at the head. The dedupe matters while
 * paused: a repeated push would shift every temporal effect by one frame
 * and make the paused viewport disagree with the export.
 */
function ingest(source, mediaTime) {
  if (state.priming || !state.video) return;
  const t = mediaTime ?? source.currentTime;
  if (!state.playing && frameIndex(t, state.video.fps) === headFrame) return;
  engine.pushFrame(source);
  noteHead(t, state.video.fps);
}

function pumpFrames(videoEl) {
  if (!hasRVFC) return; // fallback: pushed from the render loop while playing
  const tick = (_now, meta) => {
    if (state.video?.el !== videoEl) return; // stale element after reload
    ingest(videoEl, meta?.mediaTime);
    videoEl.requestVideoFrameCallback(tick);
  };
  videoEl.requestVideoFrameCallback(tick);
}

// ---------- playback control ----------
let fpsRefined = false;

async function togglePlay() {
  const v = state.video;
  if (!v) return;
  if (state.playing) {
    v.el.pause();
    state.playing = false;
  } else {
    if (v.el.currentTime >= state.trim.out - 0.05) v.el.currentTime = state.trim.in;
    try {
      await v.el.play();
      state.playing = true;
      refineFps();
    } catch { /* autoplay policy — user gesture always present here */ }
  }
}

function refineFps() {
  const v = state.video;
  if (fpsRefined || !v) return;
  fpsRefined = true;
  estimateFps(v.el, (fps) => {
    if (state.video !== v || Math.abs(fps - v.fps) < 0.5) return;
    v.fps = fps;
    v.fpsEstimated = true;
    reconfigureEngine();
    updateClipChip();
  });
}

/** Centre of the frame that contains `t` — seeking here always lands on it. */
function frameSnap(t) {
  const v = state.video;
  if (!v) return t;
  const last = Math.max(0, Math.floor(v.duration * v.fps) - 1);
  const f = clamp(Math.floor(t * v.fps), 0, last);
  return (f + 0.5) / v.fps;
}

function seekTo(t, { scrub = false } = {}) {
  const v = state.video;
  if (!v) return;
  const target = frameSnap(clamp(t, 0, v.duration - 0.001));
  v.el.currentTime = target;
  // History is kept intentionally: temporal effects keep flowing while
  // scrubbing; buffer priming rebuilds true history on scrub end.
  if (!scrub) emit('seek-settled', { time: target });
}

function stepFrames(n) {
  const v = state.video;
  if (!v) return;
  if (state.playing) { v.el.pause(); state.playing = false; }
  seekTo(v.el.currentTime + n / v.fps);
}

// ---------- buffer priming: rebuild real frame history after a scrub ----------
// This is what makes "click anywhere on the timeline" show exactly the frame
// under the playhead *with* its effects: the ring is refilled with the real
// frames that precede the target, so temporal effects read true history
// instead of whatever the scrub happened to sweep through.
let primeToken = 0;
let primeTimer = null;
let primeStepper = null;
let primeStepperUrl = null;

function disposePrimeStepper() {
  primeStepper?.dispose();
  primeStepper = null;
  primeStepperUrl = null;
}

async function getPrimeStepper(v) {
  if (primeStepper && primeStepperUrl === v.url) return primeStepper;
  disposePrimeStepper();
  primeStepper = new SeekStepper(v.url);
  primeStepperUrl = v.url;
  await primeStepper.ready();
  return primeStepper;
}

/** Frames of history the current chain actually reads at time t. */
function chainReachAt(t) {
  const v = state.video;
  if (!v) return 0;
  const ctx = { time: t, fps: v.fps, duration: v.duration };
  let max = 0;
  for (const fx of state.chain) {
    if (!fx.enabled) continue;
    max = Math.max(max, effectReach(fx, resolveParams(fx, t), ctx));
  }
  return Math.ceil(max);
}

on('seek-settled', ({ time }) => {
  primeToken++;             // invalidate any in-flight prime
  state.priming = false;    // and never leave the frame pump paused
  clearTimeout(primeTimer);
  primeTimer = setTimeout(() => primeBuffer(time), 120);
});

async function primeBuffer(t) {
  const v = state.video;
  const depth = state.bufferInfo?.depth ?? 0;
  if (!v || state.playing || state.exporting || depth < 2) return endPrime();

  // Only refill as far back as the chain can actually see — a 2-frame chain
  // primes instantly instead of stepping through the whole buffer.
  const frames = Math.min(depth - 1, chainReachAt(t) + 1, Math.floor(t * v.fps));
  if (frames < 1) {
    // Nothing to rebuild, but the scrub may have left junk in the ring.
    resetRingHistory();
    engine.pushFrame(v.el);
    noteHead(v.el.currentTime, v.fps);
    return endPrime();
  }

  // Reuse what the ring already holds: seeking forward a few frames from an
  // exact position only needs those few frames, not a full rebuild. Stepping
  // with the arrow keys usually needs nothing at all.
  const ahead = headFrame >= 0 ? frameIndex(t, v.fps) - headFrame : -1;
  const reusable = ahead >= 0 && ahead <= frames && headRun + ahead > frames;
  if (reusable && ahead === 0) return endPrime();

  const first = reusable ? ahead - 1 : frames;   // frames still missing
  const my = ++primeToken;
  state.priming = true;
  const badge = $('#prime-badge');
  badge.classList.remove('hidden');
  try {
    const stepper = await getPrimeStepper(v);
    if (!reusable) resetRingHistory();
    for (let i = first; i >= 0; i--) {
      if (my !== primeToken || state.playing || state.video !== v) return;
      badge.textContent = `RECONSTRUYENDO ${first - i + 1}/${first + 1}`;
      const frameTime = t - i / v.fps;
      await stepper.seek(frameTime);
      engine.pushFrame(stepper.video);
      noteHead(frameTime, v.fps);
    }
  } catch { /* priming is best-effort */ } finally {
    if (my === primeToken) endPrime();
  }
}

function endPrime() {
  state.priming = false;
  const badge = $('#prime-badge');
  badge.classList.add('hidden');
  badge.textContent = 'RECONSTRUYENDO…';
}

on('video-replaced', () => { fpsRefined = false; });

// ---------- render loop ----------
let frameCount = 0;
let fpsWindowStart = performance.now();

function renderLoop() {
  requestAnimationFrame(renderLoop);
  const v = state.video;
  if (!v) return;

  if (!hasRVFC && state.playing) ingest(v.el);

  const t = v.el.currentTime;
  if (!state.exporting && state.playing && t >= state.trim.out - 0.02) {
    if (state.loop) seekTo(state.trim.in);
    else { v.el.pause(); state.playing = false; }
  }

  engine.render(state.chain, registry, {
    time: t,
    fps: v.fps,
    duration: v.duration,
    params: (fx) => resolveParams(fx, t),
  });

  updateTransport();
  emit('frame-rendered', { time: t });

  // fps meter (1s window)
  frameCount++;
  const now = performance.now();
  if (now - fpsWindowStart >= 1000) {
    $('#fps-meter').textContent = `${frameCount} fps`;
    frameCount = 0;
    fpsWindowStart = now;
  }
}

// ---------- drag & drop / file input ----------
function initLoaderUI() {
  const dz = $('#dropzone');
  $('#btn-open').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });
  for (const target of [document.body]) {
    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.remove('hidden');
      dz.classList.add('dragover');
    });
    target.addEventListener('dragleave', (e) => {
      if (e.relatedTarget) return;
      dz.classList.toggle('hidden', !!state.video);
      dz.classList.remove('dragover');
    });
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      dz.classList.toggle('hidden', !!state.video);
      const file = e.dataTransfer.files?.[0];
      if (file) loadFile(file);
    });
  }
}

// ---------- quick guide ----------
function initHelpUI() {
  const modal = $('#help-modal');
  $('#btn-help').addEventListener('click', () => modal.classList.remove('hidden'));
  $('#btn-help-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') modal.classList.add('hidden');
  });
}

// ---------- settings ----------
function initSettingsUI() {
  $('#preview-res').addEventListener('change', (e) => {
    state.settings.previewWidth = parseInt(e.target.value, 10);
    reconfigureEngine();
  });
  $('#buffer-secs').addEventListener('change', (e) => {
    state.settings.bufferSecs = parseFloat(e.target.value);
    reconfigureEngine();
    if (state.bufferInfo) {
      toast(`Buffer: ${state.bufferInfo.depth} frames · ~${state.bufferInfo.memoryMB.toFixed(0)} MB GPU`);
    }
  });
}

// ---------- boot ----------
initTransport({
  seek: seekTo,
  togglePlay,
  goStart: () => seekTo(state.trim.in),
  step: stepFrames,
});
initLoaderUI();
initHelpUI();
initZoom();
initSettingsUI();
initTrackPoints();
initBrowser(engine);
initChain();
initTimemap();
setTimemapResolver((fx, t) => resolveParams(fx, t ?? 0));
initAnim();
initPresets();
initExport();
renderLoop();

export { engine, seekTo, reconfigureEngine };
