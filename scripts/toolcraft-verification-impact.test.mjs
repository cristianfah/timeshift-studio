import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectToolcraftProductVerificationSources,
  createToolcraftProductVerificationContext,
  createToolcraftProductVerificationContextCore,
  readToolcraftVerificationImpactInventory,
} from "./toolcraft-verification-impact.mjs";

const catalog = {
  acceptance: [
    {
      acceptanceId: "appearance.background",
      contractHash: "a".repeat(64),
      domainId: "appearance",
      file: "app-controls.spec.ts",
      testName: "browser: background",
    },
  ],
  performance: [],
  version: 2,
};

async function createFixture(t, family = "app") {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-verification-impact-"),
  );
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const prefix = family === "app" ? "app-" : "starter-";
  const files = {
    [`src/app/${prefix}composition.tsx`]:
      "import '../features/output.tsx'; export const composition = true;\n",
    [`src/app/${prefix}schema.ts`]: "export const schema = true;\n",
    [`src/app/${prefix}acceptance-data.ts`]:
      "import './acceptance-helper.ts'; export const acceptance = true;\n",
    [`src/app/${prefix}performance.ts`]:
      "export const performance = true;\n",
    "src/app/acceptance-helper.ts": "export const helper = true;\n",
    "src/features/output.tsx": "export const output = true;\n",
  };
  for (const [repoPath, contents] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, repoPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }
  const impactPath =
    `src/app/${prefix}verification-impact.json`;
  await fs.writeFile(
    path.join(rootDir, impactPath),
    JSON.stringify({
      owners: [
        {
          acceptanceIds: ["appearance.background"],
          kind: "functional",
          path: `src/app/${prefix}composition.tsx`,
        },
        {
          acceptanceIds: ["appearance.background"],
          kind: "functional",
          path: `src/app/${prefix}schema.ts`,
        },
        {
          acceptanceIds: ["appearance.background"],
          kind: "functional",
          path: "src/features/output.tsx",
        },
      ],
      version: 3,
    }),
  );
  return rootDir;
}

test("source collection returns graph facts without owner policy guesses", async (t) => {
  const rootDir = await createFixture(t);
  const collected =
    await collectToolcraftProductVerificationSources(rootDir);

  assert.deepEqual(Object.keys(collected), [
    "frameworkOwnedPaths",
    "sourceInventory",
  ]);
  assert.ok(
    collected.sourceInventory.entries.some(
      ({ repoPath }) => repoPath === "src/features/output.tsx",
    ),
  );
  assert.equal(Object.isFrozen(collected), true);
  assert.equal(Object.isFrozen(collected.sourceInventory), true);
  assert.equal(Object.isFrozen(collected.sourceInventory.entries), true);
  assert.equal(
    Object.isFrozen(collected.sourceInventory.entries[0]),
    true,
  );
  assert.equal(
    Object.isFrozen(collected.sourceInventory.filesystemViolations),
    true,
  );
  assert.equal(
    "requiredProductModulePaths" in collected,
    false,
  );
  assert.equal(
    "knownProductResourcePaths" in collected,
    false,
  );
});

