import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftExportArtifactCoverageErrors } from "./acceptance/export-artifact-coverage";
import type { ToolcraftComponentAcceptance } from "./acceptance/types";

function createSchema(roles: readonly ("export-image" | "export-video")[]) {
  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              output: {
                actions: roles.map((role) => ({
                  label: role === "export-image" ? "Export Image" : "Export Video",
                  role,
                  value: role === "export-image" ? "export.image" : "export.video",
                })),
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
}

function createAcceptance(
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    actionCoverage: ["export.image"],
    automated: true,
    automatedTestName: "exports image",
    browser: true,
    browserTestName: "browser: exports image",
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable: "Downloads decoded image output.",
    fixture: "image export fixture",
    id: "actions.output",
    kind: "control",
    target: "actions.output",
    userAction: "Click Export Image.",
    ...overrides,
  };
}

describe("Toolcraft export artifact acceptance", () => {
  it("requires exact image coverage for an image action", () => {
    const schema = createSchema(["export-image"]);

    expect(
      getToolcraftExportArtifactCoverageErrors({
        acceptance: [createAcceptance()],
        schema,
      }),
    ).toContainEqual(
      expect.stringContaining("all-required-image-export-behavior"),
    );
    expect(
      getToolcraftExportArtifactCoverageErrors({
        acceptance: [
          createAcceptance({
            exportArtifactCoverage: "all-required-image-export-behavior",
          }),
        ],
        schema,
      }),
    ).toEqual([]);
  });

  it("does not allow image coverage to satisfy video", () => {
    const errors = getToolcraftExportArtifactCoverageErrors({
      acceptance: [
        createAcceptance({
          actionCoverage: ["export.video"],
          exportArtifactCoverage: "all-required-image-export-behavior",
        }),
      ],
      schema: createSchema(["export-video"]),
    });

    expect(errors).toEqual([
      expect.stringContaining("without a matching typed export action"),
      expect.stringContaining("all-required-video-export-behavior"),
    ]);
  });

  it("requires exported bytes plus automated browser proof", () => {
    const errors = getToolcraftExportArtifactCoverageErrors({
      acceptance: [
        createAcceptance({
          automated: false,
          browser: false,
          evidence: "command-side-effect",
          exportArtifactCoverage: "all-required-image-export-behavior",
        }),
      ],
      schema: createSchema(["export-image"]),
    });

    expect(errors).toEqual([
      expect.stringContaining('evidence is not "exported-bytes"'),
      expect.stringContaining("requires automated and browser proof"),
      expect.stringContaining("all-required-image-export-behavior"),
    ]);
  });

  it("allows one row to cover both typed actions explicitly", () => {
    expect(
      getToolcraftExportArtifactCoverageErrors({
        acceptance: [
          createAcceptance({
            actionCoverage: ["export.image", "export.video"],
            exportArtifactCoverage: [
              "all-required-image-export-behavior",
              "all-required-video-export-behavior",
            ],
          }),
        ],
        schema: createSchema(["export-image", "export-video"]),
      }),
    ).toEqual([]);
  });
});
