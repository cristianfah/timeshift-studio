// SLICE_BANDS — classic slit-scan: N parallel bands, each pulling a
// different past frame. Free band rotation + feathered edges.

import { tsHash, clampv } from './common.js';

const frag = `
uniform float uBands, uOffset, uJitter, uAngle, uFeather, uSeed;
uniform int uSpacingMode; // 0 linear, 1 random

float bandDelay(float i) {
  float n = max(uBands - 1.0, 1.0);
  float base = (uSpacingMode == 0) ? (i / n) : tsHash(i + uSeed * 57.0);
  float jit = (tsHash(i * 3.7 + uSeed * 91.0) - 0.5) * 2.0 * uJitter;
  return clamp(base + jit, 0.0, 1.0) * uOffset;
}

void main() {
  float a = radians(uAngle);
  vec2 dir = vec2(cos(a), sin(a));
  float s = clamp(dot(v_uv - 0.5, dir) + 0.5, 0.0, 0.99999);
  float fb = s * uBands;
  float i = floor(fb);
  float f = fract(fb);
  vec4 c = chainAt(v_uv, bandDelay(i));

  // Feather: alpha-blend with the neighboring band near shared edges.
  if (uFeather > 0.001) {
    float half_w = uFeather * 0.5;
    if (f < half_w && i > 0.5) {
      vec4 cPrev = chainAt(v_uv, bandDelay(i - 1.0));
      c = mix(cPrev, c, smoothstep(0.0, 1.0, 0.5 + f / uFeather));
    } else if (f > 1.0 - half_w && i < uBands - 1.5) {
      vec4 cNext = chainAt(v_uv, bandDelay(i + 1.0));
      c = mix(cNext, c, smoothstep(0.0, 1.0, 0.5 + (1.0 - f) / uFeather));
    }
  }
  outColor = vec4(c.rgb, 1.0);
}`;

function bandDelayJS(i, p) {
  const n = Math.max(p.bands - 1, 1);
  const base = p.spacing === 'random' ? tsHash(i + p.seed * 57) : i / n;
  const jit = (tsHash(i * 3.7 + p.seed * 91) - 0.5) * 2 * p.jitter;
  return clampv(base + jit, 0, 1) * p.offset;
}

export default {
  type: 'sliceBands',
  label: 'SLICE_BANDS',
  params: [
    { key: 'bands',   label: 'BANDAS',    min: 2, max: 64, step: 1, def: 12 },
    { key: 'offset',  label: 'OFFSET (f)', min: 0, max: 150, step: 1, def: 30 },
    { key: 'jitter',  label: 'JITTER',    min: 0, max: 1, step: 0.01, def: 0.15 },
    { key: 'spacing', label: 'ESPACIADO', type: 'select', def: 'linear',
      options: [['linear', 'LINEAL'], ['random', 'ALEATORIO']] },
    { key: 'angle',   label: 'ÁNGULO',    min: 0, max: 180, step: 1, def: 90 },
    { key: 'feather', label: 'FEATHER',   min: 0, max: 0.5, step: 0.01, def: 0.05 },
    { key: 'seed',    label: 'SEED',      min: 0, max: 100, step: 1, def: 1 },
  ],
  presets: {
    FINO:     { bands: 48, offset: 20, jitter: 0.05, spacing: 'linear', angle: 90, feather: 0.02 },
    BRUTAL:   { bands: 8, offset: 90, jitter: 0.6, spacing: 'random', angle: 90, feather: 0 },
    DIAGONAL: { bands: 24, offset: 45, jitter: 0.1, spacing: 'linear', angle: 45, feather: 0.12 },
  },
  frag,
  setUniforms(gl, u, p) {
    gl.uniform1f(u('uBands'), p.bands);
    gl.uniform1f(u('uOffset'), p.offset);
    gl.uniform1f(u('uJitter'), p.jitter);
    gl.uniform1i(u('uSpacingMode'), p.spacing === 'random' ? 1 : 0);
    gl.uniform1f(u('uAngle'), p.angle);
    gl.uniform1f(u('uFeather'), p.feather);
    gl.uniform1f(u('uSeed'), p.seed);
  },
  maxReach: (p) => p.offset * (1 + p.jitter),
  delayMap(p) {
    const a = (p.angle * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    return (x, y) => {
      const s = clampv((x - 0.5) * dx + (y - 0.5) * dy + 0.5, 0, 0.99999);
      return bandDelayJS(Math.floor(s * p.bands), p);
    };
  },
};
