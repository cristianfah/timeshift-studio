import { getToolcraftSegmentedStaticFitError } from "../contracts/segmented-control-fit";
import { normalizeToolcraftModelFileDrop } from "../model-import/model-import-limits";
import { isToolcraftCollectionItemControlType } from "./collection-item-controls";
import { resolveToolcraftControlApplicability } from "./control-applicability";
import type {
  ResolvedToolcraftControlSchema,
  ToolcraftModelFileDropSchema,
  ToolcraftNonModelControlSchema,
  ToolcraftResolvedControlApplicabilitySchema,
  ToolcraftControlSchema,
} from "./types";

type ControlWithResolvedApplicability =
  | (Omit<
      ToolcraftNonModelControlSchema,
      "applicability" | "visibleWhen"
    > & {
      applicability: ToolcraftResolvedControlApplicabilitySchema;
    })
  | (Omit<
      ToolcraftModelFileDropSchema,
      "applicability" | "visibleWhen"
    > & {
      applicability: ToolcraftResolvedControlApplicabilitySchema;
    });

const modelOnlyControlFieldNames = [
  "modelFormats",
  "modelLimits",
  "topologyProfile",
] as const;

function assertRequiredControlStringField(
  control: ToolcraftControlSchema,
  fieldName: "target" | "type",
): void {
  const fieldValue: unknown = control[fieldName];

  if (
    !Object.prototype.propertyIsEnumerable.call(control, fieldName) ||
    typeof fieldValue !== "string" ||
    fieldValue.trim().length === 0
  ) {
    throw new Error(
      `Toolcraft control validation [control-${fieldName}]: ${fieldName} must be an own enumerable string with non-empty trimmed content.`,
    );
  }
}

function assertControlRuntimeBoundary(control: ToolcraftControlSchema): void {
  const assetKind: unknown = control.assetKind;
  const controlType: unknown = control.type;

  if (assetKind === "model" && controlType !== "fileDrop") {
    throw new Error(
      'Toolcraft control validation [model-filedrop-type]: assetKind "model" requires type "fileDrop".',
    );
  }

  if (
    controlType === "fileDrop" &&
    assetKind !== undefined &&
    assetKind !== "image" &&
    assetKind !== "file" &&
    assetKind !== "model"
  ) {
    throw new Error(
      'Toolcraft fileDrop validation [filedrop-asset-kind]: assetKind must be omitted, "image", "file", or "model".',
    );
  }

  if (assetKind === "model") {
    return;
  }

  for (const fieldName of modelOnlyControlFieldNames) {
    if (Object.prototype.hasOwnProperty.call(control, fieldName)) {
      throw new Error(
        `Toolcraft control validation [model-only-field]: non-model controls cannot supply ${fieldName}.`,
      );
    }
  }
}

function assertFileDropHardMaxItems(control: ToolcraftControlSchema): void {
  if (
    control.type !== "fileDrop" ||
    !Object.prototype.hasOwnProperty.call(control, "hardMaxItems")
  ) {
    return;
  }

  if (
    typeof control.hardMaxItems !== "number" ||
    !Number.isSafeInteger(control.hardMaxItems) ||
    control.hardMaxItems < 0
  ) {
    throw new Error(
      "Toolcraft control validation [control-hard-max-items]: fileDrop hardMaxItems must be a finite nonnegative safe integer.",
    );
  }
}

function assertFileDropVariant(control: ToolcraftControlSchema): void {
  if (
    control.type !== "fileDrop" ||
    control.variant !== "collection-actions"
  ) {
    return;
  }

  if (control.assetKind !== "file" || control.multiple !== true) {
    throw new Error(
      'Toolcraft fileDrop validation [filedrop-collection-actions]: variant "collection-actions" requires assetKind: "file" with multiple: true.',
    );
  }
}

type ItemControlsOwner = Readonly<{
  minimumFields: number;
  name: "collectionActions" | "fileDrop";
}>;

function getItemControlsOwner(
  control: ToolcraftControlSchema,
): ItemControlsOwner | null {
  if (control.type === "collectionActions") {
    return { minimumFields: 2, name: "collectionActions" };
  }

  if (
    control.type === "fileDrop" &&
    control.variant === "collection-actions" &&
    control.assetKind === "file" &&
    control.multiple === true
  ) {
    return { minimumFields: 1, name: "fileDrop" };
  }

  return null;
}

function isPlainRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertItemControls(control: ToolcraftControlSchema): void {
  if (!control.itemControls) {
    return;
  }

  const owner = getItemControlsOwner(control);

  if (!owner) {
    throw new Error(
      `Toolcraft control validation [collection-item-controls] for target "${control.target}": itemControls require collectionActions or a multiple file-kind collection-actions fileDrop.`,
    );
  }

  if (control.itemControl) {
    throw new Error(
      `Toolcraft control validation [collection-item-template] for target "${control.target}": itemControl and itemControls are mutually exclusive.`,
    );
  }

  if (Object.prototype.hasOwnProperty.call(control, "itemDefaultValue")) {
    throw new Error(
      `Toolcraft control validation [collection-item-default] for target "${control.target}": itemDefaultValue cannot be used with itemControls; field defaults own the new record.`,
    );
  }

  const entries = Object.entries(control.itemControls);
  if (entries.length < owner.minimumFields) {
    throw new Error(
      `Toolcraft control validation [collection-item-controls] for target "${control.target}": ${owner.name} itemControls require at least ${owner.minimumFields === 1 ? "one" : "two"} built-in field${owner.minimumFields === 1 ? "" : "s"}.`,
    );
  }

  for (const [id, itemControl] of entries) {
    if (!id.trim() || !isToolcraftCollectionItemControlType(itemControl.type)) {
      throw new Error(
        `Toolcraft control validation [collection-item-controls] for target "${control.target}" itemControls.${id}: unsupported built-in field.`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(itemControl, "defaultValue")) {
      throw new Error(
        `Toolcraft control validation [collection-item-controls] for target "${control.target}" itemControls.${id}: defaultValue is required.`,
      );
    }

    const fitError = getToolcraftSegmentedStaticFitError(itemControl);
    if (fitError) {
      throw new Error(
        `Toolcraft control validation [segmented-control-fit] for target "${control.target}" itemControls.${id}: ${fitError}`,
      );
    }
  }

  if (
    owner.name === "collectionActions" &&
    Array.isArray(control.defaultValue) &&
    control.defaultValue.some((item) => !isPlainRecord(item))
  ) {
    throw new Error(
      `Toolcraft control validation [collection-item-value] for target "${control.target}": every initial compound item must be a plain record.`,
    );
  }
}

function assertSegmentedControlFit(control: ToolcraftControlSchema): void {
  const fitError = getToolcraftSegmentedStaticFitError(control);

  if (fitError) {
    throw new Error(
      `Toolcraft control validation [segmented-control-fit] for target "${control.target}": ${fitError}`,
    );
  }
}

function assertCollectionItemControl(control: ToolcraftControlSchema): void {
  if (
    control.type !== "collectionActions" &&
    control.type !== "sourceCollection"
  ) {
    return;
  }

  if (!control.itemControl) {
    if (control.type === "sourceCollection") {
      throw new Error(
        `Toolcraft control validation [source-collection-item-control] for target "${control.target}": itemControl is required.`,
      );
    }
    return;
  }

  if (!isToolcraftCollectionItemControlType(control.itemControl.type)) {
    throw new Error(
      `Toolcraft control validation [collection-item-control] for target "${control.target}": unsupported collection item control "${String(control.itemControl.type)}".`,
    );
  }

  const fitError = getToolcraftSegmentedStaticFitError(control.itemControl);

  if (fitError) {
    throw new Error(
      `Toolcraft control validation [segmented-control-fit] for target "${control.target}" itemControl: ${fitError}`,
    );
  }
}

function isSliderLikeControl(
  control: ControlWithResolvedApplicability,
): boolean {
  return control.type === "slider" || control.type === "rangeSlider";
}

function getStepMarkerCount(
  control: ControlWithResolvedApplicability,
): number | undefined {
  if (
    typeof control.step !== "number" ||
    typeof control.min !== "number" ||
    typeof control.max !== "number" ||
    !Number.isFinite(control.step) ||
    !Number.isFinite(control.min) ||
    !Number.isFinite(control.max) ||
    control.step <= 0 ||
    control.max <= control.min
  ) {
    return undefined;
  }

  const rawStepCount = (control.max - control.min) / control.step;
  const roundedStepCount = Math.round(rawStepCount);
  const stepCount =
    Math.abs(rawStepCount - roundedStepCount) < Number.EPSILON * 100
      ? roundedStepCount
      : Math.floor(rawStepCount) + 1;

  return Math.max(2, stepCount + 1);
}

function normalizeSliderControlSchema(
  control: ControlWithResolvedApplicability,
): ControlWithResolvedApplicability {
  if (
    !isSliderLikeControl(control) ||
    typeof control.step !== "number" ||
    control.variant !== "discrete"
  ) {
    return control;
  }

  return {
    ...control,
    markerCount: getStepMarkerCount(control) ?? control.markerCount,
    variant: "discrete",
  };
}

function normalizeFileDropControlSchema(
  control: ControlWithResolvedApplicability,
): ResolvedToolcraftControlSchema {
  if (control.assetKind === "model") {
    return normalizeToolcraftModelFileDrop(control);
  }

  if (control.type !== "fileDrop") {
    return control;
  }

  return {
    ...control,
    assetKind: control.assetKind ?? "image",
  };
}

function normalizeControlSchema(
  control: ToolcraftControlSchema,
): ResolvedToolcraftControlSchema {
  const controlSnapshot: ToolcraftControlSchema = { ...control };

  assertRequiredControlStringField(controlSnapshot, "type");
  assertRequiredControlStringField(controlSnapshot, "target");
  assertControlRuntimeBoundary(controlSnapshot);
  assertFileDropHardMaxItems(controlSnapshot);
  assertFileDropVariant(controlSnapshot);
  assertItemControls(controlSnapshot);
  assertSegmentedControlFit(controlSnapshot);
  assertCollectionItemControl(controlSnapshot);

  const {
    applicability: authoredApplicability,
    visibleWhen,
    ...controlWithoutApplicability
  } = controlSnapshot;
  const applicability = resolveToolcraftControlApplicability({
    applicability: authoredApplicability,
    visibleWhen,
  });

  return normalizeFileDropControlSchema(
    normalizeSliderControlSchema({
      ...controlWithoutApplicability,
      applicability,
    }),
  );
}

export function createNormalizedControlsRecord(
  entries: readonly [string, ToolcraftControlSchema][],
): Record<string, ResolvedToolcraftControlSchema> {
  return Object.fromEntries(
    entries.map(([id, control]) => [id, normalizeControlSchema(control)]),
  );
}
