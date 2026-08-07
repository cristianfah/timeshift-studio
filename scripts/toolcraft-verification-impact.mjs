import fs from "node:fs/promises";
import path from "node:path";

import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";
import {
  collectToolcraftFrameworkOwnedLocalPaths,
} from "./toolcraft-source-ownership.mjs";
import {
  createToolcraftLocalDependencyGraph,
} from "./toolcraft-local-dependency-graph.mjs";
import {
  createToolcraftDefaultSourceAliases,
  loadToolcraftLocalModuleAliases,
} from "./toolcraft-product-dependency-resolution.mjs";
import {
  classifyToolcraftVerificationInputRoles,
  toolcraftVerificationSourceRoots,
} from "./toolcraft-verification-input-roles.mjs";
import {
  TOOLCRAFT_VERIFICATION_IMPACT_VERSION,
  validateToolcraftVerificationImpactInventory,
} from "./toolcraft-verification-impact-inventory.mjs";
import {
  resolveToolcraftChangedVerificationImpact,
} from "./toolcraft-verification-impact-resolution.mjs";

export {
  TOOLCRAFT_VERIFICATION_IMPACT_VERSION,
  resolveToolcraftChangedVerificationImpact,
  validateToolcraftVerificationImpactInventory,
};

function createImmutableSourceInventory(sourceInventory) {
  return Object.freeze({
    entries: Object.freeze(
      sourceInventory.entries.map((entry) =>
        Object.freeze({ ...entry }),
      ),
    ),
    filesystemViolations: Object.freeze(
      sourceInventory.filesystemViolations.map((violation) =>
        Object.freeze({ ...violation }),
      ),
    ),
  });
}

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function shouldAnalyzeVerificationEntry({ owner, repoPath, role }) {
  return (
    owner === "product" ||
    role === "test" ||
    role === "test-support" ||
    repoPath.startsWith("src/app/")
  );
}

async function collectProductVerificationSources(
  { collectFrameworkOwnedPaths, collectSourceInventory },
  rootDir,
) {
  const frameworkOwnedPaths = Object.freeze(
    [...new Set(
      await collectFrameworkOwnedPaths(rootDir),
    )].sort(compareCodeUnits),
  );
  const collected = await collectSourceInventory({
    includeResourceFiles: true,
    protectedFilePaths: frameworkOwnedPaths,
    rootDir,
    sourceRoots: toolcraftVerificationSourceRoots,
  });
  const sourceInventory = createImmutableSourceInventory(collected);
  return Object.freeze({ frameworkOwnedPaths, sourceInventory });
}

const defaultSourceDependencies = Object.freeze({
  collectFrameworkOwnedPaths:
    collectToolcraftFrameworkOwnedLocalPaths,
  collectSourceInventory: collectToolcraftSourceInventory,
});

const defaultContextDependencies = Object.freeze({
  ...defaultSourceDependencies,
  classifyInputRoles: classifyToolcraftVerificationInputRoles,
  createDefaultAliases: createToolcraftDefaultSourceAliases,
  createDependencyGraph: createToolcraftLocalDependencyGraph,
  loadAliases: loadToolcraftLocalModuleAliases,
});

export function collectToolcraftProductVerificationSources(rootDir) {
  return collectProductVerificationSources(
    defaultSourceDependencies,
    rootDir,
  );
}

export async function createToolcraftProductVerificationContextCore({
  dependencies,
  rootDir,
}) {
  const { frameworkOwnedPaths, sourceInventory } =
    await collectProductVerificationSources(dependencies, rootDir);
  const configuredAliases = await dependencies.loadAliases({
    rootDir,
    tsconfigPaths: ["tsconfig.json"],
  });
  const graph = await dependencies.createDependencyGraph({
    aliases: [
      ...configuredAliases,
      ...dependencies.createDefaultAliases(rootDir),
    ],
    analyzedEntryPaths: sourceInventory.entries
      .filter(shouldAnalyzeVerificationEntry)
      .map(({ repoPath }) => repoPath),
    entries: sourceInventory.entries,
    rootDir,
    sourceRecordMode: "imports-only",
  });
  const inputRoles = dependencies.classifyInputRoles(graph);
  return Object.freeze({
    frameworkOwnedPaths,
    graph,
    inputRoles,
    sourceInventory,
  });
}

export function createToolcraftProductVerificationContext(rootDir) {
  return createToolcraftProductVerificationContextCore({
    dependencies: defaultContextDependencies,
    rootDir,
  });
}

export async function readToolcraftVerificationImpactInventory(
  rootDir,
  { catalog, inputRoles },
) {
  const inventoryPath = path.join(rootDir, inputRoles.impactInventoryPath);
  let value;
  try {
    value = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        "Toolcraft verification impact inventory is malformed JSON.",
      );
    }
    throw error;
  }
  const requiredOwnerPaths = [
    ...inputRoles.runtimeProductionPaths,
    ...inputRoles.productResourcePaths,
  ];
  const validation = validateToolcraftVerificationImpactInventory(value, {
    catalog,
    requiredOwnerPaths,
  });
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join("\n"));
  }
  return Object.freeze({
    inventory: validation.inventory,
    path: inventoryPath,
  });
}
