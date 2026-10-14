// src/lib/batch/previewSource.test.ts
// 对角线预览降采样源回归:大图必须出长边 ≤512 的副本(全尺寸渲染是调参卡顿
// 根因)、同源图缓存同一副本、小图原样透传。真浏览器测试(canvas/Image 依赖
// DOM),harness 同 offscreenExport.test.ts 先例:自带 dev server(独立冷门端口
// +strictPort 避开 5177 残留坑),动态 import 藏 new Function 防 vitest SSR 重写。
import { spawn, type ChildProcess } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'

const PORT = 51791
const DEV_URL = `http://localhost:${PORT}`

declare global {
  interface Window {
    /** 造纯色源图助手(beforeAll 注入,各用例共用) */
    __mkImg: (w: number, h: number, hue: string) => Promise<HTMLImageElement>
  }
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((c): c is string => Boolean(c))

async function findBrowser(): Promise<string> {
  for (const c of chromeCandidates) {
    try {
      await access(c, constants.X_OK)
      return c
    } catch { /* 下一个候选 */ }
  }
  throw new Error('previewSource 测试需要 Chrome/Edge')
}

describe('previewSource 对角线预览降采样源', () => {
  let viteProc: ChildProcess | null = null
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    const viteBin = path.resolve('node_modules/vite/bin/vite.js')
    viteProc = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
    let up = false
    for (let i = 0; i < 90; i++) {
      try {
        const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) })
        if (res.ok) { up = true; break }
      } catch { /* 尚未起完 */ }
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
    // 源图构造助手注入 window:各用例 evaluate 共用,免逐用例内联
    await page.evaluate(() => {
      window.__mkImg = (w, h, hue) =>
        new Promise((resolve, reject) => {
          const c = document.createElement('canvas')
          c.width = w
          c.height = h
          const ctx = c.getContext('2d')
          if (!ctx) { reject(new Error('no 2d context')); return }
          ctx.fillStyle = hue
          ctx.fillRect(0, 0, w, h)
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('源图构造失败'))
          img.src = c.toDataURL('image/png')
        })
    })
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    const proc = viteProc
    if (proc?.pid) {
      // git bash kill 带不走 node 子进程树:taskkill /T 精确清
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
    }
  })

  /** 页内跑 previewSource:返回产物尺寸 + 是否源元素本体(+第二次调用是否同副本)。 */
  async function runCase(
    w: number,
    h: number,
    opts: { twice?: boolean } = {},
  ): Promise<{ w: number; h: number; same: boolean; sameTwice: boolean }> {
    return page.evaluate(async (w: number, h: number, twice: boolean) => {
      const img = await window.__mkImg(w, h, '#336699')
      const imp = (new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>)
      const mod = (await imp('/src/lib/batch/previewSource.ts')) as {
        previewSource: (i: HTMLImageElement) => Promise<HTMLImageElement>
      }
      const a = await mod.previewSource(img)
      const b = twice ? await mod.previewSource(img) : a
      return { w: b.width, h: b.height, same: b === img, sameTwice: a === b }
    }, w, h, opts.twice ?? false)
  }

  it('大图(2048×1024)降采样到长边 512,非源元素本体', async () => {
    const r = await runCase(2048, 1024)
    expect(r.w).toBe(512)
    expect(r.h).toBe(256)
    expect(r.same).toBe(false)
  })

  it('同源图两次调用返回同一副本(缓存生效)', async () => {
    const r = await runCase(3000, 1000, { twice: true })
    expect(r.w).toBe(512)
    expect(r.h).toBe(171)
    expect(r.same).toBe(false)
    expect(r.sameTwice).toBe(true)
  })

  it('小图(400×300)原样透传(零成本路径)', async () => {
    const r = await runCase(400, 300)
    expect(r.w).toBe(400)
    expect(r.h).toBe(300)
    expect(r.same).toBe(true)
  })

  it('不同源图各自独立副本,竖图按长边缩', async () => {
    const r = await page.evaluate(async () => {
      const imp = (new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>)
      const mod = (await imp('/src/lib/batch/previewSource.ts')) as {
        previewSource: (i: HTMLImageElement) => Promise<HTMLImageElement>
      }
      const a = await mod.previewSource(await window.__mkImg(2500, 1000, '#123456'))
      const b = await mod.previewSource(await window.__mkImg(1000, 2500, '#654321'))
      return [[a.width, a.height], [b.width, b.height]] as Array<[number, number]>
    })
    expect(r[0]).toEqual([512, 205])   // 2500×1000 → 512×205(四舍五入)
    expect(r[1]).toEqual([205, 512])   // 1000×2500 竖图 → 长边 512 落在高
  })
})
