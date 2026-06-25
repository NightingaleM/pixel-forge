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

/** 档位索引 → value（解码侧用，不 clamp，越界由 decodeSeed 判失败）.
 *  按 step 的小数位数四舍五入，消除 min + idx*step 累积的浮点噪声
 *  （例如 sketch.uSensitivity: 0.01 + 9*0.01 = 0.09999999999999999，需回到 0.1）. */
export function valueOfIndex(p: NumberParamDef, idx: number): number {
  const raw = p.min + idx * p.step
  const stepStr = String(p.step)
  const dot = stepStr.indexOf('.')
  const decimals = dot < 0 ? 0 : stepStr.length - dot - 1
  if (decimals === 0) return raw
  const f = Math.pow(10, decimals)
  return Math.round(raw * f) / f
}

import type { StyleDefinition, StyleId } from '../types'
import { styles } from './StyleRegistry'

export const SEED_VERSION = 0   // 对应字符 '0'（ALPHABET[0]）

function isNumeric(p: StyleDefinition['params'][number]): p is NumberParamDef {
  return p.type === undefined || p.type === 'number'
}

function numericListOf(def: StyleDefinition): NumberParamDef[] {
  return def.params.filter(isNumeric)
}

/** 编码：{ styleId, params } → 种子码字符串. */
export function encodeSeed(styleId: StyleId, params: Record<string, number>, def: StyleDefinition): string {
  const numerics = numericListOf(def)
  let big = 0n
  for (const p of numerics) {
    const count = BigInt(paramCount(p))
    const idx = BigInt(paramIndex(p, params[p.uniform] ?? p.default))
    big = big * count + idx
  }
  const version = ALPHABET[SEED_VERSION]
  const styleIdx = styles.findIndex((s) => s.id === styleId)
  if (styleIdx < 0) throw new Error(`encodeSeed: unknown styleId ${styleId}`)
  return version + ALPHABET[styleIdx] + encodeB62(big)
}

/** 解码：种子码 → { styleId, params }；任何非法情况返回 null. */
export function decodeSeed(
  code: string,
  registry: StyleDefinition[] = styles,
): { styleId: StyleId; params: Record<string, number> } | null {
  if (code.length < 2) return null
  const versionVal = CHAR_TO_VAL[code[0]]
  if (versionVal !== SEED_VERSION) return null
  const styleVal = CHAR_TO_VAL[code[1]]
  if (styleVal === undefined || styleVal >= registry.length) return null
  const def = registry[styleVal]
  if (!def) return null

  const big = decodeB62(code.slice(2))
  if (big === null) return null

  const numerics = numericListOf(def)
  const out: Record<string, number> = {}
  let rem = big
  for (let i = numerics.length - 1; i >= 0; i--) {
    const p = numerics[i]
    const count = BigInt(paramCount(p))
    const idx = Number(rem % count)
    rem = rem / count
    if (idx < 0 || idx >= paramCount(p)) return null
    out[p.uniform] = valueOfIndex(p, idx)
  }
  if (rem !== 0n) return null
  return { styleId: def.id, params: out }
}
