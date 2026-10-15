/**
 * GIF 编码写入器(wayfinder kaleido-motion spec §2,研究票 02 定案 gifenc 两遍管线)。
 *
 * pass1(调用方渲染 8 采样帧)→ buildPalette 联合量化全局色板;
 * pass2 逐帧 addFrame 流式编码——渲一帧喂一帧,不缓存整批帧(内存与帧数解耦)。
 * 首帧带 palette 写 GCT,后续帧不传 palette 复用全局色表(帧间闪烁结构性消除)。
 * repeat: 0 = NETSCAPE 无限循环;帧延时 10ms 整除档。
 */
import { applyPalette, GIFEncoder, quantize } from 'gifenc'

export type GifPalette = number[][]

/** fps → 帧延时毫秒,取整到 10ms 粒度(12fps 实写 80ms = 12.5fps)。 */
export function quantizeGifDelay(fps: number): number {
  return Math.max(10, Math.round(1000 / fps / 10) * 10)
}

export interface GifPlan {
  /** 帧延时(毫秒,10ms 整除)。 */
  delayMs: number
  /** 总帧数(含末帧)。 */
  frameCount: number
  /** 实际 GIF 时长 = 帧数 × delay;漂移吸附与采样相位以此为准,非名义动效时长。 */
  actualDurationSec: number
}

/** 规划 GIF 帧网格:时长向 10ms 粒度对齐,帧数 = round(时长/delay),下限 2。 */
export function planGifFrames(durationSec: number, fps: number): GifPlan {
  const delayMs = quantizeGifDelay(fps)
  const frameCount = Math.max(2, Math.round((durationSec * 1000) / delayMs))
  return { delayMs, frameCount, actualDurationSec: (frameCount * delayMs) / 1000 }
}

/** 均匀采样帧联合量化(拼接后一次 quantize,256 色 rgb565)——覆盖 A↔B 全相位色域。 */
export function buildPalette(sampledFrames: Array<Uint8ClampedArray>): GifPalette {
  const total = sampledFrames.reduce((n, f) => n + f.length, 0)
  const joined = new Uint8ClampedArray(total)
  let off = 0
  for (const f of sampledFrames) {
    joined.set(f, off)
    off += f.length
  }
  return quantize(joined, 256, { format: 'rgb565' })
}

/** 流式 GIF 编码器:构造一次,逐帧 addFrame,finish 取字节。 */
export class GifStream {
  private enc = GIFEncoder()
  private n = 0
  private bytes = 0
  private opts: { width: number; height: number; delayMs: number; palette: GifPalette }

  constructor(opts: { width: number; height: number; delayMs: number; palette: GifPalette }) {
    this.opts = opts
  }

  /** 喂一帧 RGBA(渲一帧喂一帧,不落整批缓存)。 */
  addFrame(rgba: Uint8ClampedArray): void {
    const index = applyPalette(rgba, this.opts.palette, 'rgb565')
    this.enc.writeFrame(index, this.opts.width, this.opts.height, {
      palette: this.n === 0 ? this.opts.palette : undefined,
      delay: this.opts.delayMs,
      repeat: 0,
    })
    this.n++
    this.bytes = this.enc.bytes().length
  }

  finish(): Uint8Array {
    this.enc.finish()
    const b = this.enc.bytes()
    this.bytes = b.length
    return b
  }

  /** 当前累计字节数——导出面板预估体积「随编码实时刷新为真实累计」的数据源。 */
  get byteCount(): number {
    return this.bytes
  }

  get frameCount(): number {
    return this.n
  }
}
