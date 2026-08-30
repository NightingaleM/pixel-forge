import type { StyleDefinition, StyleId } from '../types'
import { styles } from './StyleRegistry'

export interface PresetEntry {
  id: string        // 唯一 id
  name: string      // 用户命名
  styleId: StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  createdAt: number // epoch ms
}

export type PresetInput = Omit<PresetEntry, 'id' | 'createdAt'>

const STORAGE_KEY = 'pixel-forge.presets.v1'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// 默认 window.localStorage；测试通过 setPresetStorage 注入内存实现（node 环境无 window）
let storage: StorageLike | null = typeof window !== 'undefined' ? window.localStorage : null

export function setPresetStorage(s: StorageLike | null): void {
  storage = s
}

function isValidEntry(raw: unknown): raw is PresetEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const e = raw as Record<string, unknown>
  return typeof e.id === 'string'
    && typeof e.name === 'string'
    && typeof e.styleId === 'string'
    && styles.some((s) => s.id === e.styleId)
    && typeof e.params === 'object' && e.params !== null
    && typeof e.textParams === 'object' && e.textParams !== null
    && typeof e.createdAt === 'number'
}

/** 读全部预设（坏库 → []；坏条目丢弃；createdAt 降序）。 */
export function loadPresets(): PresetEntry[] {
  if (!storage) return []
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isValidEntry).sort((a, b) => b.createdAt - a.createdAt)
}

/** 追加保存；成功返回完整条目，失败（存储不可用/配额满）返回 null。 */
export function savePreset(input: PresetInput): PresetEntry | null {
  if (!storage) return null
  const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: PresetEntry = { ...input, id, createdAt: Date.now() }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([entry, ...loadPresets()]))
  } catch {
    return null
  }
  return entry
}

/** 删除；成功 true，id 不存在或存储失败 false。 */
export function removePreset(id: string): boolean {
  if (!storage) return false
  const current = loadPresets()
  if (!current.some((e) => e.id === id)) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(current.filter((e) => e.id !== id)))
  } catch {
    return false
  }
  return true
}

/**
 * 以风格默认值为底合并预设：只覆盖风格定义中存在的 uniform，
 * 缺失参数取默认值（容忍风格定义后续增删参数的旧预设）。
 * color 参数的值按现有约定存放在 textParams。
 */
export function mergeWithDefaults(
  def: StyleDefinition,
  params: Record<string, number>,
  textParams: Record<string, string>,
): { params: Record<string, number>; textParams: Record<string, string> } {
  const outP: Record<string, number> = {}
  const outT: Record<string, string> = {}
  for (const p of def.params) {
    if (p.type === 'font') continue
    if (p.type === 'text') {
      outT[p.uniform] = typeof textParams[p.uniform] === 'string' ? textParams[p.uniform] : p.textDefault
    } else if (p.type === 'color') {
      outT[p.uniform] = typeof textParams[p.uniform] === 'string' ? textParams[p.uniform] : p.default
    } else {
      outP[p.uniform] = typeof params[p.uniform] === 'number' ? params[p.uniform] : p.default
    }
  }
  return { params: outP, textParams: outT }
}
