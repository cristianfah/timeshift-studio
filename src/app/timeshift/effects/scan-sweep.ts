// SCAN_SWEEP — a band sweeps across the frame over the clip; inside the band
// time is delayed or frozen (rolling shutter as a visible wipe).

import type { EffectModule, RenderContext } from "../types";
import { clampv, fract } from "../util/rand";

export type ScanSweepParams = {
  bandWidth: number;
  delayInside: number;
  direction: number;
  mode: string;
  sweepSpeed: number;
};

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

function sweepDelay(
  x: number,
  y: number,
  p: ScanSweepParams,
  ctx: RenderContext,
): number {
  const a = (p.direction * Math.PI) / 180;
  const s = clampv(
    (x - 0.5) * Math.cos(a) + (y - 0.5) * Math.sin(a) + 0.5,
    0,
    1,
  );
  const pos = fract((ctx.time / Math.max(ctx.duration, 0.001)) * p.sweepSpeed);
  const behind = fract(pos - s + 1);

  if (behind > p.bandWidth) {
    return 0;
  }

  if (p.mode === "freeze") {
    const sweepSecs =
      Math.max(ctx.duration, 0.001) / Math.max(p.sweepSpeed, 0.001);

    return behind * sweepSecs * ctx.fps;
  }

  return p.delayInside;
}

const scanSweep: EffectModule<ScanSweepParams> = {
  desc: "Una banda barre el encuadre y, dentro de ella, el tiempo se retrasa o se congela.",
  frag,
  label: "Barrido de escaneo",
  params: [
    {
      def: 0,
      key: "direction",
      label: "Dirección",
      max: 360,
      min: 0,
      step: 1,
      unit: "°",
    },
    {
      def: 0.25,
      key: "bandWidth",
      label: "Ancho de banda",
      max: 1,
      min: 0.02,
      step: 0.01,
    },
    {
      def: 30,
      help: "Retardo dentro de la banda. En modo Congelar lo calcula el barrido.",
      key: "delayInside",
      label: "Retardo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: 1,
      help: "Barridos completos a lo largo del clip.",
      key: "sweepSpeed",
      label: "Velocidad",
      max: 4,
      min: 0.1,
      step: 0.05,
    },
    {
      def: "delay",
      key: "mode",
      label: "Modo",
      options: [
        ["delay", "Retraso fijo"],
        ["freeze", "Congelar"],
      ],
      type: "select",
    },
  ],
  presets: {
    BARRIDO_V: {
      bandWidth: 0.3,
      delayInside: 40,
      direction: 90,
      mode: "delay",
      sweepSpeed: 1,
    },
    OBTURADOR: { bandWidth: 0.5, direction: 0, mode: "freeze", sweepSpeed: 0.5 },
    RAFAGA: {
      bandWidth: 0.15,
      delayInside: 70,
      direction: 0,
      mode: "delay",
      sweepSpeed: 2,
    },
  },
  type: "scanSweep",

  delayMap(p, ctx) {
    return (x, y) => sweepDelay(x, y, p, ctx);
  },

  maxReach(p, ctx) {
    if (p.mode === "freeze") {
      const sweepSecs = (ctx?.duration ?? 5) / Math.max(p.sweepSpeed, 0.001);

      return p.bandWidth * sweepSecs * (ctx?.fps ?? 30);
    }

    return p.delayInside;
  },

  setUniforms(gl, u, p, ctx) {
    gl.uniform1f(u("uDirection"), p.direction);
    gl.uniform1f(u("uBandWidth"), p.bandWidth);
    gl.uniform1f(u("uDelayInside"), p.delayInside);
    gl.uniform1f(u("uSweepSpeed"), p.sweepSpeed);
    gl.uniform1f(u("uDuration"), ctx.duration);
    gl.uniform1i(u("uMode"), p.mode === "freeze" ? 1 : 0);
  },
};

export default scanSweep;
