// Animated parameter resolution: keyframe track (or base) + LFO offset,
// clamped to the param range. Pure function of (fx, t) — used identically
// by the preview loop, the time-map viz and the exporter.

import { registry } from '../effects/registry.js';
import { interpKeys } from './keyframes.js';
import { lfoValue } from './lfo.js';

export function resolveParams(fx, t) {
  const mod = registry[fx.type];
  const out = {};
  for (const def of mod.params) {
    const p = fx.params[def.key];
    if (def.type) { // select & co — static
      out[def.key] = p.base;
      continue;
    }
    let v = p.keys?.length ? interpKeys(p.keys, t) : p.base;
    if (p.lfo) v += lfoValue(p.lfo, t);
    v = Math.min(def.max, Math.max(def.min, v));
    if (def.step >= 1) v = Math.round(v);
    out[def.key] = v;
  }
  return out;
}

/** True if any param of the effect is animated. */
export function isAnimated(fx) {
  return Object.values(fx.params).some((p) => p.lfo || p.keys?.length);
}

/**
 * Worst-case delay reach of the whole chain across the clip — sampled at
 * 0.1s steps so the exporter can size its full-res ring buffer.
 */
export function chainMaxReach(chain, ctx) {
  let max = 0;
  const steps = Math.max(2, Math.ceil(ctx.duration / 0.1));
  for (const fx of chain) {
    if (!fx.enabled) continue;
    const mod = registry[fx.type];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * ctx.duration;
      const reach = mod.maxReach(resolveParams(fx, t), { ...ctx, time: t });
      if (reach > max) max = reach;
    }
  }
  return Math.ceil(max);
}
