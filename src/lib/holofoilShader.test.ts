import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser } from 'puppeteer-core'
import holofoilShader from '../shaders/holofoil.frag?raw'

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
  throw new Error('Chrome or Chromium is required for the holofoil WebGL regression test')
}

type Uniforms = Record<string, number | [number, number]>

type Metrics = {
  meanSaturation: number
  activeHueBins: number
  thumb: number[]
}

const baseUniforms = (overrides: Partial<Uniforms>): Uniforms => ({
  uResolution: [96, 96],
  uTexture: 0,
  uStrength: 1,
  uBandDensity: 1,
  uBandAngle: 22,
  uFoilColorR: 0x1a / 255,
  uFoilColorG: 0x1a / 255,
  uFoilColorB: 0x22 / 255,
  uCrackleDensity: 38,
  uStreakDensity: 14,
  uSparkleDensity: 1,
  ...overrides,
})

async function renderMetrics(
  browser: Browser,
  overrides: Partial<Uniforms> = {},
): Promise<Metrics> {
  const page = await browser.newPage()
  try {
    return await page.evaluate((fragmentSource: string, uniforms: Uniforms): Metrics => {
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

      // 灰度波纹源:无饱和,全部色彩由光谱映射产生
      const sourcePixels = new Uint8Array(size * size * 4)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const offset = (y * size + x) * 4
          const wave = Math.sin(x * 0.11) * Math.cos(y * 0.07) + Math.sin((x + y) * 0.05)
          const gray = Math.round(128 + wave * 46)
          sourcePixels[offset] = gray
          sourcePixels[offset + 1] = gray
          sourcePixels[offset + 2] = gray
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
        thumb,
      }
    }, holofoilShader, baseUniforms(overrides))
  } finally {
    await page.close()
  }
}

function thumbMaxDiff(a: number[], b: number[]): number {
  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
  return max
}

function thumbStdDev(thumb: number[]): number {
  const mean = thumb.reduce((x, y) => x + y, 0) / thumb.length
  return Math.sqrt(thumb.reduce((x, y) => x + (y - mean) ** 2, 0) / thumb.length)
}

describe('Holographic foil spectrum mapping', () => {
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

  it('灰源图上产生宽谱彩虹:饱和度与活跃色相由光谱映射决定', async () => {
    const metrics = await renderMetrics(browser)
    expect(metrics.meanSaturation).toBeGreaterThan(0.25)
    expect(metrics.activeHueBins).toBeGreaterThanOrEqual(5)
    expect(thumbStdDev(metrics.thumb)).toBeGreaterThan(5)
  }, 30_000)

  it('强度 0 时只剩金属底(低饱和),与标准强度渲染截然不同', async () => {
    const flat = await renderMetrics(browser, { uStrength: 0 })
    const full = await renderMetrics(browser, { uStrength: 1 })
    expect(flat.meanSaturation).toBeLessThan(0.1)
    expect(thumbMaxDiff(flat.thumb, full.thumb)).toBeGreaterThan(30)
  }, 30_000)

  it('三种箔面质感渲染互不相同', async () => {
    const crackle = await renderMetrics(browser, { uTexture: 0 })
    const streak = await renderMetrics(browser, { uTexture: 1 })
    const pearl = await renderMetrics(browser, { uTexture: 2 })
    expect(thumbMaxDiff(crackle.thumb, streak.thumb)).toBeGreaterThan(15)
    expect(thumbMaxDiff(crackle.thumb, pearl.thumb)).toBeGreaterThan(15)
    expect(thumbMaxDiff(streak.thumb, pearl.thumb)).toBeGreaterThan(15)
  }, 30_000)

  it('色带角度改变彩虹扫过画面的方向', async () => {
    const horizontal = await renderMetrics(browser, { uBandAngle: 0 })
    const vertical = await renderMetrics(browser, { uBandAngle: 90 })
    expect(thumbMaxDiff(horizontal.thumb, vertical.thumb)).toBeGreaterThan(10)
  }, 30_000)

  // ---- 选择性加箔 + 转卡(wayfinder/holofoil-card 票06)----

  it('uScope 缺省=0 与显式 0 逐字节一致;分区档无掩膜(uZoneEnabled 缺省 0)=全图等价', async () => {
    // 灰源图本身是柔和波纹(无强阶跃),全图模式输出即基准
    const implicit = await renderMetrics(browser, {})
    const explicitZero = await renderMetrics(browser, { uScope: 0 })
    const zoneNoMask = await renderMetrics(browser, { uScope: 2 })
    expect(thumbMaxDiff(implicit.thumb, explicitZero.thumb)).toBe(0)
    expect(thumbMaxDiff(implicit.thumb, zoneNoMask.thumb)).toBe(0)
  }, 30_000)

  it('边缘档:柔和波纹源无强阶跃 → 光谱几乎为零(回原图),远弱于全图', async () => {
    // 灰源波纹的梯度平缓,Laplacian 门控+滞后核心应滤掉绝大部分——边缘档近乎纯原图
    const edge = await renderMetrics(browser, { uScope: 1, uZoneEnabled: 1, uTexSize: [96, 96] })
    const full = await renderMetrics(browser, { uTexSize: [96, 96] })
    expect(edge.meanSaturation).toBeLessThan(0.05)
    expect(edge.meanSaturation).toBeLessThan(full.meanSaturation * 0.5)
  }, 30_000)

  it('转卡倾角驱动色带流动:uTiltX 0 vs 1 渲染互不相同(uTilt 缺省 0 无影响)', async () => {
    const neutral = await renderMetrics(browser, { uTexSize: [96, 96] })
    const tilted = await renderMetrics(browser, { uTiltX: 1, uTexSize: [96, 96] })
    expect(thumbMaxDiff(neutral.thumb, tilted.thumb)).toBeGreaterThan(10)
    // 缺省路径(uTilt 未设,GLSL 默认 0)与显式 0 一致——旧码等价性
    const explicit = await renderMetrics(browser, { uTiltX: 0, uTiltY: 0 })
    expect(thumbMaxDiff(neutral.thumb, explicit.thumb)).toBe(0)
  }, 30_000)
})
