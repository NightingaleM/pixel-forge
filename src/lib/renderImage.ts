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
  // 数值参数缺省兜底:holofoil 彩箔门槛四参数的缺省值非 0,而 GLSL uniform
  // 缺省恒 0(漏传=smoothstep(0,..) 全图吃彩变脸)。按注册表 default 只补
  // undefined 字段——显式值(含用户滑到 0)不覆盖。正常 UI/种子码路径 state
  // 已全量,此循环零命中,不改变其他风格行为
  for (const p of styleDef.params) {
    if ((p.type === undefined || p.type === 'number') && merged[p.uniform] === undefined) {
      merged[p.uniform] = p.default
    }
  }
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
  /** holofoil 分区档的选中区掩膜(256² 白/黑 canvas)。缺省/批量路径不传:
   *  shader 的 uZoneEnabled 走 GLSL 默认 0 → zone 恒 1 = 全部面选中语义。 */
  zoneMask?: HTMLCanvasElement | null
}

// 分区掩膜纹理缓存:按 renderer 实例复用(纹理对象跨帧存活——转卡 rAF 循环的
// renderer.render() 重绘时 unit2 上的掩膜仍须有效,不能照文字纹理逐帧建删),
// 内容每次带 zoneMask 渲染时整张重传(256² 上传 <1ms,参数变化级频率)。
// renderer 废弃后上下文随 canvas 回收,WeakMap 项自然放行。
const zoneTexCache = new WeakMap<ShaderRenderer, WebGLTexture>()

function uploadZoneMask(renderer: ShaderRenderer, canvas: HTMLCanvasElement): void {
  const gl = renderer.getGl()
  let tex = zoneTexCache.get(renderer)
  if (!tex) {
    tex = gl.createTexture()!
    zoneTexCache.set(renderer, tex)
  }
  renderer.bindTexture(tex, 2)
  // 与原图同向(ShaderRenderer.loadImage 的 FLIP_Y=true 约定),掩膜低清格
  // y=0 行=图像顶行,翻转后两者对位一致
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
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
  // holofoil 选择性加箔开闸:边缘档恒开(zone=edgeZone,无掩膜依赖);分区档
  // 仅在有掩膜时开(无掩膜=批量/预览分析未完 → uZoneEnabled 缺省 0,zone 恒 1
  // = 全部面选中,与「种子码恢复/随机/批量=全选」语义一致)。掩膜纹理 unit 2
  // 与 textraster 图集互斥——holofoil 无 text 参数。
  const scope = params['uScope'] ?? 0
  const zoneOn = styleDef.id === 'holofoil' && (scope === 1 || (scope === 2 && !!opts.zoneMask))
  if (scope === 2 && opts.zoneMask) {
    uploadZoneMask(renderer, opts.zoneMask)
  }
  if (zoneOn) mergedParams['uZoneEnabled'] = 1
  // 检测步进铁律(票03):按纹理实际分辨率通传 uTexSize;其他风格无此 uniform,
  // setUniform 静默跳过
  const [texW, texH] = renderer.getImageSize()
  if (texW > 0) mergedParams['uTexSize'] = [texW, texH]

  const shaderSources = await Promise.all(styleDef.shaderImports.map((fn) => fn()))

  // tiltshift 专属链: renderMultiPass 的双 FBO ping-pong 表达不了「变尺寸
  // 金字塔 + 深层上下两份独立加轮 + 六纹理合成」,故手排 pass 链
  // (ShaderRenderer.renderToFBO 变尺寸 + renderToCanvas 多纹理上屏)。
  // 中间纹理逐张登记 finally 删除——滑杆拖动逐帧重渲,漏删即显存泄漏。
  if (styleDef.id === 'tiltshift' && renderer && shaderSources.length >= 2) {
    const [dsSrc, compSrc] = shaderSources
    const gl = renderer.getGl()
    const srcTex0 = renderer.getSourceTexture()
    if (srcTex0) {
      const W = canvas.width
      const H = canvas.height
      const temps: WebGLTexture[] = []
      try {
        // 金字塔 L0..L3 = 1/2..1/16(tent 降采样链,uSrcRes 按输入纹理实际尺寸传)
        const dims = [
          [Math.max(1, W >> 1), Math.max(1, H >> 1)],
          [Math.max(1, W >> 2), Math.max(1, H >> 2)],
          [Math.max(1, W >> 3), Math.max(1, H >> 3)],
          [Math.max(1, W >> 4), Math.max(1, H >> 4)],
        ] as const
        const pyr: WebGLTexture[] = []
        let srcTex = srcTex0
        let srcW = W
        let srcH = H
        for (const [w, h] of dims) {
          const t = renderer.renderToFBO(dsSrc, srcTex, { uSrcRes: [srcW, srcH] }, w, h)
          pyr.push(t)
          temps.push(t)
          srcTex = t
          srcW = w
          srcH = h
        }
        // 深层上/下两份独立加轮: 本侧满糊 R% 每 4% 一轮(1-6),两侧解耦
        const deepRounds = (r: number) => Math.max(1, Math.min(6, Math.round(r / 4)))
        const buildDeep = (rounds: number) => {
          const [dw, dh] = dims[3]
          let cur = renderer!.renderToFBO(dsSrc, pyr[3], { uSrcRes: [dw, dh] }, dw, dh)
          temps.push(cur)
          for (let i = 1; i < rounds; i++) {
            const nxt = renderer!.renderToFBO(dsSrc, cur, { uSrcRes: [dw, dh] }, dw, dh)
            temps.push(nxt)
            cur = nxt
          }
          return cur
        }
        const deepTop = buildDeep(deepRounds(mergedParams['uMaxBlurTop'] ?? 6))
        const deepBot = buildDeep(deepRounds(mergedParams['uMaxBlurBottom'] ?? 5))
        renderer.renderToCanvas(compSrc, [
          { sampler: 'uOriginal', texture: srcTex0, unit: 0 },
          { sampler: 'uL0', texture: pyr[0], unit: 1 },
          { sampler: 'uL1', texture: pyr[1], unit: 2 },
          { sampler: 'uL2', texture: pyr[2], unit: 3 },
          { sampler: 'uL3Top', texture: deepTop, unit: 4 },
          { sampler: 'uL3Bot', texture: deepBot, unit: 5 },
        ], mergedParams)
      } finally {
        for (const t of temps) gl.deleteTexture(t)
      }
    }
  } else if (styleDef.isMultiPass && shaderSources.length > 1) {
    renderer.renderMultiPass(shaderSources.map((src) => ({ fragSource: src, uniforms: { ...mergedParams } })))
  } else {
    renderer.useShader(shaderSources[0])
    // 文字图集采样器指向单元 2:sampler 型 uniform 必须用 uniform1i 赋值
    // (setUniform 的 uniform1f 路径对其无效,采样器保持默认值 0,会误采
    // 单元 0 上的原图——textraster 曾因此从未显示过文字)。图集本身已在
    // 上方 bindTexture(tex, 2) 绑定;每次 useShader 重链接后默认值复位,
    // 故必须逐帧重新赋值。
    if (textTextures.length > 0) renderer.setSampler('uCharAtlas', 2)
    if (zoneOn) renderer.setSampler('uZoneMask', 2)
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
