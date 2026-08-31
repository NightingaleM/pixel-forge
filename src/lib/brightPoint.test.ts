import { describe, it, expect } from 'vitest'
import { findBrightestPoint } from './brightPoint'

const THUMB = 4 // 4x4 缩略图,构造数据小而直观

// 构造全黑 4x4 RGBA,再把 (px,py) 像素设为白色
function imageDataWithBrightAt(px: number, py: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(THUMB * THUMB * 4)
  const i = (py * THUMB + px) * 4
  data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255
  return data
}

describe('findBrightestPoint', () => {
  it('最亮在右上角(canvas 坐标)→ UV 右上角', () => {
    // canvas (3,0):x 最大、y 最小(顶部)
    const p = findBrightestPoint(imageDataWithBrightAt(3, 0), THUMB, THUMB)
    expect(p.x).toBeCloseTo((3 + 0.5) / THUMB)
    expect(p.y).toBeCloseTo(1 - (0 + 0.5) / THUMB) // y 翻转:canvas 顶 → UV 顶
  })

  it('y 翻转:canvas 下半亮 → UV y < 0.5', () => {
    const p = findBrightestPoint(imageDataWithBrightAt(1, 3), THUMB, THUMB) // canvas 底部
    expect(p.y).toBeLessThan(0.5)
  })

  it('按 luma 加权:绿通道亮度高于蓝通道', () => {
    const data = new Uint8ClampedArray(THUMB * THUMB * 4)
    const blue = 0 * 4; data[blue + 2] = 255                      // (0,0) 纯蓝
    const green = 1 * 4; data[green + 1] = 255                    // (1,0) 纯绿
    const p = findBrightestPoint(data, THUMB, THUMB)
    expect(p.x).toBeCloseTo((1 + 0.5) / THUMB) // luma(绿)=0.587 > luma(蓝)=0.114
  })

  it('平局取行序第一个(全黑 → 首像素)', () => {
    const data = new Uint8ClampedArray(THUMB * THUMB * 4) // 全黑,luma 全 0
    const p = findBrightestPoint(data, THUMB, THUMB)
    expect(p.x).toBeCloseTo(0.5 / THUMB)
    expect(p.y).toBeCloseTo(1 - 0.5 / THUMB)
  })
})
