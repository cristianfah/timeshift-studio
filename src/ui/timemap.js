// Time-map visualization — a live CPU-side render of the per-pixel time
// offset of the selected effect (teal = further into the past).

import { $ } from '../util/dom.js';
import { state, on } from '../state.js';
import { registry, baseParams, effectReach } from '../effects/registry.js';

const GRID_W = 64;
const GRID_H = 36;
let lastDraw = 0;

// Resolved param values at time t. Swapped for the animated resolver by the
// animation milestone (kept injectable so this module stays render-only).
let resolveValues = (fx) => baseParams(fx);
export function setTimemapResolver(fn) {
  resolveValues = fn;
}

export function initTimemap() {
  const canvas = $('#timemap');
  canvas.width = GRID_W;
  canvas.height = GRID_H;

  on('frame-rendered', ({ time }) => {
    const now = performance.now();
    if (now - lastDraw < 100) return; // ~10 Hz is plenty for a viz
    lastDraw = now;
    draw(time);
  });
  for (const evt of ['chain-changed', 'param-changed', 'selection-changed', 'video-loaded']) {
    on(evt, () => draw(state.video?.el.currentTime ?? 0));
  }
  draw(0);
}

function activeEffect() {
  return state.chain.find((fx) => fx.id === state.selectedId)
    ?? state.chain.find((fx) => fx.enabled)
    ?? null;
}

function draw(time) {
  const canvas = $('#timemap');
  const ctx2d = canvas.getContext('2d');
  const fx = activeEffect();
  const label = $('#timemap-label');
  const maxLabel = $('#timemap-max');

  if (!fx || !state.video) {
    ctx2d.fillStyle = '#000';
    ctx2d.fillRect(0, 0, GRID_W, GRID_H);
    label.textContent = '';
    maxLabel.textContent = '-0f';
    return;
  }

  const mod = registry[fx.type];
  const vctx = { time, fps: state.video.fps, duration: state.video.duration };
  const values = resolveValues(fx, time);
  const map = mod.delayMap(values, vctx);
  const reach = Math.max(effectReach(fx, values, vctx), 1);

  const img = ctx2d.createImageData(GRID_W, GRID_H);
  for (let row = 0; row < GRID_H; row++) {
    // canvas rows go top-down; shader v_uv.y is bottom-up
    const uvY = 1 - (row + 0.5) / GRID_H;
    for (let col = 0; col < GRID_W; col++) {
      const uvX = (col + 0.5) / GRID_W;
      const t = Math.min(map(uvX, uvY) / reach, 1);
      const o = (row * GRID_W + col) * 4;
      img.data[o] = 6 + t * (79 - 6);
      img.data[o + 1] = 17 + t * (216 - 17);
      img.data[o + 2] = 15 + t * (199 - 15);
      img.data[o + 3] = 255;
    }
  }
  ctx2d.putImageData(img, 0, 0);

  label.textContent = `· ${mod.label}${fx.enabled ? '' : ' (off)'}`;
  maxLabel.textContent = `-${Math.ceil(reach)}f`;
}
