// src/lib/batch/runBatch.ts
// 批量队列执行器:顺序处理、逐行让出主线程(处理期间单图界面仍可流畅调参)、
// 失败不阻塞、可取消。renderTask 可注入——单测注入假任务,生产用离屏渲染。
import { zipSync } from 'fflate'
import type { StyleId } from '../../types'
import { ShaderRenderer } from '../ShaderRenderer'
import { AsciiCanvasRenderer } from '../AsciiCanvasRenderer'
import { findBrightestPoint } from '../brightPoint'
import { renderImage, exportCanvasBlob, compositeOnBlack } from '../renderImage'
import { getStyle } from '../StyleRegistry'
import { decodeSeed, encodeSeed } from '../seedCodec'
import { decideBatchExport } from '../license/gating'
import { exportWatermarked, injectSvgWatermark } from '../license/watermark'
import { mergeWithDefaults } from '../presetStore'
import { effectiveFormat, type BatchFormat } from './batchJob'
import type { BatchImage } from './imageList'

/** 处理任务快照:一行一任务。seed 为调用方(drain)定格的生效种子,
 *  处理中调参只影响下一次处理,进行中任务不受影响。 */
export interface ProcessingTask {
  id: string
  image: HTMLImageElement
  seed: string
}

/** 处理基线快照:params/textParams 供种子解析打底(非 seedable 项延续调参现场);
 *  fontParams 由渲染任务闭包消费(字体不参与种子编码)。 */
export interface ProcessingBaseline {
  params: Record<string, number>
  textParams: Record<string, string>
  fontParams: Record<string, FontFace | null>
}

/** v2 处理任务集(v1 BatchJob 已退役):tasks 即队列,行状态归 App2D/images。 */
export interface ProcessingJob {
  tasks: ProcessingTask[]
  format: BatchFormat
  baseline: ProcessingBaseline
}

export interface RenderTask {
  id: string
  image: HTMLImageElement
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

/** 种子→渲染状态(base 打底)。与 imageList.loadWorking 的「风格默认打底」刻意
 *  不同(T1 concern):批量渲染的非 seedable 项(toggle/select/text)必须延续整批
 *  基线快照——处理结果要的是调参现场,不是风格默认;而 UI 载入工作副本要与单图
 *  粘贴种子行为一致才回默认。种子携带其他风格时跟随种子(种子是完整状态)。
 *  非法返回 null。 */
export function resolveRowRenderState(
  baseline: ProcessingBaseline,
  seedCode: string,
): { styleId: StyleId; params: Record<string, number>; textParams: Record<string, string> } | null {
  const decoded = decodeSeed(seedCode)
  if (!decoded) return null
  const def = getStyle(decoded.styleId)
  if (!def) return null
  const merged = mergeWithDefaults(
    def,
    { ...baseline.params, ...decoded.params },
    { ...baseline.textParams, ...decoded.colorParams },
  )
  return { styleId: decoded.styleId, params: merged.params, textParams: merged.textParams }
}

export function createBatchRunner(renderTask: RenderTaskFn) {
  let cancelled = false
  async function run(job: ProcessingJob, cb: { onRowUpdate: (id: string, patch: Partial<BatchImage>) => void }): Promise<void> {
    cancelled = false
    // 迭代快照:run 期间调用方往 tasks 数组追加不影响本轮(数组迭代器是活的,
    // 拷贝一份与 v1 rows.filter 同语义),后续 run 由外层 drain 复查续跑
    const queue = [...job.tasks]
    for (const task of queue) {
      if (cancelled) break
      // 重渲染前先清空旧快照:重跑/重骰/重试都必经 processing,单一闸口
      // 保证非 done 行不携带上一轮的渲染元数据
      cb.onRowUpdate(task.id, { status: 'processing', error: null, renderedSeed: null, renderedStyleId: null })
      await nextFrame()   // 行处理前让出一帧,UI 先绘出 processing 态
      try {
        const state = resolveRowRenderState(job.baseline, task.seed)
        if (!state) throw new Error('invalid seed')
        const blob = await renderTask({ id: task.id, image: task.image, ...state, format: effectiveFormat(state.styleId, job.format) })
        // done 快照:定格实际用于渲染的种子与解析出的风格(种子可携带其他风格)
        cb.onRowUpdate(task.id, { status: 'done', blob, renderedSeed: task.seed, renderedStyleId: state.styleId })
      } catch (e) {
        cb.onRowUpdate(task.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  return { run, cancel: () => { cancelled = true } }
}

/** 离屏渲染任务:懒建 renderer,行间复用;异常时销毁重建(WebGL context lost 自愈)。 */
export function createCanvasRenderTask(baseline: ProcessingBaseline): RenderTaskFn {
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
    if (!isCanvas2d) renderer!.loadImage(t.image)

    // animelight 自动光源:逐图检测(每图最亮点不同)
    let brightest: { x: number; y: number } | null = null
    try {
      const THUMB = 32
      const nw = t.image.naturalWidth || t.image.width
      const nh = t.image.naturalHeight || t.image.height
      const s = Math.min(1, THUMB / Math.max(nw, nh))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(nw * s))
      c.height = Math.max(1, Math.round(nh * s))
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(t.image, 0, 0, c.width, c.height)
        brightest = findBrightestPoint(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
      }
    } catch { /* 跨域等失败回落默认光源 */ }

    try {
      await renderImage({
        canvas: canvas ?? document.createElement('canvas'),
        asciiCanvas: asciiCanvas ?? document.createElement('canvas'),
        renderer,
        asciiRenderer,
        image: t.image,
        styleDef: def,
        params: t.params,
        textParams: t.textParams,
        fontParams: baseline.fontParams,
        brightest,
      })
      const out = isCanvas2d ? asciiCanvas! : canvas!
      // 批量水印决策:每张导出瞬间现查(会员 none/免费 tiled;批量不消耗单图额度)。
      // 种子码由渲染状态现编码(与行 seed roundtrip 等价,RenderTask 无需携带 seed)
      const wm = decideBatchExport().mode
      const seedText = encodeSeed(t.styleId, t.params, def, t.textParams)
      if (t.format === 'svg') {
        const family = baseline.fontParams['uFont']?.family ?? 'monospace'
        const svg = asciiRenderer.exportSvg(family)
        return new Blob([wm === 'tiled' ? injectSvgWatermark(svg, 'tiled', seedText) : svg], { type: 'image/svg+xml' })
      }
      if (t.format === 'jpg') {
        const showBg = t.params['uShowBg'] ?? 1
        // toBlob 可能返回 null(画布受污染/过大),显式抛错让该行进 failed 而非产出空 blob。
        // JPG 水印顺序契约:渲染→黑底→水印→toBlob(与单图同规则)
        const base = isCanvas2d && showBg !== 1 ? compositeOnBlack(out) : out
        const jpg = wm === 'tiled'
          ? await exportWatermarked(base, 'tiled', seedText, 'image/jpeg')
          : await exportCanvasBlob(base, 'image/jpeg')
        if (!jpg) throw new Error('jpg export failed')
        return jpg
      }
      const png = wm === 'tiled'
        ? await exportWatermarked(out, 'tiled', seedText, 'image/png')
        : await exportCanvasBlob(out, 'image/png')
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
