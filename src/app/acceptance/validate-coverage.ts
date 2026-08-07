import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import {
  getToolcraftAnimationConfigurationErrors,
  getToolcraftAnimationModeChoiceErrors,
} from "./animation-intent";
import { getToolcraftControlAcceptanceErrors } from "./control-acceptance";
import { getToolcraftControlApplicabilityErrors } from "./control-applicability";
import {
  getToolcraftControlSectionHeuristicErrors,
  getToolcraftControlSectionInvariantErrors,
} from "./control-layout";
import { getToolcraftControlOrderErrors } from "./control-order";
import { getToolcraftControlSectionEntityCohesionErrors } from "./control-section-entity-cohesion";
import { getToolcraftControlSectionInventoryErrors } from "./control-section-inventory";
import { isToolcraftVisibleAcceptanceControl } from "./controls";
import { getToolcraftInlineLayoutErrors } from "./inline-layout";
import { getToolcraftInfinityCanvasCoverageErrors } from "./infinity-canvas";
import {
  getToolcraftOutputExportErrors,
  schemaHasVideoExportPanelAction,
} from "./output-export";
import { getToolcraftOrientationGizmoErrors } from "./orientation-gizmo";
import { getToolcraftReferenceRuntimeCloneErrors } from "./reference-runtime";
import { getToolcraftRenderScaleCoverageErrors } from "./render-scale";
import {
  getToolcraftCanvasSizingCoverageErrors,
  getToolcraftLayerCoverageErrors,
  getToolcraftPersistenceCoverageErrors,
  getToolcraftTimelineKeyframeCoverageErrors,
  getToolcraftTimelinePlaybackCoverageErrors,
} from "./runtime-coverage";
import { getToolcraftRuntimeSetupSectionErrors } from "./runtime-setup";
import { getToolcraftInteractionOwnershipErrors } from "./interaction-ownership";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
  ToolcraftVisibleControl,
} from "./types";
import {
  getBlockingToolcraftAcceptanceMessages,
  runToolcraftAcceptanceValidators,
  type ToolcraftAcceptanceDiagnostic,
  type ToolcraftAcceptanceValidationContext,
  type ToolcraftAcceptanceValidator,
} from "./validation-pipeline";
import { getToolcraftVideoReferenceStudyErrors } from "./video-reference-study";
import { getToolcraftViewInteractionErrors } from "./view-interaction";

export type ToolcraftAcceptanceValidationInput = {
  acceptance: readonly ToolcraftComponentAcceptance[];
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
  transferMode: ToolcraftTransferMode;
};

export function collectToolcraftVisibleAcceptanceControls(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftVisibleControl[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.entries(section.controls)
      .filter(([, control]) => isToolcraftVisibleAcceptanceControl(control))
      .map(([controlId, control]) => ({
        control,
        controlId,
        sectionTitle: section.title,
      })),
  );
}

function createToolcraftAcceptanceValidationContext({
  acceptance,
  productReadiness,
  schema,
  sectionInventory,
  transferMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
  transferMode: ToolcraftTransferMode;
}): ToolcraftAcceptanceValidationContext {
  const controls = collectToolcraftVisibleAcceptanceControls(schema);

  return {
    acceptance,
    controls,
    hasVideoExportAction: schemaHasVideoExportPanelAction(schema),
    layersEnabled: Boolean(schema.panels.layers),
    productReadiness,
    schema,
    sectionInventory,
    timelineMode: schema.panels.timeline?.enabled
      ? schema.panels.timeline.mode
      : null,
    transferMode,
  };
}

