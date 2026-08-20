// Control Section Inventory: the typed description of what each panel section
// edits. The schema is generated, so the inventory is generated from the same
// source instead of being maintained by hand and drifting away from it.

import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "@/toolcraft/runtime";
import { isToolcraftRuntimeOwnedTarget } from "@/toolcraft/runtime";

import type { ToolcraftControlSectionInventoryEntry } from "../../acceptance/types";
import { registry } from "../effects/registry";

type SectionLike = {
  controls: Record<string, ResolvedToolcraftControlSchema>;
  id?: string;
  title?: string;
};

/** Fixed product sections. Everything else is a generated chain section. */
const APP_SECTIONS: Record<
  string,
  { entity: string; entityId: string; groupingReason: string }
> = {
  background: {
    entity: "Fondo del producto",
    entityId: "background",
    groupingReason:
      "El interruptor de inclusión y el color describen el mismo fondo que consume el export.",
  },
  "chain-manage": {
    entity: "Cadena de efectos",
    entityId: "chain",
    groupingReason:
      "Explorar efectos y vaciar la cadena son las dos operaciones sobre la cadena completa.",
  },
  "clip-playback": {
    entity: "Reproducción del clip",
    entityId: "clip-playback",
    groupingReason:
      "Silencio y región de reproducción describen cómo suena y qué tramo corre del clip.",
  },
  "clip-source": {
    entity: "Fuente",
    entityId: "clip-source",
    groupingReason:
      "La fuente importada es una sola entidad y su carga es toda su superficie editable.",
  },
  deliver: {
    entity: "Entrega del resultado",
    entityId: "deliver",
    groupingReason:
      "Las acciones sticky entregan el resultado renderizado como imagen o como video.",
  },
  "engine-budget": {
    entity: "Motor de previsualización",
    entityId: "engine-budget",
    groupingReason:
      "Resolución interna e historia definen juntas el presupuesto del motor en vivo.",
  },
  "runtime.setup": {
    entity: "Setup del proyecto",
    entityId: "runtime-setup",
    groupingReason:
      "El runtime reúne aquí transferencia de ajustes, fondo, tamaño de salida y timeline.",
  },
  "image-export": {
    entity: "Export de imagen",
    entityId: "image-export",
    groupingReason:
      "Formato y resolución configuran el mismo artefacto de imagen exportado.",
  },
  looks: {
    entity: "Looks",
    entityId: "looks",
    groupingReason:
      "Un look es una cadena ya montada; aplicarlo es toda la superficie de la entidad.",
  },
  "still-motion": {
    entity: "Imagen fija",
    entityId: "still-motion",
    groupingReason:
      "Movimiento e intensidad describen el mismo pasado inventado de la foto.",
  },
  "video-export": {
    entity: "Export de video",
    entityId: "video-export",
    groupingReason:
      "Formato, resolución y audio configuran el mismo artefacto de video exportado.",
  },
};

const typesByLowerCase = new Map(
  Object.keys(registry).map((type) => [type.toLowerCase(), type] as const),
);

type ChainSectionId =
  | { kind: "modulator"; modulator: number; slot: number; type: string }
  | { kind: "params"; part: number; slot: number; type: string };

/** Parses the ids produced by `effect-sections.ts`. */
function parseChainSectionId(id: string): ChainSectionId | null {
  const modulator = /^fx-(\d+)-([a-z]+)-mod-(\d+)$/.exec(id);

  if (modulator) {
    const type = typesByLowerCase.get(modulator[2] ?? "");

    return type
      ? {
          kind: "modulator",
          modulator: Number(modulator[3]),
          slot: Number(modulator[1]),
          type,
        }
      : null;
  }

  const params = /^fx-(\d+)-([a-z]+)-(\d+)$/.exec(id);

  if (!params) {
    return null;
  }

  const type = typesByLowerCase.get(params[2] ?? "");

  return type
    ? { kind: "params", part: Number(params[3]), slot: Number(params[1]), type }
    : null;
}

function chainEntry(
  parsed: ChainSectionId,
  base: { id: string; targets: readonly string[]; title: string },
  partCount: number,
): ToolcraftControlSectionInventoryEntry {
  const label = registry[parsed.type]?.label ?? parsed.type;
  const position = parsed.slot + 1;

  if (parsed.kind === "modulator") {
    return {
      ...base,
      entity: `${label} · ${position} · Modulador ${parsed.modulator + 1}`,
      entityId: `fx-${parsed.slot}-${parsed.type}-mod-${parsed.modulator}`,
      groupingReason:
        "Un modulador es un LFO completo: destino, forma, velocidad, fase y amplitud.",
    };
  }

  const split = partCount > 1;

  return {
    ...base,
    entity: `${label} · ${position}`,
    entityId: `fx-${parsed.slot}-${parsed.type}`,
    groupingReason:
      "Los parámetros del efecto en esta posición de la cadena editan un solo efecto.",
    ...(split
      ? {
          splitReason:
            "El efecto supera el máximo de controles por sección, así que se reparte en etapas de trabajo.",
          workflowStage: `parametros-${parsed.part + 1}`,
        }
      : {}),
  };
}

/** One inventory entry per schema section, with its exact targets. */
export function buildSectionInventory(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
): ToolcraftControlSectionInventoryEntry[] {
  const sections = (schema.panels.controls?.sections ?? []) as SectionLike[];
  const partCounts = new Map<string, number>();

  for (const section of sections) {
    const parsed = section.id ? parseChainSectionId(section.id) : null;

    if (parsed?.kind === "params") {
      const key = `${parsed.slot}:${parsed.type}`;

      partCounts.set(key, (partCounts.get(key) ?? 0) + 1);
    }
  }

  return sections.flatMap((section) => {
    const id = section.id;

    if (!id) {
      return [];
    }

    const base = {
      id,
      // Runtime Setup also hosts runtime-owned targets (settings transfer,
      // canvas sizing, timeline). The inventory describes product controls,
      // so only the product's own targets belong here.
      targets: Object.values(section.controls)
        .map((control) => control.target)
        .filter((target) => !isToolcraftRuntimeOwnedTarget(target)),
      title: section.title ?? id,
    };
    const parsed = parseChainSectionId(id);

    if (parsed) {
      const partCount =
        parsed.kind === "params"
          ? (partCounts.get(`${parsed.slot}:${parsed.type}`) ?? 1)
          : 1;

      return [chainEntry(parsed, base, partCount)];
    }

    const app = APP_SECTIONS[id];

    return app ? [{ ...base, ...app }] : [];
  });
}
