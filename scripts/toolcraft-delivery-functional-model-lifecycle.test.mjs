import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  collectToolcraftDeliveryFunctionalContext,
} from "./toolcraft-delivery-functional-context.mjs";
import {
  executeToolcraftDeliveryLifecycleCore,
  loadToolcraftDeliveryPlanningInputs,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  collectToolcraftVerificationInputs,
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";
import {
  createDeliveryFixture,
  functionalTestName,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

const hash = (character) => character.repeat(64);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function comparisonInventory(currentInventory) {
  const entries = currentInventory.entries.map((entry, index) =>
    index === 0 ? { ...entry, sha256: hash("0") } : entry,
  );
  return Object.freeze({
    entries: Object.freeze(entries.map(Object.freeze)),
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
}

function proofCounters() {
  return {
    browserFunctional: 0,
    browserPerformance: 0,
    build: 0,
    codeHealth: 0,
    commit: 0,
    docs: 0,
    productTests: 0,
    receipt: 0,
  };
}

async function expectPlanningFailure({
  collectFunctionalContext,
  currentInventory,
  expected,
  previousContext,
  previousModelHash =
    createToolcraftFunctionalProofModelHash(
      previousContext.currentFunctionalProofModel,
    ),
  rootDir,
}) {
  const calls = proofCounters();
  const comparison = comparisonInventory(currentInventory);
  const dependencies = Object.freeze({
    collectFunctionalContext,
    collectInventory: async () => currentInventory,
    commit: async () => { calls.commit += 1; },
    createPlan: (inputs) => createToolcraftDeliveryPlan(inputs),
    createReceipt: () => {
      calls.receipt += 1;
      throw new Error("receipt must not be created");
    },
    evaluateIntegrity: async () => Object.freeze({
      manifestHash: hash("a"),
      sourceHash: currentInventory.sourceHash,
    }),
    executePlan: async ({ plan }) => {
      for (const step of plan.steps) {
        if (step.kind === "browser-functional") {
          calls.browserFunctional += 1;
        } else if (step.kind === "browser-performance") {
          calls.browserPerformance += 1;
        } else if (step.kind === "build") {
          calls.build += 1;
        } else if (step.kind === "code-health") {
          calls.codeHealth += 1;
        } else if (step.kind === "docs") {
          calls.docs += 1;
        } else if (step.kind === "product-tests") {
          calls.productTests += 1;
        }
      }
      throw new Error("proof must not execute");
    },
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: loadToolcraftDeliveryPlanningInputs,
    readDeliveryAnchor: async () => ({
      anchor: {
        files: comparison.entries,
        functionalProofModel:
          previousContext.currentFunctionalProofModel,
        functionalProofModelHash: previousModelHash,
        lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
        performance: { kind: "none" },
        sourceHash: comparison.sourceHash,
      },
      receipt: { version: 7 },
    }),
  });

  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies,
      projectDir: rootDir,
    }),
    expected,
  );
  assert.deepEqual(calls, proofCounters());
}

test("invalid functional authorities fail before every proof and commit", async (t) => {
  await t.test("new resource without an owner", async (t) => {
    const rootDir = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(rootDir));
    const previousContext =
      await collectToolcraftDeliveryFunctionalContext(rootDir);
    mkdirSync(path.join(rootDir, "public"), { recursive: true });
    writeFileSync(
      path.join(rootDir, "public", "unowned.svg"),
      "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
    );
    await expectPlanningFailure({
      collectFunctionalContext: () =>
        collectToolcraftDeliveryFunctionalContext(rootDir),
      currentInventory: await collectToolcraftVerificationInputs(rootDir),
      expected: /public\/unowned\.svg.*missing/iu,
      previousContext,
      rootDir,
    });
  });

  await t.test("mixed-domain browser catalog file", async (t) => {
    const invalidCatalog = {
      acceptance: [
        {
          acceptanceId: "persistence.reload",
          contractHash: hash("a"),
          domainId: "persistence",
          file: "app-controls.spec.ts",
          testName: functionalTestName,
        },
        {
          acceptanceId: "export.image",
          contractHash: hash("b"),
          domainId: "export",
          file: "app-controls.spec.ts",
          testName: "browser: export image",
        },
      ],
      performance: [],
      version: 2,
    };
    const rootDir = createDeliveryFixture(undefined, invalidCatalog);
    t.after(() => removeDeliveryFixture(rootDir));
    const validRoot = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(validRoot));
    const previousContext =
      await collectToolcraftDeliveryFunctionalContext(validRoot);
    await expectPlanningFailure({
      collectFunctionalContext: () =>
        collectToolcraftDeliveryFunctionalContext(rootDir),
      currentInventory: await collectToolcraftVerificationInputs(rootDir),
      expected: /one acceptance domain/iu,
      previousContext,
      rootDir,
    });
  });

  await t.test("malformed current model hash", async (t) => {
    const rootDir = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(rootDir));
    const previousContext =
      await collectToolcraftDeliveryFunctionalContext(rootDir);
    const malformed = structuredClone(
      previousContext.currentFunctionalProofModel,
    );
    malformed.acceptance[0].contractHash = hash("A");
    const currentContext = Object.freeze({
      ...previousContext,
      currentFunctionalProofModel: deepFreeze(malformed),
    });
    await expectPlanningFailure({
      collectFunctionalContext: async () => currentContext,
      currentInventory: await collectToolcraftVerificationInputs(rootDir),
      expected: /current functional proof model.*hash/iu,
      previousContext,
      rootDir,
    });
  });

  await t.test("previous model hash mismatch", async (t) => {
    const rootDir = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(rootDir));
    const previousContext =
      await collectToolcraftDeliveryFunctionalContext(rootDir);
    await expectPlanningFailure({
      collectFunctionalContext: async () => previousContext,
      currentInventory: await collectToolcraftVerificationInputs(rootDir),
      expected: /previous functional proof model hash/iu,
      previousContext,
      previousModelHash: hash("f"),
      rootDir,
    });
  });

  await t.test("verification impact inventory v2", async (t) => {
    const rootDir = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(rootDir));
    const previousContext =
      await collectToolcraftDeliveryFunctionalContext(rootDir);
    writeFileSync(
      path.join(
        rootDir,
        "src",
        "app",
        "app-verification-impact.json",
      ),
      `${JSON.stringify({ owners: [], version: 2 })}\n`,
    );
    await expectPlanningFailure({
      collectFunctionalContext: () =>
        collectToolcraftDeliveryFunctionalContext(rootDir),
      currentInventory: await collectToolcraftVerificationInputs(rootDir),
      expected: /inventory\.version must be 3/iu,
      previousContext,
      rootDir,
    });
  });
});
