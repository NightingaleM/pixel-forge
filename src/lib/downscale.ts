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
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    const out = new Image()
    out.onload = () => resolve(out)
    out.onerror = () => reject(new Error('downscale decode failed'))
    out.src = c.toDataURL('image/png')
  })
}
