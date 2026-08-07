import {
  resolveToolcraftSceneBounds,
  unionToolcraftSceneRects,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftRuntimeSceneVisibility,
  type ToolcraftSceneRect,
} from "../scene";
import { getToolcraftCanvasFrame } from "../state/canvas-frame";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftVideoArtifactFramePlanEntry } from "./artifact-frame-state";
import {
  resolveToolcraftExportFrame,
  ToolcraftSceneExportError,
  type ToolcraftExportFrame,
  type ToolcraftExportFrameResult,
} from "./export-frame";

type ToolcraftArtifactSceneFrameBaseRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  productSceneRequired: boolean;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export type ToolcraftImageArtifactSceneFrameRequest =
  ToolcraftArtifactSceneFrameBaseRequest &
    Readonly<{ state: ToolcraftState }>;

export type ToolcraftVideoArtifactSceneFrameRequest =
  ToolcraftArtifactSceneFrameBaseRequest &
    Readonly<{ framePlan: readonly ToolcraftVideoArtifactFramePlanEntry[] }>;

function requireFrame(result: ToolcraftExportFrameResult): ToolcraftExportFrame {
  if (!result.ok) {
    throw new ToolcraftSceneExportError(result);
  }

  return result.frame;
}

function requireProductRects(
  state: ToolcraftState,
  request: ToolcraftArtifactSceneFrameBaseRequest,
): readonly ToolcraftSceneRect[] {
  if (!request.boundsProvider) {
    if (request.productSceneRequired) {
      throw new ToolcraftSceneExportError({
        code: "scene-bounds-unavailable",
        message: "This infinite product scene does not provide export bounds.",
        ok: false,
      });
    }

    return [];
  }

  try {
    return request.boundsProvider({ state });
  } catch {
    throw new ToolcraftSceneExportError({
      code: "scene-bounds-unavailable",
      message: "Product scene bounds could not be resolved.",
      ok: false,
    });
  }
}

function isFiniteCanvas(state: ToolcraftState): boolean {
  return getToolcraftCanvasFrame(state.canvas).kind === "finite";
}

export function resolveToolcraftImageArtifactFrame(
  request: ToolcraftImageArtifactSceneFrameRequest,
): ToolcraftExportFrame {
  if (isFiniteCanvas(request.state)) {
    return requireFrame(resolveToolcraftExportFrame(request.state, null));
  }

  const bounds = resolveToolcraftSceneBounds(
    request.state,
    requireProductRects(request.state, request),
    request.visibility,
  );
  return requireFrame(resolveToolcraftExportFrame(request.state, bounds));
}

export function resolveToolcraftVideoArtifactFrame(
  request: ToolcraftVideoArtifactSceneFrameRequest,
): ToolcraftExportFrame {
  const firstState = request.framePlan[0]?.state;
  if (!firstState) {
    throw new ToolcraftSceneExportError({
      code: "empty-scene",
      message: "Video export has no scheduled frames.",
      ok: false,
    });
  }
  if (isFiniteCanvas(firstState)) {
    return requireFrame(resolveToolcraftExportFrame(firstState, null));
  }

  const frameBounds: ToolcraftSceneRect[] = [];
  for (const entry of request.framePlan) {
    const result = resolveToolcraftSceneBounds(
      entry.state,
      requireProductRects(entry.state, request),
      request.visibility,
    );
    if (result.ok) {
      frameBounds.push(result.bounds);
    } else if (result.code !== "empty-scene") {
      throw new ToolcraftSceneExportError(result);
    }
  }

  return requireFrame(
    resolveToolcraftExportFrame(firstState, unionToolcraftSceneRects(frameBounds)),
  );
}
