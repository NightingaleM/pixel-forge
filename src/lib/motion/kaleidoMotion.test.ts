import { describe, expect, it } from 'vitest'
import {
  MOTION_UNIFORMS,
  buildMotionTimeline,
  initialMotionUiState,
  isMotionActive,
} from './kaleidoMotion'

describe('buildMotionTimeline (UI 态 → 内核时间轴, lab v2 语义)', () => {
  it('pingpong 的 a = 左侧滑杆当前值(live A),b = 独立滑杆值', () => {
    const m = initialMotionUiState()
    const tl = buildMotionTimeline(m, { uZoom: 1.42, uCenterX: -0.3, uCenterY: 0.1 })
    expect(tl.params.zoom).toEqual({ type: 'pingpong', a: 1.42, b: m.params.zoom.b })
    expect(tl.base.zoom).toBe(1.42)
  })

  it('drift 的 v₀ = 滑杆当前值,speed 保留', () => {
    const m = initialMotionUiState()
    m.params.centerX = { type: 'drift', b: 0, speed: -0.45 }
    const tl = buildMotionTimeline(m, { uZoom: 1, uCenterX: 0.25, uCenterY: 0 })
    expect(tl.params.centerX).toEqual({ type: 'drift', speed: -0.45 })
    expect(tl.base.centerX).toBe(0.25)
  })

  it('static 直通;duration 传递', () => {
    const m = initialMotionUiState()
    m.duration = 7.5
    const tl = buildMotionTimeline(m, { uZoom: 1, uCenterX: 0, uCenterY: -0.6 })
    expect(tl.params.centerY).toEqual({ type: 'static' })
    expect(tl.duration).toBe(7.5)
  })

  it('uniform 映射表 = zoom/centerX/centerY → uZoom/uCenterX/uCenterY', () => {
    expect(MOTION_UNIFORMS).toEqual({ zoom: 'uZoom', centerX: 'uCenterX', centerY: 'uCenterY' })
  })
})

describe('isMotionActive (预览 rAF 启停条件, spec §4)', () => {
  it('总开关关 → false(即便参数有声明)', () => {
    const m = initialMotionUiState() // 默认 zoom 往返
    m.on = false
    expect(isMotionActive(m)).toBe(false)
  })

  it('开 + 全静止 → false(回按需渲染)', () => {
    const m = initialMotionUiState()
    m.on = true
    m.params.zoom.type = 'static'
    m.params.centerX.type = 'static'
    m.params.centerY.type = 'static'
    expect(isMotionActive(m)).toBe(false)
  })

  it('开 + 任一非静止 → true', () => {
    const m = initialMotionUiState()
    m.on = true
    expect(isMotionActive(m)).toBe(true)
  })
})
