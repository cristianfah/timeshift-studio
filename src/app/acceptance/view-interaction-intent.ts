export type ToolcraftViewInteractionEvidenceSource =
  | "explicit-user-request"
  | "inspected-reference";

export type ToolcraftViewInteractionIntent =
  | {
      mode: "non-spatial";
      reason: string;
    }
  | {
      mode: "orbit";
      orientationTargets: readonly string[];
    }
  | {
      evidence: string;
      mode: "fixed-camera";
      source: ToolcraftViewInteractionEvidenceSource;
    }
  | {
      evidence: string;
      mode: "timeline-camera";
      source: ToolcraftViewInteractionEvidenceSource;
    };
