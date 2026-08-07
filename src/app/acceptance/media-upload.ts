import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import {
  TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE,
  type ToolcraftComponentAcceptance,
  type ToolcraftProductReadiness,
} from "./types";

function hasAllModelImportCoverage(
  coverage: ToolcraftComponentAcceptance["modelImportCoverage"],
): boolean {
  return (
    coverage === "all-required-model-import-behavior" ||
    (Array.isArray(coverage) &&
      TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE.every((item) =>
        coverage.includes(item),
      ))
  );
}

function hasLayersOwnedMediaManagement({
  acceptance,
  control,
  layersEnabled,
  productReadiness,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  control: ToolcraftControlSchema;
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
}): boolean {
  if (!layersEnabled || productReadiness.mode !== "product") {
    return false;
  }

  const ownershipById = new Map(
    productReadiness.interactionOwnership.map((entry) => [entry.id, entry] as const),
  );

  return acceptance.some((entry) => {
    const ownership = entry.interactionId
      ? ownershipById.get(entry.interactionId)
      : undefined;

    return (
      entry.kind === "runtime" &&
      entry.layerCoverage !== undefined &&
      entry.target === control.target &&
      ownership?.surface === "panel" &&
      ownership.target === control.target &&
      (ownership.capability === "collection-edit" ||
        ownership.capability === "structured-selection")
    );
  });
}

function hasSelectedLayerImageTransformCoverage(
  acceptance: readonly ToolcraftComponentAcceptance[],
): boolean {
  return acceptance.some((entry) => {
    const coverage = new Set(entry.mediaLifecycleCoverage ?? []);

    return (
      entry.kind === "runtime" &&
      entry.evidence === "media-lifecycle" &&
      entry.layerCoverage === "selected-layer-controls" &&
      coverage.has("rotate") &&
      coverage.has("flip") &&
      coverage.has("transform-output")
    );
  });
}

export function getFileDropLifecycleCoverageErrors({
  acceptance,
  control,
  entry,
  hasDefaultMediaAssets,
  label,
  layersEnabled,
  productReadiness,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  control: ToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  hasDefaultMediaAssets: boolean;
  label: string;
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
}): string[] {
  const errors: string[] = [];
  const coverage = new Set(entry.mediaLifecycleCoverage ?? []);
  const layersOwnMediaManagement = hasLayersOwnedMediaManagement({
    acceptance,
    control,
    layersEnabled,
    productReadiness,
  });

  if (entry.evidence !== "media-lifecycle") {
    errors.push(
      `${label} fileDrop acceptance evidence must be "media-lifecycle" so upload, clear, and reset behavior cannot be replaced by generic product-output coverage.`,
    );
  }

  if (!coverage.has("upload") || !coverage.has("remove") || !coverage.has("reset")) {
    errors.push(
      `${label} fileDrop acceptance must prove upload/import, clear/remove, and section or global reset restore default source media or remove uploaded source media when no default exists.`,
    );
  }

  if (hasDefaultMediaAssets) {
    if (!coverage.has("default-remove") || !coverage.has("default-reset")) {
      errors.push(
        `${label} fileDrop acceptance must prove predefined media.defaultAssets render as attached files, can be removed to an empty source/canvas state, and are restored by section or global Reset.`,
      );
    }
  }

  if (control.assetKind === "image" && !layersOwnMediaManagement) {
    if (
      !coverage.has("rotate") ||
      !coverage.has("flip") ||
      !coverage.has("transform-output")
    ) {
      errors.push(
        `${label} image fileDrop acceptance must prove rotate and flip actions update runtime media transform metadata and that preview, renderer, or export consumes the transform.`,
      );
    }
  }

  if (
    control.assetKind === "image" &&
    layersOwnMediaManagement &&
    !hasSelectedLayerImageTransformCoverage(acceptance)
  ) {
    errors.push(
      `${label} Layers-owned image transforms require a runtime acceptance entry with layerCoverage "selected-layer-controls" and mediaLifecycleCoverage for rotate, flip, and transform-output.`,
    );
  }

  if (
    control.assetKind === "model" &&
    !hasAllModelImportCoverage(entry.modelImportCoverage)
  ) {
    errors.push(
      `${label} model fileDrop acceptance must declare modelImportCoverage for: ${TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE.join(", ")}.`,
    );
  }

  if (
    control.multiple === true &&
    control.variant !== "collection-actions" &&
    !layersOwnMediaManagement
  ) {
    if (!coverage.has("reorder") || !coverage.has("order-output")) {
      errors.push(
        `${label} multiple fileDrop acceptance must prove thumbnail/file reorder updates runtime media order and that preview, renderer, or export consumes that order.`,
      );
    }
  }

  return errors;
}
