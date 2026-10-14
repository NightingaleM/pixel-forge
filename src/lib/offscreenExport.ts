// src/lib/offscreenExport.ts
// 离屏全尺寸导出渲染:单图下载用。预览画布由 ShaderRenderer.loadImage fit 到
// .compare-container 显示尺寸,直接 toBlob 会导出显示分辨率——小窗口/移动端
// 文件随窗口缩水的根因;本函数以不在 DOM 的 canvas 重渲(无容器 → loadImage
// 不 fit → clamp(原图长边, min(MAX_TEXTURE_SIZE, 2048))),与批量管线
// (runBatch 离屏任务)同尺寸语义。renderer 即建即毁——移动端 WebGL 上下文
// 配额紧,不留长驻第二上下文。
import { ShaderRenderer } from './ShaderRenderer'
import { AsciiCanvasRenderer } from './AsciiCanvasRenderer'
import { renderImage, type RenderImageOpts } from './renderImage'

export interface FullResRender {
  canvas: HTMLCanvasElement
  /** 释放 GPU 资源;调用方 toBlob 完成后调用(destroy 幂等,双调安全)。 */
  dispose: () => void
}

/** 离屏全尺寸渲染当前效果。仅服务 shader 风格(canvas2d 风格返回 null——其
 *  导出画布本就按 MAX_PROCESS_SIZE 与窗口无关);上下文创建/渲染失败返回
 *  null,调用方回退预览画布(不劣于现状)。 */
export async function renderFullResCanvas(
  opts: Omit<RenderImageOpts, 'canvas' | 'renderer' | 'asciiCanvas' | 'asciiRenderer'>,
): Promise<FullResRender | null> {
  const { image, styleDef } = opts
  if (!image || styleDef.renderMode === 'canvas2d') return null

  const canvas = document.createElement('canvas')
  let renderer: ShaderRenderer
  try {
    renderer = new ShaderRenderer(canvas)
  } catch {
    return null // WebGL 不可用/上下文配额尽:回退预览画布
  }
  try {
    renderer.loadImage(image)
    // renderImage 签面要求 asciiCanvas/asciiRenderer,shader 分支不消费;
    // 传占位实例(canvas2d 已在上方排除,不会画进占位画布)
    await renderImage({
      ...opts,
      canvas,
      renderer,
      asciiCanvas: document.createElement('canvas'),
      asciiRenderer: new AsciiCanvasRenderer(),
    })
  } catch {
    renderer.destroy()
    return null
  }
  return {
    canvas,
    dispose: () => renderer.destroy(),
  }
}
