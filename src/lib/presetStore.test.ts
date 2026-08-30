import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadPresets, savePreset, removePreset, mergeWithDefaults, setPresetStorage,
} from './presetStore'
import { getStyle } from './StyleRegistry'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
}

class ThrowingStorage extends MemoryStorage {
  getItem(): string { throw new Error('unavailable') }
  setItem(): void { throw new Error('quota') }
}

const HALFTONE = { name: 'n', styleId: 'halftone' as const, params: { uCellSize: 12 }, textParams: {} }

beforeEach(() => {
  setPresetStorage(new MemoryStorage())
})

describe('loadPresets', () => {
  it('returns [] when storage empty', () => {
    expect(loadPresets()).toEqual([])
  })
  it('returns [] for corrupted JSON', () => {
    const s = new MemoryStorage()
    s.setItem('pixel-forge.presets.v1', '{not json')
    setPresetStorage(s)
    expect(loadPresets()).toEqual([])
  })
  it('drops invalid entries, keeps valid ones', () => {
    const s = new MemoryStorage()
    s.setItem('pixel-forge.presets.v1', JSON.stringify([
      { id: 'a', name: 'ok', styleId: 'halftone', params: {}, textParams: {}, createdAt: 2 },
      { id: 'b', name: 'bad-style', styleId: 'nope', params: {}, textParams: {}, createdAt: 3 },
      { id: 'c', name: 'bad-params', styleId: 'halftone', params: 5, textParams: {}, createdAt: 4 },
    ]))
    setPresetStorage(s)
    expect(loadPresets().map((e) => e.id)).toEqual(['a'])
  })
  it('sorts by createdAt descending', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    savePreset(HALFTONE)
    vi.setSystemTime(2000)
    savePreset(HALFTONE)
    vi.useRealTimers()
    const list = loadPresets()
    expect(list).toHaveLength(2)
    expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt)
  })
  it('returns [] when storage throws', () => {
    setPresetStorage(new ThrowingStorage())
    expect(loadPresets()).toEqual([])
  })
})

describe('savePreset', () => {
  it('persists and returns full entry', () => {
    const e = savePreset(HALFTONE)
    expect(e).not.toBeNull()
    expect(e!.id).toBeTruthy()
    expect(e!.createdAt).toBeGreaterThan(0)
    const list = loadPresets()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('n')
    expect(list[0].params.uCellSize).toBe(12)
  })
  it('returns null when storage throws (quota/private mode)', () => {
    setPresetStorage(new ThrowingStorage())
    expect(savePreset(HALFTONE)).toBeNull()
  })
})

describe('removePreset', () => {
  it('removes existing entry → true', () => {
    const e = savePreset(HALFTONE)!
    expect(removePreset(e.id)).toBe(true)
    expect(loadPresets()).toEqual([])
  })
  it('returns false for unknown id', () => {
    expect(removePreset('nope')).toBe(false)
  })
})

describe('mergeWithDefaults', () => {
  it('overlays stored values onto defaults, fills missing, ignores unknown keys', () => {
    const def = getStyle('halftone')!
    const merged = mergeWithDefaults(def, { uCellSize: 30, uBogus: 1 }, {})
    expect(merged.params.uCellSize).toBe(30)
    const shape = def.params.find(p => p.uniform === 'uShape') as { default: number }
    expect(merged.params.uShape).toBe(shape.default) // 缺失 → 默认
    expect(merged.params.uBogus).toBeUndefined() // 未知 key 被忽略
  })
  it('keeps text param defaults when preset has none', () => {
    const def = getStyle('ascii')! // ascii 含 text 参数 uCharset
    const merged = mergeWithDefaults(def, {}, {})
    const charset = def.params.find(p => p.type === 'text') as { uniform: string; textDefault: string }
    expect(merged.textParams[charset.uniform]).toBe(charset.textDefault)
  })
  it('color params live in textParams', () => {
    const def = getStyle('ascii')! // ascii 含 color 参数 uCharColor
    const color = def.params.find(p => p.type === 'color') as { uniform: string; default: string }
    const merged = mergeWithDefaults(def, {}, { [color.uniform]: '#ff0000' })
    expect(merged.textParams[color.uniform]).toBe('#ff0000')
  })
})
