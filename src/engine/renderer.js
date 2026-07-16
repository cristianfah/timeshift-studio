// Engine — owns the GL context, the frame ring buffer and the ping-pong
// chain renderer. Effect modules provide fragment shaders that are compiled
// lazily and cached per effect type.

import { createContext, compileProgram, drawFullscreen, PingPong } from './gl.js';
import { FrameRing } from './ringbuffer.js';

// Shared fragment shader prelude: ring buffer sampling + hash utilities.
// Every effect shader is COMMON_GLSL + its own body (must define effectMain).
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

// -- deterministic hashes (match src/util/rand.js for the JS time-map) --
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
const SRC_FRAG = COMMON_GLSL + `
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

export class Engine {
  constructor(canvas, { preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    this.gl = createContext(canvas, { preserveDrawingBuffer });
    this.programs = new Map();      // effect type → { prog, locs }
    this.ring = null;
    this.pingpong = null;
    this.width = 0;
    this.height = 0;
    // CPU-side scaler: video frames are drawn here at buffer resolution
    // before upload (texSubImage3D uploads at source size otherwise).
    this.scaler = document.createElement('canvas');
    this.scalerCtx = this.scaler.getContext('2d', { willReadFrequently: false });
    this.srcPass = this._build('__src', SRC_FRAG);
    this.blitPass = this._build('__blit', BLIT_FRAG);
  }

  _build(key, fragSrc) {
    if (!this.programs.has(key)) {
      const prog = compileProgram(this.gl, fragSrc);
      this.programs.set(key, { prog, locs: new Map() });
    }
    return this.programs.get(key);
  }

  /** Cached uniform location lookup. */
  _loc(entry, name) {
    if (!entry.locs.has(name)) {
      entry.locs.set(name, this.gl.getUniformLocation(entry.prog, name));
    }
    return entry.locs.get(name);
  }

  /** Register (compile+cache) an effect shader. */
  ensureEffect(type, fragBody) {
    return this._build(type, COMMON_GLSL + fragBody);
  }

  /**
   * (Re)allocate ring buffer + ping-pong targets.
   * @returns {{width, height, depth, requestedDepth, memoryMB}}
   */
  configure({ srcWidth, srcHeight, targetWidth, depth }) {
    const gl = this.gl;
    const w = Math.min(targetWidth, srcWidth);
    const width = Math.max(2, 2 * Math.round(w / 2));
    const height = Math.max(2, 2 * Math.round((width * srcHeight / srcWidth) / 2));

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
      width, height,
      depth: actualDepth,
      requestedDepth: depth,
      memoryMB: this.ring.memoryMB,
    };
  }

  /** Downscale + upload the current video frame as the newest ring entry. */
  pushFrame(source) {
    if (!this.ring) return;
    this.scalerCtx.drawImage(source, 0, 0, this.scaler.width, this.scaler.height);
    this.ring.push(this.scaler);
  }

  resetHistory() {
    this.ring?.reset();
  }

  /**
   * Render the effect chain for clip time `time`.
   * @param {Array} chain     effect instances [{type, enabled, ...}]
   * @param {object} registry effect registry (type → module)
   * @param {object} ctx      { time, fps, params(fx) → resolved param values }
   */
  render(chain, registry, ctx) {
    const gl = this.gl;
    if (!this.ring || this.ring.count === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const pp = this.pingpong;
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.ring.texture);

    // Pass 0: newest source frame into the chain.
    this._runPass(this.srcPass, pp.write.fbo, null, ctx);
    pp.swap();

    // Effect passes.
    for (const fx of chain) {
      if (!fx.enabled) continue;
      const mod = registry[fx.type];
      if (!mod) continue;
      const entry = this.ensureEffect(fx.type, mod.frag);
      const params = ctx.params(fx);
      this._runPass(entry, pp.write.fbo, pp.read.tex, ctx, (u) => {
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
    gl.uniform1i(this._loc(this.blitPass, 'uTex'), 1);
    drawFullscreen(gl);
  }

  _runPass(entry, fbo, prevTex, ctx, extraUniforms) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.useProgram(entry.prog);
    const u = (name) => this._loc(entry, name);
    gl.uniform1i(u('uFrames'), 0);
    if (prevTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.uniform1i(u('uPrev'), 1);
    }
    gl.uniform1i(u('uHead'), this.ring.head);
    gl.uniform1i(u('uCount'), this.ring.count);
    gl.uniform1i(u('uDepth'), this.ring.depth);
    gl.uniform2f(u('uRes'), this.width, this.height);
    gl.uniform1f(u('uTime'), ctx.time);
    gl.uniform1f(u('uFrame'), Math.round(ctx.time * ctx.fps));
    gl.uniform1f(u('uFps'), ctx.fps);
    extraUniforms?.(u);
    drawFullscreen(gl);
  }

  dispose() {
    this.ring?.dispose();
    this.pingpong?.dispose();
    for (const { prog } of this.programs.values()) this.gl.deleteProgram(prog);
    this.programs.clear();
  }
}
