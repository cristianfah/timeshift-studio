import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDeliveryFixture,
  readJson,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createFunctionalProofModelFixture,
  createPlanReceiptFixture,
  writeDeliveryReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  normalizeToolcraftDeliveryAnchor,
} from "./toolcraft-delivery-anchor.mjs";
import {
  executeToolcraftDeliveryPlan,
  reserveToolcraftPlanExecutionAuthority,
} from "./toolcraft-delivery-executor.mjs";
import {
  getToolcraftCheckpointBundlePath,
} from "./toolcraft-checkpoint-paths.mjs";
import {
  commitToolcraftDeliveryCheckpoint,
} from "./toolcraft-checkpoint-transaction.mjs";
import {
  collectToolcraftVerificationInputs,
  createToolcraftVerificationSourceHash,
  getToolcraftChangedVerificationFiles,
} from "./toolcraft-verification-inventory.mjs";
import {
  updateRenderer,
} from "./toolcraft-delivery-performance-iteration-test-helpers.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function changedBasis(
  comparisonInventory,
  finalInventory,
  comparisonFunctionalProofModelHash,
) {
  return {
    changedFiles: getToolcraftChangedVerificationFiles(
      comparisonInventory.entries, finalInventory.entries),
    comparisonFunctionalProofModelHash,
    comparisonInventory,
    kind: "changed",
  };
}

async function createDocsExecution(rootDir) {
  const initial = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-initial"),
  );
  await writeDeliveryReceiptFixture(rootDir, initial);
  updateRenderer(rootDir, 2);
  const finalInventory = await collectToolcraftVerificationInputs(rootDir);
  const comparisonInventory = {
    entries: initial.files,
    sourceHash: initial.sourceHash,
  };
  const stored = readJson(getToolcraftCheckpointBundlePath(rootDir)).delivery;
  const anchor = normalizeToolcraftDeliveryAnchor(stored);
  assert.deepEqual(
    anchor.files,
    comparisonInventory.entries,
  );
  assert.equal(
    anchor.sourceHash,
    comparisonInventory.sourceHash,
  );
  const plan = deepFreeze({
    basis: changedBasis(
      comparisonInventory,
      finalInventory,
      anchor.functionalProofModelHash,
    ),
    functionalProofModelHash: anchor.functionalProofModelHash,
    kind: "functional",
    lifecycle: anchor.lifecycle,
    manifestHash: finalInventory.entries.find(
      ({ path }) => path === "src/toolcraft/.toolcraft-manifest.json",
    ).sha256,
    sourceHash: finalInventory.sourceHash,
    steps: [{ kind: "docs" }],
  });
  const execution = await executeToolcraftDeliveryPlan({
    plan,
    projectDir: rootDir,
  });
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel: anchor.functionalProofModel,
    plan,
    result: execution,
  });
  assert.deepEqual(
    receipt.plan.basis.comparisonInventory.entries,
    normalizeToolcraftDeliveryAnchor(stored).files,
  );
  assert.equal(
    receipt.plan.basis.comparisonInventory.sourceHash,
    normalizeToolcraftDeliveryAnchor(stored).sourceHash,
  );
  return { execution, receipt };
}

test("plan authority releases after checkpoint-prepared failure and permits identical retry", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const { execution, receipt } = await createDocsExecution(rootDir);
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  const authorityBefore = readFileSync(bundlePath, "utf8");

  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: receipt,
      finalInventory: execution.finalInventory,
      observeDurabilityBarrier: ({ phase }) => {
        if (phase === "checkpoint-prepared") {
          assert.throws(
            () =>
              reserveToolcraftPlanExecutionAuthority({
                authority: execution.planExecutionAuthority,
                deliveryReceipt: receipt,
                projectDir: rootDir,
              }),
            /protected plan execution authority/iu,
          );
          throw new Error("injected checkpoint-prepared failure");
        }
      },
      planExecutionAuthority: execution.planExecutionAuthority,
      projectDir: rootDir,
    }),
    /injected checkpoint-prepared failure/iu,
  );
  assert.equal(readFileSync(bundlePath, "utf8"), authorityBefore);

  await commitToolcraftDeliveryCheckpoint({
    deliveryReceipt: receipt,
    finalInventory: execution.finalInventory,
    planExecutionAuthority: execution.planExecutionAuthority,
    projectDir: rootDir,
  });
  assert.deepEqual(readJson(bundlePath).delivery, receipt);
});

