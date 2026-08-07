// SLICE_BANDS — classic slit-scan: N parallel bands, each pulling a different
// past frame. Free band rotation + feathered edges.

import type { EffectModule } from "../types";
import { clampv, tsHash } from "../util/rand";

export type SliceBandsParams = {
  angle: number;
  bands: number;
  feather: number;
  jitter: number;
  offset: number;
  seed: number;
  spacing: string;
};

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

function bandDelayJS(i: number, p: SliceBandsParams): number {
  const n = Math.max(p.bands - 1, 1);
  const base = p.spacing === "random" ? tsHash(i + p.seed * 57) : i / n;
  const jit = (tsHash(i * 3.7 + p.seed * 91) - 0.5) * 2 * p.jitter;

  return clampv(base + jit, 0, 1) * p.offset;
}

const sliceBands: EffectModule<SliceBandsParams> = {
  desc: "El encuadre se parte en bandas paralelas y cada una muestra un frame distinto del pasado.",
  frag,
  label: "Bandas de tiempo",
  params: [
    { def: 12, key: "bands", label: "Bandas", max: 64, min: 2, step: 1 },
    {
      def: 30,
      help: "Retardo de la banda más antigua. Las intermedias se reparten hasta aquí.",
      key: "offset",
      label: "Retardo máximo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: 0.15,
      help: "Desorden aleatorio del retardo de cada banda.",
      key: "jitter",
      label: "Desorden",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: "linear",
      key: "spacing",
      label: "Reparto",
      options: [
        ["linear", "Lineal"],
        ["random", "Aleatorio"],
      ],
      type: "select",
    },
    { def: 90, key: "angle", label: "Ángulo", max: 180, min: 0, step: 1, unit: "°" },
    {
      def: 0.05,
      help: "Fundido entre bandas vecinas. En 0 el corte es duro.",
      key: "feather",
      label: "Fundido",
      max: 0.5,
      min: 0,
      step: 0.01,
    },
    {
      def: 1,
      help: "Cambia la combinación aleatoria sin cambiar su carácter.",
      key: "seed",
      label: "Semilla",
      max: 100,
      min: 0,
      step: 1,
    },
  ],
  presets: {
    BRUTAL: { angle: 90, bands: 8, feather: 0, jitter: 0.6, offset: 90, spacing: "random" },
    DIAGONAL: { angle: 45, bands: 24, feather: 0.12, jitter: 0.1, offset: 45, spacing: "linear" },
    FINO: { angle: 90, bands: 48, feather: 0.02, jitter: 0.05, offset: 20, spacing: "linear" },
  },
  type: "sliceBands",

  delayMap(p) {
    const a = (p.angle * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);

    return (x, y) => {
      const s = clampv((x - 0.5) * dx + (y - 0.5) * dy + 0.5, 0, 0.99999);

      return bandDelayJS(Math.floor(s * p.bands), p);
    };
  },

  maxReach: (p) => p.offset * (1 + p.jitter),

  setUniforms(gl, u, p) {
    gl.uniform1f(u("uBands"), p.bands);
    gl.uniform1f(u("uOffset"), p.offset);
    gl.uniform1f(u("uJitter"), p.jitter);
    gl.uniform1i(u("uSpacingMode"), p.spacing === "random" ? 1 : 0);
    gl.uniform1f(u("uAngle"), p.angle);
    gl.uniform1f(u("uFeather"), p.feather);
    gl.uniform1f(u("uSeed"), p.seed);
  },
};

export default sliceBands;
