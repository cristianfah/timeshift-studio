import { expect, test } from "@playwright/test";

import {
  parseToolcraftBrowserPerformanceEvidence,
  type ToolcraftPerformancePipelineEvidence,
} from "../src/app/test-evidence/browser-performance-contract";
import {
  activePipelinePath,
  initialPipelinePath,
  installPipelineEvidenceBridge,
  navigateToFreshInitialPipelineBridge,
  pipelineEvidencePerformance,
} from "./performance-pipeline-evidence-test-fixtures";
import { expectToolcraftPipelineInvariant } from "./performance-pipeline-evidence";

function attachedPipelineEvidence(
  attachments: Parameters<typeof parseToolcraftBrowserPerformanceEvidence>[0][],
): ToolcraftPerformancePipelineEvidence[] {
  return attachments.map((attachment) => {
    const evidence = parseToolcraftBrowserPerformanceEvidence(attachment);
    expect(evidence).toBeDefined();
    return evidence!;
  });
}

test("helper observes phase-aware actions and attaches only the evaluated set", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;
  const invokedPhases: string[] = [];

  await expectToolcraftPipelineInvariant(
    page,
    pipelineEvidencePerformance,
    activePipelinePath.id,
    async (phase) => {
      invokedPhases.push(phase);
      await page.evaluate(() => {
        const state = Reflect.get(
          globalThis,
          "__toolcraftPipelineEvidenceTestState",
        ) as {
          snapshot: {
            passes: {
              composite: {
                cacheMisses: number;
                durationMax: number;
                durationTotal: number;
                executions: number;
              };
            };
          };
        };
        const counters = state.snapshot.passes.composite;
        counters.cacheMisses += 1;
        counters.durationMax = 1;
        counters.durationTotal += 1;
        counters.executions += 1;
      });
    },
  );

  expect(invokedPhases).toEqual(["cold", "warm", "sustained"]);
  const evidence = attachedPipelineEvidence(
    testInfo.attachments.slice(attachmentCountBefore),
  );
  expect(evidence.map(({ phase }) => phase)).toEqual([
    "cold",
    "warm",
    "sustained",
  ]);
  expect(
    evidence.map(({ before, after }) => {
      const beforePass = before.passes.find(
        ({ passId }) => passId === "composite",
      )!;
      const afterPass = after.passes.find(
        ({ passId }) => passId === "composite",
      )!;
      return [beforePass.executions, afterPass.executions];
    }),
  ).toEqual([
    [0, 1],
    [1, 2],
    [2, 3],
  ]);
});

test("failed action or invariant leaves testInfo.attachments unchanged", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;

  await expect(
    expectToolcraftPipelineInvariant(
      page,
      pipelineEvidencePerformance,
      activePipelinePath.id,
      async (phase) => {
        if (phase === "warm") throw new Error("action failed");
      },
    ),
  ).rejects.toThrow(/action failed/i);
  expect(testInfo.attachments).toHaveLength(attachmentCountBefore);

  await installPipelineEvidenceBridge(page);
  await expect(
    expectToolcraftPipelineInvariant(
      page,
      pipelineEvidencePerformance,
      activePipelinePath.id,
      async () => {},
    ),
  ).rejects.toThrow(/pipeline invariant failed/i);
  expect(testInfo.attachments).toHaveLength(attachmentCountBefore);
});

test("initial-render captures three independent fresh document lifecycles", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;

  await expectToolcraftPipelineInvariant(
    page,
    pipelineEvidencePerformance,
    initialPipelinePath.id,
    async (phase) => navigateToFreshInitialPipelineBridge(page, phase),
  );

  const evidence = attachedPipelineEvidence(
    testInfo.attachments.slice(attachmentCountBefore),
  );
  expect(evidence).toHaveLength(3);
  for (const observation of evidence) {
    expect(
      observation.before.passes.every((pass) =>
        [
          pass.cacheHits,
          pass.cacheMisses,
          pass.activeResources,
          pass.durationMax,
          pass.durationTotal,
          pass.executions,
          pass.resourceCreations,
          pass.resourceDisposals,
          pass.transfers,
        ].every((value) => value === 0),
      ),
    ).toBe(true);
    expect(
      observation.after.passes.find(({ passId }) => passId === "composite")
        ?.executions,
    ).toBe(1);
  }
});

test("initial-render rejects a post-mount action that does not create a document", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;

  await expect(
    expectToolcraftPipelineInvariant(
      page,
      pipelineEvidencePerformance,
      initialPipelinePath.id,
      async () => {},
    ),
  ).rejects.toThrow(/navigate or reload.*fresh document lifecycle/i);
  expect(testInfo.attachments).toHaveLength(attachmentCountBefore);
});
