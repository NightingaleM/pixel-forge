import { describe, it, expect } from 'vitest'
import {
  encodeB62, decodeB62,
  paramCount, paramIndex, valueOfIndex,
  encodeSeed, decodeSeed, SEED_VERSION,
  SEED_ALPHABET,
} from './seedCodec'
import { styles, getStyle } from './StyleRegistry'
import type { NumberParamDef, StyleDefinition, StyleId } from '../types'

describe('encodeB62 / decodeB62', () => {
  const CASES: [bigint, string][] = [
    [0n, ''],
    [1n, '1'],
    [61n, 'z'],           // ALPHABET[61]
    [62n, '10'],          // 62 = 1*62 + 0 → '10'
    [12345n, '3D7'],      // 已验算：62²×3 + 62×13 + 7；大写字母在前（A=10..Z=35, a=36..z=61）
    [123456789n, '8M0kX'],
  ]
  it('encodes BigInt → base62 string', () => {
    for (const [n, s] of CASES) expect(encodeB62(n)).toBe(s)
  })
  it('decodes base62 string → BigInt', () => {
    for (const [n, s] of CASES) expect(decodeB62(s)).toBe(n)
  })
  it('round-trips arbitrary values', () => {
    for (const n of [0n, 1n, 62n, 999999n, 123456789012345n]) {
      expect(decodeB62(encodeB62(n))).toBe(n)
    }
  })
  it('treats empty string as 0n', () => {
    expect(decodeB62('')).toBe(0n)
  })
  it('decodes case-sensitively (a=36, A=10)', () => {
    expect(decodeB62('A')).toBe(10n)
    expect(decodeB62('a')).toBe(36n)
  })
})

const p: NumberParamDef = { name: 't', uniform: 'uT', min: 0, max: 10, step: 2, default: 0 }

describe('档位与索引', () => {
  it('paramCount = floor((max-min)/step)+1', () => {
    expect(paramCount(p)).toBe(6)        // (10-0)/2+1 = 6 档: 0,2,4,6,8,10
  })
  it('paramIndex 映射 value→idx，min=0', () => {
    expect(paramIndex(p, 0)).toBe(0)
    expect(paramIndex(p, 10)).toBe(5)
    expect(paramIndex(p, 6)).toBe(3)
  })
  it('paramIndex clamp 越界（编码侧容错）', () => {
    expect(paramIndex(p, -5)).toBe(0)
    expect(paramIndex(p, 99)).toBe(5)
  })
  it('valueOfIndex 映射 idx→value', () => {
    expect(valueOfIndex(p, 0)).toBe(0)
    expect(valueOfIndex(p, 5)).toBe(10)
    expect(valueOfIndex(p, 3)).toBe(6)
  })
})

function numericParams(def: StyleDefinition, pick: (p: NumberParamDef) => number): Record<string, number> {
  const o: Record<string, number> = {}
  for (const p of def.params) {
    if (p.type === undefined || p.type === 'number') o[p.uniform] = pick(p as NumberParamDef)
  }
  return o
}

