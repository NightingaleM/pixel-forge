// src/lib/motion/videoRecorder.ts
/**
 * MediaRecorder 实时录制写入器(spec 2026-10-16-video-export-fallback §2):
 * WebCodecs 不可用环境的兜底。staging 画布(含水印)captureStream(fps),
 * 墙钟驱动 drawFrame(t),到时补末帧定格再 stop。取消抛 ExportCancelledError。
 * 页面切走 rAF 停转 → 画面冻结段(面板提示文案缓解),不做机械补偿。
 */
import { ExportCancelledError, VIDEO_PRESET } from './videoWriter'

/** 默认下一帧等待:rAF(无 rAF 环境回落 setTimeout,同 exportAnimation.yieldFrame 惯例)。 */
const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0))

export interface MediaRecorderEncodeOptions {
  /** 逐帧内容画布(导出编排的 staging,尺寸恒定,已含水印)。 */
  canvas: HTMLCanvasElement
  /** 'video/mp4;codecs=avc1' | 'video/webm;codecs=vp9|vp8'(recorderMimeFor 给出)。 */
  mimeType: string
  fps: number
  durationSec: number
  frameCount: number
  /** 渲染 t 时刻一帧(index 0 走 renderImage 全参数语义,由编排层保证)。 */
  drawFrame: (t: number, index: number) => Promise<void> | void
  onProgress?: (framesDone: number) => void
  isCancelled?: () => boolean
  /** 测试注入:可控墙钟与帧等待。 */
  now?: () => number
  waitNextFrame?: () => Promise<void>
}

export async function encodeViaMediaRecorder(opts: MediaRecorderEncodeOptions): Promise<Blob> {
  const now = opts.now ?? (() => performance.now())
  const wait = opts.waitNextFrame ?? nextFrame
  const stream = opts.canvas.captureStream(opts.fps)
  const recorder = new MediaRecorder(stream, {
    mimeType: opts.mimeType,
    videoBitsPerSecond: VIDEO_PRESET.bitrate,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start(250)
  const start = now()
  try {
    for (;;) {
      if (opts.isCancelled?.()) throw new ExportCancelledError()
      const t = (now() - start) / 1000
      if (t >= opts.durationSec) break
      const index = Math.min(opts.frameCount - 1, Math.floor(t * opts.fps))
      await opts.drawFrame(t, index)
      opts.onProgress?.(Math.min(opts.frameCount, Math.floor(t * opts.fps) + 1))
      await wait()
    }
    // 末帧定格:画 (durationSec - 1/fps, frameCount-1) 再停,避免结尾拖黑帧
    await opts.drawFrame(opts.durationSec - 1 / opts.fps, opts.frameCount - 1)
    opts.onProgress?.(opts.frameCount)
    recorder.stop()
    await stopped
    return new Blob(chunks, { type: opts.mimeType.split(';')[0] })
  } catch (err) {
    if (recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* 已停 */ }
    }
    await stopped
    throw err
  }
}
