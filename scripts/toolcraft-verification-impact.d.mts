import type {
  ToolcraftDeliveryCatalog,
  ToolcraftVerificationImpactInventory,
} from "./toolcraft-verification-impact-inventory.mjs";
export type {
  ToolcraftDeliveryCatalog,
  ToolcraftVerificationImpactFunctionalOwner,
  ToolcraftVerificationImpactInventory,
  ToolcraftVerificationImpactOwner,
  ToolcraftVerificationImpactPerformanceOwner,
} from "./toolcraft-verification-impact-inventory.mjs";

export type ToolcraftVerificationImpact = Readonly<{
  acceptanceIds: readonly string[];
  browserTestNames: readonly string[];
  buildRequired: boolean;
  performanceCandidates: Readonly<{
    passIds: readonly string[];
    pathIds: readonly string[];
    testNames: readonly string[];
  }>;
  productTestFiles: readonly string[];
}>;

export type ToolcraftProductVerificationSourceEntry = Readonly<{
  absolutePath: string;
  owner: "framework" | "platform" | "product";
  repoPath: string;
  role: "generated" | "production" | "test" | "test-support";
}>;

export type ToolcraftProductVerificationSourceInventory = Readonly<{
  entries: readonly ToolcraftProductVerificationSourceEntry[];
  filesystemViolations: readonly Readonly<{
    reason: string;
    repoPath: string;
  }>[];
}>;

export type ToolcraftProductVerificationGraph = Readonly<{
  entries: readonly ToolcraftProductVerificationSourceEntry[];
  forward: ReadonlyMap<string, readonly string[]>;
  reverse: ReadonlyMap<string, readonly string[]>;
}>;

export type ToolcraftProductVerificationContext = Readonly<{
  frameworkOwnedPaths: readonly string[];
  graph: ToolcraftProductVerificationGraph;
  inputRoles: import("./toolcraft-verification-input-roles.mjs").ToolcraftVerificationInputRoles;
  sourceInventory: ToolcraftProductVerificationSourceInventory;
}>;

export {
  TOOLCRAFT_VERIFICATION_IMPACT_VERSION,
} from "./toolcraft-verification-impact-inventory.mjs";

export function collectToolcraftProductVerificationSources(
  rootDir: string,
): Promise<Readonly<{
  frameworkOwnedPaths: readonly string[];
  sourceInventory: ToolcraftProductVerificationSourceInventory;
}>>;

export function createToolcraftProductVerificationContext(
  rootDir: string,
): Promise<ToolcraftProductVerificationContext>;

export function createToolcraftProductVerificationContextCore(options: {
  dependencies: Readonly<{
    classifyInputRoles(
      graph: ToolcraftProductVerificationGraph,
    ): import("./toolcraft-verification-input-roles.mjs").ToolcraftVerificationInputRoles;
    collectFrameworkOwnedPaths(rootDir: string): Promise<readonly string[]>;
    collectSourceInventory(options: {
      includeResourceFiles: boolean;
      protectedFilePaths: readonly string[];
      rootDir: string;
      sourceRoots: readonly string[];
    }): Promise<ToolcraftProductVerificationSourceInventory>;
    createDefaultAliases(rootDir: string): readonly unknown[];
    createDependencyGraph(options: {
      aliases: readonly unknown[];
      analyzedEntryPaths: readonly string[];
      entries: readonly unknown[];
      rootDir: string;
      sourceRecordMode: "imports-only";
    }): Promise<ToolcraftProductVerificationGraph>;
    loadAliases(options: {
      rootDir: string;
      tsconfigPaths: readonly string[];
    }): Promise<readonly unknown[]>;
  }>;
  rootDir: string;
}): Promise<ToolcraftProductVerificationContext>;

export function validateToolcraftVerificationImpactInventory(
  value: unknown,
  options: {
    catalog: ToolcraftDeliveryCatalog;
    requiredOwnerPaths: readonly string[];
  },
): {
  errors: string[];
  inventory?: ToolcraftVerificationImpactInventory;
};

export function readToolcraftVerificationImpactInventory(
  rootDir: string,
  options: {
    catalog: ToolcraftDeliveryCatalog;
    inputRoles: import("./toolcraft-verification-input-roles.mjs").ToolcraftVerificationInputRoles;
  },
): Promise<Readonly<{
  inventory: ToolcraftVerificationImpactInventory;
  path: string;
}>>;

export function resolveToolcraftChangedVerificationImpact(options: {
  catalog: ToolcraftDeliveryCatalog;
  changedFiles: readonly string[];
  currentModel: import("./toolcraft-functional-proof-model.mjs").ToolcraftFunctionalProofModel;
  graph: Readonly<{
    entries: readonly Readonly<{
      owner: "framework" | "platform" | "product";
      repoPath: string;
      role: "generated" | "production" | "test" | "test-support";
    }>[];
    reverse: ReadonlyMap<string, readonly string[]>;
  }>;
  previousModel: import("./toolcraft-functional-proof-model.mjs").ToolcraftFunctionalProofModel;
  roles: import("./toolcraft-verification-input-roles.mjs").ToolcraftVerificationInputRoles;
}): ToolcraftVerificationImpact;
