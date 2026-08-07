import { describe, expect, it } from "vitest";

import {
  contractAcceptanceFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";
import type { ToolcraftProductReadiness } from "./acceptance/types";

const infinityProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Infinity contract fixture",
  productSummary: "An editable product scene with bounded export output.",
  requestedBehavior: "Switch between finite and infinite canvas output.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The fixture is a two-dimensional scene without a camera.",
  },
};

const infinityVideoProductReadiness: ToolcraftProductReadiness = {
  ...infinityProductReadiness,
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: {
      evidence: "The Infinity canvas fixture explicitly exercises video export bounds.",
      mode: "user-requested",
    },
  },
};

function createFixedOutputSchema({
  height = 1080,
  width = 1920,
}: {
  height?: number;
  width?: number;
} = {}) {
  return defineContractSchemaFixture({
    canvas: {
      enabled: true,
      size: { height, unit: "px", width },
      sizing: { mode: "fixed-output" },
    },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              prompt: {
                defaultValue: "Describe the effect",
                label: "Prompt",
                orderRole: "input",
                target: "generation.prompt",
                textValueKind: "single-line",
                type: "text",
              },
            },
            title: "Generation",
          },
        ],
        title: "Controls",
      },
    },
  });
}

function createIntrinsicMediaUploadSchema() {
  return defineContractSchemaFixture({
    canvas: {
      enabled: true,
      sizing: { mode: "intrinsic-media" },
      upload: true,
    },
    panels: {
      controls: {
        sections: [],
        title: "Controls",
      },
    },
  });
}

function createEditableOutputSchema(
  exportRole?: "export-image" | "export-video",
) {
  return defineContractSchemaFixture({
    canvas: {
      enabled: true,
      size: { height: 1080, unit: "px", width: 1920 },
      sizing: { mode: "editable-output" },
    },
    panels: {
      controls: {
        sections: exportRole
          ? [
              {
                controls: {
                  outputActions: {
                    actions: [
                      {
                        label: exportRole === "export-image" ? "Export PNG" : "Export Video",
                        role: exportRole,
                        value: exportRole === "export-image" ? "export.png" : "export.video",
                      },
                    ],
                    target: "actions.output",
                    type: "panelActions",
                  },
                },
              },
            ]
          : [],
        title: "Controls",
      },
    },
  });
}

function makeInfinityCanvasAcceptance(
  coverage:
    | "mode-and-restoration"
    | "scene-bounds-image-export"
    | "scene-bounds-video-export",
) {
  return {
    automated: true,
    automatedTestName: `proves ${coverage}`,
    browser: true,
    browserTestName: `browser: proves ${coverage}`,
    componentType: "canvas",
    evidence:
      coverage === "mode-and-restoration"
        ? ("viewport-side-effect" as const)
        : ("exported-bytes" as const),
    expectedObservable: `Infinity canvas ${coverage} is observable in the running product.`,
    fixture: "infinite canvas scene fixture",
    id: `canvas.infinity.${coverage}`,
    infinityCanvasCoverage: coverage,
    kind: "runtime" as const,
    userAction: "Toggle Infinity canvas and inspect preview and export output.",
  };
}

