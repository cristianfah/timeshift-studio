import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryPlan,
  getToolcraftDeliveryDiagnosticTier,
  getToolcraftDeliveryPlanError,
} from "./toolcraft-delivery-plan.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftPerformanceRequestAuthorityHash,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";

const hash = (character) => character.repeat(64);
const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
const performanceTestName = `browser perf: toolcraft path ${pathId}`;
const authoritySource = Object.freeze({
  heading: "Delivery 2 - Slow preview",
  pathIds: [pathId],
  request: "The preview is still slow.",
  requestEvidence: "The preview is still slow.",
});
const authority = Object.freeze({
  hash: createToolcraftPerformanceRequestAuthorityHash(authoritySource),
  ...authoritySource,
});
const catalog = {
  acceptance: [
    {
      acceptanceId: "output.updates",
      contractHash: hash("a"),
      domainId: "output",
      file: "app-output.spec.ts",
      testName: "browser: output updates",
    },
    {
      acceptanceId: "settings.persist",
      contractHash: hash("b"),
      domainId: "settings",
      file: "app-settings.spec.ts",
      testName: "browser: settings persist",
    },
  ],
  performance: [{
    passIds: ["preview-composite"],
    pathId,
    testName: performanceTestName,
  }],
  version: 2,
};
const allProductTestFiles = ["src/features/output.test.tsx"];
const fullFunctionalSteps = [
  { kind: "docs" },
  { kind: "code-health" },
  { kind: "product-tests", files: allProductTestFiles },
  { kind: "build" },
  {
    kind: "browser-functional",
    testNames: ["browser: output updates", "browser: settings persist"],
  },
];
const performanceStep = {
  kind: "browser-performance",
  passIds: ["preview-composite"],
  pathIds: [pathId],
  testNames: [performanceTestName],
};

function inventory(digit) {
  const entries = [{
    path: "src/features/output.tsx",
    sha256: hash(digit),
  }];
  return {
    entries,
    sourceHash: createToolcraftVerificationSourceHash(entries),
  };
}

function proofModel(ownerPath) {
  return createToolcraftFunctionalProofModel({
    catalog,
    inventory: {
      owners: [{
        acceptanceIds: ["output.updates", "settings.persist"],
        kind: "functional",
        path: ownerPath,
      }],
      version: 3,
    },
  });
}

