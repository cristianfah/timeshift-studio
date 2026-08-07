import {
  areToolcraftPredicatesProvablyExclusive,
  areToolcraftValuesEqual,
  doesToolcraftPredicateMatchValue,
  getToolcraftApplicabilityPredicates,
  type ResolvedToolcraftControlSchema,
  type ToolcraftControlPredicateSchema,
} from "@/toolcraft/runtime";

import type { ToolcraftAcceptanceValidationContext } from "./validation-pipeline";

export type ToolcraftApplicabilitySelectorValue = boolean | number | string;

export type ToolcraftApplicabilitySelectorDomain =
  | Readonly<{
      status: "supported";
      values: readonly ToolcraftApplicabilitySelectorValue[];
    }>
  | Readonly<{
      reason: string;
      status: "unsupported";
    }>;

const numericOperators = [
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;

function addUniqueValue(
  values: ToolcraftApplicabilitySelectorValue[],
  value: unknown,
): void {
  if (
    (typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string") &&
    !values.some((existing) => areToolcraftValuesEqual(existing, value))
  ) {
    values.push(value);
  }
}

function getPredicateFiniteValues(
  predicate: ToolcraftControlPredicateSchema,
): unknown[] {
  return [
    ...(Object.prototype.hasOwnProperty.call(predicate, "equals")
      ? [predicate.equals]
      : []),
    ...(Object.prototype.hasOwnProperty.call(predicate, "notEquals")
      ? [predicate.notEquals]
      : []),
    ...(predicate.oneOf ?? []),
    ...(predicate.notOneOf ?? []),
  ];
}

function getDiscreteSliderDomain(
  control: ResolvedToolcraftControlSchema,
  predicates: readonly ToolcraftControlPredicateSchema[],
): ToolcraftApplicabilitySelectorDomain {
  if (
    control.type !== "slider" ||
    control.variant !== "discrete" ||
    typeof control.min !== "number" ||
    typeof control.max !== "number" ||
    typeof control.step !== "number" ||
    !Number.isFinite(control.min) ||
    !Number.isFinite(control.max) ||
    !Number.isFinite(control.step) ||
    control.max < control.min ||
    control.step <= 0
  ) {
    return {
      reason: `${control.target} is not a bounded discrete scalar slider`,
      status: "unsupported",
    };
  }

  const { max, min, step } = control;
  const candidates: number[] = [];
  const clampAligned = (value: number): number => {
    const clamped = Math.min(max, Math.max(min, value));
    const stepIndex = Math.round((clamped - min) / step);
    const aligned = Math.min(max, Math.max(min, min + stepIndex * step));
    return Number(aligned.toFixed(12));
  };
  const addCandidate = (value: unknown): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }

    for (const candidate of [value - step, value, value + step]) {
      const aligned = clampAligned(candidate);

      if (!candidates.includes(aligned)) {
        candidates.push(aligned);
      }
    }
  };

  addCandidate(min);
  addCandidate(max);
  addCandidate(control.defaultValue);

  for (const predicate of predicates) {
    for (const value of getPredicateFiniteValues(predicate)) {
      addCandidate(value);
    }
    for (const operator of numericOperators) {
      addCandidate(predicate[operator]);
    }
  }

  return {
    status: "supported",
    values: candidates.sort((left, right) => left - right),
  };
}

export function getToolcraftApplicabilitySelectorDomain(
  control: ResolvedToolcraftControlSchema,
  predicates: readonly ToolcraftControlPredicateSchema[],
): ToolcraftApplicabilitySelectorDomain {
  if (
    control.type === "select" ||
    control.type === "segmented" ||
    control.type === "tabs"
  ) {
    const values: ToolcraftApplicabilitySelectorValue[] = [];

    for (const option of control.options ?? []) {
      addUniqueValue(values, option.value);
    }

    return values.length > 0
      ? { status: "supported", values }
      : {
          reason: `${control.target} has no declared selector options`,
          status: "unsupported",
        };
  }

  if (control.type === "imagePicker") {
    const values: ToolcraftApplicabilitySelectorValue[] = [];

    for (const item of control.items ?? []) {
      addUniqueValue(values, item.value);
    }

    return values.length > 0
      ? { status: "supported", values }
      : {
          reason: `${control.target} has no declared image picker items`,
          status: "unsupported",
        };
  }

  if (control.type === "switch" || control.type === "checkbox") {
    return { status: "supported", values: [false, true] };
  }

  return getDiscreteSliderDomain(control, predicates);
}

