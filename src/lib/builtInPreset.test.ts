import { describe, expect, it } from 'vitest'
import type { BuiltInPresetDefinition, StyleDefinition } from '../types'
import zh from '../i18n/zh.json'
import en from '../i18n/en.json'
import { findMatchingBuiltInPreset, resolvePresetValues } from './builtInPreset'
import { getStyle } from './StyleRegistry'

function readI18n(root: unknown, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) return undefined
    return (value as Record<string, unknown>)[key]
  }, root)
}

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

describe('quick style locales', () => {
  it('provides a non-empty quick styles label in both supported languages', () => {
    expect(readI18n(zh, 'preset.quickStyles')).toEqual(expect.any(String))
    expect(readI18n(zh, 'preset.quickStyles')).not.toBe('')
    expect(readI18n(en, 'preset.quickStyles')).toEqual(expect.any(String))
    expect(readI18n(en, 'preset.quickStyles')).not.toBe('')
  })
})

describe('halftone built-in presets', () => {
  it('offers four complete, resolvable print presets with translated labels', () => {
    const halftone = getStyle('halftone')!
    expect(halftone.presets?.map(({ id }) => id)).toEqual([
      'newsprint', 'colorPrint', 'duotoneRiso', 'coarsePoster',
    ])
    for (const preset of halftone.presets ?? []) {
      const values = resolvePresetValues(halftone, preset.params, preset.textParams ?? {})
      expect(Object.keys(values.params)).toHaveLength(6)
      expect(values).toEqual({ params: preset.params, textParams: {} })
      expect(findMatchingBuiltInPreset(halftone, values.params, values.textParams)).toBe(preset.id)
      for (const locale of [zh, en]) {
        expect(readI18n(locale, preset.label)).toEqual(expect.any(String))
        expect(readI18n(locale, preset.label)).not.toBe('')
      }
    }
  })
})
