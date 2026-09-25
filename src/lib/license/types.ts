// src/lib/license/types.ts
export type LicenseTier = 'day' | 'week' | 'month' | 'year' | 'lifetime'

/** 与 presetStore 的 StorageLike 同构:localStorage 在禁 cookie 环境会抛,统一注入便于测试。 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
