import type { ToolcraftRendererPipelineClient } from "../rendering";
import type {
  ToolcraftProductSceneBoundsProvider,
  ToolcraftRuntimeSceneVisibility,
} from "../scene";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftExportFrame } from "./export-frame";
import type { ToolcraftProductExportRenderer } from "./product-export-renderer";

export type ToolcraftArtifactExportRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  exportRenderer: ToolcraftProductExportRenderer | undefined;
  productSceneRequired: boolean;
  renderRuntimeScene: (
    canvas: HTMLCanvasElement,
    frame: ToolcraftExportFrame,
    state: ToolcraftState,
  ) => Promise<unknown>;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  state: ToolcraftState;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;
