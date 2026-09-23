# 2D 批量图片处理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2D 单图界面调好效果后一键送入批量队列:多图上传、统一种子/每图独立种子、后台顺序处理、结果画廊、ZIP 打包下载。

**Architecture:** 方案 C"调参后送批量"。提炼 App2D.renderWithStyle 为共享渲染核心 `lib/renderImage.ts`(单图与批量共用);批量纯逻辑(`lib/batch/`)与 React 解耦;BatchPanel 为双 tab 浮动面板(复用 useDraggable/panelPosStore);队列逐行处理、逐行让出主线程;fflate 客户端打 ZIP。

**Tech Stack:** React 19 + TypeScript + vitest + fflate(新增依赖)。

**Spec:** `docs/superpowers/specs/2026-09-23-2d-batch-processing-design.md`(执行者必读,本计划从 spec 推导)

## Global Constraints

- UI 图标一律内联 SVG 手绘,禁 emoji(项目规范)。
- lint 基线 11 个预先存在错误(均在 3D 文件),验收标准:不新增错误。
- i18n:所有用户可见文案加进 `src/i18n/zh.json` 与 `en.json` 两个文件(key 对齐)。
- 测试只写 lib 层(vitest),组件不建组件测试基建;渲染调用(WebGL)不进单测。
- 注释风格:中文,解释"为什么"而非"是什么",与现有代码一致。
- 每个任务结束跑 `npm test` 全绿再提交;提交信息结尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 种子语义(来自 spec):种子码 = 风格+数值+颜色 的完整状态串;`SKIP_RANDOM_UNIFORMS = ['uCenterX','uCenterY','uRotation','uAngle']` 随机时跳过;color 随机为均匀 RGB;toggle/select/text/font 不随机、不随种子携带。
- 单批上限 20 行(`BATCH_MAX_ROWS = 20`)。
- 付费预留:`canRunBatch(count)` 当前恒 true(仅要求 count>0 且 ≤ 上限)。

---

### Task 1: 骰子纯函数 `lib/randomSeed.ts`

把 App2D.handleRandom 的随机语义提炼为可注入随机源的纯函数,批量骰子与单图"随机"按钮共用。

**Files:**
- Create: `src/lib/randomSeed.ts`
- Test: `src/lib/randomSeed.test.ts`
- Modify: `src/components/App2D.tsx`(handleRandom 改用共享函数,删本地 SKIP_RANDOM_UNIFORMS)

**Interfaces:**
- Consumes: `encodeSeed(styleId, params, def, textParams)` from `src/lib/seedCodec.ts`;`snapToStep(v,min,max,step,fallback)` from `src/lib/paramValue.ts`
- Produces:
  - `SKIP_RANDOM_UNIFORMS: string[]`
  - `randomizeParams(def: StyleDefinition, baseParams: Record<string, number>, baseTextParams: Record<string, string>, rand?: () => number): { params: Record<string, number>; textParams: Record<string, string> }`
  - `randomSeed(def: StyleDefinition, baseParams: Record<string, number>, baseTextParams: Record<string, string>, rand?: () => number): string`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/randomSeed.test.ts
import { describe, it, expect } from 'vitest'
import { randomizeParams, randomSeed, SKIP_RANDOM_UNIFORMS } from './randomSeed'
import { getStyle } from './StyleRegistry'
import { decodeSeed } from './seedCodec'

const halftone = getStyle('halftone')!
// ascii 有 text/color/font 参数,覆盖全类型分支
const ascii = getStyle('ascii')!

describe('randomizeParams', () => {
  it('numeric 参数落在 min..max 且对齐 step', () => {
    const { params } = randomizeParams(halftone, { uCellSize: 10 }, {}, () => 0.999)
    const p = halftone.params.find((x) => x.uniform === 'uCellSize')!
    expect(params.uCellSize).toBe(p.max)
  })

  it('跳过 SKIP_RANDOM_UNIFORMS 与 toggle/select/text/font', () => {
    const base = { uCellSize: 7, uCaseMode: 1, uShowBg: 0, uCenterX: 0.25 }
    const { params } = randomizeParams(ascii, base, { uCharset: 'ABC' }, () => 0.5)
    expect(params.uCaseMode).toBe(1)      // select 保留
    expect(params.uShowBg).toBe(0)        // toggle 保留
    expect(params.uCenterX).toBe(0.25)    // SKIP 名单保留(若该风格有此参数则必须不动)
  })

  it('color 参数随机为 6 位 hex', () => {
    const { textParams } = randomizeParams(ascii, {}, {}, () => 0)
    expect(textParams.uCharColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('不修改入参对象', () => {
    const base = { uCellSize: 3 }
    randomizeParams(halftone, base, {}, () => 0.5)
    expect(base).toEqual({ uCellSize: 3 })
  })
})

describe('randomSeed', () => {
  it('产出可 decode 回同一风格的合法种子', () => {
    const seed = randomSeed(halftone, { uCellSize: 5 }, {}, () => 0.42)
    const decoded = decodeSeed(seed)
    expect(decoded).not.toBeNull()
    expect(decoded!.styleId).toBe('halftone')
  })
})
```

注:若 ascii 无 `uCenterX`,`params.uCenterX` 断言恒过(基线里预置什么就是什么),测试仍成立——它守护的是"名单内参数绝不被改写"。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/randomSeed.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 最小实现**

```ts
// src/lib/randomSeed.ts
import type { StyleDefinition } from '../types'
import { encodeSeed } from './seedCodec'
import { snapToStep } from './paramValue'

// 这些 uniform 随机会产生不可用结果（居中/旋转类），随机时保持不动
export const SKIP_RANDOM_UNIFORMS = ['uCenterX', 'uCenterY', 'uRotation', 'uAngle']

/** 以 base 为底随机 seedable 参数（toggle/select/text/font 保留现值，color 均匀随机）。 */
export function randomizeParams(
  def: StyleDefinition,
  baseParams: Record<string, number>,
  baseTextParams: Record<string, string>,
  rand: () => number = Math.random,
): { params: Record<string, number>; textParams: Record<string, string> } {
  const params = { ...baseParams }
  const textParams = { ...baseTextParams }
  for (const p of def.params) {
    if (p.type === 'text' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
    if (p.type === 'color') {
      // 均匀随机 RGB（与 3D 随机一致），rand()*2^24 覆盖含 #FFFFFF 的全值域
      textParams[p.uniform] = '#' + Math.floor(rand() * 16777216).toString(16).padStart(6, '0')
      continue
    }
    if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) continue
    const raw = p.min + rand() * (p.max - p.min)
    // 相对 min 对齐 + clamp + 修浮点尾——与手输路径共用同一把 snapToStep 尺子
    params[p.uniform] = snapToStep(raw, p.min, p.max, p.step, p.default)
  }
  return { params, textParams }
}

/** 随机后直接编码为种子码（批量骰子用）。 */
export function randomSeed(
  def: StyleDefinition,
  baseParams: Record<string, number>,
  baseTextParams: Record<string, string>,
  rand: () => number = Math.random,
): string {
  const r = randomizeParams(def, baseParams, baseTextParams, rand)
  return encodeSeed(def.id, r.params, def, r.textParams)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/randomSeed.test.ts`
Expected: PASS

- [ ] **Step 5: App2D.handleRandom 改用共享函数**

`src/components/App2D.tsx`:删除第 24-25 行的 `const SKIP_RANDOM_UNIFORMS = [...]` 定义与 import 中不再需要的 `snapToStep`(若仅 handleRandom 使用);`handleRandom` 整体替换为:

```ts
  const handleRandom = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    if (!styleDef) return
    const r = randomizeParams(styleDef, params, textParams)
    setParams(r.params)
    setTextParams(r.textParams)
  }, [activeStyle, params, textParams])
```

顶部加 `import { randomizeParams } from '../lib/randomSeed'`。

- [ ] **Step 6: 全量测试 + 手测等价性 + 提交**

Run: `npm test` → 全绿(既有 11 lint 错误无关;跑 `npm run lint` 确认无新增)。
手测:单图界面 halftone 与 ascii 各点几次"随机",行为与之前一致(数值参数变、toggle/字符集不动)。

```bash
git add src/lib/randomSeed.ts src/lib/randomSeed.test.ts src/components/App2D.tsx
git commit -m "refactor: extract randomizeParams for shared random logic

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 共享渲染核心 `lib/renderImage.ts`

把 App2D.renderWithStyle 的渲染逻辑参数化为自由函数;纯计算部分拆出 `buildRenderParams` 单测。

**Files:**
- Create: `src/lib/renderImage.ts`
- Test: `src/lib/renderImage.test.ts`
- Modify: `src/components/App2D.tsx`(renderWithStyle 变薄壳;下载路径改用共享导出函数)

**Interfaces:**
- Consumes: `hexToRgb` from `paramValue.ts`;`ShaderRenderer`、`AsciiCanvasRenderer` 的现有实例方法
- Produces:
  - `buildRenderParams(styleDef: StyleDefinition, params: Record<string, number>, textParams: Record<string, string>, brightest: { x: number; y: number } | null): Record<string, number>`
  - `renderImage(opts: { canvas: HTMLCanvasElement; asciiCanvas: HTMLCanvasElement; renderer: ShaderRenderer; asciiRenderer: AsciiCanvasRenderer; image: HTMLImageElement; styleDef: StyleDefinition; params: Record<string, number>; textParams: Record<string, string>; fontParams: Record<string, FontFace | null>; brightest: { x: number; y: number } | null }): Promise<void>`
  - `exportCanvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg'): Promise<Blob | null>`(toBlob 的 promise 化)
  - `exportJpgWithBlackBg(source: HTMLCanvasElement): Promise<Blob | null>`(JPG 无 alpha,黑底合成)

- [ ] **Step 1: 写 buildRenderParams 失败测试**

```ts
// src/lib/renderImage.test.ts
import { describe, it, expect } from 'vitest'
import { buildRenderParams } from './renderImage'
import { getStyle } from './StyleRegistry'

const ascii = getStyle('ascii')!

describe('buildRenderParams', () => {
  it('color 参数拆 R/G/B(0..1 浮点)并入 merged', () => {
    const m = buildRenderParams(ascii, { uCellSize: 5 }, { uCharColor: '#ff8000' }, null)
    expect(m.uCellSize).toBe(5)
    expect(m.uCharColorR).toBeCloseTo(1)
    expect(m.uCharColorG).toBeCloseTo(0x80 / 255)
    expect(m.uCharColorB).toBe(0)
  })

  it('color 缺值回退 default', () => {
    const m = buildRenderParams(ascii, {}, {}, null)
    const d = ascii.params.find((p) => p.type === 'color') as { uniform: string; default: string }
    expect(m[`${d.uniform}R`).toString()).toBeTruthy()
  })

  it('uGodRayAuto=1 且有 brightest 时覆盖中心;无 brightest 不覆盖', () => {
    const base = { uGodRayAuto: 1, uCenterX: 0, uCenterY: 0 }
    const a = buildRenderParams(ascii, { ...base }, {}, { x: 0.3, y: -0.2 })
    expect(a.uCenterX).toBe(0.3)
    expect(a.uCenterY).toBe(-0.2)
    const b = buildRenderParams(ascii, { ...base }, {}, null)
    expect(b.uCenterX).toBe(0)
  })

  it('uGodRayAuto 非 1 时不覆盖(uGodRayAuto 键不存在也安全)', () => {
    const m = buildRenderParams(ascii, { uCenterX: 0.5 }, {}, { x: 0.9, y: 0.9 })
    expect(m.uCenterX).toBe(0.5)
  })

  it('不修改入参 params', () => {
    const base = { uCellSize: 5 }
    buildRenderParams(ascii, base, { uCharColor: '#ffffff' }, null)
    expect(base).toEqual({ uCellSize: 5 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/renderImage.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 renderImage.ts**

```ts
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
  renderer: ShaderRenderer
  asciiRenderer: AsciiCanvasRenderer
  image: HTMLImageElement
  styleDef: StyleDefinition
  params: Record<string, number>
  textParams: Record<string, string>
  fontParams: Record<string, FontFace | null>
  brightest: BrightestPoint | null
}

/** 渲染一张图到给定 canvas(shader)或 asciiCanvas(canvas2d)。与原 renderWithStyle 逐行等价。 */
export async function renderImage(opts: RenderImageOpts): Promise<void> {
  const { canvas, asciiCanvas, renderer, asciiRenderer, image, styleDef, params, textParams, fontParams, brightest } = opts

  // canvas2d 分支(ASCII)必须先于 WebGL 文字纹理块 return
  if (styleDef.renderMode === 'canvas2d') {
    asciiRenderer.render(asciiCanvas, image, {
      charset: textParams['uCharset'] ?? '',
      caseMode: params['uCaseMode'] ?? 0,
      charColor: textParams['uCharColor'] ?? '#0af5a7',
      showBg: params['uShowBg'] ?? 1,
      charScale: params['uCharScale'] ?? 0.85,
      cellSize: params['uCellSize'] ?? 14,
      randomScale: params['uRandomScale'] ?? 0.55,
      bgFilter: params['uBgFilter'] ?? 0.07,
    }, fontParams['uFont'] ?? null)
    return
  }

  const textTextures: WebGLTexture[] = []
  const textParamDefs = styleDef.params.filter((p): p is typeof p & { type: 'text' } => p.type === 'text')
  let atlasCount = 0
  for (const tp of textParamDefs) {
    const text = textParams[tp.uniform] || tp.textDefault
    const fontSize = params['uFontSize'] || 24
    // 图集按码点切字且超宽整体缩放,uAtlasCount 必须等于图集真实格数
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
    // 采样器必须逐帧重新赋值:useShader 重链接后默认值复位会误采单元 0 的原图
    if (textTextures.length > 0) renderer.setSampler('uCharAtlas', 2)
    renderer.setUniform('uResolution', [canvas.width, canvas.height])
    for (const [key, val] of Object.entries(mergedParams)) {
      renderer.setUniform(key, val)
    }
    renderer.render()
  }

  for (const tex of textTextures) {
    const gl = renderer.getGl()
    if (gl) gl.deleteTexture(tex)
  }
}

/** toBlob 的 promise 化。 */
export function exportCanvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg'): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type))
}

