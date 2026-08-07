import { expect, test } from "@playwright/test";
import { defineToolcraft } from "@/toolcraft/runtime";

import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

test("model import coverage derives lifecycle-specific runtime evidence", () => {
  const schema = defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              model: {
                assetKind: "model",
                defaultValue: null,
                label: "Model",
                target: "media.model",
                type: "fileDrop",
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
        browserTestName: "browser: complete model import lifecycle",
        evidence: "media-lifecycle",
        id: "media.model",
        modelImportCoverage: "all-required-model-import-behavior",
        target: "media.model",
      },
    ],
    schema,
  ).filter(({ requirementId }) => requirementId.startsWith("media.model#"));

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "model-advertised-format-import",
    "model-staged-preview",
    "model-clean-commit",
    "model-package-extraction",
    "model-deterministic-root-selection",
    "model-appearance-preservation",
    "model-fallback-appearance",
    "model-presentation-consumer-readiness",
    "model-pixel-output",
    "model-repairable-diagnosis",
    "model-repair-action",
    "model-repair-progress",
    "model-verified-repair",
    "model-fatal-rejection",
    "model-persistence-restore",
    "model-resource-unavailable",
    "model-preview-output",
    "model-export-output",
    "model-history-reset",
  ]);
  expect(new Set(requirements.map(({ target }) => target))).toEqual(
    new Set(["media.model"]),
  );
  expect(new Set(requirements.map(({ testName }) => testName))).toEqual(
    new Set(["browser: complete model import lifecycle"]),
  );
});
