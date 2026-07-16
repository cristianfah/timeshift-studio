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
};
