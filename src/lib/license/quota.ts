// src/lib/license/quota.ts
// 每日免费无水印额度:单键自清洁——读时 date 非今日即归零,无垃圾键、无清理逻辑。
// 只存 localStorage:清存储的损害仅为"多得 5 次无水印",接受(spec 决策)。
import type { StorageLike } from './types'

export const FREE_DAILY_NO_WATERMARK = 5
const STORAGE_KEY = 'pixel-forge.freeExports.v1'

let storage: StorageLike | null = null
try {
  storage = typeof window !== 'undefined' ? window.localStorage : null
} catch { storage = null }
export function setQuotaStorage(s: StorageLike | null): void { storage = s }

/** 本地时区自然日键。禁 toISOString:那是 UTC,东八区 0:30 会落到前一天。 */
export function todayKey(now: number = Date.now()): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface QuotaState { date: string; count: number }

function readState(now: number): QuotaState {
  const today = todayKey(now)
  if (!storage) return { date: today, count: FREE_DAILY_NO_WATERMARK }
  let raw: string | null = null
  try { raw = storage.getItem(STORAGE_KEY) } catch { raw = null }
  if (raw) {
    try {
      const p = JSON.parse(raw)
      if (typeof p?.date === 'string' && typeof p?.count === 'number' && Number.isFinite(p.count)) {
        // 跨日/负数脏值统一归零重计
        return p.date === today && p.count >= 0 ? p : { date: today, count: 0 }
      }
    } catch { /* 坏 JSON 当作无记录 */ }
  }
  return { date: today, count: 0 }
}

function writeState(s: QuotaState): void {
  if (!storage) return
  try { storage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* 配额满忽略 */ }
}

export function remainingToday(now: number = Date.now()): number {
  const s = readState(now)
  return Math.max(0, FREE_DAILY_NO_WATERMARK - s.count)
}

export function consumeOne(now: number = Date.now()): boolean {
  if (remainingToday(now) <= 0) return false
  writeState({ date: todayKey(now), count: readState(now).count + 1 })
  return true
}
