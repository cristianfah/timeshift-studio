// FrameRing — a ring buffer of decoded video frames stored as layers of a
// TEXTURE_2D_ARRAY. Effects sample "delay" frames back from the head layer.
// Memory is bounded: width × height × depth × 4 bytes, GPU-side only.

export class FrameRing {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} width   frame width in the buffer (usually preview res)
   * @param {number} height
   * @param {number} depth   number of frames of history
   */
  constructor(gl, width, height, depth) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.head = -1;   // layer index of the most recent frame
    this.count = 0;   // how many valid frames are stored (≤ depth)

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, depth);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Estimated GPU memory in MB. */
  get memoryMB() {
    return (this.width * this.height * this.depth * 4) / (1024 * 1024);
  }

  /** Upload the current frame of a video element (or canvas) as the new head. */
  push(source) {
    const gl = this.gl;
    this.head = (this.head + 1) % this.depth;
    this.count = Math.min(this.count + 1, this.depth);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // flip handled in shaders
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY, 0,
      0, 0, this.head,
      this.width, this.height, 1,
      gl.RGBA, gl.UNSIGNED_BYTE, source,
    );
  }

  /** Forget history (e.g. after a seek) without freeing GPU memory. */
  reset() {
    this.head = -1;
    this.count = 0;
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
  }
}
