// Shared helpers for effect modules (JS side).
export { tsHash, tsHash2, fbm3, fract, lerp } from '../util/rand.js';

export function clampv(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
