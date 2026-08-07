import { expect, test } from "@playwright/test";
import { defineToolcraft } from "@/toolcraft/runtime";

import { appAcceptance } from "../src/app/app-acceptance";
import {
  deriveToolcraftBrowserRuntimeRequirements,
  deriveToolcraftPerformancePathRuntimeRequirements,
} from "./browser-runtime-evidence-requirements";

test("runtime evidence requirements are derived from browser acceptance IDs", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements(appAcceptance);

  for (const entry of appAcceptance.filter((item) => item.browser)) {
    expect(
      requirements.some(
        (requirement) =>
          requirement.requirementId === entry.id &&
          requirement.testName === entry.browserTestName,
      ),
      `Browser acceptance row "${entry.id}" should derive runtime evidence.`,
    ).toBe(true);
  }
});

test("derived paths own one canonical browser evidence requirement set", () => {
  const [path] = [
    {
      id: "performance-path:export",
      interaction: "export",
      invalidates: ["export-pass"],
      profile: "batch-responsive",
      runsOn: ["export-only"],
      targets: ["actions.output", "export.resolution"],
      workloadDimensions: ["export-width-px"],
    },
  ] as const;

  const requirements = deriveToolcraftPerformancePathRuntimeRequirements(
    [path],
    defineToolcraft({ canvas: { enabled: true }, panels: {} }),
  );

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "performance-measurement",
    "performance-budget",
    "performance-compiled-fixture",
    "performance-output-completion",
  ]);
  expect(new Set(requirements.map(({ requirementId }) => requirementId))).toEqual(
    new Set([path.id]),
  );
  expect(new Set(requirements.map(({ testName }) => testName))).toEqual(
    new Set([`browser perf: toolcraft path ${path.id}`]),
  );
  expect(requirements.every(({ target }) => target === undefined)).toBe(true);
});

test("control schema derives segmented and discrete runtime evidence", () => {
  const acceptance = [
    {
      browser: true,
      browserTestName: "browser: mode layout",
      evidence: "product-output",
      id: "mode.layout",
      target: "mode.value",
    },
    {
      browser: true,
      browserTestName: "browser: density layout",
      evidence: "product-output",
      id: "density.layout",
      target: "density.value",
    },
  ];
  const schema = {
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              density: {
                defaultValue: 2,
                label: "Density",
                max: 4,
                min: 1,
                step: 1,
                target: "density.value",
                type: "slider",
                variant: "discrete",
              },
              mode: {
                defaultValue: "one",
                label: "Mode",
                options: [
                  { label: "One", value: "one" },
                  { label: "Two", value: "two" },
                ],
                target: "mode.value",
                type: "segmented",
              },
            },
            title: "Behavior",
          },
        ],
        title: "Controls",
      },
    },
  } as const;

  expect(
    deriveToolcraftBrowserRuntimeRequirements(
      acceptance,
      defineToolcraft(schema),
    ).map(({ evidenceType, requirementId, target }) => ({
      evidenceType,
      requirementId,
      target,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        evidenceType: "segmented-control-layout",
        requirementId: "mode.layout",
        target: "mode.value",
      },
      {
        evidenceType: "discrete-slider-layout",
        requirementId: "density.layout",
        target: "density.value",
      },
    ]),
  );
});

test("typed background coverage derives dedicated semantic evidence", () => {
  const schema = defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              includeBackground: {
                defaultValue: true,
                label: "Include",
                target: "export.includeBackground",
                type: "switch",
              },
              outputActions: {
                actions: [
                  {
                    label: "Export Video",
                    role: "export-video",
                    value: "export.video",
                  },
                ],
                target: "actions.output",
                type: "panelActions",
              },
            },
            title: "Output",
          },
        ],
        title: "Controls",
      },
    },
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        backgroundOutputCoverage: [
          "preview-hidden-when-excluded",
          "image-transparent-when-excluded",
          "infinity-viewport-color-and-dependency",
          "video-background-preserved",
        ],
        browser: true,
        browserTestName: "browser: background output",
        evidence: "rendered-pixels",
        id: "export.includeBackground",
        target: "export.includeBackground",
      },
    ],
    schema,
  );
  expect(
    requirements
      .filter((requirement) => requirement.requirementId === "export.includeBackground")
      .map((requirement) => requirement.evidenceType),
  ).toEqual(
    expect.arrayContaining([
      "background-image-transparency",
      "background-infinity-viewport",
      "background-preview-exclusion",
      "background-video-preserved",
    ]),
  );
});

