// src/lib/license/watermark.test.ts
// 水印纯逻辑:三要素文本/平铺布局/SVG 注入(字符串操作,node 可测);
// canvas 绘制为薄层,浏览器实测兜底(见 plan Task 7)。
import { describe, it, expect } from 'vitest'
import { watermarkText, tiledLayout, injectSvgWatermark, WATERMARK_DOMAIN } from './watermark'

describe('watermarkText', () => {
  it('三要素:站名 · 种子码 · 域名', () => {
    expect(watermarkText('0A3fK')).toBe(`PixelForge · 0A3fK · ${WATERMARK_DOMAIN}`)
  })
})

describe('tiledLayout', () => {
  it('大图字号/间距大,小图有下限', () => {
    const big = tiledLayout(4000)
    const small = tiledLayout(400)
    expect(big.fontSize).toBeGreaterThan(small.fontSize)
    expect(big.gap).toBeGreaterThan(small.gap)
    expect(small.fontSize).toBeGreaterThanOrEqual(10)   // 小图可读下限
  })
})

describe('injectSvgWatermark', () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text>x</text></svg>'

  it('tiled:注入 pattern(rotate 45)+覆盖 rect,插在 </svg> 前,含种子码与域名', () => {
    const out = injectSvgWatermark(base, 'tiled', '0A3fK')
    expect(out).toContain('<pattern')
    expect(out).toContain('rotate(45)')
    expect(out).toContain('0A3fK')
    expect(out).toContain(WATERMARK_DOMAIN)
    expect(out.indexOf('<pattern')).toBeGreaterThan(out.indexOf('<text>x</text>'))   // 覆盖在内容之后
    expect(out.endsWith('</svg>')).toBe(true)
  })

  it('corner:右下角单行 text(anchor end + 100% 定位)', () => {
    const out = injectSvgWatermark(base, 'corner', '0A3fK')
    expect(out).toContain('text-anchor="end"')
    expect(out).toContain('x="100%"')
    expect(out).toContain('y="100%"')
    expect(out).not.toContain('<pattern')
  })

  it('无 </svg> 的非法输入原样返回(不抛)', () => {
    expect(injectSvgWatermark('not svg', 'tiled', 'x')).toBe('not svg')
  })

  it('种子码做 XML 转义(base62 本安全,防御手改 localStorage 脏值)', () => {
    const out = injectSvgWatermark(base, 'tiled', 'a<b>&c')
    expect(out).not.toContain('<b>')
    expect(out).toContain('a&lt;b&gt;&amp;c')
  })
})
