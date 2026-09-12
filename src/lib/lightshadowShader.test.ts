import { describe, expect, it } from 'vitest'
import composite from '../shaders/lightshadow_composite.frag?raw'

// Execute the shader's scalar arithmetic itself, without duplicating its curve.
// Browser verification separately compiles and exercises the complete GLSL.
function toneCurve(): (value: number) => number {
  const body = composite.match(/float compressTone\(float value\) \{([\s\S]*?)\n\}/)?.[1]
  expect(body, 'a smooth toe and shoulder must protect graded values').toBeDefined()
  return new Function('value', body!.replace(/\bfloat\b/g, 'const')) as (value: number) => number
}

// A grayscale/no-glow specialization of the actual composite statements.
// Equal RGB channels make GLSL vector arithmetic identical to scalar arithmetic.
function darkComposite(): (color: number, uShadowDepth: number, uContrast: number) => number {
  const helpers = [...composite.matchAll(/float (\w+)\(float value\) \{([\s\S]*?)\n\}/g)]
    .map(([, name, body]) => `function ${name}(value) {${body}}`).join('\n')
  const body = composite.slice(composite.indexOf('  vec3 contrasted ='), composite.indexOf('  gl_FragColor ='))
    .replace(/\bvec3 (\w+) =/g, 'let $1 =')
    .replace(/\.[rgb]\b/g, '')
  return new Function('color', 'uShadowDepth', 'uContrast', `
    const transition = 0, blurredBright = 0, uGlowIntensity = 0.35, glowTint = 1, lightFactor = 0.5;
    const max = Math.max, mix = (a, b, t) => a * (1 - t) + b * t, vec3 = r => r;
    ${helpers}
    ${body}
    return final;
  `) as (color: number, uShadowDepth: number, uContrast: number) => number
}

describe('Light & Shadow detail protection', () => {
  it('never brightens black or near-black when increasing shadow depth, including the endpoint', () => {
    const grade = darkComposite()
    for (const contrast of [0.5, 1.25, 1.55, 3]) {
      for (const gray of [0, 0.01, 0.05, 0.09, 0.15, 0.25, 0.45]) {
        let previous = grade(gray, 0, contrast)
        for (let step = 1; step <= 200; step++) {
          const next = grade(gray, step / 100, contrast)
          expect(next, `gray ${gray}, contrast ${contrast}, depth ${step / 100}`).toBeLessThan(previous)
          expect(next).toBeGreaterThan(0)
          previous = next
        }
      }
    }
  })

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
