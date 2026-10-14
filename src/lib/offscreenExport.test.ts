// src/lib/offscreenExport.test.ts
// 单图导出全尺寸回归:预览画布由 ShaderRenderer.loadImage fit 到 .compare-container
// 显示尺寸(小窗口/移动端导出随窗口缩水的根因),离屏导出必须保持
// clamp(原图长边, 2048)——与批量管线同尺寸语义。对照组先证明容器 fit 真实在场,
// 防止断言退化为恒真。
//
// 真浏览器测试:动态 import('/src/lib/*.ts') 需经 vite transform,故自带 dev
// server——独立端口 51790 + --strictPort,避开 5177 残留/漂移坑(memory);
// Windows 下 node 子进程 taskkill /T 精确清理,不按端口盲杀。
import { spawn, type ChildProcess } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'

const PORT = 51790
const DEV_URL = `http://localhost:${PORT}`

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
  throw new Error('Chrome or Chromium is required for the offscreen export test')
}

type ExportResult = {
  ok: boolean
  error?: string
  previewW?: number
  previewH?: number
  canvasW?: number
  canvasH?: number
  blobSize?: number
  bmpW?: number
  bmpH?: number
}

describe('renderFullResCanvas 离屏全尺寸导出', () => {
  let viteProc: ChildProcess | null = null
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    const viteBin = path.resolve('node_modules/vite/bin/vite.js')
    viteProc = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], {
      stdio: 'ignore',
    })
    let up = false
    for (let i = 0; i < 90; i++) {
      try {
        const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) })
        if (res.ok) {
          up = true
          break
        }
      } catch {
        // 尚未起完,继续等
      }
      await sleep(500)
    }
    if (!up) throw new Error(`vite dev server 未在 ${DEV_URL} 探活成功`)

    browser = await puppeteer.launch({
      executablePath: await findBrowser(),
      headless: true,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
    })
    page = await browser.newPage()
    await page.setViewport({ width: 500, height: 500 })
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' })
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    const proc = viteProc
    if (proc?.pid) {
      // git bash kill 带不走 node 子进程树:taskkill /T 精确清(vite 会再 spawn esbuild)
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
    }
  })

  async function runExportCase(naturalW: number, naturalH: number): Promise<ExportResult> {
    return page.evaluate(
      async (naturalW: number, naturalH: number): Promise<ExportResult> => {
        const makeImage = (w: number, h: number): Promise<HTMLImageElement> =>
          new Promise((resolve, reject) => {
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const ctx = c.getContext('2d')!
            const g = ctx.createLinearGradient(0, 0, w, h)
            g.addColorStop(0, '#ff3366')
            g.addColorStop(0.5, '#33ff66')
            g.addColorStop(1, '#3366ff')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, w, h)
            // 网格线:PNG 压缩后有结构可咬,blob 体积断言不退化成常数
            ctx.strokeStyle = '#000'
            for (let x = 0; x < w; x += 100) {
              ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
            }
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('源图构造失败'))
            img.src = c.toDataURL('image/png')
          })

        try {
          const img = await makeImage(naturalW, naturalH)

          // 动态 import 藏进 new Function:vitest 会把 evaluate 回调里的字面量
          // import() 重写成 __vite_ssr_dynamic_import__(node 侧函数,浏览器未定义),
          // @vite-ignore 在 rolldown-vite 下挡不住;经 new Function 构造的代码
          // 不经 transform,浏览器执行原生 import()
          const imp = (new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>)

          // 对照组:预览画布挂 300×300 .compare-container → loadImage 被 fit
          // (bug 机理在场证明;300×300 内 16:12 图 → 300×225)
          const container = document.createElement('div')
          container.className = 'compare-container'
          container.style.width = '300px'
          container.style.height = '300px'
          document.body.appendChild(container)
          const previewCanvas = document.createElement('canvas')
          container.appendChild(previewCanvas)
          const SR = ((await imp('/src/lib/ShaderRenderer.ts')) as {
            ShaderRenderer: new (c: HTMLCanvasElement) => { loadImage(i: HTMLImageElement): void; destroy(): void }
          }).ShaderRenderer
          const previewRenderer = new SR(previewCanvas)
          previewRenderer.loadImage(img)
          const previewW = previewCanvas.width
          const previewH = previewCanvas.height
          container.remove()
          previewRenderer.destroy()

          // 被测:离屏全尺寸重渲(pass-through shader,风格无关)
          const PASS_FRAG = `precision mediump float; varying vec2 vUv; uniform sampler2D uImage;
            void main() { gl_FragColor = texture2D(uImage, vUv); }`
          const styleDef = {
            id: 'kaleidoscope',
            label: 't',
            description: 't',
            shaderImports: [() => Promise.resolve(PASS_FRAG)],
            params: [],
          }
          const mod = (await imp('/src/lib/offscreenExport.ts')) as {
            renderFullResCanvas: (o: Record<string, unknown>) => Promise<{ canvas: HTMLCanvasElement; dispose: () => void } | null>
          }
          const r = await mod.renderFullResCanvas({
            image: img,
            styleDef,
            params: {},
            textParams: {},
            fontParams: {},
            brightest: null,
            zoneMask: null,
          })
          if (!r) return { ok: false, error: 'renderFullResCanvas 返回 null', previewW, previewH }
          const blob = await new Promise<Blob | null>((res) => r.canvas.toBlob(res, 'image/png'))
          const bmp = blob ? await createImageBitmap(blob) : null
          const out: ExportResult = {
            ok: true,
            previewW,
            previewH,
            canvasW: r.canvas.width,
            canvasH: r.canvas.height,
            blobSize: blob?.size ?? 0,
            bmpW: bmp?.width ?? 0,
            bmpH: bmp?.height ?? 0,
          }
          r.dispose()
          return out
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      },
      naturalW,
      naturalH,
    )
  }

  it('小视口下离屏画布=原图尺寸,挂小容器的预览画布被 fit(在场证明)', async () => {
    const r = await runExportCase(1600, 1200)
    expect(r.error).toBeUndefined()
    // 对照组:容器 fit 真实缩水(300×300 内 1600×1200 → 300×225)
    expect(r.previewW).toBe(300)
    expect(r.previewH).toBe(225)
    // 被测:离屏画布保持原图尺寸,不随视口/容器
    expect(r.canvasW).toBe(1600)
    expect(r.canvasH).toBe(1200)
    // 导出物有效:PNG blob 可解码且尺寸一致,体积量级正常(渐变+网格 1600×1200)
    expect(r.blobSize).toBeGreaterThan(50_000)
    expect(r.bmpW).toBe(1600)
    expect(r.bmpH).toBe(1200)
  }, 60_000)

  it('超 2048 的原图 clamp 到 2048 长边(与批量管线同语义)', async () => {
    const r = await runExportCase(3200, 2400)
    expect(r.error).toBeUndefined()
    expect(r.canvasW).toBe(2048)
    expect(r.canvasH).toBe(1536)
    expect(r.bmpW).toBe(2048)
    expect(r.bmpH).toBe(1536)
  }, 60_000)

  it('dispose 后可再次导出(上下文即建即毁,二次调用不残留)', async () => {
    const first = await runExportCase(1600, 1200)
    expect(first.ok).toBe(true)
    const second = await runExportCase(1600, 1200)
    expect(second.error).toBeUndefined()
    expect(second.canvasW).toBe(1600)
    expect(second.canvasH).toBe(1200)
  }, 60_000)
})