test("one immutable framework snapshot drives source and graph classification", async () => {
  const calls = {
    aliases: 0,
    framework: 0,
    graph: 0,
    roles: 0,
    source: 0,
  };
  let sourceProtectedPaths;
  let graphSourceEntry;
  const frameworkSourceEntry = Object.freeze({
    absolutePath: "/tmp/app-schema.ts",
    owner: "framework",
    repoPath: "src/app/app-schema.ts",
    role: "production",
  });
  const productSourceEntry = Object.freeze({
    absolutePath: "/tmp/product-output.ts",
    owner: "product",
    repoPath: "src/product-output.ts",
    role: "production",
  });
  const frameworkTestEntry = Object.freeze({
    absolutePath: "/tmp/framework-output.test.ts",
    owner: "framework",
    repoPath: "src/framework-output.test.ts",
    role: "test",
  });
  const context = await createToolcraftProductVerificationContextCore({
    dependencies: Object.freeze({
      classifyInputRoles: (graph) => {
        calls.roles += 1;
        assert.equal(graph.entries[0], graphSourceEntry);
        return Object.freeze({ rootFamily: "generated" });
      },
      collectFrameworkOwnedPaths: async () => {
        calls.framework += 1;
        return [
          "src/z.ts",
          "src/app/app-schema.ts",
          "src/app/app-schema.ts",
        ];
      },
      collectSourceInventory: async ({ protectedFilePaths }) => {
        calls.source += 1;
        sourceProtectedPaths = protectedFilePaths;
        assert.equal(Object.isFrozen(protectedFilePaths), true);
        assert.deepEqual(protectedFilePaths, [
          "src/app/app-schema.ts",
          "src/z.ts",
        ]);
        return {
          entries: [
            frameworkSourceEntry,
            productSourceEntry,
            frameworkTestEntry,
          ],
          filesystemViolations: [],
        };
      },
      createDefaultAliases: () => [],
      createDependencyGraph: async ({
        analyzedEntryPaths,
        entries,
        sourceRecordMode,
      }) => {
        calls.graph += 1;
        graphSourceEntry = entries[0];
        assert.deepEqual(graphSourceEntry, frameworkSourceEntry);
        assert.deepEqual(analyzedEntryPaths, [
          "src/app/app-schema.ts",
          "src/product-output.ts",
          "src/framework-output.test.ts",
        ]);
        assert.equal(sourceRecordMode, "imports-only");
        return Object.freeze({
          entries: Object.freeze(entries),
          forward: new Map(),
          reverse: new Map(),
        });
      },
      loadAliases: async () => {
        calls.aliases += 1;
        return [];
      },
    }),
    rootDir: "/tmp/toolcraft-framework-snapshot",
  });

  assert.deepEqual(calls, {
    aliases: 1,
    framework: 1,
    graph: 1,
    roles: 1,
    source: 1,
  });
  assert.equal(context.frameworkOwnedPaths, sourceProtectedPaths);
  assert.equal(Object.isFrozen(context.frameworkOwnedPaths), true);
  assert.throws(
    () => context.frameworkOwnedPaths.push("src/forged.ts"),
    /read only|readonly|extensible|frozen/iu,
  );
});

test("builds one graph, derives roles, and reads the selected current inventory", async (t) => {
  const rootDir = await createFixture(t);
  const context = await createToolcraftProductVerificationContext(rootDir);
  const loaded = await readToolcraftVerificationImpactInventory(rootDir, {
    catalog,
    inputRoles: context.inputRoles,
  });

  assert.equal(context.inputRoles.rootFamily, "generated");
  assert.deepEqual(context.inputRoles.runtimeProductionPaths, [
    "src/app/app-composition.tsx",
    "src/app/app-schema.ts",
    "src/features/output.tsx",
  ]);
  assert.equal(
    context.inputRoles.roleByPath[
      "src/app/app-verification-impact.json"
    ],
    "proof-model",
  );
  assert.equal(
    context.inputRoles.roleByPath["src/app/acceptance-helper.ts"],
    "proof-model",
  );
  assert.equal(
    loaded.path,
    path.join(rootDir, "src/app/app-verification-impact.json"),
  );
  assert.equal(
    loaded.inventory.owners.some(
      ({ path: ownerPath }) =>
        ownerPath === "src/app/app-verification-impact.json",
    ),
    false,
  );
  assert.equal(Object.isFrozen(loaded), true);
  const originalPath = context.sourceInventory.entries[0].repoPath;
  assert.throws(
    () => {
      context.sourceInventory.entries[0].repoPath = "src/forged.ts";
    },
    /read only|readonly|Cannot assign/iu,
  );
  assert.equal(context.sourceInventory.entries[0].repoPath, originalPath);
  assert.equal(context.graph.entries[0].repoPath, originalPath);
});

test("does not fall back across root families or legacy filenames", async (t) => {
  const rootDir = await createFixture(t);
  const context = await createToolcraftProductVerificationContext(rootDir);
  await fs.rename(
    path.join(rootDir, "src/app/app-verification-impact.json"),
    path.join(rootDir, "src/app/starter-verification-impact.json"),
  );
  await fs.writeFile(
    path.join(rootDir, "src/app/app-performance-impact.json"),
    "{\"owners\":[],\"version\":3}\n",
  );

  await assert.rejects(
    readToolcraftVerificationImpactInventory(rootDir, {
      catalog,
      inputRoles: context.inputRoles,
    }),
    /ENOENT/u,
  );
});

test("reports malformed selected inventory JSON", async (t) => {
  const rootDir = await createFixture(t, "starter");
  const context = await createToolcraftProductVerificationContext(rootDir);
  await fs.writeFile(
    path.join(rootDir, context.inputRoles.impactInventoryPath),
    "{not-json",
  );

  await assert.rejects(
    readToolcraftVerificationImpactInventory(rootDir, {
      catalog,
      inputRoles: context.inputRoles,
    }),
    /malformed JSON/iu,
  );
});
