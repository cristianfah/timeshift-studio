import {
  createToolcraftRuntimeSetupSection,
} from "./runtime-setup-section";
import { extractToolcraftRuntimeSetupBackground } from "./runtime-setup-background";
import { normalizeControlsPanelLayout } from "./controls-panel-normalization";
import { resolveToolcraftControlSectionId } from "./controls-panel-section-id";
import { resolveToolcraftTimelinePanel } from "./schema-resolvers";
import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftPanelsSchema,
  ResolvedToolcraftSettingsTransferSchema,
  ToolcraftAppSchema,
} from "./types";
export function normalizeToolcraftPanels({
  canvas,
  panels,
  settingsTransfer,
}: {
  canvas: ResolvedToolcraftAppSchema["canvas"];
  panels: ToolcraftAppSchema["panels"];
  settingsTransfer: ResolvedToolcraftSettingsTransferSchema;
}): ResolvedToolcraftPanelsSchema {
  const normalizedTimeline = resolveToolcraftTimelinePanel(panels.timeline);
  const normalizedPanels: ResolvedToolcraftPanelsSchema = {
    ...(panels.layers ? { layers: panels.layers } : {}),
    ...(normalizedTimeline ? { timeline: normalizedTimeline } : {}),
  };

  if (!panels.controls) {
    return normalizedPanels;
  }

  const controls = { ...panels.controls };
  const backgroundExtraction = extractToolcraftRuntimeSetupBackground({
    sections: controls.sections,
  });
  const runtimeSetupSection = createToolcraftRuntimeSetupSection({
    background: backgroundExtraction.background,
    canvas,
    settingsTransfer,
    timeline: normalizedTimeline,
  });
  const authoredSections = backgroundExtraction.sections.filter((section) => {
    if (section.id !== "runtime.setup") {
      return true;
    }

    // A resolved schema may be passed back through defineToolcraft. Validate the
    // prior generated Setup section before replacing it with the current one.
    resolveToolcraftControlSectionId(section);
    return false;
  });

  return {
    ...normalizedPanels,
    controls: normalizeControlsPanelLayout({
      ...controls,
      sections: [
        runtimeSetupSection,
        ...authoredSections,
      ],
    }),
  };
}
