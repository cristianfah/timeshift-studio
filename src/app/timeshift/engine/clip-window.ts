// The region of the clip the product works on.
//
// The Toolcraft timeline owns one duration and one playhead, so trimming is
// expressed as a window over the source: the timeline runs 0..length and every
// consumer (preview, modulators, export) maps that back to source time through
// the same helper. Preview and export therefore cannot drift apart.

import { targets } from "../targets";

export type ClipWindow = {
  /** Where the region starts inside the source, in seconds. */
  inSeconds: number;
  /** How long the region is, in seconds. This is the timeline duration. */
  lengthSeconds: number;
};

/** Shortest region the product allows, so the timeline never collapses to 0. */
const MIN_WINDOW_SECONDS = 0.1;

function asFraction(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;

  return typeof n === "number" && Number.isFinite(n)
    ? Math.min(1, Math.max(0, n))
    : fallback;
}

/**
 * Resolves the trim controls against a source duration. A still image has no
 * duration of its own, so it passes `null` and keeps the full timeline.
 */
export function resolveClipWindow(
  values: Record<string, unknown>,
  sourceDurationSeconds: number | null,
): ClipWindow {
  if (!sourceDurationSeconds || !Number.isFinite(sourceDurationSeconds)) {
    return { inSeconds: 0, lengthSeconds: 0 };
  }

  const start = asFraction(values[targets.trimIn], 0);
  const end = asFraction(values[targets.trimOut], 1);
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const inSeconds = lower * sourceDurationSeconds;
  const lengthSeconds = Math.max(
    Math.min(MIN_WINDOW_SECONDS, sourceDurationSeconds),
    (upper - lower) * sourceDurationSeconds,
  );

  return {
    inSeconds: Math.min(inSeconds, sourceDurationSeconds - lengthSeconds),
    lengthSeconds,
  };
}

/** Timeline time to source time. */
export function toSourceTime(window: ClipWindow, timelineSeconds: number): number {
  return (
    window.inSeconds +
    Math.min(Math.max(timelineSeconds, 0), window.lengthSeconds)
  );
}

/** Source time back to timeline time, for playback feedback. */
export function toTimelineTime(window: ClipWindow, sourceSeconds: number): number {
  return Math.min(
    Math.max(sourceSeconds - window.inSeconds, 0),
    window.lengthSeconds,
  );
}
