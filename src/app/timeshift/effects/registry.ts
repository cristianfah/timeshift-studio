// Effect registry — every module is hot-swappable in the chain.

import type {
  AnyEffectModule,
  ChainItem,
  EffectParamDef,
  EffectParamValues,
  EffectRegistry,
  RenderContext,
} from "../types";
import blockShuffle from "./block-shuffle";
import lumaTime from "./luma-time";
import motionTrack from "./motion-track";
import particleWind from "./particle-wind";
import pixelSynth from "./pixel-synth";
import rgbSplit from "./rgb-split";
import scanSweep from "./scan-sweep";
import sliceBands from "./slice-bands";
import temporalEcho from "./temporal-echo";
import timeDisplacement from "./time-displacement";

const modules = [
  sliceBands,
  timeDisplacement,
  blockShuffle,
  temporalEcho,
  rgbSplit,
  scanSweep,
  lumaTime,
  pixelSynth,
  particleWind,
  motionTrack,
] as unknown as readonly AnyEffectModule[];

export const registry: EffectRegistry = Object.freeze(
  Object.fromEntries(modules.map((m) => [m.type, m])),
);

export const effectTypes: readonly { label: string; type: string }[] =
  modules.map((m) => ({ label: m.label, type: m.type }));

export function getEffectModule(type: string): AnyEffectModule | undefined {
  return registry[type];
}

/** Schema-facing defaults for one effect type. */
export function defaultParamValues(type: string): EffectParamValues {
  const mod = registry[type];
  const out: EffectParamValues = {};

  for (const def of mod?.params ?? []) {
    out[def.key] = def.def;
  }

  return out;
}

export function getParamDef(
  type: string,
  key: string,
): EffectParamDef | undefined {
  return registry[type]?.params.find((def) => def.key === key);
}

/** Worst-case delay (frames) an effect may request with given values. */
export function effectReach(
  fx: ChainItem,
  values: EffectParamValues,
  ctx: RenderContext,
): number {
  return registry[fx.type]?.maxReach(values, ctx) ?? 0;
}

/**
 * Worst-case delay reach of the whole chain across the clip — sampled at 0.1s
 * steps so the exporter can size its full-res ring buffer.
 */
export function chainMaxReach(
  chain: readonly ChainItem[],
  ctx: Omit<RenderContext, "time">,
  valuesAt: (fx: ChainItem, time: number) => EffectParamValues,
): number {
  let max = 0;
  const steps = Math.max(2, Math.ceil(ctx.duration / 0.1));

  for (const fx of chain) {
    if (!fx.enabled) {
      continue;
    }

    const mod = registry[fx.type];

    if (!mod) {
      continue;
    }

    for (let i = 0; i <= steps; i += 1) {
      const time = (i / steps) * ctx.duration;
      const reach = mod.maxReach(valuesAt(fx, time), { ...ctx, time });

      if (reach > max) {
        max = reach;
      }
    }
  }

  return Math.ceil(max);
}
