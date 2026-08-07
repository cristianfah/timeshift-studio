import type {
  ToolcraftModelAnalysisSummary,
  ToolcraftModelDiagnostic,
} from "../model-import/model-import-types";
import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";
import { createToolcraftDataUrlResourceRef } from "../source-assets/media-resource-ref";
import { readCanvasSize, readPoint } from "./persistence-reader-primitives";
import {
  isToolcraftFiniteNumber,
  isToolcraftPersistenceRecord,
} from "./persistence-shared";
import type {
  ToolcraftFileAsset,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
  ToolcraftMediaTransform,
  ToolcraftModelAsset,
} from "./types";
import { normalizeToolcraftSceneElementFrame } from "./scene-element-frame";

type PersistedMediaBase = Pick<
  ToolcraftMediaAsset,
  "fileName" | "id" | "layerId" | "mimeType"
> & {
  sourceTarget?: string;
};

const diagnosticSeverities = new Set<ToolcraftModelDiagnostic["severity"]>([
  "fatal",
  "info",
  "repairable",
  "warning",
]);
const feedbackCategories = new Set<ToolcraftSourceAssetFeedback["category"]>([
  "bundle",
  "format",
  "geometry",
  "repair",
  "resource-limit",
  "resource-unavailable",
  "topology",
]);

function readMediaBase(value: Record<string, unknown>): PersistedMediaBase | undefined {
  if (
    typeof value.id !== "string" ||
    typeof value.layerId !== "string" ||
    typeof value.fileName !== "string" ||
    typeof value.mimeType !== "string"
  ) {
    return undefined;
  }

  return {
    fileName: value.fileName,
    id: value.id,
    layerId: value.layerId,
    mimeType: value.mimeType,
    ...(typeof value.sourceTarget === "string"
      ? { sourceTarget: value.sourceTarget }
      : {}),
  };
}

function readMediaTransform(value: unknown): ToolcraftMediaTransform | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const transform: ToolcraftMediaTransform = {};

  if (typeof value.flipHorizontal === "boolean") {
    transform.flipHorizontal = value.flipHorizontal;
  }

  if (typeof value.flipVertical === "boolean") {
    transform.flipVertical = value.flipVertical;
  }

  if (
    value.rotationDeg === 0 ||
    value.rotationDeg === 90 ||
    value.rotationDeg === 180 ||
    value.rotationDeg === 270
  ) {
    transform.rotationDeg = value.rotationDeg;
  }

  return Object.keys(transform).length > 0 ? transform : undefined;
}

function readImageAsset(
  value: Record<string, unknown>,
  base: PersistedMediaBase,
): ToolcraftImageAsset | undefined {
  const position = readPoint(value.position);

  const resourceRef =
    typeof value.resourceRef === "string"
      ? value.resourceRef
      : typeof value.dataUrl === "string"
        ? createToolcraftDataUrlResourceRef("image", value.dataUrl)
        : undefined;

  if (!resourceRef || !position) {
    return undefined;
  }

  const size = readCanvasSize(value.size);
  const transform = readMediaTransform(value.transform);

  return {
    ...base,
    assetKind: "image",
    lifecycle: "restoring",
    position,
    resourceRef,
    ...(size ? { size } : {}),
    ...(transform ? { transform } : {}),
  };
}

function readFileAsset(
  value: Record<string, unknown>,
  base: PersistedMediaBase,
): ToolcraftFileAsset | undefined {
  const position = readPoint(value.position);

  const resourceRef =
    typeof value.resourceRef === "string"
      ? value.resourceRef
      : typeof value.dataUrl === "string"
        ? createToolcraftDataUrlResourceRef("file", value.dataUrl)
        : undefined;

  if (!resourceRef || !position) {
    return undefined;
  }

  return {
    ...base,
    assetKind: "file",
    lifecycle: "restoring",
    position,
    resourceRef,
  };
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return isToolcraftFiniteNumber(value) && value >= 0 && Number.isInteger(value)
    ? value
    : undefined;
}

function readModelDiagnostic(value: unknown): ToolcraftModelDiagnostic | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const affectedCount = readNonNegativeInteger(value.affectedCount);

  if (
    affectedCount === undefined ||
    typeof value.code !== "string" ||
    typeof value.explanation !== "string" ||
    typeof value.severity !== "string" ||
    !diagnosticSeverities.has(value.severity as ToolcraftModelDiagnostic["severity"])
  ) {
    return undefined;
  }

  return {
    affectedCount,
    code: value.code,
    explanation: value.explanation,
    severity: value.severity as ToolcraftModelDiagnostic["severity"],
    ...(typeof value.primitiveId === "string"
      ? { primitiveId: value.primitiveId }
      : {}),
  };
}

