import path from "node:path";

import { validateToolcraftDeliveryCatalog } from "./playwright-test-title-selection.mjs";

export const TOOLCRAFT_VERIFICATION_IMPACT_VERSION = 3;

const impactKinds = new Set(["functional", "performance", "presentation"]);
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTrimmedString = (value) =>
  typeof value === "string" && value.length > 0 && value.trim() === value;
const uniqueSorted = (values) =>
  [...new Set(values)].sort(compareCodeUnits);

function isCanonicalPath(value) {
  const segments = typeof value === "string" ? value.split("/") : [];
  return (
    isTrimmedString(value) &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    !value.includes("\\") &&
    value === path.posix.normalize(value) &&
    segments.every((segment) => !["", ".", ".."].includes(segment))
  );
}

function exactKeys(value, expected, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    errors.push(`${label} must be a plain object.`);
    return false;
  }
  const expectedSet = new Set(expected);
  const unknown = Reflect.ownKeys(value)
    .filter((key) => typeof key !== "string" || !expectedSet.has(key))
    .map(String)
    .sort(compareCodeUnits);
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown.length > 0) {
    errors.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  }
  if (missing.length > 0) {
    errors.push(`${label} is missing required fields: ${missing.join(", ")}.`);
  }
  return unknown.length === 0 && missing.length === 0;
}

function normalizeStringArray(
  value,
  label,
  errors,
  requireCanonical,
) {
  if (!Array.isArray(value) || !value.every(isTrimmedString)) {
    errors.push(`${label} must be a non-empty unique string array.`);
    return undefined;
  }
  if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
    errors.push(`${label} contains symbol fields.`);
    return undefined;
  }
  if (value.length === 0) {
    errors.push(`${label} must contain at least one entry.`);
  }
  const sorted = uniqueSorted(value);
  if (sorted.length !== value.length) {
    errors.push(`${label} must not contain duplicates.`);
  }
  if (
    requireCanonical &&
    sorted.some((entry, index) => entry !== value[index])
  ) {
    errors.push(`${label} must be sorted.`);
  }
  return Object.freeze(sorted);
}

function normalizeOwner(
  value,
  index,
  errors,
  { acceptanceIds, passIds, requireCanonical },
) {
  const label = `Verification impact owner at index ${index}`;
  const performance = value?.kind === "performance";
  if (
    !exactKeys(
      value,
      performance
        ? ["acceptanceIds", "kind", "passIds", "path"]
        : ["acceptanceIds", "kind", "path"],
      label,
      errors,
    )
  ) {
    return undefined;
  }
  if (!impactKinds.has(value.kind)) {
    errors.push(
      `${label}.kind must be "presentation", "functional", or "performance".`,
    );
  }
  if (!isCanonicalPath(value.path)) {
    errors.push(`${label}.path must be a canonical relative POSIX path.`);
  }
  const normalizedAcceptanceIds = normalizeStringArray(
    value.acceptanceIds,
    `${label}.acceptanceIds`,
    errors,
    requireCanonical,
  );
  const normalizedPassIds = performance
    ? normalizeStringArray(
        value.passIds,
        `${label}.passIds`,
        errors,
        requireCanonical,
      )
    : undefined;
  for (const acceptanceId of normalizedAcceptanceIds ?? []) {
    if (acceptanceIds && !acceptanceIds.has(acceptanceId)) {
      errors.push(
        `${label} references unknown acceptance id "${acceptanceId}".`,
      );
    }
  }
  for (const passId of normalizedPassIds ?? []) {
    if (passIds && !passIds.has(passId)) {
      errors.push(`${label} references unknown renderer pass "${passId}".`);
    }
  }
  if (
    !impactKinds.has(value.kind) ||
    !isCanonicalPath(value.path) ||
    !normalizedAcceptanceIds ||
    (performance && !normalizedPassIds)
  ) {
    return undefined;
  }
  return Object.freeze({
    acceptanceIds: normalizedAcceptanceIds,
    kind: value.kind,
    ...(performance ? { passIds: normalizedPassIds } : {}),
    path: value.path,
  });
}

export function normalizeToolcraftVerificationImpactOwners(
  value,
  {
    acceptanceIds,
    passIds,
    requireCanonical = false,
  } = {},
) {
  const errors = [];
  if (!Array.isArray(value)) {
    return {
      errors: ["Verification impact owners must be an array."],
      owners: Object.freeze([]),
    };
  }
  if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
    errors.push("Verification impact owners contains symbol fields.");
  }
  const knownAcceptanceIds = acceptanceIds
    ? new Set(acceptanceIds)
    : undefined;
  const knownPassIds = passIds ? new Set(passIds) : undefined;
  const owners = value.flatMap((ownerValue, index) => {
    const owner = normalizeOwner(ownerValue, index, errors, {
      acceptanceIds: knownAcceptanceIds,
      passIds: knownPassIds,
      requireCanonical,
    });
    return owner ? [owner] : [];
  });
  const sortedOwners = [...owners].sort((left, right) =>
    compareCodeUnits(left.path, right.path),
  );
  for (let index = 1; index < sortedOwners.length; index += 1) {
    if (sortedOwners[index - 1].path === sortedOwners[index].path) {
      errors.push(
        `Verification impact owner path "${sortedOwners[index].path}" must be unique.`,
      );
    }
  }
  if (
    requireCanonical &&
    owners.some((owner, index) => owner.path !== sortedOwners[index]?.path)
  ) {
    errors.push("Verification impact owner rows must be sorted by path.");
  }
  return {
    errors,
    owners: Object.freeze(sortedOwners),
  };
}

