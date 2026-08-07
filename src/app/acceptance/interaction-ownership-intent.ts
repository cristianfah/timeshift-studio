export type ToolcraftInteractionSurface = "canvas" | "panel";

export type ToolcraftInteractionCapability =
  | "collection-edit"
  | "command"
  | "direct-spatial-edit"
  | "precise-value-entry"
  | "property-edit"
  | "spatial-selection"
  | "structured-selection";

export type ToolcraftInteractionEvidenceSource =
  | "reference"
  | "usability-analysis"
  | "user-request";

export type ToolcraftInteractionOwnershipEntry = {
  alternative: {
    reason: string;
    surface: ToolcraftInteractionSurface;
  };
  capability: ToolcraftInteractionCapability;
  evidence: {
    detail: string;
    source: ToolcraftInteractionEvidenceSource;
  };
  id: string;
  reason: string;
  surface: ToolcraftInteractionSurface;
  target: string;
};
