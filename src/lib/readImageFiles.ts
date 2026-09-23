// src/lib/readImageFiles.ts
// 文件列表异步解码为图片:FileReader → dataURL → Image,与 v1 上传路径同链路。
// 独立成 lib 供两处消费:ImageUploader(首次上传)与 App2D 追加路径(ImageStrip [+]/
// 批量模式测试图)。全部文件落定后一次性回调,保持文件选择顺序(顺序即行序);
// 单个文件读取/解码失败只 console.warn 跳过(v1 批量面板口径),不阻塞其余文件。
export interface LoadedImage {
  image: HTMLImageElement
  name: string
}

export function readImageFiles(files: FileList | File[]): Promise<LoadedImage[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
  return Promise.all(
    list.map(
      (file) =>
        new Promise<LoadedImage | null>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const img = new Image()
            img.onload = () => resolve({ image: img, name: file.name })
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
