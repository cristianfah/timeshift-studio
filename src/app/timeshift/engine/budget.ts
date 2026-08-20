// Engine budget: how the two workload controls translate into the ring buffer
// the preview allocates. Preview and tests read the same mapping.

import { targets } from "../targets";

export type EngineBudget = {
  /** Ring buffer layers, i.e. how far back the effects may look. */
  depth: number;
  /** Internal render width; the source aspect decides the height. */
  targetWidth: number;
};

/** Frame rate the engine assumes for buffer sizing and export scheduling. */
export const ENGINE_FPS = 30;

const MIN_DEPTH = 8;
const MAX_DEPTH = 300;

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;

  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function resolveEngineBudget(
  values: Record<string, unknown>,
): EngineBudget {
  const seconds = asNumber(values[targets.bufferSeconds], 3);

  return {
    depth: Math.min(
      MAX_DEPTH,
      Math.max(MIN_DEPTH, Math.round(seconds * ENGINE_FPS)),
    ),
    targetWidth: asNumber(values[targets.previewWidth], 854),
  };
}

/** The clip element is muted unless the user turns the switch off. */
export function isClipMuted(values: Record<string, unknown>): boolean {
  return values[targets.muted] !== false;
}
