// src/lib/license/watermark.test.ts
// 水印纯逻辑:三要素文本/平铺布局/SVG 注入(字符串操作,node 可测);
// canvas 绘制为薄层,浏览器实测兜底(见 plan Task 7)。
import { describe, it, expect } from 'vitest'
import { watermarkText, tiledLayout, tileStep, injectSvgWatermark, WATERMARK_DOMAIN } from './watermark'

describe('watermarkText', () => {
  it('三要素:站名 · 种子码 · 域名', () => {
    expect(watermarkText('0A3fK')).toBe(`PixelForge · 0A3fK · ${WATERMARK_DOMAIN}`)
  })
})

describe('tiledLayout', () => {
  it('大图字号大,小图有可读下限(14)', () => {
    const big = tiledLayout(4000)
    const small = tiledLayout(400)
    expect(big.fontSize).toBeGreaterThan(small.fontSize)
    expect(small.fontSize).toBeGreaterThanOrEqual(14)
  })
  it('字号≈图宽/22(1536 宽 → 70):用户 2026-09-27 拍板 T6 大字', () => {
    expect(tiledLayout(1536).fontSize).toBe(70)
  })
})

describe('tileStep', () => {
  // 回归:旧实现步长只按图宽算,与文本宽度脱节 → 同行文本互相压叠
  it('同行步长 > 文本宽 + 2×字号:相邻文本绝不重叠', () => {
    const { stepX } = tileStep(830, 51)
    expect(stepX).toBeGreaterThan(830 + 51 * 2)
  })
  it('行距 ≥ 3×字号:底色条(高约 1.8×字号)之间仍有空隙', () => {
    expect(tileStep(830, 51).stepY).toBeGreaterThanOrEqual(51 * 3)
  })
})

describe('injectSvgWatermark', () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text>x</text></svg>'

  it('tiled:注入 pattern(rotate 45)+黑描边白字(T6 方案),插在 </svg> 前,含种子码与域名', () => {
    const out = injectSvgWatermark(base, 'tiled', '0A3fK')
    expect(out).toContain('<pattern')
    expect(out).toContain('rotate(45)')
    expect(out).toContain('patternUnits="userSpaceOnUse"')
    expect(out).toContain('font-weight="bold"')
    expect(out).toContain('paint-order="stroke"')      // 描边垫在填充下(SVG 默认顺序会盖字)
    expect(out).toMatch(/stroke="rgba\(0,\s*0,\s*0/)
    expect(out).toContain('opacity="0.25"')            // 整体 25% 半透明(用户拍板 T6-25)
    expect(out).not.toContain('font-size="1"')        // 回归:旧实现 1px 字号不可见
    expect(out).toContain('font-size="14"')           // 100 宽 svg → 下限 14
    expect(out).toContain('0A3fK')
    expect(out).toContain(WATERMARK_DOMAIN)
    expect(out.indexOf('<pattern')).toBeGreaterThan(out.indexOf('<text>x</text>'))   // 覆盖在内容之后
    expect(out.endsWith('</svg>')).toBe(true)
  })

  it('tiled:pattern 单元宽于文本估算宽(文本不溢出 tile 被裁切)', () => {
    const out = injectSvgWatermark(base, 'tiled', '0A3fK')
    const m = out.match(/<pattern[^>]*width="(\d+)"/)
    expect(m).not.toBeNull()
    const tileW = Number(m![1])
    const text = `PixelForge · 0A3fK · ${WATERMARK_DOMAIN}`
    // 文本估算宽(0.6em/字符 @14px)必须落在 tile 内
    expect(tileW).toBeGreaterThan(text.length * 14 * 0.6)
    // 字号 14(w/22 下限)时 tile=stepX=ceil(估算宽+2.5×14),步长公式本身覆盖
  })

  it('tiled:pattern 内只有文本无背景 rect(回归:rect 曾铺满 tile 使全图蒙黑)', () => {
    const out = injectSvgWatermark(base, 'tiled', '0A3fK')
    const pat = out.match(/<pattern[^>]*>([\s\S]*?)<\/pattern>/)
    expect(pat).not.toBeNull()
    expect(pat![1]).not.toContain('<rect')
    expect(pat![1]).not.toContain('rx=')              // 无圆角底条残留
  })

  it('corner:右下角单行 text(anchor end + 100% 定位),字号基于 svg 宽而非 1px', () => {
    const out = injectSvgWatermark(base, 'corner', '0A3fK')
    expect(out).toContain('text-anchor="end"')
    expect(out).toContain('x="100%"')
    expect(out).toContain('y="100%"')
    expect(out).toContain('font-size="12"')           // 100 宽 → max(12, 100/50)
    expect(out).not.toContain('<pattern')
  })

  it('无 </svg> 的非法输入原样返回(不抛)', () => {
    expect(injectSvgWatermark('not svg', 'tiled', 'x')).toBe('not svg')
  })

  it('svg 根元素无数字宽度(解析失败)原样返回:字号无处安放,注入只会得到 1px 隐形水印', () => {
    const pct = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="50%"><text>x</text></svg>'
    expect(injectSvgWatermark(pct, 'tiled', 'x')).toBe(pct)
  })

  it('种子码做 XML 转义(base62 本安全,防御手改 localStorage 脏值)', () => {
    const out = injectSvgWatermark(base, 'tiled', 'a<b>&c')
    expect(out).not.toContain('<b>')
    expect(out).toContain('a&lt;b&gt;&amp;c')
  })
})
