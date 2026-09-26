// src/lib/license/watermark.ts
// 导出水印:canvas 分支(copy 后画,预览画布永不污染)、SVG 分支(字符串注入)。
// 布局/文本为纯函数可单测;canvas 绘制是薄层,浏览器实测兜底(node 无 canvas)。
import { exportCanvasBlob } from '../renderImage'

export const WATERMARK_SITE = 'PixelForge'
export const WATERMARK_DOMAIN = 'pixelforge.oylz.site'

export function watermarkText(seed: string): string {
  return `${WATERMARK_SITE} · ${seed} · ${WATERMARK_DOMAIN}`
}

/** 平铺字号:≈图宽/22(下限 14)。只依赖宽度。T6 大字(用户 2026-09-27 拍板)。 */
export function tiledLayout(w: number): { fontSize: number } {
  return { fontSize: Math.max(14, Math.round(w / 22)) }
}

/**
 * 平铺步长:必须与文本实际宽度挂钩(旧实现只按图宽算,同行文本互相压叠)。
 * 横向 = 文本宽 + 2.5×字号(底色条宽 ≈ 文本宽+1.6×字号,条间仍留空);
 * 纵向 = 3×字号(底色条高 ≈ 1.8×字号)。
 */
export function tileStep(textWidth: number, fontSize: number): { stepX: number; stepY: number } {
  return { stepX: Math.ceil(textWidth + fontSize * 2.5), stepY: Math.ceil(fontSize * 3) }
}

/** 就地在 canvas 上画水印。corner=右下角单行(白 60%+阴影);tiled=45° 平铺。 */
export function applyCanvasWatermark(canvas: HTMLCanvasElement, mode: 'corner' | 'tiled', seed: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const text = watermarkText(seed)
  if (mode === 'corner') {
    const fontSize = Math.max(12, Math.round(canvas.width / 50))
    ctx.save()
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 3
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(text, canvas.width - fontSize * 0.5, canvas.height - fontSize * 0.5)
    ctx.restore()
    return
  }
  const { fontSize } = tiledLayout(canvas.width)
  ctx.save()
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textWidth = ctx.measureText(text).width
  const { stepX, stepY } = tileStep(textWidth, fontSize)
  // 45° 旋转后平铺:中心平移+旋转,起止扩到对角线长度保证全覆盖
  const diag = Math.ceil(Math.hypot(canvas.width, canvas.height))
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 4)
  // T6-25 方案:无底色,白字 95% + 黑描边(0.12×字号)撑轮廓,整体 25% 半透明
  ctx.globalAlpha = 0.25
  ctx.lineWidth = fontSize * 0.12
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'
  ctx.lineJoin = 'round'
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  for (let y = -diag; y <= diag; y += stepY) {
    for (let x = -diag; x <= diag; x += stepX) {
      ctx.strokeText(text, x, y)
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()
}

/** 副本导出:copy src → 水印 → toBlob。会员路径不经过此函数(直接 exportCanvasBlob)。 */
export async function exportWatermarked(
  src: HTMLCanvasElement, mode: 'corner' | 'tiled', seed: string, type: 'image/png' | 'image/jpeg',
): Promise<Blob | null> {
  const tmp = document.createElement('canvas')
  tmp.width = src.width
  tmp.height = src.height
  const ctx = tmp.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(src, 0, 0)
  applyCanvasWatermark(tmp, mode, seed)
  return exportCanvasBlob(tmp, type)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** svg 根元素像素宽(matrixToSvg 恒为数字);解析失败返回 null。 */
function svgRootWidth(svg: string): number | null {
  const m = svg.match(/<svg[^>]*\swidth="([0-9]+(?:\.[0-9]+)?)"/)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * SVG 水印:插入 root 闭合标签前(覆盖在内容之上)。无 </svg> 或宽度不可知
 * (旧实现 font-size=1 即 1px 隐形字)视为无法落笔,原样返回。
 */
export function injectSvgWatermark(svg: string, mode: 'corner' | 'tiled', seed: string): string {
  const idx = svg.lastIndexOf('</svg>')
  if (idx < 0) return svg
  const w = svgRootWidth(svg)
  if (w === null) return svg
  const raw = watermarkText(seed)
  const text = escapeXml(raw)
  let inject: string
  if (mode === 'corner') {
    const fontSize = Math.max(12, Math.round(w / 50))
    inject = `<text x="100%" y="100%" text-anchor="end" dy="-0.5" font-size="${fontSize}" fill="rgba(255,255,255,0.6)" font-family="sans-serif">${text}</text>`
  } else {
    const fontSize = Math.max(14, Math.round(w / 22))
    // 保守字符宽 0.6em(sans-serif 混排实测 ≈0.52em):估算宁宽勿裁
    const textW = raw.length * fontSize * 0.6
    // tile=平铺步长(与 canvas tileStep 同构);pattern 内只放文本无背景 rect
    // (rect 曾铺满 tile 使全图蒙黑——回归见单测)
    const { stepX: tileW, stepY: tileH } = tileStep(textW, fontSize)
    // T6-25:白字 95% + 黑描边,整体 opacity 25%;paint-order 让描边垫在填充下
    inject =
      `<defs><pattern id="pfwm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<text x="${Math.round(tileW / 2)}" y="${Math.round(tileH / 2)}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" fill="rgba(255,255,255,0.95)" stroke="rgba(0,0,0,0.9)" stroke-width="${Math.round(fontSize * 0.12)}" stroke-linejoin="round" paint-order="stroke" opacity="0.25">${text}</text>` +
      `</pattern></defs>` +
      `<rect width="100%" height="100%" fill="url(#pfwm)"/>`
  }
  return svg.slice(0, idx) + inject + svg.slice(idx)
}
