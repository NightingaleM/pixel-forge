/**
 * 动图导出编排(wayfinder kaleido-motion spec §5):离屏逐帧渲 → 水印 → 编码器。
 *
 * 帧管线:离屏 WebGL canvas(导出尺寸,建一次循环复用)渲一帧 → 2D staging
 * canvas drawImage(WebGL canvas 拿不到 2d ctx,水印必须画在副本上)→
 * 免费用户逐帧平铺水印(T6-25,与单图导出同规则复用判定链路)→ 喂编码器。
 * frame 0 走 renderImage(统一参数语义/uResolution),后续帧仅覆写动效
 * uniform + render(转卡引擎同款模式)。每帧间让出主线程(rAF),取消即释放。
 */
import { AsciiCanvasRenderer } from '../AsciiCanvasRenderer'
import type { BrightestPoint } from '../renderImage'
import { renderImage } from '../renderImage'
import { ShaderRenderer } from '../ShaderRenderer'
import type { StyleDefinition } from '../../types'
import { applyCanvasWatermark } from '../license/watermark'
import { alignDriftForGif, sampleMotion, type MotionTimeline } from './kernel'
import { buildPalette, GifStream, planGifFrames } from './gifWriter'
import { encodeMp4, ExportCancelledError, planVideoFrames, VIDEO_PRESET } from './videoWriter'
import { encodeViaMediaRecorder } from './videoRecorder'
import { extForTier, recorderMimeFor, type VideoTier } from './videoTier'

export type AnimExportFormat = 'gif' | 'video'

export interface GifExportSettings {
  /** 正方形边长 256–1024。 */
  size: number
  fps: number
}

/** GIF 导出档修正:时长→实际(帧×延时) + 漂移速度按实际时长吸附(保号/非零)。 */
export function alignTimelineForGif(tl: MotionTimeline, plan: { actualDurationSec: number }): MotionTimeline {
  const params = { ...tl.params }
  for (const key of Object.keys(params)) {
    const spec = params[key]
    if (spec.type === 'drift') {
      params[key] = { type: 'drift', speed: alignDriftForGif(spec.speed, plan.actualDurationSec) }
    }
  }
  return { ...tl, duration: plan.actualDurationSec, params }
}

/** 导出前 GIF 体积启发式 ≈ size²×0.19×帧数(研究票 512×36 实测 1.8MB 对齐)。 */
export function estimateGifBytesPre(size: number, frames: number): number {
  return size * size * 0.19 * frames
}

/** 导出前视频体积 = 码率/8×时长(恒定码率直接算)。 */
export function estimateVideoBytesPre(durationSec: number, bitrate: number = VIDEO_PRESET.bitrate): number {
  return (bitrate / 8) * durationSec
}

/** 主线程让帧:长循环 UI 不冻结;无 rAF 环境(测试)回落 setTimeout。 */
const yieldFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0))

export interface RunAnimationExportOptions {
  image: HTMLImageElement
  styleDef: StyleDefinition
  params: Record<string, number>
  textParams: Record<string, string>
  fontParams: Record<string, FontFace | null>
  brightest: BrightestPoint | null
  zoneMask?: HTMLCanvasElement | null
  /** 名义时长时间轴(GIF 由编排器做导出档对齐,视频原样 2 循环采样)。 */
  timeline: MotionTimeline
  /** 参数名 → uniform(zoom→uZoom…;风格侧 animatedUniforms 映射)。 */
  uniformMap: Record<string, string>
  format: AnimExportFormat
  /** 视频编码档(探测层给出);默认 webcodecs-mp4 保持旧行为。 */
  videoTier?: VideoTier
  gif?: GifExportSettings
  /** 免费用户 'tiled'(逐帧 T6-25),会员 'none'——判定在调用方(decideBatchExport)。 */
  watermark: 'none' | 'tiled'
  seed: string
  onProgress?: (framesDone: number, estimatedBytes: number) => void
  isCancelled?: () => boolean
}

export interface AnimationExportResult {
  blob: Blob
  ext: 'gif' | 'mp4' | 'webm'
  frames: number
}

/** 全局色板采样帧数(均匀覆盖 A↔B 全相位)。 */
const PALETTE_SAMPLES = 8

