// Effect registry — every module is hot-swappable in the chain.
import sliceBands from './sliceBands.js';
import timeDisplacement from './timeDisplacement.js';
import blockShuffle from './blockShuffle.js';
import temporalEcho from './temporalEcho.js';
import rgbSplit from './rgbSplit.js';
import scanSweep from './scanSweep.js';

import { uid } from '../state.js';

const modules = [sliceBands, timeDisplacement, blockShuffle, temporalEcho, rgbSplit, scanSweep];

export const registry = Object.fromEntries(modules.map((m) => [m.type, m]));
export const effectTypes = modules.map((m) => ({ type: m.type, label: m.label }));

/**
 * Create a chain instance of an effect. Every numeric param becomes an
 * animatable slot: { base, lfo: null|{shape,rate,amp,phase}, keys: [] }.
 */
export function createEffect(type, overrides = {}) {
  const mod = registry[type];
  if (!mod) throw new Error(`unknown effect: ${type}`);
  const params = {};
  for (const def of mod.params) {
    const base = overrides[def.key] ?? def.def;
    params[def.key] = def.type
      ? { base }                       // select & co: static
      : { base, lfo: null, keys: [] }; // numeric: animatable
  }
  return { id: uid(), type, enabled: true, collapsed: false, params };
}

/** Static parameter snapshot (no animation applied). */
export function baseParams(fx) {
  const out = {};
  for (const [k, v] of Object.entries(fx.params)) out[k] = v.base;
  return out;
}

/** Worst-case delay (frames) an effect may request with given values. */
export function effectReach(fx, values, ctx) {
  return registry[fx.type]?.maxReach(values, ctx) ?? 0;
}
