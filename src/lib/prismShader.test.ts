import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser } from 'puppeteer-core'
import prismShader from '../shaders/prism.frag?raw'

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
  throw new Error('Chrome or Chromium is required for the prism WebGL regression test')
}

type Uniforms = Record<string, number | [number, number]>
type Source = 'radial' | 'striped'

type Metrics = {
  thumb: number[]
  innerDiff: number
  outerDiff: number
  purpleEdgeRatio: number
}

const baseUniforms = (overrides: Partial<Uniforms>): Uniforms => ({
  uResolution: [96, 96],
  uMode: 0,
  uAmount: 0.5,
  uAngle: 45,
  uEdgeThreshold: 0.5,
  ...overrides,
})

async function renderMetrics(
  browser: Browser,
  overrides: Partial<Uniforms> = {},
  source: Source = 'radial',
): Promise<Metrics> {
  const page = await browser.newPage()
  try {
    return await page.evaluate((fragmentSource: string, uniforms: Uniforms, source: Source): Metrics => {
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

      // 源图两种(灰度,通道分离的彩色镶边由位移差产生):
      // radial  = 低频径向渐变 + 中央竖直高对比阶跃(亮线+两侧暗带)
      //           —— 内外差异验证"离中心越远色散越大",阶跃边供紫边检测
      // striped = radial 基础上叠加高频条纹 —— 任何方向的采样偏移都高响应,
      //           用于区分径向/对角/紫边三种模式
      const sourcePixels = new Uint8Array(size * size * 4)
      const cx = size / 2
      const cy = size / 2
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const offset = (y * size + x) * 4
          const r = Math.hypot(x - cx, y - cy) / (size / 2)
          let gray = 128
          if (source === 'striped') {
            gray += Math.round(r * r * 60 + Math.sin(x * 0.55) * 45 + Math.sin((x + y) * 0.31) * 25)
          } else {
            // 内圈平坦、外圈径向正弦条纹(永不饱和):分离可见性只随 amt 增长
            if (r > 0.35) {
              const ring = Math.sin((r - 0.35) * Math.PI * 3.0) * 90
              gray = 128 + Math.round(ring * Math.min(1, (r - 0.35) / 0.15))
            }
          }
          gray = Math.min(255, Math.max(0, gray))
          if (Math.abs(x - cx) < 1.2) gray = 230          // 竖直亮线
          else if (Math.abs(x - cx) < 3.2) gray = 35      // 两侧暗带 = 高对比阶跃
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

      const channelDiff = (x: number, y: number): number => {
        const offset = (y * size + x) * 4
        const srcOffset = offset
        return Math.abs(output[offset] - sourcePixels[srcOffset])
          + Math.abs(output[offset + 1] - sourcePixels[srcOffset + 1])
          + Math.abs(output[offset + 2] - sourcePixels[srcOffset + 2])
      }

      let innerTotal = 0
      let innerCount = 0
      let outerTotal = 0
      let outerCount = 0
      let purpleEdges = 0
      let edgeCount = 0
      for (let y = 2; y < size - 2; y++) {
        for (let x = 2; x < size - 2; x++) {
          const radius = Math.hypot(x - cx, y - cy) / (size / 2)
          if (Math.abs(x - cx) > 5) {           // 内外圈统计排除中央阶跃带
            const diff = channelDiff(x, y)
            if (radius < 0.3) {
              innerTotal += diff
              innerCount++
            } else if (radius > 0.7) {
              outerTotal += diff
              outerCount++
            }
          }
          // 阶跃边两侧 3px 内(覆盖亮线与暗带)
          if (Math.abs(x - cx) <= 3 && Math.abs(y - cy) < size * 0.25) {
            edgeCount++
            const offset = (y * size + x) * 4
            const r = output[offset]
            const g = output[offset + 1]
            const b = output[offset + 2]
            if (g < r - 3 && g < b - 3) purpleEdges++
          }
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
        thumb,
        innerDiff: innerCount ? innerTotal / innerCount : 0,
        outerDiff: outerCount ? outerTotal / outerCount : 0,
        purpleEdgeRatio: edgeCount ? purpleEdges / edgeCount : 0,
      }
    }, prismShader, baseUniforms(overrides), source)
  } finally {
    await page.close()
  }
}

function thumbMaxDiff(a: number[], b: number[]): number {
  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
  return max
}

describe('Prism dispersion channel separation', () => {
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

  it('色散量 0 时逐像素还原原图(往返基准)', async () => {
    const metrics = await renderMetrics(browser, { uAmount: 0 })
    expect(metrics.innerDiff).toBeLessThanOrEqual(1)
    expect(metrics.outerDiff).toBeLessThanOrEqual(1)
  }, 30_000)

  it('径向模式:离中心越远通道分离越大(外圈差 > 内圈差)', async () => {
    const metrics = await renderMetrics(browser, { uMode: 0, uAmount: 0.5 })
    expect(metrics.outerDiff).toBeGreaterThan(metrics.innerDiff + 5)
  }, 30_000)

  it('三种模式渲染互不相同', async () => {
    const radial = await renderMetrics(browser, { uMode: 0 }, 'striped')
    const diagonal = await renderMetrics(browser, { uMode: 1 }, 'striped')
    const purple = await renderMetrics(browser, { uMode: 2 }, 'striped')
    expect(thumbMaxDiff(radial.thumb, diagonal.thumb)).toBeGreaterThan(10)
    expect(thumbMaxDiff(radial.thumb, purple.thumb)).toBeGreaterThan(10)
    expect(thumbMaxDiff(diagonal.thumb, purple.thumb)).toBeGreaterThan(10)
  }, 30_000)

  it('紫边模式:高对比边缘处绿色被压低(推向紫边观感)', async () => {
    const purple = await renderMetrics(browser, { uMode: 2, uAmount: 1 })
    const radial = await renderMetrics(browser, { uMode: 0, uAmount: 1 })
    expect(purple.purpleEdgeRatio).toBeGreaterThan(0.3)
    expect(radial.purpleEdgeRatio).toBeLessThan(0.1)
  }, 30_000)
})