describe("Toolcraft canvas sizing acceptance coverage", () => {
  it("requires mode and finite-size restoration coverage for editable output", () => {
    expect(
      validateContractAcceptance({
        schema: createEditableOutputSchema(),
        acceptance: contractAcceptanceFixture,
        productReadiness: infinityProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'canvas.sizing mode "editable-output" requires a runtime acceptance entry with infinityCanvasCoverage "mode-and-restoration" proving Infinity canvas hides finite size controls, removes artboard clipping, and restores the dormant finite size when disabled.',
      ]),
    );
  });

  it("requires tight scene-bounds coverage for infinite image export", () => {
    expect(
      validateContractAcceptance({
        schema: createEditableOutputSchema("export-image"),
        acceptance: [makeInfinityCanvasAcceptance("mode-and-restoration")],
        productReadiness: infinityProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Export PNG with editable-output canvas requires a runtime acceptance entry with infinityCanvasCoverage "scene-bounds-image-export" proving infinite export crops to the union of visible scene elements through ToolcraftAppComposition.sceneBoundsProvider.',
      ]),
    );
  });

  it("requires a time-range scene envelope for infinite video export", () => {
    expect(
      validateContractAcceptance({
        schema: createEditableOutputSchema("export-video"),
        acceptance: [makeInfinityCanvasAcceptance("mode-and-restoration")],
        productReadiness: infinityVideoProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Export Video with editable-output canvas requires a runtime acceptance entry with infinityCanvasCoverage "scene-bounds-video-export" proving infinite export uses one scene-bounds time-range envelope for every rendered frame.',
      ]),
    );
  });

  it("accepts complete typed Infinity canvas coverage", () => {
    const errors = validateContractAcceptance({
      schema: createEditableOutputSchema("export-image"),
      acceptance: [
        makeInfinityCanvasAcceptance("mode-and-restoration"),
        makeInfinityCanvasAcceptance("scene-bounds-image-export"),
      ],
      productReadiness: infinityProductReadiness,
    });

    expect(errors.filter((error) => error.includes("infinityCanvasCoverage"))).toEqual([]);
  });

  it("requires explicit runtime acceptance before locking canvas output size", () => {
    expect(
      validateContractAcceptance({
        schema: createFixedOutputSchema(),
        acceptance: contractAcceptanceFixture,
      }),
    ).toEqual(
      expect.arrayContaining([
        'canvas.sizing mode "fixed-output" requires a runtime acceptance entry with canvasSizingCoverage "fixed-output-size" explaining why width and height are intentionally non-editable. Product/output apps must use "editable-output"; user-provided, reference, fixed-format, or base/default sizes belong in canvas.size as editable initial values.',
      ]),
    );
  });

  it("accepts typed fixed-output coverage without parsing explanatory prose", () => {
    expect(
      validateContractAcceptance({
        schema: createFixedOutputSchema(),
        acceptance: [
          ...contractAcceptanceFixture,
          makeControlAcceptance("generation.prompt", "text"),
          {
            automated: true,
            automatedTestName: "fixed canvas dimensions remain stable",
            browser: true,
            browserTestName: "browser: canvas starts at 1920 by 1080",
            canvasSizingCoverage: "fixed-output-size",
            componentType: "canvas",
            evidence: "product-output",
            expectedObservable: "Las dimensiones permanecen estables.",
            fixture: "canvas default size fixture",
            id: "canvas.sizing",
            kind: "runtime",
            userAction: "Abrir la herramienta interna.",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects fixed canvas sizing for exportable product apps even when reference dimensions are fixed", () => {
    const fixedExportSchema = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        size: { height: 900, unit: "px", width: 1440 },
        sizing: { mode: "fixed-output" },
      },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                outputActions: {
                  actions: [
                    {
                      icon: "upload-simple",
                      label: "Export PNG",
                      role: "export-image",
                      value: "export.png",
                    },
                  ],
                  target: "actions.output",
                  type: "panelActions",
                },
              },
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      validateContractAcceptance({
        schema: fixedExportSchema,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "fixed reference size is preserved",
            browser: true,
            browserTestName: "browser: fixed reference size is preserved",
            canvasSizingCoverage: "fixed-output-size",
            componentType: "fixed-output canvas",
            evidence: "product-output",
            expectedObservable: "The exported shader canvas remains reference-defined and fixed at 1440x900.",
            fixture: "shader reference fixture",
            id: "canvas.sizing",
            kind: "runtime",
            userAction: "Open the app.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Product/output apps with export actions must use canvas.sizing mode "editable-output" so Aspect ratio, Canvas width, and Canvas height are always available. Put reference, fixed-format, or user-requested dimensions in canvas.size as the initial value instead of hiding size controls with "fixed-output".',
      ]),
    );
  });

  it("requires intrinsic media sizing acceptance for upload apps that let media own canvas size", () => {
    expect(
      validateContractAcceptance({
        schema: createIntrinsicMediaUploadSchema(),
        acceptance: contractAcceptanceFixture,
      }),
    ).toEqual(
      expect.arrayContaining([
        'canvas.sizing mode "intrinsic-media" with upload requires a runtime acceptance entry with canvasSizingCoverage "intrinsic-media-size" proving the app is a true media-viewer/source-native product where imported media natural dimensions intentionally own canvas.size. Uploaded background/source images inside product canvases must use "editable-output" and keep the current canvas size.',
      ]),
    );
  });

  it("accepts explicit intrinsic media sizing when browser coverage proves source-native canvas sizing", () => {
    expect(
      validateContractAcceptance({
        schema: createIntrinsicMediaUploadSchema(),
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "media viewer uses uploaded natural dimensions",
            browser: true,
            browserTestName: "browser: upload source-native image updates canvas.size",
            canvasSizingCoverage: "intrinsic-media-size",
            componentType: "canvas",
            evidence: "media-lifecycle",
            expectedObservable: "Uploading a 1400x900 image intentionally changes canvas.size to the image natural dimensions.",
            fixture: "source-native media viewer fixture",
            id: "canvas.intrinsicSizing",
            kind: "runtime",
            userAction: "Upload an image with known natural dimensions.",
          },
        ],
      }),
    ).toEqual([]);
  });
});
