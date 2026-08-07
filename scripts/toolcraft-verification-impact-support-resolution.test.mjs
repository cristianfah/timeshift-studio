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
      acceptanceId: "appearance.foreground",
      contractHash: hash("b"),
      domainId: "appearance",
      file: "app-appearance.spec.ts",
      testName: "browser: foreground",
    }),
    Object.freeze({
      acceptanceId: "persistence.reload",
      contractHash: hash("c"),
      domainId: "persistence",
      file: "app-persistence.spec.ts",
      testName: "browser: persistence",
    }),
  ]),
  performance: Object.freeze([]),
  version: 2,
});
const model = createToolcraftFunctionalProofModel({
  catalog,
  inventory: { owners: [], version: 3 },
});

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
    productTestPaths: Object.freeze(Object.keys(roleByPath)),
    proofModelPaths: Object.freeze([]),
    roleByPath: Object.freeze({ ...roleByPath }),
    rootFamily: "generated",
    runtimeProductionPaths: Object.freeze([]),
    semanticProofRootPaths:
      toolcraftVerificationInputRootFamilies.generated
        .semanticProofRootPaths,
  });
}

function resolve({ changedFiles, entries, reverse, roleByPath }) {
  return resolveToolcraftChangedVerificationImpact({
    catalog,
    changedFiles,
    currentModel: model,
    graph: graph(entries, reverse),
    previousModel: model,
    roles: roles(roleByPath),
  });
}

test("a changed browser file selects its current acceptance domain", () => {
  const browserPath = "e2e/app-appearance.spec.ts";
  const result = resolve({
    changedFiles: [browserPath],
    entries: [{ owner: "product", repoPath: browserPath, role: "test" }],
    roleByPath: { [browserPath]: "product-test" },
  });

  assert.deepEqual(result.acceptanceIds, [
    "appearance.background",
    "appearance.foreground",
  ]);
  assert.deepEqual(result.browserTestNames, [
    "browser: background",
    "browser: foreground",
  ]);
  assert.equal(result.buildRequired, true);
});

test("a shared browser helper selects only domains of affected browser files", () => {
  const helperPath = "e2e/test-support/shared-fixture.ts";
  const appearancePath = "e2e/app-appearance.spec.ts";
  const persistencePath = "e2e/app-persistence.spec.ts";
  const unrelatedUnitPath = "src/features/unrelated.test.ts";
  const entries = [
    { owner: "product", repoPath: helperPath, role: "test-support" },
    { owner: "product", repoPath: appearancePath, role: "test" },
    { owner: "product", repoPath: persistencePath, role: "test" },
    { owner: "product", repoPath: unrelatedUnitPath, role: "test" },
  ];
  const roleByPath = {
    [appearancePath]: "product-test",
    [helperPath]: "product-test",
    [persistencePath]: "product-test",
    [unrelatedUnitPath]: "product-test",
  };

  const appearanceOnly = resolve({
    changedFiles: [helperPath],
    entries,
    reverse: { [helperPath]: [appearancePath] },
    roleByPath,
  });
  assert.deepEqual(appearanceOnly.acceptanceIds, [
    "appearance.background",
    "appearance.foreground",
  ]);
  assert.deepEqual(appearanceOnly.productTestFiles, []);

  const bothDomains = resolve({
    changedFiles: [helperPath],
    entries,
    reverse: {
      [helperPath]: [appearancePath, persistencePath],
    },
    roleByPath,
  });
  assert.deepEqual(bothDomains.acceptanceIds, [
    "appearance.background",
    "appearance.foreground",
    "persistence.reload",
  ]);
  assert.equal(
    bothDomains.productTestFiles.includes(unrelatedUnitPath),
    false,
  );
});

test("test support without an executable importer fails with the exact path", () => {
  const currentPath = "src/test-support/current-fixture.ts";
  const deletedPath = "e2e/test-support/deleted-fixture.ts";
  for (const [changedPath, entries, roleByPath] of [
    [
      currentPath,
      [{ owner: "product", repoPath: currentPath, role: "test-support" }],
      { [currentPath]: "product-test" },
    ],
    [deletedPath, [], {}],
  ]) {
    assert.throws(
      () =>
        resolve({
          changedFiles: [changedPath],
          entries,
          roleByPath,
        }),
      new RegExp(changedPath.replaceAll(".", "\\."), "u"),
    );
  }
});

test("a support helper can select affected Vitest without browser widening", () => {
  const helperPath = "src/test-support/unit-fixture.ts";
  const unitPath = "src/features/output.test.ts";
  const result = resolve({
    changedFiles: [helperPath],
    entries: [
      { owner: "product", repoPath: helperPath, role: "test-support" },
      { owner: "product", repoPath: unitPath, role: "test" },
    ],
    reverse: { [helperPath]: [unitPath] },
    roleByPath: {
      [helperPath]: "product-test",
      [unitPath]: "product-test",
    },
  });

  assert.deepEqual(result.productTestFiles, [unitPath]);
  assert.deepEqual(result.browserTestNames, []);
  assert.equal(result.buildRequired, false);
});
