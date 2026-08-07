// "Copy render command" — the interoperability pattern inherited from the CLI
// prototype this app grew out of. A pure slit-scan chain still produces a
// timeslice.py-compatible command; anything else produces the timeshift form.

import type { ToolcraftState } from "@/toolcraft/runtime";

import { registry } from "./effects/registry";
import { CHAIN_SLOTS, paramTarget, slotEnabledTarget, slotTypeTarget, targets } from "./targets";

function fmtNum(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);

  if (!Number.isFinite(n)) {
    return "0";
  }

  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

type ActiveSlot = {
  slot: number;
  type: string;
};

function activeSlots(state: ToolcraftState): ActiveSlot[] {
  const out: ActiveSlot[] = [];

  for (let slot = 0; slot < CHAIN_SLOTS; slot += 1) {
    const type = state.values[slotTypeTarget(slot)];

    if (
      typeof type === "string" &&
      registry[type] &&
      state.values[slotEnabledTarget(slot)] !== false
    ) {
      out.push({ slot, type });
    }
  }

  return out;
}

export function buildRenderCommand(state: ToolcraftState): string {
  const asset = state.mediaAssets.find(
    (candidate) => candidate.sourceTarget === targets.source,
  );

  if (!asset) {
    return "// carga un clip para generar el comando";
  }

  const name = asset.fileName;
  const outName = name.replace(/\.[^.]+$/u, "");
  const active = activeSlots(state);
  const trimIn = Number(state.values[targets.trimIn] ?? 0);
  const trimOut = Number(state.values[targets.trimOut] ?? 1);
  const duration = state.timeline.durationSeconds || 1;
  const trim = `${(trimIn * duration).toFixed(2)}:${(trimOut * duration).toFixed(2)}`;

  if (active.length === 0) {
    return "// sin efectos activos — nada que renderizar";
  }

  const first = active[0];

  // Pure slit-scan setups keep the original timeslice.py CLI shape.
  if (active.length === 1 && first && first.type === "sliceBands") {
    const p = (key: string): unknown =>
      state.values[paramTarget(first.slot, "sliceBands", key)];

    return (
      `python timeslice.py --input "${name}" --bands ${fmtNum(p("bands"))} ` +
      `--offset ${fmtNum(p("offset"))} --jitter ${fmtNum(p("jitter"))} ` +
      `--angle ${fmtNum(p("angle"))} --spacing ${String(p("spacing") ?? "linear")} ` +
      `--feather ${fmtNum(p("feather"))} --seed ${fmtNum(p("seed"))} ` +
      `--trim ${trim} --out "${outName}_timeslice.mp4"`
    );
  }

  const types = active.map((entry) => entry.type).join(",");

  return (
    `timeshift render "${name}" --trim ${trim} --fx ${types} ` +
    `--preset "${outName}_timeshift.json" --out "${outName}_timeshift.mp4"`
  );
}
