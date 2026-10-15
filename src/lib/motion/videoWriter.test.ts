import { describe, expect, it } from 'vitest'
import { planVideoFrames, probeVideoSupport, resetVideoSupportCache, VIDEO_PRESET } from './videoWriter'

/** 可计数的假底层探测:node 无 WebCodecs,注入替身。 */
function countingProbe(results: boolean[]) {
  let calls = 0
  return {
    fn: async () => {
      const r = results[Math.min(calls, results.length - 1)]
      calls++
      return r
    },
    get calls() {
      return calls
    },
  }
}

describe('planVideoFrames (720p/30fps/2 循环, 时长=动效×2, spec §1)', () => {
  it('预设常量 = 1280×720@30fps/2 循环/8Mbps', () => {
    expect(VIDEO_PRESET.width).toBe(1280)
    expect(VIDEO_PRESET.height).toBe(720)
    expect(VIDEO_PRESET.fps).toBe(30)
    expect(VIDEO_PRESET.loops).toBe(2)
    expect(VIDEO_PRESET.bitrate).toBe(8e6)
  })

  it('3s 动效 → 180 帧,视频时长 6.0s', () => {
    const p = planVideoFrames(3)
    expect(p.frameCount).toBe(180)
    expect(p.durationSec).toBeCloseTo(6, 12)
  })

  it('1s 动效 → 60 帧(2.0s);10s → 600 帧(20s)', () => {
    expect(planVideoFrames(1).frameCount).toBe(60)
    expect(planVideoFrames(10).frameCount).toBe(600)
    expect(planVideoFrames(10).durationSec).toBeCloseTo(20, 12)
  })

  it('时长 = 动效×2 自动推导(非整数动效时长也闭合)', () => {
    const p = planVideoFrames(2.5)
    expect(p.frameCount).toBe(150)
    expect(p.durationSec).toBeCloseTo(5, 12)
  })
})

describe('probeVideoSupport (canEncodeVideo 会话级记忆化, spec §1)', () => {
  it('同参数只问底层一次(缓存命中)', async () => {
    resetVideoSupportCache()
    const probe = countingProbe([true])
    const opts = { width: 1280, height: 720, frameRate: 30, bitrate: 8e6 }
    await expect(probeVideoSupport(opts, probe.fn)).resolves.toBe(true)
    await expect(probeVideoSupport(opts, probe.fn)).resolves.toBe(true)
    await expect(probeVideoSupport(opts, probe.fn)).resolves.toBe(true)
    expect(probe.calls).toBe(1)
  })

  it('不同参数独立缓存(尺寸/帧率/码率任一不同即重问)', async () => {
    resetVideoSupportCache()
    const probe = countingProbe([true, false])
    await probeVideoSupport({ width: 1280, height: 720, frameRate: 30, bitrate: 8e6 }, probe.fn)
    await probeVideoSupport({ width: 1280, height: 720, frameRate: 60, bitrate: 8e6 }, probe.fn)
    expect(probe.calls).toBe(2)
    await expect(
      probeVideoSupport({ width: 1280, height: 720, frameRate: 60, bitrate: 8e6 }, probe.fn),
    ).resolves.toBe(false)
    expect(probe.calls).toBe(2)
  })

  it('resetVideoSupportCache 后重新询问', async () => {
    resetVideoSupportCache()
    const probe = countingProbe([true])
    const opts = { width: 1280, height: 720, frameRate: 30, bitrate: 8e6 }
    await probeVideoSupport(opts, probe.fn)
    resetVideoSupportCache()
    await probeVideoSupport(opts, probe.fn)
    expect(probe.calls).toBe(2)
  })
})
