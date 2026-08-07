import type {
  ToolcraftBuiltInControlType as RuntimeToolcraftBuiltInControlType,
  ToolcraftControlOrderRole,
  ResolvedToolcraftControlSchema,
  ToolcraftPersistableStateSlice,
} from "@/toolcraft/runtime";
import { TOOLCRAFT_BUILT_IN_CONTROL_TYPES } from "@/toolcraft/runtime";
import type {
  ToolcraftCanvasSizingCoverage,
  ToolcraftInfinityCanvasCoverage,
  ToolcraftRenderScaleCoverage,
} from "./canvas-coverage";
import type { ToolcraftModelImportCoverage } from "./model-import-coverage";
import type { ToolcraftInteractionOwnershipEntry } from "./interaction-ownership-intent";
import type {
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceStudyEvidence,
  ToolcraftVideoReferenceStudyEvidence,
} from "./reference-study-types";
import type { ToolcraftViewInteractionIntent } from "./view-interaction-intent";

export { TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE } from "./model-import-coverage";
export type {
  ToolcraftCanvasSizingCoverage,
  ToolcraftInfinityCanvasCoverage,
  ToolcraftRenderScaleCoverage,
  ToolcraftRenderScaleState,
} from "./canvas-coverage";
export type { ToolcraftModelImportCoverage } from "./model-import-coverage";
export type {
  ToolcraftInteractionCapability,
  ToolcraftInteractionEvidenceSource,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftInteractionSurface,
} from "./interaction-ownership-intent";
export type {
  ToolcraftViewInteractionEvidenceSource,
  ToolcraftViewInteractionIntent,
} from "./view-interaction-intent";
export type {
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceFeatureStatus,
  ToolcraftReferenceStudyEvidence,
  ToolcraftReferenceStudyStatus,
  ToolcraftVideoReferenceAcceptanceMapping,
  ToolcraftVideoReferenceStoryboardFrame,
  ToolcraftVideoReferenceStudyEvidence,
  ToolcraftVideoReferenceTransition,
} from "./reference-study-types";

export type ToolcraftAcceptanceEvidence =
  | "command-side-effect"
  | "exported-bytes"
  | "media-lifecycle"
  | "persistence-state"
  | "product-output"
  | "rendered-pixels"
  | "timeline-output"
  | "viewport-side-effect";

export type ToolcraftExportArtifactCoverage =
  | "all-required-image-export-behavior"
  | "all-required-video-export-behavior";

export type ToolcraftReferenceCoverage =
  | "canvas-sizing"
  | "control-mapping"
  | "export-at-time"
  | "export-copy"
  | "media-lifecycle"
  | "pause-resume"
  | "renderer-loop"
  | "renderer-state"
  | "restart"
  | "spawn-update-cadence"
  | "time-progress";

export type ToolcraftReferenceTimelineCoverage =
  | "all-range"
  | "duration"
  | "export-at-time"
  | "export-range"
  | "jump-to-trim-start"
  | "keyframes"
  | "loop"
  | "playback"
  | "range-playback"
  | "restart"
  | "scrub"
  | "state-jump"
  | "time-progress"
  | "trim-range";

export type ToolcraftTimelinePlaybackCoverage =
  | "duration"
  | "loop"
  | "pause-resume"
  | "rendered-frame"
  | "scrub";

export type ToolcraftPersistenceCoverage = "reload";

export type ToolcraftSettingsTransferCoverage = "opt-out";

export type ToolcraftOrientationGizmoCoverage =
  | "axis-drag"
  | "axis-snap"
  | "canvas-miss-pan"
  | "export-clean"
  | "model-drag"
  | "shared-pose-output"
  | "undo-reset";

export type ToolcraftBackgroundOutputCoverage =
  | "infinity-viewport-color-and-dependency"
  | "image-transparent-when-excluded"
  | "preview-hidden-when-excluded"
  | "video-background-preserved";

export type ToolcraftMediaLifecycleCoverage =
  | "default-remove"
  | "default-reset"
  | "flip"
  | "order-output"
  | "remove"
  | "reorder"
  | "reset"
  | "rotate"
  | "transform-output"
  | "upload";

export type ToolcraftAutonomousAnimationCoverage =
  | "no-duration-control"
  | "no-export-at-time"
  | "no-loop-control"
  | "no-play-pause"
  | "no-scrub"
  | "no-user-facing-transport";

