import assert from "node:assert/strict";
import test from "node:test";

import {
  collectToolcraftDeliveryFunctionalContext,
  collectToolcraftDeliveryFunctionalContextCore,
} from "./toolcraft-delivery-functional-context.mjs";
import {
  createToolcraftFunctionalProofModelHash,
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";
import {
  loadToolcraftDeliveryPlanningInputs,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";
import {
  toolcraftVerificationInputRootFamilies,
} from "./toolcraft-verification-input-roles.mjs";
import {
  createDeliveryFixture,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

test("functional context collects each changed-state authority exactly once", async () => {
  const calls = {
    catalog: 0,
    context: 0,
    inventory: 0,
    model: 0,
  };
  const catalog = Object.freeze({
    acceptance: Object.freeze([]),
    performance: Object.freeze([]),
    version: 2,
  });
  const graph = Object.freeze({
    entries: Object.freeze([]),
    forward: new Map(),
    reverse: new Map(),
  });
  const frameworkOwnedPaths = Object.freeze([
    "src/toolcraft/runtime.ts",
  ]);
  const inputRoles = Object.freeze({
    impactInventoryPath: "src/app/app-verification-impact.json",
    productResourcePaths: Object.freeze([]),
    productTestPaths: Object.freeze([]),
    proofModelPaths: Object.freeze([]),
    roleByPath: Object.freeze({}),
    rootFamily: "generated",
    runtimeProductionPaths: Object.freeze([]),
    semanticProofRootPaths:
      toolcraftVerificationInputRootFamilies.generated
        .semanticProofRootPaths,
  });
  const sourceInventory = Object.freeze({
    entries: Object.freeze([]),
    filesystemViolations: Object.freeze([]),
  });
  const inventory = Object.freeze({
    owners: Object.freeze([]),
    version: 3,
  });
  const currentFunctionalProofModel = Object.freeze({
    acceptance: Object.freeze([]),
    owners: Object.freeze([]),
    version: 1,
  });

  const context = await collectToolcraftDeliveryFunctionalContextCore({
    dependencies: Object.freeze({
      collectCatalog: async () => {
        calls.catalog += 1;
        return catalog;
      },
      createFunctionalProofModel: (input) => {
        calls.model += 1;
        assert.equal(input.catalog, catalog);
        assert.equal(input.inventory, inventory);
        return currentFunctionalProofModel;
      },
      createVerificationContext: async () => {
        calls.context += 1;
        return {
          frameworkOwnedPaths,
          graph,
          inputRoles,
          sourceInventory,
        };
      },
      readImpactInventory: async (_projectDir, options) => {
        calls.inventory += 1;
        assert.equal(options.catalog, catalog);
        assert.equal(options.inputRoles, inputRoles);
        return { inventory, path: "/tmp/app-verification-impact.json" };
      },
    }),
    projectDir: "/tmp/toolcraft-functional-context",
  });

  assert.deepEqual(calls, {
    catalog: 1,
    context: 1,
    inventory: 1,
    model: 1,
  });
  assert.deepEqual(Object.keys(context), [
    "catalog",
    "currentFunctionalProofModel",
    "frameworkOwnedPaths",
    "graph",
    "inputRoles",
    "sourceInventory",
    "verificationImpactInventory",
  ]);
  assert.equal(context.catalog, catalog);
  assert.equal(context.currentFunctionalProofModel, currentFunctionalProofModel);
  assert.equal(context.frameworkOwnedPaths, frameworkOwnedPaths);
  assert.equal(context.graph, graph);
  assert.equal(context.inputRoles, inputRoles);
  assert.equal(context.sourceInventory, sourceInventory);
  assert.equal(context.verificationImpactInventory, inventory);
  assert.equal(Object.isFrozen(context), true);
});

test("public functional context builds one valid canonical model", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));

  const context = await collectToolcraftDeliveryFunctionalContext(rootDir);

  assert.equal(
    getToolcraftFunctionalProofModelError(
      context.currentFunctionalProofModel,
    ),
    undefined,
  );
  assert.deepEqual(
    context.currentFunctionalProofModel.acceptance,
    context.catalog.acceptance,
  );
  assert.equal(context.verificationImpactInventory.version, 3);
  assert.equal(context.inputRoles.rootFamily, "generated");
  assert.equal(
    context.sourceInventory.entries.length,
    context.graph.entries.length,
  );
});

test("changed-file classification reuses the immutable context ownership snapshot", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const frameworkOwnedPaths = Object.freeze([
    "src/app/framework-owned.ts",
  ]);
  const model = Object.freeze({
    acceptance: Object.freeze([]),
    owners: Object.freeze([]),
    version: 1,
  });
  const catalog = Object.freeze({
    acceptance: Object.freeze([]),
    performance: Object.freeze([]),
    version: 2,
  });
  const previousEntries = Object.freeze([Object.freeze({
    path: frameworkOwnedPaths[0],
    sha256: "1".repeat(64),
  })]);
  const currentEntries = Object.freeze([Object.freeze({
    path: frameworkOwnedPaths[0],
    sha256: "2".repeat(64),
  })]);
  const currentInventory = Object.freeze({
    entries: currentEntries,
    sourceHash: createToolcraftVerificationSourceHash(currentEntries),
  });
  const functionalContext = Object.freeze({
    catalog,
    currentFunctionalProofModel: model,
    frameworkOwnedPaths,
    graph: Object.freeze({
      entries: Object.freeze([]),
      forward: new Map(),
      reverse: new Map(),
    }),
    inputRoles: Object.freeze({
      roleByPath: Object.freeze({}),
    }),
  });

  const inputs = await loadToolcraftDeliveryPlanningInputs({
    currentInventory,
    functionalContext,
    integrity: Object.freeze({
      manifestHash: "a".repeat(64),
      sourceHash: currentInventory.sourceHash,
    }),
    previous: {
      anchor: {
        files: previousEntries,
        functionalProofModel: model,
        functionalProofModelHash:
          createToolcraftFunctionalProofModelHash(model),
        lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
        performance: { kind: "none" },
        sourceHash:
          createToolcraftVerificationSourceHash(previousEntries),
      },
      receipt: { version: 7 },
    },
    projectDir: rootDir,
  });

  assert.equal(
    functionalContext.frameworkOwnedPaths,
    frameworkOwnedPaths,
  );
  assert.equal(inputs.changeSet.frameworkChanged, true);
  assert.equal(inputs.changeSet.platformChanged, false);
  assert.equal(inputs.changeSet.productInputsChanged, false);
  assert.throws(
    () => frameworkOwnedPaths.push("src/app/forged.ts"),
    /read only|readonly|extensible|frozen/iu,
  );
});
