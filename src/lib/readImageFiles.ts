// src/lib/readImageFiles.ts
// 文件列表异步解码为图片:FileReader → dataURL → Image,与 v1 上传路径同链路。
// 降采样按需启用:仅当调用方传入 maxEdge(移动端内存保护,767px 断点)时长边>阈值
// 才降采样;桌面传 undefined 保持原分辨率。
// 独立成 lib 供两处消费:ImageUploader(首次上传)与 App2D 追加路径(ImageStrip [+]/
// 批量模式测试图)。全部文件落定后一次性回调,保持文件选择顺序(顺序即行序);
// 单个文件读取/解码失败只 console.warn 跳过(v1 批量面板口径),不阻塞其余文件。
import { needsDownscale, downscaleImage } from './downscale'

export interface LoadedImage {
  image: HTMLImageElement
  name: string
  /** 原始 File(File extends Blob):会话持久化(方案B)的行原图来源。
   *  image 可能是降采样产物,originFile 恒为用户选中的原文件。 */
  file: File
}

export function readImageFiles(
  files: FileList | File[],
  opts?: { maxEdge?: number },
): Promise<LoadedImage[]> {
  const cap = opts?.maxEdge
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
  return Promise.all(
    list.map(
      (file) =>
        new Promise<LoadedImage | null>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
              if (cap && needsDownscale(img.width, img.height, cap)) {
                downscaleImage(img, cap)
                  .then((small) => resolve({ image: small, name: file.name, file }))
                  .catch(() => resolve({ image: img, name: file.name, file })) // 降采样失败退回原图
              } else {
                resolve({ image: img, name: file.name, file })
              }
            }
            img.onerror = () => {
              console.warn(`[upload] ${file.name} decode failed`)
              resolve(null)
            }
            img.src = e.target?.result as string
          }
          reader.onerror = () => {
            console.warn(`[upload] ${file.name} read failed`)
            resolve(null)
          }
          reader.readAsDataURL(file)
        }),
    ),
  ).then((results) => results.filter((r): r is LoadedImage => r !== null))
}