export type ToolcraftTimelineLoopDurationSource =
  | "product-derived"
  | "reference"
  | "user-request";

export type ToolcraftTimelineLoopDurationIntent = {
  evidence: string;
  seconds: number;
  source: ToolcraftTimelineLoopDurationSource;
};

export type ToolcraftTimelineLoopProof = {
  direction: "forward-only";
  durationChange: "reproved-after-edit";
  reversePlayback: "forbidden";
  seam: "first-last-match";
};

export type ToolcraftAnimationIntent =
  | {
      mode: "none";
    }
  | {
      behaviorCoverage: readonly ToolcraftAutonomousAnimationCoverage[];
      mode: "autonomous";
      reason: string;
    }
  | {
      loopDuration: ToolcraftTimelineLoopDurationIntent;
      mode: "timeline-keyframes";
    }
  | {
      loopDuration: ToolcraftTimelineLoopDurationIntent;
      mode: "timeline-playback";
    };

export type ToolcraftReferenceTimelineMode =
  | "custom-reference-timeline"
  | "none"
  | "toolcraft-keyframes"
  | "toolcraft-playback";

export type ToolcraftReferenceTimelineContract = {
  behaviorCoverage: readonly ToolcraftReferenceTimelineCoverage[];
  loopDuration?: ToolcraftTimelineLoopDurationIntent;
  mode: ToolcraftReferenceTimelineMode;
};

export type ToolcraftLayerCoverage =
  | "grouping"
  | "media-lifecycle"
  | "reorder"
  | "selected-layer-controls"
  | "selection"
  | "visibility";

export type ToolcraftControlPartCoverage =
  | "anchorGrid.position"
  | "channelMixer.activeChannel"
  | "channelMixer.values"
  | "collectionActions.add"
  | "collectionActions.items"
  | "collectionActions.remove"
  | "curves.activeChannel"
  | "curves.points"
  | "colorOpacity.hex"
  | "colorOpacity.opacity"
  | "fontPicker.color"
  | "fontPicker.fontId"
  | "fontPicker.fontSize"
  | "fontPicker.fontWeight"
  | "fontPicker.letterSpacing"
  | "fontPicker.lineHeight"
  | "fontPicker.opacity"
  | "fontPicker.textCase"
  | "gradient.angle"
  | "gradient.gradientType"
  | "gradient.stops.color"
  | "gradient.stops.opacity"
  | "gradient.stops.position"
  | "palette.family"
  | "palette.shade"
  | "rangeInput.end"
  | "rangeInput.start"
  | "rangeSlider.lower"
  | "rangeSlider.upper"
  | "sourceCollection.items"
  | "vector.x"
  | "vector.y";

export type ToolcraftCustomControlCoverage =
  | "built-in-gap"
  | "kit-primitives"
  | "minimal-ui"
  | "product-output"
  | "runtime-state";

export const builtInToolcraftControlTypeValues =
  TOOLCRAFT_BUILT_IN_CONTROL_TYPES;

export type ToolcraftBuiltInControlType = RuntimeToolcraftBuiltInControlType;

export type ToolcraftBuiltInFitCheck = {
  capabilities: readonly ToolcraftCustomControlCapability[];
  checkedBuiltIns: readonly ToolcraftBuiltInControlType[];
  closestBuiltIn: ToolcraftBuiltInControlType | "none";
  productObservable: string;
  whyInsufficient: string;
};

export type ToolcraftCustomControlCapability =
  | "collection"
  | "commands"
  | "custom-interaction"
  | "custom-value-model"
  | "custom-visualization"
  | "reorder"
  | "selection";

export type ToolcraftTransferMode =
  | {
      animationIntent?: ToolcraftAnimationIntent;
      mode: "new-toolcraft-app";
      videoReferenceStudy?: ToolcraftVideoReferenceStudyEvidence;
    }
  | {
      animationIntent?: ToolcraftAnimationIntent;
      behaviorCoverage: readonly ToolcraftReferenceCoverage[];
      mode: "reference-runtime-clone";
      referenceFeatureInventory?: readonly ToolcraftReferenceFeatureInventoryItem[];
      referenceName: string;
      referenceStudy?: ToolcraftReferenceStudyEvidence;
      referenceTimeline: ToolcraftReferenceTimelineContract;
      sourceOfTruth: "reference-runtime";
      videoReferenceStudy?: ToolcraftVideoReferenceStudyEvidence;
    };

