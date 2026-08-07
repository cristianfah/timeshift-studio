// Animated parameter resolution.
//
// Keyframes come from the Toolcraft timeline (already evaluated at the current
// time by the runtime); the LFO offset is added on top and the result is
// clamped to the parameter range and rounded to its step. Preview, time-map
// and exporter all go through this one function, so they cannot drift apart.

import { registry } from "../effects/registry";
import type { EffectParamValues } from "../types";
import { isSelectParam } from "../types";
import {
  lfoEnabledTarget,
  lfoFieldTarget,
  paramTarget,
} from "../targets";
import { lfoValue, type Lfo } from "./lfo";

/** Reads one runtime value by target. */
export type ValueLookup = (target: string) => unknown;

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Resolve every parameter of one chain slot at clip time `time`.
 *
 * @param evaluated reads keyframe-evaluated values (use the runtime helper)
 * @param raw reads plain values that are never keyframed (LFO settings)
 */
export function resolveSlotParams({
  evaluated,
  raw,
  slot,
  time,
  type,
}: {
  evaluated: ValueLookup;
  raw: ValueLookup;
  slot: number;
  time: number;
  type: string;
}): EffectParamValues {
  const mod = registry[type];
  const out: EffectParamValues = {};

  if (!mod) {
    return out;
  }

  for (const def of mod.params) {
    const target = paramTarget(slot, type, def.key);

    if (isSelectParam(def)) {
      out[def.key] = asString(raw(target), def.def);
      continue;
    }

    let v = asNumber(evaluated(target), def.def);

    if (raw(lfoEnabledTarget(slot, type, def.key)) === true) {
      const lfo: Lfo = {
        amp: asNumber(
          raw(lfoFieldTarget(slot, type, def.key, "amp")),
          (def.max - def.min) * 0.25,
        ),
        phase: asNumber(raw(lfoFieldTarget(slot, type, def.key, "phase")), 0),
        rate: asNumber(raw(lfoFieldTarget(slot, type, def.key, "rate")), 0.5),
        shape: asString(
          raw(lfoFieldTarget(slot, type, def.key, "shape")),
          "sine",
        ),
      };

      v += lfoValue(lfo, time);
    }

    v = Math.min(def.max, Math.max(def.min, v));

    if (def.step >= 1) {
      v = Math.round(v);
    }

    out[def.key] = v;
  }

  return out;
}

/** True when any parameter of the slot is driven by an LFO. */
export function slotHasLfo(
  slot: number,
  type: string,
  raw: ValueLookup,
): boolean {
  const mod = registry[type];

  if (!mod) {
    return false;
  }

  return mod.params.some(
    (def) =>
      !isSelectParam(def) && raw(lfoEnabledTarget(slot, type, def.key)) === true,
  );
}