function validatePathCoverage(owners, requiredOwnerPaths, errors) {
  const ownerPaths = new Set(owners.map(({ path: value }) => value));
  const required = uniqueSorted(requiredOwnerPaths);
  const requiredSet = new Set(required);
  for (const repoPath of required) {
    if (!ownerPaths.has(repoPath)) {
      errors.push(
        `Current runtime production module or product resource "${repoPath}" is missing from the verification impact inventory.`,
      );
    }
  }
  for (const ownerPath of ownerPaths) {
    if (!requiredSet.has(ownerPath)) {
      errors.push(
        `Verification impact owner "${ownerPath}" is not a current runtime production module or product resource.`,
      );
    }
  }
  return requiredSet;
}

function validateProofCoverage(owners, catalog, allowedPaths, errors) {
  const acceptanceIds = new Set(
    catalog.acceptance.map(({ acceptanceId }) => acceptanceId),
  );
  const passIds = new Set(
    catalog.performance.flatMap(({ passIds: ids }) => ids),
  );
  const ownedAcceptanceIds = new Set();
  const ownedPassIds = new Set();
  for (const owner of owners) {
    if (!allowedPaths.has(owner.path)) continue;
    owner.acceptanceIds.forEach((id) => ownedAcceptanceIds.add(id));
    if (owner.kind === "performance") {
      owner.passIds.forEach((id) => ownedPassIds.add(id));
    }
  }
  for (const acceptanceId of acceptanceIds) {
    if (!ownedAcceptanceIds.has(acceptanceId)) {
      errors.push(
        `Acceptance id "${acceptanceId}" has no product implementation owner in the verification impact inventory.`,
      );
    }
  }
  for (const passId of passIds) {
    if (!ownedPassIds.has(passId)) {
      errors.push(
        `Renderer pass "${passId}" has no product implementation owner in the verification impact inventory.`,
      );
    }
  }
  if (
    owners.length >= 2 &&
    acceptanceIds.size >= 2 &&
    owners.every(({ acceptanceIds: ids }) => ids.length === acceptanceIds.size)
  ) {
    errors.push(
      "Verification impact ownership is overbroad: every product production path claims every acceptance id without nearest ownership.",
    );
  }
  if (
    owners.length >= 2 &&
    passIds.size > 0 &&
    owners.every(
      (owner) =>
        owner.kind === "performance" && owner.passIds.length === passIds.size,
    )
  ) {
    errors.push(
      "Verification impact ownership is overbroad: every product production path claims every renderer pass without nearest ownership.",
    );
  }
}

export function validateToolcraftVerificationImpactInventory(
  value,
  { catalog, requiredOwnerPaths = [] } = {},
) {
  const errors = [];
  if (!isRecord(value)) {
    return { errors: ["Verification impact inventory must be an object."] };
  }
  exactKeys(
    value,
    ["owners", "version"],
    "Verification impact inventory",
    errors,
  );
  if (value.version !== TOOLCRAFT_VERIFICATION_IMPACT_VERSION) {
    errors.push(
      `Verification impact inventory.version must be ${TOOLCRAFT_VERIFICATION_IMPACT_VERSION}.`,
    );
  }
  const catalogValidation = validateToolcraftDeliveryCatalog(catalog);
  if (catalogValidation.errors.length > 0) {
    errors.push(
      ...catalogValidation.errors.map(
        (error) => `Invalid delivery catalog: ${error}`,
      ),
    );
  }
  const validCatalog = catalogValidation.catalog;
  const normalized = normalizeToolcraftVerificationImpactOwners(
    value.owners,
    {
      acceptanceIds: validCatalog?.acceptance.map(
        ({ acceptanceId }) => acceptanceId,
      ),
      passIds: validCatalog?.performance.flatMap(({ passIds: ids }) => ids),
    },
  );
  errors.push(...normalized.errors);
  const allowedPaths = validatePathCoverage(
    normalized.owners,
    requiredOwnerPaths,
    errors,
  );
  if (validCatalog) {
    validateProofCoverage(
      normalized.owners,
      validCatalog,
      allowedPaths,
      errors,
    );
  }
  return {
    errors,
    ...(errors.length === 0
      ? {
          inventory: Object.freeze({
            owners: normalized.owners,
            version: TOOLCRAFT_VERIFICATION_IMPACT_VERSION,
          }),
        }
      : {}),
  };
}
