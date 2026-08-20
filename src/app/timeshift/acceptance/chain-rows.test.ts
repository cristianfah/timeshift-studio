// Automated proof for every generated chain control.
//
// One test per acceptance row, registered from the row list itself so a new
// control cannot claim coverage without executing a real assertion. Each test
// drives the same resolver the preview and the exporter use: it proves the
// runtime value at that target reaches the effect instance, and that a
// modulator actually moves the parameter it names.

import { describe, expect, it } from "vitest";

import type { ResolvedToolcraftControlSchema } from "@/toolcraft/runtime";

import { appSchema } from "../../app-schema";
import { resolveSlotParams } from "../animation/resolve";
import { registry } from "../effects/registry";
import { modulatorTarget, paramTarget } from "../targets";
import type { EffectParamValues, NumericParamDef } from "../types";
import { isSelectParam } from "../types";
import { buildChainAcceptance } from "./chain-rows";

const controlsByTarget = new Map<string, ResolvedToolcraftControlSchema>(
  (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).map(
      (control) => [control.target, control] as const,
    ),
  ),
);

/** Reads a plain value map the way the runtime lookups do. */
function lookup(values: Record<string, unknown>) {
  return (target: string): unknown => values[target];
}

function resolve(
  slot: number,
  type: string,
  values: Record<string, unknown>,
  time = 0,
): EffectParamValues {
  const read = lookup(values);

  return resolveSlotParams({ evaluated: read, raw: read, slot, time, type });
}

/** A value inside the parameter range that is not its default. */
function alternateValue(def: NumericParamDef): number {
  const alternate = def.def === def.max ? def.min : def.max;

  return def.step >= 1 ? Math.round(alternate) : alternate;
}

function midpoint(def: NumericParamDef): number {
  const value = (def.min + def.max) / 2;

  return def.step >= 1 ? Math.round(value) : value;
}

type ChainRowId = {
  field?: string;
  key: string;
  modulator?: number;
  slot: number;
  type: string;
};

function parseRowId(id: string): ChainRowId | null {
  const modulator = /^fx\.(\d+)\.([A-Za-z]+)\.mod(\d+)\.([a-z]+)$/.exec(id);

  if (modulator) {
    return {
      field: modulator[4],
      key: "",
      modulator: Number(modulator[3]),
      slot: Number(modulator[1]),
      type: modulator[2] ?? "",
    };
  }

  const param = /^fx\.(\d+)\.([A-Za-z]+)\.([A-Za-z0-9]+)$/.exec(id);

  return param
    ? {
        key: param[3] ?? "",
        slot: Number(param[1]),
        type: param[2] ?? "",
      }
    : null;
}

function numericParams(type: string): readonly NumericParamDef[] {
  return (registry[type]?.params ?? []).filter(
    (def): def is NumericParamDef => !isSelectParam(def),
  );
}

function checkParamControl(parsed: ChainRowId, target: string): void {
  const def = registry[parsed.type]?.params.find(
    (candidate) => candidate.key === parsed.key,
  );
  const control = controlsByTarget.get(target);

  expect(def, `${parsed.type} declares ${parsed.key}`).toBeDefined();
  expect(control?.defaultValue).toEqual(def?.def);

  if (!def) {
    return;
  }

  if (isSelectParam(def)) {
    expect(control?.options?.map((option) => option.value)).toEqual(
      def.options.map(([value]) => value),
    );

    for (const [value] of def.options) {
      expect(
        resolve(parsed.slot, parsed.type, { [target]: value })[def.key],
      ).toBe(value);
    }

    return;
  }

  const alternate = alternateValue(def);

  expect(resolve(parsed.slot, parsed.type, {})[def.key]).toBe(def.def);
  expect(resolve(parsed.slot, parsed.type, { [target]: alternate })[def.key]).toBe(
    alternate,
  );
  expect(alternate).not.toBe(def.def);
}