/** JPG 无 alpha:先合成黑底(背景关闭时 ASCII 透明区域否则变白)。 */
export async function exportJpgWithBlackBg(source: HTMLCanvasElement): Promise<Blob | null> {
  const tmp = document.createElement('canvas')
  tmp.width = source.width
  tmp.height = source.height
  const ctx = tmp.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(source, 0, 0)
  return exportCanvasBlob(tmp, 'image/jpeg')
}
```

注意:原 App2D ascii 分支的 console.warn 守卫(aCanvas 挂载检查)留在 App2D 薄壳里(组件层关心挂载,lib 层收到即渲染)。AsciiCanvasRenderer.render 的 opts 字段名以 `src/lib/AsciiCanvasRenderer.ts:61` 签名为准,如与上面字段名有出入,以实际签名为准并保持 App2D 原传值不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/renderImage.test.ts`
Expected: PASS

- [ ] **Step 5: App2D.renderWithStyle 改薄壳**

`renderWithStyle` 整体替换为:

```ts
  const renderWithStyle = useCallback(
    async (styleId: StyleId, currentParams: Record<string, number>, currentTextParams: Record<string, string>, currentFontParams: Record<string, FontFace | null>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const styleDef = getStyle(styleId)
      if (!styleDef) return
      if (styleDef.renderMode === 'canvas2d') {
        if (!image || !asciiCanvasRef.current) return
        if (!asciiRendererRef.current) asciiRendererRef.current = new AsciiCanvasRenderer()
        await renderImage({ canvas, asciiCanvas: asciiCanvasRef.current, renderer: null as unknown as ShaderRenderer, asciiRenderer: asciiRendererRef.current, image, styleDef, params: currentParams, textParams: currentTextParams, fontParams: currentFontParams, brightest })
        return
      }
      const renderer = rendererRef.current
      if (!renderer) return
      if (!asciiRendererRef.current) asciiRendererRef.current = new AsciiCanvasRenderer()
      await renderImage({ canvas, asciiCanvas: asciiCanvasRef.current ?? document.createElement('canvas'), renderer, asciiRenderer: asciiRendererRef.current, image: image!, styleDef, params: currentParams, textParams: currentTextParams, fontParams: currentFontParams, brightest })
    },
    [image, brightest],
  )
```

⚠️ 上面 `null as unknown as ShaderRenderer` 不可取——改为让 `RenderImageOpts.renderer` 类型为 `ShaderRenderer | null` 并在 renderImage 内 shader 分支开头 `if (!renderer) return`(与原逻辑"shader 分支 renderer required"一致)。同时 `image` 在 shader 分支为必需:原逻辑 renderer.loadImage 已在 effect 中加载过图片,shader 分支不直接用 image——把 `RenderImageOpts.image` 类型放宽为 `HTMLImageElement | null`,canvas2d 分支开头 `if (!image) return`。修正 renderImage.ts 相应两处守卫,再写薄壳:

```ts
  const renderWithStyle = useCallback(
    async (styleId: StyleId, currentParams: Record<string, number>, currentTextParams: Record<string, string>, currentFontParams: Record<string, FontFace | null>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const styleDef = getStyle(styleId)
      if (!styleDef) return
      if (!asciiRendererRef.current) asciiRendererRef.current = new AsciiCanvasRenderer()
      await renderImage({
        canvas,
        asciiCanvas: asciiCanvasRef.current ?? document.createElement('canvas'),
        renderer: rendererRef.current,
        asciiRenderer: asciiRendererRef.current,
        image,
        styleDef,
        params: currentParams,
        textParams: currentTextParams,
        fontParams: currentFontParams,
        brightest,
      })
    },
    [image, brightest],
  )
```

renderImage.ts 对应调整:`renderer: ShaderRenderer | null`、`image: HTMLImageElement | null`;canvas2d 分支开头 `if (!image) return`;shader 分支 `if (!renderer) return`(放在 text texture 生成前,与原顺序一致:原代码 canvas2d → renderer null 检查 → text textures)。同时更新本文件 Step 3 代码为调整后版本再落盘。

- [ ] **Step 6: App2D 下载路径改用共享导出函数**

