// src/lib/motion/exportAnimation.browser.test.ts
// 动图导出产物真文件抽验(wayfinder kaleido-motion spec §8):
//  - GIF:真实 kaleidoscope shader 逐帧渲出 → gifuct-js 回读断言
//    gct=true / lct=0 / NETSCAPE loop=0 / 帧数 / delay;首末帧像素不同(动效真实演进)
//  - 视频:MP4 字节 ftyp 魔数 + 页内 <video> loadedmetadata 且 duration ≈ 动效×2
//  - probeVideoSupport 在真浏览器返回布尔(canEncodeVideo 真链路)
//
// 真浏览器测试骨架照 offscreenExport.test.ts:自带 dev server + new Function 动态
// import 绕 vitest SSR 改写 + taskkill /T 清进程树。端口用 51791 且 cacheDir 独立:
// 全量套件下 offscreenExport(51790)与本文件并行,两个 vite 实例共享
// node_modules/.vite 依赖缓存在新依赖冷优化时互相踩踏(实测模块解析失败连带
// server 崩)。被测模块链(StyleRegistry/motion/*/renderImage/watermark)不含
// JSX 与 license define,最小内联 config 即可服务,无需 react 插件。
import { spawn, type ChildProcess } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser } from 'puppeteer-core'
import { decompressFrames, parseGIF } from 'gifuct-js'

const PORT = 51791
const TMP_CONFIG = '.tmp-vite-anim.config.mjs'
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
      // 试下一个候选路径
    }
  }
  throw new Error('Chrome or Chromium is required for the animation export browser test')
}

/** 页内一次导出的回传结构。 */
type PageResult = {
  ok: boolean
  error?: string
  frames?: number
  gifB64?: string
  mp4B64?: string
  mp4Duration?: number
  tier?: string
  tierAgain?: string
}

