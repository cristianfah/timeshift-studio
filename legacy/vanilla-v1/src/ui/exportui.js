// Export dialog: pre-flight estimates, progress + cancel, WebCodecs→MP4
// with a visible MediaRecorder→WebM fallback.

import { $, download } from '../util/dom.js';
import { state } from '../state.js';
import { exportVideo, estimateExport, ExportError } from '../export/exporter.js';
import { exportWebM, canFallback } from '../export/fallback.js';
import { toast } from './toast.js';

let controller = null;
let running = false;

export function initExport() {
  $('#btn-export').addEventListener('click', openModal);
  $('#btn-export-cancel').addEventListener('click', () => {
    if (running) controller?.abort();
    else closeModal();
  });
  $('#btn-export-start').addEventListener('click', run);
  $('#export-scale').addEventListener('change', updateEstimate);
}

function openModal() {
  if (!state.video) return;
  $('#export-modal').classList.remove('hidden');
  $('#export-config').classList.remove('hidden');
  $('#export-progress').classList.add('hidden');
  $('#btn-export-start').classList.remove('hidden');
  updateEstimate();
}

function closeModal() {
  $('#export-modal').classList.add('hidden');
}

function updateEstimate() {
  const scale = parseFloat($('#export-scale').value);
  const est = estimateExport({
    video: state.video, chain: state.chain, trim: state.trim, scale,
  });
  const secs = (state.trim.out - state.trim.in).toFixed(1);
  $('#export-info').textContent =
    `${est.outW}×${est.outH} · ${est.frames} frames (${secs}s @ ${state.video.fps}fps) · ` +
    `alcance temporal ${est.reach}f · buffer GPU ~${est.ringMB.toFixed(0)} MB`;

  const warn = $('#export-warn');
  if (!('VideoEncoder' in window)) {
    warn.textContent = '⚠ WebCodecs no disponible: se usará MediaRecorder → WebM en tiempo real a resolución de preview.';
    warn.classList.remove('hidden');
  } else if (est.ringMB > 768) {
    warn.textContent = `⚠ El buffer necesario (~${est.ringMB.toFixed(0)} MB) supera el límite: los delays se recortarán. Exporta a menor escala.`;
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

function setProgress({ phase, done, total }) {
  const pct = Math.round((done / total) * 100);
  $('#export-bar').style.width = `${pct}%`;
  $('#export-status').textContent = phase === 'preroll'
    ? `precargando historial… ${done}/${total}`
    : `renderizando frame ${Math.ceil(done)}/${Math.ceil(total)} — ${pct}%`;
}

async function run() {
  if (running || !state.video) return;
  running = true;
  controller = new AbortController();
  state.exporting = true;

  $('#export-config').classList.add('hidden');
  $('#export-progress').classList.remove('hidden');
  $('#btn-export-start').classList.add('hidden');
  $('#export-bar').style.width = '0%';

  const scale = parseFloat($('#export-scale').value);
  const includeAudio = $('#export-audio').checked;
  const wasPlaying = state.playing;
  if (wasPlaying) { state.video.el.pause(); state.playing = false; }

  try {
    let result;
    try {
      result = await exportVideo({
        video: state.video, chain: state.chain, trim: state.trim,
        scale, includeAudio,
        onProgress: setProgress,
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof ExportError && (e.code === 'nowebcodecs' || e.code === 'cdn' || e.code === 'codec')) {
        if (!canFallback()) throw e;
        toast(`${e.message} — usando MediaRecorder → WebM (resolución de preview).`, 'warn');
        $('#export-status').textContent = 'grabando en tiempo real (fallback WebM)…';
        result = await exportWebM({
          video: state.video, canvas: $('#gl-canvas'), trim: state.trim,
          onProgress: setProgress,
          signal: controller.signal,
        });
      } else {
        throw e;
      }
    }
    download(result.blob, result.filename);
    for (const w of result.warnings) toast(w, 'warn');
    toast(`Export completado: ${result.filename}`);
    closeModal();
  } catch (e) {
    if (e?.code === 'aborted' || controller.signal.aborted) {
      toast('Export cancelado.');
    } else {
      console.error('[timeshift] export failed', e);
      toast(`Export falló: ${e.message ?? e}`, 'error');
    }
    closeModal();
  } finally {
    running = false;
    state.exporting = false;
  }
}
