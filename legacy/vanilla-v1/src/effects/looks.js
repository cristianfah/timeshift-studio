// Global "looks" — one-click chains that replace the current stack.
import { createEffect } from './registry.js';

export const LOOKS = {
  FRAGMENTED: () => [
    createEffect('sliceBands', { bands: 10, offset: 70, jitter: 0.5, spacing: 'random', feather: 0 }),
    createEffect('blockShuffle', { gridX: 16, gridY: 10, maxDelay: 35, interval: 10, proportion: 0.4 }),
  ],
  SMEAR: () => [
    createEffect('timeDisplacement', { mapType: 'gradient', maxDelay: 70, mapRotation: 90 }),
    createEffect('temporalEcho', { echoes: 6, spacing: 2, decay: 0.7, blend: 'normal' }),
  ],
  SUBTLE: () => [
    createEffect('rgbSplit', { delayR: 0, delayG: 2, delayB: 5 }),
    createEffect('temporalEcho', { echoes: 3, spacing: 2, decay: 0.4, blend: 'normal' }),
  ],
  DATAMOSH: () => [
    createEffect('blockShuffle', { gridX: 28, gridY: 18, maxDelay: 70, interval: 5, proportion: 0.85 }),
    createEffect('rgbSplit', { delayR: 0, delayG: 6, delayB: 14 }),
  ],
  GHOST: () => [
    createEffect('temporalEcho', { echoes: 9, spacing: 3, decay: 0.8, blend: 'screen' }),
    createEffect('timeDisplacement', { mapType: 'animnoise', maxDelay: 25, mapScale: 2.5 }),
  ],
  CHROMATIC: () => [
    createEffect('rgbSplit', { delayR: 0, delayG: 18, delayB: 40 }),
    createEffect('sliceBands', { bands: 40, offset: 25, jitter: 0.08, angle: 90, feather: 0.06 }),
  ],
  TRACKER: () => [
    createEffect('rgbSplit', { delayR: 0, delayG: 1, delayB: 3 }),
    createEffect('motionTrack', { style: 'rect', lines: 'vecinos', values: 'yes', maxBoxes: 10 }),
  ],
  PIXELCRASH: () => [
    createEffect('lumaTime', { gridX: 32, gridY: 18, maxDelay: 30, levels: 5 }),
    createEffect('pixelSynth', { charset: 'codigo', cell: 10, ink: 'fuente', rangeMin: 0.05 }),
  ],
  VENDAVAL: () => [
    createEffect('particleWind', { power: 0.22, turb: 3, stepF: 5, grain: 0.5, mix: 0.9 }),
    createEffect('temporalEcho', { echoes: 4, spacing: 3, decay: 0.6, blend: 'screen' }),
  ],
};
