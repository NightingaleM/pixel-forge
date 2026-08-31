import { describe, it, expect } from 'vitest'
import { clampPanelPos } from './useDraggable'

const VIEWPORT = { w: 800, h: 600 }
const PANEL = { w: 260, h: 400 }

describe('clampPanelPos', () => {
  it('returns position inside viewport unchanged', () => {
    expect(clampPanelPos({ x: 100, y: 50 }, VIEWPORT, PANEL)).toEqual({ x: 100, y: 50 })
  })

  it('clamps left edge to 0 (left limit)', () => {
    expect(clampPanelPos({ x: -80, y: 50 }, VIEWPORT, PANEL).x).toBe(0)
  })

  it('clamps so the whole panel stays inside the right edge', () => {
    // 旧实现上限是 innerWidth - 100，面板 260 宽会有 160px 出界
    const res = clampPanelPos({ x: 700, y: 50 }, VIEWPORT, PANEL)
    expect(res.x).toBe(VIEWPORT.w - PANEL.w) // 540
  })

  it('clamps top edge to 0 (top limit)', () => {
    expect(clampPanelPos({ x: 100, y: -30 }, VIEWPORT, PANEL).y).toBe(0)
  })

  it('clamps so the whole panel stays inside the bottom edge', () => {
    // 旧实现上限是 innerHeight - 40，面板 400 高会有 360px 出界
    const res = clampPanelPos({ x: 100, y: 500 }, VIEWPORT, PANEL)
    expect(res.y).toBe(VIEWPORT.h - PANEL.h) // 200
  })

  it('panels wider/taller than viewport pin to top-left instead of flipping', () => {
    const tiny = { w: 200, h: 150 }
    expect(clampPanelPos({ x: 500, y: 500 }, tiny, PANEL)).toEqual({ x: 0, y: 0 })
  })
})
