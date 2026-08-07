import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryPlan,
  getToolcraftDeliveryPlanError,
} from "./toolcraft-delivery-plan.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftPerformanceRequestAuthorityHash,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  createToolcraftTargetedPerformanceReport,
  createToolcraftTargetedPerformanceComparisonHash,
} from "./toolcraft-targeted-performance-report.mjs";
import { createToolcraftVerificationSourceHash } from "./toolcraft-verification-inventory.mjs";

const hash = (character) => character.repeat(64);
const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
const absentCanonicalPath =
  `performance-path:${encodeURIComponent(JSON.stringify([
    "interactive-continuous",
    "control-drag",
    ["preview-composite"],
    ["main"],
    [],
  ]))}`;
const performanceTestName = `browser perf: toolcraft path ${pathId}`;
const catalog = {
  acceptance: [{
    acceptanceId: "output.updates",
    contractHash: hash("a"),
    domainId: "output",
    file: "app-output.spec.ts",
    testName: "browser: output updates",
  }],
  performance: [{
    passIds: ["preview-composite"],
    pathId,
    testName: performanceTestName,
  }],
  version: 2,
};

function proofModel(ownerPath) {
  return createToolcraftFunctionalProofModel({
    catalog,
    inventory: {
      owners: [{
        acceptanceIds: ["output.updates"],
        kind: "functional",
        path: ownerPath,
      }],
      version: 3,
    },
  });
}

function inventory(path, digit) {
  const entries = [{ path, sha256: hash(digit) }];
  return { entries, sourceHash: createToolcraftVerificationSourceHash(entries) };
}

function performanceImpact() {
  return {
    acceptanceIds: ["output.updates"],
    browserTestNames: ["browser: output updates"],
    buildRequired: true,
    performanceCandidates: {
      passIds: ["preview-composite"],
      pathIds: [pathId],
      testNames: [performanceTestName],
    },
    productTestFiles: ["src/features/output.test.tsx"],
  };
}

function requestAuthority(pathIds = [pathId]) {
  const source = {
    heading: "Delivery 2 - Slow preview",
    pathIds,
    request: "Slow preview",
    requestEvidence: "Slow preview",
  };
  return {
    hash: createToolcraftPerformanceRequestAuthorityHash(source),
    ...source,
  };
}

