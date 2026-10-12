// src/lib/holofoilZones.test.ts
// 分区核心纯函数(k-means+连通域+编号)与掩膜数据/拾取——node 环境直测像素路径,
// canvas 壳(analyzeZones/drawZoneMask)由浏览器实测覆盖(票07 verify)。
import { describe, it, expect } from 'vitest'
import { analyzeZonesFromPixels, buildZoneMaskData, pickZone, ZONE_GRID } from './holofoilZones'

const S = ZONE_GRID

/** 合成四象限图(256²):左上灰/右上白/左下黑/右下中灰 + 中央 8×8 亮斑(小区并入) */
function quadrantPixels(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      let v: number
      if (x < S / 2 && y < S / 2) v = 200
      else if (x >= S / 2 && y < S / 2) v = 255
      else if (x < S / 2) v = 0
      else v = 110
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = 255
    }
  }
  // 中央 8×8 白斑(<0.5% 面积,应被小区并入逻辑吸收到邻接最大区)
  for (let y = S / 2 - 4; y < S / 2 + 4; y++) {
    for (let x = S / 2 - 4; x < S / 2 + 4; x++) {
      const i = (y * S + x) * 4
      d[i] = d[i + 1] = d[i + 2] = 255
    }
  }
  return d
}

describe('analyzeZonesFromPixels(k-means lite + 连通域,票01/03 定稿算法)', () => {
  it('四象限合成图:产出恰好 4 个大区,面积合计≈100%', () => {
    const a = analyzeZonesFromPixels(quadrantPixels())
    expect(a.regions.length).toBe(4)
    const total = a.regions.reduce((s, r) => s + r.pct, 0)
    expect(total).toBeGreaterThan(99.9)
    expect(total).toBeLessThanOrEqual(100.01)
    // 面积降序编号:0 号最大,面积单调不增
    for (let i = 1; i < a.regions.length; i++) {
      expect(a.regions[i].area).toBeLessThanOrEqual(a.regions[i - 1].area)
    }
  })

  it('跨设备复现性:同输入两次分析逐字节一致(k-means++ 固定 seed)', () => {
    const a = analyzeZonesFromPixels(quadrantPixels())
    const b = analyzeZonesFromPixels(quadrantPixels())
    expect(Buffer.from(a.regionIds).equals(Buffer.from(b.regionIds))).toBe(true)
    expect(a.regions).toEqual(b.regions)
  })

  it('纯色图:色彩无差异,分区由 xy 空间权重主导 → ≤k 个空间块且全部同色', () => {
    const d = new Uint8ClampedArray(S * S * 4)
    for (let i = 0; i < S * S; i++) {
      d[i * 4] = 128
      d[i * 4 + 1] = 64
      d[i * 4 + 2] = 200
      d[i * 4 + 3] = 255
    }
    const a = analyzeZonesFromPixels(d)
    expect(a.regions.length).toBeGreaterThanOrEqual(1)
    expect(a.regions.length).toBeLessThanOrEqual(4)
    for (const r of a.regions) {
      expect(Math.abs(r.luma - (0.299 * 128 + 0.587 * 64 + 0.114 * 200) / 255)).toBeLessThan(0.01)
    }
    expect(a.regions.reduce((s, r) => s + r.pct, 0)).toBeGreaterThan(99.9)
  })

  it('区块元信息:均值色/质心落在正确象限', () => {
    const a = analyzeZonesFromPixels(quadrantPixels())
    // 找亮度 255(右上)、0(左下)的区
    const bright = a.regions.find((r) => r.luma === 1)!
    const dark = a.regions.find((r) => r.luma === 0)!
    expect(bright.cx).toBeGreaterThan(0.5)
    expect(bright.cy).toBeLessThan(0.5)
    expect(dark.cx).toBeLessThan(0.5)
    expect(dark.cy).toBeGreaterThan(0.5)
  })
})

describe('buildZoneMaskData / pickZone', () => {
  const a = analyzeZonesFromPixels(quadrantPixels())

  it('掩膜:选中区白、未选黑;全选=全白', () => {
    const all = new Set(a.regions.map((r) => r.id))
    const full = buildZoneMaskData(a, all)
    expect(full[0]).toBe(255)
    expect(full[full.length - 4]).toBe(255)
    const none = buildZoneMaskData(a, new Set())
    expect(none[0]).toBe(0)
    // 只选 0 号区:0 号质心处白,其他区质心处黑
    const only0 = buildZoneMaskData(a, new Set([0]))
    const r0 = a.regions[0]
    const at = (cx: number, cy: number) => {
      const gx = Math.min(S - 1, Math.floor(cx * S))
      const gy = Math.min(S - 1, Math.floor(cy * S))
      return only0[(gy * S + gx) * 4]
    }
    expect(at(r0.cx, r0.cy)).toBe(255)
    const other = a.regions.find((r) => r.id !== 0)!
    expect(at(other.cx, other.cy)).toBe(0)
  })

  it('拾取:象限中心点回正确区号;3×3 众数抗羽化带', () => {
    const q = (u: number, v: number) => {
      const gx = Math.min(S - 1, Math.floor(u * S))
      const gy = Math.min(S - 1, Math.floor(v * S))
      return a.regionIds[gy * S + gx]
    }
    expect(pickZone(a, 0.25, 0.25)).toBe(q(0.25, 0.25))
    expect(pickZone(a, 0.75, 0.25)).toBe(q(0.75, 0.25))
    expect(pickZone(a, 0.25, 0.75)).toBe(q(0.25, 0.75))
    // 边界附近(羽化带):取邻域众数,仍落在 4 区之一
    const picked = pickZone(a, 0.5, 0.5)
    expect(picked).toBeGreaterThanOrEqual(0)
    expect(picked).toBeLessThan(a.regions.length)
  })
})
