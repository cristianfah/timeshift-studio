export type ToolcraftCanvasSizingCoverage =
  | "fixed-output-size"
  | "intrinsic-media-size";

export type ToolcraftInfinityCanvasCoverage =
  | "mode-and-restoration"
  | "scene-bounds-image-export"
  | "scene-bounds-video-export";

export type ToolcraftRenderScaleState =
  | "interaction"
  | "playback"
  | "steady";

export type ToolcraftRenderScaleCoverage = Readonly<{
  kind: "selected-backing-pixels";
  states: readonly ToolcraftRenderScaleState[];
}>;
