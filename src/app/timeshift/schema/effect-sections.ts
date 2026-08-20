// Generates the per-slot effect control sections.
//
// Toolcraft schemas are static, so the chain is a fixed pool of CHAIN_SLOTS
// positions and every position declares the controls of all ten effect types.
// A single `fx.selection` discriminator ("<slot>:<type>") keeps exactly one
// effect visible, which is what lets keyframes, reset, undo/redo, persistence
// and settings transfer stay runtime-owned per chain position.

import type {
  ToolcraftControlSchema,
  ToolcraftControlSectionSchema,
} from "@/toolcraft/runtime";

import { registry } from "../effects/registry";
import {
  CHAIN_SLOTS,
  MODULATORS_PER_SLOT,
  modulatorTarget,
  paramTarget,
  slotSelectionTarget,
  slotSelectionValue,
} from "../targets";
import type { EffectParamDef, NumericParamDef } from "../types";
import { isSelectParam } from "../types";
import { LFO_SHAPES } from "../animation/lfo";

/** Controls per section, from the Toolcraft layout contract. */
const MAX_SECTION_CONTROLS = 7;

/**
 * Every control in a slot section applies whenever that section is on screen:
 * the chain position and its effect type are chosen in Layers and the effect
 * browser, and the section's own condition already hides the other branches.
 */
const ALWAYS = { mode: "always" } as const;

function controlKey(key: string): string {
  return key;
}

function buildParamControl(
  slot: number,
  type: string,
  def: EffectParamDef,
): ToolcraftControlSchema {
  const target = paramTarget(slot, type, def.key);

  if (isSelectParam(def)) {
    const compact =
      def.options.length <= 4 &&
      def.options.every(([, label]) => label.length <= 9) &&
      def.options.reduce((n, [, label]) => n + label.length, 0) <= 24;

    return {
      applicability: ALWAYS,
      defaultValue: def.def,
      label: def.label,
      options: def.options.map(([value, label]) => ({ label, value })),
      performanceReason:
        "Cambia la rama del shader del efecto sin cambiar cuántos píxeles ni cuántos pases se procesan.",
      performanceRole: "responsiveness",
      target,
      type: compact ? "segmented" : "select",
      ...(def.help ? { description: def.help } : {}),
    };
  }

  return {
    applicability: ALWAYS,
    defaultValue: def.def,
    label: def.label,
    max: def.max,
    min: def.min,
    performanceReason:
      "Se arrastra en vivo sobre el clip en reproducción y reevalúa el shader cada frame.",
    performanceRole: "responsiveness",
    step: def.step,
    target,
    type: "slider",
    ...(def.unit ? { unit: def.unit } : {}),
    ...(def.help ? { description: def.help } : {}),
  };
}

/** Splits an effect's parameters into sections of at most seven controls. */
function chunkParams(
  params: readonly EffectParamDef[],
): readonly (readonly EffectParamDef[])[] {
  if (params.length <= MAX_SECTION_CONTROLS) {
    return [params];
  }

  const chunks: EffectParamDef[][] = [];

  // Aim for balanced chunks rather than a full one plus a stub.
  const chunkCount = Math.ceil(params.length / MAX_SECTION_CONTROLS);
  const size = Math.ceil(params.length / chunkCount);

  for (let i = 0; i < params.length; i += size) {
    chunks.push([...params.slice(i, i + size)]);
  }

  return chunks;
}

function sectionTitle(
  label: string,
  slot: number,
  part: number,
  partCount: number,
): string {
  // Titles must be unique across the whole schema, and the slot number is the
  // chain position the user already sees in the layers panel.
  const suffix = partCount > 1 ? ` (${part + 1}/${partCount})` : "";

  return `${label} · ${slot + 1}${suffix}`;
}

function buildEffectSections(
  slot: number,
  type: string,
): ToolcraftControlSectionSchema[] {
  const mod = registry[type];

  if (!mod) {
    return [];
  }

  const visibleWhen = {
    equals: slotSelectionValue(slot, type),
    target: slotSelectionTarget(),
  };
  const chunks = chunkParams(mod.params);

  return chunks.map((chunk, part) => {
    const controls: Record<string, ToolcraftControlSchema> = {};

    for (const def of chunk) {
      controls[controlKey(def.key)] = buildParamControl(slot, type, def);
    }

    return {
      controls,
      id: `fx-${slot}-${type.toLowerCase()}-${part}`,
      title: sectionTitle(mod.label, slot, part, chunks.length),
      visibleWhen,
    } satisfies ToolcraftControlSectionSchema;
  });
}

