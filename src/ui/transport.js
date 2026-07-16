// Transport bar + main timeline: play/pause/loop, scrub, trim handles,
// timecode. Keyframe markers are layered on top by src/ui/timelineKeys.js.

import { $, clamp, timecode } from '../util/dom.js';
import { state, emit } from '../state.js';

let hooks = null;

export function initTransport(h) {
  hooks = h; // { seek(t), togglePlay(), goStart() }

  $('#btn-play').addEventListener('click', () => hooks.togglePlay());
  $('#btn-gostart').addEventListener('click', () => hooks.goStart());
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
  });

  initTimelineScrub();
  initTrimHandles();
}

export function enableTransport(enabled) {
  for (const id of ['#btn-play', '#btn-gostart', '#btn-loop']) {
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
  tl.addEventListener('pointerup', (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    hooks.seek(timeAtEvent(e), { scrub: false }); // final: triggers prime
  });
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

/** Called every animation frame from the main loop. */
export function updateTransport() {
  const v = state.video;
  if (!v) return;
  const t = v.el.currentTime;
  const dur = v.duration || 1;

  $('#timecode').textContent =
    `${timecode(t, v.fps)} / ${timecode(dur, v.fps)}`;
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
