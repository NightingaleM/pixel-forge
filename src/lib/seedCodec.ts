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
