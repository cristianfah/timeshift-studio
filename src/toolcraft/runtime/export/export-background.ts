import type { ToolcraftState } from "../state/types";

export type ToolcraftPreviewBackgroundOptions = {
  includeBackgroundTarget?: string;
  state: ToolcraftState;
};

export function shouldIncludeToolcraftPreviewBackground({
  includeBackgroundTarget = "export.includeBackground",
  state,
}: ToolcraftPreviewBackgroundOptions): boolean {
  if (state.canvas.mode === "infinite") {
    return false;
  }

  const includeBackgroundValue = state.values[includeBackgroundTarget];

  if (typeof includeBackgroundValue === "boolean") {
    return includeBackgroundValue;
  }

  if (typeof includeBackgroundValue === "string") {
    const normalizedValue = includeBackgroundValue.trim().toLowerCase();

    if (
      normalizedValue === "false" ||
      normalizedValue === "off" ||
      normalizedValue === "no" ||
      normalizedValue === "transparent" ||
      normalizedValue === "exclude"
    ) {
      return false;
    }

    if (
      normalizedValue === "true" ||
      normalizedValue === "on" ||
      normalizedValue === "yes" ||
      normalizedValue === "include"
    ) {
      return true;
    }
  }

  return true;
}
