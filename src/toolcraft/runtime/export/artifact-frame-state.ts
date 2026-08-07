import { evaluateToolcraftTimelineValues } from "../state/keyframe-evaluation";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftVideoFrameScheduleEntry } from "./video-frame-schedule";

export type ToolcraftArtifactFrameState = Readonly<ToolcraftState>;

export type ToolcraftVideoArtifactFramePlanEntry = Readonly<{
  scheduleEntry: ToolcraftVideoFrameScheduleEntry;
  state: ToolcraftArtifactFrameState;
}>;

export function createToolcraftArtifactFrameState(
  baseState: ToolcraftState,
  timeSeconds: number,
): ToolcraftArtifactFrameState {
  return Object.freeze({
    ...baseState,
    timeline: Object.freeze({
      ...baseState.timeline,
      currentTimeSeconds: timeSeconds,
      isPlaying: false,
    }),
    values: Object.freeze(
      evaluateToolcraftTimelineValues(baseState, timeSeconds),
    ),
  });
}

export function createToolcraftVideoArtifactFramePlan(
  baseState: ToolcraftState,
  schedule: readonly ToolcraftVideoFrameScheduleEntry[],
): readonly ToolcraftVideoArtifactFramePlanEntry[] {
  return Object.freeze(
    schedule.map((scheduleEntry) =>
      Object.freeze({
        scheduleEntry,
        state: createToolcraftArtifactFrameState(
          baseState,
          scheduleEntry.timeSeconds,
        ),
      }),
    ),
  );
}
