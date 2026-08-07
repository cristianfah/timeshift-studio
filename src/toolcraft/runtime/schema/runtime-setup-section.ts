import {
  getToolcraftCanvasAspectRatioPreset,
  getToolcraftCanvasAspectRatioPresetBySize,
} from "./canvas-aspect-ratio-presets";
import { normalizeToolcraftAdditionalValueTargets } from "./additional-value-targets";
import { registerToolcraftInternalControlSection } from "./controls-panel-section-id";
import { toolcraftRuntimeSetupSectionTitle } from "./runtime-section-titles";
import {
  toolcraftCanvasInfinityTarget,
  toolcraftTimelinePanelExtendedTarget,
} from "./runtime-targets";
import {
  toolcraftOutputBackgroundToggleTarget,
  type ToolcraftRuntimeSetupBackgroundControls,
} from "./runtime-setup-background";
import type {
  ResolvedToolcraftAppIdentity,
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftSettingsTransferSchema,
  ResolvedToolcraftTimelinePanelSchema,
  ToolcraftAppSchema,
  ToolcraftCanvasSize,
  ToolcraftControlLayoutGroupSchema,
  ToolcraftControlSchema,
  ToolcraftControlSectionSchema,
  ToolcraftSettingsTransferSchema,
} from "./types";
import { getToolcraftDefaultCanvasMode } from "../state/canvas-frame";

const canvasSizeControlTargets = {
  height: "canvas.size.height",
  width: "canvas.size.width",
} as const;
const canvasAspectRatioTarget = "canvas.aspectRatio";
const canvasRenderScaleTarget = "canvas.renderScale";
const settingsTransferTarget = "runtime.settingsTransfer";
const finiteCanvasCondition = Object.freeze({
  equals: false,
  target: toolcraftCanvasInfinityTarget,
});
const alwaysApplicable = Object.freeze({ mode: "always" as const });
const finiteCanvasApplicability = Object.freeze({
  all: [finiteCanvasCondition],
  mode: "conditional" as const,
});

type RuntimeSetupControlGroup = {
  controls: ToolcraftControlSectionSchema["controls"];
  layoutGroups: readonly ToolcraftControlLayoutGroupSchema[];
};

function getSettingsTransferMode(
  settingsTransfer: ToolcraftSettingsTransferSchema | undefined,
): "auto" | boolean {
  if (typeof settingsTransfer === "object" && settingsTransfer !== null) {
    return settingsTransfer.enabled ?? "auto";
  }

  return settingsTransfer ?? "auto";
}

function getSettingsTransferObject(
  settingsTransfer: ToolcraftSettingsTransferSchema | undefined,
): Extract<ToolcraftSettingsTransferSchema, object> | undefined {
  return typeof settingsTransfer === "object" && settingsTransfer !== null
    ? settingsTransfer
    : undefined;
}

function getSettingsTransferFileName({
  appId,
  settingsTransfer,
}: {
  appId: string;
  settingsTransfer: ToolcraftSettingsTransferSchema | undefined;
}): string {
  const explicitFileName = getSettingsTransferObject(settingsTransfer)?.fileName?.trim();

  if (explicitFileName) {
    return explicitFileName.endsWith(".json")
      ? explicitFileName
      : `${explicitFileName}.json`;
  }

  return `${appId}-settings.json`;
}

export function resolveToolcraftSettingsTransfer({
  controls,
  identity,
  settingsTransfer,
}: {
  controls: ToolcraftAppSchema["panels"]["controls"];
  identity: ResolvedToolcraftAppIdentity;
  settingsTransfer: ToolcraftSettingsTransferSchema | undefined;
}): ResolvedToolcraftSettingsTransferSchema {
  const mode = getSettingsTransferMode(settingsTransfer);
  const appId = identity.id;

  return {
    additionalValueTargets: normalizeToolcraftAdditionalValueTargets(
      getSettingsTransferObject(settingsTransfer)?.additionalValueTargets,
    ),
    appId,
    enabled: Boolean(controls),
    fileName: getSettingsTransferFileName({ appId, settingsTransfer }),
    mode,
  };
}

function getGreatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));

  while (b !== 0) {
    const next = b;
    b = a % b;
    a = next;
  }

  return a || 1;
}

function getCanvasAspectRatioDefaultValue(size: ToolcraftCanvasSize): {
  height: number;
  mode: "custom" | "preset";
  value: string;
  width: number;
} {
  const divisor = getGreatestCommonDivisor(size.width, size.height);
  const width = Math.max(1, Math.round(size.width / divisor));
  const height = Math.max(1, Math.round(size.height / divisor));
  const value = `${width}:${height}`;
  const preset =
    getToolcraftCanvasAspectRatioPreset(value) ??
    getToolcraftCanvasAspectRatioPresetBySize(size);

  return {
    height: preset?.ratioHeight ?? height,
    mode: preset ? "preset" : "custom",
    value: preset?.value ?? value,
    width: preset?.ratioWidth ?? width,
  };
}

function createRenderScaleControl(
  canvas: ResolvedToolcraftAppSchema["canvas"],
): ToolcraftControlSchema | undefined {
  if (!canvas.renderScale.enabled) {
    return undefined;
  }

  return {
    applicability: alwaysApplicable,
    defaultValue: canvas.renderScale.defaultValue,
    description:
      "Increases raster canvas backing resolution without changing the visible output size.",
    label: "Resolution scale",
    markerCount:
      Math.floor(
        (canvas.renderScale.max - canvas.renderScale.min) / canvas.renderScale.step,
      ) + 1,
    max: canvas.renderScale.max,
    min: canvas.renderScale.min,
    performanceReason:
      "Resolution scale changes raster, Canvas, WebGL, or WebGPU backing pixels.",
    performanceRole: "workload",
    step: canvas.renderScale.step,
    target: canvasRenderScaleTarget,
    type: "slider",
    variant: "discrete",
  };
}

