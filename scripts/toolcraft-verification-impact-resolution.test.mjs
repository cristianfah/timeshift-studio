import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  resolveToolcraftChangedVerificationImpact,
} from "./toolcraft-verification-impact.mjs";
import {
  toolcraftVerificationInputRootFamilies,
} from "./toolcraft-verification-input-roles.mjs";

const hash = (value) => value.repeat(64);
const catalog = Object.freeze({
  acceptance: Object.freeze([
    Object.freeze({
      acceptanceId: "appearance.background",
      contractHash: hash("a"),
      domainId: "appearance",
      file: "app-appearance.spec.ts",
      testName: "browser: background",
    }),
    Object.freeze({
      acceptanceId: "persistence.reload",
      contractHash: hash("b"),
      domainId: "persistence",
      file: "app-persistence.spec.ts",
      testName: "browser: persistence",
    }),
  ]),
  performance: Object.freeze([]),
  version: 2,
});

function createModel(owners) {
  return createToolcraftFunctionalProofModel({
    catalog,
    inventory: { owners, version: 3 },
  });
}

function graph(entries, reverse = {}) {
  return Object.freeze({
    entries: Object.freeze(entries),
    reverse: new Map(
      entries.map(({ repoPath }) => [
        repoPath,
        Object.freeze([...(reverse[repoPath] ?? [])]),
      ]),
    ),
  });
}

function roles(roleByPath) {
  return Object.freeze({
    impactInventoryPath: "src/app/app-verification-impact.json",
    productResourcePaths: Object.freeze([]),
    productTestPaths: Object.freeze([]),
    proofModelPaths: Object.freeze([]),
    roleByPath: Object.freeze({ ...roleByPath }),
    rootFamily: "generated",
    runtimeProductionPaths: Object.freeze([]),
    semanticProofRootPaths:
      toolcraftVerificationInputRootFamilies.generated
        .semanticProofRootPaths,
  });
}

function resolve({
  changedFiles,
  currentOwners,
  entries,
  previousOwners = currentOwners,
  reverse,
  roleByPath,
}) {
  return resolveToolcraftChangedVerificationImpact({
    catalog,
    changedFiles,
    currentModel: createModel(currentOwners),
    graph: graph(entries, reverse),
    previousModel: createModel(previousOwners),
    roles: roles(roleByPath),
  });
}

test("runtime ownership and affected Vitest are selected without browser reverse widening", () => {
  const runtimePath = "src/features/output.tsx";
  const unitPath = "src/features/output.test.tsx";
  const unrelatedBrowserPath = "e2e/app-persistence.spec.ts";
  const owner = {
    acceptanceIds: ["appearance.background"],
    kind: "functional",
    path: runtimePath,
  };
  const result = resolve({
    changedFiles: [runtimePath],
    currentOwners: [owner],
    entries: [
      { owner: "product", repoPath: runtimePath, role: "production" },
      { owner: "product", repoPath: unitPath, role: "test" },
      {
        owner: "product",
        repoPath: unrelatedBrowserPath,
        role: "test",
      },
    ],
    reverse: {
      [runtimePath]: [unitPath, unrelatedBrowserPath],
    },
    roleByPath: { [runtimePath]: "runtime-production" },
  });

  assert.deepEqual(result, {
    acceptanceIds: ["appearance.background"],
    browserTestNames: ["browser: background"],
    buildRequired: true,
    performanceCandidates: {
      passIds: [],
      pathIds: [],
      testNames: [],
    },
    productTestFiles: [unitPath],
  });
  assert.equal(
    result.browserTestNames.includes("browser: persistence"),
    false,
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.performanceCandidates), true);
});

