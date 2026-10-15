import { describe, expect, it } from 'vitest'
import {
  DRIFT_LOOP_PERIOD,
  MotionTimeline,
  alignDriftForGif,
  hasAnimatedParams,
  sampleMotion,
} from './kernel'

/** 三参数混合时间轴: zoom 往返 / centerX 漂移 / centerY 静止, T = 3s。 */
function mixedTimeline(): MotionTimeline {
  return {
    duration: 3,
    base: { zoom: 1, centerX: 0.1, centerY: -0.2 },
    params: {
      zoom: { type: 'pingpong', a: 1, b: 1.6 },
      centerX: { type: 'drift', speed: 0.4 },
      centerY: { type: 'static' },
    },
  }
}

describe('sampleMotion (spec §4 内核数学)', () => {
  it('pingpong t=0 → 严格回到起点 a', () => {
    const v = sampleMotion(mixedTimeline(), 0)
    expect(v.zoom).toBe(1)
  })

  it('pingpong t=T 与 t=0 严格相等(循环闭合,相位回卷实现)', () => {
    const tl = mixedTimeline()
    const v0 = sampleMotion(tl, 0)
    const vT = sampleMotion(tl, tl.duration)
    expect(vT.zoom).toBe(v0.zoom)
  })

  it('pingpong t=T/2 → 到达终点 b', () => {
    const v = sampleMotion(mixedTimeline(), 1.5)
    expect(v.zoom).toBeCloseTo(1.6, 12)
  })

  it('pingpong t=T/4 → 中点 (a+b)/2(余弦缓动)', () => {
    const v = sampleMotion(mixedTimeline(), 0.75)
    expect(v.zoom).toBeCloseTo(1.3, 12)
  })

  it('pingpong 循环点两侧对称(T-δ 与 δ 同值,速度渐起渐停无顿挫)', () => {
    const tl = mixedTimeline()
    const before = sampleMotion(tl, tl.duration - 0.01).zoom
    const after = sampleMotion(tl, 0.01).zoom
    expect(Math.abs(before - after)).toBeLessThan(1e-12)
  })

  it('pingpong a>b(反向往返)同样闭合', () => {
    const tl = mixedTimeline()
    tl.params.zoom = { type: 'pingpong', a: 2, b: 0.5 }
    expect(sampleMotion(tl, 0).zoom).toBe(2)
    expect(sampleMotion(tl, tl.duration).zoom).toBe(2)
    expect(sampleMotion(tl, tl.duration / 2).zoom).toBeCloseTo(0.5, 12)
  })

  it('drift 线性积分: v(t) = v0 + speed·t', () => {
    const tl = mixedTimeline()
    expect(sampleMotion(tl, 0).centerX).toBeCloseTo(0.1, 12)
    expect(sampleMotion(tl, 1).centerX).toBeCloseTo(0.5, 12)
    expect(sampleMotion(tl, 3).centerX).toBeCloseTo(1.3, 12)
  })

  it('drift 积分线性: v(T) - v(0) = speed·T(跨多周期)', () => {
    const tl = mixedTimeline()
    const d = sampleMotion(tl, tl.duration).centerX - sampleMotion(tl, 0).centerX
    expect(d).toBeCloseTo(0.4 * 3, 12)
  })

  it('drift 负速方向不回卷(着色器镜像平铺负责无缝,内核只积分)', () => {
    const tl = mixedTimeline()
    tl.params.centerX = { type: 'drift', speed: -0.6 }
    expect(sampleMotion(tl, 2).centerX).toBeCloseTo(0.1 - 1.2, 12)
  })

  it('static 任意 t 恒为当前滑杆值', () => {
    const tl = mixedTimeline()
    expect(sampleMotion(tl, 0).centerY).toBe(-0.2)
    expect(sampleMotion(tl, 2.7).centerY).toBe(-0.2)
  })

  it('输出键 = params 声明的参数(不多不少)', () => {
    const v = sampleMotion(mixedTimeline(), 0.5)
    expect(Object.keys(v).sort()).toEqual(['centerX', 'centerY', 'zoom'])
  })

  it('t 超过 T 继续演进(预览连续播放,非单圈截断)', () => {
    const tl = mixedTimeline()
    const v = sampleMotion(tl, tl.duration + tl.duration / 2)
    expect(v.zoom).toBeCloseTo(1.6, 12)
  })
})

describe('hasAnimatedParams (预览 rAF 启停边界, spec §4)', () => {
  it('全静止 → false(不启动渲染循环)', () => {
    const tl: MotionTimeline = {
      duration: 3,
      base: { zoom: 1, centerX: 0, centerY: 0 },
      params: {
        zoom: { type: 'static' },
        centerX: { type: 'static' },
        centerY: { type: 'static' },
      },
    }
    expect(hasAnimatedParams(tl)).toBe(false)
  })

  it('任一 pingpong 或 drift → true', () => {
    const tl = mixedTimeline()
    expect(hasAnimatedParams(tl)).toBe(true)
    tl.params.zoom = { type: 'static' }
    expect(hasAnimatedParams(tl)).toBe(true)
  })
})

describe('alignDriftForGif (GIF 速度 ceil 吸附, spec §2/§3)', () => {
  it('周期常量 = 4 uCenter 单位(着色器 tileMirror×0.5)', () => {
    expect(DRIFT_LOOP_PERIOD).toBe(4)
  })

  it('恰好整周期 → 不上跳(0.4/s × 30s = 12 = 3 周期,原速保留)', () => {
    expect(alignDriftForGif(0.4, 30)).toBeCloseTo(0.4, 12)
  })

  it('不满一周期 → ceil 上跳到 1 周期(0.3/s × 3s → 4/3)', () => {
    expect(alignDriftForGif(0.3, 3)).toBeCloseTo(4 / 3, 12)
  })

  it('跨过一周期半 → ceil 到 2 周期(1.5/s × 3s = 4.5 → 8/3)', () => {
    expect(alignDriftForGif(1.5, 3)).toBeCloseTo(8 / 3, 12)
  })

  it('负速度 → 保号吸附(0.3/s × 3s → -4/3)', () => {
    expect(alignDriftForGif(-0.3, 3)).toBeCloseTo(-4 / 3, 12)
  })

  it('速度 0 → 吸附到最小正档(非零保证)', () => {
    expect(alignDriftForGif(0, 3)).toBeCloseTo(4 / 3, 12)
  })

  it('浮点边界: |s|·T 恰在周期边界上方 1 ulp → ε 防护不上跳', () => {
    // 构造:速度与时长之积 = 4.000000000000001(4 上方 1 ulp)——
    // 裸 ceil 会误判超出 1 周期而跳档,ε 防护视为恰好整周期
    const s = 4.000000000000001 / 2
    const T = 2
    expect(s * T).toBeGreaterThan(4)
    expect(alignDriftForGif(s, T)).toBeCloseTo(s, 12)
  })

  it('吸附后 |eff|·T 严格是 4 的整数倍(GIF 无缝保证)', () => {
    for (const [s, T] of [[0.01, 1], [0.3, 3], [1.5, 3], [-0.6, 10], [2.4, 7]] as const) {
      const eff = alignDriftForGif(s, T)
      const cycles = (Math.abs(eff) * T) / DRIFT_LOOP_PERIOD
      expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9)
      expect(Math.abs(eff)).toBeGreaterThan(0)
    }
  })
})
