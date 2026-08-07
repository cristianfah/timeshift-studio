// Transport bar + main timeline: play/pause/loop, frame stepping, scrub with
// frame snapping, trim handles, timecode and a hover thumbnail of the frame
// under the cursor. Keyframe markers are layered on top by src/ui/anim.js.

import { $, clamp, timecode } from '../util/dom.js';
import { state, emit, on } from '../state.js';
import { SeekStepper } from '../engine/video.js';

let hooks = null;

export function initTransport(h) {
  hooks = h; // { seek(t), togglePlay(), goStart(), step(frames) }

  $('#btn-play').addEventListener('click', () => hooks.togglePlay());
  $('#btn-gostart').addEventListener('click', () => hooks.goStart());
  $('#btn-step-back').addEventListener('click', () => hooks.step(-1));
  $('#btn-step-fwd').addEventListener('click', () => hooks.step(1));
  $('#btn-loop').addEventListener('click', (e) => {
    state.loop = !state.loop;
    e.currentTarget.classList.toggle('active', state.loop);
  });
  $('#chk-mute').addEventListener('change', (e) => {
    if (state.video) state.video.el.muted = e.target.checked;
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); hooks.togglePlay(); }
    if (e.code === 'Home') hooks.goStart();
    if (e.code === 'ArrowLeft') { e.preventDefault(); hooks.step(e.shiftKey ? -10 : -1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); hooks.step(e.shiftKey ? 10 : 1); }
  });

  initTimelineScrub();
  initTrimHandles();
  initHoverThumb();
  on('video-loaded', () => { disposeThumb(); });
}

export function enableTransport(enabled) {
  for (const id of ['#btn-play', '#btn-gostart', '#btn-loop', '#btn-step-back', '#btn-step-fwd']) {
    $(id).disabled = !enabled;
  }
}

function timeAtEvent(e) {
  const rect = $('#timeline').getBoundingClientRect();
  const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  return x * (state.video?.duration ?? 0);
}

function initTimelineScrub() {
  const tl = $('#timeline');
  let scrubbing = false;
  tl.addEventListener('pointerdown', (e) => {
    if (!state.video) return;
    if (e.target.closest('.tl-trim-handle, .tl-key')) return;
    scrubbing = true;
    tl.setPointerCapture(e.pointerId);
    hooks.seek(timeAtEvent(e), { scrub: true });
  });
  tl.addEventListener('pointermove', (e) => {
    if (scrubbing) hooks.seek(timeAtEvent(e), { scrub: true });
  });
  const settle = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    // Final position: rebuilds real frame history so the frame under the
    // playhead is shown exactly as it will be exported.
    hooks.seek(timeAtEvent(e), { scrub: false });
  };
  tl.addEventListener('pointerup', settle);
  tl.addEventListener('pointercancel', settle);
}

function initTrimHandles() {
  for (const side of ['in', 'out']) {
    const handle = $(`#tl-trim-${side}`);
    handle.addEventListener('pointerdown', (e) => {
      if (!state.video) return;
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const t = timeAtEvent(ev);
        if (side === 'in') state.trim.in = clamp(t, 0, state.trim.out - 0.1);
        else state.trim.out = clamp(t, state.trim.in + 0.1, state.video.duration);
        emit('trim-changed');
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
}

// ---------- hover thumbnail: see where you are about to land ----------

let thumbStepper = null;
let thumbBusy = false;
let thumbWanted = null;

function disposeThumb() {
  thumbStepper?.dispose();
  thumbStepper = null;
}

function initHoverThumb() {
  const tl = $('#timeline');
  const box = $('#tl-thumb');

  tl.addEventListener('pointermove', (e) => {
    if (!state.video) return;
    const t = timeAtEvent(e);
    const rect = tl.getBoundingClientRect();
    box.classList.remove('hidden');
    box.style.left = `${clamp(e.clientX - rect.left, 60, rect.width - 60)}px`;
    $('#tl-thumb-time').textContent = timecode(t, state.video.fps);
    thumbWanted = t;
    drainThumb();
  });
  tl.addEventListener('pointerleave', () => box.classList.add('hidden'));
}

async function drainThumb() {
  if (thumbBusy || thumbWanted === null) return;
  const v = state.video;
  if (!v) return;
  thumbBusy = true;
  try {
    if (!thumbStepper) {
      thumbStepper = new SeekStepper(v.url);
      await thumbStepper.ready();
    }
    while (thumbWanted !== null) {
      const t = thumbWanted;
      thumbWanted = null;
      await thumbStepper.seek(t);
      const cv = $('#tl-thumb-canvas');
      cv.getContext('2d').drawImage(thumbStepper.video, 0, 0, cv.width, cv.height);
    }
  } catch {
    disposeThumb(); // decoding a second copy is best-effort
  } finally {
    thumbBusy = false;
  }
}

/** Called every animation frame from the main loop. */
export function updateTransport() {
  const v = state.video;
  if (!v) return;
  const t = v.el.currentTime;
  const dur = v.duration || 1;

  $('#timecode').textContent =
    `${timecode(t, v.fps)} / ${timecode(dur, v.fps)}`;
  // floor, not round: the counter must name the frame being displayed, and
  // seeks land on frame centres ((f + 0.5) / fps).
  $('#frame-counter').textContent = `f${Math.floor(t * v.fps + 0.001)}`;
  $('#btn-play').textContent = state.playing ? '❚❚' : '▶';

  $('#tl-playhead').style.left = `${(t / dur) * 100}%`;
  $('#tl-progress').style.width = `${(t / dur) * 100}%`;

  const inPct = (state.trim.in / dur) * 100;
  const outPct = (state.trim.out / dur) * 100;
  const region = $('#tl-trim-region');
  region.style.left = `${inPct}%`;
  region.style.width = `${outPct - inPct}%`;
  $('#tl-trim-in').style.left = `calc(${inPct}% - 3px)`;
  $('#tl-trim-out').style.left = `calc(${outPct}% - 3px)`;
}
