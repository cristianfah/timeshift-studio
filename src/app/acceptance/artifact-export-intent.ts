import type { ToolcraftArtifactExportIntent } from "./types";

export type ToolcraftArtifactExportDelivery = Readonly<{
  imageEnabled: boolean;
  videoEnabled: boolean;
}>;

export type ToolcraftArtifactExportSchemaFacts = Readonly<{
  hasImageExportAction: boolean;
  hasImageExportSection: boolean;
  hasVideoExportAction: boolean;
  hasVideoExportSection: boolean;
}>;

export type ToolcraftArtifactExportIntentValidation = Readonly<{
  delivery: ToolcraftArtifactExportDelivery;
  errors: readonly string[];
}>;

export function resolveToolcraftArtifactExportIntent(
  intent: ToolcraftArtifactExportIntent,
): ToolcraftArtifactExportDelivery {
  return Object.freeze({
    imageEnabled: intent.image.mode !== "user-removed",
    videoEnabled: intent.video.mode === "user-requested",
  });
}

export function getToolcraftArtifactExportIntentEvidenceErrors(
  intent: ToolcraftArtifactExportIntent,
): readonly string[] {
  const errors: string[] = [];

  if (
    intent.image.mode !== "toolcraft-default" &&
    intent.image.evidence.trim() === ""
  ) {
    errors.push(
      `Image export ${intent.image.mode} intent requires non-empty evidence.`,
    );
  }

  if (
    intent.video.mode === "user-requested" &&
    intent.video.evidence.trim() === ""
  ) {
    errors.push(
      "Video export user-requested intent requires non-empty evidence.",
    );
  }

  return errors;
}

function getToolcraftArtifactCorrespondenceErrors({
  actionRole,
  artifact,
  enabled,
  hasAction,
  hasSection,
  intentMode,
  sectionArticle,
  sectionTitle,
}: Readonly<{
  actionRole: "export-image" | "export-video";
  artifact: "Image" | "Video";
  enabled: boolean;
  hasAction: boolean;
  hasSection: boolean;
  intentMode:
    | ToolcraftArtifactExportIntent["image"]["mode"]
    | ToolcraftArtifactExportIntent["video"]["mode"];
  sectionArticle: "a" | "an";
  sectionTitle: "Image Export" | "Video Export";
}>): string[] {
  const errors: string[] = [];
  const requirement = enabled ? "requires" : "must not have";

  if (hasAction !== enabled) {
    errors.push(
      `${artifact} export intent "${intentMode}" ${requirement} an ${actionRole} panel action.`,
    );
  }

  if (hasSection !== enabled) {
    errors.push(
      `${artifact} export intent "${intentMode}" ${requirement} ${sectionArticle} "${sectionTitle}" section.`,
    );
  }

  return errors;
}

export function validateToolcraftArtifactExportIntentCorrespondence({
  hasImageExportAction,
  hasImageExportSection,
  hasVideoExportAction,
  hasVideoExportSection,
  intent,
}: ToolcraftArtifactExportSchemaFacts &
  Readonly<{
    intent: ToolcraftArtifactExportIntent;
  }>): ToolcraftArtifactExportIntentValidation {
  const delivery = resolveToolcraftArtifactExportIntent(intent);
  const errors = [
    ...getToolcraftArtifactExportIntentEvidenceErrors(intent),
    ...getToolcraftArtifactCorrespondenceErrors({
      actionRole: "export-image",
      artifact: "Image",
      enabled: delivery.imageEnabled,
      hasAction: hasImageExportAction,
      hasSection: hasImageExportSection,
      intentMode: intent.image.mode,
      sectionArticle: "an",
      sectionTitle: "Image Export",
    }),
    ...getToolcraftArtifactCorrespondenceErrors({
      actionRole: "export-video",
      artifact: "Video",
      enabled: delivery.videoEnabled,
      hasAction: hasVideoExportAction,
      hasSection: hasVideoExportSection,
      intentMode: intent.video.mode,
      sectionArticle: "a",
      sectionTitle: "Video Export",
    }),
  ];

  return { delivery, errors };
}
