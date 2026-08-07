#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createToolcraftPrivateEvidenceImportViolation } from "./toolcraft-product-evidence-import-policy.mjs";
import { isToolcraftTypeScriptCompilerAvailable } from "./toolcraft-typescript-source-evidence.mjs";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function evaluateToolcraftProductBoundary({
  aliases,
  allowMissingCompiler = false,
  inventory: providedInventory,
  localDependencyGraph: providedLocalDependencyGraph,
  protectedFilePaths,
  rootDir,
} = {}) {
  const resolvedRootDir =
    rootDir ?? path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (!isToolcraftTypeScriptCompilerAvailable()) {
    if (!allowMissingCompiler) {
      throw new Error(
        "TypeScript is required to evaluate the Toolcraft product boundary.",
      );
    }
    return {
      filesystemViolations: [],
      productSourceCount: 0,
      skippedReason:
        "Toolcraft product boundary check passed (dependency-backed graph and AST checks are deferred until dependencies are installed).",
      violations: [],
    };
  }
  const [
    { createToolcraftLocalDependencyGraph },
    dependencyResolution,
    { collectToolcraftFrameworkOwnedLocalPaths },
    { collectToolcraftSourceInventory },
  ] = await Promise.all([
    import("./toolcraft-local-dependency-graph.mjs"),
    import("./toolcraft-product-dependency-resolution.mjs"),
    import("./toolcraft-source-ownership.mjs"),
    import("./toolcraft-source-inventory.mjs"),
  ]);
  const resolvedProtectedFilePaths =
    protectedFilePaths ??
    (await collectToolcraftFrameworkOwnedLocalPaths(resolvedRootDir));
  const inventory =
    providedInventory ??
    (await collectToolcraftSourceInventory({
      includeResourceFiles: true,
      protectedFilePaths: resolvedProtectedFilePaths,
      rootDir: resolvedRootDir,
      sourceRoots: ["src", "e2e"],
    }));
  const configuredAliases =
    aliases ??
    (await dependencyResolution.loadToolcraftLocalModuleAliases({
      rootDir: resolvedRootDir,
      tsconfigPaths: ["tsconfig.json"],
    }));
  const localDependencyGraph =
    providedLocalDependencyGraph ??
    (await createToolcraftLocalDependencyGraph({
      aliases: [
        ...configuredAliases,
        ...dependencyResolution.createToolcraftDefaultSourceAliases(
          resolvedRootDir,
        ),
      ],
      entries: inventory.entries,
      rootDir: resolvedRootDir,
    }));
  const productEntries = localDependencyGraph.entries.filter(
    (entry) =>
      /^(?:e2e|src)\//u.test(entry.repoPath) &&
      entry.owner === "product" &&
      entry.role === "production" &&
      (dependencyResolution.toolcraftModuleExtensions.includes(
        path.extname(entry.repoPath),
      ) ||
        /\.css$/u.test(entry.repoPath)),
  );
  const violations = [];
  const entryByRepoPath = new Map(
    localDependencyGraph.entries.map((entry) => [entry.repoPath, entry]),
  );
  const importsByImporter = new Map();
  for (const evidence of localDependencyGraph.moduleImports) {
    const importerEvidence = importsByImporter.get(evidence.importerRepoPath) ?? [];
    importerEvidence.push(evidence);
    importsByImporter.set(evidence.importerRepoPath, importerEvidence);
  }
  const appendPrivateEvidenceImportViolations = (entry) => {
    for (const moduleImport of importsByImporter.get(entry.repoPath) ?? []) {
      const violation = createToolcraftPrivateEvidenceImportViolation({
        importerRepoPath: entry.repoPath,
        moduleImport,
      });
      if (violation) violations.push(violation);
    }
  };

  for (const entry of productEntries) {
    const sourceRecord = localDependencyGraph.sourceRecords.get(entry.repoPath);
    if (/\.css$/u.test(entry.repoPath)) {
      violations.push(...sourceRecord.cssEvidence.violations);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/u.test(entry.repoPath)) continue;
    const boundaryEvidence = sourceRecord.boundaryEvidence;
    if (!boundaryEvidence) {
      throw new Error(
        `Canonical dependency graph is missing TypeScript boundary evidence for ${entry.repoPath}.`,
      );
    }
    violations.push(
      ...boundaryEvidence.productSourceViolations,
      ...boundaryEvidence.reservedEvidenceViolations,
      ...boundaryEvidence.playwrightAuthorityViolations,
    );
    appendPrivateEvidenceImportViolations(entry);
    for (const evidence of importsByImporter.get(entry.repoPath) ?? []) {
      if (evidence.resolution === "outside-inventory") {
        violations.push({
          column: 1,
          kind: "source-boundary-escape",
          line: 1,
          message: `Product production source must stay under the scanned src boundary. Move ${evidence.resolvedRepoPath} under src before importing it.`,
          repoPath: entry.repoPath,
        });
      }
      const importedEntry = entryByRepoPath.get(evidence.resolvedRepoPath);
      if (
        importedEntry?.role === "test" ||
        importedEntry?.role === "test-support" ||
        ((evidence.resolution === "outside-inventory" ||
          evidence.resolution === "unresolved-local") &&
          /(?:^|\/)[^/]+\.(?:test|spec)(?:\.[cm]?[jt]sx?)?$/u.test(
            evidence.specifier,
          ))
      ) {
        violations.push({
          column: 1,
          kind: "production-test-import",
          line: 1,
          message: `Production source must not import test or test-support module ${evidence.specifier}. Move reusable product code into an explicit production module.`,
          repoPath: entry.repoPath,
        });
      }
    }
  }

  for (const entry of localDependencyGraph.entries) {
    if (
      !/^(?:e2e|src)\//u.test(entry.repoPath) ||
      entry.owner !== "product" ||
      (entry.role !== "test" && entry.role !== "test-support") ||
      !/\.[cm]?[jt]sx?$/u.test(entry.repoPath)
    ) {
      continue;
    }
    const sourceRecord = localDependencyGraph.sourceRecords.get(entry.repoPath);
    const boundaryEvidence = sourceRecord.boundaryEvidence;
    if (!boundaryEvidence) {
      throw new Error(
        `Canonical dependency graph is missing TypeScript boundary evidence for ${entry.repoPath}.`,
      );
    }
    violations.push(
      ...boundaryEvidence.reservedEvidenceViolations,
      ...boundaryEvidence.playwrightAuthorityViolations,
      ...boundaryEvidence.moduleLoadingViolations,
    );
    appendPrivateEvidenceImportViolations(entry);
  }

  return {
    filesystemViolations: inventory.filesystemViolations,
    productSourceCount: productEntries.length,
    violations: violations.sort(
      (left, right) =>
        compareCodeUnits(left.repoPath, right.repoPath) ||
        left.line - right.line ||
        left.column - right.column,
    ),
  };
}

export function printToolcraftProductBoundaryResult(result, logger = console) {
  for (const violation of result.filesystemViolations) {
    logger.error(`- ${violation.repoPath}: ${violation.reason}`);
  }
  for (const violation of result.violations) {
    logger.error(
      `- ${violation.repoPath}:${violation.line}:${violation.column}: ${violation.message}`,
    );
  }
}

export function toolcraftProductBoundaryPassed(result) {
  return (
    result.filesystemViolations.length === 0 && result.violations.length === 0
  );
}

const scriptPath = fileURLToPath(import.meta.url);
const isDirectExecution =
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(scriptPath);

if (isDirectExecution) {
  const result = await evaluateToolcraftProductBoundary({
    allowMissingCompiler: process.argv.includes("--allow-missing-compiler"),
  });
  if (!toolcraftProductBoundaryPassed(result)) {
    console.error("Toolcraft product boundary check failed.");
    printToolcraftProductBoundaryResult(result);
    process.exitCode = 1;
  } else {
    console.log(
      result.skippedReason ??
        `Toolcraft product boundary check passed (${result.productSourceCount} product production files).`,
    );
  }
}
