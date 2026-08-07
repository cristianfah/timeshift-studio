import {
  doesToolcraftApplicabilityMatch,
  doesToolcraftPredicateMatchValue,
  getToolcraftApplicabilityPredicates,
  type ResolvedToolcraftAppSchema,
  type ResolvedToolcraftControlSchema,
  type ToolcraftControlPredicateSchema,
} from "@/toolcraft/runtime";

import { getToolcraftApplicabilitySelectorDomain } from "./control-applicability";
import {
  isToolcraftProductSectionControl,
  isToolcraftVisibleAcceptanceControl,
} from "./controls";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

export type ToolcraftControlApplicabilityCase = Readonly<{
  expectation: "hidden" | "visible";
  selectorControlType:
    | "checkbox"
    | "imagePicker"
    | "segmented"
    | "select"
    | "slider"
    | "switch"
    | "tabs";
  selectorLabel: string;
  selectorOptionLabel?: string;
  selectorTarget: string;
  selectorValue: boolean | number | string;
  target: string;
}>;

type IndexedControl = Readonly<{
  control: ResolvedToolcraftControlSchema;
  id: string;
  sectionId: string;
}>;

type ApplicabilitySelectorControlType =
  ToolcraftControlApplicabilityCase["selectorControlType"];

function indexControls(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
): Map<string, IndexedControl> {
  const controls = new Map<string, IndexedControl>();

  for (const section of schema.panels.controls?.sections ?? []) {
    for (const [id, control] of Object.entries(section.controls)) {
      controls.set(control.target, { control, id, sectionId: section.id });
    }
  }

  return controls;
}

function getApplicabilitySelectorControlType(
  control: ResolvedToolcraftControlSchema,
): ApplicabilitySelectorControlType | null {
  switch (control.type) {
    case "checkbox":
    case "imagePicker":
    case "segmented":
    case "select":
    case "slider":
    case "switch":
    case "tabs":
      return control.type;
    default:
      return null;
  }
}

function getSelectorOptionLabel(
  control: ResolvedToolcraftControlSchema,
  value: boolean | number | string,
): string | undefined {
  if (
    control.type === "select" ||
    control.type === "segmented" ||
    control.type === "tabs"
  ) {
    return control.options?.find((option) => option.value === value)?.label;
  }

  if (control.type === "imagePicker") {
    const item = control.items?.find((candidate) => candidate.value === value);
    return item ? (item.alt ?? item.value) : undefined;
  }

  return undefined;
}

function getSemanticPeerTargets({
  dependent,
  sectionInventory,
  schema,
}: {
  dependent: IndexedControl;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
  schema: Pick<ResolvedToolcraftAppSchema, "panels">;
}): readonly string[] {
  const inventoryEntry = sectionInventory.find((entry) =>
    entry.targets.includes(dependent.control.target),
  );

  if (inventoryEntry) {
    return inventoryEntry.targets;
  }

  if (dependent.sectionId !== "runtime.setup") {
    return [];
  }

  const setupSection = schema.panels.controls?.sections.find(
    (section) => section.id === "runtime.setup",
  );

  return Object.values(setupSection?.controls ?? {})
    .filter(isToolcraftProductSectionControl)
    .map((control) => control.target);
}

function getPredicatesTargeting(
  controlsByTarget: ReadonlyMap<string, IndexedControl>,
  peerTargets: readonly string[],
  selectorTarget: string,
): ToolcraftControlPredicateSchema[] {
  return peerTargets.flatMap((target) => {
    const applicabilityControl = controlsByTarget.get(target)?.control;
    const applicability = applicabilityControl?.applicability;

    return applicability
      ? getToolcraftApplicabilityPredicates(applicability).filter(
          (predicate) => predicate.target === selectorTarget,
        )
      : [];
  });
}

