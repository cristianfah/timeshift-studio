// BLOCK_SHUFFLE — grid of blocks, each frozen/delayed by a random offset,
// re-randomized every N frames. The fragmented "datamosh UI" look.

import { tsHash2 } from './common.js';

const frag = `
uniform float uGridX, uGridY, uMaxDelay, uInterval, uProportion, uSeed;

void main() {
  vec2 cell = floor(v_uv * vec2(uGridX, uGridY));
  float epoch = floor(uFrame / max(uInterval, 1.0));
  float sel = tsHash2(cell * 1.7 + vec2(epoch * 31.0, uSeed * 5.0));
  float amt = tsHash2(cell + vec2(uSeed * 13.0 + epoch * 101.0, epoch * 7.0));
  float delay = (sel < uProportion) ? amt * uMaxDelay : 0.0;
  outColor = vec4(chainAt(v_uv, delay).rgb, 1.0);
}`;

export default {
  type: 'blockShuffle',
  label: 'BLOCK_SHUFFLE',
  params: [
    { key: 'gridX',      label: 'GRID X', min: 2, max: 64, step: 1, def: 12 },
    { key: 'gridY',      label: 'GRID Y', min: 2, max: 64, step: 1, def: 8 },
    { key: 'maxDelay',   label: 'DELAY MÁX (f)', min: 0, max: 150, step: 1, def: 40 },
    { key: 'interval',   label: 'REBARAJAR (f)', min: 1, max: 120, step: 1, def: 12 },
    { key: 'proportion', label: 'PROPORCIÓN', min: 0, max: 1, step: 0.01, def: 0.7 },
    { key: 'seed',       label: 'SEED', min: 0, max: 100, step: 1, def: 7 },
  ],
  presets: {
    DATAMOSH:    { gridX: 24, gridY: 16, maxDelay: 60, interval: 6, proportion: 0.85 },
    MOSAICO:     { gridX: 8, gridY: 6, maxDelay: 30, interval: 24, proportion: 0.5 },
    GLITCH_FINO: { gridX: 48, gridY: 27, maxDelay: 90, interval: 3, proportion: 0.6 },
  },
  frag,
  setUniforms(gl, u, p) {
    gl.uniform1f(u('uGridX'), p.gridX);
    gl.uniform1f(u('uGridY'), p.gridY);
    gl.uniform1f(u('uMaxDelay'), p.maxDelay);
    gl.uniform1f(u('uInterval'), p.interval);
    gl.uniform1f(u('uProportion'), p.proportion);
    gl.uniform1f(u('uSeed'), p.seed);
  },
  maxReach: (p) => p.maxDelay,
  delayMap(p, ctx) {
    const epoch = Math.floor((ctx.time * ctx.fps) / Math.max(p.interval, 1));
    return (x, y) => {
      const cx = Math.floor(x * p.gridX), cy = Math.floor(y * p.gridY);
      const selv = tsHash2(cx * 1.7 + epoch * 31, cy * 1.7 + p.seed * 5);
      const amt = tsHash2(cx + p.seed * 13 + epoch * 101, cy + epoch * 7);
      return selv < p.proportion ? amt * p.maxDelay : 0;
    };
  },
};