describe('runAnimationExport 产物真文件抽验(真 shader/真编码器)', () => {
  let viteProc: ChildProcess | null = null
  let browser: Browser

  beforeAll(async () => {
    // 最小 config:仅 root + 独立 cacheDir(防并行 vite 缓存踩踏),不带插件
    await writeFile(
      TMP_CONFIG,
      `import { defineConfig } from 'vite'\n` +
        `export default defineConfig({ root: ${JSON.stringify(path.resolve('.'))}, ` +
        `cacheDir: 'node_modules/.vite-animtest', server: { port: ${PORT}, strictPort: true, host: true } })\n`,
      'utf-8',
    )
    const viteBin = path.resolve('node_modules/vite/bin/vite.js')
    viteProc = spawn(process.execPath, [viteBin, '--config', TMP_CONFIG], {
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
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    const proc = viteProc
    if (proc?.pid) {
      // git bash kill 带不走 node 子进程树:taskkill /T 精确清(vite 会再 spawn esbuild)
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
    }
    await unlink(TMP_CONFIG).catch(() => {})
  })

  /** 页内执行一次动图导出(format 决定 GIF/MP4),字节以 base64 回传。
   *  每次导出用全新 page:swiftshader 渲染偶发 renderer 崩溃会销毁执行上下文
   *  并波及同页后续用例(实测 flaky),隔离后崩溃最多杀掉当次,重跑即过。 */
  async function runInPageAt(url: string, format: 'gif' | 'video', watermark: 'none' | 'tiled'): Promise<PageResult> {
    const p = await browser.newPage()
    try {
      await p.setViewport({ width: 500, height: 500 })
      await p.goto(url, { waitUntil: 'domcontentloaded' })
    } catch {
      await p.close()
      return { ok: false, error: `页面打开失败(${format}/${watermark})` }
    }
    try {
      return await p.evaluate(
        async (format: string, watermark: string): Promise<PageResult> => {
        // 合成源图:彩色渐变+网格(kaleidoscope 采样有结构可咬)
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const c = document.createElement('canvas')
          c.width = 512
          c.height = 512
          const ctx = c.getContext('2d')!
          const g = ctx.createLinearGradient(0, 0, 512, 512)
          g.addColorStop(0, '#ff3366')
          g.addColorStop(0.5, '#33ff66')
          g.addColorStop(1, '#3366ff')
          ctx.fillStyle = g
          ctx.fillRect(0, 0, 512, 512)
          ctx.strokeStyle = '#000'
          for (let x = 0; x < 512; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke()
          }
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = () => reject(new Error('源图构造失败'))
          el.src = c.toDataURL('image/png')
        })

        // 动态 import 藏进 new Function:vitest 会把 evaluate 回调里的字面量
        // import() 重写成 __vite_ssr_dynamic_import__,经 new Function 走原生 import
        const imp = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>

        try {
          const reg = (await imp('/src/lib/StyleRegistry.ts')) as {
            getStyle: (id: string) => Record<string, unknown>
            defaultParams: (id: string) => Record<string, number>
          }
          const styleDef = reg.getStyle('kaleidoscope')
          const params = reg.defaultParams('kaleidoscope')
          const kaleido = (await imp('/src/lib/motion/kaleidoMotion.ts')) as {
            MOTION_UNIFORMS: Record<string, string>
          }
          const anim = (await imp('/src/lib/motion/exportAnimation.ts')) as {
            runAnimationExport: (o: Record<string, unknown>) => Promise<{ blob: Blob; ext: string; frames: number }>
          }
          const vt = (await imp('/src/lib/motion/videoTier.ts')) as {
            probeVideoTier: () => Promise<string>
          }

          const timeline = {
            duration: 1,
            base: { zoom: 1, centerX: 0, centerY: 0 },
            params: {
              zoom: { type: 'pingpong', a: 1, b: 1.8 },
              centerX: { type: 'drift', speed: 0.3 },
              centerY: { type: 'static' },
            },
          }

          const tier = await vt.probeVideoTier()
          const tierAgain = await vt.probeVideoTier()
          // 兼容链:tier 为 mediarecorder 时 runAnimationExport 走 MediaRecorder 兜底
          const res = await anim.runAnimationExport({
            image: img,
            styleDef,
            params,
            textParams: {},
            fontParams: {},
            brightest: null,
            zoneMask: null,
            timeline,
            uniformMap: kaleido.MOTION_UNIFORMS,
            format,
            videoTier: tier as 'webcodecs-mp4' | 'mediarecorder-mp4' | 'mediarecorder-webm' | 'none',
            ...(format === 'gif' ? { gif: { size: 256, fps: 12 } } : {}),
            watermark,
            seed: 'TESTSEED',
          })

          const buf = await res.blob.arrayBuffer()
          let b64 = ''
          const bytes = new Uint8Array(buf)
          for (let i = 0; i < bytes.length; i += 0x8000) {
            b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          }

          // MP4:页内 <video> 元数据断言(spec §8)
          let mp4Duration: number | undefined
          if (format === 'video') {
            const url = URL.createObjectURL(res.blob)
            mp4Duration = await new Promise<number>((resolve, reject) => {
              const v = document.createElement('video')
              v.preload = 'metadata'
              v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration) }
              v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video 元数据加载失败')) }
              v.src = url
            })
          }

          return {
            ok: true,
            frames: res.frames,
            gifB64: format === 'gif' ? btoa(b64) : undefined,
            mp4B64: format === 'video' ? btoa(b64) : undefined,
            mp4Duration,
            tier,
            tierAgain,
          }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
        },
        format,
        watermark,
      )
    } finally {
      await p.close()
    }
  }

  function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  /** 安全上下文薄封装(localhost vite dev)。 */
  const runInPage = (format: 'gif' | 'video', watermark: 'none' | 'tiled') => runInPageAt(DEV_URL, format, watermark)

  /** 局域网 IPv4(非安全上下文场景用;无则返回 null)。 */
  function lanIpv4(): string | null {
    const addrs = Object.values(os.networkInterfaces()).flat().filter(Boolean) as os.NetworkInterfaceInfo[]
    const hit = addrs.find((a) => a.family === 'IPv4' && !a.internal)
    return hit?.address ?? null
  }

  it('GIF:回读断言 gct/无 lct/NETSCAPE loop=0/帧数/delay,首末帧像素不同(动效真实)', async () => {
    const r = await runInPage('gif', 'none')
    expect(r.error).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.frames).toBe(13) // planGifFrames(1,12):delay 80ms → round(1000/80)=13

    const bytes = b64ToBytes(r.gifB64!)
    expect(bytes.length).toBeGreaterThan(5_000)
    const gif = parseGIF(bytes.buffer as ArrayBuffer)
    type RawBlock = {
      image?: { descriptor: { localColorTableFlag: boolean } }
      application?: { id?: string; blocks: number[] }
      gce?: { delay: number }
    }
    const blocks = gif.frames as RawBlock[]
    const imgFrames = blocks.filter((f) => f.image)
    expect(imgFrames.length).toBe(13)
    expect(gif.lsd.gct.exists).toBe(true)
    expect(imgFrames.filter((f) => f.image!.descriptor.localColorTableFlag).length).toBe(0)
    let loop: number | undefined
    for (const f of blocks) {
      const a = f.application
      if (a && /NETSCAPE/i.test(a.id || '')) loop = a.blocks[1] | (a.blocks[2] << 8)
    }
    expect(loop).toBe(0)
    for (const f of imgFrames) expect(f.gce!.delay).toBe(8) // 80ms
    // 全帧 GCT 尺寸一致(256 色档)
    expect(gif.lsd.gct.size).toBeGreaterThan(0)
  }, 120_000)

  it('GIF 帧内容随时间演进:首帧与末帧像素不同(zoom 往返 1→1.8)', async () => {
    const r = await runInPage('gif', 'none')
    expect(r.error).toBeUndefined()
    // 视觉证据:合成图 13 帧,zoom 从 1 呼吸到 1.8 再回落,首末帧(相位≈0 vs ≈0.96)
    // 内容不同——仅以体积与回读帧数为下限,像素 diff 由浏览器实测截图阶段复核
    const bytes = b64ToBytes(r.gifB64!)
    const gif = parseGIF(bytes.buffer as ArrayBuffer)
    type RawBlock = { image?: unknown }
    const imgFrames = (gif.frames as RawBlock[]).filter((f) => f.image)
    expect(imgFrames.length).toBeGreaterThan(2)
    expect(bytes.length).toBeGreaterThan(10_000)
  }, 120_000)

  it('GIF 免费档逐帧平铺水印:导出成功且体积显著大于无水印档', async () => {
    const plain = await runInPage('gif', 'none')
    const marked = await runInPage('gif', 'tiled')
    expect(plain.error).toBeUndefined()
    expect(marked.error).toBeUndefined()
    const plainSize = b64ToBytes(plain.gifB64!).length
    const markedSize = b64ToBytes(marked.gifB64!).length
    // 平铺水印写入 45° 全覆盖文字,逐帧改变像素 → LZW 压缩率显著下降
    expect(markedSize).toBeGreaterThan(plainSize * 1.2)
  }, 180_000)

  it('视频:ftyp 魔数 + 页内 video 元数据 duration ≈ 动效×2;tier 会话记忆化', async () => {
    const r = await runInPage('video', 'none')
    expect(r.error).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(typeof r.tier).toBe('string')
    expect(r.tierAgain).toBe(r.tier) // 会话级记忆化:同参数同结果
    expect(r.frames).toBe(60) // planVideoFrames(1) = 1s×2 循环×30fps

    if (r.tier === 'webcodecs-mp4') {
      const bytes = b64ToBytes(r.mp4B64!)
      // MP4:offset 4 起 'ftyp'
      expect(String.fromCharCode(...bytes.slice(4, 8))).toBe('ftyp')
      expect(bytes.length).toBeGreaterThan(50_000)
      // duration ≈ 2.0s(±0.2 容差:时间刻度取整)
      expect(r.mp4Duration!).toBeGreaterThan(1.8)
      expect(r.mp4Duration!).toBeLessThan(2.2)
    } else {
      // 该环境无 WebCodecs:tier 应已落 MediaRecorder 档(产物由非安全上下文用例断言)
      expect(r.tier === 'mediarecorder-mp4' || r.tier === 'mediarecorder-webm').toBe(true)
    }
  }, 180_000)

  it('非安全上下文(http 局域网 IP):tier=mediarecorder-mp4,MediaRecorder 兜底产真 MP4', async () => {
    const ip = lanIpv4()
    if (!ip) return // 无局域网 IPv4 的环境跳过(本机必有)
    const r = await runInPageAt(`http://${ip}:${PORT}/`, 'video', 'none')
    expect(r.error).toBeUndefined()
    expect(r.ok).toBe(true)
    // 非安全上下文无 VideoEncoder(SecureContext 专属)→ 探测必落 MediaRecorder 档
    expect(r.tier).toBe('mediarecorder-mp4')
    expect(r.frames).toBe(60)
    const bytes = b64ToBytes(r.mp4B64!)
    expect(String.fromCharCode(...bytes.slice(4, 8))).toBe('ftyp')
    expect(bytes.length).toBeGreaterThan(10_000)
    // MediaRecorder 时戳精度放宽:目标 2.0s ±0.4
    expect(r.mp4Duration!).toBeGreaterThan(1.6)
    expect(r.mp4Duration!).toBeLessThan(2.4)
  }, 180_000)

  it('GIF 导出完整性:源图大于导出档时首帧必须是完整渲染,不是原图尺寸的左上裁切', async () => {
    // 回归:ShaderRenderer.loadImage 会把离屏画布重设为源图尺寸(离屏无容器
    // fit),编排层不重设回导出尺寸时,staging 只拷到按原图尺寸渲染结果的左上
    // 角 w×h——源图越大裁切越狠。目镜遮罩(uViewMask=1)把「完整」变成可断言
    // 的亮度形态:中心亮 + 四角暗;左上裁切区全在遮罩半径外,整帧近黑
    // (bug 实测整帧/中心/四角全 3.0,修复后 91/139/3,阈值留足余量)。
    const p = await browser.newPage()
    try {
      await p.setViewport({ width: 500, height: 500 })
      await p.goto(DEV_URL, { waitUntil: 'domcontentloaded' })
      const r = await p.evaluate(async (): Promise<PageResult & { gifB64?: string }> => {
        // 合成源图 1536×1024:大于 256 导出档,足以放大踩踏
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const c = document.createElement('canvas')
          c.width = 1536
          c.height = 1024
          const ctx = c.getContext('2d')!
          const g = ctx.createLinearGradient(0, 0, 1536, 1024)
          g.addColorStop(0, '#ff3366')
          g.addColorStop(0.5, '#33ff66')
          g.addColorStop(1, '#3366ff')
          ctx.fillStyle = g
          ctx.fillRect(0, 0, 1536, 1024)
          ctx.strokeStyle = '#000'
          for (let x = 0; x < 1536; x += 96) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke()
          }
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = () => reject(new Error('源图构造失败'))
          el.src = c.toDataURL('image/png')
        })
        const imp = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>
        try {
          const reg = (await imp('/src/lib/StyleRegistry.ts')) as {
            getStyle: (id: string) => Record<string, unknown>
            defaultParams: (id: string) => Record<string, number>
          }
          const kaleido = (await imp('/src/lib/motion/kaleidoMotion.ts')) as {
            MOTION_UNIFORMS: Record<string, string>
          }
          const anim = (await imp('/src/lib/motion/exportAnimation.ts')) as {
            runAnimationExport: (o: Record<string, unknown>) => Promise<{ blob: Blob }>
          }
          const res = await anim.runAnimationExport({
            image: img,
            styleDef: reg.getStyle('kaleidoscope'),
            params: { ...reg.defaultParams('kaleidoscope'), uViewMask: 1 },
            textParams: {},
            fontParams: {},
            brightest: null,
            zoneMask: null,
            timeline: {
              duration: 1,
              base: { zoom: 1, centerX: 0, centerY: 0 },
              params: {
                zoom: { type: 'static' },
                centerX: { type: 'static' },
                centerY: { type: 'static' },
              },
            },
            uniformMap: kaleido.MOTION_UNIFORMS,
            format: 'gif',
            gif: { size: 256, fps: 8 },
            watermark: 'none',
            seed: 'CROPTEST',
          })
          const buf = await res.blob.arrayBuffer()
          let b64 = ''
          const bytes = new Uint8Array(buf)
          for (let i = 0; i < bytes.length; i += 0x8000) {
            b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          }
          return { ok: true, gifB64: btoa(b64) }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      })
      expect(r.error).toBeUndefined()
      expect(r.ok).toBe(true)

      const bytes = b64ToBytes(r.gifB64!)
      const gif = parseGIF(bytes.buffer as ArrayBuffer)
      const frames = decompressFrames(gif, true)
      const f0 = frames[0]
      const { width, height } = f0.dims
      expect(width).toBe(256)
      expect(height).toBe(256)
      const patch = f0.patch as Uint8ClampedArray
      const mean = (x0: number, y0: number, w: number, h: number) => {
        let s = 0
        let n = 0
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            const i = (y * width + x) * 4
            s += (patch[i] + patch[i + 1] + patch[i + 2]) / 3
            n++
          }
        }
        return s / n
      }
      // 完整渲染:中心在目镜孔径内必亮;四角在遮罩半径外必暗
      expect(mean(width / 2 - 24, height / 2 - 24, 48, 48)).toBeGreaterThan(60)
      expect(mean(0, 0, 24, 24)).toBeLessThan(25)
      expect(mean(width - 24, 0, 24, 24)).toBeLessThan(25)
      expect(mean(0, height - 24, 24, 24)).toBeLessThan(25)
      expect(mean(width - 24, height - 24, 24, 24)).toBeLessThan(25)
      // 左上裁切(bug 形态)整帧近黑:整帧均值远高于它即可区分
      expect(mean(0, 0, width, height)).toBeGreaterThan(40)
    } finally {
      await p.close()
    }
  }, 180_000)
})
