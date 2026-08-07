import { describe, expect, it } from "vitest";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftLayerCoverage,
  ToolcraftMediaLifecycleCoverage,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import { validateContractAcceptance } from "./app-acceptance.contract-fixtures";
import {
  createFileDropAcceptance,
  createModelFileDropSchema,
  createMultipleFileDropSchema,
  createSingleFileDropSchema,
} from "./app-acceptance.media-upload.fixtures";

const layeredMediaProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "Canvas media-management handles would duplicate the runtime Layers panel.",
        surface: "canvas",
      },
      capability: "structured-selection",
      evidence: {
        detail:
          "The product requires runtime Layers to own image selection and ordering.",
        source: "user-request",
      },
      id: "layers-media-management",
      reason:
        "Layers is the single surface for image selection, ordering, and transforms.",
      surface: "panel",
      target: "media.sources",
    },
  ],
  mode: "product",
  productName: "Layered media fixture",
  productSummary:
    "A layered image fixture that separates source admission from media management.",
  requestedBehavior:
    "Upload images through fileDrop and manage their order and transforms through Layers.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The layered image fixture has no editable three-dimensional scene.",
  },
};

function createLayerAcceptance({
  id,
  interactionId,
  layerCoverage,
  mediaLifecycleCoverage,
  target,
}: {
  id: string;
  interactionId?: string;
  layerCoverage: ToolcraftLayerCoverage;
  mediaLifecycleCoverage?: readonly ToolcraftMediaLifecycleCoverage[];
  target: string;
}): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} changes layered media output`,
    browser: true,
    browserTestName: `browser: ${id} changes layered media output`,
    componentType:
      layerCoverage === "selected-layer-controls"
        ? "selected-layer-actions"
        : "layers-panel",
    evidence:
      layerCoverage === "selected-layer-controls"
        ? "media-lifecycle"
        : "product-output",
    expectedObservable: `${id} changes the selected layered media output.`,
    fixture: "layered media fixture",
    id,
    interactionId,
    kind: "runtime",
    layerCoverage,
    mediaLifecycleCoverage,
    target,
    userAction: `Exercise ${id} through the runtime Layers panel.`,
  };
}

function createLayeredMediaAcceptance({
  includeSelectedTransforms = true,
}: {
  includeSelectedTransforms?: boolean;
} = {}): readonly ToolcraftComponentAcceptance[] {
  return [
    createFileDropAcceptance({
      automatedTestName: "source images upload remove and reset",
      browserTestName: "browser: source images upload remove and reset",
      expectedObservable:
        "Upload adds source images while remove and Reset clear source media.",
      fixture: "source images fixture",
      id: "media.sources",
      mediaLifecycleCoverage: ["upload", "remove", "reset"],
      target: "media.sources",
      userAction: "Upload source images, remove one, then use Reset controls.",
    }),
    createLayerAcceptance({
      id: "layers.selection",
      interactionId: "layers-media-management",
      layerCoverage: "selection",
      target: "media.sources",
    }),
    createLayerAcceptance({
      id: "layers.visibility",
      layerCoverage: "visibility",
      target: "layers.visibility",
    }),
    createLayerAcceptance({
      id: "layers.reorder",
      layerCoverage: "reorder",
      target: "layers.order",
    }),
    createLayerAcceptance({
      id: "layers.grouping",
      layerCoverage: "grouping",
      target: "layers.groups",
    }),
    ...(includeSelectedTransforms
      ? [
          createLayerAcceptance({
            id: "layers.selected-transform",
            layerCoverage: "selected-layer-controls",
            mediaLifecycleCoverage: [
              "rotate",
              "flip",
              "transform-output",
            ],
            target: "selectedLayer.transform",
          }),
        ]
      : []),
  ];
}

describe("Toolcraft media upload acceptance coverage", () => {
  it("requires fileDrop acceptance without Layers to prove upload, clear, reset, and image transforms", () => {
    const fileDropSchema = createSingleFileDropSchema();

    expect(
      validateContractAcceptance({
        schema: fileDropSchema,
        acceptance: [
          createFileDropAcceptance({
            automatedTestName: "source image upload and clear update media",
            browserTestName: "browser: source image upload and clear update media",
            expectedObservable: "Uploading a source image changes the media preview and Clear removes it.",
            fixture: "source image fixture",
            mediaLifecycleCoverage: ["upload", "remove"],
            userAction: "Upload a source image, then clear the preview.",
          }),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Source / source (media.source) fileDrop acceptance must prove upload/import, clear/remove, and section or global reset restore default source media or remove uploaded source media when no default exists.",
        "Source / source (media.source) image fileDrop acceptance must prove rotate and flip actions update runtime media transform metadata and that preview, renderer, or export consumes the transform.",
      ]),
    );
  });

  it("requires predefined fileDrop media acceptance to prove attached default restore", () => {
    const fileDropSchema = createSingleFileDropSchema({ withDefaultAsset: true });

    expect(
      validateContractAcceptance({
        schema: fileDropSchema,
        acceptance: [
          createFileDropAcceptance({
            automatedTestName: "source image upload reset lifecycle",
            browserTestName: "browser: source image upload reset lifecycle",
            expectedObservable: "Upload, clear, reset, rotate, and flip update the source preview and renderer.",
            fixture: "source image fixture",
            mediaLifecycleCoverage: [
              "upload",
              "remove",
              "reset",
              "rotate",
              "flip",
              "transform-output",
            ],
            userAction: "Upload a source image, clear it, use Reset controls, rotate 90°, flip horizontal, and verify runtime media transform metadata is consumed by preview.",
          }),
        ],
      }),
    ).toContain(
      "Source / source (media.source) fileDrop acceptance must prove predefined media.defaultAssets render as attached files, can be removed to an empty source/canvas state, and are restored by section or global Reset.",
    );
  });

  it("accepts fileDrop lifecycle coverage that includes reset and image transforms", () => {
    const fileDropSchema = createSingleFileDropSchema();

    const errors = validateContractAcceptance({
      schema: fileDropSchema,
      acceptance: [
        createFileDropAcceptance({
          automatedTestName: "source image upload clear and reset update media",
          browserTestName: "browser: source image upload clear and reset update media",
          expectedObservable: "El resultado visual refleja el ciclo de medios completo.",
          fixture: "source image fixture",
          mediaLifecycleCoverage: [
            "upload",
            "remove",
            "reset",
            "rotate",
            "flip",
            "transform-output",
          ],
          userAction: "Ejecutar el flujo completo del medio.",
        }),
      ],
    });

    expect(
      errors.filter((error) => error.includes("fileDrop acceptance")),
    ).toEqual([]);
  });

  it("requires multiple fileDrop acceptance without Layers to prove runtime media reorder", () => {
    const fileDropSchema = createMultipleFileDropSchema();

    expect(
      validateContractAcceptance({
        schema: fileDropSchema,
        acceptance: [
          createFileDropAcceptance({
            automatedTestName: "source images upload clear reset and transform",
            browserTestName: "browser: source images upload clear reset and transform",
            expectedObservable: "Uploading source images changes the media preview; rotate and flip actions update runtime media transform metadata and rendered output; Clear and Reset controls remove media.",
            fixture: "source images fixture",
            id: "media.sources",
            mediaLifecycleCoverage: [
              "upload",
              "remove",
              "reset",
              "rotate",
              "flip",
              "transform-output",
            ],
            target: "media.sources",
            userAction: "Upload two source images, rotate one, flip it, clear the images, and use Reset controls.",
          }),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Source / sources (media.sources) multiple fileDrop acceptance must prove thumbnail/file reorder updates runtime media order and that preview, renderer, or export consumes that order.",
      ]),
    );

    expect(
      validateContractAcceptance({
        schema: fileDropSchema,
        acceptance: [
          createFileDropAcceptance({
            automatedTestName: "source images upload reorder transform and reset",
            browserTestName: "browser: source images upload reorder transform and reset",
            expectedObservable: "Uploading source images changes the preview; drag reorder updates runtime media order used by rendered output; rotate and flip update runtime media transform metadata used by export; Clear, section reset, and global Reset controls remove media.",
            fixture: "source images fixture",
            id: "media.sources",
            mediaLifecycleCoverage: [
              "upload",
              "remove",
              "reset",
              "rotate",
              "flip",
              "transform-output",
              "reorder",
              "order-output",
            ],
            target: "media.sources",
            userAction: "Upload two source images, drag to reorder thumbnails, rotate and flip the selected image, clear them, then use section reset and Reset controls.",
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("does not require reorder coverage from collection-actions upload slots", () => {
    const schema = createMultipleFileDropSchema({ collectionActions: true });

    const errors = validateContractAcceptance({
      schema,
      acceptance: [
        createFileDropAcceptance({
          automatedTestName: "source files add and remove slots",
          browserTestName: "browser: source files add and remove slots",
          expectedObservable:
            "Compact plus adds an empty upload slot and compact minus removes the final slot or attached file.",
          fixture: "source file fixture",
          id: "media.sources",
          mediaLifecycleCoverage: ["upload", "remove", "reset"],
          target: "media.sources",
          userAction:
            "Add an upload slot, attach a file, remove the final slot, and reset.",
        }),
      ],
    });

    expect(errors.filter((error) => error.includes("reorder"))).toEqual([]);
  });

  it("assigns reorder and selected image transform proof to Layers without duplicating fileDrop claims", () => {
    const fileDropSchema = createMultipleFileDropSchema();
    const layeredSchema = {
      ...fileDropSchema,
      panels: {
        ...fileDropSchema.panels,
        layers: true,
      },
    };

    const errors = validateContractAcceptance({
      acceptance: createLayeredMediaAcceptance(),
      productReadiness: layeredMediaProductReadiness,
      schema: layeredSchema,
    });

    expect(
      errors.filter((error) => error.includes("fileDrop acceptance")),
    ).toEqual([]);
  });

  it("requires the fixed selected-layer recipe when Layers owns image transforms", () => {
    const fileDropSchema = createMultipleFileDropSchema();
    const layeredSchema = {
      ...fileDropSchema,
      panels: {
        ...fileDropSchema.panels,
        layers: true,
      },
    };

    expect(
      validateContractAcceptance({
        acceptance: createLayeredMediaAcceptance({
          includeSelectedTransforms: false,
        }),
        productReadiness: layeredMediaProductReadiness,
        schema: layeredSchema,
      }),
    ).toContain(
      'Source / sources (media.sources) Layers-owned image transforms require a runtime acceptance entry with layerCoverage "selected-layer-controls" and mediaLifecycleCoverage for rotate, flip, and transform-output.',
    );
  });

  it("requires model fileDrop acceptance to prove the complete model lifecycle instead of image transforms", () => {
    const schema = createModelFileDropSchema();

    const errors = validateContractAcceptance({
      schema,
      acceptance: [
        createFileDropAcceptance({
          automatedTestName: "model import lifecycle",
          browserTestName: "browser: model import lifecycle",
          expectedObservable: "The imported model is analyzed and rendered.",
          fixture: "model fixtures",
          id: "media.model",
          mediaLifecycleCoverage: ["upload", "remove", "reset"],
          target: "media.model",
          userAction: "Import, inspect, repair, render, export, reload, remove, undo, and reset a model.",
        }),
      ],
    });

    expect(errors).toContain(
      "Model / model (media.model) model fileDrop acceptance must declare modelImportCoverage for: advertised-format-import, staged-preview, clean-commit, package-extraction, deterministic-root-selection, appearance-preservation, fallback-appearance, presentation-consumer-readiness, pixel-output, repairable-diagnosis, repair-action, repair-progress, verified-repair, fatal-rejection, persistence-restore, resource-unavailable, preview-output, export-output, history-reset.",
    );
    expect(errors.some((error) => error.includes("image fileDrop"))).toBe(false);
  });

  it("accepts complete model import lifecycle coverage", () => {
    const errors = validateContractAcceptance({
      schema: createModelFileDropSchema(),
      acceptance: [
        createFileDropAcceptance({
          automatedTestName: "model import lifecycle",
          browserTestName: "browser: model import lifecycle",
          expectedObservable: "Every advertised geometry format follows the same analyzed model lifecycle and rendered output.",
          fixture: "clean repairable fatal and persisted model fixtures",
          id: "media.model",
          mediaLifecycleCoverage: ["upload", "remove", "reset"],
          modelImportCoverage: "all-required-model-import-behavior",
          target: "media.model",
          userAction: "Import each advertised format, repair a repairable model, reject a fatal model, export, reload, remove, undo, and reset.",
        }),
      ],
    });

    expect(errors.filter((error) => error.includes("fileDrop acceptance"))).toEqual([]);
  });
});
