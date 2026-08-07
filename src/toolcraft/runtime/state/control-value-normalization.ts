import {
  getToolcraftCanvasSizeTargetDimension,
  isToolcraftTimelinePanelRuntimeTarget,
} from "../schema/runtime-targets";
import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "../schema/types";
import { asToolcraftCanvasSizeDimension } from "./canvas-state";

export type ToolcraftNormalizedControlValue =
  | { accepted: true; value: unknown }
  | { accepted: false; fallback: unknown };

function accept(value: unknown): ToolcraftNormalizedControlValue {
  return { accepted: true, value };
}

function reject(
  control: ResolvedToolcraftControlSchema,
): ToolcraftNormalizedControlValue {
  return { accepted: false, fallback: control.defaultValue };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoundedNumber(
  control: ResolvedToolcraftControlSchema,
  value: unknown,
): value is number {
  return (
    isFiniteNumber(value) &&
    (control.min === undefined || value >= control.min) &&
    (control.max === undefined || value <= control.max)
  );
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function matchesDefaultContainer(
  candidate: unknown,
  defaultValue: unknown,
): boolean {
  if (defaultValue === undefined) {
    return isJsonValue(candidate);
  }

  if (defaultValue === null || typeof defaultValue !== "object") {
    return typeof candidate === typeof defaultValue && isJsonValue(candidate);
  }

  if (Array.isArray(defaultValue)) {
    return Array.isArray(candidate) && candidate.every(isJsonValue);
  }

  return isRecord(candidate) && isJsonValue(candidate);
}

function isOptionValue(
  control: ResolvedToolcraftControlSchema,
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    (control.options ?? []).some((option) => option.value === value)
  );
}

function isImagePickerValue(
  control: ResolvedToolcraftControlSchema,
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    (control.items ?? []).some((item) => item.value === value)
  );
}

function isStringPair(
  value: unknown,
  first: string,
  second: string,
): boolean {
  return (
    isRecord(value) &&
    typeof value[first] === "string" &&
    typeof value[second] === "string"
  );
}

function isFontPickerValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.length > 0;
  }

  if (!isRecord(value) || typeof value.fontId !== "string") {
    return false;
  }

  return (
    (value.color === undefined || typeof value.color === "string") &&
    (value.fontSize === undefined || isFiniteNumber(value.fontSize)) &&
    (value.fontWeight === undefined || typeof value.fontWeight === "string") &&
    (value.opacity === undefined ||
      (isFiniteNumber(value.opacity) && value.opacity >= 0 && value.opacity <= 100)) &&
    isJsonValue(value)
  );
}

export function normalizeToolcraftControlValue(
  control: ResolvedToolcraftControlSchema,
  candidate: unknown,
): ToolcraftNormalizedControlValue {
  if (getToolcraftCanvasSizeTargetDimension(control.target)) {
    const dimension = asToolcraftCanvasSizeDimension(candidate);

    return dimension === null ? reject(control) : accept(dimension);
  }

  let valid: boolean;

  switch (control.type) {
    case "slider":
      valid = isBoundedNumber(control, candidate);
      break;
    case "rangeSlider":
      valid =
        Array.isArray(candidate) &&
        candidate.length > 0 &&
        candidate.every((value) => isBoundedNumber(control, value));
      break;
    case "switch":
      valid = typeof candidate === "boolean";
      break;
    case "select":
    case "segmented":
    case "tabs":
      valid = isOptionValue(control, candidate);
      break;
    case "imagePicker":
      valid = isImagePickerValue(control, candidate);
      break;
    case "text":
    case "code":
    case "anchorGrid":
      valid = typeof candidate === "string";
      break;
    case "rangeInput":
      valid = isStringPair(candidate, "start", "end");
      break;
    case "vector":
      valid = isStringPair(candidate, "x", "y");
      break;
    case "color":
    case "palette":
      valid =
        typeof candidate === "string" ||
        (isRecord(candidate) && typeof candidate.hex === "string");
      break;
    case "colorOpacity":
      valid =
        isRecord(candidate) &&
        typeof candidate.hex === "string" &&
        isFiniteNumber(candidate.opacity) &&
        candidate.opacity >= 0 &&
        candidate.opacity <= 100;
      break;
    case "fontPicker":
      valid = isFontPickerValue(candidate);
      break;
    case "panelActions":
    case "settingsTransfer":
      valid = false;
      break;
    default:
      valid = matchesDefaultContainer(candidate, control.defaultValue);
      break;
  }

  return valid ? accept(candidate) : reject(control);
}

export function getToolcraftValueControls(
  schema: ResolvedToolcraftAppSchema,
): ReadonlyMap<string, ResolvedToolcraftControlSchema> {
  const controls = new Map<string, ResolvedToolcraftControlSchema>();

  for (const section of schema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      if (
        control.type !== "panelActions" &&
        control.type !== "settingsTransfer" &&
        !isToolcraftTimelinePanelRuntimeTarget(control.target)
      ) {
        controls.set(control.target, control);
      }
    }
  }

  return controls;
}
