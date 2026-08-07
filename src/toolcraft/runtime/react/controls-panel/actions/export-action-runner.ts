import type {
  ToolcraftArtifactExportRequest,
} from "../../../export/artifact-export-request";
import type { ToolcraftExportFrame } from "../../../export/export-frame";
import {
  exportToolcraftImageArtifact,
} from "../../../export/image-artifact-export";
import type {
  ToolcraftProductExportRenderer,
} from "../../../export/product-export-renderer";
import {
  exportToolcraftVideoArtifact,
} from "../../../export/video-artifact-export";
import type { ToolcraftRendererPipelineClient } from "../../../rendering";
import type {
  ToolcraftProductSceneBoundsProvider,
  ToolcraftRuntimeSceneVisibility,
} from "../../../scene";
import type { ToolcraftActionSchema } from "../../../schema/types";
import type { ToolcraftState } from "../../../state/types";

export type ToolcraftControlsSceneExport = Readonly<{
  boundsProvider?: ToolcraftProductSceneBoundsProvider;
  exportRenderer?: ToolcraftProductExportRenderer;
  productSceneRequired: boolean;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export type ToolcraftExportActionRequest = Readonly<{
  action: ToolcraftActionSchema;
  renderRuntimeScene: (
    canvas: HTMLCanvasElement,
    frame: ToolcraftExportFrame,
    state: ToolcraftState,
  ) => Promise<unknown>;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  sceneExport: ToolcraftControlsSceneExport;
  state: ToolcraftState;
}>;

function createSharedArtifactRequest(
  request: ToolcraftExportActionRequest,
): ToolcraftArtifactExportRequest {
  return {
    boundsProvider: request.sceneExport.boundsProvider,
    exportRenderer: request.sceneExport.exportRenderer,
    productSceneRequired: request.sceneExport.productSceneRequired,
    renderRuntimeScene: request.renderRuntimeScene,
    rendererPipeline: request.rendererPipeline,
    reportProgress: request.reportProgress,
    state: request.state,
    visibility: request.sceneExport.visibility,
  };
}

export function runToolcraftExportAction(
  request: ToolcraftExportActionRequest,
): PromiseLike<unknown> | null {
  switch (request.action.role) {
    case "export-image":
      return exportToolcraftImageArtifact(createSharedArtifactRequest(request));
    case "export-video":
      return exportToolcraftVideoArtifact(createSharedArtifactRequest(request));
    default:
      return null;
  }
}
