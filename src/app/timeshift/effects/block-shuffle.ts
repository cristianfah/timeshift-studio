// BLOCK_SHUFFLE — grid of blocks, each frozen/delayed by a random offset,
// re-randomized every N frames. The fragmented "datamosh UI" look.

import type { EffectModule } from "../types";
import { tsHash2 } from "../util/rand";

export type BlockShuffleParams = {
  gridX: number;
  gridY: number;
  interval: number;
  maxDelay: number;
  proportion: number;
  seed: number;
};

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

const blockShuffle: EffectModule<BlockShuffleParams> = {
  desc: "Cuadrícula de bloques congelados o retrasados al azar que se rebarajan cada pocos frames.",
  frag,
  label: "Bloques barajados",
  params: [
    { def: 12, key: "gridX", label: "Columnas", max: 64, min: 2, step: 1 },
    { def: 8, key: "gridY", label: "Filas", max: 64, min: 2, step: 1 },
    {
      def: 40,
      key: "maxDelay",
      label: "Retardo máximo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: 12,
      help: "Cada cuántos frames se rebaraja qué bloques miran al pasado.",
      key: "interval",
      label: "Rebarajar cada",
      max: 120,
      min: 1,
      step: 1,
      unit: "f",
    },
    {
      def: 0.7,
      help: "Fracción de bloques afectados. El resto muestra el presente.",
      key: "proportion",
      label: "Proporción",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: 7,
      help: "Cambia la combinación aleatoria sin cambiar su carácter.",
      key: "seed",
      label: "Semilla",
      max: 100,
      min: 0,
      step: 1,
    },
  ],
  presets: {
    DATAMOSH: { gridX: 24, gridY: 16, interval: 6, maxDelay: 60, proportion: 0.85 },
    GLITCH_FINO: { gridX: 48, gridY: 27, interval: 3, maxDelay: 90, proportion: 0.6 },
    MOSAICO: { gridX: 8, gridY: 6, interval: 24, maxDelay: 30, proportion: 0.5 },
  },
  type: "blockShuffle",

  delayMap(p, ctx) {
    const epoch = Math.floor((ctx.time * ctx.fps) / Math.max(p.interval, 1));

    return (x, y) => {
      const cx = Math.floor(x * p.gridX);
      const cy = Math.floor(y * p.gridY);
      const selv = tsHash2(cx * 1.7 + epoch * 31, cy * 1.7 + p.seed * 5);
      const amt = tsHash2(cx + p.seed * 13 + epoch * 101, cy + epoch * 7);

      return selv < p.proportion ? amt * p.maxDelay : 0;
    };
  },

  maxReach: (p) => p.maxDelay,

  setUniforms(gl, u, p) {
    gl.uniform1f(u("uGridX"), p.gridX);
    gl.uniform1f(u("uGridY"), p.gridY);
    gl.uniform1f(u("uMaxDelay"), p.maxDelay);
    gl.uniform1f(u("uInterval"), p.interval);
    gl.uniform1f(u("uProportion"), p.proportion);
    gl.uniform1f(u("uSeed"), p.seed);
  },
};

export default blockShuffle;
