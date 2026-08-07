// FrameRing — a ring buffer of decoded video frames stored as layers of a
// TEXTURE_2D_ARRAY. Effects sample "delay" frames back from the head layer.
// Memory is bounded: width x height x depth x 4 bytes, GPU-side only.

export class FrameRing {
  private readonly gl: WebGL2RenderingContext;

  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  readonly depth: number;

  /** Layer index of the most recent frame. */
  head = -1;
  /** How many valid frames are stored (<= depth). */
  count = 0;

  constructor(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    depth: number,
  ) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.depth = depth;

    const texture = gl.createTexture();

    if (!texture) {
      throw new Error("Frame ring texture creation failed");
    }

    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, depth);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Estimated GPU memory in MB. */
  get memoryMB(): number {
    return (this.width * this.height * this.depth * 4) / (1024 * 1024);
  }

  /** Upload the current frame of a video element (or canvas) as the new head. */
  push(source: TexImageSource): void {
    const gl = this.gl;

    this.head = (this.head + 1) % this.depth;
    this.count = Math.min(this.count + 1, this.depth);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // flip handled in shaders
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      this.head,
      this.width,
      this.height,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );
  }

  /** Forget history (e.g. after a seek) without freeing GPU memory. */
  reset(): void {
    this.head = -1;
    this.count = 0;
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
  }
}
