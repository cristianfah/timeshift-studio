// CELL_MAP — luminance becomes spatial time remapping across a grid: bright
// cells look further into the past (or the reverse). The map is the video
// itself, so the remap "follows" the image.

import type { EffectModule } from "../types";
import { clampv } from "../util/rand";

export type LumaTimeParams = {
  gridX: number;
  gridY: number;
  invert: string;
  levels: number;
  maxDelay: number;
  mode: string;
};

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

const lumaTime: EffectModule<LumaTimeParams> = {
  desc: "El brillo del propio vídeo decide cuánto retrocede cada celda: las zonas claras miran al pasado.",
  frag,
  label: "Mapa por brillo",
  params: [
    { def: 24, key: "gridX", label: "Columnas", max: 96, min: 2, step: 1 },
    { def: 14, key: "gridY", label: "Filas", max: 96, min: 2, step: 1 },
    {
      def: 45,
      help: "Retardo de las zonas más brillantes, o de las más oscuras si inviertes.",
      key: "maxDelay",
      label: "Retardo máximo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: 0,
      help: "Reparte el brillo en escalones de tiempo. En 0 la transición es continua.",
      key: "levels",
      label: "Escalones",
      max: 16,
      min: 0,
      step: 1,
    },
    {
      def: "cells",
      key: "mode",
      label: "Detalle",
      options: [
        ["cells", "Celdas"],
        ["pixel", "Por píxel"],
      ],
      type: "select",
    },
    {
      def: "no",
      key: "invert",
      label: "Invertir",
      options: [
        ["no", "No"],
        ["yes", "Sí"],
      ],
      type: "select",
    },
  ],
  presets: {
    LUMAGRID: { gridX: 24, gridY: 14, levels: 0, maxDelay: 45 },
    POSTER: { gridX: 40, gridY: 24, invert: "yes", levels: 4, maxDelay: 90 },
    SUAVE: { levels: 0, maxDelay: 60, mode: "pixel" },
  },
  type: "lumaTime",

  delayMap(p, ctx) {
    // ctx.luma samples the real preview frame (top-down coords) when available.
    return (x, y) => {
      let qx = x;
      let qyTop = 1 - y;

      if (p.mode !== "pixel") {
        qx = (Math.floor(x * p.gridX) + 0.5) / p.gridX;
        qyTop = (Math.floor((1 - y) * p.gridY) + 0.5) / p.gridY;
      }

      let l = ctx.luma ? ctx.luma(qx, qyTop) : 0.5;

      if (p.invert === "yes") {
        l = 1 - l;
      }

      if (p.levels >= 2) {
        l = Math.floor(l * p.levels) / Math.max(p.levels - 1, 1);
      }

      return clampv(l, 0, 1) * p.maxDelay;
    };
  },

  maxReach: (p) => p.maxDelay,

  setUniforms(gl, u, p) {
    gl.uniform1f(u("uGridX"), p.gridX);
    gl.uniform1f(u("uGridY"), p.gridY);
    gl.uniform1f(u("uMaxDelay"), p.maxDelay);
    gl.uniform1f(u("uLevels"), p.levels);
    gl.uniform1i(u("uInvert"), p.invert === "yes" ? 1 : 0);
    gl.uniform1i(u("uPixelMode"), p.mode === "pixel" ? 1 : 0);
  },
};

export default lumaTime;
