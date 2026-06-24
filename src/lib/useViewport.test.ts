import { describe, it, expect } from 'vitest'
import { clampZoom, zoomAtCursor, clampPan } from './useViewport'

describe('clampZoom', () => {
  it('returns value inside range unchanged', () => {
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(1)).toBe(1)
  })
  it('clamps above max (16)', () => {
    expect(clampZoom(100)).toBe(16)
  })
  it('clamps below min (0.2)', () => {
    expect(clampZoom(0.01)).toBe(0.2)
  })
  it('respects custom min/max', () => {
    expect(clampZoom(50, 1, 4)).toBe(4)
    expect(clampZoom(-5, 1, 4)).toBe(1)
  })
})

describe('zoomAtCursor', () => {
  it('keeps the anchor point fixed under the cursor when zooming in', () => {
    // 起点 zoom=1, pan=0；锚点 (50,50) 缩放到 2 倍
    const next = zoomAtCursor({ zoom: 1, panX: 0, panY: 0 }, { x: 50, y: 50 }, 2)
    expect(next.zoom).toBe(2)
    expect(next.panX).toBe(-50)
    expect(next.panY).toBe(-50)
  })
  it('invariant: anchor world point maps back to the same wrapper coords', () => {
    const cur = { zoom: 2, panX: -100, panY: 0 }
    const anchor = { x: 0, y: 0 }
    const next = zoomAtCursor(cur, anchor, 1)
    // 缩放后锚点的 wrapper 坐标应仍等于 anchor
    const worldX = (anchor.x - cur.panX) / cur.zoom
    const worldY = (anchor.y - cur.panY) / cur.zoom
    expect(next.panX + worldX * next.zoom).toBeCloseTo(anchor.x, 7)
    expect(next.panY + worldY * next.zoom).toBeCloseTo(anchor.y, 7)
  })
  it('clamps newZoom to [min, max]', () => {
    const next = zoomAtCursor({ zoom: 1, panX: 0, panY: 0 }, { x: 0, y: 0 }, 999)
    expect(next.zoom).toBe(16)
  })
})

describe('clampPan', () => {
  it('clamps pan to 0 when content is larger and pan goes positive', () => {
    // zoom=2, content 100x100 → scaled 200 > view 100；panX=50 越上界 → 0
    const r = clampPan({ zoom: 2, panX: 50, panY: 0 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(0)
    expect(r.panY).toBe(0)
  })
  it('keeps a valid in-range pan unchanged', () => {
    // panX=-50 在 [100-200, 0]=[-100,0] 内
    const r = clampPan({ zoom: 2, panX: -50, panY: -50 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(-50)
    expect(r.panY).toBe(-50)
  })
  it('clamps pan to lower bound (view - scaled)', () => {
    // panX=-999 → 收敛到 100-200 = -100
    const r = clampPan({ zoom: 2, panX: -999, panY: -999 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(-100)
    expect(r.panY).toBe(-100)
  })
  it('centers content when smaller than viewport (zoom<1)', () => {
    // zoom=0.5, content 100 → scaled 50 < view 100 → 居中 (100-50)/2=25
    const r = clampPan({ zoom: 0.5, panX: 0, panY: 0 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(25)
    expect(r.panY).toBe(25)
  })
})
