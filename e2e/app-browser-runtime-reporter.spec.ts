import { expect, test } from "@playwright/test";
import type { TestCase } from "@playwright/test/reporter";

import {
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  type ToolcraftBrowserRuntimeRequirement,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  fakeSuite,
  fakeTestCase,
  passedResultWithEvidence,
} from "./browser-runtime-evidence-reporter-test-fixtures";
import ToolcraftBrowserRuntimeEvidenceReporter from "./browser-runtime-evidence-reporter";

const fakeRequirement: ToolcraftBrowserRuntimeRequirement = {
  evidenceType: "product-observable-change",
  requirementId: "appearance.opacity",
  testName: "browser: opacity changes product output",
};


test("runtime evidence reporter fails full runs with a missing required test", async () => {
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [fakeRequirement],
    reportError: (error) => errors.push(error),
  });
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  });

  reporter.onBegin?.({} as never, fakeSuite([marker]));
  const status = await reporter.onEnd?.({ status: "passed" } as never);

  expect(status).toEqual({ status: "failed" });
  expect(errors).toContainEqual(
    expect.stringContaining(`Missing required browser test "${fakeRequirement.testName}"`),
  );
});

test("runtime evidence reporter limits marker-free runs to selected declared tests", async () => {
  const secondRequirement: ToolcraftBrowserRuntimeRequirement = {
    ...fakeRequirement,
    requirementId: "appearance.color",
    testName: "browser: color changes product output",
  };
  const selectedTest = fakeTestCase({
    results: [passedResultWithEvidence(fakeRequirement)],
    title: fakeRequirement.testName,
  });
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [fakeRequirement, secondRequirement],
    reportError: () => undefined,
  });
  const unprotectedMarkerTitle = fakeTestCase({
    title: TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  });

  reporter.onBegin?.(
    {} as never,
    fakeSuite([unprotectedMarkerTitle, selectedTest]),
  );
  const status = await reporter.onEnd?.({ status: "passed" } as never);

  expect(status).toBeUndefined();
});

test("runtime evidence reporter rejects unreachable evidence and runtime skips", () => {
  const candidates = [
    fakeTestCase({
      results: [
        { attachments: [], retry: 0, status: "passed" } as TestCase["results"][number],
      ],
      title: fakeRequirement.testName,
    }),
    fakeTestCase({
      expectedStatus: "skipped",
      results: [
        {
          ...passedResultWithEvidence(fakeRequirement),
          status: "skipped",
        } as TestCase["results"][number],
      ],
      title: fakeRequirement.testName,
    }),
  ];

  for (const candidate of candidates) {
    const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
      acceptanceRequirements: [fakeRequirement],
      reportError: () => undefined,
    });

    reporter.onBegin?.({} as never, fakeSuite([candidate]));
    expect(reporter.onEnd?.({ status: "passed" } as never)).toEqual({
      status: "failed",
    });
  }
});

test("performance marker requires every derived scenario evidence type", () => {
  const performanceRequirements: ToolcraftBrowserRuntimeRequirement[] = [
    {
      evidenceType: "performance-measurement",
      requirementId: "preview-heavy",
      testName: "browser perf: preview heavy",
    },
    {
      evidenceType: "performance-budget",
      requirementId: "preview-heavy",
      testName: "browser perf: preview heavy",
    },
  ];
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  });
  const scenarioTest = fakeTestCase({
    results: [passedResultWithEvidence(performanceRequirements[0]!)],
    title: "browser perf: preview heavy",
  });
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceRequirements,
    reportError: (error) => errors.push(error),
  });

  reporter.onBegin?.({} as never, fakeSuite([marker, scenarioTest]));
  expect(reporter.onEnd?.({ status: "passed" } as never)).toEqual({
    status: "failed",
  });
  expect(errors).toContainEqual(expect.stringContaining("performance-budget"));
});

test("performance reporter rejects missing warm and sustained raster quality evidence", () => {
  const testName = "browser perf: toolcraft path performance-path:color";
  const requirements: ToolcraftBrowserRuntimeRequirement[] = [
    "cold",
    "warm",
    "sustained",
  ].map((phase) => ({
    evidenceType: "performance-render-scale",
    requirementId: `performance-path:color#${phase}`,
    target: "appearance.color",
    testName,
  }));
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  });
  const scenarioTest = fakeTestCase({
    results: [passedResultWithEvidence(requirements[0]!)],
    title: testName,
  });
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceRequirements: requirements,
    reportError: (error) => errors.push(error),
  });

  reporter.onBegin?.({} as never, fakeSuite([marker, scenarioTest]));
  expect(reporter.onEnd?.({ status: "passed" } as never)).toEqual({
    status: "failed",
  });
  expect(errors).toContainEqual(expect.stringContaining("#warm"));
  expect(errors).toContainEqual(expect.stringContaining("#sustained"));
});

test("runtime evidence reporter requires render-scale proof for every covered state", () => {
  const testName = "browser: canvas render scale backing pixels";
  const requirements: ToolcraftBrowserRuntimeRequirement[] = [
    "interaction",
    "playback",
    "steady",
  ].map((state) => ({
    evidenceType: "canvas-render-scale-backing",
    requirementId: `canvas.render-scale#${state}`,
    target: "canvas.renderScale",
    testName,
  }));
  const interaction = passedResultWithEvidence(requirements[0]!);
  const steady = passedResultWithEvidence(requirements[2]!);
  const result = {
    ...interaction,
    attachments: [...interaction.attachments, ...steady.attachments],
  } as TestCase["results"][number];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: requirements,
    reportError: () => undefined,
  });

  reporter.onBegin?.(
    {} as never,
    fakeSuite([fakeTestCase({ results: [result], title: testName })]),
  );

  expect(reporter.onEnd?.({ status: "passed" } as never)).toEqual({
    status: "failed",
  });
});

test("runtime evidence reporter requires exact targets for layer base and specialized proof", () => {
  const testName = "browser: layer order changes output";
  const requirements: ToolcraftBrowserRuntimeRequirement[] = [
    {
      evidenceType: "product-observable-change",
      requirementId: "layers.order",
      target: "layers.order",
      testName,
    },
    {
      evidenceType: "layer-reorder",
      requirementId: "layers.order",
      target: "layers.order",
      testName,
    },
  ];
  const resultFor = (
    evidence: readonly ToolcraftBrowserRuntimeRequirement[],
  ): TestCase["results"][number] => {
    const first = passedResultWithEvidence(evidence[0]!);
    return {
      ...first,
      attachments: evidence.flatMap(
        (requirement) => passedResultWithEvidence(requirement).attachments,
      ),
    } as TestCase["results"][number];
  };
  const evaluate = (evidence: readonly ToolcraftBrowserRuntimeRequirement[]) => {
    const errors: string[] = [];
    const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
      acceptanceRequirements: requirements,
      reportError: (error) => errors.push(error),
    });
    reporter.onBegin?.(
      {} as never,
      fakeSuite([
        fakeTestCase({
          results: [resultFor(evidence)],
          title: testName,
        }),
      ]),
    );
    return {
      errors,
      status: reporter.onEnd?.({ status: "passed" } as never),
    };
  };

  const missingTarget = requirements.map(({ target: _target, ...requirement }) => ({
    ...requirement,
  }));
  const wrongTarget = requirements.map((requirement) => ({
    ...requirement,
    target: "layers.visibility",
  }));

  expect(evaluate(missingTarget).status).toEqual({ status: "failed" });
  expect(evaluate(wrongTarget).status).toEqual({ status: "failed" });
  expect(evaluate(requirements)).toEqual({ errors: [], status: undefined });
});
