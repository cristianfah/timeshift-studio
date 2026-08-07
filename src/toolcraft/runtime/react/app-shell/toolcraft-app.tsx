"use client";

import * as React from "react";

import type { ResolvedToolcraftAppSchema } from "../../schema/types";
import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import {
  createToolcraftRuntimeSceneVisibility,
  type ToolcraftProductSceneBoundsProvider,
} from "../../scene";
import type { ToolcraftState } from "../../state/types";
import {
  getToolcraftExportRendererCoverageErrors,
  type ToolcraftProductExportRenderer,
} from "../../export/product-export-renderer";
import { CanvasShell } from "../canvas/canvas-shell";
import { ToolcraftProductSceneBoundsBoundary } from "../canvas/product-scene-surface";
import {
  ControlsPanel,
  type ToolcraftPanelActionHandler,
} from "../controls-panel/controls-panel";
import type { ToolcraftControlRendererMap } from "../controls-panel/control-renderers";
import type { ToolcraftControlsSceneExport } from "../controls-panel/actions/controls-panel-actions";
import { ToolcraftRoot } from "./toolcraft-root";
import { LayersPanel } from "../layers/layers-panel";
import { useToolcraftModelRenderPreparationStatus } from "../model-rendering/model-render-provider";
import { TimelinePanel } from "../timeline/timeline-panel";
import { ToolbarPanel } from "./toolbar-panel";
import { useToolcraftCommittedSelector } from "./toolcraft-selectors";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import { useToolcraftPersistenceStatus } from "./use-toolcraft-persistence";

export type ToolcraftAppComposition = {
  canvasContent?: React.ReactNode;
  controlRenderers?: ToolcraftControlRendererMap;
  exportRenderer?: ToolcraftProductExportRenderer;
  infiniteCanvasContent?: React.ReactNode;
  modelPresentation?: ToolcraftModelPresentationMode;
  onPanelAction?: ToolcraftPanelActionHandler;
  renderDefaultCanvasMedia?: boolean;
  rendererPipelineRegistration?: AnyToolcraftRendererPipelineRegistration;
  sceneBoundsProvider?: ToolcraftProductSceneBoundsProvider;
  schema: ResolvedToolcraftAppSchema;
};

export type ToolcraftAppProps = ToolcraftAppComposition & {
  className?: string;
  style?: React.CSSProperties;
};

const toolcraftMinAppWidthPx = 1024;

const selectAppSurfaces = (state: ToolcraftState) =>
  state.schema.assembly.surfaces;
const selectTimelinePanelExtended = (state: ToolcraftState) =>
  state.panels.timeline.extended === true;

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function ToolcraftAppContent({
  canvasContent,
  className,
  controlRenderers,
  infiniteCanvasContent,
  onPanelAction,
  renderDefaultCanvasMedia = true,
  sceneExport,
  style,
}: Omit<
  ToolcraftAppProps,
  | "modelPresentation"
  | "rendererPipelineRegistration"
  | "sceneBoundsProvider"
  | "schema"
> & Readonly<{ sceneExport: ToolcraftControlsSceneExport }>): React.JSX.Element {
  const surfaces = useToolcraftCommittedSelector(selectAppSurfaces);
  const timelinePanelVariant =
    useToolcraftCommittedSelector(selectTimelinePanelExtended)
      ? "extended"
      : "compact";
  const modelRendererStatus = useToolcraftModelRenderPreparationStatus();
  const persistenceStatus = useToolcraftPersistenceStatus();

  return (
    <div
      className={cn(
        "relative min-h-[640px] w-full overflow-hidden bg-[color:var(--background)]",
        className,
      )}
      data-slot="toolcraft-runtime-app"
      data-toolcraft-model-renderer-status={modelRendererStatus}
      data-toolcraft-persistence-failure-reason={
        persistenceStatus.status === "failed"
          ? persistenceStatus.reason
          : undefined
      }
      data-toolcraft-persistence-status={persistenceStatus.status}
      style={{
        ...style,
        minWidth: toolcraftMinAppWidthPx,
      }}
    >
      {surfaces.canvas.enabled ? (
        <CanvasShell
          infiniteCanvasContent={infiniteCanvasContent}
          renderDefaultMedia={renderDefaultCanvasMedia}
        >
          {canvasContent}
        </CanvasShell>
      ) : null}
      {surfaces.panels.layers?.enabled ? (
        <LayersPanel panelPlacement="floating" />
      ) : null}
      {surfaces.panels.controls?.enabled ? (
        <ControlsPanel
          controlRenderers={controlRenderers}
          onPanelAction={onPanelAction}
          panelPlacement="floating"
          sceneExport={sceneExport}
        />
      ) : null}
      {surfaces.panels.timeline?.enabled ? (
        <TimelinePanel panelPlacement="floating" variant={timelinePanelVariant} />
      ) : null}
      {surfaces.panels.toolbar.enabled ? (
        <ToolbarPanel panelPlacement="floating" />
      ) : null}
    </div>
  );
}

export function ToolcraftApp({
  canvasContent,
  exportRenderer,
  modelPresentation,
  renderDefaultCanvasMedia = true,
  rendererPipelineRegistration,
  sceneBoundsProvider,
  schema,
  ...props
}: ToolcraftAppProps): React.JSX.Element {
  const suppressedModelTargets = modelPresentation?.mode === "custom"
    ? modelPresentation.consumers.map(({ sourceTarget }) => sourceTarget)
    : [];
  const productSceneRequired =
    React.Children.count(canvasContent) > 0 ||
    rendererPipelineRegistration !== undefined ||
    suppressedModelTargets.length > 0;
  const exportRendererErrors = getToolcraftExportRendererCoverageErrors({
    exportRenderer,
    productSceneRequired,
    schema,
  });
  if (exportRendererErrors.length > 0) {
    throw new Error(
      `Toolcraft export renderer configuration is invalid:\n- ${exportRendererErrors.join("\n- ")}`,
    );
  }
  const sceneExport: ToolcraftControlsSceneExport = Object.freeze({
    ...(sceneBoundsProvider ? { boundsProvider: sceneBoundsProvider } : {}),
    ...(exportRenderer ? { exportRenderer } : {}),
    productSceneRequired,
    visibility: createToolcraftRuntimeSceneVisibility({
      renderDefaultImages: renderDefaultCanvasMedia,
      suppressedModelTargets,
    }),
  });

  return (
    <ToolcraftRoot
      modelPresentation={modelPresentation}
      rendererPipelineRegistration={rendererPipelineRegistration}
      schema={schema}
    >
      <ToolcraftProductSceneBoundsBoundary
        boundsProvider={sceneBoundsProvider}
      >
        <ToolcraftAppContent
          {...props}
          canvasContent={canvasContent}
          renderDefaultCanvasMedia={renderDefaultCanvasMedia}
          sceneExport={sceneExport}
        />
      </ToolcraftProductSceneBoundsBoundary>
    </ToolcraftRoot>
  );
}
