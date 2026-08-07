import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeliveryFixture,
  functionalTestName,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";
import {
  assertDeliveryCheckpointState,
} from "./toolcraft-checkpoint-delivery-state.mjs";
import {
  commitToolcraftDeliveryCheckpoint,
} from "./toolcraft-checkpoint-transaction.mjs";
import {
  executeToolcraftDeliveryPlan,
} from "./toolcraft-delivery-executor.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createInventory,
  createFunctionalProofModelFixture,
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

const hash = (character) => character.repeat(64);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function createStateFixtures() {
  const changedFixture = createPlanReceiptFixture("functional-changed");
  const comparisonInventory =
    changedFixture.plan.basis.comparisonInventory;
  const initialFixture = createPlanReceiptFixture("functional-initial");
  const previousPlan = deepFreeze({
    ...initialFixture.plan,
    sourceHash: comparisonInventory.sourceHash,
  });
  const previousReceipt = createToolcraftDeliveryReceipt({
    functionalProofModel: initialFixture.functionalProofModel,
    plan: previousPlan,
    result: {
      ...initialFixture.result,
      finalInventory: comparisonInventory,
    },
  });
  return {
    changedFixture,
    changedReceipt: createToolcraftDeliveryReceipt(changedFixture),
    initialFixture,
    initialReceipt: createToolcraftDeliveryReceipt(initialFixture),
    previousReceipt,
  };
}

async function executeInitialFixture(rootDir) {
  const finalInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const functionalSteps = [
    { kind: "docs" },
    { kind: "code-health" },
    {
      files: ["src/app/schema.test.ts"],
      kind: "product-tests",
    },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: [functionalTestName],
    },
  ];
  const common = {
    basis: { kind: "initial" },
    manifestHash: finalInventory.entries.find(
      ({ path }) =>
        path === "src/toolcraft/.toolcraft-manifest.json",
    ).sha256,
    sourceHash: finalInventory.sourceHash,
  };
  const functionalProofModel = createFunctionalProofModelFixture();
  const plan = deepFreeze({
    ...common,
    functionalProofModelHash:
      createToolcraftFunctionalProofModelHash(functionalProofModel),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    steps: functionalSteps,
  });
  const execution = await executeToolcraftDeliveryPlan({
    plan,
    projectDir: rootDir,
  });
  return {
    execution,
    receipt: createToolcraftDeliveryReceipt({
      functionalProofModel,
      plan,
      result: execution,
    }),
  };
}

test("genuinely absent previous receipt permits an initial basis", async () => {
  const { initialFixture, initialReceipt } = createStateFixtures();
  await assert.doesNotReject(assertDeliveryCheckpointState({
    deliveryReceipt: initialReceipt,
    finalInventory: initialFixture.result.finalInventory,
    previousDeliveryReceipt: undefined,
  }));
});

test("real initial functional delivery commits only without a predecessor", async (t) => {
  const freshRoot = createDeliveryFixture();
  const existingRoot = createDeliveryFixture();
  t.after(() => {
    removeDeliveryFixture(freshRoot);
    removeDeliveryFixture(existingRoot);
  });

  const fresh = await executeInitialFixture(freshRoot);
  await assert.doesNotReject(
    assertDeliveryCheckpointState({
      deliveryReceipt: fresh.receipt,
      finalInventory: fresh.execution.finalInventory,
      previousDeliveryReceipt: undefined,
    }),
  );
  await assert.doesNotReject(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: fresh.receipt,
      finalInventory: fresh.execution.finalInventory,
      planExecutionAuthority:
        fresh.execution.planExecutionAuthority,
      projectDir: freshRoot,
    }),
  );

  const previous = await executeInitialFixture(existingRoot);
  await commitToolcraftDeliveryCheckpoint({
    deliveryReceipt: previous.receipt,
    finalInventory: previous.execution.finalInventory,
    planExecutionAuthority:
      previous.execution.planExecutionAuthority,
    projectDir: existingRoot,
  });
  const rejected = await executeInitialFixture(existingRoot);
  await assert.rejects(
    assertDeliveryCheckpointState({
      deliveryReceipt: rejected.receipt,
      finalInventory: rejected.execution.finalInventory,
      previousDeliveryReceipt: previous.receipt,
    }),
    /initial delivery basis requires no previous/iu,
  );
  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: rejected.receipt,
      finalInventory: rejected.execution.finalInventory,
      planExecutionAuthority:
        rejected.execution.planExecutionAuthority,
      projectDir: existingRoot,
    }),
    /initial delivery basis requires no previous/iu,
  );
});

test("present malformed, unsupported, and legacy receipts fail closed", async () => {
  const {
    initialFixture,
    initialReceipt,
    previousReceipt,
  } = createStateFixtures();
  const legacyPlan = deepFreeze({
    ...previousReceipt.plan,
    kind: "legacy-delivery",
  });
  for (const [previousDeliveryReceipt, expected] of [
    [{ version: 5 }, /unsupported version/iu],
    [{ version: 6 }, /unsupported version/iu],
    [{ ...previousReceipt, plan: legacyPlan }, /delivery plan is malformed/iu],
  ]) {
    await assert.rejects(
      assertDeliveryCheckpointState({
        deliveryReceipt: initialReceipt,
        finalInventory: initialFixture.result.finalInventory,
        previousDeliveryReceipt,
      }),
      (error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /initial delivery basis/iu);
        return true;
      },
    );
  }
});

test("a valid current previous receipt requires an exact changed basis", async () => {
  const {
    changedFixture,
    changedReceipt,
    initialFixture,
    initialReceipt,
    previousReceipt,
  } = createStateFixtures();
  await assert.doesNotReject(assertDeliveryCheckpointState({
    deliveryReceipt: changedReceipt,
    finalInventory: changedFixture.result.finalInventory,
    previousDeliveryReceipt: previousReceipt,
  }));
  await assert.rejects(
    assertDeliveryCheckpointState({
      deliveryReceipt: initialReceipt,
      finalInventory: initialFixture.result.finalInventory,
      previousDeliveryReceipt: previousReceipt,
    }),
    /initial delivery basis requires no previous/iu,
  );

  const mismatchedComparison = createInventory({
    "src/app/app-schema.ts": hash("9"),
  });
  const mismatchedPlan = deepFreeze({
    ...changedFixture.plan,
    basis: {
      ...changedFixture.plan.basis,
      comparisonInventory: mismatchedComparison,
    },
  });
  const mismatchedReceipt = createToolcraftDeliveryReceipt({
    functionalProofModel: changedFixture.functionalProofModel,
    plan: mismatchedPlan,
    result: changedFixture.result,
  });
  await assert.rejects(
    assertDeliveryCheckpointState({
      deliveryReceipt: mismatchedReceipt,
      finalInventory: changedFixture.result.finalInventory,
      previousDeliveryReceipt: previousReceipt,
    }),
    /changed delivery basis must match/iu,
  );

  const wrongPreviousModelPlan = deepFreeze({
    ...changedFixture.plan,
    basis: {
      ...changedFixture.plan.basis,
      comparisonFunctionalProofModelHash: hash("f"),
    },
  });
  const wrongPreviousModelReceipt = createToolcraftDeliveryReceipt({
    functionalProofModel: changedFixture.functionalProofModel,
    plan: wrongPreviousModelPlan,
    result: changedFixture.result,
  });
  await assert.rejects(
    assertDeliveryCheckpointState({
      deliveryReceipt: wrongPreviousModelReceipt,
      finalInventory: changedFixture.result.finalInventory,
      previousDeliveryReceipt: previousReceipt,
    }),
    /previous functional proof model|immediately previous/iu,
  );
});