`handleDownloadJpg` 中黑底合成段替换为:

```ts
    if (styleDef?.renderMode === 'canvas2d' && showBg !== 1) {
      const src = getExportCanvas()
      if (!src) return
      const b = await exportJpgWithBlackBg(src)
      downloadBlob(b, 'jpg')
      return
    }
```

`handleDownloadPng` 改为 `const b = await exportCanvasBlob(getExportCanvas()!, 'image/png'); downloadBlob(b, 'png')`(先判空)。import 相应从 `../lib/renderImage` 引入。

- [ ] **Step 7: 全量测试 + 12 风格手测 + 提交**

Run: `npm test` → 全绿;`npm run lint` → 不超过基线 11 错误。
手测(浏览器 `npm run dev`):依次切到全部 12 个风格(halftone/diffusion/popart/lightshadow/sketch/pointillism/kaleidoscope/crosshatch/animelight/textraster/ascii 及任一遗漏项),每个:调 2-3 个参数确认实时重绘正常、PNG/JPG(canvas2d 再加 SVG)导出可打开。animelight 开自动光源确认亮点跟踪。

```bash
git add src/lib/renderImage.ts src/lib/renderImage.test.ts src/components/App2D.tsx
git commit -m "refactor: extract shared render core from App2D.renderWithStyle

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 批量任务模型 `lib/batch/batchJob.ts`

纯逻辑:类型、种子解析为行渲染状态、ZIP 命名与冲突、格式回退、门槛。

**Files:**
- Create: `src/lib/batch/batchJob.ts`
- Test: `src/lib/batch/batchJob.test.ts`

**Interfaces:**
- Consumes: `decodeSeed` from `seedCodec`;`getStyle` from `StyleRegistry`;`mergeWithDefaults(def, params, textParams)` from `presetStore`
- Produces:
  - `BatchFormat = 'png' | 'jpg' | 'svg'`;`BatchRowStatus = 'pending' | 'processing' | 'done' | 'failed'`
  - `interface BatchBaseline { styleId: StyleId; params: Record<string, number>; textParams: Record<string, string>; fontParams: Record<string, FontFace | null> }`
  - `interface BatchRow { id: string; fileName: string; image: HTMLImageElement; seedOverride: string | null; status: BatchRowStatus; blob: Blob | null; objectUrl: string | null; error: string | null }`
  - `interface BatchJob { baseline: BatchBaseline; unifiedSeed: string; seedMode: 'unified' | 'perImage'; format: BatchFormat; rows: BatchRow[] }`
  - `BATCH_MAX_ROWS = 20`
  - `resolveRowRenderState(baseline: BatchBaseline, seedCode: string): { styleId: StyleId; params: Record<string, number>; textParams: Record<string, string> } | null`
  - `rowSeed(job: BatchJob, row: BatchRow): string`
  - `effectiveFormat(styleId: StyleId, format: BatchFormat): BatchFormat`(svg 仅 canvas2d 行有效,否则回退 png)
  - `zipEntryName(styleId: string, fileName: string, seed: string, ext: string): string`(`{styleId}_{去扩展名}_{seed}.{ext}`)
  - `dedupeName(name: string, taken: Set<string>): string`(冲突加 ` (2)` 递增)
  - `canRunBatch(count: number): boolean`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/batch/batchJob.test.ts
import { describe, it, expect } from 'vitest'
import {
  BATCH_MAX_ROWS, canRunBatch, dedupeName, effectiveFormat,
  resolveRowRenderState, rowSeed, zipEntryName,
  type BatchJob, type BatchRow,
} from './batchJob'
import { getStyle } from '../StyleRegistry'

const baseline = {
  styleId: 'halftone' as const,
  params: { uCellSize: 9 },
  textParams: {},
  fontParams: {},
}

describe('resolveRowRenderState', () => {
  it('合法种子:seedable 项被种子覆盖,其余走基线', () => {
    // 用 encodeSeed 造一个 uCellSize=max 的种子
    const { encodeSeed } = await import('../seedCodec')
    const def = getStyle('halftone')!
    const p = def.params.find((x) => x.uniform === 'uCellSize') as { min: number; max: number }
    const seed = encodeSeed('halftone', { uCellSize: p.max }, def, {})
    const st = resolveRowRenderState(baseline, seed)!
    expect(st.styleId).toBe('halftone')
    expect(st.params.uCellSize).toBe(p.max)
  })

  it('非法种子返回 null', () => {
    expect(resolveRowRenderState(baseline, 'zz')).toBeNull()
    expect(resolveRowRenderState(baseline, '')).toBeNull()
  })

  it('种子携带其他风格时跟随种子的 styleId', () => {
    const { encodeSeed } = await import('../seedCodec')
    const seed = encodeSeed('popart', {}, getStyle('popart')!, {})
    const st = resolveRowRenderState(baseline, seed)!
    expect(st.styleId).toBe('popart')
  })
})

describe('rowSeed', () => {
  const job = { baseline, unifiedSeed: '0A1', seedMode: 'unified', format: 'png', rows: [] } as BatchJob
  const row = { id: 'r1', seedOverride: null } as BatchRow
  it('override 优先,否则统一值', () => {
    expect(rowSeed(job, row)).toBe('0A1')
    expect(rowSeed(job, { ...row, seedOverride: '9z' })).toBe('9z')
  })
})

describe('effectiveFormat', () => {
  it('svg 仅 canvas2d 风格有效,其余回退 png', () => {
    expect(effectiveFormat('ascii', 'svg')).toBe('svg')
    expect(effectiveFormat('halftone', 'svg')).toBe('png')
    expect(effectiveFormat('halftone', 'jpg')).toBe('jpg')
  })
})

describe('命名', () => {
  it('zipEntryName 去掉原扩展名', () => {
    expect(zipEntryName('halftone', 'cake.jpg', 'Ab3', 'png')).toBe('halftone_cake_Ab3.png')
    expect(zipEntryName('halftone', 'noext', 'Ab3', 'png')).toBe('halftone_noext_Ab3.png')
  })
  it('dedupeName 冲突递增后缀', () => {
    const taken = new Set(['a.png'])
    expect(dedupeName('a.png', taken)).toBe('a (2).png')
    taken.add('a (2).png')
    expect(dedupeName('a.png', taken)).toBe('a (3).png')
    expect(dedupeName('b.png', taken)).toBe('b.png')
  })
})

describe('canRunBatch', () => {
  it('1..MAX 为 true,0 与超限为 false', () => {
    expect(canRunBatch(1)).toBe(true)
    expect(canRunBatch(BATCH_MAX_ROWS)).toBe(true)
    expect(canRunBatch(0)).toBe(false)
    expect(canRunBatch(BATCH_MAX_ROWS + 1)).toBe(false)
  })
})
```

注意:vitest 的顶层 `await import` 写法在 describe 回调内不合法——把 `encodeSeed` 改为文件顶部静态 `import { encodeSeed } from '../seedCodec'`,测试内直接用。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/batch/batchJob.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

