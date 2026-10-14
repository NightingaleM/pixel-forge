// src/lib/batch/previewSource.ts
// 对角线预览队列(v3.2)的渲染源降采样:预览只显示在底部条 82×56 缩略图上,
// 按原图全分辨率渲染是千倍级算力浪费(桌面上传不降采样,手机原图可达 32MP+,
// 一次全尺寸渲染+PNG 编码即 0.3~0.6s 主线程冻结,批量多行串行再放大——
// 「调参一下卡一下」的根因)。「开始处理」出图不受影响,仍走原图全分辨率。
// 降采样按源图缓存(WeakMap<源图, Promise>):同一行参数反复变化只降采样一次;
// 缓存 promise 而非结果,并发调用自然去重。降采样失败回退原图(预览变慢但
// 不缺席),失败回退一并缓存——canvas 创建失败多属环境持续态,重试无意义。
import { needsDownscale, downscaleImage } from '../downscale'

/** 预览渲染源长边上限:显示尺寸(82×56)的 ~6 倍,3x DPR 下仍有 2 倍余量。 */
export const PREVIEW_MAX_EDGE = 512

const cache = new WeakMap<HTMLImageElement, Promise<HTMLImageElement>>()

/** 预览渲染源:超阈原图返回长边 ≤PREVIEW_MAX_EDGE 的降采样副本(同源图恒同一
 *  副本);小图原样透传(零成本路径,不进缓存)。 */
export function previewSource(image: HTMLImageElement): Promise<HTMLImageElement> {
  if (!needsDownscale(image.width, image.height, PREVIEW_MAX_EDGE)) return Promise.resolve(image)
  let p = cache.get(image)
  if (!p) {
    p = downscaleImage(image, PREVIEW_MAX_EDGE).catch(() => image)
    cache.set(image, p)
  }
  return p
}
