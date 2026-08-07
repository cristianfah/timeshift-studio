// Low-level WebGL2 helpers: context, program compilation, fullscreen quad, FBOs.

export function createContext(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 context creation failed');
  return gl;
}

// A single fullscreen triangle — cheaper than a quad, covers clip space.
export const VERT_SRC = `#version 300 es
out vec2 v_uv;
void main() {
  // gl_VertexID trick: (-1,-1) (3,-1) (-1,3)
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  v_uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

export function compileProgram(gl, fragSrc, vertSrc = VERT_SRC) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader compile error:\n${log}\n--- source ---\n${src}`);
    }
    return sh;
  };
  const vs = make(gl.VERTEX_SHADER, vertSrc);
  const fs = make(gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function createTexture2D(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Two framebuffer/texture pairs for ping-pong rendering through an effect chain. */
export class PingPong {
  constructor(gl, width, height) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.pair = [0, 1].map(() => {
      const tex = createTexture2D(gl, width, height);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.idx = 0;
  }

  get write() { return this.pair[this.idx]; }
  get read() { return this.pair[1 - this.idx]; }
  swap() { this.idx = 1 - this.idx; }

  dispose() {
    for (const { tex, fbo } of this.pair) {
      this.gl.deleteTexture(tex);
      this.gl.deleteFramebuffer(fbo);
    }
  }
}
