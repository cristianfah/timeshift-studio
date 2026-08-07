export type ToolcraftVerificationImpactFunctionalOwner = Readonly<{
  acceptanceIds: readonly string[];
  kind: "functional" | "presentation";
  path: string;
}>;

export type ToolcraftVerificationImpactPerformanceOwner = Readonly<{
  acceptanceIds: readonly string[];
  kind: "performance";
  passIds: readonly string[];
  path: string;
}>;

export type ToolcraftVerificationImpactOwner =
  | ToolcraftVerificationImpactFunctionalOwner
  | ToolcraftVerificationImpactPerformanceOwner;

export type ToolcraftVerificationImpactInventory = Readonly<{
  owners: readonly ToolcraftVerificationImpactOwner[];
  version: 3;
}>;

export type ToolcraftDeliveryCatalog = Readonly<{
  acceptance: readonly Readonly<{
    acceptanceId: string;
    contractHash: string;
    domainId: string;
    file: string;
    testName: string;
  }>[];
  performance: readonly Readonly<{
    passIds: readonly string[];
    pathId: string;
    testName: string;
  }>[];
  version: 2;
}>;

export const TOOLCRAFT_VERIFICATION_IMPACT_VERSION: 3;

export function normalizeToolcraftVerificationImpactOwners(
  value: unknown,
  options?: {
    acceptanceIds?: readonly string[];
    passIds?: readonly string[];
    requireCanonical?: boolean;
  },
): {
  errors: string[];
  owners: readonly ToolcraftVerificationImpactOwner[];
};

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
