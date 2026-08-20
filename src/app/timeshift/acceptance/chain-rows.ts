// Acceptance rows for the generated chain controls.
//
// The schema declares every effect parameter for every chain position, so the
// rows are generated from the same registry walk. Each row names one automated
// test and one browser test; `chain-rows.test.ts` registers the automated side
// from this same list, which keeps names and coverage impossible to desync.

import type { ToolcraftComponentAcceptance } from "../../acceptance/types";
import { LFO_SHAPES } from "../animation/lfo";
import { registry } from "../effects/registry";
import {
  CHAIN_SLOTS,
  MODULATORS_PER_SLOT,
  modulatorTarget,
  paramTarget,
} from "../targets";
import type { EffectParamDef, NumericParamDef } from "../types";
import { isSelectParam } from "../types";

const FIXTURE = "clip de prueba con el efecto en la posición de cadena";

/** One row per generated control, shaped like the schema control it proves. */
export type ChainAcceptanceRow = ToolcraftComponentAcceptance & {
  target: string;
};

/**
 * Browser proof is grouped by effect: one test drives every parameter of one
 * effect through the panel and proves the product output changes for each of
 * them, in more than one chain position. The automated test stays per control.
 */
export function chainParamsBrowserTestName(label: string): string {
  return `browser: los parámetros de ${label} cambian el render`;
}

export function chainModulatorBrowserTestName(label: string): string {
  return `browser: los moduladores de ${label} animan el efecto`;
}

function paramRow(
  slot: number,
  type: string,
  label: string,
  def: EffectParamDef,
): ChainAcceptanceRow {
  const position = slot + 1;
  const test = `fx ${slot} ${type} ${def.key} llega al efecto`;
  const shared = {
    automated: true,
    automatedTestName: test,
    browser: true,
    browserTestName: chainParamsBrowserTestName(label),
    evidence: "product-output" as const,
    fixture: FIXTURE,
    id: `fx.${slot}.${type}.${def.key}`,
    kind: "control" as const,
    target: paramTarget(slot, type, def.key),
  };

  if (isSelectParam(def)) {
    const options = def.options.map(([value]) => value);
    const compact =
      def.options.length <= 4 &&
      def.options.every(([, optionLabel]) => optionLabel.length <= 9) &&
      def.options.reduce((n, [, optionLabel]) => n + optionLabel.length, 0) <= 24;

    return {
      ...shared,
      componentType: compact ? "segmented" : "select",
      expectedObservable: `Cada opción de ${def.label} en ${label} · ${position} cambia la rama que el shader ejecuta y con ella el render.`,
      optionCoverage: options,
      userAction: `Elegir cada opción de ${def.label} en ${label} · ${position}.`,
    };
  }

  return {
    ...shared,
    componentType: "slider",
    expectedObservable: `Arrastrar ${def.label} en ${label} · ${position} cambia el uniforme que recibe el shader y el render en vivo; con un keyframe, el valor evaluado en cada instante es el que llega al shader.`,
    timelineCoverage: "keyframes",
    userAction: `Arrastrar ${def.label} de ${def.min} a ${def.max} en ${label} · ${position} y fijar un keyframe.`,
  };
}

type ModulatorField = {
  componentType: string;
  key: "amp" | "enabled" | "parameter" | "phase" | "rate" | "shape";
  label: string;
  observable: string;
  optionsFor?: (numeric: readonly NumericParamDef[]) => readonly string[];
};

const MODULATOR_FIELDS: readonly ModulatorField[] = [
  {
    componentType: "switch",
    key: "enabled",
    label: "Activo",
    observable:
      "Activarlo hace que el parámetro elegido oscile durante la reproducción en lugar de quedarse fijo.",
  },
  {
    componentType: "select",
    key: "parameter",
    label: "Parámetro",
    observable:
      "Elegir otro parámetro mueve la oscilación a ese parámetro y el render cambia en consecuencia.",
    optionsFor: (numeric) => numeric.map((def) => def.key),
  },
  {
    componentType: "slider",
    key: "phase",
    label: "Fase",
    observable:
      "La fase desplaza el punto del ciclo en el que arranca la oscilación en cada instante de la timeline.",
  },
  {
    componentType: "slider",
    key: "rate",
    label: "Velocidad",
    observable:
      "La velocidad cambia cuántos ciclos por segundo recorre la modulación.",
  },
  {
    componentType: "select",
    key: "shape",
    label: "Forma",
    observable:
      "Cada forma de onda da un recorrido distinto al parámetro modulado.",
    optionsFor: () => LFO_SHAPES.map(([value]) => value),
  },
  {
    componentType: "slider",
    key: "amp",
    label: "Amplitud",
    observable:
      "La amplitud fija cuánto se aparta el parámetro de su valor; en 0 la modulación no altera el render.",
  },
];

function modulatorRows(
  slot: number,
  type: string,
  label: string,
  numeric: readonly NumericParamDef[],
): ChainAcceptanceRow[] {
  const rows: ChainAcceptanceRow[] = [];

  for (let index = 0; index < MODULATORS_PER_SLOT; index += 1) {
    for (const field of MODULATOR_FIELDS) {
      const test = `fx ${slot} ${type} mod${index} ${field.key} modula el efecto`;
      const options = field.optionsFor?.(numeric);

      rows.push({
        automated: true,
        automatedTestName: test,
        browser: true,
        browserTestName: chainModulatorBrowserTestName(label),
        componentType: field.componentType,
        evidence: "product-output",
        expectedObservable: `${label} · ${slot + 1} · Modulador ${index + 1}: ${field.observable}`,
        fixture: FIXTURE,
        id: `fx.${slot}.${type}.mod${index}.${field.key}`,
        kind: "control",
        target: modulatorTarget(slot, type, index, field.key),
        userAction: `Ajustar ${field.label} en el modulador ${index + 1} de ${label} · ${slot + 1} y reproducir.`,
        ...(field.componentType === "slider"
          ? { timelineCoverage: "keyframes" as const }
          : {}),
        ...(options && options.length > 1 ? { optionCoverage: options } : {}),
      });
    }
  }

  return rows;
}

/** Every generated chain row, in schema order. */
export function buildChainAcceptance(): ChainAcceptanceRow[] {
  const rows: ChainAcceptanceRow[] = [];

  for (let slot = 0; slot < CHAIN_SLOTS; slot += 1) {
    for (const [type, mod] of Object.entries(registry)) {
      for (const def of mod.params) {
        rows.push(paramRow(slot, type, mod.label, def));
      }

      const numeric = mod.params.filter(
        (def): def is NumericParamDef => !isSelectParam(def),
      );

      if (numeric.length > 0) {
        rows.push(...modulatorRows(slot, type, mod.label, numeric));
      }
    }
  }

  return rows;
}