const toolcraftAcceptanceValidators: readonly ToolcraftAcceptanceValidator[] = [
  {
    path: "appProductReadiness.interactionOwnership",
    ruleId: "interaction-surface-ownership",
    validate: ({ acceptance, controls, productReadiness }) =>
      getToolcraftInteractionOwnershipErrors({
        acceptance,
        controls,
        productReadiness,
      }),
  },
  {
    path: "appProductReadiness.viewInteraction",
    ruleId: "renderer-view-interaction",
    validate: ({ productReadiness, schema, transferMode }) =>
      getToolcraftViewInteractionErrors({
        productReadiness,
        schema,
        transferMode,
      }),
  },
  {
    path: "schema.panels.controls.setup",
    ruleId: "output-export-required",
    validate: ({ schema }) => getToolcraftRuntimeSetupSectionErrors(schema),
  },
  {
    path: "schema.panels.controls.sections",
    ruleId: "controls-layout-heuristics",
    validate: ({ schema }) => getToolcraftControlOrderErrors(schema),
  },
  {
    path: "appControlSectionInventory",
    ruleId: "controls-layout-heuristics",
    validate: ({ schema }) => getToolcraftControlSectionHeuristicErrors(schema),
  },
  {
    path: "schema.panels.controls.sections",
    ruleId: "controls-component-layout-invariants",
    validate: ({ schema, sectionInventory }) =>
      getToolcraftControlSectionInvariantErrors(schema, sectionInventory),
  },
  {
    path: "schema.panels.controls.sections[].controls",
    ruleId: "controls-product-coverage",
    validate: ({ schema }) => getToolcraftOrientationGizmoErrors(schema),
  },
  {
    path: "schema.panels.controls.sections[].controls[].applicability",
    ruleId: "controls-product-coverage",
    validate: ({ controls, productReadiness }) =>
      getToolcraftControlApplicabilityErrors({
        controls,
        productReadiness,
      }),
  },
  {
    path: "appControlSectionInventory",
    ruleId: "controls-section-inventory-required",
    validate: ({ schema, sectionInventory }) =>
      getToolcraftControlSectionInventoryErrors(schema, sectionInventory),
  },
  {
    path: "appControlSectionInventory",
    ruleId: "controls-section-inventory-required",
    validate: ({ sectionInventory }) =>
      getToolcraftControlSectionEntityCohesionErrors(sectionInventory),
  },
  {
    path: "schema.panels.controls.sections[].layoutGroups",
    ruleId: "controls-component-layout-invariants",
    validate: ({ schema }) => getToolcraftInlineLayoutErrors(schema),
  },
  {
    path: "schema.export",
    ruleId: "output-export-required",
    validate: ({ acceptance, controls, productReadiness, schema }) =>
      getToolcraftOutputExportErrors({
        acceptance,
        controls,
        productReadiness,
        schema,
      }),
  },
  {
    path: "appTransferMode.videoReferenceStudy",
    ruleId: "video-reference-analysis",
    validate: getToolcraftVideoReferenceStudyErrors,
  },
  {
    path: "appTransferMode.animationIntent",
    ruleId: "timeline-mode-choice",
    validate: getToolcraftAnimationModeChoiceErrors,
  },
  {
    path: "appTransferMode.animationIntent",
    ruleId: "timeline-enabled-behavior",
    validate: getToolcraftAnimationConfigurationErrors,
  },
  {
    path: "appTransferMode.referenceStudy",
    ruleId: "reference-clone-source-of-truth",
    validate: ({ acceptance, schema, timelineMode, transferMode }) =>
      getToolcraftReferenceRuntimeCloneErrors({
        acceptance,
        schema,
        timelineMode,
        transferMode,
      }),
  },
  {
    path: "acceptance.layerCoverage",
    ruleId: "layers-enabled-behavior",
    validate: ({ acceptance, layersEnabled }) =>
      getToolcraftLayerCoverageErrors({ acceptance, layersEnabled }),
  },
  {
    path: "acceptance.timelineCoverage",
    ruleId: "timeline-enabled-behavior",
    validate: ({ acceptance, timelineMode }) =>
      getToolcraftTimelinePlaybackCoverageErrors({ acceptance, timelineMode }),
  },
  {
    path: "acceptance.timelineCoverage",
    ruleId: "timeline-enabled-behavior",
    validate: ({ acceptance, timelineMode }) =>
      getToolcraftTimelineKeyframeCoverageErrors({ acceptance, timelineMode }),
  },
  {
    path: "acceptance.canvasSizingCoverage",
    ruleId: "output-export-required",
    validate: ({ acceptance, schema }) =>
      getToolcraftCanvasSizingCoverageErrors({ acceptance, schema }),
  },
  {
    path: "acceptance.renderScaleCoverage",
    ruleId: "acceptance-product-observable",
    validate: ({ acceptance, schema }) =>
      getToolcraftRenderScaleCoverageErrors({ acceptance, schema }),
  },
  {
    path: "acceptance.infinityCanvasCoverage",
    ruleId: "infinity-canvas-scene-bounds",
    validate: ({ acceptance, productReadiness, schema }) =>
      getToolcraftInfinityCanvasCoverageErrors({
        acceptance,
        productReadiness,
        schema,
      }),
  },
  {
    path: "acceptance.persistenceCoverage",
    ruleId: "persistence-policy-explicit",
    validate: ({ acceptance, schema }) =>
      getToolcraftPersistenceCoverageErrors({ acceptance, schema }),
  },
  {
    path: "acceptance.controls",
    ruleId: "controls-product-coverage",
    validate: ({
      acceptance,
      controls,
      layersEnabled,
      productReadiness,
      schema,
      timelineMode,
    }) =>
      getToolcraftControlAcceptanceErrors({
        acceptance,
        controls,
        layersEnabled,
        productReadiness,
        schema,
        timelineMode,
      }),
  },
];

export function validateToolcraftAcceptanceDiagnostics(
  input: ToolcraftAcceptanceValidationInput,
): ToolcraftAcceptanceDiagnostic[] {
  return runToolcraftAcceptanceValidators(
    createToolcraftAcceptanceValidationContext(input),
    toolcraftAcceptanceValidators,
  );
}

export function validateToolcraftAcceptanceCoverage({
  acceptance,
  productReadiness,
  schema,
  sectionInventory,
  transferMode,
}: ToolcraftAcceptanceValidationInput): string[] {
  return getBlockingToolcraftAcceptanceMessages(
    validateToolcraftAcceptanceDiagnostics({
      acceptance,
      productReadiness,
      schema,
      sectionInventory,
      transferMode,
    }),
  );
}
