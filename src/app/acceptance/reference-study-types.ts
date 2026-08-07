export type ToolcraftReferenceStudyStatus =
  | "ran-original"
  | "restored-local"
  | "source-inspection-only";

export type ToolcraftReferenceStudyEvidence = {
  behaviorEvidence: string;
  referenceLocation: string;
  reproductionSteps: string;
  sourceEvidence: string;
  sourceOnlyReason?: string;
  status: ToolcraftReferenceStudyStatus;
};

export type ToolcraftVideoReferenceStoryboardFrame = {
  behaviorObservation: string;
  frameId: string;
  frameSource: string;
  timeSeconds: number;
  visualObservation: string;
};

export type ToolcraftVideoReferenceTransition = {
  behaviorDelta: string;
  fromFrameId: string;
  id: string;
  toFrameId: string;
};

export type ToolcraftVideoReferenceAcceptanceMapping = {
  acceptanceId: string;
  behavior: string;
  frameIds: readonly string[];
};

export type ToolcraftVideoReferenceStudyEvidence = {
  acceptanceMapping: readonly ToolcraftVideoReferenceAcceptanceMapping[];
  behaviorDecomposition: string;
  extractionEvidence: string;
  referenceLocation: string;
  storyboard: readonly ToolcraftVideoReferenceStoryboardFrame[];
  transitionAnalysis: readonly ToolcraftVideoReferenceTransition[];
};

export type ToolcraftReferenceFeatureStatus =
  | "intentionally-changed"
  | "ported"
  | "toolcraft-native";

export type ToolcraftReferenceFeatureInventoryItem = {
  acceptanceId: string;
  behaviorEvidence: string;
  featureName: string;
  id: string;
  referenceBehavior: string;
  sourceEvidence: string;
  status: ToolcraftReferenceFeatureStatus;
  toolcraftMapping: string;
  userApprovedChangeReason?: string;
};
