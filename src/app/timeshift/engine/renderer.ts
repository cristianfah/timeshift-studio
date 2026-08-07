// Engine — owns the GL context, the frame ring buffer and the ping-pong chain
// renderer. Effect modules provide fragment shaders that are compiled lazily
// and cached per effect type.

import type {
  ChainItem,
  EffectHost,
  EffectParamValues,
  EffectRegistry,
  InstanceTextureSlot,
  LumaGrid,
  RenderContext,
  RingBufferInfo,
  UniformLocator,
} from "../types";
import { PingPong, compileProgram, createContext, drawFullscreen } from "./gl";
import { FrameRing } from "./ringbuffer";

// Shared fragment shader prelude: ring buffer sampling + hash utilities.
// Every effect shader is COMMON_GLSL + its own body.
export const COMMON_GLSL = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2DArray uFrames; // ring buffer of past frames
uniform sampler2D uPrev;        // output of the previous pass in the chain
uniform int uHead;              // ring layer of the newest frame
uniform int uCount;             // valid frames in the ring
uniform int uDepth;             // ring capacity
uniform vec2 uRes;              // render resolution
uniform float uTime;            // clip time (s)
uniform float uFrame;           // clip frame index
uniform float uFps;

// -- deterministic hashes (match util/rand.ts for the JS time-map) --
float tsHash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453123); }
float tsHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// Sample 'delay' frames back from the head. Video frames are stored
// top-row-first, so Y is flipped here once for the whole pipeline.
vec4 frameAt(vec2 uv, float delay) {
  float maxD = max(float(uCount) - 1.0, 0.0);
  float d = clamp(delay, 0.0, maxD);
  float layer = mod(float(uHead) - floor(d + 0.5) + float(uDepth) * 64.0, float(uDepth));
  return texture(uFrames, vec3(uv.x, 1.0 - uv.y, layer));
}

// Blend between the two nearest frames for fractional delays.
vec4 frameAtSmooth(vec2 uv, float delay) {
  float maxD = max(float(uCount) - 1.0, 0.0);
  float d = clamp(delay, 0.0, maxD);
  float d0 = floor(d);
  return mix(frameAt(uv, d0), frameAt(uv, min(d0 + 1.0, maxD)), fract(d));
}

// Delay 0 must mean "the chain so far", not the raw source, so stacked
// effects compose. Positive delays reach into the source's past.
vec4 chainAt(vec2 uv, float delay) {
  if (delay < 0.5) return texture(uPrev, uv);
  return frameAt(uv, delay);
}
`;

// First pass: raw newest frame into the chain.
const SRC_FRAG = `${COMMON_GLSL}
void main() { outColor = vec4(frameAt(v_uv, 0.0).rgb, 1.0); }
`;

// Final pass: chain result to the default framebuffer.
const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D uTex;
void main() { outColor = vec4(texture(uTex, v_uv).rgb, 1.0); }
`;

const MAX_RING_MB = 768; // hard cap for the preview ring buffer

type ProgramEntry = {
  locs: Map<string, WebGLUniformLocation | null>;
  prog: WebGLProgram;
};

export type EngineRenderContext = RenderContext & {
  params: (fx: ChainItem) => EffectParamValues;
};

export type EngineConfigureRequest = {
  depth: number;
  srcHeight: number;
  srcWidth: number;
  targetWidth: number;
};

export class Engine implements EffectHost {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;

  width = 0;
  height = 0;

  private readonly programs = new Map<string, ProgramEntry>();
  private readonly srcPass: ProgramEntry;
  private readonly blitPass: ProgramEntry;
  private readonly scaler: HTMLCanvasElement;
  private readonly scalerCtx: CanvasRenderingContext2D;
  private readonly analysisCanvas: HTMLCanvasElement;
  private readonly analysisCtx: CanvasRenderingContext2D;
  private readonly lumaCache = new Map<string, LumaGrid>();
  private readonly instanceTextures = new Map<string, InstanceTextureSlot>();
  private readonly pushListeners = new Set<(frame: HTMLCanvasElement) => void>();

  private ring: FrameRing | null = null;
  private pingpong: PingPong | null = null;
  private pushStamp = 0;

