import { describe, it, expect } from 'vitest'
import { matrixToSvg } from './svg'

describe('matrixToSvg', () => {
  it('wraps cells in an svg element with correct size', () => {
    const svg = matrixToSvg([], 100, 50, 'monospace')
    expect(svg).toContain('<svg')
    expect(svg).toContain('width="100"')
    expect(svg).toContain('height="50"')
    expect(svg).toContain('</svg>')
  })

  it('emits a <text> element per cell', () => {
    const svg = matrixToSvg(
      [{ char: 'A', x: 10, y: 20, size: 14, color: '#00ff66' }],
      100, 100, 'monospace',
    )
    expect(svg).toContain('<text')
    expect(svg).toContain('x="10.00"')
    expect(svg).toContain('y="20.00"')
    expect(svg).toContain('font-size="14.00"')
    expect(svg).toContain('fill="#00ff66"')
    expect(svg).toContain('>A<')
    expect(svg).toContain('dominant-baseline="hanging"')
  })

  it('escapes XML special characters in chars', () => {
    const svg = matrixToSvg(
      [{ char: '<&>"\'', x: 0, y: 0, size: 10, color: '#000' }],
      50, 50, 'monospace',
    )
    expect(svg).not.toContain('<&');
    expect(svg).toContain('&lt;')
    expect(svg).toContain('&amp;')
  })
})
