import type { BuiltInPresetDefinition, StyleDefinition } from '../types'
import { isValidHexColor, snapToStep } from './paramValue'

export interface ResolvedPresetValues {
  params: Record<string, number>
  textParams: Record<string, string>
}

export function resolvePresetValues(
  def: StyleDefinition,
  inputParams: Record<string, number>,
  inputTextParams: Record<string, string>,
): ResolvedPresetValues {
  const params: Record<string, number> = {}
  const textParams: Record<string, string> = {}

  for (const p of def.params) {
    if (p.type === 'font') continue
    if (p.type === 'text') {
      textParams[p.uniform] = typeof inputTextParams[p.uniform] === 'string'
        ? inputTextParams[p.uniform]
        : p.textDefault
    } else if (p.type === 'color') {
      const raw = inputTextParams[p.uniform]
      textParams[p.uniform] = (isValidHexColor(raw ?? '') ? raw : p.default).toLowerCase()
    } else if (p.type === 'select') {
      const raw = inputParams[p.uniform]
      params[p.uniform] = Number.isFinite(raw) && p.options.some((o) => o.value === raw)
        ? raw : p.default
    } else if (p.type === 'toggle') {
      const raw = inputParams[p.uniform]
      params[p.uniform] = raw === 0 || raw === 1 ? raw : p.default
    } else {
      params[p.uniform] = snapToStep(
        inputParams[p.uniform] ?? p.default,
        p.min, p.max, p.step, p.default,
      )
    }
  }

  return { params, textParams }
}

export function resolveBuiltInPreset(
  def: StyleDefinition,
  preset: BuiltInPresetDefinition,
): ResolvedPresetValues {
  return resolvePresetValues(def, preset.params, preset.textParams ?? {})
}

function areEqualMaps<T extends string | number>(a: Record<string, T>, b: Record<string, T>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length
    && aKeys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
}

export function findMatchingBuiltInPreset(
  def: StyleDefinition,
  params: Record<string, number>,
  textParams: Record<string, string>,
): string | null {
  const current = resolvePresetValues(def, params, textParams)
  for (const preset of def.presets ?? []) {
    const candidate = resolveBuiltInPreset(def, preset)
    if (
      areEqualMaps(current.params, candidate.params)
      && areEqualMaps(current.textParams, candidate.textParams)
    ) {
      return preset.id
    }
  }
  return null
}
