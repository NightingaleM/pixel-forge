// src/lib/batch/runBatch.ts
// 批量队列执行器:顺序处理、逐行让出主线程(处理期间单图界面仍可流畅调参)、
// 失败不阻塞、可取消。renderTask 可注入——单测注入假任务,生产用离屏渲染。
import { zipSync } from 'fflate'
import type { StyleId } from '../../types'
import { ShaderRenderer } from '../ShaderRenderer'
import { AsciiCanvasRenderer } from '../AsciiCanvasRenderer'
import { findBrightestPoint } from '../brightPoint'
import { renderImage, exportCanvasBlob, exportJpgWithBlackBg } from '../renderImage'
import { getStyle } from '../StyleRegistry'
import { resolveRowRenderState, rowSeed, effectiveFormat, type BatchBaseline, type BatchFormat, type BatchJob, type BatchRow } from './batchJob'

export interface RenderTask {
  row: BatchRow
  styleId: StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  format: BatchFormat
}
export type RenderTaskFn = (t: RenderTask) => Promise<Blob>

// 测试跑在 Node 环境(无 requestAnimationFrame),回落 setTimeout 让出事件循环;
// 浏览器里用 rAF 对齐渲染帧,保证 processing 态先绘制再开始渲染
const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0),
  )

export function createBatchRunner(renderTask: RenderTaskFn) {
  let cancelled = false
  async function run(job: BatchJob, cb: { onRowUpdate: (id: string, patch: Partial<BatchRow>) => void }): Promise<void> {
    cancelled = false
    // 快照待处理行:run 期间 rows 追加不影响本轮,后续 run 再 drain
    const queue = job.rows.filter((r) => r.status === 'pending' || r.status === 'failed')
    for (const row of queue) {
      if (cancelled) break
      cb.onRowUpdate(row.id, { status: 'processing', error: null })
      await nextFrame()   // 行处理前让出一帧,UI 先绘出 processing 态
      try {
        const state = resolveRowRenderState(job.baseline, rowSeed(job, row))
        if (!state) throw new Error('invalid seed')
        const blob = await renderTask({ row, ...state, format: effectiveFormat(state.styleId, job.format) })
        cb.onRowUpdate(row.id, { status: 'done', blob })
      } catch (e) {
        cb.onRowUpdate(row.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  return { run, cancel: () => { cancelled = true } }
}

/** 离屏渲染任务:懒建 renderer,行间复用;异常时销毁重建(WebGL context lost 自愈)。 */
export function createCanvasRenderTask(baseline: BatchBaseline): RenderTaskFn {
  let renderer: ShaderRenderer | null = null
  let asciiRenderer: AsciiCanvasRenderer | null = null
  let canvas: HTMLCanvasElement | null = null
  let asciiCanvas: HTMLCanvasElement | null = null

  const reset = () => {
    try { renderer?.destroy() } catch { /* context 已 lost 时 destroy 可能抛错 */ }
    renderer = null
    asciiRenderer = null
    canvas = null
    asciiCanvas = null
  }

  return async (t) => {
    const def = getStyle(t.styleId)
    if (!def) throw new Error(`unknown style ${t.styleId}`)
    const isCanvas2d = def.renderMode === 'canvas2d'
    if (!asciiRenderer) asciiRenderer = new AsciiCanvasRenderer()
    if (isCanvas2d && !asciiCanvas) asciiCanvas = document.createElement('canvas')
    if (!isCanvas2d && !renderer) {
      canvas = document.createElement('canvas')
      renderer = new ShaderRenderer(canvas)
    }
    if (!isCanvas2d) renderer!.loadImage(t.row.image)

    // animelight 自动光源:逐图检测(每图最亮点不同)
    let brightest: { x: number; y: number } | null = null
    try {
      const THUMB = 32
      const nw = t.row.image.naturalWidth || t.row.image.width
      const nh = t.row.image.naturalHeight || t.row.image.height
      const s = Math.min(1, THUMB / Math.max(nw, nh))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(nw * s))
      c.height = Math.max(1, Math.round(nh * s))
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(t.row.image, 0, 0, c.width, c.height)
        brightest = findBrightestPoint(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
      }
    } catch { /* 跨域等失败回落默认光源 */ }

    try {
      await renderImage({
        canvas: canvas ?? document.createElement('canvas'),
        asciiCanvas: asciiCanvas ?? document.createElement('canvas'),
        renderer,
        asciiRenderer,
        image: t.row.image,
        styleDef: def,
        params: t.params,
        textParams: t.textParams,
        fontParams: baseline.fontParams,
        brightest,
      })
      const out = isCanvas2d ? asciiCanvas! : canvas!
      if (t.format === 'svg') {
        const family = baseline.fontParams['uFont']?.family ?? 'monospace'
        return new Blob([asciiRenderer.exportSvg(family)], { type: 'image/svg+xml' })
      }
      if (t.format === 'jpg') {
        const showBg = t.params['uShowBg'] ?? 1
        // toBlob 可能返回 null(画布受污染/过大),显式抛错让该行进 failed 而非产出空 blob
        const jpg = isCanvas2d && showBg !== 1
          ? await exportJpgWithBlackBg(out)
          : await exportCanvasBlob(out, 'image/jpeg')
        if (!jpg) throw new Error('jpg export failed')
        return jpg
      }
      const png = await exportCanvasBlob(out, 'image/png')
      if (!png) throw new Error('png export failed')
      return png
    } catch (e) {
      reset()   // 渲染中途失败大概率是 context lost,重建以自愈
      throw e
    }
  }
}

/** fflate 打包。 */
export async function buildBatchZip(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  for (const e of entries) {
    files[e.name] = new Uint8Array(await e.blob.arrayBuffer())
  }
  return new Blob([zipSync(files)], { type: 'application/zip' })
}