```ts
// src/lib/batch/batchJob.ts
// 批量任务的纯逻辑:行状态模型、种子→渲染状态解析、导出命名。
// 不依赖 React/DOM 渲染,便于单测;组件与队列执行器(runBatch)共用。
import type { StyleId } from '../../types'
import { decodeSeed } from '../seedCodec'
import { getStyle } from '../StyleRegistry'
import { mergeWithDefaults } from '../presetStore'

export type BatchFormat = 'png' | 'jpg' | 'svg'
export type BatchRowStatus = 'pending' | 'processing' | 'done' | 'failed'

/** 送入批量时的完整状态快照(种子不携带 text/font/toggle/select,这些走基线)。 */
export interface BatchBaseline {
  styleId: StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  fontParams: Record<string, FontFace | null>
}

export interface BatchRow {
  id: string
  fileName: string
  image: HTMLImageElement
  /** null=跟随统一种子;画廊"重骰"后为独立值,不再跟随统一 */
  seedOverride: string | null
  status: BatchRowStatus
  blob: Blob | null
  objectUrl: string | null
  error: string | null
}

export interface BatchJob {
  baseline: BatchBaseline
  unifiedSeed: string
  seedMode: 'unified' | 'perImage'
  format: BatchFormat
  rows: BatchRow[]
}

/** 单批硬上限:每行持有原图引用+结果 blob,控制峰值内存。后期付费提额的杠杆之一。 */
export const BATCH_MAX_ROWS = 20

/** 付费预留:当前恒放行(仅校验数量),后期在此接授权/配额。 */
export function canRunBatch(count: number): boolean {
  return count > 0 && count <= BATCH_MAX_ROWS
}

/** 种子→行渲染状态。与 App2D.handleApplySeed 同语义:decode 产出以目标风格
 *  默认值为底合并;基线参数打底保证 toggle/select 等(种子不携带项)延续调参现场。
 *  种子携带其他风格时跟随种子(种子是完整状态)。非法返回 null。 */
export function resolveRowRenderState(
  baseline: BatchBaseline,
  seedCode: string,
): { styleId: StyleId; params: Record<string, number>; textParams: Record<string, string> } | null {
  const decoded = decodeSeed(seedCode)
  if (!decoded) return null
  const def = getStyle(decoded.styleId)
  if (!def) return null
  const merged = mergeWithDefaults(
    def,
    { ...baseline.params, ...decoded.params },
    { ...baseline.textParams, ...decoded.colorParams },
  )
  return { styleId: decoded.styleId, params: merged.params, textParams: merged.textParams }
}

export function rowSeed(job: BatchJob, row: BatchRow): string {
  return row.seedOverride ?? job.unifiedSeed
}

/** SVG 导出仅对 canvas2d(ASCII)风格有意义;行种子切到 shader 风格时回退 png。 */
export function effectiveFormat(styleId: StyleId, format: BatchFormat): BatchFormat {
  if (format !== 'svg') return format
  return getStyle(styleId)?.renderMode === 'canvas2d' ? 'svg' : 'png'
}

/** {styleId}_{原文件名去扩展}_{种子码}.{ext} */
export function zipEntryName(styleId: string, fileName: string, seed: string, ext: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  return `${styleId}_${base}_${seed}.${ext}`
}

/** 同名冲突加 " (n)" 递增(同图同种子跑两次的场景)。 */
export function dedupeName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot < 0 ? name : name.slice(0, dot)
  const ext = dot < 0 ? '' : name.slice(dot)
  let i = 2
  while (taken.has(`${stem} (${i})${ext}`)) i++
  return `${stem} (${i})${ext}`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/batch/batchJob.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/batch/batchJob.ts src/lib/batch/batchJob.test.ts
git commit -m "feat: add batch job model with seed resolution and zip naming

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 队列执行器与 ZIP `lib/batch/runBatch.ts`

可注入渲染任务的顺序队列(测试注入假任务)+ 真实离屏渲染任务 + fflate 打包。

**Files:**
- Modify: `package.json`(新增 fflate 依赖)
- Create: `src/lib/batch/runBatch.ts`
- Test: `src/lib/batch/runBatch.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `renderImage/exportCanvasBlob/exportJpgWithBlackBg`;Task 3 全部;`findBrightestPoint` from `brightPoint.ts`;`AsciiCanvasRenderer`、`ShaderRenderer`
- Produces:
  - `interface RenderTask { row: BatchRow; styleId: StyleId; params: Record<string, number>; textParams: Record<string, string>; format: BatchFormat }`
  - `type RenderTaskFn = (t: RenderTask) => Promise<Blob>`
  - `createBatchRunner(renderTask: RenderTaskFn): { run(job: BatchJob, cb: { onRowUpdate: (id: string, patch: Partial<BatchRow>) => void }): Promise<void>; cancel(): void }` — run 只处理 pending/failed 行,失败标 failed 不阻塞;cancel 后当前行完成即停(剩余保持 pending);run 可重复调用(追加行后 drain)
  - `createCanvasRenderTask(baseline: BatchBaseline): RenderTaskFn` — 离屏渲染真实实现
  - `buildBatchZip(entries: { name: string; blob: Blob }[]): Promise<Blob>`

- [ ] **Step 1: 安装 fflate**

```bash
npm install fflate
```

- [ ] **Step 2: 写失败测试**

```ts
// src/lib/batch/runBatch.test.ts
import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import { createBatchRunner, buildBatchZip } from './runBatch'
import type { BatchJob, BatchRow } from './batchJob'

function mkRow(id: string, status: BatchRow['status'] = 'pending'): BatchRow {
  return { id, fileName: `${id}.jpg`, image: {} as HTMLImageElement, seedOverride: null, status, blob: null, objectUrl: null, error: null }
}
function mkJob(rows: BatchRow[]): BatchJob {
  return { baseline: { styleId: 'halftone', params: {}, textParams: {}, fontParams: {} }, unifiedSeed: '00', seedMode: 'unified', format: 'png', rows }
}

describe('createBatchRunner', () => {
  it('顺序处理 pending 行并通过 onRowUpdate 上报', async () => {
    const events: Array<[string, string]> = []
    const job = mkJob([mkRow('a'), mkRow('b'), mkRow('c', 'done')])
    const runner = createBatchRunner(async (t) => new Blob([t.row.id]))
    await runner.run(job, { onRowUpdate: (id, p) => events.push([id, p.status!]) })
    // done 行不重跑;a、b 各经历 processing→done
    expect(events).toEqual([['a', 'processing'], ['a', 'done'], ['b', 'processing'], ['b', 'done']])
  })

  it('单行失败不阻塞后续行', async () => {
    const job = mkJob([mkRow('a'), mkRow('b')])
    const runner = createBatchRunner(async (t) => {
      if (t.row.id === 'a') throw new Error('boom')
      return new Blob(['ok'])
    })
    const statuses: Record<string, string> = {}
    await runner.run(job, { onRowUpdate: (id, p) => { if (p.status) statuses[id] = p.status } })
    expect(statuses['a']).toBe('failed')
    expect(statuses['b']).toBe('done')
  })

  it('cancel 后当前行完成即停,剩余行保持 pending', async () => {
    const job = mkJob([mkRow('a'), mkRow('b'), mkRow('c')])
    const runner = createBatchRunner(async (t) => {
      if (t.row.id === 'a') runner.cancel()   // a 处理中取消
      return new Blob(['x'])
    })
    const statuses: Record<string, string> = {}
    await runner.run(job, { onRowUpdate: (id, p) => { if (p.status) statuses[id] = p.status } })
    expect(statuses['a']).toBe('done')     // 当前行跑完
    expect(statuses['b']).toBeUndefined()  // 未启动
    expect(job.rows[1].status).toBe('pending')
  })

  it('失败行的 error 写入 patch', async () => {
    const job = mkJob([mkRow('a')])
    const runner = createBatchRunner(async () => { throw new Error('boom') })
    let err: string | null = null
    await runner.run(job, { onRowUpdate: (_id, p) => { err = p.error ?? null } })
    expect(err).toBeTruthy()
  })
})

describe('buildBatchZip', () => {
  it('打出的 zip 可解回且内容一致', async () => {
    const zip = await buildBatchZip([
      { name: 'halftone_a_00.png', blob: new Blob([new Uint8Array([1, 2, 3])]) },
      { name: 'halftone_b_01.png', blob: new Blob([new Uint8Array([9]])] },
    ])
    const buf = new Uint8Array(await zip.arrayBuffer())
    const out = unzipSync(buf)
    expect(Object.keys(out).sort()).toEqual(['halftone_a_00.png', 'halftone_b_01.png'])
    expect(Array.from(out['halftone_a_00.png'])).toEqual([1, 2, 3])
  })
})
```

Blob 在 Node(vitest)环境可用(Node 18+)。若 `arrayBuffer` 类型报错,用 `new Response(zip).arrayBuffer()`。

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/lib/batch/runBatch.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现**

