import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser } from 'puppeteer-core'
import kaleidoscopeShader from '../shaders/kaleidoscope.frag?raw'

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter((candidate): candidate is string => Boolean(candidate))

async function findBrowser(): Promise<string> {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Try the next supported browser location.
    }
  }
  throw new Error('Chrome or Chromium is required for the kaleidoscope WebGL regression test')
}

type UniformValue = number | [number, number]
type Uniforms = Record<string, UniformValue>

type ColorMetrics = {
  meanSaturation: number
  activeHueBins: number
  /** 旋转 60°（一个扇区）后与原图逐通道最大差，0..255 */
  symmetryMaxDiff: number
  /** 12×12 下采样 RGB 缩略图，用于跨渲染比较 */
  thumb: number[]
}

const baseUniforms = (size: number, overrides: Partial<Uniforms>): Uniforms => ({
  uResolution: [size, size],
  uSegments: 6,
  uRotation: 0,
  uZoom: 1.0,
  uCenterX: 0,
  uCenterY: 0,
  uEdgeGlow: 0.45,
  uHueShift: 0,
  uCellSize: 0.25,
  uFracture: 1,
  uPrism: 0,
  uViewMask: 0,
  uMirrorMode: 0,
  ...overrides,
})

async function renderMetrics(
  browser: Browser,
  fragmentSource: string,
  overrides: Partial<Uniforms> = {},
  source: 'gray' | 'color' = 'gray',
): Promise<ColorMetrics> {
  const page = await browser.newPage()
  try {
    return await page.evaluate((fragmentSource: string, uniforms: Uniforms, source: 'gray' | 'color'): ColorMetrics => {
      const size = 96
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })
      if (!gl) throw new Error('WebGL is unavailable')

      const compile = (type: number, source: string): WebGLShader => {
        const shader = gl.createShader(type)
        if (!shader) throw new Error('Could not create shader')
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed')
        }
        return shader
      }

      const vertexSource = `
        attribute vec2 aPosition;
        varying vec2 vUv;
        void main() {
          vUv = aPosition * 0.5 + 0.5;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `

      const program = gl.createProgram()
      if (!program) throw new Error('Could not create shader program')
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed')
      }
      gl.useProgram(program)

      const vertices = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'aPosition')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

      // 灰度波纹源：无饱和、空间上不对称，饱和度/对称性指标都由折叠决定；
      // 彩色源：水平色相渐变，供色相偏移断言使用
      const sourcePixels = new Uint8Array(size * size * 4)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const offset = (y * size + x) * 4
          if (source === 'color') {
            const hue = ((x / size) * 300 + (y / size) * 60) * Math.PI / 180
            sourcePixels[offset] = Math.round(128 + 127 * Math.sin(hue))
            sourcePixels[offset + 1] = Math.round(128 + 127 * Math.sin(hue + 2.094))
            sourcePixels[offset + 2] = Math.round(128 + 127 * Math.sin(hue + 4.188))
          } else {
            const wave = Math.sin(x * 0.09) * Math.cos(y * 0.08)
            const gray = Math.round(128 + wave * 92)
            sourcePixels[offset] = gray
            sourcePixels[offset + 1] = gray
            sourcePixels[offset + 2] = gray
          }
          sourcePixels[offset + 3] = 255
        }
      }

      const texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourcePixels)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

      for (const [name, value] of Object.entries(uniforms)) {
        const location = gl.getUniformLocation(program, name)
        if (location === null) continue
        if (Array.isArray(value)) gl.uniform2f(location, value[0], value[1])
        else gl.uniform1f(location, value)
      }

      gl.viewport(0, 0, size, size)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      const output = new Uint8Array(size * size * 4)
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, output)

      const hueBins = new Set<number>()
      let saturationTotal = 0
      let measured = 0
      for (let y = 8; y < size - 8; y += 2) {
        for (let x = 8; x < size - 8; x += 2) {
          const offset = (y * size + x) * 4
          const r = output[offset] / 255
          const g = output[offset + 1] / 255
          const b = output[offset + 2] / 255
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const delta = max - min
          const saturation = max > 0 ? delta / max : 0
          saturationTotal += saturation
          measured++
          if (saturation < 0.2 || delta === 0) continue
          let hue = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta
          hue = ((hue / 6) % 1 + 1) % 1
          hueBins.add(Math.floor(hue * 12))
        }
      }

      // 六重旋转对称：像素绕中心转 60° 后应落在等值像素上（canvas y 轴向下，做翻转）
      const cx = (size - 1) / 2
      const cy = (size - 1) / 2
      const ang = Math.PI / 3
      let symmetryMaxDiff = 0
      const at = (x: number, y: number, i: number) => output[(y * size + x) * 4 + i]
      for (let y = 2; y < size - 2; y++) {
        for (let x = 2; x < size - 2; x++) {
          const dx = x - cx
          const dy = cy - y
          const rx = Math.cos(ang) * dx - Math.sin(ang) * dy + cx
          const ry = cy - (Math.sin(ang) * dx + Math.cos(ang) * dy)
          const ix = Math.round(rx)
          const iy = Math.round(ry)
          if (ix < 0 || iy < 0 || ix >= size || iy >= size) continue
          for (let i = 0; i < 3; i++) {
            symmetryMaxDiff = Math.max(symmetryMaxDiff, Math.abs(at(x, y, i) - at(ix, iy, i)))
          }
        }
      }

      // 12×12 缩略图（步长 8，覆盖全域）
      const thumb: number[] = []
      for (let y = 4; y < size; y += 8) {
        for (let x = 4; x < size; x += 8) {
          const offset = (y * size + x) * 4
          thumb.push(output[offset], output[offset + 1], output[offset + 2])
        }
      }

      return {
        meanSaturation: saturationTotal / measured,
        activeHueBins: hueBins.size,
        symmetryMaxDiff,
        thumb,
      }
    }, fragmentSource, baseUniforms(96, overrides), source)
  } finally {
    await page.close()
  }
}

