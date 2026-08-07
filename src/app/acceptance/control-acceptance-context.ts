import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
  ToolcraftTimelineMode,
} from "@/toolcraft/runtime";

import { isRuntimeSetupControlTarget } from "./runtime-setup";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
  ToolcraftVisibleControl,
} from "./types";

export type ToolcraftControlAcceptanceContext = {
  acceptance: readonly ToolcraftComponentAcceptance[];
  controls: readonly ToolcraftVisibleControl[];
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
  timelineMode: ToolcraftTimelineMode | null;
};

export type ToolcraftControlRuleContext = {
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  controlTargets: ReadonlySet<string>;
  label: string;
  layersEnabled: boolean;
  sectionTitle: string | undefined;
  timelineMode: ToolcraftTimelineMode | null;
};

export function getControlAcceptanceByTarget(
  acceptance: readonly ToolcraftComponentAcceptance[],
): ReadonlyMap<string, ToolcraftComponentAcceptance> {
  return new Map(
    acceptance.flatMap((entry) => {
      if (entry.kind === "control" && entry.target) {
        return [[entry.target, entry] as const];
      }

      if (
        entry.kind === "canvas-handle" &&
        entry.componentType === "orientationGizmo" &&
        entry.canvasHandle?.writesTarget
      ) {
        return [[entry.canvasHandle.writesTarget, entry] as const];
      }

      return [];
    }),
  );
}

export function getControlTargets(
  controls: readonly ToolcraftVisibleControl[],
): ReadonlySet<string> {
  return new Set(controls.map(({ control }) => control.target));
}

export function getAcceptanceEntryTargetErrors({
  acceptance,
  controlTargets,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  controlTargets: ReadonlySet<string>;
}): string[] {
  const errors: string[] = [];

  for (const entry of acceptance) {
    if (
      entry.kind === "control" &&
      entry.target &&
      !controlTargets.has(entry.target) &&
      !isRuntimeSetupControlTarget(entry.target)
    ) {
      errors.push(
        `${entry.id} points to missing control target ${entry.target}.`,
      );
    }
  }

  return errors;
}
