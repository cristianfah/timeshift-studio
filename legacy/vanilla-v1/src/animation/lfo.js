// LFO evaluation — sine / triangle / square / random-step, all phase-locked
// to clip time so preview and export agree deterministically.

import { tsHash, fract } from '../util/rand.js';

export const LFO_SHAPES = [
  ['sine', 'SENO'],
  ['triangle', 'TRIÁNGULO'],
  ['square', 'CUADRADA'],
  ['randstep', 'PASO ALEATORIO'],
];

export function defaultLfo(def) {
  return {
    shape: 'sine',
    rate: 0.5,                          // Hz (cycles per second of clip time)
    amp: (def.max - def.min) * 0.25,    // in param units
    phase: 0,                           // 0..1 cycle offset
  };
}

/** Signed offset added to the param value at clip time t. */
export function lfoValue(lfo, t) {
  const ph = t * lfo.rate + lfo.phase;
  let s;
  switch (lfo.shape) {
    case 'triangle': s = 1 - 4 * Math.abs(fract(ph) - 0.5); break;
    case 'square': s = fract(ph) < 0.5 ? 1 : -1; break;
    case 'randstep': s = tsHash(Math.floor(ph)) * 2 - 1; break;
    default: s = Math.sin(ph * Math.PI * 2);
  }
  return s * lfo.amp;
}
