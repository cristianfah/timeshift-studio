// SCAN_SWEEP — a band sweeps across the frame over the clip; inside the
// band time is delayed or frozen (rolling shutter as a visible wipe).

import { fract, clampv } from './common.js';

const frag = `
uniform float uDirection, uBandWidth, uDelayInside, uSweepSpeed, uDuration;
uniform int uMode; // 0 delay, 1 freeze

void main() {
  float a = radians(uDirection);
  vec2 dir = vec2(cos(a), sin(a));
  float s = clamp(dot(v_uv - 0.5, dir) + 0.5, 0.0, 1.0);
  float pos = fract(uTime / max(uDuration, 0.001) * uSweepSpeed);
  float behind = fract(pos - s + 1.0); // distance behind the sweep front, wrapped

  float edge = max(uBandWidth * 0.15, 0.005);
  float mask = smoothstep(0.0, edge, behind)
             * (1.0 - smoothstep(uBandWidth - edge, uBandWidth, behind));

  float delay;
  if (uMode == 1) {
    // freeze: show the frame from the moment the front passed this position
    float sweepSecs = max(uDuration, 0.001) / max(uSweepSpeed, 0.001);
    delay = behind * sweepSecs * uFps;
  } else {
    delay = uDelayInside;
  }

  vec4 base = texture(uPrev, v_uv);
  vec4 shifted = frameAtSmooth(v_uv, delay);
  outColor = vec4(mix(base, shifted, mask).rgb, 1.0);
}`;

function sweepDelay(x, y, p, ctx) {
  const a = (p.direction * Math.PI) / 180;
  const s = clampv((x - 0.5) * Math.cos(a) + (y - 0.5) * Math.sin(a) + 0.5, 0, 1);
  const pos = fract((ctx.time / Math.max(ctx.duration, 0.001)) * p.sweepSpeed);
  const behind = fract(pos - s + 1);
  if (behind > p.bandWidth) return 0;
  if (p.mode === 'freeze') {
    const sweepSecs = Math.max(ctx.duration, 0.001) / Math.max(p.sweepSpeed, 0.001);
    return behind * sweepSecs * ctx.fps;
  }
  return p.delayInside;
}

export default {
  type: 'scanSweep',
  label: 'SCAN_SWEEP',
  params: [
    { key: 'direction',   label: 'DIRECCIÓN', min: 0, max: 360, step: 1, def: 0 },
    { key: 'bandWidth',   label: 'ANCHO BANDA', min: 0.02, max: 1, step: 0.01, def: 0.25 },
    { key: 'delayInside', label: 'DELAY (f)', min: 0, max: 150, step: 1, def: 30 },
    { key: 'sweepSpeed',  label: 'VELOCIDAD', min: 0.1, max: 4, step: 0.05, def: 1 },
    { key: 'mode',        label: 'MODO', type: 'select', def: 'delay',
      options: [['delay', 'RETRASO'], ['freeze', 'CONGELAR']] },
  ],
  presets: {
    BARRIDO_V: { direction: 90, bandWidth: 0.3, delayInside: 40, sweepSpeed: 1, mode: 'delay' },
    OBTURADOR: { direction: 0, bandWidth: 0.5, sweepSpeed: 0.5, mode: 'freeze' },
    RAFAGA:    { direction: 0, bandWidth: 0.15, delayInside: 70, sweepSpeed: 2, mode: 'delay' },
  },
  frag,
  setUniforms(gl, u, p, ctx) {
    gl.uniform1f(u('uDirection'), p.direction);
    gl.uniform1f(u('uBandWidth'), p.bandWidth);
    gl.uniform1f(u('uDelayInside'), p.delayInside);
    gl.uniform1f(u('uSweepSpeed'), p.sweepSpeed);
    gl.uniform1f(u('uDuration'), ctx.duration);
    gl.uniform1i(u('uMode'), p.mode === 'freeze' ? 1 : 0);
  },
  maxReach(p, ctx) {
    if (p.mode === 'freeze') {
      const sweepSecs = (ctx?.duration ?? 5) / Math.max(p.sweepSpeed, 0.001);
      return p.bandWidth * sweepSecs * (ctx?.fps ?? 30);
    }
    return p.delayInside;
  },
  delayMap(p, ctx) {
    return (x, y) => sweepDelay(x, y, p, ctx);
  },
};