function getSatisfyingBaseline(
  dependent: ResolvedToolcraftControlSchema,
  controlsByTarget: ReadonlyMap<string, IndexedControl>,
): Map<string, boolean | number | string> {
  const baseline = new Map<string, boolean | number | string>();
  const predicates = getToolcraftApplicabilityPredicates(
    dependent.applicability,
  );
  const predicatesByTarget = new Map<string, ToolcraftControlPredicateSchema[]>();

  for (const predicate of predicates) {
    const targetPredicates = predicatesByTarget.get(predicate.target) ?? [];
    targetPredicates.push(predicate);
    predicatesByTarget.set(predicate.target, targetPredicates);
  }

  for (const [target, targetPredicates] of predicatesByTarget) {
    const selector = controlsByTarget.get(target)?.control;

    if (!selector) {
      continue;
    }

    const domain = getToolcraftApplicabilitySelectorDomain(
      selector,
      targetPredicates,
    );

    if (domain.status !== "supported") {
      continue;
    }

    const value = domain.values.find((candidate) =>
      targetPredicates.every((predicate) =>
        doesToolcraftPredicateMatchValue(predicate, candidate),
      ),
    );

    if (value !== undefined) {
      baseline.set(target, value);
    }
  }

  return baseline;
}

export function getToolcraftControlApplicabilityCases(
  input: Readonly<{
    schema: Pick<ResolvedToolcraftAppSchema, "panels">;
    sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
    target: string;
  }>,
): ToolcraftControlApplicabilityCase[] {
  const controlsByTarget = indexControls(input.schema);
  const dependent = controlsByTarget.get(input.target);

  if (
    !dependent ||
    !isToolcraftVisibleAcceptanceControl(dependent.control)
  ) {
    return [];
  }

  const peerTargets = getSemanticPeerTargets({
    dependent,
    schema: input.schema,
    sectionInventory: input.sectionInventory,
  });
  const baseline = getSatisfyingBaseline(dependent.control, controlsByTarget);
  const cases: ToolcraftControlApplicabilityCase[] = [];

  for (const selectorTarget of peerTargets) {
    if (selectorTarget === dependent.control.target) {
      continue;
    }

    const indexedSelector = controlsByTarget.get(selectorTarget);

    if (!indexedSelector) {
      continue;
    }
    const { control: selector } = indexedSelector;

    const peerPredicates = getPredicatesTargeting(
      controlsByTarget,
      peerTargets,
      selectorTarget,
    );

    if (selector.type === "slider" && peerPredicates.length === 0) {
      continue;
    }

    const domain = getToolcraftApplicabilitySelectorDomain(
      selector,
      peerPredicates,
    );

    if (domain.status !== "supported") {
      continue;
    }

    const selectorControlType = getApplicabilitySelectorControlType(selector);

    if (!selectorControlType) {
      continue;
    }

    for (const selectorValue of domain.values) {
      const values = new Map(baseline);
      values.set(selectorTarget, selectorValue);
      const selectorOptionLabel = getSelectorOptionLabel(
        selector,
        selectorValue,
      );
      const matches = doesToolcraftApplicabilityMatch(
        dependent.control.applicability,
        (target) =>
          values.get(target) ??
          controlsByTarget.get(target)?.control.defaultValue,
      );

      cases.push({
        expectation: matches ? "visible" : "hidden",
        selectorControlType,
        selectorLabel:
          typeof selector.label === "string"
            ? selector.label
            : indexedSelector.id,
        ...(selectorOptionLabel ? { selectorOptionLabel } : {}),
        selectorTarget,
        selectorValue,
        target: dependent.control.target,
      });
    }
  }

  return cases;
}

export function getToolcraftApplicabilityRequirementId(
  baseRequirementId: string,
  applicabilityCase: ToolcraftControlApplicabilityCase,
): string {
  const serializedValue =
    JSON.stringify(applicabilityCase.selectorValue) ??
    String(applicabilityCase.selectorValue);

  return `${baseRequirementId}#applicability:${applicabilityCase.selectorTarget}=${encodeURIComponent(serializedValue)}:${applicabilityCase.expectation}`;
}
