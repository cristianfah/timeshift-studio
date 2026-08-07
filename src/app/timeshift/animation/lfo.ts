// LFO evaluation — sine / triangle / square / random-step, all phase-locked to
// clip time so preview and export agree deterministically.
//
// Keyframes are owned by the Toolcraft timeline; the LFO is the second, purely
// procedural animation path, and its offset is summed on top of the evaluated
// keyframe value.

import type { NumericParamDef } from "../types";
import { fract, tsHash } from "../util/rand";

export const LFO_SHAPES = [
  ["sine", "Seno"],
  ["triangle", "Triángulo"],
  ["square", "Cuadrada"],
  ["randstep", "Paso aleatorio"],
] as const satisfies readonly (readonly [string, string])[];

export type LfoShape = (typeof LFO_SHAPES)[number][0];

export type Lfo = {
  /** Amount added at full swing, in parameter units. */
  amp: number;
  /** Cycle offset, 0..1. */
  phase: number;
  /** Cycles per second of clip time. */
  rate: number;
  shape: string;
};

export function defaultLfo(def: NumericParamDef): Lfo {
  return {
    amp: (def.max - def.min) * 0.25,
    phase: 0,
    rate: 0.5,
    shape: "sine",
  };
}

/** Signed offset added to the parameter value at clip time t. */
export function lfoValue(lfo: Lfo, t: number): number {
  const ph = t * lfo.rate + lfo.phase;
  let s: number;

  switch (lfo.shape) {
    case "triangle":
      s = 1 - 4 * Math.abs(fract(ph) - 0.5);
      break;
    case "square":
      s = fract(ph) < 0.5 ? 1 : -1;
      break;
    case "randstep":
      s = tsHash(Math.floor(ph)) * 2 - 1;
      break;
    default:
      s = Math.sin(ph * Math.PI * 2);
  }

  return s * lfo.amp;
}
