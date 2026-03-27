/**
 * ShaderRenderer - WebGL 1.0 based shader rendering engine
 *
 * Provides core WebGL infrastructure for rendering image-processing fragment
 * shaders on a full-screen quad. Supports multi-pass rendering with FBO
 * ping-pong for effects that require intermediate buffers.
 */

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const MAX_PREVIEW_SIZE = 2048;

// Full-screen quad: two triangles covering clip space [-1, 1]
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
]);

export class ShaderRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vertexBuffer: WebGLBuffer;
  private maxTextureSize: number;
  private imageWidth: number = 0;
  private imageHeight: number = 0;

  // Cached uniform locations for current program
  private uniformCache: Map<string, WebGLUniformLocation> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });

    if (!gl) {
      throw new Error('WebGL is not supported in this browser.');
    }

    this.gl = gl;
    this.canvas = canvas;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    // Create and upload the full-screen quad vertex buffer
    this.vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Upload an image to the GPU as a texture. Images that exceed
   * MAX_TEXTURE_SIZE or MAX_PREVIEW_SIZE are downscaled proportionally.
   */
  loadImage(image: HTMLImageElement): void {
    const gl = this.gl;

    // Determine the display dimensions (may be smaller than natural size)
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;

    // Clamp to the smaller of GPU max and our preview limit
    const limit = Math.min(this.maxTextureSize, MAX_PREVIEW_SIZE);
    if (width > limit || height > limit) {
      const scale = limit / Math.max(width, height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }

    this.imageWidth = width;
    this.imageHeight = height;

    // Resize the canvas to match
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);

    // Create / reuse the texture
    if (this.texture) {
      gl.deleteTexture(this.texture);
    }
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Use CLAMP_TO_EDGE so non-power-of-2 textures work in WebGL 1
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /**
   * Compile a fragment shader and link it with the built-in vertex shader.
   * After calling this the program is ready for `setUniform` / `render`.
   */
  useShader(fragSource: string): void {
    const gl = this.gl;

    // Clean up previous program
    if (this.program) {
      gl.deleteProgram(this.program);
    }
    this.uniformCache.clear();

    // Compile vertex shader
    const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    // Compile fragment shader
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

    // Link program
    const program = gl.createProgram()!;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    // Shaders can be detached & deleted after linking
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader link error: ${info}`);
    }

    this.program = program;
    gl.useProgram(program);

    // Bind the aPosition attribute to the quad VBO
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
  }

  /**
   * Set a uniform value on the currently active shader program.
   * Supports float, int, vec2/3/4 arrays.
   */
  setUniform(name: string, value: number | number[]): void {
    if (!this.program) {
      throw new Error('No shader program is active. Call useShader() first.');
    }

    const gl = this.gl;
    const loc = this.getUniformLocation(name);
    if (loc === null) return; // Uniform not found or optimized away -- silently skip

    if (typeof value === 'number') {
      gl.uniform1f(loc, value);
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 1: gl.uniform1f(loc, value[0]); break;
        case 2: gl.uniform2f(loc, value[0], value[1]); break;
        case 3: gl.uniform3f(loc, value[0], value[1], value[2]); break;
        case 4: gl.uniform4f(loc, value[0], value[1], value[2], value[3]); break;
        default:
          throw new Error(`Unsupported uniform array length: ${value.length}`);
      }
    }
  }

  /**
   * Render the current program to the canvas using the loaded image texture.
   */
  render(): void {
    if (!this.program) {
      throw new Error('No shader program is active. Call useShader() first.');
    }
    if (!this.texture) {
      throw new Error('No image loaded. Call loadImage() first.');
    }

    const gl = this.gl;

    // Bind the input image texture to unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Ensure the viewport covers the full canvas
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Draw the full-screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Render a single pass into an FBO texture (off-screen).
   * Returns the texture that holds the result.
   */
  renderToFBO(
    fragSource: string,
    inputTexture: WebGLTexture,
    uniforms: Record<string, number>,
  ): WebGLTexture {
    const gl = this.gl;
    const width = this.imageWidth;
    const height = this.imageHeight;

    // Create output FBO + texture
    const fbo = gl.createFramebuffer()!;
    const outTexture = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, outTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTexture, 0);

    // Set up and run the shader
    this.useShader(fragSource);

    // Bind the input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);

    // Apply uniforms
    for (const [name, value] of Object.entries(uniforms)) {
      this.setUniform(name, value);
    }

    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Clean up FBO (keep the output texture)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);

    return outTexture;
  }

  /**
   * Execute a multi-pass rendering pipeline.
   *
   * Creates two FBOs for ping-pong rendering. The first N-1 passes render
   * off-screen (to FBO textures), and the final pass renders directly to
   * the canvas.
   */
  renderMultiPass(
    passes: { fragSource: string; uniforms: Record<string, number> }[],
  ): void {
    if (passes.length === 0) return;
    if (!this.texture) {
      throw new Error('No image loaded. Call loadImage() first.');
    }

    const gl = this.gl;
    const width = this.imageWidth;
    const height = this.imageHeight;

    // Create two FBOs with associated textures for ping-pong
    const fboA = gl.createFramebuffer()!;
    const texA = gl.createTexture()!;
    this.initFBOTex(fboA, texA, width, height);

    const fboB = gl.createFramebuffer()!;
    const texB = gl.createTexture()!;
    this.initFBOTex(fboB, texB, width, height);

    // The first input is the loaded image
    let currentInput: WebGLTexture = this.texture;

    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];
      const isLast = i === passes.length - 1;

      if (isLast) {
        // Render final pass to the canvas (not FBO)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.useShader(pass.fragSource);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentInput);

        for (const [name, value] of Object.entries(pass.uniforms)) {
          this.setUniform(name, value);
        }

        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
        // Ping-pong: render into the FBO that is NOT the current input
        const isEven = i % 2 === 0;
        const targetFBO = isEven ? fboA : fboB;
        const targetTex = isEven ? texA : texB;

        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        this.useShader(pass.fragSource);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentInput);

        for (const [name, value] of Object.entries(pass.uniforms)) {
          this.setUniform(name, value);
        }

        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // The output of this pass becomes the input of the next
        currentInput = targetTex;
      }
    }

    // Clean up FBOs (intermediate textures are no longer needed)
    gl.deleteFramebuffer(fboA);
    gl.deleteTexture(texA);
    gl.deleteFramebuffer(fboB);
    gl.deleteTexture(texB);
  }

  /**
   * Release all GPU resources held by this renderer.
   */
  destroy(): void {
    const gl = this.gl;

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
    }

    this.uniformCache.clear();
    this.imageWidth = 0;
    this.imageHeight = 0;
  }

  /**
   * Return the underlying canvas element.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }

    return shader;
  }

  private getUniformLocation(name: string): WebGLUniformLocation | null {
    if (!this.program) return null;

    if (this.uniformCache.has(name)) {
      return this.uniformCache.get(name)!;
    }

    const loc = this.gl.getUniformLocation(this.program, name);
    // Cache even null so we don't repeatedly query missing uniforms
    this.uniformCache.set(name, loc!);
    return loc;
  }

  /**
   * Set up a texture + FBO pair of the given dimensions for off-screen
   * rendering.
   */
  private initFBOTex(
    fbo: WebGLFramebuffer,
    texture: WebGLTexture,
    width: number,
    height: number,
  ): void {
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
