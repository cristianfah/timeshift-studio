import { createToolcraftAssemblyContract } from "./assembly-contract";
import { resolveToolcraftAppCapabilities } from "./app-capabilities";
import { resolveToolcraftAppIdentity } from "./app-identity";
import { resolveToolcraftCanvasRenderScale } from "./canvas-render-scale";
import { normalizeToolcraftPanels } from "./panels-schema-normalization";
import { resolveToolcraftPersistencePlan } from "./persistence-plan";
import { resolveToolcraftSettingsTransfer } from "./runtime-setup-section";
import {
  defaultToolcraftCanvasSize,
  resolveToolcraftCanvasSizing,
  resolveToolcraftExport,
  resolveToolcraftMedia,
  resolveToolcraftToolbar,
} from "./schema-resolvers";
import type {
  ResolvedToolcraftAppSchema,
  ToolcraftAppSchema,
} from "./types";

export function defineToolcraft(schema: ToolcraftAppSchema): ResolvedToolcraftAppSchema {
  const canvasEnabled = schema.canvas.enabled;
  const canvasSize = schema.canvas.size;
  const canvasRenderScale = resolveToolcraftCanvasRenderScale(schema.canvas.renderScale);
  const canvasSizing = resolveToolcraftCanvasSizing(schema.canvas);
  const identity = resolveToolcraftAppIdentity({
    controlsTitle: schema.panels.controls?.title,
    identity: schema.identity,
    legacyAppId:
      typeof schema.settingsTransfer === "object" && schema.settingsTransfer !== null
        ? schema.settingsTransfer.appId
        : undefined,
  });
  const settingsTransfer = resolveToolcraftSettingsTransfer({
    controls: schema.panels.controls,
    identity,
    settingsTransfer: schema.settingsTransfer,
  });
  const canvas = {
    ...schema.canvas,
    draggable: canvasEnabled ? (schema.canvas.draggable ?? true) : false,
    renderScale: canvasRenderScale,
    size: canvasSize ?? defaultToolcraftCanvasSize,
    sizeSource: canvasSize ? ("app" as const) : ("runtime-default" as const),
    sizing: canvasSizing,
    upload: schema.canvas.upload ?? false,
  };
  const panels = normalizeToolcraftPanels({
    canvas,
    panels: schema.panels,
    settingsTransfer,
  });
  const toolbar = resolveToolcraftToolbar({
    canvasEnabled,
    toolbar: schema.toolbar,
  });
  const exportSchema = resolveToolcraftExport(schema.export);
  const media = resolveToolcraftMedia(schema.media);
  const appCapabilities = resolveToolcraftAppCapabilities({
    canvas,
    media,
    panels,
  });
  const assembly = createToolcraftAssemblyContract({
    appCapabilities,
    canvas,
    panels,
    toolbar,
  });
  const persistence = resolveToolcraftPersistencePlan({
    appCapabilities,
    identity,
    panels,
    persistence: schema.persistence,
  });

  return {
    assembly,
    canvas,
    export: exportSchema,
    identity,
    media,
    panels,
    persistence,
    settingsTransfer,
    toolbar,
  };
}
