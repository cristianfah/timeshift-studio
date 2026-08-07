import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import type {
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
  ToolcraftViewInteractionEvidenceSource,
  ToolcraftViewInteractionIntent,
} from "./types";

type ToolcraftViewInteractionValidationInput = {
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
  transferMode: ToolcraftTransferMode;
};

const viewInteractionEvidenceSources = new Set<ToolcraftViewInteractionEvidenceSource>([
  "explicit-user-request",
  "inspected-reference",
]);

function collectOrientationTargets(schema: ResolvedToolcraftAppSchema): string[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type === "orientationGizmo" ? [control.target] : [],
    ),
  );
}

function getEvidenceErrors({
  evidence,
  mode,
  source,
}: Extract<
  ToolcraftViewInteractionIntent,
  { mode: "fixed-camera" | "timeline-camera" }
>): string[] {
  const errors: string[] = [];

  if (evidence.trim().length === 0) {
    errors.push(
      `${mode} evidence must be non-empty and identify the explicit request or inspected reference that owns the camera behavior.`,
    );
  }

  if (!viewInteractionEvidenceSources.has(source)) {
    errors.push(
      `${mode} source must be explicit-user-request or inspected-reference; an agent-authored fixed camera is not an accepted default.`,
    );
  }

  return errors;
}

export function getToolcraftViewInteractionErrors({
  productReadiness,
  schema,
  transferMode,
}: ToolcraftViewInteractionValidationInput): string[] {
  if (productReadiness.mode !== "product") {
    return [];
  }

  const intent = productReadiness.viewInteraction;

  if (!intent) {
    return [
      "Product readiness must declare viewInteraction before controls or renderer code so spatial scenes cannot silently default to a fixed camera.",
    ];
  }

  const schemaTargets = collectOrientationTargets(schema);
  const errors: string[] = [];

  if (intent.mode === "orbit") {
    const normalizedIntentTargets = intent.orientationTargets.map((target) =>
      target.trim(),
    );
    const uniqueIntentTargets = new Set(normalizedIntentTargets);

    if (
      normalizedIntentTargets.length === 0 ||
      normalizedIntentTargets.some((target) => target.length === 0)
    ) {
      errors.push(
        "orbit viewInteraction must list at least one non-empty orientation target.",
      );
    }

    if (uniqueIntentTargets.size !== normalizedIntentTargets.length) {
      errors.push("orbit orientationTargets must be unique.");
    }

    for (const target of uniqueIntentTargets) {
      if (target.length > 0 && !schemaTargets.includes(target)) {
        errors.push(
          `orbit target "${target}" requires a matching orientationGizmo schema control.`,
        );
      }
    }

    for (const target of new Set(schemaTargets)) {
      if (!uniqueIntentTargets.has(target)) {
        errors.push(
          `orientationGizmo target "${target}" is missing from orbit orientationTargets.`,
        );
      }
    }

    return errors;
  }

  if (schemaTargets.length > 0) {
    errors.push(
      `${intent.mode} viewInteraction cannot declare orientationGizmo controls; use orbit intent or remove direct 3D orientation UI.`,
    );
  }

  if (intent.mode === "non-spatial") {
    if (intent.reason.trim().length === 0) {
      errors.push(
        "non-spatial viewInteraction reason must explain why the product has no visible three-dimensional scene or model.",
      );
    }

    return errors;
  }

  errors.push(...getEvidenceErrors(intent));

  if (intent.mode === "timeline-camera") {
    const animationMode = transferMode.animationIntent?.mode ?? "none";

    if (
      animationMode !== "timeline-playback" &&
      animationMode !== "timeline-keyframes"
    ) {
      errors.push(
        "timeline-camera requires timeline-playback or timeline-keyframes animation intent.",
      );
    }

    if (!schema.panels.timeline?.enabled) {
      errors.push("timeline-camera requires an enabled Toolcraft timeline.");
    }
  }

  return errors;
}