function readModelAnalysis(value: unknown): ToolcraftModelAnalysisSummary | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    !Array.isArray(value.diagnostics) ||
    (value.outcome !== "clean" &&
      value.outcome !== "fatal" &&
      value.outcome !== "repairable")
  ) {
    return undefined;
  }

  const diagnostics = value.diagnostics.map(readModelDiagnostic);
  const boundaryEdges = readNonNegativeInteger(value.boundaryEdges);
  const disconnectedComponents = readNonNegativeInteger(value.disconnectedComponents);
  const nonManifoldEdges = readNonNegativeInteger(value.nonManifoldEdges);
  const triangles = readNonNegativeInteger(value.triangles);
  const vertices = readNonNegativeInteger(value.vertices);

  if (
    diagnostics.some((diagnostic) => diagnostic === undefined) ||
    boundaryEdges === undefined ||
    disconnectedComponents === undefined ||
    nonManifoldEdges === undefined ||
    triangles === undefined ||
    vertices === undefined
  ) {
    return undefined;
  }

  return {
    boundaryEdges,
    diagnostics: diagnostics as ToolcraftModelDiagnostic[],
    disconnectedComponents,
    nonManifoldEdges,
    outcome: value.outcome,
    ...(typeof value.repairPlanRef === "string"
      ? { repairPlanRef: value.repairPlanRef }
      : {}),
    triangles,
    vertices,
  };
}

function readSourceAssetFeedback(
  value: unknown,
): ToolcraftSourceAssetFeedback | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    typeof value.category !== "string" ||
    !feedbackCategories.has(
      value.category as ToolcraftSourceAssetFeedback["category"],
    ) ||
    typeof value.code !== "string" ||
    typeof value.message !== "string"
  ) {
    return undefined;
  }

  return {
    category: value.category as ToolcraftSourceAssetFeedback["category"],
    code: value.code,
    message: value.message,
  };
}

function readModelAsset(
  value: Record<string, unknown>,
  base: PersistedMediaBase,
): ToolcraftModelAsset | undefined {
  const analysis = readModelAnalysis(value.analysis);
  const originalAnalysis =
    value.originalAnalysis === undefined
      ? analysis
      : readModelAnalysis(value.originalAnalysis);

  if (
    !analysis ||
    !originalAnalysis ||
    typeof value.activeDocumentRef !== "string" ||
    typeof value.originalDocumentRef !== "string" ||
    typeof value.sourceBundleDigest !== "string" ||
    typeof value.sourceBundleRef !== "string" ||
    (value.lifecycle !== "clean" &&
      value.lifecycle !== "fixed" &&
      value.lifecycle !== "repairable" &&
      value.lifecycle !== "restoring" &&
      value.lifecycle !== "unavailable") ||
    (value.topologyProfile !== "realtime-mesh" &&
      value.topologyProfile !== "solid-mesh")
  ) {
    return undefined;
  }

  const lastRepairError = readSourceAssetFeedback(value.lastRepairError);
  const frame = normalizeToolcraftSceneElementFrame({
    position: readPoint(value.position),
    size: readCanvasSize(value.size),
  });

  return {
    ...base,
    activeDocumentRef: value.activeDocumentRef,
    analysis,
    assetKind: "model",
    // Model bytes live in the binary repository, not in localStorage. Every
    // persisted model therefore re-enters through the asynchronous hydration
    // boundary before render/export may consume its refs.
    lifecycle: "restoring",
    originalAnalysis,
    originalDocumentRef: value.originalDocumentRef,
    position: frame.position,
    size: frame.size,
    sourceBundleDigest: value.sourceBundleDigest,
    sourceBundleRef: value.sourceBundleRef,
    topologyProfile: value.topologyProfile,
    ...(typeof value.appliedRepairRecipeId === "string"
      ? { appliedRepairRecipeId: value.appliedRepairRecipeId }
      : {}),
    ...(lastRepairError ? { lastRepairError } : {}),
    ...(typeof value.repairedDocumentRef === "string"
      ? { repairedDocumentRef: value.repairedDocumentRef }
      : {}),
  };
}

function readMediaAsset(value: unknown): ToolcraftMediaAsset | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const base = readMediaBase(value);

  if (!base) {
    return undefined;
  }

  switch (value.assetKind) {
    case "file":
      return readFileAsset(value, base);
    case "model":
      return readModelAsset(value, base);
    case "image":
    case undefined:
      return readImageAsset(value, base);
    default:
      return undefined;
  }
}

export function readMediaAssets(value: unknown): ToolcraftMediaAsset[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item) => {
    const mediaAsset = readMediaAsset(item);
    return mediaAsset ? [mediaAsset] : [];
  });
}
