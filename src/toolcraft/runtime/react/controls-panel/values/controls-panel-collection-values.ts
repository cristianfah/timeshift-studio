import type { ToolcraftCollectionItemControlType } from "../../../schema/collection-item-controls";
import type { ToolcraftControlSchema } from "../../../schema/types";
import { asFontPickerValue } from "./controls-panel-font-values";
import { asNumber } from "./controls-panel-value-primitives";

function assertNeverCollectionItemControl(value: never): never {
  throw new Error(
    `Unsupported Toolcraft collection item control: ${String(value)}`,
  );
}

export function asCollectionItems(
  value: unknown,
  fallback: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return [...value];
  }

  return Array.isArray(fallback) ? [...fallback] : [];
}

export function getCollectionMinItems(control: ToolcraftControlSchema): number {
  return Math.max(0, Math.floor(asNumber(control.minItems, 0)));
}

export function getCollectionHardMaxItems(
  control: ToolcraftControlSchema,
): number | null {
  if (
    typeof control.hardMaxItems !== "number" ||
    !Number.isFinite(control.hardMaxItems)
  ) {
    return null;
  }

  return Math.max(0, Math.floor(control.hardMaxItems));
}

export function getCollectionItemType(
  control: ToolcraftControlSchema,
): ToolcraftCollectionItemControlType {
  return control.itemControl?.type ?? "color";
}

export function getCollectionItemBaseLabel(
  control: ToolcraftControlSchema,
): string {
  if (control.itemLabel) {
    return control.itemLabel;
  }

  const label = control.itemControl?.label;

  return typeof label === "string" ? label : "Item";
}

export function getCollectionItemName(
  control: ToolcraftControlSchema,
  index: number,
): string {
  const label = control.itemControl?.label;

  if (label === false) {
    return "";
  }

  return `${getCollectionItemBaseLabel(control)} ${index + 1}`;
}

export function getCollectionItemDefaultValue(
  control: ToolcraftControlSchema,
): unknown {
  if (control.itemControls) {
    return Object.fromEntries(
      Object.entries(control.itemControls).map(([id, itemControl]) => [
        id,
        itemControl.defaultValue,
      ]),
    );
  }

  if ("itemDefaultValue" in control) {
    return control.itemDefaultValue;
  }

  if (typeof control.itemControl?.defaultValue !== "undefined") {
    return control.itemControl.defaultValue;
  }

  const itemType = getCollectionItemType(control);

  switch (itemType) {
    case "color":
      return { hex: "#C1FF00" };
    case "colorOpacity":
      return { hex: "#C1FF00", opacity: 100 };
    case "fontPicker":
      return asFontPickerValue(control.itemControl?.defaultValue);
    case "checkbox":
    case "switch":
      return false;
    case "rangeInput":
      return { end: "100%", start: "0%" };
    case "rangeSlider":
      return [control.itemControl?.min ?? 0, control.itemControl?.max ?? 100];
    case "select":
    case "segmented":
      return control.itemControl?.options?.[0]?.value ?? "";
    case "slider":
      return control.itemControl?.min ?? 0;
    case "text":
      return "";
    case "vector":
      return { x: "0", y: "0" };
    default:
      return assertNeverCollectionItemControl(itemType);
  }
}
