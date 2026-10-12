// src/lib/cardTilt.test.ts
// 转卡手感引擎纯数学(票04 demo 定稿值):阻尼收敛/自摆接管/幅度换算/重渲阈值/
// 钳位。DOM 与 rAF 循环由浏览器实测覆盖(票07 verify)。
import { describe, it, expect } from 'vitest'
import {
  stepTilt, CardTiltEngine, DEFAULT_CARD_TILT_FEEL, CARD_TILT_CLAMP,
  CARD_TILT_IDLE_DELAY, type CardTiltFeel,
} from './cardTilt'

const mkState = () => ({ tx: 0, ty: 0, cx: 0, cy: 0, lastPointer: 0 })

describe('stepTilt(阻尼/自摆/幅度)', () => {
  it('阻尼平滑:目标 1,0 → cx 每步靠近 10%,rx/ry 随 amp 换算', () => {
    const s = mkState()
    s.tx = 1
    const feel = { ...DEFAULT_CARD_TILT_FEEL, idle: false }
    const last: [number, number] = [99, 99]
    let f = stepTilt(s, feel, 1000, last)
    expect(f.cx).toBeCloseTo(0.1, 5)
    for (let i = 0; i < 200; i++) f = stepTilt(s, feel, 1000, last)
    expect(f.cx).toBeGreaterThan(0.99)
    expect(f.ry).toBeCloseTo(feel.amp, 2)   // cx→1,ry=amp(默认 12)
    expect(f.rx).toBeCloseTo(0, 5)
  })

  it('闲置自摆:超过 2.5s 无操作接管目标(tx/ty 被覆写为 Lissajous)', () => {
    const s = mkState()
    s.tx = 0.8   // 残留目标
    const t = 10000 + CARD_TILT_IDLE_DELAY + 1
    const f = stepTilt(s, DEFAULT_CARD_TILT_FEEL, t, [0, 0])
    expect(f.idleActive).toBe(true)
    // t=12501: sin(t/1500)≈sin(8.334)≈0.89 → tx 已不是 0.8
    expect(s.tx).not.toBe(0.8)
  })

  it('idle 关闭:永不自摆', () => {
    const s = mkState()
    s.tx = 0.5
    const feel: CardTiltFeel = { ...DEFAULT_CARD_TILT_FEEL, idle: false }
    const f = stepTilt(s, feel, 100000, [0, 0])
    expect(f.idleActive).toBe(false)
    expect(s.tx).toBe(0.5)
  })

  it('flow 关闭:fx/fy 恒 0(只转卡不变色),redraw 仅首帧', () => {
    const s = mkState()
    s.tx = 0.6
    const feel: CardTiltFeel = { ...DEFAULT_CARD_TILT_FEEL, flow: false }
    const last: [number, number] = [99, 99]
    let f = stepTilt(s, feel, 1000, last)
    expect(f.fx).toBe(0)
    expect(f.fy).toBe(0)
    expect(f.redraw).toBe(true)   // lastTilt=[99,99] → 首帧强制
    f = stepTilt(s, feel, 1016, last)
    expect(f.redraw).toBe(false)  // fx 恒 0 无变化
  })

  it('redraw 阈值:流动倾角变化超 0.0015 才置位', () => {
    const s = mkState()
    s.tx = 0.3
    const feel = { ...DEFAULT_CARD_TILT_FEEL, idle: false }
    const last: [number, number] = [0, 0]
    const f = stepTilt(s, feel, 1000, last)
    expect(f.cx).toBeCloseTo(0.03, 5)
    expect(f.redraw).toBe(true)   // |0.03-0| > 0.0015
    // 静止态(cx 已收敛)不再触发
    s.cx = s.tx = 0.3
    last[0] = 0.3
    last[1] = 0
    const f2 = stepTilt(s, feel, 2000, last)
    expect(f2.redraw).toBe(false)
  })
})

describe('CardTiltEngine(钳位/回正/手感)', () => {
  it('pointerTo 钳位到 ±1.35;release 回正', () => {
    const e = new CardTiltEngine()
    e.pointerTo(5, -5)
    // 经 step 观察目标(clamp 后 tx=1.35,首步 cx=0.135)
    const feel = { ...DEFAULT_CARD_TILT_FEEL, idle: false }
    const f = stepTilt((e as unknown as { state: ReturnType<typeof mkState> }).state, feel, 1000, [99, 99])
    expect(f.cx).toBeCloseTo(0.135, 4)
    expect(f.cy).toBeCloseTo(-0.135, 4)
    expect(CARD_TILT_CLAMP).toBe(1.35)
    e.release()
    expect((e as unknown as { state: ReturnType<typeof mkState> }).state.tx).toBe(0)
  })

  it('setFeel 合并补丁', () => {
    const e = new CardTiltEngine()
    e.setFeel({ amp: 20, flow: false })
    expect(e.feel.amp).toBe(20)
    expect(e.feel.flow).toBe(false)
    expect(e.feel.idle).toBe(true)
    expect(e.feel.light).toBe(true)
  })
})
