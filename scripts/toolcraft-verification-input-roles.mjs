import path from "node:path";

import { getToolcraftReachablePaths } from "./toolcraft-graph-reachability.mjs";
import { toolcraftModuleExtensions } from "./toolcraft-product-dependency-resolution.mjs";

const freeze = (values) => Object.freeze([...values]);
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

export const toolcraftVerificationSourceRoots = freeze([
  "src",
  "e2e",
  "public",
]);

function createRootPath(stem, basename) {
  return `src/app/${stem}-${basename}`;
}

function createRootFamily(name, stem) {
  const acceptanceDataPath = createRootPath(stem, "acceptance-data.ts");
  const compositionPath = createRootPath(stem, "composition.tsx");
  const impactInventoryPath = createRootPath(
    stem,
    "verification-impact.json",
  );
  const performancePath = createRootPath(stem, "performance.ts");
  const schemaPath = createRootPath(stem, "schema.ts");
  const proofRootPaths = freeze([
    acceptanceDataPath,
    performancePath,
  ]);
  return Object.freeze({
    acceptanceDataPath,
    compositionPath,
    impactInventoryPath,
    name,
    performancePath,
    proofRootPaths,
    runtimeRootPaths: freeze([
      compositionPath,
      schemaPath,
    ]),
    schemaPath,
    semanticProofRootPaths: freeze([
      ...proofRootPaths,
      impactInventoryPath,
    ].sort(compareCodeUnits)),
    stem,
  });
}

export const toolcraftVerificationInputRootFamilies = Object.freeze({
  generated: createRootFamily("generated", "app"),
  starter: createRootFamily("starter", "starter"),
});

function allRootPaths(family) {
  return [
    ...family.runtimeRootPaths,
    ...family.semanticProofRootPaths,
  ];
}

function selectRootFamily(entryPaths) {
  const familyPresence = Object.values(toolcraftVerificationInputRootFamilies)
    .map((family) => ({
      family,
      present: allRootPaths(family).filter((repoPath) =>
        entryPaths.has(repoPath),
      ),
    }))
    .filter(({ present }) => present.length > 0);
  if (familyPresence.length > 1) {
    const paths = familyPresence.flatMap(({ present }) => present).sort(
      compareCodeUnits,
    );
    throw new Error(
      `Toolcraft verification input root family is mixed: ${paths.join(", ")}.`,
    );
  }
  if (familyPresence.length === 0) {
    throw new Error(
      "Toolcraft verification input root family is missing.",
    );
  }
  const [{ family, present }] = familyPresence;
  const missing = allRootPaths(family).filter(
    (repoPath) => !entryPaths.has(repoPath),
  );
  if (missing.length > 0) {
    throw new Error(
      `Toolcraft verification input root family "${family.name}" is partial; missing: ${missing.join(", ")}.`,
    );
  }
  return family;
}

function isProductModule(entry) {
  return (
    entry.owner === "product" &&
    toolcraftModuleExtensions.includes(path.posix.extname(entry.repoPath))
  );
}

function isProductProductionModule(entry) {
  return entry.role === "production" && isProductModule(entry);
}

function sortedProductReachable(graph, roots) {
  const entryByPath = new Map(
    graph.entries.map((entry) => [entry.repoPath, entry]),
  );
  return new Set(
    getToolcraftReachablePaths(graph, roots).filter((repoPath) => {
      const entry = entryByPath.get(repoPath);
      return entry && isProductModule(entry);
    }),
  );
}

function addRole(roleByPath, paths, role) {
  for (const repoPath of [...paths].sort(compareCodeUnits)) {
    if (!(repoPath in roleByPath)) roleByPath[repoPath] = role;
  }
}

function pathsForRole(roleByPath, role) {
  return freeze(
    Object.keys(roleByPath)
      .filter((repoPath) => roleByPath[repoPath] === role)
      .sort(compareCodeUnits),
  );
}

export function classifyToolcraftVerificationInputRoles(graph) {
  const entryPaths = new Set(graph.entries.map(({ repoPath }) => repoPath));
  const family = selectRootFamily(entryPaths);
  const runtimeReachable = sortedProductReachable(
    graph,
    family.runtimeRootPaths,
  );
  const proofReachable = sortedProductReachable(
    graph,
    family.proofRootPaths,
  );
  const testRoots = graph.entries
    .filter(
      (entry) =>
        entry.owner === "product" &&
        (entry.role === "test" || entry.role === "test-support"),
    )
    .map(({ repoPath }) => repoPath);
  const testReachable = sortedProductReachable(graph, testRoots);
  const orphan = graph.entries.find(
    (entry) =>
      isProductProductionModule(entry) &&
      !runtimeReachable.has(entry.repoPath) &&
      !proofReachable.has(entry.repoPath),
  );
  if (orphan) {
    throw new Error(
      `Orphaned product production module "${orphan.repoPath}" is reachable from neither runtime nor proof roots.`,
    );
  }
  const roleByPath = Object.create(null);

  addRole(roleByPath, runtimeReachable, "runtime-production");
  addRole(roleByPath, proofReachable, "proof-model");
  roleByPath[family.impactInventoryPath] = "proof-model";
  addRole(roleByPath, testReachable, "product-test");
  for (const entry of graph.entries) {
    if (
      entry.owner === "product" &&
      entry.role === "production" &&
      !toolcraftModuleExtensions.includes(path.posix.extname(entry.repoPath)) &&
      !(entry.repoPath in roleByPath)
    ) {
      roleByPath[entry.repoPath] = "product-resource";
    }
  }

  Object.freeze(roleByPath);
  return Object.freeze({
    impactInventoryPath: family.impactInventoryPath,
    productResourcePaths: pathsForRole(roleByPath, "product-resource"),
    productTestPaths: pathsForRole(roleByPath, "product-test"),
    proofModelPaths: pathsForRole(roleByPath, "proof-model"),
    roleByPath,
    rootFamily: family.name,
    runtimeProductionPaths: pathsForRole(
      roleByPath,
      "runtime-production",
    ),
    semanticProofRootPaths: family.semanticProofRootPaths,
  });
}