```ts
// src/lib/batch/runBatch.ts
// 批量队列执行器:顺序处理、逐行让出主线程(处理期间单图界面仍可流畅调参)、
// 失败不阻塞、可取消。renderTask 可注入——单测注入假任务,生产用离屏渲染。
import { zipSync, strToU8 } from 'fflate'
import { ShaderRenderer } from '../ShaderRenderer'
import { AsciiCanvasRenderer } from '../AsciiCanvasRenderer'
import { findBrightestPoint } from '../brightPoint'
import { renderImage, exportCanvasBlob, exportJpgWithBlackBg } from '../renderImage'
import { getStyle } from '../StyleRegistry'
import { resolveRowRenderState, rowSeed, effectiveFormat, type BatchBaseline, type BatchFormat, type BatchJob, type BatchRow } from './batchJob'

export interface RenderTask {
  row: BatchRow
  styleId: BatchRow extends never ? never : import('../../types').StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  format: BatchFormat
}
export type RenderTaskFn = (t: RenderTask) => Promise<Blob>

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function createBatchRunner(renderTask: RenderTaskFn) {
  let cancelled = false
  async function run(job: BatchJob, cb: { onRowUpdate: (id: string, patch: Partial<BatchRow>) => void }): Promise<void> {
    cancelled = false
    // 快照待处理行:run 期间 rows 追加不影响本轮,后续 run 再 drain
    const queue = job.rows.filter((r) => r.status === 'pending' || r.status === 'failed')
    for (const row of queue) {
      if (cancelled) break
      cb.onRowUpdate(row.id, { status: 'processing', error: null })
      await nextFrame()   // 行处理前让出一帧,UI 先绘出 processing 态
      try {
        const state = resolveRowRenderState(job.baseline, rowSeed(job, row))
        if (!state) throw new Error('invalid seed')
        const blob = await renderTask({ row, ...state, format: effectiveFormat(state.styleId, job.format) })
        cb.onRowUpdate(row.id, { status: 'done', blob })
      } catch (e) {
        cb.onRowUpdate(row.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  return { run, cancel: () => { cancelled = true } }
}

/** 离屏渲染任务:懒建 renderer,行间复用;异常时销毁重建(WebGL context lost 自愈)。 */
export function createCanvasRenderTask(baseline: BatchBaseline): RenderTaskFn {
  let renderer: ShaderRenderer | null = null
  let asciiRenderer: AsciiCanvasRenderer | null = null
  let canvas: HTMLCanvasElement | null = null
  let asciiCanvas: HTMLCanvasElement | null = null

  const reset = () => {
    try { renderer?.destroy() } catch { /* context 已 lost 时 destroy 可能抛错 */ }
    renderer = null
    asciiRenderer = null
    canvas = null
    asciiCanvas = null
  }

  return async (t) => {
    const def = getStyle(t.styleId)
    if (!def) throw new Error(`unknown style ${t.styleId}`)
    const isCanvas2d = def.renderMode === 'canvas2d'
    if (!asciiRenderer) asciiRenderer = new AsciiCanvasRenderer()
    if (isCanvas2d && !asciiCanvas) asciiCanvas = document.createElement('canvas')
    if (!isCanvas2d && !renderer) {
      canvas = document.createElement('canvas')
      renderer = new ShaderRenderer(canvas)
    }
    if (!isCanvas2d) renderer!.loadImage(t.row.image)

    // animelight 自动光源:逐图检测(每图最亮点不同)
    let brightest: { x: number; y: number } | null = null
    try {
      const THUMB = 32
      const nw = t.row.image.naturalWidth || t.row.image.width
      const nh = t.row.image.naturalHeight || t.row.image.height
      const s = Math.min(1, THUMB / Math.max(nw, nh))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(nw * s))
      c.height = Math.max(1, Math.round(nh * s))
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(t.row.image, 0, 0, c.width, c.height)
        brightest = findBrightestPoint(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
      }
    } catch { /* 跨域等失败回落默认光源 */ }

    try {
      await renderImage({
        canvas: canvas ?? document.createElement('canvas'),
        asciiCanvas: asciiCanvas ?? document.createElement('canvas'),
        renderer,
        asciiRenderer,
        image: t.row.image,
        styleDef: def,
        params: t.params,
        textParams: t.textParams,
        fontParams: baseline.fontParams,
        brightest,
      })
      const out = isCanvas2d ? asciiCanvas! : canvas!
      if (t.format === 'svg') {
        const family = baseline.fontParams['uFont']?.family ?? 'monospace'
        return new Blob([asciiRenderer.exportSvg(family)], { type: 'image/svg+xml' })
      }
      if (t.format === 'jpg') {
        const showBg = t.params['uShowBg'] ?? 1
        if (isCanvas2d && showBg !== 1) return exportJpgWithBlackBg(out)
        return exportCanvasBlob(out, 'image/jpeg')
      }
      return exportCanvasBlob(out, 'image/png')
    } catch (e) {
      reset()   // 渲染中途失败大概率是 context lost,重建以自愈
      throw e
    }
  }
}

/** fflate 打包。 */
export async function buildBatchZip(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  for (const e of entries) {
    files[e.name] = new Uint8Array(await e.blob.arrayBuffer())
  }
  return new Blob([zipSync(files)], { type: 'application/zip' })
}
```

注意 `RenderTask.styleId` 直接写 `import('../../types').StyleId` 太绕,改为文件顶部 `import type { StyleId } from '../../types'` 然后 `styleId: StyleId`。`strToU8` 未用到则从 import 中删掉。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/lib/batch/runBatch.test.ts`
Expected: PASS(4 runner 用例 + 1 zip 用例)

- [ ] **Step 6: 全量测试 + 提交**

Run: `npm test`;`npm run lint` 不超基线。

```bash
git add package.json package-lock.json src/lib/batch/runBatch.ts src/lib/batch/runBatch.test.ts
git commit -m "feat: add batch queue runner with injectable render task and zip

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 灯箱 `components/Lightbox.tsx`

纯 UI 组件,无组件测试(项目无此基建),lint 通过 + 手测。

**Files:**
- Create: `src/components/Lightbox.tsx`
- Modify: `src/i18n/zh.json`、`src/i18n/en.json`(key 见 Step 1)

**Interfaces:**
- Produces: `interface LightboxItem { objectUrl: string; fileName: string; seed: string; ext: string }`;`function Lightbox({ items, index, onClose, onNavigate }: { items: LightboxItem[]; index: number; onClose: () => void; onNavigate: (index: number) => void }): JSX.Element`

- [ ] **Step 1: 加 i18n key**

`zh.json` 顶层对象内(与既有 key 平级,找 `export` 或 `common` 段落附近插入):

```json
  "batch": {
    "title": "批量处理",
    "tabConfig": "配置",
    "tabResults": "结果",
    "add": "添加图片",
    "format": "格式",
    "seedModeUnified": "统一种子",
    "seedModePerImage": "每图独立",
    "unifiedSeed": "统一种子",
    "randomizeAll": "全部随机",
    "start": "开始处理 ({{n}})",
    "limitReached": "最多 {{n}} 张",
    "remove": "移除",
    "processing": "处理中 {{done}}/{{total}}",
    "failedCount": "失败 {{n}}",
    "retry": "重试",
    "reroll": "换效果重跑",
    "downloadZip": "打包下载 ZIP ({{n}})",
    "downloadOne": "下载",
    "closeConfirm": "正在处理中,关闭将终止任务并丢弃结果。确定关闭?",
    "replaceBaseline": "批量面板已打开,用当前状态替换批量基线?(已生成结果保留,重跑后生效)",
    "invalidSeed": "种子码无效",
    "uploadFailed": "{{name}} 无法解码",
    "pending": "待处理",
    "empty": "还没有图片,点击上方添加",
    "baselineStyle": "基线风格"
  }
```

`en.json` 同结构:

```json
  "batch": {
    "title": "Batch",
    "tabConfig": "Setup",
    "tabResults": "Results",
    "add": "Add images",
    "format": "Format",
    "seedModeUnified": "Same seed",
    "seedModePerImage": "Per image",
    "unifiedSeed": "Shared seed",
    "randomizeAll": "Randomize all",
    "start": "Process ({{n}})",
    "limitReached": "Limit {{n}} images",
    "remove": "Remove",
    "processing": "Processing {{done}}/{{total}}",
    "failedCount": "{{n}} failed",
    "retry": "Retry",
    "reroll": "Reroll",
    "downloadZip": "Download ZIP ({{n}})",
    "downloadOne": "Download",
    "closeConfirm": "A job is running. Closing cancels it and discards results. Continue?",
    "replaceBaseline": "Batch panel is open. Replace its baseline with current state? (Existing results kept until rerun)",
    "invalidSeed": "Invalid seed",
    "uploadFailed": "Could not decode {{name}}",
    "pending": "Pending",
    "empty": "No images yet — add some above",
    "baselineStyle": "Baseline style"
  }
```

- [ ] **Step 2: 实现 Lightbox**

```tsx
// src/components/Lightbox.tsx
import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export interface LightboxItem {
  objectUrl: string
  fileName: string
  seed: string
  ext: string
}

/** 结果灯箱:全屏遮罩大图,←/→ 导航,Esc 关闭。 */
function Lightbox({ items, index, onClose, onNavigate }: {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const { t } = useTranslation()

  const nav = useCallback((d: number) => {
    onNavigate((index + d + items.length) % items.length)
  }, [index, items.length, onNavigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') nav(-1)
      else if (e.key === 'ArrowRight') nav(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, onClose])

  if (items.length === 0) return null
  const cur = items[Math.min(index, items.length - 1)]

  return (
    <div className="batch-lightbox" onClick={onClose}>
      <button className="batch-lightbox-close" onClick={onClose} aria-label="close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {items.length > 1 && (
        <>
          <button className="batch-lightbox-nav batch-lightbox-nav--prev" onClick={(e) => { e.stopPropagation(); nav(-1) }} aria-label="previous">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button className="batch-lightbox-nav batch-lightbox-nav--next" onClick={(e) => { e.stopPropagation(); nav(1) }} aria-label="next">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </>
      )}
      <div className="batch-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <img src={cur.objectUrl} alt={cur.fileName} />
        <div className="batch-lightbox-info">{cur.fileName} · {cur.seed} · {cur.ext.toUpperCase()}</div>
      </div>
    </div>
  )
}

export default Lightbox
```

- [ ] **Step 3: lint + 提交**

Run: `npx eslint src/components/Lightbox.tsx src/i18n/zh.json src/i18n/en.json` → 无错误。

```bash
git add src/components/Lightbox.tsx src/i18n/zh.json src/i18n/en.json
git commit -m "feat: add lightbox component and batch i18n strings

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: BatchPanel 配置 tab(上传/种子策略/开始处理)

**Files:**
- Create: `src/components/BatchPanel.tsx`
- Modify: `src/styles/global.css`(追加 batch 样式段)

**Interfaces:**
- Consumes: Task 3 的 `BatchJob/BatchRow/BATCH_MAX_ROWS/canRunBatch/rowSeed`;Task 1 的 `randomSeed/randomizeParams`;Task 4 的 `createBatchRunner/createCanvasRenderTask`(本任务只建 runner 与"开始处理"接线,画廊呈现放 Task 7);`useDraggable`、`getStyle`
- Produces: `interface BatchPanelProps { job: BatchJob; setJob: React.Dispatch<React.SetStateAction<BatchJob | null>>; onClose: () => void }`;`default export BatchPanel`(Task 8 挂进 App2D)

- [ ] **Step 1: 组件骨架 + 状态管理**

```tsx
// src/components/BatchPanel.tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { getStyle } from '../lib/StyleRegistry'
import { randomSeed } from '../lib/randomSeed'
import {
  BATCH_MAX_ROWS, canRunBatch, rowSeed,
  type BatchJob, type BatchRow,
} from '../lib/batch/batchJob'
import { createBatchRunner, createCanvasRenderTask, buildBatchZip } from '../lib/batch/runBatch'
import { zipEntryName, dedupeName } from '../lib/batch/batchJob'
import Lightbox, { type LightboxItem } from './Lightbox'

