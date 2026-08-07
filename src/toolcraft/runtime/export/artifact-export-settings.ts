import type { ToolcraftState } from "../state/types";
import { ToolcraftArtifactExportError } from "./export-error";

export const toolcraftImageExportFormatTarget = "export.image.format";
export const toolcraftImageExportResolutionTarget = "export.image.resolution";
export const toolcraftVideoExportFormatTarget = "export.video.format";
export const toolcraftVideoExportResolutionTarget = "export.video.resolution";

export type ToolcraftImageExportFormat = "jpg" | "png";
export type ToolcraftImageExportPresetResolution = "2k" | "4k" | "8k";
export type ToolcraftVideoExportFormat = "mp4" | "webm";
export type ToolcraftVideoExportPresetResolution = "4k" | "current";

export type ToolcraftResolvedImageExportSettings = Readonly<{
  format: ToolcraftImageExportFormat;
  resolution: ToolcraftImageExportPresetResolution;
}>;

export type ToolcraftResolvedVideoExportSettings = Readonly<{
  format: ToolcraftVideoExportFormat;
  resolution: ToolcraftVideoExportPresetResolution;
}>;

function getSettingValue(
  state: ToolcraftState,
  target: string,
  fallback: string,
): unknown {
  return state.values[target] ?? state.defaults[target] ?? fallback;
}

function invalidSetting(target: string): never {
  throw new ToolcraftArtifactExportError({
    code: "invalid-export-setting",
    message: `Toolcraft export setting ${target} is invalid.`,
    target,
  });
}

function resolveImageFormat(state: ToolcraftState): ToolcraftImageExportFormat {
  const value = getSettingValue(state, toolcraftImageExportFormatTarget, "png");
  return value === "jpg" || value === "png"
    ? value
    : invalidSetting(toolcraftImageExportFormatTarget);
}

function resolveImageResolution(
  state: ToolcraftState,
): ToolcraftImageExportPresetResolution {
  const value = getSettingValue(
    state,
    toolcraftImageExportResolutionTarget,
    "4k",
  );
  return value === "2k" || value === "4k" || value === "8k"
    ? value
    : invalidSetting(toolcraftImageExportResolutionTarget);
}

function resolveVideoFormat(state: ToolcraftState): ToolcraftVideoExportFormat {
  const value = getSettingValue(state, toolcraftVideoExportFormatTarget, "mp4");
  return value === "mp4" || value === "webm"
    ? value
    : invalidSetting(toolcraftVideoExportFormatTarget);
}

function resolveVideoResolution(
  state: ToolcraftState,
): ToolcraftVideoExportPresetResolution {
  const value = getSettingValue(
    state,
    toolcraftVideoExportResolutionTarget,
    "current",
  );
  return value === "4k" || value === "current"
    ? value
    : invalidSetting(toolcraftVideoExportResolutionTarget);
}

export function resolveToolcraftImageExportSettings(
  state: ToolcraftState,
): ToolcraftResolvedImageExportSettings {
  return Object.freeze({
    format: resolveImageFormat(state),
    resolution: resolveImageResolution(state),
  });
}

export function resolveToolcraftVideoExportSettings(
  state: ToolcraftState,
): ToolcraftResolvedVideoExportSettings {
  return Object.freeze({
    format: resolveVideoFormat(state),
    resolution: resolveVideoResolution(state),
  });
}