function buildModulatorSections(
  slot: number,
  type: string,
): ToolcraftControlSectionSchema[] {
  const mod = registry[type];

  if (!mod) {
    return [];
  }

  const numeric = mod.params.filter(
    (def): def is NumericParamDef => !isSelectParam(def),
  );

  if (numeric.length === 0) {
    return [];
  }

  const visibleWhen = {
    equals: slotSelectionValue(slot, type),
    target: slotSelectionTarget(),
  };

  return Array.from({ length: MODULATORS_PER_SLOT }, (_, i) => {
    const first = numeric[0];

    return {
      controls: {
        enabled: {
          applicability: ALWAYS,
          defaultValue: false,
          label: "Activo",
          performanceReason:
            "Añade una evaluación de LFO por frame; el coste del pase no cambia.",
          performanceRole: "responsiveness",
          target: modulatorTarget(slot, type, i, "enabled"),
          type: "switch",
        },
        parameter: {
          applicability: ALWAYS,
          defaultValue: first?.key ?? "",
          description:
            "Parámetro que oscila. El movimiento se suma a su valor y a sus keyframes.",
          label: "Parámetro",
          options: numeric.map((def) => ({
            label: def.label,
            value: def.key,
          })),
          performanceReason:
            "Reasigna a qué parámetro se suma el LFO; el trabajo por frame es el mismo.",
          performanceRole: "responsiveness",
          target: modulatorTarget(slot, type, i, "parameter"),
          type: "select",
        },
        phase: {
          applicability: ALWAYS,
          defaultValue: 0,
          description: "Desplaza el inicio del ciclo.",
          label: "Fase",
          max: 1,
          min: 0,
          performanceReason:
            "Se arrastra en vivo mientras la modulación corre sobre la fuente.",
          performanceRole: "responsiveness",
          step: 0.01,
          target: modulatorTarget(slot, type, i, "phase"),
          type: "slider",
        },
        rate: {
          applicability: ALWAYS,
          defaultValue: 0.5,
          label: "Velocidad",
          max: 8,
          min: 0.05,
          performanceReason:
            "Se arrastra en vivo mientras la modulación corre sobre la fuente.",
          performanceRole: "responsiveness",
          step: 0.05,
          target: modulatorTarget(slot, type, i, "rate"),
          type: "slider",
          unit: "Hz",
        },
        shape: {
          applicability: ALWAYS,
          defaultValue: "sine",
          label: "Forma",
          options: LFO_SHAPES.map(([value, label]) => ({ label, value })),
          performanceReason:
            "Cambia la función del LFO, no el trabajo del pase.",
          performanceRole: "responsiveness",
          target: modulatorTarget(slot, type, i, "shape"),
          type: "select",
        },
        swing: {
          applicability: ALWAYS,
          defaultValue: 0,
          description: "Cuánto se aparta el parámetro de su valor, en sus propias unidades.",
          label: "Amplitud",
          max: 100,
          min: 0,
          performanceReason:
            "Se arrastra en vivo mientras la modulación corre sobre la fuente.",
          performanceRole: "responsiveness",
          step: 0.5,
          target: modulatorTarget(slot, type, i, "amp"),
          type: "slider",
        },
      },
      id: `fx-${slot}-${type.toLowerCase()}-mod-${i}`,
      // Unique across the whole schema: effect, chain position, modulator.
      title: `${mod.label} · ${slot + 1} · Modulador ${i + 1}`,
      visibleWhen,
    } satisfies ToolcraftControlSectionSchema;
  });
}

/** Every per-slot section, in panel order. */
export function buildChainSections(): ToolcraftControlSectionSchema[] {
  const sections: ToolcraftControlSectionSchema[] = [];

  for (let slot = 0; slot < CHAIN_SLOTS; slot += 1) {
    for (const type of Object.keys(registry)) {
      sections.push(...buildEffectSections(slot, type));
      sections.push(...buildModulatorSections(slot, type));
    }
  }

  return sections;
}
