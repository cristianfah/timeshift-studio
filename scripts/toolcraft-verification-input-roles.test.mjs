import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";
import {
  classifyToolcraftVerificationInputRoles,
  toolcraftVerificationInputRootFamilies,
} from "./toolcraft-verification-input-roles.mjs";

async function writeFixture(
  t,
  familyName = "generated",
  extraFiles = {},
) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-verification-roles-"),
  );
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const family = toolcraftVerificationInputRootFamilies[familyName];
  const files = {
    [family.compositionPath]:
      "import '../features/output.tsx'; import '../features/shared.ts';\n",
    [family.schemaPath]: "export const schema = true;\n",
    [family.acceptanceDataPath]:
      "import './acceptance/reference.ts'; import '../features/shared.ts';\n",
    [family.performancePath]:
      "import './performance/reference.ts';\n",
    [family.impactInventoryPath]: "{\"owners\":[],\"version\":3}\n",
    "src/app/acceptance/reference.ts": "export const acceptance = true;\n",
    "src/app/performance/reference.ts": "export const performance = true;\n",
    "src/features/output.tsx":
      "import './shared.ts'; import './surface.module.css'; export const output = true;\n",
    "src/features/shared.ts": "export const shared = true;\n",
    "src/features/surface.module.css":
      ".surface { background: url('./material.png'); }\n",
    "src/features/material.png": "texture\n",
    "src/features/output.test.tsx":
      "import './test-utils.ts'; import './output.tsx';\n",
    "src/features/test-utils.ts": "export const support = true;\n",
    "e2e/product-material.spec.ts":
      "import './shared-browser-helper.ts';\n",
    "e2e/shared-browser-helper.ts": "export const browser = true;\n",
    "public/material.glb": "model\n",
    ...extraFiles,
  };
  for (const [repoPath, contents] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, repoPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }
  const sourceInventory = await collectToolcraftSourceInventory({
    includeResourceFiles: true,
    rootDir,
    sourceRoots: ["src", "e2e", "public"],
  });
  const graph = await createToolcraftLocalDependencyGraph({
    aliases: [
      { prefix: "@/", replacement: path.join(rootDir, "src") },
      { prefix: "#/", replacement: path.join(rootDir, "src") },
    ],
    entries: sourceInventory.entries,
    rootDir,
  });
  return { graph, rootDir, sourceInventory };
}

function normalizeFamilyPaths(paths, family) {
  const labelsByPath = new Map([
    [family.acceptanceDataPath, "root:acceptance-data"],
    [family.compositionPath, "root:composition"],
    [family.impactInventoryPath, "root:verification-impact"],
    [family.performancePath, "root:performance"],
    [family.schemaPath, "root:schema"],
  ]);
  return paths.map((repoPath) => labelsByPath.get(repoPath) ?? repoPath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("classifies runtime, proof, tests, support, and resources from one graph", async (t) => {
  const { graph } = await writeFixture(t);
  const roles = classifyToolcraftVerificationInputRoles(graph);

  assert.equal(roles.rootFamily, "generated");
  assert.equal(
    roles.roleByPath["src/features/output.tsx"],
    "runtime-production",
  );
  assert.equal(
    roles.roleByPath["src/app/acceptance/reference.ts"],
    "proof-model",
  );
  assert.equal(
    roles.roleByPath["src/app/performance/reference.ts"],
    "proof-model",
  );
  assert.equal(
    roles.roleByPath["src/features/shared.ts"],
    "runtime-production",
  );
  assert.equal(
    roles.roleByPath["src/features/output.test.tsx"],
    "product-test",
  );
  assert.equal(
    roles.roleByPath["src/features/test-utils.ts"],
    "product-test",
  );
  assert.equal(
    roles.roleByPath["e2e/product-material.spec.ts"],
    "product-test",
  );
  assert.equal(
    roles.roleByPath["e2e/shared-browser-helper.ts"],
    "product-test",
  );
  for (const resourcePath of [
    "public/material.glb",
    "src/features/material.png",
    "src/features/surface.module.css",
  ]) {
    assert.equal(roles.roleByPath[resourcePath], "product-resource");
  }
  assert.equal(
    roles.roleByPath["src/app/app-verification-impact.json"],
    "proof-model",
  );
  assert.deepEqual(roles.semanticProofRootPaths, [
    "src/app/app-acceptance-data.ts",
    "src/app/app-performance.ts",
    "src/app/app-verification-impact.json",
  ]);
  assert.equal(Object.isFrozen(roles), true);
  assert.equal(Object.isFrozen(roles.roleByPath), true);
  assert.equal(Object.isFrozen(roles.runtimeProductionPaths), true);
  assert.equal(Object.isFrozen(roles.semanticProofRootPaths), true);
});

test("classifies starter and generated canonical families identically", async (t) => {
  const generated = classifyToolcraftVerificationInputRoles(
    (await writeFixture(t, "generated")).graph,
  );
  const starter = classifyToolcraftVerificationInputRoles(
    (await writeFixture(t, "starter")).graph,
  );
  const families = toolcraftVerificationInputRootFamilies;

  assert.equal(starter.rootFamily, "starter");
  for (const key of [
    "runtimeProductionPaths",
    "proofModelPaths",
    "productTestPaths",
    "productResourcePaths",
    "semanticProofRootPaths",
  ]) {
    assert.deepEqual(
      normalizeFamilyPaths(starter[key], families.starter).sort(),
      normalizeFamilyPaths(generated[key], families.generated).sort(),
    );
  }
});

test("rejects partial and mixed root families with exact paths", async (t) => {
  const partial = await writeFixture(t);
  const families = toolcraftVerificationInputRootFamilies;
  await fs.rm(path.join(partial.rootDir, families.generated.performancePath));
  const partialInventory = await collectToolcraftSourceInventory({
    includeResourceFiles: true,
    rootDir: partial.rootDir,
    sourceRoots: ["src", "e2e", "public"],
  });
  const partialGraph = await createToolcraftLocalDependencyGraph({
    entries: partialInventory.entries,
    rootDir: partial.rootDir,
  });
  assert.throws(
    () => classifyToolcraftVerificationInputRoles(partialGraph),
    new RegExp(
      `partial.*${escapeRegExp(families.generated.performancePath)}`,
      "iu",
    ),
  );

  const mixed = await writeFixture(t, "generated", {
    [families.starter.compositionPath]:
      "export const mixed = true;\n",
  });
  assert.throws(
    () => classifyToolcraftVerificationInputRoles(mixed.graph),
    new RegExp(
      `mixed.*${escapeRegExp(families.starter.compositionPath)}`,
      "iu",
    ),
  );
});

test("rejects an orphan product production module by exact path", async (t) => {
  const { graph } = await writeFixture(t, "generated", {
    "src/features/orphan.ts": "export const orphan = true;\n",
  });
  assert.throws(
    () => classifyToolcraftVerificationInputRoles(graph),
    /orphaned product production module "src\/features\/orphan\.ts"/iu,
  );
});

test("rejects production code reachable only from product tests", async (t) => {
  const { graph } = await writeFixture(t, "generated", {
    "src/features/orphan-module.ts":
      "export const testOnlyProduction = true;\n",
    "src/features/output.test.tsx":
      "import './test-utils.ts'; import './orphan-module.ts';\n",
  });

  assert.throws(
    () => classifyToolcraftVerificationInputRoles(graph),
    /orphaned product production module "src\/features\/orphan-module\.ts"/iu,
  );
});
