// CELL_MAP — luminance becomes spatial time remapping across a grid:
// bright cells look further into the past (or the reverse). The map is the
// video itself, so the remap "follows" the image.

import { clampv } from './common.js';

const frag = `
uniform float uGridX, uGridY, uMaxDelay, uLevels;
uniform int uInvert, uPixelMode;

void main() {
  vec2 grid = vec2(uGridX, uGridY);
  vec2 sampleUV = (uPixelMode == 1)
    ? v_uv
    : (floor(v_uv * grid) + 0.5) / grid;
  float luma = dot(frameAt(sampleUV, 0.0).rgb, vec3(0.299, 0.587, 0.114));
  if (uInvert == 1) luma = 1.0 - luma;
  if (uLevels >= 2.0) luma = floor(luma * uLevels) / max(uLevels - 1.0, 1.0);
  float delay = clamp(luma, 0.0, 1.0) * uMaxDelay;
  outColor = vec4(((uPixelMode == 1) ? frameAtSmooth(v_uv, delay) : chainAt(v_uv, delay)).rgb, 1.0);
}`;

export default {
  type: 'lumaTime',
  label: 'CELL_MAP',
  desc: 'La luminancia del propio video decide cuánto retrocede cada celda en el tiempo: las zonas claras (u oscuras) miran al pasado.',
  params: [
    { key: 'gridX',    label: 'GRID X', min: 2, max: 96, step: 1, def: 24 },
    { key: 'gridY',    label: 'GRID Y', min: 2, max: 96, step: 1, def: 14 },
    { key: 'maxDelay', label: 'DELAY MÁX (f)', min: 0, max: 150, step: 1, def: 45,
      help: 'Retraso, en frames, de las zonas más brillantes (o más oscuras si inviertes).' },
    { key: 'levels',   label: 'NIVELES (0=off)', min: 0, max: 16, step: 1, def: 0,
      help: 'Posteriza la luminancia en N escalones de tiempo (0 = continuo).' },
    { key: 'mode',     label: 'MODO', type: 'select', def: 'cells',
      options: [['cells', 'CELDAS'], ['pixel', 'POR PÍXEL']] },
    { key: 'invert',   label: 'INVERTIR', type: 'select', def: 'no',
      options: [['no', 'NO'], ['yes', 'SÍ']] },
  ],
  presets: {
    LUMAGRID: { gridX: 24, gridY: 14, maxDelay: 45, levels: 0 },
    SUAVE:    { mode: 'pixel', maxDelay: 60, levels: 0 },
    POSTER:   { gridX: 40, gridY: 24, maxDelay: 90, levels: 4, invert: 'yes' },
  },
  frag,
  setUniforms(gl, u, p) {
    gl.uniform1f(u('uGridX'), p.gridX);
    gl.uniform1f(u('uGridY'), p.gridY);
    gl.uniform1f(u('uMaxDelay'), p.maxDelay);
    gl.uniform1f(u('uLevels'), p.levels);
    gl.uniform1i(u('uInvert'), p.invert === 'yes' ? 1 : 0);
    gl.uniform1i(u('uPixelMode'), p.mode === 'pixel' ? 1 : 0);
  },
  maxReach: (p) => p.maxDelay,
  delayMap(p, ctx) {
    // ctx.luma samples the real preview frame (top-down coords) when available.
    return (x, y) => {
      let qx = x, qyTop = 1 - y;
      if (p.mode !== 'pixel') {
        qx = (Math.floor(x * p.gridX) + 0.5) / p.gridX;
        qyTop = (Math.floor((1 - y) * p.gridY) + 0.5) / p.gridY;
      }
      let l = ctx.luma ? ctx.luma(qx, qyTop) : 0.5;
      if (p.invert === 'yes') l = 1 - l;
      if (p.levels >= 2) l = Math.floor(l * p.levels) / Math.max(p.levels - 1, 1);
      return clampv(l, 0, 1) * p.maxDelay;
    };
  },
};
