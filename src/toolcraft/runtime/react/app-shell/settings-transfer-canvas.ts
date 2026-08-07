import { normalizeToolcraftCanvasAspectRatioValue } from "../../state/canvas-state";
import type { ToolcraftCanvasAspectRatioValue } from "../../state/canvas-state";
import { readCanvasSize } from "../../state/persistence-reader-primitives";
import { isToolcraftPersistenceRecord } from "../../state/persistence-shared";
import type {
  ToolcraftCommand,
  ToolcraftState,
} from "../../state/types";

export const settingsTransferImportHistoryGroup = "settings.import";

export type ToolcraftSettingsCanvasPayload = Readonly<{
  aspectRatio?: ToolcraftCanvasAspectRatioValue;
  mode: ToolcraftState["canvas"]["mode"];
  size: ToolcraftState["canvas"]["size"];
}>;

export type ToolcraftSettingsCanvasImportContext = Readonly<{
  dispatch: (command: ToolcraftCommand) => void;
}>;

export function parseToolcraftSettingsCanvas(
  input: Readonly<{ canvas: unknown; values: unknown; version: 1 | 2 }>,
): ToolcraftSettingsCanvasPayload | null {
  if (!isToolcraftPersistenceRecord(input.canvas)) {
    return null;
  }

  const size = readCanvasSize(input.canvas.size);

  if (!size) {
    return null;
  }

  const values = isToolcraftPersistenceRecord(input.values) ? input.values : {};
  const aspectCandidate =
    input.version === 2 && "aspectRatio" in input.canvas
      ? input.canvas.aspectRatio
      : values["canvas.aspectRatio"];
  const aspectRatio = aspectCandidate === undefined
    ? undefined
    : normalizeToolcraftCanvasAspectRatioValue(aspectCandidate, size);
  const mode =
    input.version === 2 && input.canvas.mode === "infinite"
      ? "infinite"
      : "finite";

  return {
    ...(aspectRatio ? { aspectRatio } : {}),
    mode,
    size,
  };
}

export function applyToolcraftSettingsCanvas(
  context: ToolcraftSettingsCanvasImportContext,
  canvas: ToolcraftSettingsCanvasPayload,
): void {
  context.dispatch({
    ...(canvas.aspectRatio ? { aspectRatio: canvas.aspectRatio } : {}),
    history: "merge",
    historyGroup: settingsTransferImportHistoryGroup,
    label: "Import settings",
    mode: canvas.mode,
    size: canvas.size,
    type: "canvas.applySettings",
  });
}