/** 执行动图导出。取消抛 ExportCancelledError;渲染器即建即毁。 */
export async function runAnimationExport(opts: RunAnimationExportOptions): Promise<AnimationExportResult> {
  // 取消检查点覆盖 setup 阶段(WebGL 上下文/shader 装载可达秒级):入口/建器/预热
  // 三道 + 两 pass 循环逐帧——点取消后最多再走一个子步即抛出(spec ≤100ms 门槛)
  if (opts.isCancelled?.()) throw new ExportCancelledError()
  const isGif = opts.format === 'gif'
  const gifPlan = isGif ? planGifFrames(opts.timeline.duration, opts.gif?.fps ?? 12) : null
  const videoPlan = isGif ? null : planVideoFrames(opts.timeline.duration)
  const w = isGif ? (opts.gif?.size ?? 512) : VIDEO_PRESET.width
  const h = isGif ? (opts.gif?.size ?? 512) : VIDEO_PRESET.height
  const tl = isGif && gifPlan ? alignTimelineForGif(opts.timeline, gifPlan) : opts.timeline

  const glCanvas = document.createElement('canvas')
  glCanvas.width = w
  glCanvas.height = h
  let renderer: ShaderRenderer
  try {
    renderer = new ShaderRenderer(glCanvas)
  } catch {
    throw new Error('webgl-unavailable')
  }
  const stage = document.createElement('canvas')
  stage.width = w
  stage.height = h
  const sctx = stage.getContext('2d', { willReadFrequently: isGif })
  if (!sctx) {
    renderer.destroy()
    throw new Error('canvas2d-unavailable')
  }

  try {
    if (opts.isCancelled?.()) throw new ExportCancelledError()
    renderer.loadImage(opts.image)
    // loadImage 会把画布重设为图片适配尺寸(离屏无容器 → 原图尺寸,上限 2048),
    // 踩掉上面的导出尺寸——必须重设回 w×h,否则整条管线变成「按原图尺寸渲染
    // + staging 只拷左上角」的裁切导出。render()/uResolution 均按画布实时取值,
    // 重设后 shader 原生落在导出分辨率上,aspect 也按导出档修正。
    glCanvas.width = w
    glCanvas.height = h
    // 预热 shader:useShader 链接一次,后续帧仅覆写 uniform + render
    for (const imp of opts.styleDef.shaderImports) await imp()
    if (opts.isCancelled?.()) throw new ExportCancelledError()

    /** 渲染 t 时刻一帧到 staging(含水印)。frame 0 走 renderImage 拿统一语义。 */
    const drawAt = async (t: number, index: number) => {
      if (index === 0) {
        await renderImage({
          image: opts.image,
          styleDef: opts.styleDef,
          params: opts.params,
          textParams: opts.textParams,
          fontParams: opts.fontParams,
          brightest: opts.brightest,
          zoneMask: opts.zoneMask,
          canvas: glCanvas,
          renderer,
          asciiCanvas: document.createElement('canvas'),
          asciiRenderer: new AsciiCanvasRenderer(),
        })
      } else {
        const vals = sampleMotion(tl, t)
        for (const [key, v] of Object.entries(vals)) {
          const uniform = opts.uniformMap[key]
          if (uniform) renderer.setUniform(uniform, v)
        }
        renderer.render()
      }
      sctx.drawImage(glCanvas, 0, 0)
      if (opts.watermark === 'tiled') applyCanvasWatermark(stage, 'tiled', opts.seed)
    }

    if (isGif && gifPlan) {
      // pass1:均匀 8 帧联合采样(含水印后像素)→ 全局色板
      const samples: Uint8ClampedArray[] = []
      for (let i = 0; i < PALETTE_SAMPLES; i++) {
        if (opts.isCancelled?.()) throw new ExportCancelledError()
        await drawAt((i * gifPlan.actualDurationSec) / PALETTE_SAMPLES, i)
        samples.push(sctx.getImageData(0, 0, w, h).data)
        await yieldFrame()
      }
      const palette = buildPalette(samples)
      samples.length = 0
      // pass2:逐帧流式编码;预估体积首帧外推后转真实累计
      const gif = new GifStream({ width: w, height: h, delayMs: gifPlan.delayMs, palette })
      for (let i = 0; i < gifPlan.frameCount; i++) {
        if (opts.isCancelled?.()) throw new ExportCancelledError()
        await drawAt((i * gifPlan.delayMs) / 1000, -1)
        gif.addFrame(sctx.getImageData(0, 0, w, h).data)
        const est = i === 0 ? gif.byteCount * gifPlan.frameCount : gif.byteCount
        opts.onProgress?.(i + 1, est)
        await yieldFrame()
      }
      const bytes = gif.finish()
      return { blob: new Blob([new Uint8Array(bytes)], { type: 'image/gif' }), ext: 'gif', frames: gifPlan.frameCount }
    }

    if (!videoPlan) throw new Error('video-plan-missing')

    // 视频:时长=动效×2;预估体积按码率×时长一次给定
    const videoEstimate = estimateVideoBytesPre(videoPlan.durationSec)
    const tier: VideoTier = opts.videoTier ?? 'webcodecs-mp4'
    const drawFrame = (t: number, i: number) => drawAt(t, i)
    if (tier === 'webcodecs-mp4') {
      const bytes = await encodeMp4({
        canvas: stage,
        width: w,
        height: h,
        fps: videoPlan.fps,
        bitrate: VIDEO_PRESET.bitrate,
        frameCount: videoPlan.frameCount,
        drawFrame,
        onProgress: (done) => opts.onProgress?.(done, videoEstimate),
        isCancelled: opts.isCancelled,
      })
      return { blob: new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), ext: 'mp4', frames: videoPlan.frameCount }
    }
    const mime = recorderMimeFor(tier)
    if (!mime) throw new Error('video-tier-mime-missing')
    const blob = await encodeViaMediaRecorder({
      canvas: stage,
      mimeType: mime,
      fps: videoPlan.fps,
      durationSec: videoPlan.durationSec,
      frameCount: videoPlan.frameCount,
      drawFrame,
      onProgress: (done) => opts.onProgress?.(done, videoEstimate),
      isCancelled: opts.isCancelled,
    })
    return { blob, ext: extForTier(tier)!, frames: videoPlan.frameCount }
  } finally {
    renderer.destroy()
  }
}