function inputs({ initial = false, requestAuthority = null } = {}) {
  const comparisonInventory = initial ? null : inventory("1");
  const currentInventory = inventory("2");
  const currentFunctionalProofModel = proofModel(
    "src/features/output.tsx",
  );
  const previousFunctionalProofModel = initial
    ? null
    : proofModel("src/features/previous-output.tsx");
  const impact = initial ? null : {
    acceptanceIds: ["output.updates"],
    browserTestNames: ["browser: output updates"],
    buildRequired: true,
    performanceCandidates: {
      passIds: ["preview-composite"],
      pathIds: [pathId],
      testNames: [performanceTestName],
    },
    productTestFiles: allProductTestFiles,
  };
  return {
    allProductTestFiles,
    authority: requestAuthority,
    catalog,
    changeSet: {
      dependencyChanged: false,
      docsChanged: false,
      frameworkChanged: false,
      impact,
      platformChanged: false,
      productInputsChanged: impact !== null,
    },
    comparisonInventory,
    currentFunctionalProofModel,
    currentInventory,
    integrity: {
      manifestHash: hash("a"),
      sourceHash: currentInventory.sourceHash,
    },
    packageManager: "pnpm",
    previousFunctionalProofModel,
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

test("creates initial and changed functional plans with one exact basis", () => {
  const initialInputs = inputs({ initial: true });
  const initial = createToolcraftDeliveryPlan(initialInputs);
  assert.deepEqual(initial, {
    basis: { kind: "initial" },
    functionalProofModelHash: createToolcraftFunctionalProofModelHash(
      initialInputs.currentFunctionalProofModel,
    ),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    manifestHash: hash("a"),
    sourceHash: initialInputs.currentInventory.sourceHash,
    steps: fullFunctionalSteps,
  });
  assert.equal(getToolcraftDeliveryDiagnosticTier(initial), 4);

  const changedInputs = inputs();
  const changed = createToolcraftDeliveryPlan(changedInputs);
  assert.deepEqual(changed.basis, {
    changedFiles: ["src/features/output.tsx"],
    comparisonFunctionalProofModelHash:
      createToolcraftFunctionalProofModelHash(
        changedInputs.previousFunctionalProofModel,
      ),
    comparisonInventory: changedInputs.comparisonInventory,
    kind: "changed",
  });
  assert.equal(changed.kind, "functional");
  assert.equal(
    changed.steps.some(({ kind }) => kind === "browser-performance"),
    false,
  );
  assert.equal(getToolcraftDeliveryDiagnosticTier(changed), 2);
});

test("rejects performance authority before the first functional receipt", () => {
  assert.throws(
    () => createToolcraftDeliveryPlan(inputs({
      initial: true,
      requestAuthority: authority,
    })),
    /first delivery must be functional/iu,
  );
});

test("creates a changed authorized iteration with exact affected proof", () => {
  const planningInputs = inputs({ requestAuthority: authority });
  const plan = createToolcraftDeliveryPlan(planningInputs);
  const functionalPlan = createToolcraftDeliveryPlan({
    ...planningInputs,
    authority: null,
  });
  assert.deepEqual(plan.basis, {
    changedFiles: ["src/features/output.tsx"],
    comparisonFunctionalProofModelHash:
      createToolcraftFunctionalProofModelHash(
        planningInputs.previousFunctionalProofModel,
      ),
    comparisonInventory: planningInputs.comparisonInventory,
    kind: "changed",
  });
  assert.equal(plan.kind, "performance-iteration");
  assert.deepEqual(plan.steps, [
    { kind: "code-health" },
    { kind: "product-tests", files: allProductTestFiles },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: ["browser: output updates"],
    },
    performanceStep,
  ]);
  assert.equal(
    plan.functionalProofModelHash,
    functionalPlan.functionalProofModelHash,
  );
  assert.deepEqual(plan.steps.slice(0, -1), functionalPlan.steps);
  assert.equal(
    plan.steps.filter(({ kind }) => kind === "browser-performance").length,
    1,
  );
  assert.equal(getToolcraftDeliveryDiagnosticTier(plan), 3);
});

test("creates an authorized iteration for a passless viewport path", () => {
  const passlessPathId =
    "performance-path:%5B%22interactive-continuous%22%2C%22viewport-drag%22%2C%5B%5D%2C%5B%5D%2C%5B%5D%5D";
  const testName = `browser perf: toolcraft path ${passlessPathId}`;
  const source = {
    heading: "Delivery 2 - Slow viewport drag",
    pathIds: [passlessPathId],
    request: "The canvas is slow while panning.",
    requestEvidence: "The canvas is slow while panning.",
  };
  const planningInputs = inputs({
    requestAuthority: {
      hash: createToolcraftPerformanceRequestAuthorityHash(source),
      ...source,
    },
  });
  planningInputs.catalog = {
    ...catalog,
    performance: [{ passIds: [], pathId: passlessPathId, testName }],
  };
  planningInputs.changeSet.impact.performanceCandidates = {
    passIds: [],
    pathIds: [passlessPathId],
    testNames: [testName],
  };

  const plan = createToolcraftDeliveryPlan(planningInputs);

  assert.equal(plan.kind, "performance-iteration");
  assert.deepEqual(
    plan.steps.find(({ kind }) => kind === "browser-performance"),
    {
      kind: "browser-performance",
      passIds: [],
      pathIds: [passlessPathId],
      testNames: [testName],
    },
  );
});

test("keeps performance-adapter-only changes functional without inferred measurement", () => {
  const planningInputs = inputs();
  planningInputs.changeSet.impact = {
    acceptanceIds: [],
    browserTestNames: [],
    buildRequired: false,
    performanceCandidates: {
      passIds: ["preview-composite"],
      pathIds: [pathId],
      testNames: [performanceTestName],
    },
    productTestFiles: [],
  };

  const plan = createToolcraftDeliveryPlan(planningInputs);

  assert.equal(plan.kind, "functional");
  assert.deepEqual(plan.steps, [{ kind: "code-health" }]);
});

test("rejects malformed basis and functional performance proof", () => {
  const valid = createToolcraftDeliveryPlan(inputs());
  for (const basis of [
    { kind: "initial", changedFiles: valid.basis.changedFiles },
    { kind: "changed", changedFiles: valid.basis.changedFiles },
    {
      ...valid.basis,
      comparisonInventory: {
        ...valid.basis.comparisonInventory,
        sourceHash: valid.sourceHash,
      },
    },
  ]) {
    const malformed = deepFreeze({ ...valid, basis });
    assert.match(
      getToolcraftDeliveryPlanError(malformed),
      /basis|inventory|provenance/iu,
    );
  }

  const withPerformance = deepFreeze({
    ...valid,
    steps: [...valid.steps, performanceStep],
  });
  assert.match(
    getToolcraftDeliveryPlanError(withPerformance),
    /functional.*performance/iu,
  );

  const performance = createToolcraftDeliveryPlan(
    inputs({ requestAuthority: authority }),
  );
  const initialPerformance = deepFreeze({
    ...performance,
    basis: { kind: "initial" },
  });
  assert.match(
    getToolcraftDeliveryPlanError(initialPerformance),
    /performance iteration requires a previous successful delivery/iu,
  );
});
