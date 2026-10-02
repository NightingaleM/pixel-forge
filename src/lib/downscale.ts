// src/lib/downscale.ts
// 移动端内存保护:超大图降采样加载。阈值 4096 覆盖 8K 截图/相机原图场景。
export const MAX_IMAGE_EDGE = 4096

export function needsDownscale(w: number, h: number, max = MAX_IMAGE_EDGE): boolean {
  return Math.max(w, h) > max
}

export function scaledSize(w: number, h: number, max = MAX_IMAGE_EDGE): { w: number; h: number } {
  if (!needsDownscale(w, h, max)) return { w, h }
  const scale = max / Math.max(w, h)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/** canvas 等比缩放并重新解码。PNG 编码保 alpha(JPEG 会丢透明)。
 *  返回的 image 已 onload,可直接上纹理。 */
export function downscaleImage(img: HTMLImageElement, max = MAX_IMAGE_EDGE): Promise<HTMLImageElement> {
  const { w, h } = scaledSize(img.width, img.height, max)
  return new Promise((resolve, reject) => {
    // 防御:本函数常在调用方 img.onload 回调里执行,canvas 创建若在 executor 外,
    // getContext null(iOS Safari 内存压力)等同步 throw 会逃出 Promise,
    // .catch 接不住、上传 Promise.all 永悬——故收进 executor,catch 后 reject,
    // 让 readImageFiles 的 .catch 走退回原图分支。
    try {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.drawImage(img, 0, 0, w, h)
      const out = new Image()
      out.onload = () => resolve(out)
      out.onerror = () => reject(new Error('downscale decode failed'))
      out.src = c.toDataURL('image/png')
    } catch (err) {
      reject(err instanceof Error ? err : new Error('downscale canvas failed'))
    }
  })
}
