import type {
  ToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import type {
  ToolcraftDeliveryCatalog,
  ToolcraftVerificationImpactInventory,
} from "./toolcraft-verification-impact-inventory.mjs";
import type {
  ToolcraftVerificationInputRoles,
} from "./toolcraft-verification-input-roles.mjs";

export type ToolcraftDeliveryFunctionalContext = Readonly<{
  catalog: ToolcraftDeliveryCatalog;
  currentFunctionalProofModel: ToolcraftFunctionalProofModel;
  frameworkOwnedPaths: readonly string[];
  graph: Readonly<{
    entries: readonly Readonly<{
      absolutePath: string;
      owner: "framework" | "platform" | "product";
      repoPath: string;
      role: "generated" | "production" | "test" | "test-support";
    }>[];
    forward: ReadonlyMap<string, readonly string[]>;
    reverse: ReadonlyMap<string, readonly string[]>;
  }>;
  inputRoles: ToolcraftVerificationInputRoles;
  sourceInventory: Readonly<{
    entries: readonly Readonly<{
      absolutePath: string;
      owner: "framework" | "platform" | "product";
      repoPath: string;
      role: "generated" | "production" | "test" | "test-support";
    }>[];
    filesystemViolations: readonly Readonly<{
      reason: string;
      repoPath: string;
    }>[];
  }>;
  verificationImpactInventory: ToolcraftVerificationImpactInventory;
}>;

export function collectToolcraftDeliveryFunctionalContextCore(options: {
  dependencies: Readonly<{
    collectCatalog(rootDir: string): Promise<ToolcraftDeliveryCatalog>;
    createFunctionalProofModel(input: {
      catalog: ToolcraftDeliveryCatalog;
      inventory: ToolcraftVerificationImpactInventory;
    }): ToolcraftFunctionalProofModel;
    createVerificationContext(rootDir: string): Promise<Readonly<{
      frameworkOwnedPaths:
        ToolcraftDeliveryFunctionalContext["frameworkOwnedPaths"];
      graph: ToolcraftDeliveryFunctionalContext["graph"];
      inputRoles: ToolcraftVerificationInputRoles;
      sourceInventory: ToolcraftDeliveryFunctionalContext["sourceInventory"];
    }>>;
    readImpactInventory(
      rootDir: string,
      options: {
        catalog: ToolcraftDeliveryCatalog;
        inputRoles: ToolcraftVerificationInputRoles;
      },
    ): Promise<Readonly<{
      inventory: ToolcraftVerificationImpactInventory;
      path: string;
    }>>;
  }>;
  projectDir: string;
}): Promise<ToolcraftDeliveryFunctionalContext>;

export function collectToolcraftDeliveryFunctionalContext(
  projectDir: string,
): Promise<ToolcraftDeliveryFunctionalContext>;
