import type {
  ToolcraftDeliveryCatalog,
  ToolcraftVerificationImpactInventory,
  ToolcraftVerificationImpactOwner,
} from "./toolcraft-verification-impact-inventory.mjs";

export type ToolcraftFunctionalProofAcceptance = Readonly<{
  acceptanceId: string;
  contractHash: string;
  domainId: string;
  file: string;
  testName: string;
}>;

export type ToolcraftFunctionalProofOwner =
  ToolcraftVerificationImpactOwner;

export type ToolcraftFunctionalProofModel = Readonly<{
  acceptance: readonly ToolcraftFunctionalProofAcceptance[];
  owners: readonly ToolcraftFunctionalProofOwner[];
  version: 1;
}>;

export const TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION: 1;

export {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-primitives.mjs";
export function createToolcraftFunctionalProofModel(input: {
  catalog: ToolcraftDeliveryCatalog;
  inventory: ToolcraftVerificationImpactInventory;
}): ToolcraftFunctionalProofModel;
export function createToolcraftFunctionalProofModelHash(
  model: ToolcraftFunctionalProofModel,
): string;
export function getToolcraftFunctionalProofModelError(
  value: unknown,
): string | undefined;
export function diffToolcraftFunctionalProofModels(input: {
  current: ToolcraftFunctionalProofModel;
  previous: ToolcraftFunctionalProofModel;
}): Readonly<{
  acceptanceIds: readonly string[];
  changedOwnerPaths: readonly string[];
  removedAcceptanceIds: readonly string[];
}>;