test("plan authority finalizes when failure occurs after durable commit", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const { execution, receipt } = await createDocsExecution(rootDir);

  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: receipt,
      finalInventory: execution.finalInventory,
      observeDurabilityBarrier: ({ phase }) => {
        if (phase === "checkpoint-committed") {
          throw new Error("injected post-durable failure");
        }
      },
      planExecutionAuthority: execution.planExecutionAuthority,
      projectDir: rootDir,
    }),
    /injected post-durable failure/iu,
  );
  assert.deepEqual(
    readJson(getToolcraftCheckpointBundlePath(rootDir)).delivery,
    receipt,
  );
  assert.throws(
    () =>
      reserveToolcraftPlanExecutionAuthority({
        authority: execution.planExecutionAuthority,
        deliveryReceipt: receipt,
        projectDir: rootDir,
      }),
    /protected plan execution authority/iu,
  );
});

test("checkpoint rejects every lifecycle rollback before mutation", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const initialInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const previousComparisonEntries = initialInventory.entries.map(
    (entry, index) => index === 0
      ? { ...entry, sha256: "0".repeat(64) }
      : entry,
  );
  const previousComparison = {
    entries: previousComparisonEntries,
    sourceHash: createToolcraftVerificationSourceHash(
      previousComparisonEntries,
    ),
  };
  const previousLifecycle = {
    consumedPerformanceRequestAuthorityHashes: [
      "a".repeat(64),
      "b".repeat(64),
    ],
    performanceEscalationOffered: true,
  };
  const functionalProofModel = createFunctionalProofModelFixture();
  const functionalProofModelHash =
    createToolcraftFunctionalProofModelHash(functionalProofModel);
  const previousPlan = deepFreeze({
    basis: changedBasis(
      previousComparison,
      initialInventory,
      functionalProofModelHash,
    ),
    functionalProofModelHash,
    kind: "functional",
    lifecycle: previousLifecycle,
    manifestHash: initialInventory.entries.find(
      ({ path }) => path === "src/toolcraft/.toolcraft-manifest.json",
    ).sha256,
    sourceHash: initialInventory.sourceHash,
    steps: [{ kind: "docs" }],
  });
  const previousReceipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan: previousPlan,
    result: {
      evidence: [{ kind: "docs" }],
      finalInventory: initialInventory,
    },
  });
  await writeDeliveryReceiptFixture(rootDir, previousReceipt);

  updateRenderer(rootDir, 2);
  const finalInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const exactPlan = deepFreeze({
    basis: changedBasis(
      initialInventory,
      finalInventory,
      previousReceipt.functionalProofModelHash,
    ),
    functionalProofModelHash:
      previousReceipt.functionalProofModelHash,
    kind: "functional",
    lifecycle: previousReceipt.plan.lifecycle,
    manifestHash: finalInventory.entries.find(
      ({ path }) => path === "src/toolcraft/.toolcraft-manifest.json",
    ).sha256,
    sourceHash: finalInventory.sourceHash,
    steps: [{ kind: "docs" }],
  });
  const before = readJson(
    getToolcraftCheckpointBundlePath(rootDir),
  );
  const rollbackStates = [
    {
      consumedPerformanceRequestAuthorityHashes: [],
      performanceEscalationOffered: false,
    },
    {
      consumedPerformanceRequestAuthorityHashes:
        previousLifecycle.consumedPerformanceRequestAuthorityHashes,
      performanceEscalationOffered: false,
    },
    {
      consumedPerformanceRequestAuthorityHashes: ["b".repeat(64)],
      performanceEscalationOffered: true,
    },
  ];
  for (const lifecycle of rollbackStates) {
    const plan = deepFreeze({ ...exactPlan, lifecycle });
    const execution = await executeToolcraftDeliveryPlan({
      plan,
      projectDir: rootDir,
    });
    const receipt = createToolcraftDeliveryReceipt({
      functionalProofModel: previousReceipt.functionalProofModel,
      plan,
      result: execution,
    });
    await assert.rejects(
      commitToolcraftDeliveryCheckpoint({
        deliveryReceipt: receipt,
        finalInventory: execution.finalInventory,
        planExecutionAuthority: execution.planExecutionAuthority,
        projectDir: rootDir,
      }),
      /lifecycle.*transition/iu,
    );
    assert.deepEqual(
      readJson(getToolcraftCheckpointBundlePath(rootDir)),
      before,
    );
  }

  const execution = await executeToolcraftDeliveryPlan({
    plan: exactPlan,
    projectDir: rootDir,
  });
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel: previousReceipt.functionalProofModel,
    plan: exactPlan,
    result: execution,
  });
  await commitToolcraftDeliveryCheckpoint({
    deliveryReceipt: receipt,
    finalInventory: execution.finalInventory,
    planExecutionAuthority: execution.planExecutionAuthority,
    projectDir: rootDir,
  });
  assert.deepEqual(
    readJson(getToolcraftCheckpointBundlePath(rootDir)).delivery,
    receipt,
  );
});
