import { describe, expect, it } from "vitest";

import {
  getToolcraftOutputExportErrors,
  schemaHasVideoExportPanelAction,
} from "./acceptance/output-export";
import { defineContractSchemaFixture, validateContractAcceptance } from "./app-acceptance.contract-fixtures";

describe("Toolcraft output export synthetic rules", () => {
  it("requires video proof only when the product explicitly exposes video export", () => {
    const playbackSchema = defineContractSchemaFixture({
      canvas: { enabled: true },
      panels: {
        controls: { sections: [], title: "Controls" },
        timeline: {
          defaultDurationSeconds: 8,
          enabled: true,
          mode: "playback",
        },
      },
    });

    expect(schemaHasVideoExportPanelAction(playbackSchema)).toBe(false);
  });

  it("does not let a video-only schema bypass artifact coverage", () => {
    const videoOnlySchema = defineContractSchemaFixture({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
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
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      getToolcraftOutputExportErrors({
        acceptance: [],
        controls: [],
        productReadiness: {
          mode: "starter",
          reason: "The synthetic starter verifies stray export-action coverage.",
        },
        schema: videoOnlySchema,
      }),
    ).toEqual([
      expect.stringContaining("all-required-video-export-behavior"),
    ]);
  });

  it("rejects reset actions in sticky footer panelActions", () => {
    const schemaWithFooterReset = defineContractSchemaFixture({
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
                      command: "controls.reset",
                      icon: "rotate-ccw",
                      label: "Reset",
                      value: "reset",
                    },
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
        acceptance: [
          {
            actionCoverage: ["reset", "export.png"],
            automated: true,
            automatedTestName: "footer actions reset and export output",
            browser: true,
            browserTestName: "browser: footer actions reset and export output",
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Footer actions reset controls and export output.",
            fixture: "footer actions fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Click Reset and Export PNG.",
          },
        ],
        schema: schemaWithFooterReset,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must not include Reset footer actions (reset)"),
      ]),
    );
  });
});
