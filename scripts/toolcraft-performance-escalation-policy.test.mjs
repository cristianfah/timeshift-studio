import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeToolcraftDeliveryAnchor,
} from "./toolcraft-delivery-anchor.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createInventory,
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  formatToolcraftPerformanceEscalationRecommendation,
  getToolcraftPerformanceEscalationRecommendation,
} from "./toolcraft-performance-escalation-policy.mjs";
import {
  createToolcraftPerformanceRequestAuthorityHash,
  TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  createToolcraftTargetedPerformanceReport,
  createToolcraftTargetedPerformanceEvidenceHash,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  createTargetedMeasurementFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";

const hash = (character) => character.repeat(64);
const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
const performanceTestName = `browser perf: toolcraft path ${pathId}`;
const functionalTestName = "browser: focused acceptance";
const expectedRecommendation = {
  command: TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
  kind: "offer-full-performance-audit",
  reason: "two-consecutive-compatible-performance-iterations",
  requiresExplicitUserConsent: true,
};

function deliveryCatalog(testName = functionalTestName) {
  return {
    acceptance: [{
      acceptanceId: "output.updates",
      contractHash: hash("b"),
      domainId: "output",
      file: "app-controls.spec.ts",
      testName,
    }],
    performance: [{
      passIds: ["composite"],
      pathId,
      testName: performanceTestName,
    }],
    version: 2,
  };
}

function functionalProofModel(catalog) {
  return createToolcraftFunctionalProofModel({
    catalog,
    inventory: {
      owners: [{
        acceptanceIds: ["output.updates"],
        kind: "performance",
        passIds: ["composite"],
        path: "src/app/app-schema.ts",
      }],
      version: 3,
    },
  });
}

function requestAuthority(heading, request) {
  const source = {
    heading,
    pathIds: [pathId],
    request,
    requestEvidence: request,
  };
  return {
    hash: createToolcraftPerformanceRequestAuthorityHash(source),
    ...source,
  };
}

function createFirstPlannerReceipt() {
  const comparisonInventory = createInventory({
    "src/app/app-schema.ts": hash("1"),
  });
  const finalInventory = createInventory({
    "src/app/app-schema.ts": hash("2"),
  });
  const authority = requestAuthority(
    "Delivery 1 - Slow preview",
    "The preview is slow.",
  );
  const requestAuthorityHash = authority.hash;
  const catalog = deliveryCatalog();
  const model = functionalProofModel(catalog);
  const plan = createToolcraftDeliveryPlan({
    allProductTestFiles: ["src/app/app-schema.test.ts"],
    authority,
    catalog,
    changeSet: {
      dependencyChanged: false,
      docsChanged: false,
      frameworkChanged: false,
      impact: {
        acceptanceIds: ["output.updates"],
        browserTestNames: [functionalTestName],
        buildRequired: true,
        performanceCandidates: {
          passIds: ["composite"],
          pathIds: [pathId],
          testNames: [performanceTestName],
        },
        productTestFiles: [],
      },
      platformChanged: false,
      productInputsChanged: true,
    },
    comparisonInventory,
    currentFunctionalProofModel: model,
    currentInventory: finalInventory,
    integrity: {
      manifestHash: hash("a"),
      sourceHash: finalInventory.sourceHash,
    },
    packageManager: "pnpm",
    previousFunctionalProofModel: model,
    previousLifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    previousPerformance: { kind: "none" },
  });
  const testEvidence = [{
    fullTitle: `app-controls.spec.ts › ${performanceTestName}`,
    leafTitle: performanceTestName,
  }];
  const report = createToolcraftTargetedPerformanceReport({
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    measurements: createTargetedMeasurementFixture([pathId]),
    nonce: "first-planner-receipt",
    performancePassIds: ["composite"],
    performancePathIds: [pathId],
    requestAuthorityHash,
    sourceHash: finalInventory.sourceHash,
    testNames: [performanceTestName],
  });
  return createToolcraftDeliveryReceipt({
    functionalProofModel: model,
    plan,
    result: {
      evidence: plan.steps.map((step) =>
        step.kind === "browser-performance"
          ? {
              ...step,
              evidenceHash: createToolcraftTargetedPerformanceEvidenceHash({
                report,
                testEvidence,
              }),
              report,
              testEvidence,
            }
          : { ...step }
      ),
      finalInventory,
    },
  });
}

function createCompatibleReceipt(
  previousReceipt,
  requestMarker,
  inventoryCharacter,
) {
  const previousAnchor =
    normalizeToolcraftDeliveryAnchor(previousReceipt);
  const finalInventory = createInventory({
    "src/app/app-schema.ts": hash(inventoryCharacter),
  });
  const previousEvidence = previousReceipt.evidence.at(-1);
  const previousPerformanceStep = previousReceipt.plan.steps.find(
    ({ kind }) => kind === "browser-performance",
  );
  const previousFunctionalStep = previousReceipt.plan.steps.find(
    ({ kind }) => kind === "browser-functional",
  );
  const authority = requestAuthority(
    `Delivery ${requestMarker} - Slow preview`,
    `The preview is still slow after ${requestMarker}.`,
  );
  const requestAuthorityHash = authority.hash;
  const report = createToolcraftTargetedPerformanceReport({
    ...previousEvidence.report,
    requestAuthorityHash,
    sourceHash: finalInventory.sourceHash,
  });
  const evidenceHash = createToolcraftTargetedPerformanceEvidenceHash({
    report,
    testEvidence: previousEvidence.testEvidence,
  });
  const catalog = deliveryCatalog(
    previousFunctionalStep.testNames[0],
  );
  const model = previousReceipt.functionalProofModel;
  const plan = createToolcraftDeliveryPlan({
    allProductTestFiles: ["src/app/app-schema.test.ts"],
    authority,
    catalog,
    changeSet: {
      dependencyChanged: false,
      docsChanged: false,
      frameworkChanged: false,
      impact: {
        acceptanceIds: ["output.updates"],
        browserTestNames: previousFunctionalStep.testNames,
        buildRequired: true,
        performanceCandidates: {
          passIds: previousPerformanceStep.passIds,
          pathIds: previousPerformanceStep.pathIds,
          testNames: previousPerformanceStep.testNames,
        },
        productTestFiles: [],
      },
      platformChanged: false,
      productInputsChanged: true,
    },
    comparisonInventory: {
      entries: previousReceipt.files,
      sourceHash: previousReceipt.sourceHash,
    },
    currentFunctionalProofModel: model,
    currentInventory: finalInventory,
    integrity: {
      manifestHash: previousReceipt.manifestHash,
      sourceHash: finalInventory.sourceHash,
    },
    packageManager: "pnpm",
    previousFunctionalProofModel:
      previousAnchor.functionalProofModel,
    previousLifecycle: previousAnchor.lifecycle,
    previousPerformance: previousAnchor.performance,
  });
  return createToolcraftDeliveryReceipt({
    functionalProofModel: model,
    plan,
    result: {
      evidence: plan.steps.map((step) =>
        step.kind === "browser-performance"
          ? {
              ...step,
              evidenceHash,
              report,
              testEvidence: previousEvidence.testEvidence,
            }
          : { ...step }
      ),
      finalInventory,
    },
  });
}

function createCompatiblePair() {
  const firstReceipt = createFirstPlannerReceipt();
  const previousAnchor = normalizeToolcraftDeliveryAnchor(firstReceipt);
  const currentReceipt = createCompatibleReceipt(
    firstReceipt,
    "2",
    "3",
  );
  return { currentReceipt, previousAnchor };
}

test("does not recommend a full audit after the first performance iteration", () => {
  const currentReceipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
  const previousAnchor = normalizeToolcraftDeliveryAnchor(
    createToolcraftDeliveryReceipt(createPlanReceiptFixture("functional-changed")),
  );
  assert.equal(
    getToolcraftPerformanceEscalationRecommendation({
      currentReceipt,
      previousAnchor,
    }),
    null,
  );
});

test("recommends but never invokes a full audit after two compatible iterations", () => {
  const pair = createCompatiblePair();
  assert.deepEqual(
    getToolcraftPerformanceEscalationRecommendation(pair),
    expectedRecommendation,
  );
  const message = formatToolcraftPerformanceEscalationRecommendation(
    expectedRecommendation,
  );
  assert.match(message, /offer.*complete performance audit/iu);
  assert.match(
    message,
    new RegExp(
      `do not run ${TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND.replace(
        /[.*+?^${}()|[\]\\]/gu,
        "\\$&",
      )} without explicit user consent`,
      "iu",
    ),
  );
  assert.equal(
    Object.hasOwn(expectedRecommendation, "execute"),
    false,
  );
});

test("three compatible iterations produce exactly one durable offer", () => {
  const second = createCompatiblePair();
  const thirdReceipt = createCompatibleReceipt(
    second.currentReceipt,
    "3",
    "4",
  );
  const third = {
    currentReceipt: thirdReceipt,
    previousAnchor: normalizeToolcraftDeliveryAnchor(
      second.currentReceipt,
    ),
  };

  assert.equal(
    second.previousAnchor.lifecycle.performanceEscalationOffered,
    false,
  );
  assert.equal(
    second.currentReceipt.plan.lifecycle.performanceEscalationOffered,
    true,
  );
  assert.equal(
    third.currentReceipt.plan.lifecycle.performanceEscalationOffered,
    true,
  );
  assert.deepEqual(
    getToolcraftPerformanceEscalationRecommendation(second),
    expectedRecommendation,
  );
  assert.equal(
    getToolcraftPerformanceEscalationRecommendation(third),
    null,
  );
});

test("rejects an evidence hash in place of the previous comparison hash", () => {
  const { currentReceipt, previousAnchor } = createCompatiblePair();
  const evidenceHash = createToolcraftTargetedPerformanceEvidenceHash({
    report: previousAnchor.performance.report,
    testEvidence: currentReceipt.evidence.at(-1).testEvidence,
  });
  assert.equal(
    getToolcraftPerformanceEscalationRecommendation({
      currentReceipt,
      previousAnchor: {
        ...previousAnchor,
        performance: {
          ...previousAnchor.performance,
          comparisonHash: evidenceHash,
        },
      },
    }),
    null,
  );
});

test("rejects malformed current receipts without interpreting legacy policy", () => {
  const { previousAnchor } = createCompatiblePair();
  assert.equal(
    getToolcraftPerformanceEscalationRecommendation({
      currentReceipt: { version: 4 },
      previousAnchor,
    }),
    null,
  );
});
