import { describe, expect, it } from 'vitest'
import { parseGIF } from 'gifuct-js'
import { GifStream, buildPalette, planGifFrames, quantizeGifDelay } from './gifWriter'

/** 合成万花筒式渐变帧:主色随 t 漂移(模拟 A↔B 色域变化),RGBA。 */
function synthFrame(size: number, t: number, n: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(size * size * 4)
  const phase = t / n
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4 / (size * size)
    d[i] = Math.floor(((p + phase) % 1) * 255)
    d[i + 1] = Math.floor(((1 - p) * 255 * 0.7 + phase * 60) % 256)
    d[i + 2] = Math.floor((p * p * 255 * (1 - phase) + 40) % 256)
    d[i + 3] = 255
  }
  return d
}

describe('quantizeGifDelay (fps → 10ms 整除帧延时, spec §2)', () => {
  it('8fps → 130ms(125 非厘秒整数倍,半数向上;实际 ≈7.69fps)', () =>
    expect(quantizeGifDelay(8)).toBe(130))
  it('10fps → 100ms(精确)', () => expect(quantizeGifDelay(10)).toBe(100))
  it('12fps → 80ms(实际 12.5fps,研究票实测口径)', () => expect(quantizeGifDelay(12)).toBe(80))
  it('15fps → 70ms(66.67 取整)', () => expect(quantizeGifDelay(15)).toBe(70))
  it('20fps → 50ms(精确)', () => expect(quantizeGifDelay(20)).toBe(50))
  it('24fps → 40ms(实际 25fps)', () => expect(quantizeGifDelay(24)).toBe(40))
})

describe('planGifFrames (帧数/实际时长, spec §2 时长=动效时长)', () => {
  it('3s@12fps → 38 帧,实际时长 3.04s(delay 与帧数乘积)', () => {
    const p = planGifFrames(3, 12)
    expect(p.delayMs).toBe(80)
    expect(p.frameCount).toBe(38)
    expect(p.actualDurationSec).toBeCloseTo(3.04, 12)
  })

  it('1s@8fps → 8 帧(delay 130ms,实际时长 1.04s)', () => {
    const p = planGifFrames(1, 8)
    expect(p.delayMs).toBe(130)
    expect(p.frameCount).toBe(8)
    expect(p.actualDurationSec).toBeCloseTo(1.04, 12)
  })

  it('10s@24fps → 250 帧(24fps 实写 40ms = 25fps,精确整除)', () => {
    const p = planGifFrames(10, 24)
    expect(p.frameCount).toBe(250)
    expect(p.actualDurationSec).toBeCloseTo(10, 12)
  })

  it('实际时长始终 = 帧数×delay(无缝对齐以此为准,非名义时长)', () => {
    for (const [dur, fps] of [[1.5, 12], [3, 15], [7, 24], [2.5, 8]] as const) {
      const p = planGifFrames(dur, fps)
      expect(p.actualDurationSec).toBeCloseTo((p.frameCount * p.delayMs) / 1000, 12)
      expect(p.frameCount).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('buildPalette (均匀采样帧联合量化, rgb565/256, spec §2)', () => {
  it('8 帧合成渐变 → 调色板 ≤256 色', () => {
    const frames = Array.from({ length: 8 }, (_, i) => synthFrame(64, i, 8))
    const pal = buildPalette(frames)
    expect(pal.length).toBeLessThanOrEqual(256)
    expect(pal.length).toBeGreaterThan(8)
  })
})

describe('GifStream (两遍管线流式编码 + gifuct 回读抽验, spec §2/§8)', () => {
  it('6 帧动画回读: 帧数/GCT 存在/全帧无 LCT/NETSCAPE loop=0/delay 厘秒', () => {
    const size = 48
    const n = 6
    const frames = Array.from({ length: n }, (_, i) => synthFrame(size, i, n))
    const pal = buildPalette(frames.slice(0, 3))
    const s = new GifStream({ width: size, height: size, delayMs: 80, palette: pal })
    for (const f of frames) s.addFrame(f)
    const bytes = s.finish()

    const gif = parseGIF(bytes.buffer as ArrayBuffer)
    // gifuct 的 frames 是 图像帧|应用扩展 联合;按运行时字段收窄(与票 02 验证脚本同判法)
    type RawBlock = {
      image?: { descriptor: { localColorTableFlag: boolean } }
      application?: { id?: string; blocks: number[] }
      gce?: { delay: number }
    }
    const blocks = gif.frames as RawBlock[]
    const imgFrames = blocks.filter((f) => f.image)
    expect(imgFrames.length).toBe(n)
    expect(gif.lsd.gct.exists).toBe(true)
    const local = imgFrames.filter((f) => f.image!.descriptor.localColorTableFlag).length
    expect(local).toBe(0)
    let loop: number | undefined
    for (const f of blocks) {
      const a = f.application
      if (a && /NETSCAPE/i.test(a.id || '')) loop = a.blocks[1] | (a.blocks[2] << 8)
    }
    expect(loop).toBe(0)
    for (const f of imgFrames) expect(f.gce!.delay).toBe(8) // 80ms = 8 厘秒
  })

  it('byteCount 随帧累计增长(预估体积实时刷新的数据源)', () => {
    const size = 32
    const pal = buildPalette([synthFrame(size, 0, 1)])
    const s = new GifStream({ width: size, height: size, delayMs: 80, palette: pal })
    const before = s.byteCount
    s.addFrame(synthFrame(size, 0, 4))
    const first = s.byteCount
    expect(first).toBeGreaterThan(before)
    s.addFrame(synthFrame(size, 1, 4))
    expect(s.byteCount).toBeGreaterThan(first)
    expect(s.frameCount).toBe(2)
  })

  it('finish 后字节可直接构造 Blob(Uint8Array)', () => {
    const size = 16
    const pal = buildPalette([synthFrame(size, 0, 1)])
    const s = new GifStream({ width: size, height: size, delayMs: 80, palette: pal })
    s.addFrame(synthFrame(size, 0, 2))
    s.addFrame(synthFrame(size, 1, 2))
    const bytes = s.finish()
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(13)
    // GIF 魔数 GIF89a(GCT+NETSCAPE 由 gifenc 写出)
    expect(Array.from(bytes.slice(0, 3))).toEqual([0x47, 0x49, 0x46])
  })
})
