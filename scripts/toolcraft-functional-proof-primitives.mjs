import { createHash } from "node:crypto";

const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const isTrimmedString = (value) =>
  typeof value === "string" && value.length > 0 && value.trim() === value;

export function serializeToolcraftCanonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Toolcraft canonical JSON rejects non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`Toolcraft canonical JSON rejects ${typeof value} values.`);
  }
  if (ancestors.has(value)) {
    throw new Error("Toolcraft canonical JSON rejects cyclic values.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error("Toolcraft canonical JSON rejects non-plain objects.");
  }
  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("Toolcraft canonical JSON rejects symbol keys.");
    }
    const dense =
      ownKeys.length === value.length + 1 &&
      ownKeys.every((key) =>
        key === "length" ||
        (typeof key === "string" &&
          Number.isSafeInteger(Number(key)) &&
          String(Number(key)) === key &&
          Number(key) >= 0 &&
          Number(key) < value.length)
      ) &&
      Array.from(
        { length: value.length },
        (_, index) => Object.prototype.hasOwnProperty.call(value, index),
      ).every(Boolean);
    if (!dense) {
      throw new Error(
        "Toolcraft canonical JSON rejects sparse or augmented arrays.",
      );
    }
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error("Toolcraft canonical JSON rejects symbol keys.");
  }
  if (
    !Array.isArray(value) &&
    Object.getOwnPropertyNames(value).length !== Object.keys(value).length
  ) {
    throw new Error(
      "Toolcraft canonical JSON rejects non-enumerable properties.",
    );
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.map((item) =>
        serializeToolcraftCanonicalJson(item, ancestors)
      );
      return `[${items.join(",")}]`;
    }
    return `{${Object.keys(value).sort(compareCodeUnits).map((key) =>
      `${JSON.stringify(key)}:${serializeToolcraftCanonicalJson(value[key], ancestors)}`
    ).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function createToolcraftCanonicalJsonHash(value) {
  return createHash("sha256")
    .update(serializeToolcraftCanonicalJson(value))
    .digest("hex");
}

export function deriveToolcraftAcceptanceDomainId(acceptanceId) {
  if (!isTrimmedString(acceptanceId)) {
    throw new Error("Toolcraft acceptance id must be a trimmed string.");
  }
  const domainId = acceptanceId.split(".")[0];
  if (!isTrimmedString(domainId)) {
    throw new Error("Toolcraft acceptance id must start with a non-empty namespace segment.");
  }
  return domainId;
}

export function createToolcraftAcceptanceContractHash(acceptanceEntry) {
  return createToolcraftCanonicalJsonHash(acceptanceEntry);
}
