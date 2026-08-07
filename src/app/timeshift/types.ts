// Shared types for the ported TIMESHIFT engine.
//
// The engine, the effect modules and the animation helpers are a direct port
// of the vanilla app (archived in `legacy/vanilla-v1`). Shaders and algorithms
// are unchanged; only types were added.

/** A numeric, animatable effect parameter. */
export type NumericParamDef = {
  def: number;
  help?: string;
  key: string;
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
};

/** A discrete choice parameter. Never animated. */
export type SelectParamDef = {
  def: string;
  help?: string;
  key: string;
  label: string;
  options: readonly (readonly [string, string])[];
  type: "select";
};

export type EffectParamDef = NumericParamDef | SelectParamDef;

export function isSelectParam(def: EffectParamDef): def is SelectParamDef {
  return "type" in def && def.type === "select";
}

/** Resolved parameter values for one effect instance at one point in time. */
export type EffectParamValues = Record<string, number | string>;

/** Clip-time context shared by every render pass. */
export type RenderContext = {
  duration: number;
  fps: number;
  /**
   * Live luminance sampler of the preview frame, in top-down coordinates.
   * Only the time-map readout supplies it; shaders read the frame directly.
   */
  luma?: (x: number, yTop: number) => number;
  time: number;
};

/** A user-placed tracking seed, in normalized frame coordinates. */
export type TrackPoint = {
  anchor: number;
  id: string;
  x: number;
  y: number;
};

/**
 * One drawable tracker readout. Both trackers (automatic motion regions and
 * user-placed points) reduce to this shape.
 */
export type TrackMark = {
  cx: number;
  cy: number;
  h: number;
  id: number;
  lost: boolean;
  /** True for user-placed points, false for auto-detected regions. */
  manual: boolean;
  /** Seed id, for manual marks only. */
  sid?: string;
  tag: string;
  trail: number[];
  value: string;
  vx: number;
  vy: number;
  w: number;
};

/**
 * One entry of the render chain. Product state lives in the Toolcraft runtime;
 * this is the per-frame view the engine consumes, plus the mutable side data
 * that effect modules own (tracker templates, uploaded maps, glyph atlases).
 */
export type ChainItem = {
  enabled: boolean;
  id: string;
  mapImage?: ImageBitmap | null;
  mapStamp?: number;
  /** Live tracker readouts, written back by the motion-track analyze pass. */
  marks?: TrackMark[];
  points?: TrackPoint[];
  type: string;
};

export type UniformLocator = (name: string) => WebGLUniformLocation | null;

/** Per-pixel delay field, used by the time-map readout. */
export type DelayMap = (x: number, y: number) => number;

export type LumaGrid = {
  cols: number;
  key: string;
  luma: Float32Array;
  rows: number;
  stamp: number;
};

export type InstanceTextureSlot = {
  /** Glyph count, for atlas slots. */
  count?: number;
  init: boolean;
  stamp: number;
  tex: WebGLTexture | null;
};

/** The subset of the engine that effect modules are allowed to touch. */
export type EffectHost = {
  height: number;
  instanceTex(id: string): InstanceTextureSlot;
  lumaGrid(cols?: number): LumaGrid | null;
  uploadTex(slot: InstanceTextureSlot, source: TexImageSource): void;
  width: number;
};

/** Render context plus the per-instance parameter resolver. */
export type AnalyzeContext = RenderContext & {
  params: (fx: ChainItem) => EffectParamValues;
};

export type EffectModule<P extends EffectParamValues = EffectParamValues> = {
  /** CPU pass that runs before any shader, for trackers and analyzers. */
  analyze?(host: EffectHost, fx: ChainItem, ctx: AnalyzeContext): void;
  /** CPU mirror of the shader delay field, for the time-map readout. */
  delayMap?(values: P, ctx: RenderContext, fx?: ChainItem): DelayMap;
  desc: string;
  frag: string;
  hasCustomMap?: boolean;
  hasTrackPoints?: boolean;
  label: string;
  /** Worst-case history depth, in frames, the effect may read. */
  maxReach(values: P, ctx: RenderContext): number;
  params: readonly EffectParamDef[];
  presets?: Record<string, Partial<P>>;
  setUniforms(
    gl: WebGL2RenderingContext,
    u: UniformLocator,
    values: P,
    ctx: RenderContext,
    host: EffectHost,
    fx: ChainItem,
  ): void;
  type: string;
};

export type AnyEffectModule = EffectModule<EffectParamValues>;

export type EffectRegistry = Readonly<Record<string, AnyEffectModule>>;

export type VideoSource = {
  duration: number;
  el: HTMLVideoElement;
  file: File;
  fps: number;
  fpsEstimated: boolean;
  height: number;
  name: string;
  url: string;
  width: number;
};

export type RingBufferInfo = {
  depth: number;
  height: number;
  memoryMB: number;
  requestedDepth: number;
  width: number;
};
