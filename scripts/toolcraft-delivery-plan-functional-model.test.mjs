import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryPlan,
  createToolcraftDeliveryPlanHash,
  getToolcraftDeliveryPlanError,
  TOOLCRAFT_DELIVERY_PLAN_VERSION,
} from "./toolcraft-delivery-plan.mjs";
import {
  createToolcraftFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";

const hash = (character) => character.repeat(64);
const catalog = Object.freeze({
  acceptance: Object.freeze([Object.freeze({
    acceptanceId: "output.updates",
    contractHash: hash("a"),
    domainId: "output",
    file: "app-output.spec.ts",
    testName: "browser: output updates",
  })]),
  performance: Object.freeze([]),
  version: 2,
});

function inventory(character) {
  const entries = Object.freeze([Object.freeze({
    path: "src/features/output.tsx",
    sha256: hash(character),
  })]);
  return Object.freeze({
    entries,
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
}

function model(ownerPath) {
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

function inputs({ initial = false } = {}) {
  const currentInventory = inventory("2");
  const currentFunctionalProofModel = model("src/features/output.tsx");
  const previousFunctionalProofModel = initial
    ? null
    : model("src/features/previous-output.tsx");
  return {
    allProductTestFiles: ["src/features/output.test.tsx"],
    authority: null,
    catalog,
    changeSet: {
      dependencyChanged: false,
      docsChanged: false,
      frameworkChanged: false,
      impact: initial ? null : {
        acceptanceIds: ["output.updates"],
        browserTestNames: ["browser: output updates"],
        buildRequired: true,
        performanceCandidates: {
          passIds: [],
          pathIds: [],
          testNames: [],
        },
        productTestFiles: ["src/features/output.test.tsx"],
      },
      platformChanged: false,
      productInputsChanged: !initial,
    },
    comparisonInventory: initial ? null : inventory("1"),
    currentFunctionalProofModel,
    currentInventory,
    integrity: {
      manifestHash: hash("f"),
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

test("plan v4 binds the current canonical functional proof model hash", () => {
  const planningInputs = inputs({ initial: true });
  const plan = createToolcraftDeliveryPlan(planningInputs);

  assert.equal(TOOLCRAFT_DELIVERY_PLAN_VERSION, 4);
  assert.equal(
    plan.functionalProofModelHash,
    createToolcraftFunctionalProofModelHash(
      planningInputs.currentFunctionalProofModel,
    ),
  );
  assert.match(plan.functionalProofModelHash, /^[a-f0-9]{64}$/u);
});

test("changed basis binds the immediate previous canonical model hash", () => {
  const planningInputs = inputs();
  const plan = createToolcraftDeliveryPlan(planningInputs);

  assert.equal(
    plan.basis.comparisonFunctionalProofModelHash,
    createToolcraftFunctionalProofModelHash(
      planningInputs.previousFunctionalProofModel,
    ),
  );
  assert.match(
    plan.basis.comparisonFunctionalProofModelHash,
    /^[a-f0-9]{64}$/u,
  );

  const missing = deepFreeze({
    ...plan,
    basis: {
      changedFiles: plan.basis.changedFiles,
      comparisonInventory: plan.basis.comparisonInventory,
      kind: "changed",
    },
  });
  assert.match(
    getToolcraftDeliveryPlanError(missing),
    /basis|comparison.*functional proof model hash/iu,
  );
});

test("later functional construction consumes impact.buildRequired directly", () => {
  const planningInputs = inputs();
  planningInputs.changeSet.impact = {
    acceptanceIds: [],
    browserTestNames: [],
    buildRequired: true,
    performanceCandidates: {
      passIds: [],
      pathIds: [],
      testNames: [],
    },
    productTestFiles: ["src/features/output.test.tsx"],
  };
  const plan = createToolcraftDeliveryPlan(planningInputs);

  assert.deepEqual(
    plan.steps.map(({ kind }) => kind),
    ["code-health", "product-tests", "build"],
  );
});

test("functional model hashes contribute to the canonical plan hash", () => {
  const plan = createToolcraftDeliveryPlan(inputs());
  const changedCurrent = deepFreeze({
    ...plan,
    functionalProofModelHash: hash("b"),
  });
  const changedPrevious = deepFreeze({
    ...plan,
    basis: {
      ...plan.basis,
      comparisonFunctionalProofModelHash: hash("c"),
    },
  });

  assert.notEqual(
    createToolcraftDeliveryPlanHash(plan),
    createToolcraftDeliveryPlanHash(changedCurrent),
  );
  assert.notEqual(
    createToolcraftDeliveryPlanHash(plan),
    createToolcraftDeliveryPlanHash(changedPrevious),
  );
});

test("planning rejects missing, malformed, and mismatched model provenance", () => {
  const initial = inputs({ initial: true });
  assert.throws(
    () => createToolcraftDeliveryPlan({
      ...initial,
      previousFunctionalProofModel: model("src/features/previous-output.tsx"),
    }),
    /initial.*previous functional proof model/iu,
  );

  const changed = inputs();
  assert.throws(
    () => createToolcraftDeliveryPlan({
      ...changed,
      previousFunctionalProofModel: null,
    }),
    /changed.*previous functional proof model/iu,
  );
  assert.throws(
    () => createToolcraftDeliveryPlan({
      ...changed,
      currentFunctionalProofModel: structuredClone(
        changed.currentFunctionalProofModel,
      ),
    }),
    /current functional proof model/iu,
  );
  const mismatchedCatalog = {
    ...catalog,
    acceptance: [{
      ...catalog.acceptance[0],
      contractHash: hash("c"),
    }],
  };
  const mismatchedModel = createToolcraftFunctionalProofModel({
    catalog: mismatchedCatalog,
    inventory: {
      owners: [{
        acceptanceIds: ["output.updates"],
        kind: "functional",
        path: "src/features/output.tsx",
      }],
      version: 3,
    },
  });
  assert.throws(
    () => createToolcraftDeliveryPlan({
      ...changed,
      currentFunctionalProofModel: mismatchedModel,
    }),
    /does not match the delivery catalog/iu,
  );
});

test("plan validation rejects exotic objects before canonical hashing", () => {
  const valid = createToolcraftDeliveryPlan(inputs());
  const planSymbol = structuredClone(valid);
  planSymbol[Symbol("hidden")] = true;
  const basisSymbol = structuredClone(valid);
  basisSymbol.basis[Symbol("hidden")] = true;
  const stepSymbol = structuredClone(valid);
  stepSymbol.steps[0][Symbol("hidden")] = true;
  const exoticPlan = Object.assign(Object.create({ inherited: true }), valid);
  const exoticBasis = structuredClone(valid);
  exoticBasis.basis = Object.assign(
    Object.create({ inherited: true }),
    exoticBasis.basis,
  );
  const exoticStep = structuredClone(valid);
  exoticStep.steps[0] = Object.assign(
    Object.create({ inherited: true }),
    exoticStep.steps[0],
  );
  const hiddenRequiredPlanKey = structuredClone(valid);
  Object.defineProperty(
    hiddenRequiredPlanKey,
    "functionalProofModelHash",
    { enumerable: false },
  );

  for (const candidate of [
    planSymbol,
    basisSymbol,
    stepSymbol,
    exoticPlan,
    exoticBasis,
    exoticStep,
    hiddenRequiredPlanKey,
  ]) {
    const frozen = deepFreeze(candidate);
    assert.equal(typeof getToolcraftDeliveryPlanError(frozen), "string");
    assert.throws(() => createToolcraftDeliveryPlanHash(frozen));
  }

  const inputSymbol = inputs();
  inputSymbol[Symbol("hidden")] = true;
  assert.throws(
    () => createToolcraftDeliveryPlan(inputSymbol),
    /planning inputs are malformed/iu,
  );
  const exoticInput = Object.assign(
    Object.create({ inherited: true }),
    inputs(),
  );
  assert.throws(
    () => createToolcraftDeliveryPlan(exoticInput),
    /planning inputs are malformed/iu,
  );
});

test("plan validation rejects sparse and augmented proof arrays", () => {
  const valid = createToolcraftDeliveryPlan(inputs());
  const sparseSteps = structuredClone(valid);
  delete sparseSteps.steps[0];
  const sparseTargets = structuredClone(valid);
  const browser = sparseTargets.steps.find(
    ({ kind }) => kind === "browser-functional",
  );
  browser.testNames = Array(1);
  const augmentedSteps = structuredClone(valid);
  augmentedSteps.steps.hidden = true;
  const augmentedTargets = structuredClone(valid);
  const augmentedBrowser = augmentedTargets.steps.find(
    ({ kind }) => kind === "browser-functional",
  );
  augmentedBrowser.testNames.hidden = true;
  const symbolTargets = structuredClone(valid);
  const symbolBrowser = symbolTargets.steps.find(
    ({ kind }) => kind === "browser-functional",
  );
  symbolBrowser.testNames[Symbol("hidden")] = true;

  for (const candidate of [
    sparseSteps,
    sparseTargets,
    augmentedSteps,
    augmentedTargets,
    symbolTargets,
  ]) {
    const frozen = deepFreeze(candidate);
    assert.equal(typeof getToolcraftDeliveryPlanError(frozen), "string");
    assert.throws(() => createToolcraftDeliveryPlanHash(frozen));
  }
});

test("plan validation and hashing reject noncanonical lifecycle state", () => {
  const valid = createToolcraftDeliveryPlan(inputs());
  const symbolLifecycle = structuredClone(valid);
  symbolLifecycle.lifecycle[Symbol("hidden")] = true;
  const sparseLifecycle = structuredClone(valid);
  sparseLifecycle.lifecycle.consumedPerformanceRequestAuthorityHashes =
    Array(1);

  for (const candidate of [symbolLifecycle, sparseLifecycle]) {
    const frozen = deepFreeze(candidate);
    assert.match(
      getToolcraftDeliveryPlanError(frozen),
      /lifecycle state is malformed or noncanonical/iu,
    );
    assert.throws(() => createToolcraftDeliveryPlanHash(frozen));
  }
});
