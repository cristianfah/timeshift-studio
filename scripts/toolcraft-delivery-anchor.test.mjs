import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  getToolcraftDeliveryAnchorShapeError,
  normalizeToolcraftDeliveryAnchor,
  readToolcraftDeliveryAnchor,
} from "./toolcraft-delivery-anchor.mjs";
import {
  createPlanReceiptFixture,
  writeDeliveryReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftTargetedPerformanceComparisonHash,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  createReceiptFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";

const forbiddenAnchorKeys = [
  "baselineEvidenceHash",
  "baselineSourceHash",
  "mode",
  "version",
];

function assertClosedAnchor(anchor) {
  assert.equal(Object.isFrozen(anchor), true);
  for (const key of forbiddenAnchorKeys) {
    assert.equal(Object.hasOwn(anchor, key), false);
  }
  assert.deepEqual(Object.keys(anchor).sort(), [
    "files",
    "functionalProofModel",
    "functionalProofModelHash",
    "lifecycle",
    "performance",
    "sourceHash",
  ]);
}

test("normalizes current receipt inventory and lifecycle", () => {
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-changed"),
  );

  const anchor = normalizeToolcraftDeliveryAnchor(receipt);

  assertClosedAnchor(anchor);
  assert.deepEqual(anchor.files, receipt.files);
  assert.equal(anchor.functionalProofModel, receipt.functionalProofModel);
  assert.equal(
    anchor.functionalProofModelHash,
    receipt.functionalProofModelHash,
  );
  assert.deepEqual(anchor.lifecycle, receipt.plan.lifecycle);
  assert.deepEqual(anchor.performance, { kind: "none" });
  assert.equal(anchor.sourceHash, receipt.sourceHash);
});

test("derives a current performance comparison hash from the report alone", () => {
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
  const performanceEvidence = receipt.evidence.find(
    ({ kind }) => kind === "browser-performance",
  );

  const anchor = normalizeToolcraftDeliveryAnchor(receipt);

  assertClosedAnchor(anchor);
  assert.deepEqual(anchor.performance, {
    kind: "performance-iteration-report",
    report: performanceEvidence.report,
    comparisonHash: createToolcraftTargetedPerformanceComparisonHash(
      performanceEvidence.report,
    ),
    requestAuthorityHash: receipt.plan.requestAuthorityHash,
  });
  assert.notEqual(
    anchor.performance.comparisonHash,
    performanceEvidence.evidenceHash,
  );
});

test("rejects obsolete delivery receipt versions 2 through 6", () => {
  for (const version of [2, 3, 4, 5, 6]) {
    assert.throws(
      () => normalizeToolcraftDeliveryAnchor({ version }),
      /unsupported version/iu,
    );
    assert.match(
      getToolcraftDeliveryAnchorShapeError({ version }),
      /unsupported version/iu,
    );
  }
});

test("rejects a current receipt with an obsolete plan version", () => {
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-changed"),
  );

  assert.throws(
    () =>
      normalizeToolcraftDeliveryAnchor({
        ...receipt,
        planVersion: 2,
      }),
    /unsupported|malformed/iu,
  );
});

test("reads a current receipt through the canonical checkpoint bundle", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
  await writeDeliveryReceiptFixture(rootDir, receipt);

  const anchor = normalizeToolcraftDeliveryAnchor(receipt);
  assert.deepEqual(await readToolcraftDeliveryAnchor(rootDir), {
    anchor,
    receipt,
  });
});
