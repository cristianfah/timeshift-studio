import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  TOOLCRAFT_DELIVERY_RECEIPT_VERSION,
  createToolcraftDeliveryReceipt,
  getToolcraftDeliveryReceiptShapeError,
  validateToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createPlanReceiptFixture,
  createFunctionalProofModelFixture,
  writeDeliveryReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import { createReceiptFixture } from "./toolcraft-verification-receipt-test-helpers.mjs";

function assertDeeplyFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(assertDeeplyFrozen);
}

test("constructs the exact deeply frozen version 7 receipt", () => {
  const { functionalProofModel, plan, result } = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result,
  });

  assert.equal(TOOLCRAFT_DELIVERY_RECEIPT_VERSION, 7);
  assert.equal(receipt.planVersion, 4);
  assert.equal(receipt.version, 7);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "completedAt",
    "evidence",
    "files",
    "functionalProofModel",
    "functionalProofModelHash",
    "kind",
    "manifestHash",
    "plan",
    "planHash",
    "planVersion",
    "runner",
    "sourceHash",
    "status",
    "version",
  ]);
  assert.equal(receipt.functionalProofModel, functionalProofModel);
  assert.equal(
    receipt.functionalProofModelHash,
    createToolcraftFunctionalProofModelHash(functionalProofModel),
  );
  assert.equal(receipt.plan, plan);
  assert.deepEqual(receipt.evidence, result.evidence);
  assert.deepEqual(receipt.files, result.finalInventory.entries);
  assert.equal(getToolcraftDeliveryReceiptShapeError(receipt), undefined);
  assertDeeplyFrozen(receipt);
});

test("constructs initial functional proof with exact browser evidence", () => {
  const fixture = createPlanReceiptFixture("functional-initial");
  const receipt = createToolcraftDeliveryReceipt(fixture);

  assert.equal(getToolcraftDeliveryReceiptShapeError(receipt), undefined);
  assert.deepEqual(
    receipt.evidence.at(-1),
    fixture.result.evidence.at(-1),
  );
});

test("rejects obsolete receipt 6 and plan 3 identities", () => {
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-changed"),
  );

  assert.match(
    getToolcraftDeliveryReceiptShapeError({ ...receipt, version: 6 }),
    /malformed|unsupported/iu,
  );
  assert.match(
    getToolcraftDeliveryReceiptShapeError({ ...receipt, planVersion: 3 }),
    /malformed|unsupported/iu,
  );
});

test("validates only the current receipt source and ignores full-performance state", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const { functionalProofModel, plan, result } = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result,
  });
  await writeDeliveryReceiptFixture(rootDir, receipt);

  const bundlePath = `${rootDir}/.toolcraft/verification/checkpoint.json`;
  const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8"));
  bundle.currentPerformance = { malformed: true };
  bundle.performanceBaseline = { malformed: true };
  await fs.writeFile(bundlePath, `${JSON.stringify(bundle)}\n`);

  assert.deepEqual(await validateToolcraftDeliveryReceipt({
    collectInventory: async () => result.finalInventory,
    rootDir,
  }), []);
  assert.deepEqual(await validateToolcraftDeliveryReceipt({
    collectInventory: async () => ({
      ...result.finalInventory,
      sourceHash: "0".repeat(64),
    }),
    rootDir,
  }), ["Toolcraft delivery receipt is stale for the current source."]);
});

test("rejects a different valid model and every model/hash tamper", () => {
  const fixture = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt(fixture);
  const differentModel = createFunctionalProofModelFixture({
    acceptanceId: "export.focused",
    contractHash: "c".repeat(64),
  });
  const differentHash =
    createToolcraftFunctionalProofModelHash(differentModel);
  const changedModel = Object.freeze({
    ...receipt.functionalProofModel,
    acceptance: Object.freeze([
      Object.freeze({
        ...receipt.functionalProofModel.acceptance[0],
        contractHash: "d".repeat(64),
      }),
    ]),
  });

  for (const altered of [
    { ...receipt, functionalProofModel: changedModel },
    { ...receipt, functionalProofModelHash: "0".repeat(64) },
    {
      ...receipt,
      functionalProofModel: differentModel,
      functionalProofModelHash: differentHash,
    },
    {
      ...receipt,
      functionalProofModel: Object.freeze({
        ...receipt.functionalProofModel,
        unexpected: true,
      }),
    },
  ]) {
    assert.match(
      getToolcraftDeliveryReceiptShapeError(altered),
      /functional proof model|model hash|unknown fields|plan/iu,
    );
  }
});

test("creation rejects a model that does not match its plan", () => {
  const fixture = createPlanReceiptFixture();
  const differentModel = createFunctionalProofModelFixture({
    acceptanceId: "export.focused",
    contractHash: "c".repeat(64),
  });
  assert.throws(
    () => createToolcraftDeliveryReceipt({
      ...fixture,
      functionalProofModel: differentModel,
    }),
    /functional proof model|plan/iu,
  );
});

test("rejects excess fields outside the plan-backed receipt model", () => {
  const fixture = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt(fixture);
  for (const extra of [
    { unexpectedAuthority: true },
    { mode: "legacy-delivery" },
    { baselineSourceHash: "a".repeat(64) },
    { baselineEvidenceHash: "b".repeat(64) },
    { checks: ["docs"] },
    { changedFiles: [] },
  ]) {
    assert.match(
      getToolcraftDeliveryReceiptShapeError({ ...receipt, ...extra }),
      /malformed|unsupported fields/iu,
    );
  }
});