function getInvalidFinitePredicateValues(
  predicates: readonly ToolcraftControlPredicateSchema[],
  domain: readonly ToolcraftApplicabilitySelectorValue[],
): unknown[] {
  const values: unknown[] = [];

  for (const predicate of predicates) {
    for (const value of getPredicateFiniteValues(predicate)) {
      if (
        !domain.some((candidate) =>
          areToolcraftValuesEqual(candidate, value),
        ) &&
        !values.some((candidate) =>
          areToolcraftValuesEqual(candidate, value),
        )
      ) {
        values.push(value);
      }
    }
  }

  return values;
}

function predicatesArePairwiseExclusive(
  predicates: readonly ToolcraftControlPredicateSchema[],
): boolean {
  for (let leftIndex = 0; leftIndex < predicates.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < predicates.length;
      rightIndex += 1
    ) {
      const left = predicates[leftIndex];
      const right = predicates[rightIndex];

      if (
        left &&
        right &&
        areToolcraftPredicatesProvablyExclusive(left, right)
      ) {
        return true;
      }
    }
  }

  return false;
}

export function getToolcraftControlApplicabilityErrors({
  controls,
  productReadiness,
}: Pick<
  ToolcraftAcceptanceValidationContext,
  "controls" | "productReadiness"
>): string[] {
  if (productReadiness.mode !== "product") {
    return [];
  }

  const errors: string[] = [];
  const controlsByTarget = new Map(
    controls.map(({ control }) => [control.target, control] as const),
  );

  for (const { control } of controls) {
    const { applicability } = control;

    if (applicability.origin === "implicit") {
      errors.push(
        `${control.target} must declare explicit applicability as always or conditional.`,
      );
      continue;
    }

    if (applicability.origin === "legacy") {
      errors.push(
        `${control.target} uses legacy visibleWhen; product controls must declare explicit applicability.`,
      );
    }

    const predicates = getToolcraftApplicabilityPredicates(applicability);
    const predicatesByTarget = new Map<
      string,
      ToolcraftControlPredicateSchema[]
    >();

    for (const predicate of predicates) {
      const selector = controlsByTarget.get(predicate.target);

      if (!selector) {
        errors.push(
          `${control.target} predicate target "${predicate.target}" does not exist.`,
        );
        continue;
      }

      if (selector.target === control.target) {
        errors.push(`${control.target} applicability cannot gate itself.`);
        continue;
      }

      const targetPredicates = predicatesByTarget.get(predicate.target) ?? [];
      targetPredicates.push(predicate);
      predicatesByTarget.set(predicate.target, targetPredicates);
    }

    for (const [selectorTarget, targetPredicates] of predicatesByTarget) {
      const selector = controlsByTarget.get(selectorTarget);

      if (!selector) {
        continue;
      }

      const domain = getToolcraftApplicabilitySelectorDomain(
        selector,
        targetPredicates,
      );

      if (domain.status === "unsupported") {
        errors.push(
          `${selector.target} is not a supported applicability selector: ${domain.reason}.`,
        );
        continue;
      }

      if (
        selector.type === "select" ||
        selector.type === "segmented" ||
        selector.type === "tabs" ||
        selector.type === "imagePicker" ||
        selector.type === "switch" ||
        selector.type === "checkbox"
      ) {
        for (const invalidValue of getInvalidFinitePredicateValues(
          targetPredicates,
          domain.values,
        )) {
          errors.push(
            `${control.target} applicability value ${JSON.stringify(invalidValue)} is not an option of ${selector.target}.`,
          );
        }
      }

      if (predicatesArePairwiseExclusive(targetPredicates)) {
        errors.push(`${control.target} applicability is unsatisfiable.`);
        continue;
      }

      if (
        !domain.values.some((value) =>
          targetPredicates.every((predicate) =>
            doesToolcraftPredicateMatchValue(predicate, value),
          ),
        )
      ) {
        errors.push(
          `${control.target} has no satisfying value in ${selector.target}.`,
        );
      }
    }
  }

  return errors;
}
