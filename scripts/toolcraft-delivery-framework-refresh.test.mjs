import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  evaluateToolcraftIntegrity,
} from "./check-toolcraft-integrity.mjs";
import {
  collectToolcraftDeliveryFunctionalContext,
} from "./toolcraft-delivery-functional-context.mjs";
import {
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
  installToolcraftIntegrityFixture,
} from "./toolcraft-integrity-test-utils.mjs";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";
import {
  createDeliveryFixture,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

test("signed framework refresh preserves exact changed product proof", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  await installToolcraftIntegrityFixture(rootDir);
  writeFileSync(
    path.join(rootDir, "docs", "toolcraft", "agent-worklog.md"),
    `# Agent Worklog

## Decision Trail

### Framework refresh
- Request: Update one product setting after regenerating Toolcraft.
- Performance intent: ordinary-product-work
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE}

## Verification
Protected receipts own checks and evidence.
`,
  );
  const manifestPath = path.join(
    rootDir,
    "src",
    "toolcraft",
    ".toolcraft-manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      description: "Previous signed generated framework.",
    }, null, 2)}\n`,
  );
  const comparisonInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const previousIntegrity = await evaluateToolcraftIntegrity({
    inventory: comparisonInventory,
    rootDir,
  });
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      description: "Current signed generated framework.",
    }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "schema.ts"),
    "export const schema = 2;\n",
  );
  const currentInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const integrity = await evaluateToolcraftIntegrity({
    inventory: currentInventory,
    rootDir,
  });
  const functionalContext =
    await collectToolcraftDeliveryFunctionalContext(rootDir);
  const currentModel = functionalContext.currentFunctionalProofModel;
  const inputs = await loadToolcraftDeliveryPlanningInputs({
    currentInventory,
    functionalContext,
    integrity,
    previous: {
      anchor: {
        files: comparisonInventory.entries,
        functionalProofModel: currentModel,
        functionalProofModelHash:
          createToolcraftFunctionalProofModelHash(currentModel),
        lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
        performance: { kind: "none" },
        sourceHash: comparisonInventory.sourceHash,
      },
      receipt: { version: 7 },
    },
    projectDir: rootDir,
  });

  assert.notEqual(integrity.manifestHash, previousIntegrity.manifestHash);
  assert.equal(
    functionalContext.frameworkOwnedPaths.includes(
      "scripts/run-delivery-verification.mjs",
    ),
    true,
  );
  assert.equal(inputs.changeSet.frameworkChanged, true);
  assert.equal(inputs.changeSet.platformChanged, false);
  assert.deepEqual(
    inputs.changeSet.impact.browserTestNames,
    ["browser: focused acceptance"],
  );
  const plan = createToolcraftDeliveryPlan(inputs);
  assert.deepEqual(
    plan.steps.find(({ kind }) => kind === "browser-functional"),
    {
      kind: "browser-functional",
      testNames: ["browser: focused acceptance"],
    },
  );
  assert.equal(
    plan.steps.filter(({ kind }) => kind === "browser-functional").length,
    1,
  );
});
