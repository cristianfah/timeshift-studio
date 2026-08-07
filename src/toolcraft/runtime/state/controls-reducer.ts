import {
  isToolcraftTimelinePanelExtendedTarget,
  isToolcraftTimelinePanelVisibleTarget,
} from "../schema/runtime-targets";
import {
  getToolcraftCanvasResetPatch,
  reduceToolcraftCanvasControlValue,
} from "./canvas-control-target-reducer";
import { commitToolcraftStatePatch, commitToolcraftValuePatch } from "./history-patches";
import {
  tagToolcraftCanvasStateHistoryPatch,
  tagToolcraftControlsResetHistoryPatch,
} from "./history-patch-metadata";
import { getToolcraftResetMediaPatch } from "./media-state";
import type {
  ToolcraftCommand,
  ToolcraftState,
} from "./types";

type ToolcraftControlsCommand = Extract<
  ToolcraftCommand,
  {
    type: "controls.apply" | "controls.reset" | "controls.resetTargets" | "controls.setValue";
  }
>;

export function reduceToolcraftControlsCommand(
  state: ToolcraftState,
  command: ToolcraftControlsCommand,
): ToolcraftState {
  switch (command.type) {
    case "controls.setValue": {
      const canvasReduction = reduceToolcraftCanvasControlValue(state, command);

      if (canvasReduction.handled) {
        return canvasReduction.state;
      }

      if (isToolcraftTimelinePanelExtendedTarget(command.target)) {
        const extended = command.value === true;

        if (state.panels.timeline.extended === extended) {
          return state;
        }

        return {
          ...state,
          panels: {
            ...state.panels,
            timeline: {
              ...state.panels.timeline,
              extended,
            },
          },
        };
      }

      if (isToolcraftTimelinePanelVisibleTarget(command.target)) {
        const hidden = command.value === false;

        if (state.panels.timeline.hidden === hidden) {
          return state;
        }

        return {
          ...state,
          panels: {
            ...state.panels,
            timeline: {
              ...state.panels.timeline,
              hidden,
            },
          },
        };
      }

      if (Object.is(state.values[command.target], command.value)) {
        return state;
      }

      return commitToolcraftValuePatch(
        state,
        {
          after: { [command.target]: command.value },
          before: { [command.target]: state.values[command.target] },
          label: command.label ?? command.target,
        },
        { ...state.values, [command.target]: command.value },
        {
          group: command.historyGroup,
          mode: command.history,
        },
      );
    }

    case "controls.apply":
      return state;

    case "controls.reset": {
      const resetCanvasPatch = getToolcraftCanvasResetPatch(state);
      const resetMediaPatch = getToolcraftResetMediaPatch(state);

      if (resetCanvasPatch || resetMediaPatch) {
        return commitToolcraftStatePatch(
          state,
          tagToolcraftControlsResetHistoryPatch({
            after: {
              ...state.defaults,
              ...resetCanvasPatch?.after,
              ...resetMediaPatch?.after,
            },
            before: {
              ...state.values,
              ...resetCanvasPatch?.before,
              ...resetMediaPatch?.before,
            },
            label: "Reset controls",
          }),
        );
      }

      return commitToolcraftValuePatch(
        state,
        tagToolcraftControlsResetHistoryPatch({
          after: { ...state.defaults },
          before: { ...state.values },
          label: "Reset controls",
        }),
        { ...state.defaults },
      );
    }

    case "controls.resetTargets": {
      const targetSet = new Set(command.targets);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const resetCanvasPatch = getToolcraftCanvasResetPatch(state, targetSet);
      const resetMediaPatch = getToolcraftResetMediaPatch(state, targetSet);

      for (const target of targetSet) {
        if (!(target in state.defaults) || Object.is(state.values[target], state.defaults[target])) {
          continue;
        }

        before[target] = state.values[target];
        after[target] = state.defaults[target];
      }

      if (resetCanvasPatch) {
        Object.assign(before, resetCanvasPatch.before);
        Object.assign(after, resetCanvasPatch.after);
      }

      if (resetMediaPatch) {
        Object.assign(before, resetMediaPatch.before);
        Object.assign(after, resetMediaPatch.after);
      }

      if (Object.keys(after).length === 0) {
        return state;
      }

      const patch = {
        after,
        before,
        label: command.label ?? "Reset section",
      };

      return commitToolcraftStatePatch(
        state,
        resetCanvasPatch
          ? tagToolcraftCanvasStateHistoryPatch(patch)
          : patch,
      );
    }
  }
}
