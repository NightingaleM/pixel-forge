import { describe, expect, it } from 'vitest'
import type { BuiltInPresetDefinition, StyleDefinition } from '../types'
import { findMatchingBuiltInPreset, resolvePresetValues } from './builtInPreset'

const def: StyleDefinition = {
  id: 'halftone', label: 'x', description: 'x', shaderImports: [],
  params: [
    { name: 'size', uniform: 'uSize', min: 2, max: 10, step: 2, default: 4 },
    { name: 'mode', uniform: 'uMode', type: 'select', options: [
      { label: 'a', value: 0 }, { label: 'b', value: 1 },
    ], default: 0 },
    { name: 'color', uniform: 'uColor', type: 'color', default: '#FFFFFF' },
  ],
}

const preset: BuiltInPresetDefinition = {
  id: 'demo', label: 'preset.demo',
  params: { uSize: 99, uMode: 1, uUnknown: 7 },
  textParams: { uColor: '#00FF7F', uUnknownText: 'bad' },
}

describe('resolvePresetValues', () => {
  it('fills defaults, filters unknown keys, snaps numbers, and normalizes colors', () => {
    expect(resolvePresetValues(def, preset.params, preset.textParams ?? {})).toEqual({
      params: { uSize: 10, uMode: 1 },
      textParams: { uColor: '#00ff7f' },
    })
  })

  it('falls back for non-finite numbers, invalid selects, and invalid colors', () => {
    expect(resolvePresetValues(def, { uSize: Infinity, uMode: 8 }, { uColor: 'red' })).toEqual({
      params: { uSize: 4, uMode: 0 },
      textParams: { uColor: '#ffffff' },
    })
  })
})

describe('findMatchingBuiltInPreset', () => {
  const withPreset = { ...def, presets: [preset] }
  it('matches only complete resolved values', () => {
    const values = resolvePresetValues(withPreset, preset.params, preset.textParams ?? {})
    expect(findMatchingBuiltInPreset(withPreset, values.params, values.textParams)).toBe('demo')
    expect(findMatchingBuiltInPreset(withPreset, { ...values.params, uSize: 8 }, values.textParams)).toBeNull()
  })
  it('returns null when no presets exist', () => {
    expect(findMatchingBuiltInPreset(def, { uSize: 4, uMode: 0 }, { uColor: '#ffffff' })).toBeNull()
  })
})