interface BatchPanelProps {
  job: BatchJob
  setJob: React.Dispatch<React.SetStateAction<BatchJob | null>>
  onClose: () => void
}

function BatchPanel({ job, setJob, onClose }: BatchPanelProps) {
  const { t } = useTranslation()
  const { ref: panelRef, pos, onHeaderMouseDown } = useDraggable(
    { x: 90, y: 130 }, 'pixel-forge.panelPos.batch.v1',
  )
  const [tab, setTab] = useState<'config' | 'results'>('config')
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [seedError, setSeedError] = useState(false)
  const runningRef = useRef(false)
  const runnerRef = useRef(createBatchRunner(createCanvasRenderTask(job.baseline)))
  const fileInputRef = useRef<HTMLInputElement>(null)

  const baselineDef = getStyle(job.baseline.styleId)
  const isBaselineCanvas2d = baselineDef?.renderMode === 'canvas2d'
  const doneCount = job.rows.filter((r) => r.status === 'done').length
  const failedCount = job.rows.filter((r) => r.status === 'failed').length
  const processingCount = job.rows.filter((r) => r.status === 'processing').length
  const pendingCount = job.rows.filter((r) => r.status === 'pending').length
  const isRunning = processingCount > 0 || runningRef.current
  const atLimit = job.rows.length >= BATCH_MAX_ROWS
```

- [ ] **Step 2: 行更新与任务调度**

```tsx
  const patchRow = useCallback((id: string, patch: Partial<BatchRow>) => {
    setJob((j) => {
      if (!j) return j
      return { ...j, rows: j.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
    })
  }, [setJob])

  // done 时建 objectUrl、移除时 revoke —— 统一在此管理生命周期
  const updateRow = useCallback((id: string, patch: Partial<BatchRow>) => {
    if (patch.status === 'done' && patch.blob) {
      patch.objectUrl = URL.createObjectURL(patch.blob)
    }
    patchRow(id, patch)
  }, [patchRow])

  const drain = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      // run 只吃 pending/failed 行;循环直到没有待处理(处理中新追加的行自动续跑)
      while (true) {
        const j = jobRef.current
        if (!j) break
        if (!j.rows.some((r) => r.status === 'pending' || r.status === 'failed')) break
        await runnerRef.current.run(j, { onRowUpdate: updateRow })
      }
    } finally {
      runningRef.current = false
    }
  }, [updateRow])

  const jobRef = useRef(job)
  useEffect(() => { jobRef.current = job }, [job])
```

注意:`jobRef`/`useEffect` 需在顶部 import(`useEffect`);`drain` 依赖 jobRef 而非闭包 job(避免 run 循环里拿到旧 job)。

```tsx
  const startProcessing = useCallback(() => {
    if (!canRunBatch(job.rows.length)) return
    setTab('results')
    void drain()
  }, [job.rows.length, drain])
```

- [ ] **Step 3: 上传(多选 + 拖放)与行操作**

```tsx
  const addFiles = useCallback((files: FileList | File[]) => {
    const room = BATCH_MAX_ROWS - jobRef.current.rows.length
    const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room))
    for (const file of list) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          setJob((j) => {
            if (!j) return j
            if (j.rows.length >= BATCH_MAX_ROWS) return j   // 并发读完可能超限,再守一次
            return { ...j, rows: [...j.rows, {
              id: crypto.randomUUID(), fileName: file.name, image: img,
              seedOverride: null, status: 'pending', blob: null, objectUrl: null, error: null,
            }] }
          })
        }
        img.onerror = () => console.warn(`[batch] ${file.name} ${t('batch.uploadFailed', { name: file.name })}`)
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }, [setJob, t])

  const removeRow = useCallback((id: string) => {
    setJob((j) => {
      if (!j) return j
      const row = j.rows.find((r) => r.id === id)
      if (row?.objectUrl) URL.revokeObjectURL(row.objectUrl)
      return { ...j, rows: j.rows.filter((r) => r.id !== id) }
    })
  }, [setJob])

  const rerollRow = useCallback((id: string) => {
    const j = jobRef.current
    if (!j || !baselineDef) return
    const row = j.rows.find((r) => r.id === id)
    if (!row) return
    // 重骰 = 该行切独立种子(不再跟随统一值)
    const seed = randomSeed(baselineDef, j.baseline.params, j.baseline.textParams)
    patchRow(id, { seedOverride: seed, status: 'pending', blob: null, error: null })
    if (row.objectUrl) URL.revokeObjectURL(row.objectUrl)
    patchRow(id, { objectUrl: null })
    void drain()
  }, [baselineDef, patchRow, drain])

  const randomizeAll = useCallback(() => {
    const j = jobRef.current
    if (!j || !baselineDef) return
    setJob((cur) => cur ? {
      ...cur,
      seedMode: 'perImage',
      rows: cur.rows.map((r) => ({ ...r, seedOverride: randomSeed(baselineDef, cur.baseline.params, cur.baseline.textParams) })),
    } : cur)
  }, [baselineDef, setJob])
```

- [ ] **Step 4: 配置 tab JSX(含统一种子位、格式选择、策略开关)**

统一种子编辑:点种子码进入 input(参照 SeedBar 交互),Enter 提交(decodeSeed 校验失败显示错误),骰子按钮随机。独立模式行内同样式小组件。骰子 SVG(圆角方 + 5 点)与 SeedBar/ParamPanel 风格一致:

```tsx
  const dieIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
