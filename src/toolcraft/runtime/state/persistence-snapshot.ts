import type { ResolvedToolcraftAppSchema } from "../schema/types";
import { cloneToolcraftMediaAssets } from "./media-defaults";
import type { ToolcraftPersistencePayload } from "./persistence-shared";
import type { ToolcraftInitialState, ToolcraftState } from "./types";

function pickPersistedValues(
  state: ToolcraftState,
  persistence: Extract<
    ResolvedToolcraftAppSchema["persistence"],
    { storage: "localStorage" }
  >,
): Record<string, unknown> | undefined {
  const values: Record<string, unknown> = {};
  const targets = new Set([
    ...Object.keys(state.defaults),
    ...persistence.additionalValueTargets,
  ]);

  for (const target of targets) {
    if (Object.hasOwn(state.values, target)) {
      values[target] = state.values[target];
    }
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

export function createToolcraftPersistenceSnapshot(
  state: ToolcraftState,
  persistence: ResolvedToolcraftAppSchema["persistence"],
): ToolcraftPersistencePayload | undefined {
  if (persistence.storage !== "localStorage") {
    return undefined;
  }

  const included = new Set(persistence.include);
  const initialState: ToolcraftInitialState = {};

  if (included.has("values")) {
    initialState.values = pickPersistedValues(state, persistence);
  }

  if (included.has("canvas")) {
    initialState.canvas = state.canvas;
  }

  if (included.has("panels")) {
    initialState.panels = state.panels;
  }

  if (included.has("timeline")) {
    initialState.timeline = state.timeline;
  }

  if (included.has("layers")) {
    initialState.layers = state.layers;
    initialState.selectedLayerId = state.selectedLayerId;
  }

  if (included.has("media")) {
    initialState.mediaAssets = cloneToolcraftMediaAssets(state.mediaAssets);
  }

  return {
    state: initialState,
    version: persistence.version,
  };
}
