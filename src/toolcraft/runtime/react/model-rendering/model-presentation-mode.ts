import * as React from "react";

import type { ResolvedToolcraftAppSchema } from "../../schema/types";
import type {
  ToolcraftModelPresentationConsumerDeclaration,
  ToolcraftModelPresentationMode,
} from "./model-render-binding";

const RUNTIME_MODEL_PRESENTATION = Object.freeze({
  mode: "runtime" as const,
});

function assertTrimmed(value: string, field: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty trimmed string.`);
  }
}

function collectControlTargets(
  schema: ResolvedToolcraftAppSchema,
): Readonly<{
  modelTargetCounts: ReadonlyMap<string, number>;
  orientationTargets: ReadonlySet<string>;
}> {
  const modelTargetCounts = new Map<string, number>();
  const orientationTargets = new Set<string>();
  for (const section of schema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      if (control.type === "fileDrop" && control.assetKind === "model") {
        modelTargetCounts.set(
          control.target,
          (modelTargetCounts.get(control.target) ?? 0) + 1,
        );
      }
      if (control.type === "orientationGizmo") {
        orientationTargets.add(control.target);
      }
    }
  }
  return Object.freeze({ modelTargetCounts, orientationTargets });
}

function snapshotConsumer(
  consumer: ToolcraftModelPresentationConsumerDeclaration,
): ToolcraftModelPresentationConsumerDeclaration {
  return Object.freeze({
    id: consumer.id,
    ...(consumer.orientationTarget
      ? { orientationTarget: consumer.orientationTarget }
      : {}),
    sourceTarget: consumer.sourceTarget,
  });
}

export function resolveToolcraftModelPresentationMode(
  schema: ResolvedToolcraftAppSchema,
  requested?: ToolcraftModelPresentationMode,
): ToolcraftModelPresentationMode {
  if (!requested || requested.mode === "runtime") {
    return RUNTIME_MODEL_PRESENTATION;
  }

  const ids = new Set<string>();
  const sourceTargets = new Set<string>();
  const { modelTargetCounts, orientationTargets } = collectControlTargets(schema);
  const consumers = requested.consumers.map((consumer) => {
    assertTrimmed(consumer.id, "Model presentation consumer id");
    assertTrimmed(
      consumer.sourceTarget,
      "Model presentation consumer source target",
    );
    if (ids.has(consumer.id)) {
      throw new Error("Model presentation consumer ids must be unique.");
    }
    if (sourceTargets.has(consumer.sourceTarget)) {
      throw new Error("Model presentation consumer source targets must be unique.");
    }
    if (modelTargetCounts.get(consumer.sourceTarget) !== 1) {
      throw new Error(
        `Custom model source target "${consumer.sourceTarget}" must resolve to exactly one model fileDrop control.`,
      );
    }
    if (consumer.orientationTarget !== undefined) {
      assertTrimmed(
        consumer.orientationTarget,
        "Model presentation consumer orientation target",
      );
      if (!orientationTargets.has(consumer.orientationTarget)) {
        throw new Error(
          `Custom model orientation target "${consumer.orientationTarget}" must match an orientationGizmo control.`,
        );
      }
    }
    ids.add(consumer.id);
    sourceTargets.add(consumer.sourceTarget);
    return snapshotConsumer(consumer);
  });

  return Object.freeze({
    consumers: Object.freeze(consumers),
    mode: "custom" as const,
  });
}

export const ToolcraftModelPresentationModeContext =
  React.createContext<ToolcraftModelPresentationMode>(
    RUNTIME_MODEL_PRESENTATION,
  );

export function useToolcraftModelPresentationMode(): ToolcraftModelPresentationMode {
  return React.useContext(ToolcraftModelPresentationModeContext);
}