```

SeedInput 小组件(文件内定义,`seed`/`onApply(seed: string) => boolean`):非编辑态显示 `<code>` + 骰子;编辑态 input + Enter 提交,失败红框(类名复用 `seed-bar-*` 体系或新 `batch-seed-*`)。

面板 JSX 骨架(配置 tab 部分):

```tsx
  return (
    <div className="param-panel batch-panel" ref={panelRef} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('batch.title')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-close" onClick={() => (isRunning ? setConfirmClose(true) : onClose())}>x</button>
          </div>
        </div>
      </div>
      <div className="param-panel-body">
        <div className="batch-tabs">
          <button className={`batch-tab ${tab === 'config' ? 'batch-tab--active' : ''}`} onClick={() => setTab('config')}>{t('batch.tabConfig')}</button>
          <button className={`batch-tab ${tab === 'results' ? 'batch-tab--active' : ''}`} onClick={() => setTab('results')}>{t('batch.tabResults')}</button>
        </div>
        {tab === 'config' ? (
          <div className="batch-config">
            <div className="batch-config-toolbar">
              <button className="batch-btn" onClick={() => fileInputRef.current?.click()} disabled={atLimit}>
                {t('batch.add')}
              </button>
              {atLimit && <span className="batch-limit-hint">{t('batch.limitReached', { n: BATCH_MAX_ROWS })}</span>}
              <label className="batch-format">
                {t('batch.format')}
                <select value={job.format} onChange={(e) => setJob((j) => j ? { ...j, format: e.target.value as BatchJob['format'] } : j)} disabled={isRunning}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  {isBaselineCanvas2d && <option value="svg">SVG</option>}
                </select>
              </label>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
            <div className="batch-seed-mode">
              <button className={`batch-tab ${job.seedMode === 'unified' ? 'batch-tab--active' : ''}`}
                onClick={() => setJob((j) => j ? { ...j, seedMode: 'unified' } : j)}>{t('batch.seedModeUnified')}</button>
              <button className={`batch-tab ${job.seedMode === 'perImage' ? 'batch-tab--active' : ''}`}
                onClick={() => setJob((j) => j ? { ...j, seedMode: 'perImage' } : j)}>{t('batch.seedModePerImage')}</button>
            </div>
            {job.seedMode === 'unified' ? (
              <div className="batch-unified-seed">
                <span>{t('batch.unifiedSeed')}</span>
                <SeedInput seed={job.unifiedSeed} onApply={(s) => {
                  setJob((j) => j ? { ...j, unifiedSeed: s } : j)
                  return true
                }} />
              </div>
            ) : (
              <button className="batch-btn" onClick={randomizeAll}>{t('batch.randomizeAll')}</button>
            )}
            <div className="batch-rows">
              {job.rows.length === 0 && <div className="batch-empty">{t('batch.empty')}</div>}
              {job.rows.map((row) => (
                <div key={row.id} className="batch-row">
                  <img className="batch-row-thumb" src={row.image.src} alt={row.fileName} />
                  <span className="batch-row-name" title={row.fileName}>{row.fileName}</span>
                  {job.seedMode === 'perImage' && (
                    <SeedInput seed={row.seedOverride ?? job.unifiedSeed} onApply={(s) => { patchRow(row.id, { seedOverride: s }); return true }} />
                  )}
                  <button className="batch-icon-btn" title={t('batch.remove')} onClick={() => removeRow(row.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button className="batch-btn batch-btn--primary" onClick={startProcessing} disabled={!canRunBatch(job.rows.length)}>
              {t('batch.start', { n: job.rows.length })}
            </button>
          </div>
        ) : (
          /* 结果 tab —— Task 7 实现 */
          null
        )}
      </div>
      {confirmClose && /* 关闭确认,Task 7 */}
      null}
    </div>
  )
```

`SeedInput` 文件内小组件(编辑/骰子/错误态),应用失败(非法种子)时 `onApply` 返回 false 显示 `batch.invalidSeed`:

```tsx
function SeedInput({ seed, onApply }: { seed: string; onApply: (s: string) => boolean }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(seed)
  const [err, setErr] = useState(false)
  // …与 SeedBar 相同的 edit/commit 模式:Enter 提交,Esc 取消;
  // 提交时 decodeSeed 校验由 onApply 调用方做(返回 false → setErr(true))
  // 骰子按钮调 onApply(randomSeed(…)) —— 需把 randomSeed 实参经 props 传入:
}
```

⚠️ SeedInput 需要骰子的随机能力:改为 props `onRandom?: () => string`(返回新种子码并内部 apply),组件内不直接依赖 StyleRegistry——由父层传 `() => randomSeed(baselineDef!, job.baseline.params, job.baseline.textParams)`。

- [ ] **Step 5: global.css 追加样式**

在 `src/styles/global.css` 末尾追加(色值/圆角从既有 `.param-panel`、`.seed-bar`、`.action-btn` 段取一致变量;暗色主题沿用现有变量,不引入新色):

```css
/* ----- Batch panel ----- */
.batch-panel { width: 380px; max-width: calc(100vw - 24px); }
.batch-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.batch-tab { flex: 1; padding: 5px 10px; border: 1px solid var(--border-color, #444); background: transparent; color: inherit; border-radius: 6px; cursor: pointer; font-size: 12px; }
.batch-tab--active { background: var(--accent-bg, #2b6cb0); color: #fff; border-color: transparent; }
.batch-config-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.batch-format { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.batch-format select { background: inherit; color: inherit; border: 1px solid var(--border-color, #444); border-radius: 4px; }
.batch-seed-mode { display: flex; gap: 6px; margin-bottom: 8px; }
.batch-rows { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.batch-row { display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: 6px; }
.batch-row:hover { background: rgba(128, 128, 128, 0.12); }
.batch-row-thumb { width: 44px; height: 44px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
.batch-row-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.batch-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color, #444); background: transparent; color: inherit; cursor: pointer; font-size: 12px; }
.batch-btn--primary { background: var(--accent-bg, #2b6cb0); color: #fff; border-color: transparent; }
.batch-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.batch-icon-btn { background: transparent; border: none; color: inherit; cursor: pointer; padding: 3px; border-radius: 4px; display: inline-flex; }
.batch-icon-btn:hover { background: rgba(128, 128, 128, 0.2); }
.batch-empty { color: rgba(128,128,128,0.8); font-size: 12px; padding: 18px 0; text-align: center; }
.batch-limit-hint { font-size: 11px; color: #e05252; }
.batch-seed-input { width: 110px; font-size: 11px; padding: 2px 4px; background: inherit; color: inherit; border: 1px solid var(--border-color, #444); border-radius: 4px; }
.batch-seed-input--err { border-color: #e05252; }
.batch-seed-code { font-size: 11px; cursor: pointer; }
```

(实际类名/变量以现有 CSS 体系调和;`--border-color` 等若无变量则用文件中既有面板边框的具体值。)

- [ ] **Step 6: lint + 提交**

Run: `npm run lint` 不超基线;`npx tsc -b` 无类型错误。
本任务结束时结果 tab 为 `null` 占位、关闭确认未接——Task 7 补全后再整体手测。

```bash
git add src/components/BatchPanel.tsx src/styles/global.css
git commit -m "feat: add BatchPanel with setup tab (upload, seed modes, start)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: BatchPanel 结果 tab(画廊/进度/单张与 ZIP 下载/关闭确认)

**Files:**
- Modify: `src/components/BatchPanel.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 6 面板内全部状态与回调;Task 4 `buildBatchZip`;Task 3 `zipEntryName/dedupeName/rowSeed`;Task 5 `Lightbox`
- Produces: 完整可用的 BatchPanel(Task 8 直接挂载)

- [ ] **Step 1: 结果 tab JSX**

替换 Task 6 的 `null` 占位:

```tsx
          <div className="batch-results">
            <div className="batch-progress-row">
              <div className="batch-progress">
                <div className="batch-progress-fill" style={{ width: `${job.rows.length ? ((doneCount + failedCount) / job.rows.length) * 100 : 0}%` }} />
              </div>
              <span className="batch-progress-label">
                {t('batch.processing', { done: doneCount + failedCount, total: job.rows.length })}
                {failedCount > 0 && ` · ${t('batch.failedCount', { n: failedCount })}`}
              </span>
            </div>
            <div className="batch-gallery">
              {job.rows.map((row, i) => (
                <div key={row.id} className={`batch-cell batch-cell--${row.status}`}>
                  {row.status === 'done' && row.objectUrl ? (
                    <img src={row.objectUrl} alt={row.fileName} onClick={() => setLightboxIdx(i)} />
                  ) : row.status === 'processing' ? (
                    <div className="batch-spinner" />
                  ) : row.status === 'failed' ? (
                    <div className="batch-cell-msg">
                      <span className="batch-cell-err" title={row.error ?? ''}>{t('batch.retry')}</span>
                      <button className="batch-icon-btn" title={t('batch.retry')} onClick={() => { patchRow(row.id, { status: 'pending', error: null }); void drain() }}>
                        {/* 环形重试箭头 */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 3-6.7" />
                          <path d="M3 4v5h5" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="batch-cell-msg"><span>{t('batch.pending')}</span></div>
                  )}
                  {row.status === 'done' && (
                    <div className="batch-cell-actions">
                      <button className="batch-icon-btn" title={t('batch.reroll')} onClick={() => rerollRow(row.id)}>{dieIcon}</button>
                      <button className="batch-icon-btn" title={t('batch.downloadOne')} onClick={() => downloadRow(row)}>
                        {/* 下载箭头 */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className="batch-btn batch-btn--primary" onClick={downloadZip} disabled={doneCount === 0}>
              {t('batch.downloadZip', { n: doneCount })}
            </button>
          </div>
```

- [ ] **Step 2: 下载逻辑**

```tsx
  const downloadRow = useCallback((row: BatchRow) => {
    if (!row.blob) return
    const state = rowSeed(job, row)
    const name = zipEntryName(job.baseline.styleId, row.fileName, state, job.format === 'svg' ? 'svg' : job.format)
    saveBlob(row.blob, name)
  }, [job])

  const downloadZip = useCallback(async () => {
    const done = job.rows.filter((r) => r.status === 'done' && r.blob)
    if (done.length === 0) return
    const taken = new Set<string>()
    const entries = done.map((r) => {
      const seed = rowSeed(job, r)
      const ext = r.blob!.type === 'image/svg+xml' ? 'svg' : r.blob!.type === 'image/jpeg' ? 'jpg' : 'png'
      const name = dedupeName(zipEntryName(job.baseline.styleId, r.fileName, seed, ext), taken)
      taken.add(name)
      return { name, blob: r.blob! }
    })
    const zip = await buildBatchZip(entries)
    saveBlob(zip, 'pixel-forge-batch.zip')
  }, [job])

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
```

`saveBlob` 放组件外(模块级纯函数)。

- [ ] **Step 3: 灯箱与关闭确认接线**

```tsx
  const lightboxItems: LightboxItem[] = useMemo(() => job.rows.map((r) => ({
    objectUrl: r.objectUrl ?? '',
    fileName: r.fileName,
    seed: rowSeed(job, r),
    ext: r.blob ? (r.blob.type === 'image/svg+xml' ? 'svg' : r.blob.type === 'image/jpeg' ? 'jpg' : 'png') : '',
  })), [job])
  const lightboxDone = useMemo(
    () => lightboxItems.map((it, i) => ({ it, row: job.rows[i] })).filter((x) => x.row.status === 'done' && x.it.objectUrl),
    [lightboxItems, job.rows],
  )
```

灯箱按"已完成行"打开(点击格子时传其在 done 列表中的索引)。渲染:

```tsx
      {lightboxIdx !== null && lightboxDone.length > 0 && (
        <Lightbox
          items={lightboxDone.map((x) => x.it)}
          index={Math.min(lightboxIdx, lightboxDone.length - 1)}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}
      {confirmClose && (
        <ConfirmDialog
          message={t('batch.closeConfirm')}
          onConfirm={() => { runnerRef.current.cancel(); onClose() }}
          onCancel={() => setConfirmClose(false)}
        />
      )}
```

格子点击处 `setLightboxIdx(i)` 改为传 done 序号:在 map 里同时计算 `doneIdx`(前面 done 行计数)。

- [ ] **Step 4: 卸载清理**

```tsx
  useEffect(() => () => {
    runnerRef.current.cancel()
  }, [])
```

(App2D 侧 setJob(null) 即卸载 BatchPanel → cancel;objectURL 的 revoke 由 App2D 关闭路径统一做,见 Task 8。)

- [ ] **Step 5: CSS(画廊/进度/灯箱)**

```css
.batch-progress-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.batch-progress { flex: 1; height: 6px; border-radius: 3px; background: rgba(128,128,128,0.25); overflow: hidden; }
.batch-progress-fill { height: 100%; background: var(--accent-bg, #2b6cb0); transition: width 0.25s; }
.batch-progress-label { font-size: 11px; white-space: nowrap; }
.batch-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; max-height: 320px; overflow-y: auto; margin-bottom: 8px; }
.batch-cell { position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; background: rgba(128,128,128,0.12); display: flex; align-items: center; justify-content: center; }
.batch-cell img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }
.batch-cell-actions { position: absolute; right: 4px; top: 4px; display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.batch-cell:hover .batch-cell-actions { opacity: 1; }
.batch-cell-actions .batch-icon-btn { background: rgba(0,0,0,0.55); color: #fff; }
.batch-cell-msg { font-size: 11px; color: rgba(128,128,128,0.9); text-align: center; padding: 4px; }
.batch-cell-err { color: #e05252; display: block; margin-bottom: 4px; }
.batch-spinner { width: 22px; height: 22px; border: 3px solid rgba(128,128,128,0.3); border-top-color: var(--accent-bg, #2b6cb0); border-radius: 50%; animation: batch-spin 0.9s linear infinite; }
@keyframes batch-spin { to { transform: rotate(360deg); } }
.batch-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.batch-lightbox-stage { max-width: 92vw; max-height: 88vh; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.batch-lightbox-stage img { max-width: 92vw; max-height: 80vh; object-fit: contain; }
.batch-lightbox-info { color: #ddd; font-size: 12px; }
.batch-lightbox-close { position: fixed; top: 14px; right: 16px; background: transparent; border: none; color: #ddd; cursor: pointer; padding: 6px; }
.batch-lightbox-nav { position: fixed; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; color: #ddd; cursor: pointer; padding: 10px 8px; }
.batch-lightbox-nav--prev { left: 8px; }
.batch-lightbox-nav--next { right: 8px; }
```

- [ ] **Step 6: lint + tsc + 提交**

Run: `npm run lint`、`npx tsc -b` → 干净(不超基线)。

```bash
git add src/components/BatchPanel.tsx src/styles/global.css
git commit -m "feat: add batch results gallery, downloads and close confirm

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: App2D 集成(批量应用按钮/快照/替换基线/挂载)

**Files:**
- Modify: `src/components/App2D.tsx`
- Modify: `src/components/ActionBar.tsx`

**Interfaces:**
- Consumes: Task 6/7 的 `BatchPanel`;Task 3 的 `BatchJob`;现有 `encodeSeed`、`ConfirmDialog`
- Produces: 完整功能闭环

- [ ] **Step 1: ActionBar 加"批量应用"**

`ActionBarProps` 加 `onBatchApply: () => void`;在"随机"按钮后渲染:

```tsx
      <button className="action-btn action-btn--secondary" onClick={onBatchApply}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" rx="2" />
          <rect x="11" y="11" width="10" height="10" rx="2" />
        </svg>
        {t('batch.apply')}
      </button>
```

i18n 补 `batch.apply`:zh `"批量应用"` / en `"Batch apply"`。

- [ ] **Step 2: App2D 状态与快照**

```tsx
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null)
  const [showBatchReplaceDialog, setShowBatchReplaceDialog] = useState(false)

  // 快照当前完整状态(含 textParams/fontParams——种子不携带这些,批量基线必须补齐)
  const makeBaseline = useCallback((): BatchBaseline => ({
    styleId: activeStyle,
    params: { ...params },
    textParams: { ...textParams },
    fontParams: { ...fontParams },
  }), [activeStyle, params, textParams, fontParams])

  const handleBatchApply = useCallback(() => {
    if (!image) return
    const baseline = makeBaseline()
    const seedCode = encodeSeed(activeStyle, params, currentStyle!, textParams)
    setBatchJob((j) => {
      if (j) { setShowBatchReplaceDialog(true); return j }   // 已开 → 走替换确认
      return {
        baseline, unifiedSeed: seedCode, seedMode: 'unified', format: 'png',
        rows: [{
          id: crypto.randomUUID(), fileName: 'current.png', image,
          seedOverride: null, status: 'pending', blob: null, objectUrl: null, error: null,
        }],
      }
    })
  }, [image, activeStyle, params, textParams, currentStyle, makeBaseline])

  const replaceBaseline = useCallback(() => {
    const baseline = makeBaseline()
    const seedCode = encodeSeed(activeStyle, params, currentStyle!, textParams)
    setBatchJob((j) => j ? { ...j, baseline, unifiedSeed: seedCode } : j)
    setShowBatchReplaceDialog(false)
  }, [activeStyle, params, textParams, currentStyle, makeBaseline])

  // 关闭批量:终止 + revoke 全部结果 URL(App2D 是 job 生命周期唯一所有者)
  const closeBatch = useCallback(() => {
    setBatchJob((j) => {
      j?.rows.forEach((r) => { if (r.objectUrl) URL.revokeObjectURL(r.objectUrl) })
      return null
    })
  }, [])
```

当前图文件名:单图上传路径没有保留文件名(ImageUploader 只传 img)。`'current.png'` 作占位名;如需真名,给 ImageUploader 加 `onFileName` 回调存 App2D state(可选增强,默认占位名可接受——输出名仍有风格+种子可辨识)。

- [ ] **Step 3: 渲染挂载**

```tsx
      <ActionBar
        /* 既有 props */
        onBatchApply={handleBatchApply}
      />
      {batchJob && (
        <BatchPanel job={batchJob} setJob={setBatchJob} onClose={closeBatch} />
      )}
      {showBatchReplaceDialog && (
        <ConfirmDialog
          message={t('batch.replaceBaseline')}
          onConfirm={replaceBaseline}
          onCancel={() => setShowBatchReplaceDialog(false)}
        />
      )}
```

import:`BatchPanel`、`BatchJob/BatchBaseline` 类型。

- [ ] **Step 4: lint + tsc + 提交**

```bash
npm run lint && npx tsc -b
git add src/components/App2D.tsx src/components/ActionBar.tsx src/i18n/zh.json src/i18n/en.json
git commit -m "feat: wire batch apply into App2D with baseline snapshot

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: 全量验证与手测清单

**Files:** 无新文件(修复则改对应文件)

- [ ] **Step 1: 自动化全绿**

Run: `npm test` → 全部通过。
Run: `npm run lint` → 错误数 ≤ 11(基线,均在 3D 文件)。
Run: `npm run build` → 成功。

- [ ] **Step 2: 手测清单(npm run dev)**

1. 12 风格单图渲染无回归(若 Task 2 已做可跳过重复,抽查 4 个)。
2. halftone 调参 → 批量应用 → 面板开、当前图为第一行、统一种子=当前种子码。
3. 添加 3 张图 → 统一种子 → 开始处理 → 自动切结果 tab → 画廊逐格完成 → ZIP 下载解包,命名 `halftone_xxx_seed.png` 正确、图可打开。
4. 切"每图独立" → 行内改种子/骰子 → 全部随机 → 重跑生效。
5. 画廊单格"换效果重跑" → 该格刷新为新效果(独立种子)。
6. ASCII:格式出现 SVG,批量导出 .svg 可打开;text 风格(textraster)渲染正常。
7. canvas2d + uShowBg=0 + JPG → 黑底。
8. animelight 自动光源:两张亮点位置不同的图批量,输出光源各自正确。
9. 处理中最小化(折叠标题栏)/回单图界面拖参数 → 不卡顿;批量继续完成。
10. 处理中点关闭 → 确认对话 → 确认后终止,再开新批量正常。
11. 面板已开再点"批量应用" → 替换基线确认;替换后已 done 的行不变,重跑后按新基线。
12. 上传第 21 张 → 添加按钮禁用 + 提示;上传一个 .txt 伪装图 → 不入列(console warn)。
13. 灯箱:点缩略图开、←/→ 换图、Esc 关、单张信息正确。
14. 切换语言 en/zh,批量面板全部文案有翻译。

- [ ] **Step 3: 修完问题后最终提交**

```bash
git add -A
git commit -m "fix: address issues found in batch manual test pass

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

(若无改动则跳过。)

---

## Self-Review 记录

- Spec 覆盖:交互形态/种子策略/画廊/ZIP/面板形态/错误处理/付费预留/20 上限/命名冲突/objectURL 生命周期/替换基线 → 分别落在 Task 3/4/6/7/8。灯箱在 Task 5+7。`canRunBatch` UI 接线在 Task 6(开始处理按钮 disabled)。
- 类型一致性:`BatchJob/BatchRow/BatchBaseline` 在 Task 3 定义,Task 4/6/7/8 按此消费;`RenderTaskFn` 注入模式贯穿测试与生产。
- 已知让步(实现时按此执行):① Task 2 的 `renderImage` opts 类型放宽(`renderer/image` 可空)以兼容 App2D 薄壳;② 当前图文件名用占位 `'current.png'`;③ vitest 顶层静态 import 修正(Task 3 Step 1 注意事项)。