/** 12×12 缩略图（每项 rgb）的通道标准差，检测画面是否非平凡 */
function thumbStdDev(thumb: number[]): number {
  const mean = thumb.reduce((a, b) => a + b, 0) / thumb.length
  const variance = thumb.reduce((a, b) => a + (b - mean) ** 2, 0) / thumb.length
  return Math.sqrt(variance)
}

/** 中心对称（对径）采样点的平均通道差：内容是否随碎片角度变化 */
function antipodalDiff(thumb: number[]): number {
  const cells = 12
  let total = 0
  let count = 0
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const a = (row * cells + col) * 3
      const b = ((cells - 1 - row) * cells + (cells - 1 - col)) * 3
      for (let i = 0; i < 3; i++) {
        total += Math.abs(thumb[a + i] - thumb[b + i])
        count++
      }
    }
  }
  return total / count
}

describe('Kaleidoscope mirror tessellation', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await puppeteer.launch({
      executablePath: await findBrowser(),
      headless: true,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
    })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
  })

  it('prism on: vivid range of hues from a neutral source image', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uPrism: 1 })
    expect(metrics.meanSaturation).toBeGreaterThan(0.35)
    expect(metrics.activeHueBins).toBeGreaterThanOrEqual(8)
  }, 30_000)

  it('prism off: faithful mirror of the photo without colorization', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uPrism: 0 })
    expect(metrics.meanSaturation).toBeLessThan(0.06)
  }, 30_000)

  it('hue shift recolors the mirror even when prism is off', async () => {
    const neutral = await renderMetrics(browser, kaleidoscopeShader, { uPrism: 0, uHueShift: 0 }, 'color')
    const turned = await renderMetrics(browser, kaleidoscopeShader, { uPrism: 0, uHueShift: 180 }, 'color')
    let maxDiff = 0
    for (let i = 0; i < neutral.thumb.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(neutral.thumb[i] - turned.thumb[i]))
    }
    expect(maxDiff).toBeGreaterThan(40)
  }, 30_000)

  it('sixfold rotational symmetry with fracture disabled', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uPrism: 0, uFracture: 1, uEdgeGlow: 0 })
    expect(metrics.symmetryMaxDiff).toBeLessThanOrEqual(12)
  }, 30_000)

  it('fracture keeps every sector identical (sixfold symmetry at fracture 3)', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uPrism: 0, uFracture: 3, uEdgeGlow: 0 })
    expect(metrics.symmetryMaxDiff).toBeLessThanOrEqual(12)
  }, 30_000)

  it('rotating the tube rotates the structure and alters the render', async () => {
    const straight = await renderMetrics(browser, kaleidoscopeShader, { uRotation: 0 })
    const turned = await renderMetrics(browser, kaleidoscopeShader, { uRotation: 30 })
    let maxDiff = 0
    for (let i = 0; i < straight.thumb.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(straight.thumb[i] - turned.thumb[i]))
    }
    expect(maxDiff).toBeGreaterThan(8)
  }, 30_000)

  it('circle view mask darkens the corners while the center stays bright', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uViewMask: 1, uEdgeGlow: 0 })
    const corner = (metrics.thumb[0] + metrics.thumb[1] + metrics.thumb[2]) / 3
    const farCornerIdx = (metrics.thumb.length - 3)
    const farCorner = (metrics.thumb[farCornerIdx] + metrics.thumb[farCornerIdx + 1] + metrics.thumb[farCornerIdx + 2]) / 3
    const midIdx = (6 * 12 + 6) * 3
    const center = (metrics.thumb[midIdx] + metrics.thumb[midIdx + 1] + metrics.thumb[midIdx + 2]) / 3
    expect(corner).toBeLessThan(30)
    expect(farCorner).toBeLessThan(30)
    expect(center).toBeGreaterThan(60)
  }, 30_000)

  it('positional mode: facet content varies with its angle', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uMirrorMode: 1 }, 'color')
    expect(thumbStdDev(metrics.thumb)).toBeGreaterThan(5)
    expect(antipodalDiff(metrics.thumb)).toBeGreaterThan(20)
  }, 30_000)

  it('mirror reflection mode: facet content varies with its angle', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uMirrorMode: 2 }, 'color')
    expect(thumbStdDev(metrics.thumb)).toBeGreaterThan(5)
    expect(antipodalDiff(metrics.thumb)).toBeGreaterThan(20)
  }, 30_000)

  it('tube mode repeats the same window at opposite angles (control group)', async () => {
    const metrics = await renderMetrics(browser, kaleidoscopeShader, { uMirrorMode: 0, uPrism: 0 }, 'color')
    expect(antipodalDiff(metrics.thumb)).toBeLessThan(12)
  }, 30_000)
})
