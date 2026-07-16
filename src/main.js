// TIMESHIFT_STUDIO — entry point and main loop.
import { $, clamp } from './util/dom.js';
import { toast, fatal } from './ui/toast.js';
import { state, on, emit } from './state.js';
import { Engine } from './engine/renderer.js';
import { loadVideoFile, estimateFps } from './engine/video.js';
import { initTransport, enableTransport, updateTransport } from './ui/transport.js';
import { registry } from './effects/registry.js';
import { initChain } from './ui/chain.js';
import { initTimemap, setTimemapResolver } from './ui/timemap.js';
import { initAnim } from './ui/anim.js';
import { resolveParams } from './animation/resolver.js';
import { initPresets } from './ui/presets.js';
import { initExport } from './ui/exportui.js';

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
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;


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
    reconfigureEngine();
    pumpFrames(meta.el);
    meta.el.muted = $('#chk-mute').checked;

    $('#dropzone').classList.add('hidden');
    $('#btn-export').disabled = false;
    enableTransport(true);
    updateClipChip();
    emit('video-loaded');
    toast(`Clip cargado: ${meta.name} — todo se procesa en tu equipo.`);
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
  if (info.depth < info.requestedDepth) {
    const secs = (info.depth / v.fps).toFixed(1);
    toast(`Buffer limitado por memoria GPU: ${info.depth} frames (~${secs}s) disponibles.`, 'warn');
  }
  emit('buffer-changed');
}

// ---------- frame pump: decoded frames → ring buffer ----------
function pumpFrames(videoEl) {
  if (!hasRVFC) return; // fallback: pushed from the render loop while playing
  const tick = () => {
    if (state.video?.el !== videoEl) return; // stale element after reload
    engine.pushFrame(videoEl);
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

function seekTo(t, { scrub = false } = {}) {
  const v = state.video;
  if (!v) return;
  v.el.currentTime = clamp(t, 0, v.duration - 0.001);
  // History is kept intentionally: temporal effects keep flowing while
  // scrubbing; buffer priming rebuilds true history on scrub end.
  if (!scrub) emit('seek-settled', { time: t });
}

on('video-replaced', () => { fpsRefined = false; });

// ---------- render loop ----------
let frameCount = 0;
let fpsWindowStart = performance.now();

function renderLoop() {
  requestAnimationFrame(renderLoop);
  const v = state.video;
  if (!v) return;

  if (!hasRVFC && state.playing) engine.pushFrame(v.el);

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
});
initLoaderUI();
initSettingsUI();
initChain();
initTimemap();
setTimemapResolver((fx, t) => resolveParams(fx, t ?? 0));
initAnim();
initPresets();
initExport();
renderLoop();

export { engine, seekTo, reconfigureEngine };
