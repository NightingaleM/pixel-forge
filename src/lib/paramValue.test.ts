import { describe, it, expect } from 'vitest'
import { snapToStep, hexToRgb } from './paramValue'

describe('snapToStep', () => {
  it('clamps 到 [min,max]', () => {
    expect(snapToStep(999, 2, 50, 1, 15)).toBe(50)
    expect(snapToStep(-5, 2, 50, 1, 15)).toBe(2)
  })

  it('按 step 对齐（整数 step）', () => {
    expect(snapToStep(14.4, 2, 50, 1, 15)).toBe(14)
    expect(snapToStep(14.6, 2, 50, 1, 15)).toBe(15)
  })

  it('按 step 对齐（小数 step）且无浮点尾巴', () => {
    const v = snapToStep(0.256, 0, 1, 0.01, 0.5)
    expect(v).toBeCloseTo(0.26, 10)
    expect(String(v)).toBe('0.26')
  })

  it('相对 min 的网格对齐（min=0.5, step=0.1）', () => {
    expect(snapToStep(0.73, 0.5, 2, 0.1, 1)).toBeCloseTo(0.7, 10)
  })

  it('NaN / Infinity 回退 fallback', () => {
    expect(snapToStep(NaN, 2, 50, 1, 15)).toBe(15)
    expect(snapToStep(Infinity, 2, 50, 1, 15)).toBe(15)
  })

  it('step 不整除范围时结果不超过 max', () => {
    // min=2 max=50 step=7：50 → 2 + round(48/7)*7 = 51 → 需再 clamp 到 50
    expect(snapToStep(50, 2, 50, 7, 15)).toBe(50)
  })
})

describe('hexToRgb', () => {
  it('把 #RRGGBB 转为 0..1 浮点三元组', () => {
    expect(hexToRgb('#FF7300')).toEqual([1, 115 / 255, 0])
    expect(hexToRgb('#FF8080')).toEqual([1, 128 / 255, 128 / 255])
    expect(hexToRgb('#FF9166')).toEqual([1, 145 / 255, 102 / 255])
  })

  it('非法输入返回 [0,0,0]', () => {
    expect(hexToRgb('')).toEqual([0, 0, 0])
    expect(hexToRgb('red')).toEqual([0, 0, 0])
    expect(hexToRgb('#12345')).toEqual([0, 0, 0])
    expect(hexToRgb('#GGGGGG')).toEqual([0, 0, 0])
  })

  it('容忍省略 # 前缀', () => {
    expect(hexToRgb('ff7300')).toEqual([1, 115 / 255, 0])
  })
})
