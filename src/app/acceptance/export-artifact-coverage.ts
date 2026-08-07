import type {
  ResolvedToolcraftAppSchema,
  ToolcraftActionSchema,
} from "@/toolcraft/runtime";

import { getControlActions } from "./actions";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftExportArtifactCoverage,
} from "./types";

const requiredCoverageByRole = {
  "export-image": "all-required-image-export-behavior",
  "export-video": "all-required-video-export-behavior",
} as const satisfies Record<
  "export-image" | "export-video",
  ToolcraftExportArtifactCoverage
>;

function getCoverageValues(
  entry: ToolcraftComponentAcceptance,
): readonly ToolcraftExportArtifactCoverage[] {
  if (!entry.exportArtifactCoverage) return [];
  return typeof entry.exportArtifactCoverage === "string"
    ? [entry.exportArtifactCoverage]
    : entry.exportArtifactCoverage;
}

function isMediaExportAction(
  action: ToolcraftActionSchema | string,
): action is ToolcraftActionSchema & {
  role: "export-image" | "export-video";
} {
  return (
    typeof action !== "string" &&
    (action.role === "export-image" || action.role === "export-video")
  );
}

function collectMediaExportActions(schema: ResolvedToolcraftAppSchema) {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type !== "panelActions" || !control.target
        ? []
        : getControlActions(control)
            .filter(isMediaExportAction)
            .map((action) => ({
              requiredCoverage: requiredCoverageByRole[action.role],
              role: action.role,
              target: control.target,
              value: action.value,
            })),
    ),
  );
}

export function getToolcraftExportArtifactCoverageErrors({
  acceptance,
  schema,
}: Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  schema: ResolvedToolcraftAppSchema;
}>): string[] {
  const errors: string[] = [];
  const exportActions = collectMediaExportActions(schema);

  for (const entry of acceptance) {
    const coverage = getCoverageValues(entry);
    if (coverage.length === 0) continue;
    if (entry.evidence !== "exported-bytes") {
      errors.push(
        `Acceptance "${entry.id}" declares exportArtifactCoverage but evidence is not "exported-bytes".`,
      );
    }
    if (!entry.automated || !entry.browser) {
      errors.push(
        `Acceptance "${entry.id}" exportArtifactCoverage requires automated and browser proof.`,
      );
    }
    for (const value of coverage) {
      const hasMatchingAction = exportActions.some(
        (action) =>
          action.target === entry.target &&
          action.requiredCoverage === value &&
          (entry.actionCoverage ?? []).includes(action.value),
      );
      if (!hasMatchingAction) {
        errors.push(
          `Acceptance "${entry.id}" declares ${value} without a matching typed export action in target/actionCoverage.`,
        );
      }
    }
  }

  for (const action of exportActions) {
    const hasCoverage = acceptance.some(
      (entry) =>
        entry.target === action.target &&
        entry.evidence === "exported-bytes" &&
        entry.automated &&
        entry.browser &&
        (entry.actionCoverage ?? []).includes(action.value) &&
        getCoverageValues(entry).includes(action.requiredCoverage),
    );
    if (!hasCoverage) {
      errors.push(
        `Typed ${action.role} action "${action.value}" on "${action.target}" requires ${action.requiredCoverage} acceptance coverage.`,
      );
    }
  }

  return errors;
}