test("an additive runtime owner delta preserves all direct-owner proof", () => {
  const runtimePath = "src/features/output.tsx";
  const baseOwner = {
    acceptanceIds: ["appearance.background"],
    kind: "functional",
    path: runtimePath,
  };
  const result = resolve({
    changedFiles: [runtimePath],
    currentOwners: [{
      ...baseOwner,
      acceptanceIds: ["appearance.background", "persistence.reload"],
    }],
    entries: [{
      owner: "product",
      repoPath: runtimePath,
      role: "production",
    }],
    previousOwners: [baseOwner],
    roleByPath: { [runtimePath]: "runtime-production" },
  });

  assert.deepEqual(result.acceptanceIds, [
    "appearance.background",
    "persistence.reload",
  ]);
  assert.deepEqual(result.browserTestNames, [
    "browser: background",
    "browser: persistence",
  ]);
});

test("a changed Vitest file selects itself without build or browser proof", () => {
  const unitPath = "src/features/output.test.tsx";
  const result = resolve({
    changedFiles: [unitPath],
    currentOwners: [],
    entries: [{ owner: "product", repoPath: unitPath, role: "test" }],
    roleByPath: { [unitPath]: "product-test" },
  });

  assert.deepEqual(result, {
    acceptanceIds: [],
    browserTestNames: [],
    buildRequired: false,
    performanceCandidates: {
      passIds: [],
      pathIds: [],
      testNames: [],
    },
    productTestFiles: [unitPath],
  });
});

test("unrecognized changed inputs fail instead of widening", () => {
  assert.throws(
    () =>
      resolve({
        changedFiles: ["arbitrary.txt"],
        currentOwners: [],
        entries: [],
        roleByPath: {},
      }),
    /arbitrary\.txt/u,
  );
});

test("changed paths are canonicalized and deduplicated", () => {
  const runtimePath = "src/features/output.tsx";
  const owner = {
    acceptanceIds: ["appearance.background"],
    kind: "functional",
    path: runtimePath,
  };
  const result = resolve({
    changedFiles: [`./${runtimePath}`, runtimePath],
    currentOwners: [owner],
    entries: [{
      owner: "product",
      repoPath: runtimePath,
      role: "production",
    }],
    roleByPath: { [runtimePath]: "runtime-production" },
  });
  assert.deepEqual(result.acceptanceIds, ["appearance.background"]);
});

test("dedicated additive browser proof stays exact while shared proof widens", () => {
  const accentPath = "e2e/product-appearance-accent.spec.ts";
  const backgroundPath = "e2e/app-appearance.spec.ts";
  const dedicatedHelper = "e2e/test-support/accent-fixture.ts";
  const sharedHelper = "e2e/test-support/shared-appearance-fixture.ts";
  const currentCatalog = Object.freeze({
    ...catalog,
    acceptance: Object.freeze([
      Object.freeze({
        acceptanceId: "appearance.accent",
        contractHash: hash("c"),
        domainId: "appearance",
        file: "product-appearance-accent.spec.ts",
        testName: "browser: accent",
      }),
      ...catalog.acceptance,
    ]),
  });
  const createEmptyModel = (deliveryCatalog) =>
    createToolcraftFunctionalProofModel({
      catalog: deliveryCatalog,
      inventory: { owners: [], version: 3 },
    });
  const exact = ["appearance.accent"];
  for (const [changedPath, paths, reverse, expected] of [
    [accentPath, [accentPath], {}, exact],
    [dedicatedHelper, [accentPath, dedicatedHelper],
      { [dedicatedHelper]: [accentPath] }, exact],
    [sharedHelper, [accentPath, backgroundPath, sharedHelper],
      { [sharedHelper]: [accentPath, backgroundPath] },
      [...exact, "appearance.background"]],
  ]) {
    const entries = paths.map((repoPath) => ({
      owner: "product",
      repoPath,
      role: repoPath.endsWith(".spec.ts") ? "test" : "test-support",
    }));
    const result = resolveToolcraftChangedVerificationImpact({
      catalog: currentCatalog,
      changedFiles: [changedPath],
      currentModel: createEmptyModel(currentCatalog),
      graph: graph(entries, reverse),
      previousModel: createEmptyModel(catalog),
      roles: roles(Object.fromEntries(
        paths.map((repoPath) => [repoPath, "product-test"]),
      )),
    });
    assert.deepEqual(result.acceptanceIds, expected);
  }
});