  constructor(
    canvas: HTMLCanvasElement,
    { preserveDrawingBuffer = false }: { preserveDrawingBuffer?: boolean } = {},
  ) {
    this.canvas = canvas;
    this.gl = createContext(canvas, { preserveDrawingBuffer });

    // CPU-side scaler: video frames are drawn here at buffer resolution before
    // upload (texSubImage3D uploads at source size otherwise).
    this.scaler = document.createElement("canvas");
    const scalerCtx = this.scaler.getContext("2d", {
      willReadFrequently: false,
    });

    // CPU analysis support (luma grids for CELL_MAP / MOTION_TRACK).
    this.analysisCanvas = document.createElement("canvas");
    const analysisCtx = this.analysisCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!scalerCtx || !analysisCtx) {
      throw new Error("Canvas 2D context creation failed");
    }

    this.scalerCtx = scalerCtx;
    this.analysisCtx = analysisCtx;
    this.srcPass = this.build("__src", SRC_FRAG);
    this.blitPass = this.build("__blit", BLIT_FRAG);
  }

  private build(key: string, fragSrc: string): ProgramEntry {
    const existing = this.programs.get(key);

    if (existing) {
      return existing;
    }

    const entry: ProgramEntry = {
      locs: new Map(),
      prog: compileProgram(this.gl, fragSrc),
    };

    this.programs.set(key, entry);

    return entry;
  }

  /** Cached uniform location lookup. */
  private loc(
    entry: ProgramEntry,
    name: string,
  ): WebGLUniformLocation | null {
    if (!entry.locs.has(name)) {
      entry.locs.set(name, this.gl.getUniformLocation(entry.prog, name));
    }

    return entry.locs.get(name) ?? null;
  }

  /** Register (compile+cache) an effect shader. */
  ensureEffect(type: string, fragBody: string): ProgramEntry {
    return this.build(type, COMMON_GLSL + fragBody);
  }

  /** (Re)allocate ring buffer + ping-pong targets. */
  configure({
    depth,
    srcHeight,
    srcWidth,
    targetWidth,
  }: EngineConfigureRequest): RingBufferInfo {
    const gl = this.gl;
    const w = Math.min(targetWidth, srcWidth);
    const width = Math.max(2, 2 * Math.round(w / 2));
    const height = Math.max(
      2,
      2 * Math.round((width * srcHeight) / srcWidth / 2),
    );

    // Clamp depth so the ring stays under the memory cap.
    const frameMB = (width * height * 4) / (1024 * 1024);
    const maxDepth = Math.max(8, Math.floor(MAX_RING_MB / frameMB));
    const actualDepth = Math.min(depth, maxDepth);

    this.ring?.dispose();
    this.pingpong?.dispose();
    this.ring = new FrameRing(gl, width, height, actualDepth);
    this.pingpong = new PingPong(gl, width, height);
    this.width = width;
    this.height = height;
    this.scaler.width = width;
    this.scaler.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    return {
      depth: actualDepth,
      height,
      memoryMB: this.ring.memoryMB,
      requestedDepth: depth,
      width,
    };
  }

  /** Downscale + upload the current video frame as the newest ring entry. */
  pushFrame(source: CanvasImageSource): void {
    if (!this.ring) {
      return;
    }

    this.scalerCtx.drawImage(source, 0, 0, this.scaler.width, this.scaler.height);
    this.ring.push(this.scaler);
    this.pushStamp += 1;

    for (const fn of this.pushListeners) {
      fn(this.scaler);
    }
  }

  /**
   * Observe every frame this engine ingests (already downscaled). Used by the
   * effect browser to keep its own small ring buffer in sync without decoding
   * the video twice.
   */
  addPushListener(fn: (frame: HTMLCanvasElement) => void): () => void {
    this.pushListeners.add(fn);

    return () => {
      this.pushListeners.delete(fn);
    };
  }

  resetHistory(): void {
    this.ring?.reset();
  }

  get bufferDepth(): number {
    return this.ring?.depth ?? 0;
  }

  get bufferCount(): number {
    return this.ring?.count ?? 0;
  }

  /**
   * Low-res luminance grid of the newest frame (0..1, top-row-first). Cached
   * per pushed frame — CELL_MAP viz and MOTION_TRACK share it.
   */
  lumaGrid(cols = 96): LumaGrid | null {
    if (!this.ring || this.ring.count === 0) {
      return null;
    }

    const rows = Math.max(2, Math.round((cols * this.height) / this.width));
    const key = `${cols}x${rows}`;
    const hit = this.lumaCache.get(key);

    if (hit && hit.stamp === this.pushStamp) {
      return hit;
    }

    this.analysisCanvas.width = cols;
    this.analysisCanvas.height = rows;
    this.analysisCtx.drawImage(this.scaler, 0, 0, cols, rows);
    const d = this.analysisCtx.getImageData(0, 0, cols, rows).data;
    const luma = new Float32Array(cols * rows);

    for (let i = 0; i < luma.length; i += 1) {
      luma[i] =
        ((d[i * 4] ?? 0) * 0.299 +
          (d[i * 4 + 1] ?? 0) * 0.587 +
          (d[i * 4 + 2] ?? 0) * 0.114) /
        255;
    }

    const grid: LumaGrid = { cols, key, luma, rows, stamp: this.pushStamp };

    // Effects ask for different resolutions (motion grid vs tracking patch
    // grid); keep a couple around so they don't evict each other every frame.
    if (this.lumaCache.size > 4) {
      this.lumaCache.clear();
    }

    this.lumaCache.set(key, grid);

    return grid;
  }

  /**
   * Texture slot owned by THIS engine for CPU-generated content (tracker
   * overlays, glyph atlases, custom maps). Keyed by caller-chosen id, so
   * preview and export engines never share GL objects.
   */
  instanceTex(id: string): InstanceTextureSlot {
    let slot = this.instanceTextures.get(id);

    if (!slot) {
      slot = { init: false, stamp: -1, tex: this.gl.createTexture() };
      this.instanceTextures.set(id, slot);
    }

    return slot;
  }

  /** Upload a canvas/bitmap into an instanceTex slot (unit 2 scratch). */
  uploadTex(slot: InstanceTextureSlot, source: TexImageSource): void {
    const gl = this.gl;

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    if (!slot.init) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      slot.init = true;
    }
  }

  /** Render the effect chain for clip time `ctx.time`. */
  render(
    chain: readonly ChainItem[],
    registry: EffectRegistry,
    ctx: EngineRenderContext,
  ): void {
    const gl = this.gl;
    const ring = this.ring;
    const pp = this.pingpong;

    if (!ring || !pp || ring.count === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    // CPU analysis pass: effects that track/measure the frame run first, so
    // their setUniforms can bind freshly generated textures.
    for (const fx of chain) {
      if (fx.enabled) {
        registry[fx.type]?.analyze?.(this, fx, ctx);
      }
    }

    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, ring.texture);

    // Pass 0: newest source frame into the chain.
    this.runPass(this.srcPass, pp.write.fbo, null, ctx);
    pp.swap();

    // Effect passes.
    for (const fx of chain) {
      if (!fx.enabled) {
        continue;
      }

      const mod = registry[fx.type];

      if (!mod) {
        continue;
      }

      const entry = this.ensureEffect(fx.type, mod.frag);
      const params = ctx.params(fx);

      this.runPass(entry, pp.write.fbo, pp.read.tex, ctx, (u) => {
        mod.setUniforms(gl, u, params, ctx, this, fx);
      });
      pp.swap();
    }

    // Final blit to canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.blitPass.prog);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pp.read.tex);
    gl.uniform1i(this.loc(this.blitPass, "uTex"), 1);
    drawFullscreen(gl);
  }

  private runPass(
    entry: ProgramEntry,
    fbo: WebGLFramebuffer,
    prevTex: WebGLTexture | null,
    ctx: RenderContext,
    extraUniforms?: (u: UniformLocator) => void,
  ): void {
    const gl = this.gl;
    const ring = this.ring;

    if (!ring) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.useProgram(entry.prog);

    const u: UniformLocator = (name) => this.loc(entry, name);

    gl.uniform1i(u("uFrames"), 0);

    if (prevTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.uniform1i(u("uPrev"), 1);
    }

    gl.uniform1i(u("uHead"), ring.head);
    gl.uniform1i(u("uCount"), ring.count);
    gl.uniform1i(u("uDepth"), ring.depth);
    gl.uniform2f(u("uRes"), this.width, this.height);
    gl.uniform1f(u("uTime"), ctx.time);
    gl.uniform1f(u("uFrame"), Math.round(ctx.time * ctx.fps));
    gl.uniform1f(u("uFps"), ctx.fps);
    extraUniforms?.(u);
    drawFullscreen(gl);
  }

  dispose(): void {
    this.ring?.dispose();
    this.pingpong?.dispose();

    for (const { prog } of this.programs.values()) {
      this.gl.deleteProgram(prog);
    }

    this.programs.clear();

    for (const { tex } of this.instanceTextures.values()) {
      this.gl.deleteTexture(tex);
    }

    this.instanceTextures.clear();
  }
}