export type ToolcraftImageExportIntent =
  | Readonly<{ mode: "toolcraft-default" }>
  | Readonly<{ evidence: string; mode: "user-requested" }>
  | Readonly<{ evidence: string; mode: "user-removed" }>;

export type ToolcraftVideoExportIntent =
  | Readonly<{ mode: "not-requested" }>
  | Readonly<{ evidence: string; mode: "user-requested" }>;

export type ToolcraftArtifactExportIntent = Readonly<{
  image: ToolcraftImageExportIntent;
  video: ToolcraftVideoExportIntent;
}>;

export type ToolcraftProductReadiness =
  | {
      mode: "starter";
      reason: string;
    }
  | {
      exportIntent: ToolcraftArtifactExportIntent;
      mode: "product";
      interactionOwnership: readonly ToolcraftInteractionOwnershipEntry[];
      productName: string;
      productSummary: string;
      requestedBehavior: string;
      viewInteraction: ToolcraftViewInteractionIntent;
    };

export type ToolcraftComponentAcceptance = {
  actionCoverage?: readonly string[];
  automated: boolean;
  automatedTestName: string;
  browser: boolean;
  browserTestName: string;
  componentType: string;
  evidence: ToolcraftAcceptanceEvidence;
  exportArtifactCoverage?:
    | ToolcraftExportArtifactCoverage
    | readonly ToolcraftExportArtifactCoverage[];
  expectedObservable: string;
  fixture: string;
  id: string;
  interactionId?: string;
  canvasHandle?: {
    exportCleanTestName: string;
    outputObservable: string;
    testId: string;
    writesTarget: string;
  };
  kind: "canvas-handle" | "control" | "runtime";
  canvasSizingCoverage?: ToolcraftCanvasSizingCoverage;
  infinityCanvasCoverage?: ToolcraftInfinityCanvasCoverage;
  layerCoverage?: ToolcraftLayerCoverage;
  mediaLifecycleCoverage?: readonly ToolcraftMediaLifecycleCoverage[];
  modelImportCoverage?:
    | "all-required-model-import-behavior"
    | readonly ToolcraftModelImportCoverage[];
  optionCoverage?: "each-visible-item" | readonly string[];
  orientationGizmoCoverage?:
    | "all-required-orientation-gizmo-behavior"
    | readonly ToolcraftOrientationGizmoCoverage[];
  persistenceCoverage?: ToolcraftPersistenceCoverage;
  persistenceSlices?: readonly ToolcraftPersistableStateSlice[];
  referenceCoverage?: ToolcraftReferenceCoverage;
  referenceTimelineCoverage?: ToolcraftReferenceTimelineCoverage;
  renderScaleCoverage?: ToolcraftRenderScaleCoverage;
  settingsTransferCoverage?: ToolcraftSettingsTransferCoverage;
  target?: string;
  timelineCoverage?: "keyframes" | "playback";
  timelinePlaybackCoverage?:
    | "all-playback-behavior"
    | readonly ToolcraftTimelinePlaybackCoverage[];
  timelineLoopProof?: ToolcraftTimelineLoopProof;
  controlPartCoverage?:
    | "all-visible-parts"
    | readonly ToolcraftControlPartCoverage[];
  customControlCoverage?:
    | "all-custom-control-behavior"
    | readonly ToolcraftCustomControlCoverage[];
  builtInFitCheck?: ToolcraftBuiltInFitCheck;
  backgroundOutputCoverage?:
    | "all-required-background-output"
    | readonly ToolcraftBackgroundOutputCoverage[];
  userAction: string;
};

export type ToolcraftVisibleControl = {
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  sectionTitle?: string;
};

export type ToolcraftControlOrderItem = {
  controlId: string;
  rank: number;
  role: ToolcraftControlOrderRole;
  sectionTitle?: string;
  target: string;
  type: string;
};

export type ToolcraftControlSectionInventoryEntry = {
  entity: string;
  entityId: string;
  groupingReason: string;
  id: string;
  splitReason?: string;
  targets: readonly string[];
  title: string;
  workflowStage?: string;
};
