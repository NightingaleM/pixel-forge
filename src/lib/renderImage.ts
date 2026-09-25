// src/lib/renderImage.ts
// 共享渲染核心:单图界面(App2D)与批量队列(runBatch)共用同一份渲染语义,
// 保证"单图看到什么,批量出什么"。提炼自 App2D.renderWithStyle。
import type { StyleDefinition } from '../types'
import { hexToRgb } from './paramValue'
import type { ShaderRenderer } from './ShaderRenderer'
import type { AsciiCanvasRenderer } from './AsciiCanvasRenderer'

export interface BrightestPoint { x: number; y: number }

/** 渲染前的纯参数合并:color hex 拆 R/G/B(0..1)并入数字 uniform;
 *  animelight 自动光源开启时用检测到的最亮点覆盖中心。
 *  godray 守卫必须用 === 1 而非 !== 0:其他风格的 params 里没有 uGodRayAuto,
 *  undefined !== 0 为 true 会跨风格污染光源/中心参数。 */
export function buildRenderParams(
  styleDef: StyleDefinition,
  params: Record<string, number>,
  textParams: Record<string, string>,
  brightest: BrightestPoint | null,
): Record<string, number> {
  const merged = { ...params }
  for (const p of styleDef.params) {
    if (p.type !== 'color') continue
    const [r, g, b] = hexToRgb(textParams[p.uniform] ?? p.default)
    merged[`${p.uniform}R`] = r
    merged[`${p.uniform}G`] = g
    merged[`${p.uniform}B`] = b
  }
  if (params['uGodRayAuto'] === 1 && brightest) {
    merged['uCenterX'] = brightest.x
    merged['uCenterY'] = brightest.y
  }
  return merged
}

export interface RenderImageOpts {
  canvas: HTMLCanvasElement
  asciiCanvas: HTMLCanvasElement
  // renderer/image 放宽为可空:canvas2d 分支只依赖 image,shader 分支只依赖
  // renderer(原图已由调用方 loadImage 到 GPU,shader 路径不直接读 image),
  // 各分支自守避免调用方为用不到的字段造假值
  renderer: ShaderRenderer | null
  asciiRenderer: AsciiCanvasRenderer
  image: HTMLImageElement | null
  styleDef: StyleDefinition
  params: Record<string, number>
  textParams: Record<string, string>
  fontParams: Record<string, FontFace | null>
  brightest: BrightestPoint | null
}

/** 渲染一张图到给定 canvas(shader)或 asciiCanvas(canvas2d)。与原 renderWithStyle 逐行等价。 */
export async function renderImage(opts: RenderImageOpts): Promise<void> {
  const { canvas, asciiCanvas, renderer, asciiRenderer, image, styleDef, params, textParams, fontParams, brightest } = opts

  // canvas2d 分支(ASCII)必须先于 WebGL 文字纹理块 return:canvasRef 已被
  // ShaderRenderer 锁定为 WebGL 上下文,单个 canvas 元素无法同时承载两种上下文,
  // 故 ASCII 渲染到独立的 asciiCanvas
  if (styleDef.renderMode === 'canvas2d') {
    if (!image) return
    asciiRenderer.render(asciiCanvas, image, {
      charset: textParams['uCharset'] ?? '',
      caseMode: params['uCaseMode'] ?? 0,
      // 数值回退与 StyleRegistry ascii 默认保持一致(正常路径 state 必有值,纯防御)
      charColor: textParams['uCharColor'] ?? '#0af5a7',
      showBg: params['uShowBg'] ?? 1,
      charScale: params['uCharScale'] ?? 0.85,
      cellSize: params['uCellSize'] ?? 14,
      randomScale: params['uRandomScale'] ?? 0.55,
      bgFilter: params['uBgFilter'] ?? 0.07,
    }, fontParams['uFont'] ?? null)
    return
  }

  // shader 分支:ASCII 已 return,此处 renderer 必需。判空放在文字纹理生成前,
  // 与原代码顺序一致(canvas2d → renderer 判空 → text textures)
  if (!renderer) return

  const textTextures: WebGLTexture[] = []
  const textParamDefs = styleDef.params.filter((p): p is typeof p & { type: 'text' } => p.type === 'text')
  let atlasCount = 0
  for (const tp of textParamDefs) {
    const text = textParams[tp.uniform] || tp.textDefault
    const fontSize = params['uFontSize'] || 24
    // 图集按码点切字(emoji 算 1 格)且超宽时整体缩放,格数以 loadTextTexture
    // 的实际产出为准——uAtlasCount 必须等于图集真实格数,否则 shader 的
    // atlasU 映射会错位
    const atlas = renderer.loadTextTexture(text, fontSize)
    textTextures.push(atlas.texture)
    atlasCount = atlas.cellCount
  }

  const mergedParams = buildRenderParams(styleDef, params, textParams, brightest)
  if (textTextures.length > 0) {
    renderer.bindTexture(textTextures[0], 2)
    mergedParams['uAtlasCount'] = atlasCount
  }

  const shaderSources = await Promise.all(styleDef.shaderImports.map((fn) => fn()))

  if (styleDef.isMultiPass && shaderSources.length > 1) {
    renderer.renderMultiPass(shaderSources.map((src) => ({ fragSource: src, uniforms: { ...mergedParams } })))
  } else {
    renderer.useShader(shaderSources[0])
    // 文字图集采样器指向单元 2:sampler 型 uniform 必须用 uniform1i 赋值
    // (setUniform 的 uniform1f 路径对其无效,采样器保持默认值 0,会误采
    // 单元 0 上的原图——textraster 曾因此从未显示过文字)。图集本身已在
    // 上方 bindTexture(tex, 2) 绑定;每次 useShader 重链接后默认值复位,
    // 故必须逐帧重新赋值。
    if (textTextures.length > 0) renderer.setSampler('uCharAtlas', 2)
    renderer.setUniform('uResolution', [canvas.width, canvas.height])
    for (const [key, val] of Object.entries(mergedParams)) {
      renderer.setUniform(key, val)
    }
    renderer.render()
  }

  // 清理本帧生成的文字纹理(体积有限,逐帧建/删与原实现一致)
  for (const tex of textTextures) {
    const gl = renderer.getGl()
    if (gl) gl.deleteTexture(tex)
  }
}

/** toBlob 的 promise 化。 */
export function exportCanvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg'): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type))
}

/** 黑底合成:返回新 canvas(不改源)。JPG 无 alpha,背景关闭时透明区否则变白。
 *  独立导出供水印路径使用(JPG 水印顺序契约:渲染→黑底→水印→toBlob)。 */
export function compositeOnBlack(source: HTMLCanvasElement): HTMLCanvasElement {
  const tmp = document.createElement('canvas')
  tmp.width = source.width
  tmp.height = source.height
  const ctx = tmp.getContext('2d')
  if (!ctx) return tmp   // 调用方 toBlob 会得到空图,与原实现失败路径一致
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(source, 0, 0)
  return tmp
}

/** JPG 无 alpha:先合成黑底(背景关闭时 ASCII 透明区域否则变白)。 */
export async function exportJpgWithBlackBg(source: HTMLCanvasElement): Promise<Blob | null> {
  return exportCanvasBlob(compositeOnBlack(source), 'image/jpeg')
}
