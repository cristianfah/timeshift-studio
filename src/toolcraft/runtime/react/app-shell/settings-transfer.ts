import type { ResolvedToolcraftAppSchema } from "../../schema/types";
import { isToolcraftCanvasSizingTarget } from "../../schema/runtime-targets";
import { normalizeToolcraftCanvasAspectRatioValue } from "../../state/canvas-state";
import {
  getToolcraftValueControls,
  normalizeToolcraftControlValue,
} from "../../state/control-value-normalization";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineState,
} from "../../state/types";
import {
  applyToolcraftSettingsCanvas,
  parseToolcraftSettingsCanvas,
  settingsTransferImportHistoryGroup,
  type ToolcraftSettingsCanvasPayload,
} from "./settings-transfer-canvas";

const settingsTransferPayloadSource = "toolcraft-settings";
const settingsTransferPayloadVersion = 2;

type ToolcraftDispatch = (command: ToolcraftCommand) => void;

export type ToolcraftSettingsTransferPayload = {
  appId: string;
  canvas: ToolcraftSettingsCanvasPayload;
  exportedAt: string;
  source: typeof settingsTransferPayloadSource;
  timeline: Pick<
    ToolcraftTimelineState,
    "currentTimeSeconds" | "durationSeconds" | "expanded" | "isLooping"
  > & {
    isPlaying: false;
  };
  values: Record<string, unknown>;
  version: 1 | typeof settingsTransferPayloadVersion;
};

type ImportContext = {
  dispatch: ToolcraftDispatch;
  state: ToolcraftState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pickTransferValues(state: ToolcraftState): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const targets = new Set([
    ...getToolcraftValueControls(state.schema).keys(),
    ...state.schema.settingsTransfer.additionalValueTargets,
  ]);

  for (const target of targets) {
    if (
      !isToolcraftCanvasSizingTarget(target) &&
      Object.hasOwn(state.values, target)
    ) {
      values[target] = state.values[target];
    }
  }

  return values;
}

export function createToolcraftSettingsPayload(
  state: ToolcraftState,
): ToolcraftSettingsTransferPayload {
  return {
    appId: state.schema.settingsTransfer.appId,
    canvas: {
      ...(Object.hasOwn(state.values, "canvas.aspectRatio")
        ? {
            aspectRatio: normalizeToolcraftCanvasAspectRatioValue(
              state.values["canvas.aspectRatio"],
              state.canvas.size,
            ),
          }
        : {}),
      mode: state.canvas.mode,
      size: state.canvas.size,
    },
    exportedAt: new Date().toISOString(),
    source: settingsTransferPayloadSource,
    timeline: {
      currentTimeSeconds: state.timeline.currentTimeSeconds,
      durationSeconds: state.timeline.durationSeconds,
      expanded: state.timeline.expanded,
      isLooping: state.timeline.isLooping,
      isPlaying: false,
    },
    values: pickTransferValues(state),
    version: settingsTransferPayloadVersion,
  };
}

export function parseToolcraftSettingsPayload(
  schema: ResolvedToolcraftAppSchema,
  value: unknown,
): ToolcraftSettingsTransferPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.source !== settingsTransferPayloadSource ||
    (value.version !== 1 && value.version !== settingsTransferPayloadVersion) ||
    value.appId !== schema.settingsTransfer.appId
  ) {
    return null;
  }

  if (!isRecord(value.values) || !isRecord(value.canvas) || !isRecord(value.timeline)) {
    return null;
  }

  const canvas = parseToolcraftSettingsCanvas({
    canvas: value.canvas,
    values: value.values,
    version: value.version,
  });

  if (!canvas) {
    return null;
  }

  return {
    ...(value as Omit<ToolcraftSettingsTransferPayload, "canvas">),
    canvas,
  };
}

function applyTimeline(
  { dispatch, state }: ImportContext,
  timeline: ToolcraftSettingsTransferPayload["timeline"],
): void {
  if (state.schema.panels.timeline?.enabled && isFinitePositiveNumber(timeline.durationSeconds)) {
    dispatch({
      durationSeconds: timeline.durationSeconds,
      type: "timeline.setDuration",
    });
  }

  if (state.schema.panels.timeline?.enabled && isFiniteNumber(timeline.currentTimeSeconds)) {
    dispatch({
      currentTimeSeconds: timeline.currentTimeSeconds,
      type: "timeline.setCurrentTime",
    });
  }

  if (state.schema.panels.timeline?.enabled && typeof timeline.expanded === "boolean") {
    dispatch({
      expanded: timeline.expanded,
      type: "timeline.setExpanded",
    });
  }

  if (
    state.schema.panels.timeline?.enabled &&
    typeof timeline.isLooping === "boolean" &&
    timeline.isLooping !== state.timeline.isLooping
  ) {
    dispatch({ type: "timeline.toggleLoop" });
  }

  if (state.schema.panels.timeline?.enabled) {
    dispatch({
      isPlaying: false,
      type: "timeline.setPlaying",
    });
  }
}

export function applyToolcraftSettingsPayload(
  context: ImportContext,
  payload: ToolcraftSettingsTransferPayload,
): void {
  const importableTargets = getToolcraftValueControls(context.state.schema);
  const additionalTargets = new Set(
    context.state.schema.settingsTransfer.additionalValueTargets,
  );

  for (const [target, value] of Object.entries(payload.values)) {
    const control = importableTargets.get(target);

    if (
      isToolcraftCanvasSizingTarget(target) ||
      (!control && !additionalTargets.has(target))
    ) {
      continue;
    }

    const normalized = control
      ? normalizeToolcraftControlValue(control, value)
      : { accepted: true as const, value };

    context.dispatch({
      history: "merge",
      historyGroup: settingsTransferImportHistoryGroup,
      label: "Import settings",
      target,
      type: "controls.setValue",
      value: normalized.accepted ? normalized.value : normalized.fallback,
    });
  }

  applyToolcraftSettingsCanvas(context, payload.canvas);
  applyTimeline(context, payload.timeline);
}

export function downloadToolcraftSettings(state: ToolcraftState): void {
  const payload = createToolcraftSettingsPayload(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = state.schema.settingsTransfer.fileName;
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function reportImportError(error: unknown): void {
  console.error("Could not import Toolcraft settings.", error);
  window.alert("Could not import settings JSON.");
}

export async function importToolcraftSettings(context: ImportContext): Promise<void> {
  const input = document.createElement("input");
  input.accept = "application/json,.json";
  input.style.display = "none";
  input.type = "file";
  document.body.append(input);

  await new Promise<void>((resolve) => {
    input.addEventListener(
      "change",
      () => {
        resolve();
      },
      { once: true },
    );
    input.click();
  });

  const file = input.files?.item(0);
  input.remove();

  if (!file) {
    return;
  }

  try {
    const payload = parseToolcraftSettingsPayload(
      context.state.schema,
      JSON.parse(await file.text()),
    );

    if (!payload) {
      throw new Error("Invalid Toolcraft settings payload.");
    }

    applyToolcraftSettingsPayload(context, payload);
  } catch (error) {
    reportImportError(error);
  }
}
