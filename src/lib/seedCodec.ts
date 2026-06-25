const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const SEED_ALPHABET = ALPHABET   // 导出供测试构造越界序号（Task 4）
const CHAR_TO_VAL: Record<string, number> = (() => {
  const m: Record<string, number> = {}
  for (let i = 0; i < ALPHABET.length; i++) m[ALPHABET[i]] = i
  return m
})()

/** BigInt → base62 string. encodeB62(0n) === '' (空串，零值的唯一表示). */
export function encodeB62(n: bigint): string {
  if (n < 0n) throw new Error('encodeB62: negative input')
  if (n === 0n) return ''
  let s = ''
  let x = n
  while (x > 0n) {
    s = ALPHABET[Number(x % 62n)] + s
    x = x / 62n
  }
  return s
}

/** base62 string → BigInt. 空串 → 0n. 严格区分大小写. 含非法字符返回 null. */
export function decodeB62(s: string): bigint | null {
  let n = 0n
  for (const ch of s) {
    const v = CHAR_TO_VAL[ch]
    if (v === undefined) return null
    n = n * 62n + BigInt(v)
  }
  return n
}

import type { NumberParamDef } from '../types'

/** 合法档位数 = floor((max-min)/step) + 1. */
export function paramCount(p: NumberParamDef): number {
  return Math.floor((p.max - p.min) / p.step) + 1
}

/** value → 档位索引，编码侧 clamp 到 [0, count-1]（容错越界值）. */
export function paramIndex(p: NumberParamDef, value: number): number {
  const count = paramCount(p)
  const raw = Math.round((value - p.min) / p.step)
  return Math.max(0, Math.min(count - 1, raw))
}

/** 档位索引 → value（解码侧用，不 clamp，越界由 decodeSeed 判失败）. */
export function valueOfIndex(p: NumberParamDef, idx: number): number {
  return p.min + idx * p.step
}
