// src/lib/license/watermark.ts
// 导出水印:canvas 分支(copy 后画,预览画布永不污染)、SVG 分支(字符串注入)。
// 布局/文本为纯函数可单测;canvas 绘制是薄层,浏览器实测兜底(node 无 canvas)。
import { exportCanvasBlob } from '../renderImage'

export const WATERMARK_SITE = 'PixelForge'
export const WATERMARK_DOMAIN = 'pixelforge.oylz.site'

export function watermarkText(seed: string): string {
  return `${WATERMARK_SITE} · ${seed} · ${WATERMARK_DOMAIN}`
}

/** 平铺布局:字号≈图宽/40(下限 10),间距≈图宽/6(下限 80)。只依赖宽度。 */
export function tiledLayout(w: number): { fontSize: number; gap: number } {
  return { fontSize: Math.max(10, Math.round(w / 40)), gap: Math.max(80, Math.round(w / 6)) }
}

/** 就地在 canvas 上画水印。corner=右下角单行(白 60%+阴影);tiled=45° 平铺(15%)。 */
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
  const { fontSize, gap } = tiledLayout(canvas.width)
  ctx.save()
  ctx.font = `${fontSize}px sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  // 45° 旋转后平铺:中心平移+旋转,起止扩到对角线长度保证全覆盖
  const diag = Math.ceil(Math.hypot(canvas.width, canvas.height))
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 4)
  for (let y = -diag; y <= diag; y += gap) {
    for (let x = -diag; x <= diag; x += gap) {
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

/** SVG 水印:插入 root 闭合标签前(覆盖在内容之上)。无 </svg> 视为非法,原样返回。 */
export function injectSvgWatermark(svg: string, mode: 'corner' | 'tiled', seed: string): string {
  const idx = svg.lastIndexOf('</svg>')
  if (idx < 0) return svg
  const text = escapeXml(watermarkText(seed))
  let inject: string
  if (mode === 'corner') {
    inject = `<text x="100%" y="100%" text-anchor="end" dy="-0.5" font-size="1" fill="rgba(255,255,255,0.6)" font-family="sans-serif">${text}</text>`
  } else {
    inject =
      `<defs><pattern id="pfwm" width="30%" height="20%" patternUnits="objectBoundingBox" patternTransform="rotate(45)">` +
      `<text font-size="1" fill="rgba(255,255,255,0.15)" font-family="sans-serif">${text}</text>` +
      `</pattern></defs>` +
      `<rect width="100%" height="100%" fill="url(#pfwm)"/>`
  }
  return svg.slice(0, idx) + inject + svg.slice(idx)
}
