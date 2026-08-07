import { validateToolcraftDeliveryCatalog } from "./playwright-test-title-selection.mjs";
import {
  createToolcraftCanonicalJsonHash,
  serializeToolcraftCanonicalJson,
} from "./toolcraft-functional-proof-primitives.mjs";
import {
  TOOLCRAFT_VERIFICATION_IMPACT_VERSION,
  normalizeToolcraftVerificationImpactOwners,
} from "./toolcraft-verification-impact-inventory.mjs";

export {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-primitives.mjs";

export const TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION = 1;

const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const sorted = (values) => [...values].sort(compareCodeUnits);

function exactKeysError(value, expected, label) {
  if (!isRecord(value)) return `${label} must be an object.`;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return `${label} must be a plain object.`;
  }
  const expectedSet = new Set(expected);
  const unknown = sorted(
    Reflect.ownKeys(value)
      .filter((key) => typeof key !== "string" || !expectedSet.has(key))
      .map(String),
  );
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown.length > 0) return `${label} contains unknown fields: ${unknown.join(", ")}.`;
  if (missing.length > 0) return `${label} is missing required fields: ${missing.join(", ")}.`;
  return undefined;
}

function duplicateOrOrderError(rows, key, label) {
  for (let index = 1; index < rows.length; index += 1) {
    const comparison = compareCodeUnits(rows[index - 1][key], rows[index][key]);
    if (comparison === 0) return `${label} "${rows[index][key]}" must be unique.`;
    if (comparison > 0) return `${label} rows must be sorted by ${key}.`;
  }
  return undefined;
}

function deeplyFrozen(value, ancestors = new Set()) {
  if (!(value && typeof value === "object")) return true;
  if (!Object.isFrozen(value) || ancestors.has(value)) return false;
  ancestors.add(value);
  const frozen = Object.values(value).every((entry) => deeplyFrozen(entry, ancestors));
  ancestors.delete(value);
  return frozen;
}

export function getToolcraftFunctionalProofModelError(value) {
  const shapeError = exactKeysError(
    value,
    ["acceptance", "owners", "version"],
    "Toolcraft functional proof model",
  );
  if (shapeError) return shapeError;
  if (!deeplyFrozen(value)) {
    return "Toolcraft functional proof model must be deeply frozen.";
  }
  try {
    serializeToolcraftCanonicalJson(value);
  } catch (error) {
    return error.message;
  }
  if (value.version !== TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION) {
    return `Toolcraft functional proof model.version must be ${TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION}.`;
  }
  if (!Array.isArray(value.acceptance) || !Array.isArray(value.owners)) {
    return "Toolcraft functional proof model acceptance and owners must be arrays.";
  }
  const catalogValidation = validateToolcraftDeliveryCatalog({
    acceptance: value.acceptance,
    performance: [],
    version: 2,
  });
  if (catalogValidation.errors.length > 0) return catalogValidation.errors[0];
  const acceptanceOrderError = duplicateOrOrderError(
    value.acceptance,
    "acceptanceId",
    "Functional proof model acceptance id",
  );
  if (acceptanceOrderError) return acceptanceOrderError;
  const ownerValidation = normalizeToolcraftVerificationImpactOwners(
    value.owners,
    {
      acceptanceIds: value.acceptance.map(({ acceptanceId }) => acceptanceId),
      requireCanonical: true,
    },
  );
  return ownerValidation.errors[0];
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function createToolcraftFunctionalProofModel({ catalog, inventory }) {
  const catalogValidation = validateToolcraftDeliveryCatalog(catalog);
  if (catalogValidation.errors.length > 0) {
    throw new Error(`Invalid delivery catalog: ${catalogValidation.errors.join("\n")}`);
  }
  const inventoryError = exactKeysError(
    inventory,
    ["owners", "version"],
    "Verification impact inventory input",
  );
  if (inventoryError) throw new Error(inventoryError);
  if (inventory.version !== TOOLCRAFT_VERIFICATION_IMPACT_VERSION) {
    throw new Error(
      `Verification impact inventory.version must be ${TOOLCRAFT_VERIFICATION_IMPACT_VERSION}.`,
    );
  }
  const acceptance = catalogValidation.catalog.acceptance.map((row) => ({
    acceptanceId: row.acceptanceId,
    contractHash: row.contractHash,
    domainId: row.domainId,
    file: row.file,
    testName: row.testName,
  }));
  const ownerValidation = normalizeToolcraftVerificationImpactOwners(
    inventory.owners,
    {
      acceptanceIds: acceptance.map(({ acceptanceId }) => acceptanceId),
    },
  );
  if (ownerValidation.errors.length > 0) {
    throw new Error(ownerValidation.errors.join("\n"));
  }
  const model = deepFreeze({
    acceptance,
    owners: ownerValidation.owners,
    version: TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION,
  });
  const modelError = getToolcraftFunctionalProofModelError(model);
  if (modelError) throw new Error(modelError);
  return model;
}

export function createToolcraftFunctionalProofModelHash(model) {
  const error = getToolcraftFunctionalProofModelError(model);
  if (error) throw new Error(`Invalid Toolcraft functional proof model: ${error}`);
  return createToolcraftCanonicalJsonHash(model);
}

export function diffToolcraftFunctionalProofModels({ current, previous }) {
  for (const [label, model] of [["Current", current], ["Previous", previous]]) {
    const error = getToolcraftFunctionalProofModelError(model);
    if (error) throw new Error(`${label} Toolcraft functional proof model is invalid: ${error}`);
  }
  const currentRows = new Map(current.acceptance.map((row) => [row.acceptanceId, row]));
  const previousRows = new Map(previous.acceptance.map((row) => [row.acceptanceId, row]));
  const currentOwners = new Map(current.owners.map((owner) => [owner.path, owner]));
  const previousOwners = new Map(previous.owners.map((owner) => [owner.path, owner]));
  const acceptanceIds = new Set();
  for (const [acceptanceId, row] of currentRows) {
    const prior = previousRows.get(acceptanceId);
    if (!prior || prior.contractHash !== row.contractHash) acceptanceIds.add(acceptanceId);
  }
  const changedOwnerPaths = [];
  for (const ownerPath of sorted(new Set([...currentOwners.keys(), ...previousOwners.keys()]))) {
    const currentOwner = currentOwners.get(ownerPath);
    const previousOwner = previousOwners.get(ownerPath);
    if (
      !currentOwner || !previousOwner ||
      serializeToolcraftCanonicalJson(currentOwner) !==
      serializeToolcraftCanonicalJson(previousOwner)
    ) {
      changedOwnerPaths.push(ownerPath);
      for (const owner of [previousOwner, currentOwner]) {
        for (const acceptanceId of owner?.acceptanceIds ?? []) {
          acceptanceIds.add(acceptanceId);
        }
      }
    }
  }
  return deepFreeze({
    acceptanceIds: sorted(acceptanceIds),
    changedOwnerPaths,
    removedAcceptanceIds: sorted(
      [...previousRows.keys()].filter((acceptanceId) => !currentRows.has(acceptanceId)),
    ),
  });
}