function modulatorValues(
  parsed: Required<Pick<ChainRowId, "modulator">> & ChainRowId,
  driven: NumericParamDef,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const field = (name: "amp" | "enabled" | "parameter" | "phase" | "rate" | "shape") =>
    modulatorTarget(parsed.slot, parsed.type, parsed.modulator, name);

  return {
    [paramTarget(parsed.slot, parsed.type, driven.key)]: midpoint(driven),
    [field("amp")]: (driven.max - driven.min) * 0.25,
    [field("enabled")]: true,
    [field("parameter")]: driven.key,
    [field("phase")]: 0,
    [field("rate")]: 0.5,
    [field("shape")]: "sine",
    ...overrides,
  };
}

/** Clip time where every LFO shape resolves to a distinct offset. */
const PROBE_TIME = 0.2;

function checkModulatorField(parsed: ChainRowId & { modulator: number }): void {
  const driven = numericParams(parsed.type)[0];

  expect(driven, `${parsed.type} has a modulatable parameter`).toBeDefined();

  if (!driven) {
    return;
  }

  const base = modulatorValues(parsed, driven);
  const modulated = resolve(parsed.slot, parsed.type, base, PROBE_TIME)[driven.key];
  const field = (name: "amp" | "enabled" | "parameter" | "phase" | "rate" | "shape") =>
    modulatorTarget(parsed.slot, parsed.type, parsed.modulator, name);

  switch (parsed.field) {
    case "enabled": {
      const off = resolve(
        parsed.slot,
        parsed.type,
        { ...base, [field("enabled")]: false },
        PROBE_TIME,
      )[driven.key];

      expect(modulated).not.toBe(off);
      expect(off).toBe(midpoint(driven));
      break;
    }
    case "parameter": {
      const others = numericParams(parsed.type).filter(
        (def) => def.key !== driven.key,
      );
      const other = others[0];

      if (!other) {
        // Single-parameter effects can only point the modulator at that one
        // parameter; proving it moves is the whole behavior.
        expect(modulated).not.toBe(midpoint(driven));
        break;
      }

      // Full swing at the peak of the cycle, so even a parameter with a
      // coarse step shows the offset instead of rounding it away.
      const switched = resolve(
        parsed.slot,
        parsed.type,
        {
          ...base,
          [paramTarget(parsed.slot, parsed.type, other.key)]: midpoint(other),
          [field("amp")]: other.max - other.min,
          [field("parameter")]: other.key,
          [field("phase")]: 0.25,
        },
        0,
      );

      expect(switched[driven.key]).toBe(midpoint(driven));
      expect(switched[other.key]).not.toBe(midpoint(other));
      break;
    }
    case "phase": {
      const shifted = resolve(
        parsed.slot,
        parsed.type,
        { ...base, [field("phase")]: 0.5 },
        PROBE_TIME,
      )[driven.key];

      expect(shifted).not.toBe(modulated);
      break;
    }
    case "rate": {
      const faster = resolve(
        parsed.slot,
        parsed.type,
        { ...base, [field("rate")]: 4 },
        PROBE_TIME,
      )[driven.key];

      expect(faster).not.toBe(modulated);
      break;
    }
    case "shape": {
      const square = resolve(
        parsed.slot,
        parsed.type,
        { ...base, [field("shape")]: "square" },
        PROBE_TIME,
      )[driven.key];

      expect(square).not.toBe(modulated);
      break;
    }
    default: {
      const silent = resolve(
        parsed.slot,
        parsed.type,
        { ...base, [field("amp")]: 0 },
        PROBE_TIME,
      )[driven.key];

      expect(silent).toBe(midpoint(driven));
      expect(modulated).not.toBe(silent);
    }
  }
}

describe("cadena de efectos: cada control llega al motor", () => {
  for (const row of buildChainAcceptance()) {
    it(row.automatedTestName, () => {
      const parsed = parseRowId(row.id);

      expect(parsed, `row id ${row.id} is parseable`).not.toBeNull();
      expect(controlsByTarget.has(row.target)).toBe(true);

      if (!parsed) {
        return;
      }

      if (parsed.modulator === undefined) {
        checkParamControl(parsed, row.target);
        return;
      }

      checkModulatorField(parsed as ChainRowId & { modulator: number });
    });
  }
});