function inputs({
  authority = null,
  changedPath = "src/features/output.tsx",
  resolvedImpact = performanceImpact(),
} = {}) {
  const comparisonInventory = inventory(changedPath, "1");
  const currentInventory = inventory(changedPath, "2");
  return {
    allProductTestFiles: ["src/features/output.test.tsx"],
    authority,
    catalog,
    changeSet: {
      dependencyChanged: false,
      docsChanged: false,
      frameworkChanged: false,
      impact: resolvedImpact,
      platformChanged: false,
      productInputsChanged: resolvedImpact !== null,
    },
    comparisonInventory,
    currentFunctionalProofModel: proofModel(
      "src/features/output.tsx",
    ),
    currentInventory,
    integrity: {
      manifestHash: hash("a"),
      sourceHash: currentInventory.sourceHash,
    },
    packageManager: "pnpm",
    previousFunctionalProofModel: proofModel(
      "src/features/previous-output.tsx",
    ),
    previousLifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    previousPerformance: { kind: "none" },
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function validReport(sourceHash, requestAuthorityHash) {
  const metrics = {
    droppedFrameCount: 0,
    droppedFrameRatio: 0,
    durationMs: 100,
    frameGapP50Ms: 16,
    frameGapP95Ms: 17,
    frameGapP99Ms: 18,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    maxFrameGapMs: 20,
    sampleCount: 10,
  };
  return createToolcraftTargetedPerformanceReport({
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    measurements: ["cold", "warm", "sustained"].map((phase) => ({
      evidenceType: "performance-measurement-metrics",
      kind: "animation-frames",
      metrics,
      pathId,
      phase,
      profile: "default",
      profileCatalogVersion: 1,
      version: 1,
    })),
    nonce: "nonce",
    performancePassIds: ["preview-composite"],
    performancePathIds: [pathId],
    requestAuthorityHash,
    sourceHash,
    testNames: [performanceTestName],
  });
}

test("rejects unchanged and unrepresented changed inputs", () => {
  const unchanged = inputs();
  unchanged.currentInventory = unchanged.comparisonInventory;
  unchanged.integrity.sourceHash = unchanged.currentInventory.sourceHash;
  assert.throws(() => createToolcraftDeliveryPlan(unchanged), /changed/iu);

  const extra = inputs();
  extra.changeSet.untrusted = true;
  assert.throws(() => createToolcraftDeliveryPlan(extra), /change set/iu);

  const unknown = inputs({ changedPath: "arbitrary.txt", resolvedImpact: null });
  assert.throws(() => createToolcraftDeliveryPlan(unknown), /represented/iu);
});

test("rejects malformed catalogs and inconsistent exact impact relations", () => {
  for (const mutate of [
    (value) => value.changeSet.impact.acceptanceIds = ["stale.id"],
    (value) => value.changeSet.impact.browserTestNames = ["browser: stale"],
    (value) => value.changeSet.impact.performanceCandidates.passIds = ["unknown-pass"],
    (value) => value.changeSet.impact.performanceCandidates.pathIds = ["unknown-path"],
    (value) => value.changeSet.impact.performanceCandidates.testNames = ["browser perf: stale"],
    (value) => value.catalog.acceptance[0].extra = true,
  ]) {
    const value = structuredClone(inputs());
    mutate(value);
    assert.throws(() => createToolcraftDeliveryPlan(value));
  }
});

test("impact cannot omit both functional and performance proof", () => {
  const value = inputs();
  value.changeSet.impact.acceptanceIds = [];
  value.changeSet.impact.browserTestNames = [];
  value.changeSet.impact.productTestFiles = [];
  value.changeSet.impact.performanceCandidates = {
    passIds: [],
    pathIds: [],
    testNames: [],
  };
  assert.throws(
    () => createToolcraftDeliveryPlan(value),
    /functional or performance proof/iu,
  );
});

test("rejects malformed inventory, integrity, hashes, and previous reports", () => {
  for (const mutate of [
    (value) => value.currentInventory.sourceHash = hash("f"),
    (value) => value.comparisonInventory.entries[0].sha256 = "bad",
    (value) => value.integrity.sourceHash = hash("e"),
    (value) => value.integrity.manifestHash = "bad",
    (value) => value.allProductTestFiles = [],
    (value) => value.allProductTestFiles = ["../escape.test.ts"],
    (value) => value.allProductTestFiles = ["C:/escape.test.ts"],
    (value) => value.packageManager = "unknown",
    (value) => value.previousPerformance = {
      kind: "performance-iteration-report",
      requestAuthorityHash: hash("c"),
      report: {},
      comparisonHash: hash("c"),
    },
    (value) => value.previousPerformance = {
      kind: "performance-iteration-report",
      requestAuthorityHash: hash("c"),
      report: validReport(value.comparisonInventory.sourceHash, hash("c")),
      comparisonHash: "bad",
    },
  ]) {
    const value = structuredClone(inputs());
    mutate(value);
    assert.throws(() => createToolcraftDeliveryPlan(value));
  }
});

test("rejects missing, reused, empty, unknown, and incompatible authority", () => {
  const authority = requestAuthority();
  assert.throws(
    () => createToolcraftDeliveryPlan(
      inputs({ authority: requestAuthority([absentCanonicalPath]) }),
    ),
    /unknown path/iu,
  );
  for (const mutate of [
    (value) => value.authority = { ...authority, pathIds: [] },
    (value) => value.authority = { ...authority, requestEvidence: "" },
    (value) => value.changeSet.productInputsChanged = false,
    (value) => value.changeSet.impact.performanceCandidates.pathIds = [],
  ]) {
    const value = inputs({ authority });
    mutate(value);
    assert.throws(() => createToolcraftDeliveryPlan(value));
  }

  const reused = inputs({ authority });
  const report = validReport(
    reused.comparisonInventory.sourceHash,
    authority.hash,
  );
  reused.previousPerformance = {
    kind: "performance-iteration-report",
    requestAuthorityHash: authority.hash,
    report,
    comparisonHash:
      createToolcraftTargetedPerformanceComparisonHash(report),
  };
  reused.previousLifecycle = {
    consumedPerformanceRequestAuthorityHashes: [authority.hash],
    performanceEscalationOffered: false,
  };
  assert.throws(() => createToolcraftDeliveryPlan(reused), /already/iu);
});

test("retains only a compatible previous authorized comparison", () => {
  const authority = requestAuthority();
  const value = inputs({ authority });
  const iterationReport = validReport(
    value.comparisonInventory.sourceHash,
    hash("c"),
  );
  const iterationComparisonHash =
    createToolcraftTargetedPerformanceComparisonHash(iterationReport);
  value.previousPerformance = {
    kind: "performance-iteration-report",
    requestAuthorityHash: hash("c"),
    report: iterationReport,
    comparisonHash: iterationComparisonHash,
  };
  value.previousLifecycle = {
    consumedPerformanceRequestAuthorityHashes: [hash("c")],
    performanceEscalationOffered: false,
  };
  const compatiblePlan = createToolcraftDeliveryPlan(value);
  assert.deepEqual(
    compatiblePlan.performanceComparison,
    {
      kind: "compatible-targeted-report",
      report: iterationReport,
      comparisonHash: iterationComparisonHash,
    },
  );
  assert.deepEqual(compatiblePlan.lifecycle, {
    consumedPerformanceRequestAuthorityHashes: [
      authority.hash,
      hash("c"),
    ].sort(),
    performanceEscalationOffered: true,
  });

  const incompatible = validReport(hash("d"), hash("c"));
  value.previousPerformance = {
    kind: "performance-iteration-report",
    requestAuthorityHash: hash("c"),
    report: incompatible,
    comparisonHash:
      createToolcraftTargetedPerformanceComparisonHash(incompatible),
  };
  assert.deepEqual(
    createToolcraftDeliveryPlan(value).performanceComparison,
    { kind: "none" },
  );
});

test("plan validator rejects weakened, malformed, mutable, and noncanonical plans", () => {
  const valid = createToolcraftDeliveryPlan(inputs());
  const cases = [
    { ...valid, authority: hash("b") },
    { ...valid, steps: valid.steps.filter((step) => step.kind !== "build") },
    { ...valid, steps: [...valid.steps, valid.steps[0]] },
    {
      ...valid,
      steps: valid.steps.map((step) =>
        step.kind === "browser-functional"
          ? { ...step, testNames: [] }
          : step
      ),
    },
    { ...valid, steps: [...valid.steps].reverse() },
    {
      ...valid,
      kind: "performance-iteration",
      requestAuthorityHash: hash("b"),
    },
  ];
  for (const plan of cases) {
    assert.equal(typeof getToolcraftDeliveryPlanError(deepFreeze(plan)), "string");
  }
  assert.equal(
    typeof getToolcraftDeliveryPlanError(structuredClone(valid)),
    "string",
  );
});

test("browser performance plans require functional browser proof", () => {
  const authority = requestAuthority();
  const iteration = createToolcraftDeliveryPlan(inputs({ authority }));
  const withoutFunctional = {
    ...iteration,
    steps: iteration.steps.filter((step) => step.kind !== "browser-functional"),
  };
  assert.match(
    getToolcraftDeliveryPlanError(deepFreeze(withoutFunctional)),
    /functional browser proof/iu,
  );
});

test("rejects an unknown browser proof step", () => {
  const plan = createToolcraftDeliveryPlan(inputs());
  const obsolete = deepFreeze({
    ...plan,
    steps: [
      ...plan.steps,
      {
        kind: "browser-functional-legacy",
        legacyTestName: "browser: obsolete",
        testNames: ["browser: output updates"],
      },
    ],
  });

  assert.equal(
    getToolcraftDeliveryPlanError(obsolete),
    "Delivery proof step is malformed.",
  );
});

test("complete dependency proof and browser build ordering cannot be weakened", () => {
  const dependency = inputs({
    changedPath: "package.json",
    resolvedImpact: null,
  });
  dependency.changeSet.dependencyChanged = true;
  const valid = createToolcraftDeliveryPlan(dependency);
  for (const kind of ["docs", "code-health", "product-tests", "build"]) {
    const weakened = {
      ...valid,
      steps: valid.steps.filter((step) => step.kind !== kind),
    };
    assert.equal(
      typeof getToolcraftDeliveryPlanError(deepFreeze(weakened)),
      "string",
    );
  }
  const beforeBuild = {
    ...valid,
    steps: [
      ...valid.steps.filter((step) => step.kind !== "build"),
      { kind: "build" },
    ],
  };
  assert.equal(
    typeof getToolcraftDeliveryPlanError(deepFreeze(beforeBuild)),
    "string",
  );
});
