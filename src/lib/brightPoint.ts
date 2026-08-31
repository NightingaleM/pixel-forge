export interface BrightPoint {
  x: number // UV 坐标,0..1,向右增大
  y: number // UV 坐标,0..1,向上增大
}

/**
 * 在缩略图像素数据中找最亮点(luma = 0.299r + 0.587g + 0.114b 最大)。
 * 返回 UV 坐标:canvas 坐标系 y 向下,而纹理经 UNPACK_FLIP_Y_WEBGL 上传后
 * UV 的 y 向上,因此 y 需翻转。平局取行序第一个(确定性)。
 */
export function findBrightestPoint(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): BrightPoint {
  let bestIdx = 0
  let bestLuma = -1
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    if (luma > bestLuma) {
      bestLuma = luma
      bestIdx = i
    }
  }
  const px = bestIdx % w
  const py = Math.floor(bestIdx / w)
  return { x: (px + 0.5) / w, y: 1 - (py + 0.5) / h }
}
