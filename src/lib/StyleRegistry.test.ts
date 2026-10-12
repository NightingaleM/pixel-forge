import { describe, it, expect } from 'vitest'
import { styles, defaultParams, defaultTextParams } from './StyleRegistry'
import type { StyleId } from '../types'

describe('defaultParams / defaultTextParams', () => {
  it('returns {} for unknown style', () => {
    expect(defaultParams('nonexistent' as StyleId)).toEqual({})
    expect(defaultTextParams('nonexistent' as StyleId)).toEqual({})
  })

  it('collects number/toggle/select defaults for every style', () => {
    for (const s of styles) {
      const p = defaultParams(s.id)
      for (const def of s.params) {
        if (def.type === 'text' || def.type === 'color' || def.type === 'font') continue
        expect(p[def.uniform]).toBe(def.default)
      }
      // 不含 text/color/font 的 uniform
      for (const def of s.params) {
        if (def.type === 'text' || def.type === 'color' || def.type === 'font') {
          expect(p[def.uniform]).toBeUndefined()
        }
      }
    }
  })

  it('collects text/color defaults for every style', () => {
    for (const s of styles) {
      const tp = defaultTextParams(s.id)
      for (const def of s.params) {
        if (def.type === 'text') expect(tp[def.uniform]).toBe(def.textDefault)
        else if (def.type === 'color') expect(tp[def.uniform]).toBe(def.default)
        else expect(tp[def.uniform]).toBeUndefined()
      }
    }
  })

  it('select 参数满足不变量：options 非空、value 唯一、default ∈ options', () => {
    for (const s of styles) {
      for (const def of s.params) {
        if (def.type !== 'select') continue
        const where = `${s.id}.${def.uniform}`
        expect(def.options.length, where).toBeGreaterThan(0)
        const values = def.options.map(o => o.value)
        expect(new Set(values).size, where).toBe(values.length)
        expect(values, where).toContain(def.default)
      }
    }
  })

  it('color 参数 default 为合法 #RRGGBB hex', () => {
    for (const s of styles) {
      for (const def of s.params) {
        if (def.type !== 'color') continue
        expect(def.default, `${s.id}.${def.uniform}`).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })
})

describe('glassdistort', () => {
  it('追加序不变:末三位 = glassdistort → holofoil → prism(种子码按序号入码,插入中间会废掉旧码)', () => {
    expect(styles.slice(-3).map(s => s.id)).toEqual(['glassdistort', 'holofoil', 'prism'])
  })

  it('默认参数 = 试验台定稿值(玻璃类型大波浪 + 强度 100% + 三组气质默认)', () => {
    expect(defaultParams('glassdistort')).toEqual({
      uGlassType: 0, uStrengthScale: 1,
      uWaveScale: 0.73, uWaveGain: 0.52, uWaveStretch: 1.37,
      uGridCells: 20.5, uGridJitter: 0.52, uGridLens: 0.32, uGridFlip: 0.16, uGridSeam: 1,
      uPeelDensity: 26, uPeelFlow: 0.25, uPeelWarp: 0.12, uPeelEnv: 0.12,
    })
  })

  it('visibleWhen 分组:各玻璃类型只显示本组气质参数,类型/强度恒显', () => {
    const def = styles.find(s => s.id === 'glassdistort')!
    const visibleAt = (type: number) =>
      def.params.filter(p => !p.visibleWhen || p.visibleWhen({ ...defaultParams('glassdistort'), uGlassType: type })).map(p => p.uniform)
    expect(visibleAt(0)).toEqual(['uGlassType', 'uStrengthScale', 'uWaveScale', 'uWaveGain', 'uWaveStretch'])
    expect(visibleAt(1)).toEqual(['uGlassType', 'uStrengthScale', 'uGridCells', 'uGridJitter', 'uGridLens', 'uGridFlip', 'uGridSeam'])
    expect(visibleAt(2)).toEqual(['uGlassType', 'uStrengthScale', 'uPeelDensity', 'uPeelFlow', 'uPeelWarp', 'uPeelEnv'])
  })
})

describe('holofoil / prism (第二批新风格, tickets/04 规格)', () => {
  it('holofoil 默认参数 = 规格票定稿值(碎冰镭射 + 强度 100% + 样张基准 + 票06 选择性加箔)', () => {
    expect(defaultParams('holofoil')).toEqual({
      uTexture: 0, uStrength: 1, uBandDensity: 1, uBandAngle: 22,
      uCrackleDensity: 38, uStreakDensity: 14, uSparkleDensity: 1,
      // 选择性加箔(wayfinder/holofoil-card 票06):uScope=0 全图 = 旧码等价
      uScope: 0, uEdgeThreshold: 0.5, uEdgeWidth: 2, uEdgeSoftBand: 1.5, uEdgeHysteresis: 0.15, uZoneBoost: 0,
    })
  })

  it('holofoil visibleWhen 分组:各质感只显示本组参数,公共参数恒显(底色 color + 应用范围恒在面板)', () => {
    const def = styles.find(s => s.id === 'holofoil')!
    const visibleAt = (over: Record<string, number>) =>
      def.params.filter(p => !p.visibleWhen || p.visibleWhen({ ...defaultParams('holofoil'), ...over })).map(p => p.uniform)
    const common = ['uTexture', 'uStrength', 'uBandDensity', 'uBandAngle', 'uFoilColor']
    expect(visibleAt({ uTexture: 0 })).toEqual([...common, 'uCrackleDensity', 'uScope'])
    expect(visibleAt({ uTexture: 1 })).toEqual([...common, 'uStreakDensity', 'uScope'])
    expect(visibleAt({ uTexture: 2 })).toEqual([...common, 'uSparkleDensity', 'uScope'])
    // 票06 三档显隐:边缘档显 4 滑杆(质感子参照常按质感显隐),分区档显 uZoneBoost
    expect(visibleAt({ uTexture: 0, uScope: 1 })).toEqual([...common, 'uCrackleDensity', 'uScope', 'uEdgeThreshold', 'uEdgeWidth', 'uEdgeSoftBand', 'uEdgeHysteresis'])
    expect(visibleAt({ uTexture: 0, uScope: 2 })).toEqual([...common, 'uCrackleDensity', 'uScope', 'uZoneBoost'])
  })

  it('prism 默认参数 = 规格票定稿值(径向色差 + 色散量 50%)', () => {
    expect(defaultParams('prism')).toEqual({ uMode: 0, uAmount: 0.5, uAngle: 45, uEdgeThreshold: 0.5 })
  })

  it('prism visibleWhen 分组:径向只显模式与色散量,对角显方向角,紫边显边缘阈值', () => {
    const def = styles.find(s => s.id === 'prism')!
    const visibleAt = (m: number) =>
      def.params.filter(p => !p.visibleWhen || p.visibleWhen({ ...defaultParams('prism'), uMode: m })).map(p => p.uniform)
    expect(visibleAt(0)).toEqual(['uMode', 'uAmount'])
    expect(visibleAt(1)).toEqual(['uMode', 'uAmount', 'uAngle'])
    expect(visibleAt(2)).toEqual(['uMode', 'uAmount', 'uEdgeThreshold'])
  })
})
