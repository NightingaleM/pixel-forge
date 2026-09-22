import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPanelPos, savePanelPos, setPanelPosStorage,
} from './panelPosStore'

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

beforeEach(() => {
  setPanelPosStorage(new MemoryStorage())
})

describe('loadPanelPos', () => {
  it('returns null when storage empty', () => {
    expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toBeNull()
  })
  it('round-trips a saved position', () => {
    savePanelPos('pixel-forge.panelPos.2d.v1', { x: 282, y: 110 })
    expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toEqual({ x: 282, y: 110 })
  })
  it('keeps keys independent', () => {
    savePanelPos('pixel-forge.panelPos.3d.bg.v1', { x: 15, y: 870 })
    expect(loadPanelPos('pixel-forge.panelPos.3d.light.v1')).toBeNull()
  })
  it('returns null for corrupted JSON', () => {
    const s = new MemoryStorage()
    s.setItem('pixel-forge.panelPos.2d.v1', '{not json')
    setPanelPosStorage(s)
    expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toBeNull()
  })
  it('returns null for non-object JSON', () => {
    const s = new MemoryStorage()
    s.setItem('pixel-forge.panelPos.2d.v1', '42')
    setPanelPosStorage(s)
    expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toBeNull()
  })
  it('returns null when x or y is not a finite number', () => {
    const s = new MemoryStorage()
    for (const bad of [
      JSON.stringify({ x: 'a', y: 110 }),
      JSON.stringify({ x: 282 }),
      JSON.stringify({ x: null, y: 110 }),
      JSON.stringify({ x: NaN, y: 110 }),
      JSON.stringify({ x: Infinity, y: 110 }),
    ]) {
      s.setItem('pixel-forge.panelPos.2d.v1', bad)
      setPanelPosStorage(s)
      expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toBeNull()
    }
  })
  it('returns null when storage throws', () => {
    setPanelPosStorage(new ThrowingStorage())
    expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toBeNull()
  })
})

describe('savePanelPos', () => {
  it('does not throw when storage throws', () => {
    setPanelPosStorage(new ThrowingStorage())
    expect(() => savePanelPos('pixel-forge.panelPos.2d.v1', { x: 1, y: 2 })).not.toThrow()
  })
  it('does not throw when storage unavailable', () => {
    setPanelPosStorage(null)
    expect(() => savePanelPos('pixel-forge.panelPos.2d.v1', { x: 1, y: 2 })).not.toThrow()
    expect(loadPanelPos('pixel-forge.panelPos.2d.v1')).toBeNull()
  })
})
