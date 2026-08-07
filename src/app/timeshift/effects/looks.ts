// Global "looks" — one-click chains that replace the current stack.
//
// Each entry is an ordered list of effect types plus the parameter overrides
// that define the look. The schema layer turns them into chain slots.

import type { EffectParamValues } from "../types";

export type LookStep = {
  type: string;
  values: EffectParamValues;
};

export type Look = {
  label: string;
  steps: readonly LookStep[];
};

export const LOOKS: Record<string, Look> = {
  CHROMATIC: {
    label: "Cromático",
    steps: [
      { type: "rgbSplit", values: { delayB: 40, delayG: 18, delayR: 0 } },
      {
        type: "sliceBands",
        values: { angle: 90, bands: 40, feather: 0.06, jitter: 0.08, offset: 25 },
      },
    ],
  },
  DATAMOSH: {
    label: "Datamosh",
    steps: [
      {
        type: "blockShuffle",
        values: {
          gridX: 28,
          gridY: 18,
          interval: 5,
          maxDelay: 70,
          proportion: 0.85,
        },
      },
      { type: "rgbSplit", values: { delayB: 14, delayG: 6, delayR: 0 } },
    ],
  },
  FRAGMENTED: {
    label: "Fragmentado",
    steps: [
      {
        type: "sliceBands",
        values: {
          bands: 10,
          feather: 0,
          jitter: 0.5,
          offset: 70,
          spacing: "random",
        },
      },
      {
        type: "blockShuffle",
        values: {
          gridX: 16,
          gridY: 10,
          interval: 10,
          maxDelay: 35,
          proportion: 0.4,
        },
      },
    ],
  },
  GHOST: {
    label: "Fantasma",
    steps: [
      {
        type: "temporalEcho",
        values: { blend: "screen", decay: 0.8, echoes: 9, spacing: 3 },
      },
      {
        type: "timeDisplacement",
        values: { mapScale: 2.5, mapType: "animnoise", maxDelay: 25 },
      },
    ],
  },
  PIXELCRASH: {
    label: "Pixelcrash",
    steps: [
      {
        type: "lumaTime",
        values: { gridX: 32, gridY: 18, levels: 5, maxDelay: 30 },
      },
      {
        type: "pixelSynth",
        values: { cell: 10, charset: "codigo", ink: "fuente", rangeMin: 0.05 },
      },
    ],
  },
  SMEAR: {
    label: "Arrastre",
    steps: [
      {
        type: "timeDisplacement",
        values: { mapRotation: 90, mapType: "gradient", maxDelay: 70 },
      },
      {
        type: "temporalEcho",
        values: { blend: "normal", decay: 0.7, echoes: 6, spacing: 2 },
      },
    ],
  },
  SUBTLE: {
    label: "Sutil",
    steps: [
      { type: "rgbSplit", values: { delayB: 5, delayG: 2, delayR: 0 } },
      {
        type: "temporalEcho",
        values: { blend: "normal", decay: 0.4, echoes: 3, spacing: 2 },
      },
    ],
  },
  TRACKER: {
    label: "Tracker",
    steps: [
      { type: "rgbSplit", values: { delayB: 3, delayG: 1, delayR: 0 } },
      {
        type: "motionTrack",
        values: { lines: "vecinos", maxBoxes: 10, style: "rect", values: "yes" },
      },
    ],
  },
  VENDAVAL: {
    label: "Vendaval",
    steps: [
      {
        type: "particleWind",
        values: { grain: 0.5, mix: 0.9, power: 0.22, stepF: 5, turb: 3 },
      },
      {
        type: "temporalEcho",
        values: { blend: "screen", decay: 0.6, echoes: 4, spacing: 3 },
      },
    ],
  },
};

export const lookNames: readonly string[] = Object.keys(LOOKS);
