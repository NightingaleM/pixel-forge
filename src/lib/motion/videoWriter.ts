/**
 * 视频导出写入器(wayfinder kaleido-motion spec §1,研究票 01 定案
 * WebCodecs H.264 + mediabunny 封 MP4)。
 *
 * 仅预设 720p/30fps/2 循环;时长 = 动效时长×2 自动推导;码率 8Mbps;
 * canEncodeVideo 会话级记忆化,不过 → 面板视频档禁用(不产 WebM);
 * 中途硬编失败以 prefer-software 同配置重跑一次;取消走 output.cancel()。
 * 编排循环 await source.add 背压——渲一帧喂一帧,禁全帧缓存。
 */
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny'

export const VIDEO_PRESET = {
  width: 1280,
  height: 720,
  fps: 30,
  loops: 2,
  bitrate: 8e6,
} as const

export interface VideoPlan {
  fps: number
  frameCount: number
  durationSec: number
}

/** 视频帧网格:帧数 = round(动效时长 × 循环数 × fps),时间戳 i/fps 精确反推。 */
export function planVideoFrames(
  motionDurationSec: number,
  fps: number = VIDEO_PRESET.fps,
  loops: number = VIDEO_PRESET.loops,
): VideoPlan {
  const frameCount = Math.max(2, Math.round(motionDurationSec * loops * fps))
  return { fps, frameCount, durationSec: frameCount / fps }
}

export type VideoSupportProbe = typeof canEncodeVideo

/** 会话级记忆缓存:同参数只问一次底层(键 = 宽×高@帧率:码率)。 */
let supportCache = new Map<string, boolean>()

export function resetVideoSupportCache(): void {
  supportCache = new Map()
}

/** 特性检测:能否以预设参数硬编 avc。probe 可注入(测试),默认真 canEncodeVideo。 */
export async function probeVideoSupport(
  opts: { width: number; height: number; frameRate: number; bitrate: number },
  probe: VideoSupportProbe = canEncodeVideo,
): Promise<boolean> {
  const key = `${opts.width}x${opts.height}@${opts.frameRate}:${opts.bitrate}`
  const hit = supportCache.get(key)
  if (hit !== undefined) return hit
  const ok = await probe('avc', {
    width: opts.width,
    height: opts.height,
    bitrate: opts.bitrate,
    frameRate: opts.frameRate,
  })
  supportCache.set(key, ok)
  return ok
}

/** 用户取消导出。 */
export class ExportCancelledError extends Error {
  constructor() {
    super('export-cancelled')
    this.name = 'ExportCancelledError'
  }
}

export interface Mp4EncodeOptions {
  /** 逐帧内容画布(渲好一帧后 add 捕获编码;尺寸须恒定)。 */
  canvas: HTMLCanvasElement
  width: number
  height: number
  fps: number
  bitrate: number
  frameCount: number
  /** 渲染第 index 帧到 canvas(t = index/fps,含水印)。 */
  drawFrame: (t: number, index: number) => Promise<void> | void
  onProgress?: (framesDone: number) => void
  isCancelled?: () => boolean
}

/** 单次编码(可指定硬件偏好;失败/取消时 cancel 释放)。 */
async function runMp4Once(
  opts: Mp4EncodeOptions,
  hardwareAcceleration: 'no-preference' | 'prefer-software',
): Promise<Uint8Array> {
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  })
  const source = new CanvasSource(opts.canvas, {
    codec: 'avc',
    bitrate: opts.bitrate,
    keyFrameInterval: 2,
    hardwareAcceleration,
  })
  output.addVideoTrack(source)
  await output.start()
  const dur = 1 / opts.fps
  try {
    for (let i = 0; i < opts.frameCount; i++) {
      if (opts.isCancelled?.()) throw new ExportCancelledError()
      await opts.drawFrame(i / opts.fps, i)
      await source.add(i / opts.fps, dur)
      opts.onProgress?.(i + 1)
    }
    await source.close()
    await output.finalize()
    const buf = (output.target as BufferTarget).buffer
    if (!buf) throw new Error('mp4-empty-buffer')
    return new Uint8Array(buf)
  } catch (err) {
    await output.cancel().catch(() => {})
    throw err
  }
}

/**
 * MP4 编排:默认不指定硬件偏好(交浏览器);中途硬编失败以 prefer-software
 * 同配置重建重跑一次,再失败抛出(调用方提示改用 GIF)。取消抛 ExportCancelledError。
 */
export async function encodeMp4(opts: Mp4EncodeOptions): Promise<Uint8Array> {
  try {
    return await runMp4Once(opts, 'no-preference')
  } catch (err) {
    if (err instanceof ExportCancelledError) throw err
    return await runMp4Once(opts, 'prefer-software')
  }
}
