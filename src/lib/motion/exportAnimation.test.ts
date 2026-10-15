import { describe, expect, it } from 'vitest'
import { alignTimelineForGif, estimateGifBytesPre, estimateVideoBytesPre } from './exportAnimation'
import type { MotionTimeline } from './kernel'
import { planGifFrames } from './gifWriter'

function driftTimeline(): MotionTimeline {
  return {
    duration: 3,
    base: { zoom: 1, centerX: 0, centerY: 0.2 },
    params: {
      zoom: { type: 'pingpong', a: 1, b: 1.6 },
      centerX: { type: 'drift', speed: 0.3 },
      centerY: { type: 'static' },
    },
  }
}

describe('alignTimelineForGif (导出档修正: 时长→实际 + 漂移吸附, spec §3/§5)', () => {
  it('duration 替换为 GIF 实际时长(帧×延时),漂移速度按实际时长吸附', () => {
    const plan = planGifFrames(3, 12) // delay 80ms → 38 帧 → 3.04s
    const tl = alignTimelineForGif(driftTimeline(), plan)
    expect(tl.duration).toBeCloseTo(3.04, 12)
    const spec = tl.params.centerX
    if (spec.type !== 'drift') throw new Error(' centerX 应仍为 drift')
    // 0.3 × 3.04 = 0.912 < 4 → ceil 到 1 周期 → 4/3.04
    expect(spec.speed).toBeCloseTo(4 / 3.04, 12)
  })

  it('吸附后 |speed|×实际时长 = 4 的整数倍(整条时间轴的 GIF 无缝保证)', () => {
    const plan = planGifFrames(3, 12)
    const tl = alignTimelineForGif(driftTimeline(), plan)
    const spec = tl.params.centerX
    if (spec.type !== 'drift') throw new Error('unreachable')
    const cycles = (Math.abs(spec.speed) * plan.actualDurationSec) / 4
    expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9)
  })

  it('pingpong/static 与 base 原样保留(只有漂移受吸附影响)', () => {
    const plan = planGifFrames(3, 12)
    const tl = alignTimelineForGif(driftTimeline(), plan)
    expect(tl.params.zoom).toEqual({ type: 'pingpong', a: 1, b: 1.6 })
    expect(tl.params.centerY).toEqual({ type: 'static' })
    expect(tl.base).toEqual({ zoom: 1, centerX: 0, centerY: 0.2 })
  })
})

describe('导出前预估体积 (spec §5/§7)', () => {
  it('GIF 启发式 ≈ size²×0.19×帧数(512×38 帧 ≈ 1.9MB 量级,研究票实测对齐)', () => {
    const bytes = estimateGifBytesPre(512, 38)
    expect(bytes).toBeCloseTo(512 * 512 * 0.19 * 38, 6)
    expect(bytes).toBeGreaterThan(1.5e6)
    expect(bytes).toBeLessThan(2.5e6)
  })

  it('视频 = 码率/8×时长(8Mbps×6s = 6MB)', () => {
    expect(estimateVideoBytesPre(6)).toBe(6e6)
    expect(estimateVideoBytesPre(2)).toBe(2e6)
  })
})
