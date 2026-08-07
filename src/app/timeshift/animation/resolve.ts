// Animated parameter resolution.
//
// Keyframes come from the Toolcraft timeline (already evaluated at the current
// time by the runtime); modulator offsets are added on top and the result is
// clamped to the parameter range and rounded to its step. Preview, time-map
// and exporter all go through this one function, so they cannot drift apart.

import { registry } from "../effects/registry";
import { modulatorIndexes, modulatorTarget, paramTarget } from "../targets";
import type { EffectParamValues, NumericParamDef } from "../types";
import { isSelectParam } from "../types";
import { lfoValue, type Lfo } from "./lfo";

/** Reads one runtime value by target. */
export type ValueLookup = (target: string) => unknown;

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** Total modulator offset applied to each parameter of a slot at `time`. */
function modulatorOffsets(
  slot: number,
  type: string,
  raw: ValueLookup,
  time: number,
): Map<string, number> {
  const offsets = new Map<string, number>();

  for (const index of modulatorIndexes) {
    if (raw(modulatorTarget(slot, type, index, "enabled")) !== true) {
      continue;
    }

    const key = asString(
      raw(modulatorTarget(slot, type, index, "parameter")),
      "",
    );

    if (!key) {
      continue;
    }

    const lfo: Lfo = {
      amp: asNumber(raw(modulatorTarget(slot, type, index, "amp")), 0),
      phase: asNumber(raw(modulatorTarget(slot, type, index, "phase")), 0),
      rate: asNumber(raw(modulatorTarget(slot, type, index, "rate")), 0.5),
      shape: asString(
        raw(modulatorTarget(slot, type, index, "shape")),
        "sine",
      ),
    };

    offsets.set(key, (offsets.get(key) ?? 0) + lfoValue(lfo, time));
  }

  return offsets;
}

/**
 * Resolve every parameter of one chain slot at clip time `time`.
 *
 * @param evaluated reads keyframe-evaluated values (runtime helper)
 * @param raw reads plain values that are never keyframed (modulator settings)
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

  const offsets = modulatorOffsets(slot, type, raw, time);

  for (const def of mod.params) {
    const target = paramTarget(slot, type, def.key);

    if (isSelectParam(def)) {
      out[def.key] = asString(raw(target), def.def);
      continue;
    }

    const numeric: NumericParamDef = def;
    let v = asNumber(evaluated(target), numeric.def) + (offsets.get(numeric.key) ?? 0);

    v = Math.min(numeric.max, Math.max(numeric.min, v));

    if (numeric.step >= 1) {
      v = Math.round(v);
    }

    out[numeric.key] = v;
  }

  return out;
}

/** True when any modulator of the slot is active. */
export function slotHasModulation(
  slot: number,
  type: string,
  raw: ValueLookup,
): boolean {
  return modulatorIndexes.some(
    (index) => raw(modulatorTarget(slot, type, index, "enabled")) === true,
  );
}