test("typed Infinity canvas coverage derives dedicated semantic evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    {
      browser: true,
      browserTestName: "browser: Infinity canvas mode",
      evidence: "viewport-side-effect",
      id: "canvas.infinity.mode",
      infinityCanvasCoverage: "mode-and-restoration",
      target: "canvas.infinity",
    },
    {
      browser: true,
      browserTestName: "browser: Infinity canvas image export",
      evidence: "exported-bytes",
      id: "canvas.infinity.imageExport",
      infinityCanvasCoverage: "scene-bounds-image-export",
      target: "actions.output",
    },
  ]);

  expect(
    requirements.map(({ evidenceType, requirementId }) => ({
      evidenceType,
      requirementId,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        evidenceType: "infinity-mode-restoration",
        requirementId: "canvas.infinity.mode",
      },
      {
        evidenceType: "infinity-scene-bounds-image-export",
        requirementId: "canvas.infinity.imageExport",
      },
    ]),
  );
});

test("all-required background coverage derives video evidence only for video products", () => {
  const makeSchema = (withVideo: boolean) =>
    defineToolcraft({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                includeBackground: {
                  defaultValue: true,
                  label: "Include",
                  target: "export.includeBackground",
                  type: "switch",
                },
                outputActions: {
                  actions: [
                    { label: "Export PNG", role: "export-image", value: "export.png" },
                    ...(withVideo
                      ? [
                          {
                            label: "Export Video",
                            role: "export-video" as const,
                            value: "export.video",
                          },
                        ]
                      : []),
                  ],
                  target: "actions.output",
                  type: "panelActions",
                },
              },
              title: "Output",
            },
          ],
          title: "Controls",
        },
      },
    });
  const acceptance = [
    {
      backgroundOutputCoverage: "all-required-background-output" as const,
      browser: true,
      browserTestName: "browser: background output",
      evidence: "rendered-pixels" as const,
      id: "export.includeBackground",
      target: "export.includeBackground",
    },
  ];

  const imageEvidence = deriveToolcraftBrowserRuntimeRequirements(
    acceptance,
    makeSchema(false),
  ).map((requirement) => requirement.evidenceType);
  const videoEvidence = deriveToolcraftBrowserRuntimeRequirements(
    acceptance,
    makeSchema(true),
  ).map((requirement) => requirement.evidenceType);

  expect(imageEvidence).not.toContain("background-video-preserved");
  expect(videoEvidence).toContain("background-video-preserved");
});

test("orientation gizmo coverage derives behavior-specific runtime evidence", () => {
  const schema = defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              orientation: {
                defaultValue: {
                  position: [0, 0, 5],
                  up: [0, 1, 0],
                },
                keyframeable: false,
                label: false,
                target: "view.orbit",
                type: "orientationGizmo",
              },
              scale: {
                defaultValue: 1,
                label: "Scale",
                target: "model.scale",
                type: "slider",
              },
            },
            title: "Model",
          },
        ],
        title: "Controls",
      },
    },
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        browser: true,
        browserTestName: "browser: orientation behavior",
        canvasHandle: {
          exportCleanTestName: "browser: orientation export clean",
          outputObservable: "The rendered model follows the pose.",
          testId: "toolcraft-orientation-gizmo",
          writesTarget: "view.orbit",
        },
        evidence: "product-output",
        id: "model.orientation",
        orientationGizmoCoverage:
          "all-required-orientation-gizmo-behavior",
      },
    ],
    schema,
  );
  const orientationRequirements = requirements
    .filter(({ evidenceType }) => evidenceType.startsWith("orientation-"))
    .map(({ evidenceType, requirementId, target, testName }) => ({
      evidenceType,
      requirementId,
      target,
      testName,
    }));

  expect(orientationRequirements).toEqual([
    {
      evidenceType: "orientation-axis-drag",
      requirementId: "model.orientation#axis-drag",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-axis-snap",
      requirementId: "model.orientation#axis-snap",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-canvas-miss-pan",
      requirementId: "model.orientation#canvas-miss-pan",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-model-drag",
      requirementId: "model.orientation#model-drag",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-shared-pose-output",
      requirementId: "model.orientation#shared-pose-output",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-undo-reset",
      requirementId: "model.orientation#undo-reset",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
  ]);
  expect(requirements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evidenceType: "canvas-export-clean",
        requirementId: "model.orientation#export-clean",
        target: "view.orbit",
        testName: "browser: orientation export clean",
      }),
    ]),
  );
  expect(requirements.map(({ evidenceType }) => evidenceType)).not.toContain(
    "canvas-handle-interaction",
  );
});
