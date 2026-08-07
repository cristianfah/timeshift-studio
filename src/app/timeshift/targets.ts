// Runtime state target naming, shared by the schema generator and the renderer.
//
// The Toolcraft schema is static, so the effect chain is modelled as a fixed
// pool of slots. Every slot declares the controls of all effect types; only the
// section matching the slot's current type is visible. Because each slot+type+
// parameter owns a real target, keyframes, reset, undo/redo, persistence and
// settings transfer all work natively per chain position.

/** Maximum number of stacked effects. The GPU budget caps it well before this. */
export const CHAIN_SLOTS = 8;

export const slotIndexes: readonly number[] = Array.from(
  { length: CHAIN_SLOTS },
  (_, i) => i,
);

/** Effect type occupying a slot, or "none" when the slot is empty. */
export function slotTypeTarget(slot: number): string {
  return `fx.${slot}.type`;
}

/** Whether the slot's effect is active. Mirrors the layer's visibility. */
export function slotEnabledTarget(slot: number): string {
  return `fx.${slot}.enabled`;
}

/**
 * Composite discriminator used by `visibleWhen`, which only supports a single
 * condition per control. It carries both "which slot is selected" and "what
 * type it holds", so exactly one effect section is ever visible.
 */
export function slotSelectionTarget(): string {
  return "fx.selection";
}

export function slotSelectionValue(slot: number, type: string): string {
  return `${slot}:${type}`;
}

export function paramTarget(
  slot: number,
  type: string,
  key: string,
): string {
  return `fx.${slot}.${type}.${key}`;
}

/**
 * Modulators are a fixed bank per slot rather than one LFO per parameter:
 * declaring the latter statically would cost ~2000 controls. Each modulator
 * names the parameter it drives.
 */
export const MODULATORS_PER_SLOT = 4;

export const modulatorIndexes: readonly number[] = Array.from(
  { length: MODULATORS_PER_SLOT },
  (_, i) => i,
);

export function modulatorTarget(
  slot: number,
  type: string,
  index: number,
  field: "amp" | "enabled" | "parameter" | "phase" | "rate" | "shape",
): string {
  return `fx.${slot}.${type}.mod${index}.${field}`;
}

/** User-placed tracking seeds for a slot, stored as JSON so undo covers them. */
export function pointsTarget(slot: number): string {
  return `fx.${slot}.points`;
}

export const EMPTY_SLOT = "none";

// ---------------------------------------------------------------- app targets

export const targets = {
  bufferSeconds: "engine.bufferSeconds",
  exportAudio: "export.video.audio",
  exportIncludeBackground: "export.includeBackground",
  exportVideoFormat: "export.video.format",
  exportVideoResolution: "export.video.resolution",
  muted: "clip.muted",
  previewWidth: "engine.previewWidth",
  renderCommand: "clip.renderCommand",
  source: "clip.source",
  trimIn: "clip.trimIn",
  trimOut: "clip.trimOut",
} as const;
