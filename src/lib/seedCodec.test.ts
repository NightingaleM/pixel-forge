import { describe, it, expect } from 'vitest'
import {
  encodeB62, decodeB62,
  paramCount, paramIndex, valueOfIndex,
  encodeSeed, decodeSeed, SEED_VERSION,
  SEED_ALPHABET,
} from './seedCodec'
import { styles, getStyle } from './StyleRegistry'
import type { NumberParamDef, SelectParamDef, StyleDefinition, StyleId, ToggleParamDef } from '../types'

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

type DiscreteDef = SelectParamDef | ToggleParamDef

function isDiscreteDef(p: StyleDefinition['params'][number]): p is DiscreteDef {
  return p.type === 'select' || p.type === 'toggle'
}

/** 离散档（select/toggle）取值器：首档/默认/末档，供往返测试构造期望. */
function discreteParams(def: StyleDefinition, pick: (p: DiscreteDef) => number): Record<string, number> {
  const o: Record<string, number> = {}
  for (const p of def.params) {
    if (isDiscreteDef(p)) o[p.uniform] = pick(p)
  }
  return o
}

const firstOf = (p: DiscreteDef) => (p.type === 'select' ? p.options[0].value : 0)
const lastOf = (p: DiscreteDef) => (p.type === 'select' ? p.options[p.options.length - 1].value : 1)
const defaultOf = (p: DiscreteDef) => p.default