describe('encodeSeed / decodeSeed', () => {
  it('SEED_VERSION = 0', () => {
    expect(SEED_VERSION).toBe(0)
  })

  it('默认值往返（每个特效）', () => {
    for (const def of styles) {
      const defaults = numericParams(def, (p) => p.default)
      const code = encodeSeed(def.id, defaults, def)
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.styleId).toBe(def.id)
      expect(decoded!.params).toEqual(defaults)
    }
  })

  it('全 max 往返（每个特效，最易触发码长不足）', () => {
    for (const def of styles) {
      const maxed = numericParams(def, (p) => p.max)
      const code = encodeSeed(def.id, maxed, def)
      expect(code.length).toBeLessThanOrEqual(21)  // 实测最长 animelight=20（color 纳入编码后）留余量
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.params).toEqual(maxed)
    }
  })

  it('全 max 码长等于 spec 表（抽样强校验打包正确性）', () => {
    const maxOf = (id: StyleId) => {
      const def = getStyle(id)!
      const colors: Record<string, string> = {}
      for (const p of def.params) if (p.type === 'color') colors[p.uniform] = '#FFFFFF'
      return encodeSeed(id, numericParams(def, (p) => p.max), def, colors).length
    }
    expect(maxOf('ascii')).toBe(10)        // 档积 787185 × 2^24 ≈ 1.32e13 → 8 字符载荷 + 2 前缀（uCharColor 纳入编码）
    expect(maxOf('halftone')).toBe(8)
    expect(maxOf('kaleidoscope')).toBe(11)
    expect(maxOf('animelight')).toBe(20)   // 实际档积 1.0136e24 × 2^24 ≈ 1.70e31 < 62^18 → 18 载荷 + 2 前缀
  })

  it('全 min 往返（参数码为空，仅 2 位前缀）', () => {
    for (const def of styles) {
      const mined = numericParams(def, (p) => p.min)
      const black: Record<string, string> = {}
      for (const p of def.params) if (p.type === 'color') black[p.uniform] = '#000000'
      const code = encodeSeed(def.id, mined, def, black)
      expect(code.length).toBe(2)
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.params).toEqual(mined)
      for (const [u, hex] of Object.entries(black)) {
        expect(decoded!.colorParams[u]).toBe(hex)
      }
    }
  })

  it('前导零等价：补零后解码结果相同', () => {
    const def = getStyle('halftone')!
    const params = numericParams(def, (p) => p.default)
    const code = encodeSeed('halftone', params, def)
    const padded = code.slice(0, 2) + '000' + code.slice(2)
    expect(decodeSeed(padded)?.params).toEqual(params)
  })

  it('color 参数参与编码：往返还原（解码统一小写）', () => {
    const def = getStyle('sketch')!
    const params = numericParams(def, (p) => p.default)
    const code = encodeSeed('sketch', params, def, { uLineColor: '#00FF7F' })
    const decoded = decodeSeed(code)
    expect(decoded).not.toBeNull()
    expect(decoded!.colorParams).toEqual({ uLineColor: '#00ff7f' })
    expect(decoded!.params).toEqual(params)   // numeric 部分不受影响
  })

  it('color 档位两端往返：#000000 与 #FFFFFF', () => {
    const def = getStyle('animelight')!
    const params = numericParams(def, (p) => p.default)
    for (const hex of ['#000000', '#FFFFFF']) {
      const code = encodeSeed('animelight', params, def, { uGodRayColor: hex })
      expect(decodeSeed(code)!.colorParams).toEqual({
        uGodRayColor: hex.toLowerCase(),
      })
    }
  })

  it('不传 textParams 时 color 用 default（旧三参调用兼容）', () => {
    const def = getStyle('lightshadow')!
    const params = numericParams(def, (p) => p.default)
    const decoded = decodeSeed(encodeSeed('lightshadow', params, def))
    // registry 默认色 '#FFFFFF' 大写；解码统一小写归一（与 input type=color 产出一致），故期望 '#ffffff'
    expect(decoded!.colorParams).toEqual({ uGlowColor: '#ffffff' })
  })

  it('无 color 参数的风格：旧格式种子解码不变（向后兼容）', () => {
    const def = getStyle('halftone')!
    const maxed = numericParams(def, (p) => p.max)
    const decoded = decodeSeed(encodeSeed('halftone', maxed, def))
    expect(decoded!.params).toEqual(maxed)
    expect(decoded!.colorParams).toEqual({})
  })
})

describe('decodeSeed 容错', () => {
  it('空串与长度<2 → null', () => {
    expect(decodeSeed('')).toBeNull()
    expect(decodeSeed('0')).toBeNull()
  })
  it('含非 base62 字符 → null', () => {
    expect(decodeSeed('0a!zzz')).toBeNull()
    expect(decodeSeed('0a-xx')).toBeNull()
    expect(decodeSeed('0a 中')).toBeNull()
  })
  it('版本号非 0 → null', () => {
    expect(decodeSeed('1ahalftone')).toBeNull()
  })
  it('特效序号越界 → null', () => {
    const over = SEED_ALPHABET[styles.length]
    expect(decodeSeed('0' + over)).toBeNull()
  })
  it('解包余数非 0（码过长）→ null', () => {
    const def = getStyle('ascii')!
    const code = encodeSeed('ascii', {}, def)
    expect(decodeSeed(code + 'Z')).toBeNull()
  })
  it('registry 改版：旧码在新（收窄 max）registry 下 → null', () => {
    const def = getStyle('halftone')!
    const maxed = numericParams(def, (p) => p.max)
    const code = encodeSeed('halftone', maxed, def)
    const newDef: StyleDefinition = {
      ...def,
      params: def.params.map((p) =>
        p.uniform === 'uCellSize' && (p.type === undefined || p.type === 'number')
          ? { ...p, max: 6 } as NumberParamDef
          : p,
      ),
    }
    expect(decodeSeed(code, [newDef])).toBeNull()
  })
})
