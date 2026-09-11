import { describe, expect, it } from 'vitest'
import composite from '../shaders/lightshadow_composite.frag?raw'

// Execute the shader's scalar arithmetic itself, without duplicating its curve.
// Browser verification separately compiles and exercises the complete GLSL.
function toneCurve(): (value: number) => number {
  const body = composite.match(/float compressTone\(float value\) \{([\s\S]*?)\n\}/)?.[1]
  expect(body, 'a smooth toe and shoulder must protect graded values').toBeDefined()
  return new Function('value', body!.replace(/\bfloat\b/g, 'const')) as (value: number) => number
}

describe('Light & Shadow detail protection', () => {
  it('preserves ordering in negative shadows and overbright highlights without flattening midtones', () => {
    const compress = toneCurve()
    const ramp = Array.from({ length: 601 }, (_, i) => -2 + i / 100)
    let previous = -Infinity
    for (const input of ramp) {
      const output = compress(input)
      expect(output).toBeGreaterThan(0)
      expect(output).toBeLessThan(1)
      expect(output).toBeGreaterThan(previous)
      previous = output
    }
    for (const input of [0.3, 0.5, 0.7]) expect(compress(input)).toBe(input)
  })

  it('joins the toe and shoulder to the midtones with continuous unit slope', () => {
    const compress = toneCurve()
    const delta = 1e-6
    for (const join of [0.1, 0.9]) {
      expect(compress(join)).toBeCloseTo(join, 10)
      expect((compress(join) - compress(join - delta)) / delta).toBeCloseTo(1, 4)
      expect((compress(join + delta) - compress(join)) / delta).toBeCloseTo(1, 4)
    }
  })

  it('compresses after ambient multiplication and before the output clamp', () => {
    expect(composite).toMatch(/vec3 final = shaped \* mix\(0\.9, 1\.1, lightFactor\);\s*final = vec3\(compressTone\(final\.r\), compressTone\(final\.g\), compressTone\(final\.b\)\);[\s\S]*clamp\(final, 0\.0, 1\.0\)/)
  })

  it('keeps shadow depth effective up to the existing slider maximum', () => {
    const coefficient = Number(composite.match(/uShadowDepth \* ([\d.]+)/)?.[1])
    const scale = (depth: number) => Math.max(0.2, 1 - depth * coefficient)
    expect(scale(1.99)).toBeGreaterThan(scale(2))
    expect(scale(2)).toBeCloseTo(0.2)
  })
})
