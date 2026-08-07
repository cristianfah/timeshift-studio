import assert from "node:assert/strict";
import test from "node:test";

import { runToolcraftDeliveryVerification } from "./run-delivery-verification.mjs";
import {
  executeToolcraftDeliveryLifecycleCore,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  assertNoPerformanceAuthority,
  createDeliveryFixture,
  readDeliveryEvents,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

test("no-delta delivery returns the exact previous receipt before expensive work", async () => {
  const previousReceipt = Object.freeze({ kind: "previous-receipt" });
  const currentInventory = Object.freeze({
    entries: Object.freeze([]),
    sourceHash: "a".repeat(64),
  });
  const calls = {
    anchorReads: 0,
    commit: 0,
    functionalContexts: 0,
    integrity: 0,
    inventories: 0,
    planner: 0,
    proofExecutions: 0,
  };
  const dependencies = Object.freeze({
    collectInventory: async () => {
      calls.inventories += 1;
      return currentInventory;
    },
    collectFunctionalContext: async () => {
      calls.functionalContexts += 1;
      throw new Error("functional context must not be collected");
    },
    commit: async () => { calls.commit += 1; },
    createPlan: () => { calls.planner += 1; },
    createReceipt: () => { throw new Error("receipt must not be created"); },
    evaluateIntegrity: async () => { calls.integrity += 1; },
    executePlan: async () => { calls.proofExecutions += 1; },
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: async () => {
      throw new Error("planning inputs must not be loaded");
    },
    readDeliveryAnchor: async () => {
      calls.anchorReads += 1;
      return {
        anchor: { sourceHash: currentInventory.sourceHash },
        receipt: previousReceipt,
      };
    },
  });

  const receipt = await executeToolcraftDeliveryLifecycleCore({
    dependencies,
    projectDir: "/tmp/toolcraft-no-delta",
  });

  assert.equal(receipt, previousReceipt);
  assert.deepEqual(calls, {
    anchorReads: 1,
    commit: 0,
    functionalContexts: 0,
    integrity: 0,
    inventories: 1,
    planner: 0,
    proofExecutions: 0,
  });
});

test("public delivery accepts only an optional package-manager separator", async (t) => {
  for (const arguments_ of [
    ["--reason=performance-iteration"],
    ["--unexpected=delivery-policy"],
    ["unexpected-positional-value"],
    ["--", "--unexpected=delivery-policy"],
  ]) {
    const rootDir = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(rootDir));
    await assert.rejects(
      runToolcraftDeliveryVerification({ arguments_, projectDir: rootDir }),
      /does not accept arguments/iu,
    );
    assert.deepEqual(readDeliveryEvents(rootDir), []);
    assertNoPerformanceAuthority(rootDir);
  }

  const separatorRoot = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(separatorRoot));
  await assert.rejects(
    runToolcraftDeliveryVerification({
      arguments_: ["--"],
      projectDir: separatorRoot,
    }),
    /manifest/iu,
  );
});
