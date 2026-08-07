import type { ToolcraftArtifactExportDelivery } from "./artifact-export-intent";
import type { ToolcraftOutputExportFacts } from "./output-export-model";

export function getToolcraftOutputExportLayoutErrors({
  delivery,
  facts,
}: {
  delivery: ToolcraftArtifactExportDelivery;
  facts: ToolcraftOutputExportFacts;
}): string[] {
  if (!delivery.imageEnabled && !delivery.videoEnabled) {
    return [];
  }

  const errors: string[] = [];

  if (facts.backgroundSection) {
    errors.push(
      'Product apps with artifact export must not render a separate "Background" section; runtime Setup owns Background, Infinity canvas, and Color.',
    );
  }

  if (!facts.setupSection || facts.setupSectionIndex !== 0) {
    errors.push("Runtime Setup must remain the first controls block.");
  }

  if (
    facts.finalExportSettingsIndex >= 0 &&
    facts.panelActionsSectionIndex >= 0 &&
    facts.finalExportSettingsIndex !== facts.panelActionsSectionIndex - 1
  ) {
    errors.push(
      "The final enabled artifact export settings section must sit directly above sticky footer actions.",
    );
  }

  if (
    delivery.imageEnabled &&
    delivery.videoEnabled &&
    facts.imageExportSectionIndex >= 0 &&
    facts.videoExportSectionIndex >= 0 &&
    facts.imageExportSectionIndex !== facts.videoExportSectionIndex - 1
  ) {
    errors.push(
      'Products with image and video delivery must place "Image Export" immediately before "Video Export".',
    );
  }

  return errors;
}
