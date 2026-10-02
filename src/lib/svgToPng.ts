// src/lib/svgToPng.ts
/** SVG 字符串 → PNG Blob(canvas 中转)。svg 需自带 width/height 属性。
 *  失败(解码/渲染异常)resolve null,调用方退回原 svg 下载。 */
export function svgToPngBlob(svg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width || 1200
      c.height = img.height || 1600
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height) // PNG 透明背景在相册显示为黑,铺白底
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      c.toBlob((b) => resolve(b), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