describe('encodeSeed / decodeSeed', () => {
  it('decodes the pre-upgrade pointillism seed unchanged', () => {
    expect(decodeSeed('0548EOMw')).toEqual({
      styleId: 'pointillism',
      params: {
        uDotSize: 10, uDensity: 1.6, uRandomness: 0.65,
        uSizeVariation: 0.45, uDotOpacity: 0.88,
      },
      colorParams: {},
    })
  })

  it('decodes the pre-upgrade lightshadow seed unchanged', () => {
    expect(decodeSeed('03EPxNkRL6Bg2d')).toEqual({
      styleId: 'lightshadow',
      params: {
        uContrast: 1.25, uThreshold: 0.55, uGlowRadius: 18,
        uLightDir: 135, uGlowIntensity: 0.35, uShadowDepth: 0.6,
      },
      colorParams: { uGlowColor: '#62c6ff' },
    })
  })

  it('decodes the pre-upgrade halftone seed unchanged', () => {
    expect(decodeSeed('00njY7e')).toEqual({
      styleId: 'halftone',
      params: { uCellSize: 21, uDotScale: 1.2, uAngle: 45, uHueShift: 30 },
      colorParams: {},
    })
  })

  it('SEED_VERSION = 1（v1：布局纳入 select/toggle）', () => {
    expect(SEED_VERSION).toBe(1)
  })

  it('v1 码前缀为 "1"，v0 前缀仍可解（双版本共存）', () => {
    const def = getStyle('halftone')!
    const v1 = encodeSeed('halftone', numericParams(def, (p) => p.default), def)
    expect(v1[0]).toBe('1')
    expect(decodeSeed(v1)).not.toBeNull()
    expect(decodeSeed('00njY7e')).not.toBeNull()   // v0 旧码
  })

  it('默认值往返（每个特效）', () => {
    for (const def of styles) {
      const defaults = numericParams(def, (p) => p.default)
      const code = encodeSeed(def.id, defaults, def)
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.styleId).toBe(def.id)
      expect(decoded!.params).toEqual({ ...defaults, ...discreteParams(def, defaultOf) })
    }
  })

  it('全 max 往返（每个特效，最易触发码长不足）', () => {
    for (const def of styles) {
      const maxed = { ...numericParams(def, (p) => p.max), ...discreteParams(def, lastOf) }
      const code = encodeSeed(def.id, maxed, def)
      expect(code.length).toBeLessThanOrEqual(21)  // 实测最长 animelight=20（v1 含 toggle 档）留余量
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
      return encodeSeed(id, { ...numericParams(def, (p) => p.max), ...discreteParams(def, lastOf) }, def, colors).length
    }
    expect(maxOf('ascii')).toBe(10)        // 档积 787185 × 2^24 × 6(uCaseMode×uShowBg) ≈ 7.9e13 < 62^8 → 8 载荷 + 2 前缀
    expect(maxOf('halftone')).toBe(8)
    expect(maxOf('kaleidoscope')).toBe(13)   // v1 +uMirrorMode(3)×uPrism(2)×uViewMask(2) 档积×12 → 10→11 载荷
    expect(maxOf('animelight')).toBe(20)   // ×uGodRayAuto(2) 后仍 18 载荷 + 2 前缀
  })

  it('全 min 往返（参数码为空，仅 2 位前缀）', () => {
    for (const def of styles) {
      // select 首档取 options[0].value（registry 全部为 0），toggle 首档 0——离散档不破坏空载荷
      const mined = { ...numericParams(def, (p) => p.min), ...discreteParams(def, firstOf) }
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

  it('select/toggle 参与编码：往返还原（万花筒镜像模式等离散档）', () => {
    const def = getStyle('kaleidoscope')!
    const params = {
      ...numericParams(def, (p) => p.default),
      uMirrorMode: 2,   // select 末档：镜面反射
      uViewMask: 1,     // select 末档：圆形目镜
      uPrism: 1,        // toggle on
    }
    const decoded = decodeSeed(encodeSeed('kaleidoscope', params, def))
    expect(decoded!.params).toEqual(params)
  })

  it('toggle 两档均往返（0 与 1）', () => {
    const def = getStyle('kaleidoscope')!
    for (const v of [0, 1]) {
      const params = { ...numericParams(def, (p) => p.default), uPrism: v }
      expect(decodeSeed(encodeSeed('kaleidoscope', params, def))!.params.uPrism).toBe(v)
    }
  })

  it('select 脏值（不在 options）回 default 档（防渲染期抛错）', () => {
    const def = getStyle('kaleidoscope')!
    const params = { ...numericParams(def, (p) => p.default), uMirrorMode: 99 }
    const decoded = decodeSeed(encodeSeed('kaleidoscope', params, def))
    expect(decoded!.params.uMirrorMode).toBe(0)   // registry default=0（镜筒）
  })

  it('v0 旧码解码：params 不含 select/toggle（调用方兜底补齐）', () => {
    const decoded = decodeSeed('00njY7e')!   // halftone v0 硬编码码
    expect(decoded.params).not.toHaveProperty('uColorMode')
    expect(decoded.params).not.toHaveProperty('uShape')
    expect(decoded.params).toEqual({ uCellSize: 21, uDotScale: 1.2, uAngle: 45, uHueShift: 30 })
  })

  it('前导零等价：补零后解码结果相同', () => {
    const def = getStyle('halftone')!
    const params = { ...numericParams(def, (p) => p.default), ...discreteParams(def, defaultOf) }
    const code = encodeSeed('halftone', params, def)
    const padded = code.slice(0, 2) + '000' + code.slice(2)
    expect(decodeSeed(padded)?.params).toEqual(params)
  })

  it('color 参数参与编码：往返还原（解码统一小写）', () => {
    const def = getStyle('sketch')!
    const params = { ...numericParams(def, (p) => p.default), ...discreteParams(def, defaultOf) }
    // sketch 现有 2 个 color 参数（uLineColor + uBgColor 色板化）——顺带验证多 color 打包
    const code = encodeSeed('sketch', params, def, { uLineColor: '#00FF7F', uBgColor: '#1A3A5C' })
    const decoded = decodeSeed(code)
    expect(decoded).not.toBeNull()
    expect(decoded!.colorParams).toEqual({ uLineColor: '#00ff7f', uBgColor: '#1a3a5c' })
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

  it('无 color 参数的风格：v1 种子解码含离散档（向后兼容语义更新）', () => {
    const def = getStyle('halftone')!
    const maxed = { ...numericParams(def, (p) => p.max), ...discreteParams(def, lastOf) }
    const decoded = decodeSeed(encodeSeed('halftone', maxed, def))
    expect(decoded!.params).toEqual(maxed)
    expect(decoded!.colorParams).toEqual({})
  })

  it('非法 hex 脏值回退 default 档位（防渲染期抛错）', () => {
    const def = getStyle('sketch')!
    const params = numericParams(def, (p) => p.default)
    for (const dirty of ['#12345', 'red', '', '#GGGGGG', 'not-a-color']) {
      const decoded = decodeSeed(encodeSeed('sketch', params, def, { uLineColor: dirty }))
      expect(decoded!.colorParams.uLineColor).toBe('#ff7300')  // registry default 小写归一
    }
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
  it('版本号超出已知版本（0/1 之外）→ null', () => {
    const future = SEED_ALPHABET[SEED_VERSION + 1] + 'ahalftone'
    expect(decodeSeed(future)).toBeNull()
  })
  it('特效序号越界 → null', () => {
    const over = SEED_ALPHABET[styles.length]
    expect(decodeSeed('0' + over)).toBeNull()
    expect(decodeSeed('1' + over)).toBeNull()   // v1 前缀同样守卫
  })
  it('解包余数非 0（载荷越出布局）→ null', () => {
    // v1 档积变大后尾部追加 'Z' 会被离散档整吸收（实测 ascii 吸收后仍合法）；
    // 全 max 码 payload = 档积-1，+1 = 档积 → 逐档剥位余 0、最终 rem=1，确定性越界
    const def = getStyle('ascii')!
    const maxed = { ...numericParams(def, (p) => p.max), ...discreteParams(def, lastOf) }
    const code = encodeSeed('ascii', maxed, def, { uCharColor: '#FFFFFF' })
    const payload = decodeB62(code.slice(2))! + 1n
    expect(decodeSeed(code.slice(0, 2) + encodeB62(payload))).toBeNull()
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
