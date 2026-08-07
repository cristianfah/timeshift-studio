import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryReceipt,
  getToolcraftDeliveryReceiptShapeError,
} from "./toolcraft-delivery-receipt.mjs";
import { createToolcraftDeliveryPlanHash } from "./toolcraft-delivery-plan.mjs";
import {
  createInventory,
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";

function errorFor(receipt) {
  return getToolcraftDeliveryReceiptShapeError(receipt) ?? "";
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function createMultiPathReceipt() {
  const fixture = createPlanReceiptFixture();
  const comparisonInventory = createInventory({
    "src/app/app-composition.tsx": "1".repeat(64),
    "src/app/app-schema.ts": "2".repeat(64),
  });
  const finalInventory = createInventory({
    "src/app/app-composition.tsx": "3".repeat(64),
    "src/app/app-schema.ts": "4".repeat(64),
  });
  const plan = deepFreeze({
    ...fixture.plan,
    basis: {
      changedFiles: finalInventory.entries.map(({ path }) => path),
      comparisonFunctionalProofModelHash:
        fixture.plan.basis.comparisonFunctionalProofModelHash,
      comparisonInventory,
      kind: "changed",
    },
    sourceHash: finalInventory.sourceHash,
  });
  return createToolcraftDeliveryReceipt({
    functionalProofModel: fixture.functionalProofModel,
    plan,
    result: { ...fixture.result, finalInventory },
  });
}

function replaceChangedFiles(receipt, changedFiles) {
  const plan = deepFreeze({
    ...receipt.plan,
    basis: { ...receipt.plan.basis, changedFiles },
  });
  return {
    ...receipt,
    plan,
    planHash: createToolcraftDeliveryPlanHash(plan),
  };
}

test("rejects rehashed plans whose changed paths do not match inventory", () => {
  const receipt = createMultiPathReceipt();
  const actual = receipt.plan.basis.changedFiles;
  for (const changedFiles of [
    ["src/app/unrelated.ts"],
    actual.slice(1),
    [...actual, "src/app/unrelated.ts"],
  ]) {
    assert.match(
      errorFor(replaceChangedFiles(receipt, changedFiles)),
      /changed.*(?:inventory|exact|provenance)/iu,
    );
  }
});

test("rejects reordered and noncanonical changed paths before hashing", () => {
  const receipt = createMultiPathReceipt();
  for (const changedFiles of [
    [...receipt.plan.basis.changedFiles].reverse(),
    ["../outside.ts"],
  ]) {
    assert.throws(
      () => replaceChangedFiles(receipt, changedFiles),
      /changed.*provenance/iu,
    );
  }
});

test("rejects altered plan hash, manifest, source, and final inventory", () => {
  const fixture = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt(fixture);
  for (const altered of [
    { ...receipt, planHash: "0".repeat(64) },
    { ...receipt, manifestHash: "0".repeat(64) },
    { ...receipt, sourceHash: "0".repeat(64) },
    {
      ...receipt,
      files: receipt.files.map((entry, index) =>
        index === 0 ? { ...entry, sha256: "f".repeat(64) } : entry),
    },
    {
      ...receipt,
      files: receipt.files.map((entry, index) =>
        index === 0 ? { ...entry, unexpected: true } : entry),
    },
    { ...receipt, files: [...receipt.files, receipt.files[0]] },
  ]) {
    assert.match(
      errorFor(altered),
      /plan hash|manifest|source|inventory|duplicate|canonical/iu,
    );
  }
});

test("rejects missing, excess, duplicate, and unplanned step evidence", () => {
  const fixture = createPlanReceiptFixture("functional-initial");
  const receipt = createToolcraftDeliveryReceipt(fixture);
  const evidenceCases = [
    receipt.evidence.slice(1),
    [...receipt.evidence, { kind: "docs" }],
    [receipt.evidence[0], receipt.evidence[0], ...receipt.evidence.slice(2)],
    receipt.evidence.map((entry, index) =>
      index === 0 ? { kind: "build" } : entry),
    receipt.evidence.map((entry, index) => index === 0 ? null : entry),
  ];
  for (const evidence of evidenceCases) {
    assert.match(
      errorFor({ ...receipt, evidence }),
      /evidence.*exactly match|proof step/iu,
    );
  }
});

test("rejects altered exact proof targets", () => {
  const fixture = createPlanReceiptFixture("functional-initial");
  const receipt = createToolcraftDeliveryReceipt(fixture);
  const evidence = receipt.evidence.map((entry) =>
    entry.kind === "product-tests"
      ? { ...entry, files: ["src/app/unplanned.test.ts"] }
      : entry);
  assert.match(
    errorFor({ ...receipt, evidence }),
    /proof step evidence|exactly match/iu,
  );
});

test("construction rejects a result inventory that does not match its plan", () => {
  const fixture = createPlanReceiptFixture();
  for (const finalInventory of [
    {
      ...fixture.result.finalInventory,
      sourceHash: "0".repeat(64),
    },
    {
      ...fixture.result.finalInventory,
      entries: fixture.result.finalInventory.entries.map((entry, index) =>
        index === 0 ? { ...entry, unexpected: true } : entry),
    },
  ]) {
    assert.throws(
      () => createToolcraftDeliveryReceipt({
        functionalProofModel: fixture.functionalProofModel,
        plan: fixture.plan,
        result: {
          ...fixture.result,
          finalInventory,
        },
      }),
      /inventory|source|evidence|malformed/iu,
    );
  }
});

test("receipt validation recomputes the exact embedded plan hash", () => {
  const fixture = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt(fixture);
  assert.equal(receipt.planHash, createToolcraftDeliveryPlanHash(fixture.plan));
});

test("receipt and model validation reject non-canonical JavaScript structures", () => {
  const fixture = createPlanReceiptFixture();
  const receipt = createToolcraftDeliveryReceipt(fixture);
  const symbolModel = { ...receipt.functionalProofModel };
  symbolModel[Symbol("unexpected")] = true;
  const nonPlainModel = Object.assign(
    Object.create({ inherited: true }),
    receipt.functionalProofModel,
  );
  const nonEnumerableModel = { ...receipt.functionalProofModel };
  Object.defineProperty(nonEnumerableModel, "hidden", { value: true });
  const sparseAcceptance = Array(1);
  const augmentedOwners = [...receipt.functionalProofModel.owners];
  augmentedOwners.extra = true;
  const models = [
    symbolModel,
    nonPlainModel,
    nonEnumerableModel,
    { ...receipt.functionalProofModel, acceptance: sparseAcceptance },
    { ...receipt.functionalProofModel, owners: augmentedOwners },
  ].map(deepFreeze);

  for (const functionalProofModel of models) {
    assert.match(
      errorFor({ ...receipt, functionalProofModel }),
      /functional proof model|canonical JSON|plain object|symbol|array|unknown/iu,
    );
  }

  const symbolReceipt = { ...receipt };
  symbolReceipt[Symbol("unexpected")] = true;
  assert.match(errorFor(symbolReceipt), /malformed|unsupported fields/iu);
  const nonEnumerableReceipt = { ...receipt };
  Object.defineProperty(nonEnumerableReceipt, "hidden", { value: true });
  assert.match(errorFor(nonEnumerableReceipt), /malformed|unsupported fields/iu);
});
