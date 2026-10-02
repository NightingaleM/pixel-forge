// src/lib/svgToPng.ts
/** SVG 字符串 → PNG Blob(canvas 中转)。svg 需自带 width/height 属性。
 *  失败(解码/渲染异常)resolve null,调用方退回原 svg 下载。 */
export function svgToPngBlob(svg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      // 防御:onload 已脱离 Promise executor(异步回调),getContext null
      // (iOS Safari 内存压力)等同步 throw 会让本 Promise 永不 settle、调用方
      // await 永悬——catch 后 resolve(null) 走退回 svg 下载分支。
      try {
        const c = document.createElement('canvas')
        c.width = img.width || 1200
        c.height = img.height || 1600
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height) // PNG 透明背景在相册显示为黑,铺白底
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        c.toBlob((b) => resolve(b), 'image/png')
      } catch {
        URL.revokeObjectURL(url)
        resolve(null)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
