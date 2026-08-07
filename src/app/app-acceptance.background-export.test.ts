import { describe, expect, it } from "vitest";

import type { ToolcraftProductReadiness } from "./acceptance/types";
import { defineContractSchemaFixture, validateContractAcceptance } from "./app-acceptance.contract-fixtures";
import {
  makeBackgroundSection,
  makeImageExportSection,
} from "./app-acceptance.export-test-utils";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

const imageExportProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Background image export fixture",
  productSummary: "A static image fixture for background export validation.",
  requestedBehavior: "Export the image with configurable background output.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The fixture renders a static two-dimensional image.",
  },
};

const videoExportProductReadiness: ToolcraftProductReadiness = {
  ...imageExportProductReadiness,
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: {
      evidence: "The background fixture explicitly exercises video background export.",
      mode: "user-requested",
    },
  },
};

describe("Toolcraft background export acceptance contract", () => {
  it("requires png export apps to expose background color and png background toggle controls", () => {
    const schemaWithoutBackgroundControls = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
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
              title: "Output",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithoutBackgroundControls,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports png output",
            browser: true,
            browserTestName: "browser: exports png output",
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Export PNG creates output bytes.",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Click Export PNG.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must expose a user-facing background color control"),
        expect.stringContaining(
          "must expose export.includeBackground in runtime Setup",
        ),
      ]),
    );
  });

  it("rejects legacy output sections that mix background controls with export actions", () => {
    const schemaWithLegacyBackgroundControls = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                background: {
                  defaultValue: "#ffffff",
                  label: "Background",
                  target: "appearance.background",
                  type: "color",
                },
                includeBackground: {
                  defaultValue: true,
                  label: "Include background",
                  target: "export.includeBackground",
                  type: "switch",
                },
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
              title: "Output",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithLegacyBackgroundControls,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports png output",
            browser: true,
            browserTestName: "browser: exports png output",
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Export PNG creates output bytes.",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Click Export PNG.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Runtime Setup must contain export.includeBackground as the Background switch.",
        ),
        expect.stringContaining(
          "Runtime Setup must contain the renderer-owned background color control",
        ),
      ]),
    );
  });

  it("accepts png export apps that wire background controls into the schema", () => {
    const schemaWithBackgroundControls = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [
            makeBackgroundSection(),
            makeImageExportSection(),
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
              title: "Output",
            },
          ],
          title: "Controls",
        },
      },
    });
    const errors = validateContractAcceptance({
      schema: schemaWithBackgroundControls,
      productReadiness: imageExportProductReadiness,
      acceptance: [
        makeControlAcceptance("appearance.background", "color"),
        {
          ...makeControlAcceptance("export.includeBackground", "switch"),
          backgroundOutputCoverage: [
            "preview-hidden-when-excluded",
            "image-transparent-when-excluded",
            "infinity-viewport-color-and-dependency",
          ],
          expectedObservable: "Переключатель изменяет фон предпросмотра и растрового результата.",
          userAction: "Отключить фон и проверить оба результата.",
        },
        {
          actionCoverage: ["export.png"],
          automated: true,
          automatedTestName: "exports png output with current background settings",
          browser: true,
          browserTestName: "browser: exports png output with current background settings",
          componentType: "panelActions",
          evidence: "exported-bytes",
          expectedObservable: "Export PNG creates output bytes and reads background color plus include-background state.",
          fixture: "export fixture",
          id: "actions.output",
          kind: "control",
          target: "actions.output",
          userAction: "Toggle Background, change Color, then click Export PNG.",
        },
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("must expose a user-facing background color control"),
        expect.stringContaining(
          "must expose export.includeBackground in runtime Setup",
        ),
      ]),
    );
  });

  it("requires include-background acceptance to hide preview background and keep video background", () => {
    const schemaWithBackgroundControls = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [
            makeBackgroundSection(),
            makeImageExportSection(),
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
              title: "Output",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithBackgroundControls,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports png output with current background settings",
            browser: true,
            browserTestName: "browser: exports png output with current background settings",
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Export PNG creates output bytes and reads background color plus include-background state.",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Toggle Background, change Color, then click Export PNG.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "controls background inclusion and must declare backgroundOutputCoverage",
        ),
      ]),
    );
  });

  it("requires video background coverage only when video export is present", () => {
    const schemaWithVideoExport = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [
            makeBackgroundSection(),
            makeImageExportSection(),
            {
              controls: {
                outputActions: {
                  actions: [
                    {
                      label: "Export PNG",
                      role: "export-image",
                      value: "export.png",
                    },
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

    expect(
      validateContractAcceptance({
        schema: schemaWithVideoExport,
        productReadiness: videoExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          {
            ...makeControlAcceptance("export.includeBackground", "switch"),
            backgroundOutputCoverage: [
              "preview-hidden-when-excluded",
              "image-transparent-when-excluded",
            ],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("video-background-preserved"),
      ]),
    );
  });
});