function createInfinityCanvasControl(
  canvas: ResolvedToolcraftAppSchema["canvas"],
  background: ToolcraftRuntimeSetupBackgroundControls | undefined,
): ToolcraftControlSchema | undefined {
  if (!canvas.enabled || canvas.sizing.mode !== "editable-output") {
    return undefined;
  }

  return {
    applicability: alwaysApplicable,
    defaultValue: getToolcraftDefaultCanvasMode(canvas) === "infinite",
    ...(background
      ? {
          disabledWhen: {
            equals: false,
            target: toolcraftOutputBackgroundToggleTarget,
          },
        }
      : {}),
    label: "Infinity canvas",
    orderRole: "input",
    target: toolcraftCanvasInfinityTarget,
    type: "switch",
  };
}

function createTimelineExtendedControl(
  timeline: ResolvedToolcraftTimelinePanelSchema | undefined,
): ToolcraftControlSchema | undefined {
  if (!timeline?.enabled) {
    return undefined;
  }

  return {
    applicability: alwaysApplicable,
    defaultValue: false,
    label: "Timeline",
    target: toolcraftTimelinePanelExtendedTarget,
    type: "switch",
  };
}

function createRuntimeSetupBackgroundControls({
  background,
  infinityCanvasControl,
}: {
  background: ToolcraftRuntimeSetupBackgroundControls | undefined;
  infinityCanvasControl: ToolcraftControlSchema | undefined;
}): RuntimeSetupControlGroup {
  const includeBackgroundControl = background
    ? {
        ...background.include,
        description: undefined,
        label: "Background",
      }
    : undefined;
  const backgroundColorControl = background
    ? {
        ...background.color,
        label: "Background color",
      }
    : undefined;

  return {
    controls: {
      ...(includeBackgroundControl
        ? {
            includeBackground: {
              ...includeBackgroundControl,
              applicability: alwaysApplicable,
            },
          }
        : {}),
      ...(infinityCanvasControl
        ? { infinityCanvas: infinityCanvasControl }
        : {}),
      ...(backgroundColorControl
        ? {
            background: {
              ...backgroundColorControl,
              applicability: alwaysApplicable,
            },
          }
        : {}),
    },
    layoutGroups:
      includeBackgroundControl && infinityCanvasControl
        ? [
            {
              columns: 2,
              controls: ["includeBackground", "infinityCanvas"],
              layout: "inline",
            },
          ]
        : [],
  };
}

function createFiniteCanvasControls(
  canvas: ResolvedToolcraftAppSchema["canvas"],
): RuntimeSetupControlGroup {
  if (!canvas.enabled || canvas.sizing.mode !== "editable-output") {
    return { controls: {}, layoutGroups: [] };
  }

  return {
    controls: {
      canvasAspectRatio: {
        applicability: finiteCanvasApplicability,
        defaultValue: getCanvasAspectRatioDefaultValue(canvas.size),
        label: "Aspect ratio",
        orderRole: "input",
        performanceReason: "Aspect ratio changes output dimensions and renderer workload.",
        performanceRole: "workload",
        target: canvasAspectRatioTarget,
        type: "aspectRatio",
      },
      canvasWidth: {
        applicability: finiteCanvasApplicability,
        defaultValue: canvas.size.width,
        label: "Canvas width",
        orderRole: "input",
        performanceReason: "Canvas width changes output dimensions and renderer workload.",
        performanceRole: "workload",
        target: canvasSizeControlTargets.width,
        type: "text",
      },
      canvasHeight: {
        applicability: finiteCanvasApplicability,
        defaultValue: canvas.size.height,
        label: "Canvas height",
        orderRole: "input",
        performanceReason: "Canvas height changes output dimensions and renderer workload.",
        performanceRole: "workload",
        target: canvasSizeControlTargets.height,
        type: "text",
      },
    },
    layoutGroups: [
      {
        columns: 2,
        controls: ["canvasWidth", "canvasHeight"],
        layout: "inline",
      },
    ],
  };
}

export function createToolcraftRuntimeSetupSection({
  background,
  canvas,
  settingsTransfer,
  timeline,
}: {
  background: ToolcraftRuntimeSetupBackgroundControls | undefined;
  canvas: ResolvedToolcraftAppSchema["canvas"];
  settingsTransfer: ResolvedToolcraftSettingsTransferSchema;
  timeline: ResolvedToolcraftTimelinePanelSchema | undefined;
}): ToolcraftControlSectionSchema {
  const infinityCanvasControl = createInfinityCanvasControl(canvas, background);
  const backgroundControls = createRuntimeSetupBackgroundControls({
    background,
    infinityCanvasControl,
  });
  const finiteCanvas = createFiniteCanvasControls(canvas);
  const renderScaleControl = createRenderScaleControl(canvas);
  const timelineExtendedControl = createTimelineExtendedControl(timeline);

  const section: ToolcraftControlSectionSchema & { id: string } = {
    controls: {
      settingsTransfer: {
        applicability: alwaysApplicable,
        label: false,
        target: settingsTransferTarget,
        type: "settingsTransfer",
      },
      ...backgroundControls.controls,
      ...finiteCanvas.controls,
      ...(renderScaleControl ? { canvasRenderScale: renderScaleControl } : {}),
      ...(timelineExtendedControl ? { timelineExtended: timelineExtendedControl } : {}),
    },
    id: "runtime.setup",
    layout: "standalone",
    layoutGroups: [
      ...backgroundControls.layoutGroups,
      ...finiteCanvas.layoutGroups,
    ],
    title: toolcraftRuntimeSetupSectionTitle,
  };

  return registerToolcraftInternalControlSection(section);
}
