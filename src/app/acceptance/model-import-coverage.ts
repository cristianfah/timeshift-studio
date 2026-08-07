export type ToolcraftModelImportCoverage =
  | "advertised-format-import"
  | "appearance-preservation"
  | "clean-commit"
  | "deterministic-root-selection"
  | "export-output"
  | "fallback-appearance"
  | "fatal-rejection"
  | "history-reset"
  | "package-extraction"
  | "persistence-restore"
  | "pixel-output"
  | "presentation-consumer-readiness"
  | "preview-output"
  | "repair-action"
  | "repair-progress"
  | "repairable-diagnosis"
  | "resource-unavailable"
  | "staged-preview"
  | "verified-repair";

export const TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE = [
  "advertised-format-import",
  "staged-preview",
  "clean-commit",
  "package-extraction",
  "deterministic-root-selection",
  "appearance-preservation",
  "fallback-appearance",
  "presentation-consumer-readiness",
  "pixel-output",
  "repairable-diagnosis",
  "repair-action",
  "repair-progress",
  "verified-repair",
  "fatal-rejection",
  "persistence-restore",
  "resource-unavailable",
  "preview-output",
  "export-output",
  "history-reset",
] as const satisfies readonly ToolcraftModelImportCoverage[];
