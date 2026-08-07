import type {
  ToolcraftActionSchema,
  ToolcraftAppSchema,
  ToolcraftControlSectionSchema,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import {
  getToolcraftOutputExportErrors,
  schemaHasPngExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./acceptance/output-export";
import { buildToolcraftOutputExportFacts } from "./acceptance/output-export-model";
import type {
  ToolcraftArtifactExportIntent,
  ToolcraftComponentAcceptance,
  ToolcraftExportArtifactCoverage,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import { collectToolcraftVisibleAcceptanceControls } from "./acceptance/validate-coverage";
import { defineContractSchemaFixture } from "./app-acceptance.contract-fixtures";
import {
  makeBackgroundSection,
  makeImageExportSection,
  makeVideoExportSection,
} from "./app-acceptance.export-test-utils";

type ProductReadiness = Extract<ToolcraftProductReadiness, { mode: "product" }>;

function makeProductReadiness(
  exportIntent: ToolcraftArtifactExportIntent,
): ProductReadiness {
  return {
    exportIntent,
    interactionOwnership: [],
    mode: "product",
    productName: "Explicit export intent fixture",
    productSummary: "A synthetic product for export-intent acceptance coverage.",
    requestedBehavior: "Deliver only the explicitly configured artifact types.",
    viewInteraction: {
      mode: "non-spatial",
      reason: "The synthetic output is two-dimensional.",
    },
  };
}

function makeOutputActionsSection({
  image,
  video,
}: {
  image: boolean;
  video: boolean;
}): ToolcraftControlSectionSchema {
  const actions: ToolcraftActionSchema[] = [];

  if (image) {
    actions.push({
      icon: "upload-simple",
      label: "Export PNG",
      role: "export-image",
      value: "export.png",
    });
  }

  if (video) {
    actions.push({
      icon: "upload-simple",
      label: "Export Video",
      role: "export-video",
      value: "export.video",
    });
  }

  return {
    actionGroup: "secondary",
    controls: {
      outputActions: {
        actions,
        target: "actions.output",
        type: "panelActions",
      },
    },
    title: "Export",
  };
}

function makeExportSchema({
  imageAction = false,
  imageSection = false,
  timeline = false,
  videoAction = false,
  videoSection = false,
}: {
  imageAction?: boolean;
  imageSection?: boolean;
  timeline?: boolean;
  videoAction?: boolean;
  videoSection?: boolean;
} = {}) {
  const sections: ToolcraftControlSectionSchema[] = [];

  if (imageAction || videoAction) {
    sections.push(makeBackgroundSection());
  }
  if (imageSection) {
    sections.push(makeImageExportSection());
  }
  if (videoSection) {
    sections.push(makeVideoExportSection());
  }
  if (imageAction || videoAction) {
    sections.push(makeOutputActionsSection({ image: imageAction, video: videoAction }));
  }

  const panels: ToolcraftAppSchema["panels"] = {
    controls: { sections, title: "Controls" },
    ...(timeline
      ? {
          timeline: {
            defaultDurationSeconds: 8,
            enabled: true,
            mode: "playback",
          },
        }
      : {}),
  };

  return defineContractSchemaFixture({
    canvas: { enabled: true, sizing: { mode: "editable-output" } },
    panels,
  });
}

function makeArtifactCoverage({
  image,
  video,
}: {
  image: boolean;
  video: boolean;
}): readonly ToolcraftComponentAcceptance[] {
  if (!image && !video) {
    return [];
  }

  const exportArtifactCoverage: ToolcraftExportArtifactCoverage[] = [];

  if (image) {
    exportArtifactCoverage.push("all-required-image-export-behavior");
  }
  if (video) {
    exportArtifactCoverage.push("all-required-video-export-behavior");
  }

  return [
    {
      actionCoverage: [
        ...(image ? ["export.png"] : []),
        ...(video ? ["export.video"] : []),
      ],
      automated: true,
      automatedTestName: "exports the configured artifacts",
      browser: true,
      browserTestName: "browser: exports the configured artifacts",
      componentType: "panelActions",
      evidence: "exported-bytes",
      expectedObservable: "Configured export actions create validated artifact bytes.",
      exportArtifactCoverage,
      fixture: "explicit export intent fixture",
      id: "actions.output",
      kind: "control",
      target: "actions.output",
      userAction: "Click each configured export action and inspect its artifact.",
    },
  ];
}

function getExplicitExportErrors({
  intent,
  schema,
}: {
  intent: ToolcraftArtifactExportIntent;
  schema: ReturnType<typeof defineContractSchemaFixture>;
}): string[] {
  return getToolcraftOutputExportErrors({
    acceptance: makeArtifactCoverage({
      image: schemaHasPngExportPanelAction(schema),
      video: schemaHasVideoExportPanelAction(schema),
    }),
    controls: collectToolcraftVisibleAcceptanceControls(schema),
    productReadiness: makeProductReadiness(intent),
    schema,
  });
}

describe("Toolcraft explicit output export intent", () => {
  it("rejects a video action and section when video delivery was not requested", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        video: { mode: "not-requested" },
      },
      schema: makeExportSchema({
        imageAction: true,
        imageSection: true,
        videoAction: true,
        videoSection: true,
      }),
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'Video export intent "not-requested" must not have an export-video panel action.',
        'Video export intent "not-requested" must not have a "Video Export" section.',
      ]),
    );
  });

  it("requires a video action and section when video delivery was explicitly requested", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        video: {
          evidence: "The user explicitly requested MP4 delivery.",
          mode: "user-requested",
        },
      },
      schema: makeExportSchema({ imageAction: true, imageSection: true }),
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'Video export intent "user-requested" requires an export-video panel action.',
        'Video export intent "user-requested" requires a "Video Export" section.',
        'Apps with Export Video must expose video export settings in a separate controls section titled "Video Export" directly above sticky footer export actions.',
        'The separate "Video Export" section must include a format control with target "export.video.format".',
        'The separate "Video Export" section must include a resolution control with target "export.video.resolution".',
      ]),
    );
  });

  it.each([
    {
      expected:
        'Image export intent "user-removed" must not have an export-image panel action.',
      imageAction: true,
      imageSection: false,
      name: "action",
    },
    {
      expected:
        'Image export intent "user-removed" must not have an "Image Export" section.',
      imageAction: false,
      imageSection: true,
      name: "settings section",
    },
  ])("rejects an image $name after explicit image removal", ({
    expected,
    imageAction,
    imageSection,
  }) => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: "The user explicitly requested no image artifact.",
            mode: "user-removed",
          },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema({ imageAction, imageSection }),
      }),
    ).toContain(expected);
  });

  it("requires the default image action when image delivery was not removed", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: { mode: "toolcraft-default" },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema(),
      }),
    ).toContain(
      'Image export intent "toolcraft-default" requires an export-image panel action.',
    );
  });

  it("surfaces blank explicit export evidence through output validation", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: { evidence: " \n\t", mode: "user-removed" },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema(),
      }),
    ).toContain(
      "Image export user-removed intent requires non-empty evidence.",
    );
  });

  it("accepts explicit video-only delivery", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: "The user explicitly requested no image artifact.",
            mode: "user-removed",
          },
          video: {
            evidence: "The user explicitly requested MP4 delivery.",
            mode: "user-requested",
          },
        },
        schema: makeExportSchema({ videoAction: true, videoSection: true }),
      }),
    ).toEqual([]);
  });

  it("accepts an explicitly no-export product without a universal PNG error", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: "The user explicitly requested no downloadable artifacts.",
            mode: "user-removed",
          },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema(),
      }),
    ).toEqual([]);
  });

  it("does not infer video delivery from an enabled playback timeline", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        video: { mode: "not-requested" },
      },
      schema: makeExportSchema({
        imageAction: true,
        imageSection: true,
        timeline: true,
      }),
    });

    expect(errors).toEqual([]);
    expect(errors.join("\n")).not.toContain("Video Export");
    expect(errors.join("\n")).not.toContain("all-required-video-export-behavior");
  });

  it("accepts explicit image and video delivery", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: { mode: "toolcraft-default" },
          video: {
            evidence: "The user explicitly requested video delivery.",
            mode: "user-requested",
          },
        },
        schema: makeExportSchema({
          imageAction: true,
          imageSection: true,
          videoAction: true,
          videoSection: true,
        }),
      }),
    ).toEqual([]);
  });

  it("derives the final export settings index from actions, not stray sections", () => {
    const facts = buildToolcraftOutputExportFacts({
      schema: makeExportSchema({ imageSection: true }),
    });

    expect(facts.hasImageExportAction).toBe(false);
    expect(facts.hasVideoExportAction).toBe(false);
    expect(facts.imageExportSectionIndex).toBeGreaterThanOrEqual(0);
    expect(facts.finalExportSettingsIndex).toBe(-1);
  });
});
