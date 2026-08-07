import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ResolvedToolcraftAppSchema } from "../schema/types";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftExportFrame } from "./export-frame";

export type ToolcraftProductExportFrameContext = Readonly<{
  context: CanvasRenderingContext2D;
  frame: ToolcraftExportFrame;
  pixelRatio: number;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  state: Readonly<ToolcraftState>;
  timeSeconds: number;
  timelineProgress: number;
}>;

export type ToolcraftProductExportFrameRenderer = (
  context: ToolcraftProductExportFrameContext,
) => PromiseLike<void> | void;

export type ToolcraftProductExportRenderer = Readonly<{
  baseFileName: string;
  renderFrame: ToolcraftProductExportFrameRenderer;
}>;

function hasTypedExportAction(schema: ResolvedToolcraftAppSchema): boolean {
  return (schema.panels.controls?.sections ?? []).some((section) =>
    Object.values(section.controls).some((control) =>
      (control.actions ?? []).some(
        (action) =>
          typeof action !== "string" &&
          (action.role === "export-image" || action.role === "export-video"),
      ),
    ),
  );
}

export function getToolcraftExportRendererCoverageErrors({
  exportRenderer,
  productSceneRequired,
  schema,
}: Readonly<{
  exportRenderer: ToolcraftProductExportRenderer | undefined;
  productSceneRequired: boolean;
  schema: ResolvedToolcraftAppSchema;
}>): string[] {
  const errors: string[] = [];
  const hasExportAction = hasTypedExportAction(schema);

  if (hasExportAction && productSceneRequired && !exportRenderer) {
    errors.push("Product-owned export actions require exportRenderer.");
  }
  if (exportRenderer && !productSceneRequired) {
    errors.push("exportRenderer requires a product-owned scene.");
  }
  if (exportRenderer && !hasExportAction) {
    errors.push("exportRenderer requires a typed export action.");
  }
  if (exportRenderer && exportRenderer.baseFileName.trim().length === 0) {
    errors.push("exportRenderer.baseFileName must not be blank.");
  }

  return errors;
}
