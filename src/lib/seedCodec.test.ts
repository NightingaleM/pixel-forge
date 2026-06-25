import { describe, it, expect } from 'vitest'
import { encodeB62, decodeB62 } from './seedCodec'

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

import { paramCount, paramIndex, valueOfIndex } from './seedCodec'
import type { NumberParamDef } from '../types'

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
