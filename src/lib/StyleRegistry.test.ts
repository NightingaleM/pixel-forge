import { describe, it, expect } from 'vitest'
import { styles, defaultParams, defaultTextParams } from './StyleRegistry'
import type { StyleId } from '../types'

describe('defaultParams / defaultTextParams', () => {
  it('returns {} for unknown style', () => {
    expect(defaultParams('nonexistent' as StyleId)).toEqual({})
    expect(defaultTextParams('nonexistent' as StyleId)).toEqual({})
  })

  it('collects number/toggle/select defaults for every style', () => {
    for (const s of styles) {
      const p = defaultParams(s.id)
      for (const def of s.params) {
        if (def.type === 'text' || def.type === 'color' || def.type === 'font') continue
        expect(p[def.uniform]).toBe(def.default)
      }
      // 不含 text/color/font 的 uniform
      for (const def of s.params) {
        if (def.type === 'text' || def.type === 'color' || def.type === 'font') {
          expect(p[def.uniform]).toBeUndefined()
        }
      }
    }
  })

  it('collects text defaults for every style', () => {
    for (const s of styles) {
      const tp = defaultTextParams(s.id)
      for (const def of s.params) {
        if (def.type === 'text') expect(tp[def.uniform]).toBe(def.textDefault)
        else expect(tp[def.uniform]).toBeUndefined()
      }
    }
  })
})
