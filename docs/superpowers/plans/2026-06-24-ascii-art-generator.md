# ASCII 字符艺术生成器 (ZoA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 App2D 2D 风格化模块中新增第 11 个风格「ASCII 字符艺术生成器」，将图片按灰度映射为自定义字符集组成的 ASCII 艺术，支持自定义字体上传与 JPG/PNG/SVG 三格式导出。

**Architecture:** 作为 `StyleDefinition` 注册的一个风格项，但带 `renderMode: 'canvas2d'` 标志。`App2D.renderWithStyle` 在最顶部按 `renderMode` 分流——ASCII 走新建的 `AsciiCanvasRenderer`（Canvas 2D），其余 10 个风格仍走 `ShaderRenderer`（WebGL）。核心算法（密度排序、亮度映射、对比度、背景过滤、SVG 生成）抽成不依赖 canvas 的纯函数，便于测试。

**Tech Stack:** React 19 + TypeScript + Vite 8 + i18next；新增 dev 依赖 vitest（仅用于纯函数单测）；Canvas 2D API；FontFace API。

**对应 Spec:** `docs/superpowers/specs/2026-06-23-ascii-art-generator-design.md`

---

## 测试策略

项目当前**无任何测试基础设施**。本计划采用分层策略：

- **纯函数算法**（Task 2/3/4）→ **vitest 严格 TDD**。这些函数输入是 `Uint8ClampedArray`/数值/矩阵、输出是数值/字符串，不依赖 DOM 或 canvas，在 vitest 默认 node 环境即可测，零额外配置。
- **Canvas 渲染壳 + UI 集成**（Task 5/7/8/9）→ **手动验证**。canvas/WebGL/FontFace 在 jsdom 无法可靠测试，且无项目先例。每个此类任务末尾给出 dev server 手动验证步骤（对照 spec §10 测试清单）。

> vitest 与 Vite 8 兼容性：vitest 紧跟 Vite 主版本。Task 1 安装后会跑一个 dummy 测试验证；若不兼容，回退为锁定上一个兼容主版本（如 `vitest@^2`）。

---

## File Structure

**新建文件：**

| 文件 | 责任 |
|---|---|
| `src/lib/ascii/density.ts` | 纯函数：字符填充率统计、密度 ramp 排序、亮度→索引映射 |
| `src/lib/ascii/density.test.ts` | density 单测 |
| `src/lib/ascii/image.ts` | 纯函数：灰度、cell 平均亮度、cell 局部对比度、背景过滤判定 |
| `src/lib/ascii/image.test.ts` | image 单测 |
| `src/lib/ascii/svg.ts` | 纯函数：字符矩阵 → SVG 字符串 |
| `src/lib/ascii/svg.test.ts` | svg 单测 |
| `src/lib/AsciiCanvasRenderer.ts` | Canvas 2D 渲染壳：字体测量、主渲染循环、`lastMatrix` 缓存、`exportSvg` |
| `src/components/ZoomControl.tsx` | 缩放控件（- / + / 还原 + 百分比） |

**修改文件：**

| 文件 | 改动 |
|---|---|
| `src/types.ts` | `StyleId` 加 `'ascii'`；新增 `FontParamDef`；`ParamDef` 联合加 font；`StyleDefinition` 加 `renderMode?` |
| `src/lib/StyleRegistry.ts` | 注册 `ascii` 风格 |
| `src/components/App2D.tsx` | 渲染分流、`fontParams` 第三通道、4 处迭代跳过 font、导出三格式、缩放状态 |
| `src/components/ParamPanel.tsx` | props 加 `fontValues`/`onFontChange`；`renderParam` 加 font 控件 |
| `src/components/ActionBar.tsx` | props 加 `onDownloadJpg?`/`onDownloadSvg?`/`renderMode`；三按钮 |
| `src/components/CompareSlider.tsx` | 集成 `ZoomControl`（CSS transform 缩放 canvas 显示） |
| `src/i18n/en.json` / `zh.json` | `style.ascii.*` 及导出/提示文案 |
| `src/styles/global.css` | font 控件、三格式按钮、缩放控件样式 |
| `package.json` | 加 vitest dev 依赖与 test 脚本 |

> 不新增 `.frag` 着色器——ASCII 走 Canvas 2D。

---

## Task 1: 测试基础设施 + 类型扩展

**Files:**
- Modify: `package.json`
- Create: `src/lib/ascii/.placeholder.test.ts`（验证 vitest 跑通后删除）
- Modify: `src/types.ts`

- [ ] **Step 1: 安装 vitest**

Run: `npm install -D vitest`
Expected: `vitest` 出现在 devDependencies。

- [ ] **Step 2: 加 test 脚本**

修改 `package.json` 的 `scripts`，在 `preview` 后追加：

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: 写 dummy 测试验证 vitest 跑通**

Create `src/lib/ascii/.placeholder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: 1 test passed。若报与 Vite 8 不兼容的错误，执行 `npm install -D vitest@^2` 后重试。

- [ ] **Step 5: 删除 dummy 测试**

删除 `src/lib/ascii/.placeholder.test.ts`。

- [ ] **Step 6: 扩展 types.ts**

修改 `src/types.ts`。

第 1 行 `StyleId` 末尾追加 `| 'ascii'`：

```ts
export type StyleId = 'halftone' | 'diffusion' | 'popart' | 'lightshadow' | 'sketch' | 'pointillism' | 'kaleidoscope' | 'crosshatch' | 'animelight' | 'textraster' | 'ascii'
```

在 `SelectParamDef` 之后、`ParamDef` 联合类型之前，新增 `FontParamDef`：

```ts
export interface FontParamDef {
  type: 'font'
  name: string
  uniform: string
  description?: string
}
```

修改 `ParamDef` 联合类型（第 47 行）追加 `FontParamDef`：

```ts
export type ParamDef = NumberParamDef | TextParamDef | ToggleParamDef | ColorParamDef | SelectParamDef | FontParamDef
```

修改 `StyleDefinition`（第 54 行）追加可选 `renderMode`：

```ts
export interface StyleDefinition {
  id: StyleId
  label: string
  description: string
  shaderImports: (() => Promise<string>)[]
  params: ParamDef[]
  isMultiPass?: boolean
  renderMode?: 'shader' | 'canvas2d'  // 默认 'shader'
}
```

- [ ] **Step 7: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无类型错误。

- [ ] **Step 8: Commit**

```bash
git add package.json src/types.ts
git commit -m "feat(ascii): add vitest + extend types with FontParamDef and renderMode"
```

---

## Task 2: 字符密度算法 (density.ts) — TDD

**Files:**
- Create: `src/lib/ascii/density.ts`
- Test: `src/lib/ascii/density.test.ts`

**说明：** 这三个纯函数不依赖 canvas。`computeFillRate` 接收已绘制字符的 RGBA 像素数组（由渲染壳通过 `getImageData` 提供），统计 alpha 占比；`sortToRamp` 把测量结果排成稀疏→密集的字符数组；`luminanceToIndex` 把亮度映射到 ramp 索引（亮→稀疏端、暗→密集端）。

- [ ] **Step 1: 写失败测试**

Create `src/lib/ascii/density.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeFillRate, sortToRamp, luminanceToIndex } from './density'

describe('computeFillRate', () => {
  it('returns 0 for fully transparent pixels', () => {
    // 4 pixels, all alpha=0
    const px = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(computeFillRate(px)).toBe(0)
  })

  it('returns 1 for fully opaque pixels', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
    expect(computeFillRate(px)).toBe(1)
  })

  it('returns 0.5 when half the pixels are above threshold', () => {
    const px = new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255])
    expect(computeFillRate(px)).toBe(0.5)
  })

  it('returns 0 for empty input', () => {
    expect(computeFillRate(new Uint8ClampedArray(0))).toBe(0)
  })
})

describe('sortToRamp', () => {
  it('sorts chars by fillRate ascending (sparse -> dense)', () => {
    const measured = [
      { char: '#', fillRate: 0.8 },
      { char: '.', fillRate: 0.1 },
      { char: 'o', fillRate: 0.5 },
    ]
    expect(sortToRamp(measured)).toEqual(['.', 'o', '#'])
  })

  it('returns empty for empty input', () => {
    expect(sortToRamp([])).toEqual([])
  })
})

describe('luminanceToIndex', () => {
  it('bright (1) -> index 0 (sparsest)', () => {
    expect(luminanceToIndex(1, 10)).toBe(0)
  })

  it('dark (0) -> last index (densest)', () => {
    expect(luminanceToIndex(0, 10)).toBe(9)
  })

  it('clamps luminance above 1 and below 0', () => {
    expect(luminanceToIndex(2, 10)).toBe(0)
    expect(luminanceToIndex(-1, 10)).toBe(9)
  })

  it('returns 0 when ramp length <= 1', () => {
    expect(luminanceToIndex(0.5, 1)).toBe(0)
    expect(luminanceToIndex(0.5, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/ascii/density.test.ts`
Expected: FAIL（模块不存在 / 函数未定义）。

- [ ] **Step 3: 实现 density.ts**

Create `src/lib/ascii/density.ts`:

```ts
export interface MeasuredChar {
  char: string
  fillRate: number
}

/** Count the fraction of pixels whose alpha exceeds the threshold. */
export function computeFillRate(pixels: Uint8ClampedArray, alphaThreshold = 128): number {
  if (pixels.length === 0) return 0
  let filled = 0
  let total = 0
  for (let i = 3; i < pixels.length; i += 4) {
    total++
    if (pixels[i] > alphaThreshold) filled++
  }
  return total === 0 ? 0 : filled / total
}

/** Sort measured chars by fillRate ascending into a ramp (sparse -> dense). */
export function sortToRamp(measured: MeasuredChar[]): string[] {
  return [...measured]
    .sort((a, b) => a.fillRate - b.fillRate)
    .map((m) => m.char)
}

/** Map luminance [0,1] to a ramp index. Bright -> 0 (sparsest), dark -> last (densest). */
export function luminanceToIndex(luminance: number, rampLength: number): number {
  if (rampLength <= 1) return 0
  const clamped = Math.min(1, Math.max(0, luminance))
  const idx = Math.round((1 - clamped) * (rampLength - 1))
  return Math.min(rampLength - 1, Math.max(0, idx))
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/lib/ascii/density.test.ts`
Expected: PASS（所有用例通过）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/ascii/density.ts src/lib/ascii/density.test.ts
git commit -m "feat(ascii): add character density pure functions (TDD)"
```

---

## Task 3: 图像分析算法 (image.ts) — TDD

**Files:**
- Create: `src/lib/ascii/image.ts`
- Test: `src/lib/ascii/image.test.ts`

**说明：** 这些函数接收整图的 RGBA 像素数组与一个 cell 矩形，计算该 cell 的平均亮度与局部对比度（亮度标准差），用于灰度映射与背景过滤。纯逻辑，不依赖 canvas。

- [ ] **Step 1: 写失败测试**

Create `src/lib/ascii/image.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rgbaToLuminance, cellAverageLuminance, cellContrast, shouldSkipCell } from './image'

describe('rgbaToLuminance', () => {
  it('white -> ~255', () => {
    expect(Math.round(rgbaToLuminance(255, 255, 255))).toBe(255)
  })

  it('black -> 0', () => {
    expect(rgbaToLuminance(0, 0, 0)).toBe(0)
  })
})

describe('cellAverageLuminance', () => {
  it('returns the normalized average luminance of a uniform cell', () => {
    // 2x2 all white (255,255,255) pixels
    const px = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255,
    ])
    const lum = cellAverageLuminance(px, 2, { x: 0, y: 0, w: 2, h: 2 })
    expect(lum).toBeCloseTo(1, 2)
  })

  it('returns 0 for a black cell', () => {
    const px = new Uint8ClampedArray(16) // all zeros
    expect(cellAverageLuminance(px, 2, { x: 0, y: 0, w: 2, h: 2 })).toBe(0)
  })
})

describe('cellContrast', () => {
  it('returns 0 for a uniform cell', () => {
    const px = new Uint8ClampedArray([
      128, 128, 128, 255, 128, 128, 128, 255,
      128, 128, 128, 255, 128, 128, 128, 255,
    ])
    expect(cellContrast(px, 2, { x: 0, y: 0, w: 2, h: 2 })).toBeCloseTo(0, 6)
  })

  it('returns > 0 for a varied cell', () => {
    const px = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
      0, 0, 0, 255, 255, 255, 255, 255,
    ])
    expect(cellContrast(px, 2, { x: 0, y: 0, w: 2, h: 2 })).toBeGreaterThan(0)
  })
})

describe('shouldSkipCell', () => {
  it('skips when contrast below threshold', () => {
    expect(shouldSkipCell(0.05, 0.12)).toBe(true)
  })

  it('keeps when contrast at/above threshold', () => {
    expect(shouldSkipCell(0.12, 0.12)).toBe(false)
    expect(shouldSkipCell(0.3, 0.12)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/ascii/image.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 image.ts**

Create `src/lib/ascii/image.ts`:

```ts
export interface CellRect {
  x: number
  y: number
  w: number
  h: number
}

/** Rec. 709 luminance, 0-255. */
export function rgbaToLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Average normalized luminance [0,1] over a cell region. */
export function cellAverageLuminance(pixels: Uint8ClampedArray, imgW: number, cell: CellRect): number {
  let sum = 0
  let count = 0
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const i = (y * imgW + x) * 4
      sum += rgbaToLuminance(pixels[i], pixels[i + 1], pixels[i + 2])
      count++
    }
  }
  return count === 0 ? 0 : sum / count / 255
}

/** Local contrast [0,1] = standard deviation of normalized luminance over a cell. */
export function cellContrast(pixels: Uint8ClampedArray, imgW: number, cell: CellRect): number {
  const lums: number[] = []
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const i = (y * imgW + x) * 4
      lums.push(rgbaToLuminance(pixels[i], pixels[i + 1], pixels[i + 2]) / 255)
    }
  }
  if (lums.length === 0) return 0
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length
  const variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length
  return Math.sqrt(variance)
}

/** Skip flat/low-contrast cells (background filtering). */
export function shouldSkipCell(contrast: number, threshold: number): boolean {
  return contrast < threshold
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/lib/ascii/image.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/ascii/image.ts src/lib/ascii/image.test.ts
git commit -m "feat(ascii): add image analysis pure functions (TDD)"
```

---

## Task 4: SVG 生成算法 (svg.ts) — TDD

**Files:**
- Create: `src/lib/ascii/svg.ts`
- Test: `src/lib/ascii/svg.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/ascii/svg.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matrixToSvg } from './svg'

describe('matrixToSvg', () => {
  it('wraps cells in an svg element with correct size', () => {
    const svg = matrixToSvg([], 100, 50, 'monospace')
    expect(svg).toContain('<svg')
    expect(svg).toContain('width="100"')
    expect(svg).toContain('height="50"')
    expect(svg).toContain('</svg>')
  })

  it('emits a <text> element per cell', () => {
    const svg = matrixToSvg(
      [{ char: 'A', x: 10, y: 20, size: 14, color: '#00ff66' }],
      100, 100, 'monospace',
    )
    expect(svg).toContain('<text')
    expect(svg).toContain('x="10.00"')
    expect(svg).toContain('y="20.00"')
    expect(svg).toContain('font-size="14.00"')
    expect(svg).toContain('fill="#00ff66"')
    expect(svg).toContain('>A<')
  })

  it('escapes XML special characters in chars', () => {
    const svg = matrixToSvg(
      [{ char: '<&>"\'', x: 0, y: 0, size: 10, color: '#000' }],
      50, 50, 'monospace',
    )
    expect(svg).not.toContain('<&');
    expect(svg).toContain('&lt;')
    expect(svg).toContain('&amp;')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/ascii/svg.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 svg.ts**

Create `src/lib/ascii/svg.ts`:

```ts
export interface CharCell {
  char: string
  x: number
  y: number
  size: number
  color: string
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Convert a character matrix to a vector SVG string (character layer only). */
export function matrixToSvg(cells: CharCell[], width: number, height: number, fontFamily: string): string {
  const body = cells
    .map((c) => {
      const fs = c.size.toFixed(2)
      return `  <text x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" font-size="${fs}" font-family="${escapeXml(fontFamily)}" fill="${c.color}">${escapeXml(c.char)}</text>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/lib/ascii/svg.test.ts`
Expected: PASS。

- [ ] **Step 5: 全量单测回归**

Run: `npm test`
Expected: 三个测试文件全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/ascii/svg.ts src/lib/ascii/svg.test.ts
git commit -m "feat(ascii): add SVG matrix generation pure function (TDD)"
```

---

## Task 5: AsciiCanvasRenderer 渲染壳

**Files:**
- Create: `src/lib/AsciiCanvasRenderer.ts`

**说明：** 集成 Task 2/3/4 的纯函数，完成 canvas 测量、主渲染循环、`lastMatrix` 缓存与 `exportSvg`。此文件涉及 canvas/FontFace，走手动验证（Task 7 联调时一并验证）。

- [ ] **Step 1: 实现 AsciiCanvasRenderer.ts**

Create `src/lib/AsciiCanvasRenderer.ts`:

```ts
import { computeFillRate, sortToRamp, luminanceToIndex, type MeasuredChar } from './ascii/density'
import { cellAverageLuminance, cellContrast, shouldSkipCell, type CellRect } from './ascii/image'
import { matrixToSvg, type CharCell } from './ascii/svg'

export interface AsciiRenderParams {
  charset: string
  caseMode: number       // 0 keep / 1 upper / 2 lower
  charColor: string      // hex like '#00ff66'
  showBg: number         // 0 / 1
  charScale: number
  cellSize: number
  randomScale: number
  bgFilter: number
}

const MAX_PROCESS_SIZE = 1280
const SYSTEM_FONT = 'monospace'

export class AsciiCanvasRenderer {
  private lastMatrix: CharCell[] = []
  private lastWidth = 0
  private lastHeight = 0
  private rampCacheKey = ''
  private ramp: string[] = []

  /** Measure every char's fill rate and build a density ramp (cached). */
  private buildRamp(
    ctx: CanvasRenderingContext2D,
    charset: string,
    fontSize: number,
    font: string,
  ): string[] {
    const key = `${charset}|${fontSize}|${font}`
    if (this.rampCacheKey === key && this.ramp.length > 0) return this.ramp

    const cell = fontSize * 2
    ctx.font = `${fontSize}px ${font}`
    ctx.textBaseline = 'top'
    const measured: MeasuredChar[] = []
    for (const ch of charset) {
      ctx.clearRect(0, 0, cell, cell)
      ctx.fillStyle = '#fff'
      ctx.fillText(ch, 0, 0)
      const data = ctx.getImageData(0, 0, cell, cell).data
      measured.push({ char: ch, fillRate: computeFillRate(data) })
    }
    this.ramp = sortToRamp(measured)
    this.rampCacheKey = key
    return this.ramp
  }

  private applyCase(charset: string, mode: number): string {
    if (mode === 1) return charset.toUpperCase()
    if (mode === 2) return charset.toLowerCase()
    return charset
  }

  render(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    params: AsciiRenderParams,
    fontFace: FontFace | null,
  ): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Limit processing resolution to MAX_PROCESS_SIZE on the long edge.
    const scale = Math.min(1, MAX_PROCESS_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
    const w = Math.max(1, Math.round(image.naturalWidth * scale))
    const h = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.width = w
    canvas.height = h

    // Off-screen pixel read.
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const offCtx = off.getContext('2d')!
    offCtx.drawImage(image, 0, 0, w, h)
    const imgData = offCtx.getImageData(0, 0, w, h).data

    const font = fontFace ? `"${fontFace.family}"` : SYSTEM_FONT
    const charset = this.applyCase(params.charset, params.caseMode)
    const fontSize = Math.max(4, Math.round(params.cellSize))
    const ramp = this.buildRamp(ctx, charset, fontSize, font)
    if (ramp.length === 0) return

    ctx.clearRect(0, 0, w, h)
    if (params.showBg === 1) ctx.drawImage(image, 0, 0, w, h)

    ctx.textBaseline = 'top'
    ctx.fillStyle = params.charColor

    const cells: CharCell[] = []
    for (let y = 0; y < h; y += fontSize) {
      for (let x = 0; x < w; x += fontSize) {
        const cell: CellRect = {
          x,
          y,
          w: Math.min(fontSize, w - x),
          h: Math.min(fontSize, h - y),
        }
        const lum = cellAverageLuminance(imgData, w, cell)
        const contrast = cellContrast(imgData, w, cell)
        if (shouldSkipCell(contrast, params.bgFilter)) continue
        const idx = luminanceToIndex(lum, ramp.length)
        const ch = ramp[idx]
        if (!ch) continue
        const delta = params.randomScale * (Math.random() * 2 - 1)
        const size = fontSize * params.charScale * (1 + delta)
        ctx.font = `${size.toFixed(2)}px ${font}`
        ctx.fillText(ch, x, y)
        cells.push({ char: ch, x, y, size, color: params.charColor })
      }
    }

    this.lastMatrix = cells
    this.lastWidth = w
    this.lastHeight = h
  }

  exportSvg(fontFamily: string): string {
    return matrixToSvg(this.lastMatrix, this.lastWidth, this.lastHeight, fontFamily)
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无错误。

- [ ] **Step 3: Commit（功能在 Task 7 联调时手动验证）**

```bash
git add src/lib/AsciiCanvasRenderer.ts
git commit -m "feat(ascii): add AsciiCanvasRenderer (canvas2d render shell)"
```

---

## Task 6: 注册 ascii 风格 + i18n 文案

**Files:**
- Modify: `src/lib/StyleRegistry.ts`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh.json`

- [ ] **Step 1: 在 StyleRegistry.ts 末尾（textraster 之后、`]` 之前）注册 ascii 风格**

在 `src/lib/StyleRegistry.ts` 的 `styles` 数组中，`textraster` 对象之后追加：

```ts
  // ---------------------------------------------------------------------------
  // ASCII Art (canvas2d)
  // ---------------------------------------------------------------------------
  {
    id: 'ascii',
    label: 'style.ascii.label',
    description: 'style.ascii.desc',
    shaderImports: [],
    renderMode: 'canvas2d',
    params: [
      { name: 'style.ascii.charset', uniform: 'uCharset', type: 'text' as const, textDefault: '哇真的是你啊!@#$%^&*+/=三:.', description: 'style.ascii.charsetDesc' },
      { name: 'style.ascii.font', uniform: 'uFont', type: 'font' as const, description: 'style.ascii.fontDesc' },
      { name: 'style.ascii.caseMode', uniform: 'uCaseMode', type: 'select' as const, options: [
        { label: 'style.ascii.caseKeep', value: 0 },
        { label: 'style.ascii.caseUpper', value: 1 },
        { label: 'style.ascii.caseLower', value: 2 },
      ], default: 0, description: 'style.ascii.caseModeDesc' },
      { name: 'style.ascii.charColor', uniform: 'uCharColor', type: 'color' as const, default: '#00ff66', description: 'style.ascii.charColorDesc' },
      { name: 'style.ascii.showBg', uniform: 'uShowBg', type: 'toggle' as const, default: 1, description: 'style.ascii.showBgDesc' },
      { name: 'style.ascii.charScale', uniform: 'uCharScale', min: 0.5, max: 1.5, step: 0.05, default: 1.0, description: 'style.ascii.charScaleDesc' },
      { name: 'style.ascii.cellSize', uniform: 'uCellSize', min: 6, max: 40, step: 1, default: 14, description: 'style.ascii.cellSizeDesc' },
      { name: 'style.ascii.randomScale', uniform: 'uRandomScale', min: 0, max: 1, step: 0.05, default: 0, description: 'style.ascii.randomScaleDesc' },
      { name: 'style.ascii.bgFilter', uniform: 'uBgFilter', min: 0, max: 0.5, step: 0.01, default: 0.12, description: 'style.ascii.bgFilterDesc' },
    ],
  },
```

> 注意：`shaderImports: []`（ASCII 不用 shader）。`renderMode: 'canvas2d'` 触发 App2D 分流（Task 7）。

- [ ] **Step 2: 添加英文文案**

在 `src/i18n/en.json` 的 `"style": { ... }` 对象内（与 `textraster` 同级）追加：

```json
    "ascii": {
      "label": "ASCII Art",
      "desc": "Convert an image into ASCII character art using a custom character set, with adjustable density, color and background filtering.",
      "charset": "Character Set",
      "charsetDesc": "Any mix of CJK, letters, digits and symbols. Characters are sorted by ink density automatically.",
      "font": "Custom Font",
      "fontDesc": "Upload TTF / WOFF / OTF. Falls back to monospace if none.",
      "caseMode": "Letter Case",
      "caseModeDesc": "Applies to ASCII letters only.",
      "caseKeep": "Keep",
      "caseUpper": "UPPERCASE",
      "caseLower": "lowercase",
      "charColor": "Character Color",
      "charColorDesc": "Fill color of every character.",
      "showBg": "Show Original Background",
      "showBgDesc": "Overlay the original image beneath the characters.",
      "charScale": "Character Size",
      "charScaleDesc": "Character size relative to its cell.",
      "cellSize": "Density / Spacing",
      "cellSizeDesc": "Cell size in pixels — smaller means denser characters.",
      "randomScale": "Random Scale",
      "randomScaleDesc": "Random per-character scaling for depth. 0 disables.",
      "bgFilter": "Background Filter",
      "bgFilterDesc": "Skip flat low-contrast regions; higher skips more."
    }
```

项目当前**无** `export` 节点（仅有 `common.download`）。`ActionBar` 会使用 `export.png` / `export.jpg` / `export.svg`，因此需在 `en.json` 顶层（与 `common`、`style` 同级）**新建** `export` 节点：

```json
  "export": {
    "png": "PNG",
    "jpg": "JPG",
    "svg": "SVG"
  }
```

- [ ] **Step 3: 添加中文文案**

在 `src/i18n/zh.json` 对应位置追加：

```json
    "ascii": {
      "label": "ASCII字符艺术",
      "desc": "将图像转换为ASCII字符艺术，可自定义字符集，调节密度、颜色与背景过滤。",
      "charset": "字符集",
      "charsetDesc": "支持中英文、数字、符号任意组合。系统按墨迹密度自动排序映射。",
      "font": "自定义字体",
      "fontDesc": "上传 TTF / WOFF / OTF 字体文件，未上传时使用系统等宽字体。",
      "caseMode": "大小写转换",
      "caseModeDesc": "仅对英文字母生效。",
      "caseKeep": "保持不变",
      "caseUpper": "全部大写",
      "caseLower": "全部小写",
      "charColor": "字符颜色",
      "charColorDesc": "每个字符的填充颜色。",
      "showBg": "显示原图背景",
      "showBgDesc": "在字符层下方叠加原始图片。",
      "charScale": "字符大小",
      "charScaleDesc": "字符在格子内的填充比例。",
      "cellSize": "字符间距/疏密",
      "cellSizeDesc": "格子像素尺寸，越小字符越密集。",
      "randomScale": "字符随机缩放",
      "randomScaleDesc": "为字符添加随机缩放增强层次感，0 为关闭。",
      "bgFilter": "背景过滤",
      "bgFilterDesc": "过滤低对比度的平淡区域，数值越大过滤越多。"
    }
```

在 `zh.json` 顶层同样**新建** `export` 节点：

```json
  "export": {
    "png": "PNG",
    "jpg": "JPG",
    "svg": "SVG"
  }
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/lib/StyleRegistry.ts src/i18n/en.json src/i18n/zh.json
git commit -m "feat(ascii): register ascii style and i18n strings"
```

---

## Task 7: App2D 渲染分流 + fontParams 第三通道 + ParamPanel font 控件

**Files:**
- Modify: `src/components/App2D.tsx`
- Modify: `src/components/ParamPanel.tsx`

这是本计划的核心集成任务。务必逐项完成，缺一项都会导致崩溃或字体上传不重绘。

- [ ] **Step 1: ParamPanel 加 font 通道**

修改 `src/components/ParamPanel.tsx`。

1.1 props 接口（第 4-16 行）增加两个字段：

```ts
interface ParamPanelProps {
  title: string
  description?: string
  params?: ParamDef[]
  values?: Record<string, number>
  textValues?: Record<string, string>
  fontValues?: Record<string, FontFace | null | undefined>
  onChange?: (uniform: string, value: number) => void
  onTextChange?: (uniform: string, value: string) => void
  onFontChange?: (uniform: string, font: FontFace | null) => void
  onClose?: () => void
  defaultPos?: { x: number; y: number }
  children?: ReactNode
  defaultCollapsed?: boolean
}
```

1.2 `renderParam` 函数签名（第 24-30 行）增加两个参数：

```ts
function renderParam(
  param: ParamDef,
  values: Record<string, number>,
  textValues: Record<string, string>,
  onChange: (u: string, v: number) => void,
  onTextChange: (u: string, v: string) => void,
  onFontChange: (u: string, f: FontFace | null) => void,
  fontValues: Record<string, FontFace | null | undefined>,
) {
```

1.3 在 `select` 分支之后、默认 number 分支之前，新增 `font` 分支：

```tsx
  if (param.type === 'font') {
    const current = fontValues[param.uniform]
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) {
        onFontChange(param.uniform, null)
        return
      }
      file.arrayBuffer().then((buf) => {
        const family = file.name.replace(/\.[^.]+$/, '')
        const face = new FontFace(family, buf)
        face.load().then(() => {
          document.fonts.add(face)
          onFontChange(param.uniform, face)
        }).catch(() => onFontChange(param.uniform, null))
      })
    }
    return (
      <div key={param.uniform} className="param-row">
        <div className="param-header">
          <span className="param-label">
            {param.name}
            {param.description && (
              <span className="param-tooltip-wrap">
                <span className="param-tooltip-icon">?</span>
                <span className="param-tooltip-text">{param.description}</span>
              </span>
            )}
          </span>
        </div>
        <label className="param-font-upload">
          <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFile} />
          <span className="param-font-name">{current ? current.family : ''}</span>
        </label>
      </div>
    )
  }
```

1.4 `ParamPanel` 主函数解构与调用处（第 139 行签名与第 188 行调用）传入新参数：

```ts
function ParamPanel({ title, description, params, values, textValues, fontValues, onChange, onTextChange, onFontChange, onClose, defaultPos, children, defaultCollapsed }: ParamPanelProps) {
```

第 188 行的 `params?.map(...)` 调用改为：

```tsx
{children ?? params?.map((p) => renderParam(
  p,
  values ?? {},
  textValues ?? {},
  onChange ?? (() => {}),
  onTextChange ?? (() => {}),
  onFontChange ?? (() => {}),
  fontValues ?? {},
))}
```

- [ ] **Step 2: App2D 加 fontParams 状态与迭代跳过**

修改 `src/components/App2D.tsx`。

2.1 顶部 import 增加（第 4 行后）：

```ts
import { AsciiCanvasRenderer, type AsciiRenderParams } from '../lib/AsciiCanvasRenderer'
```

2.2 在 `rendererRef` 之后增加 ascii 渲染器与 fontParams 状态（约第 55 行后）：

```ts
  const asciiRendererRef = useRef<AsciiCanvasRenderer | null>(null)
  const [fontParams, setFontParams] = useState<Record<string, FontFace | null>>({})
```

2.3 `initParams`（第 16-25 行）的跳过条件加上 `font`：

```ts
    if (p.type === 'text' || p.type === 'color' || p.type === 'font') continue
```

2.4 `handleStyleChange`（第 159-160 行）的跳过条件加上 `font`：

```ts
        if (p.type === 'text' || p.type === 'color' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
```

并在该函数末尾 `setParams(randomParams)` 之前清空 fontParams：

```ts
      setFontParams({})
```

2.5 `handleRandom`（第 217 行）的跳过条件同样加 `font`：

```ts
      if (p.type === 'text' || p.type === 'color' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
```

2.6 新增 `handleFontChange`（放在 `handleTextChange` 之后）：

```ts
  const handleFontChange = useCallback((uniform: string, font: FontFace | null) => {
    setFontParams((prev) => ({ ...prev, [uniform]: font }))
  }, [])
```

- [ ] **Step 3: renderWithStyle 顶部按 renderMode 分流**

修改 `src/components/App2D.tsx` 的 `renderWithStyle`（第 61-114 行）。

3.1 签名增加 `currentFontParams`：

```ts
    async (styleId: StyleId, currentParams: Record<string, number>, currentTextParams: Record<string, string>, currentFontParams: Record<string, FontFace | null>) => {
```

3.2 **调整函数顶部守卫**（关键，否则 ASCII 渲染空白）并插入 canvas2d 分流。

原始函数顶部（第 63-65 行）是 `if (!canvas || !renderer) return`——ASCII 不创建 `ShaderRenderer`，`renderer` 为 null 会在此**早返回，永远到不了分流**。必须先把守卫改为只检查 canvas，`renderer` 的检查移到下方 shader 分支内。

把函数开头三行：

```ts
      const canvas = canvasRef.current
      const renderer = rendererRef.current
      if (!canvas || !renderer) return
```

改为：

```ts
      const canvas = canvasRef.current
      if (!canvas) return
      const renderer = rendererRef.current
```

然后在取得 `styleDef` 之后、text-texture 块**之前**插入 canvas2d 分流并立即 return（`renderer` 仅 shader 分支需要，故在分流后才检查）：

```ts
      const styleDef = getStyle(styleId)
      if (!styleDef) return

      // ----- canvas2d branch (ASCII) — must return BEFORE the WebGL text-texture block -----
      if (styleDef.renderMode === 'canvas2d') {
        if (!asciiRendererRef.current) asciiRendererRef.current = new AsciiCanvasRenderer()
        const fp = currentFontParams['uFont'] ?? null
        asciiRendererRef.current.render(canvas, image, {
          charset: currentTextParams['uCharset'] ?? '',
          caseMode: currentParams['uCaseMode'] ?? 0,
          charColor: currentTextParams['uCharColor'] ?? '#00ff66',
          showBg: currentParams['uShowBg'] ?? 1,
          charScale: currentParams['uCharScale'] ?? 1.0,
          cellSize: currentParams['uCellSize'] ?? 14,
          randomScale: currentParams['uRandomScale'] ?? 0,
          bgFilter: currentParams['uBgFilter'] ?? 0.12,
        }, fp)
        return
      }
      // ----- end canvas2d branch -----

      // shader 分支：ASCII 已 return，此处才需要 renderer
      if (!renderer) return
      // ... 原有 text-texture / shader 逻辑保持不变（继续使用 renderer）
```

> `canvas` 已在顶部守卫确认非空，分流内直接使用；`image` 由 effect 守卫保证已加载，无需断言。

3.2.1 **useCallback 依赖必须加 `image`**（关键）：原 `renderWithStyle` 的 `useCallback` 依赖数组为 `[]`（它原本不读 `image`）。ASCII 分支通过闭包读取 `image`，若依赖仍为 `[]`，闭包里的 `image` 永远是初始 `null`，ASCII 拿不到图。把 `renderWithStyle` 的依赖数组从 `[]` 改为 `[image]`。

3.3 重渲染 `useEffect`（第 178-181 行）增加 `fontParams` 依赖并传参：

```ts
  useEffect(() => {
    if (!image || !rendererRef.current) return
    renderWithStyle(activeStyle, params, textParams, fontParams)
  }, [image, activeStyle, params, textParams, fontParams, renderWithStyle])
```

> 注意：此 effect 的守卫 `!rendererRef.current` 对 ASCII 不成立（ASCII 不创建 ShaderRenderer）。需调整守卫——见 Step 3.4。

3.4 调整该 effect 的守卫，使 ASCII 也能触发。改为：

```ts
  useEffect(() => {
    if (!image) return
    const styleDef = getStyle(activeStyle)
    // ASCII uses a lazy AsciiCanvasRenderer; shader styles need rendererRef.
    if (styleDef?.renderMode !== 'canvas2d' && !rendererRef.current) return
    renderWithStyle(activeStyle, params, textParams, fontParams)
  }, [image, activeStyle, params, textParams, fontParams, renderWithStyle])
```

3.5 卸载清理（第 187-194 行）一并销毁 ascii 渲染器：

```ts
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy()
        rendererRef.current = null
      }
      asciiRendererRef.current = null
    }
  }, [])
```

- [ ] **Step 4: ParamPanel 传入新 props**

修改 App2D 的 `<ParamPanel ... />`（第 311-321 行），增加 `fontValues` 与 `onFontChange`：

```tsx
      {image && currentStyle && (
        <ParamPanel
          title={t(currentStyle.label)}
          description={t(currentStyle.description)}
          params={currentStyle.params.map(p => ({ ...p, name: t(p.name), description: p.description ? t(p.description) : undefined }))}
          values={params}
          textValues={textParams}
          fontValues={fontParams}
          onChange={handleParamChange}
          onTextChange={handleTextChange}
          onFontChange={handleFontChange}
        />
      )}
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无错误。注意 `t()` 对 `select` 的 `options[].label`（i18n key）需要在渲染时翻译——见 Step 6。

- [ ] **Step 6: select 选项 label 翻译（重要）**

ASCII 的 `caseMode` 是 select，其 `options[].label` 是 i18n key（`style.ascii.caseKeep` 等）。但现有 App2D 对 `params` 做了 `.map(p => ({ ...p, name: t(p.name) }))`，未翻译 select 的 options。

在 App2D 的 ParamPanel 调用处，把 params 映射改为对 select 的 options 也翻译：

```tsx
          params={currentStyle.params.map(p => {
            if (p.type === 'select') {
              return {
                ...p,
                name: t(p.name),
                description: p.description ? t(p.description) : undefined,
                options: p.options.map(o => ({ ...o, label: t(o.label) })),
              }
            }
            return { ...p, name: t(p.name), description: p.description ? t(p.description) : undefined }
          })}
```

- [ ] **Step 7: 类型检查 + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: 无错误。

- [ ] **Step 8: 手动验证（对照 spec §10 #1-#6, #9-#11）**

Run: `npm run dev`

在浏览器：
1. 上传一张图片（可用底部测试图 cake/car）。
2. 左侧切到「ASCII字符艺术」——参数面板显示 9 个参数（字符集、字体、大小写、颜色、显示背景、字符大小、疏密、随机缩放、背景过滤）。
3. 画面出现 ASCII 字符效果：亮区稀疏字符、暗区密集字符。
4. 拖动各滑块/输入字符集，预览实时更新。
5. 上传一个 TTF 字体，字符变为该字体（上传后应自动重绘）。
6. 大小写转换对英文生效、中文符号不变。
7. 提高「背景过滤」，平淡区字符减少；关闭「显示原图背景」后字符直接画在透明底上。
8. 切回 halftone 等其他风格仍正常（回归）。
9. Reset / Random 工作正常（字符集/字体/颜色不被随机）。

Expected: 全部符合预期。

- [ ] **Step 9: Commit**

```bash
git add src/components/App2D.tsx src/components/ParamPanel.tsx
git commit -m "feat(ascii): wire canvas2d render branch + font param channel"
```

---

## Task 8: 三格式导出 (JPG / PNG / SVG) + ActionBar

**Files:**
- Modify: `src/components/ActionBar.tsx`
- Modify: `src/components/App2D.tsx`

- [ ] **Step 1: ActionBar 支持三格式**

修改 `src/components/ActionBar.tsx`，整体替换为：

```tsx
import { useTranslation } from 'react-i18next'

interface ActionBarProps {
  onDownloadPng: () => void
  onDownloadJpg?: () => void
  onDownloadSvg?: () => void
  renderMode?: 'shader' | 'canvas2d'
  onReset: () => void
  onRandom: () => void
  imageInfo: { width: number; height: number; size: string } | null
}

function ActionBar({ onDownloadPng, onDownloadJpg, onDownloadSvg, renderMode, onReset, onRandom, imageInfo }: ActionBarProps) {
  const { t } = useTranslation()
  const isCanvas2d = renderMode === 'canvas2d'

  return (
    <div className="action-bar">
      {isCanvas2d ? (
        <>
          <button className="action-btn" onClick={onDownloadJpg}>{t('export.jpg')}</button>
          <button className="action-btn" onClick={onDownloadPng}>{t('export.png')}</button>
          <button className="action-btn action-btn--primary" onClick={onDownloadSvg}>{t('export.svg')}</button>
        </>
      ) : (
        <button className="action-btn" onClick={onDownloadPng}>{t('common.download')}</button>
      )}
      <button className="action-btn action-btn--secondary" onClick={onReset}>{t('common.reset')}</button>
      <button className="action-btn action-btn--secondary" onClick={onRandom}>{t('common.random')}</button>
      {imageInfo && (
        <div className="image-info">
          {imageInfo.width} x {imageInfo.height} | {imageInfo.size}
        </div>
      )}
    </div>
  )
}

export default ActionBar
```

> 确认 `export.png` 文案存在；若无则用 `common.download`。`action-btn--primary` 样式在 Task 10 添加。

- [ ] **Step 2: App2D 实现三个导出函数**

修改 `src/components/App2D.tsx`。把现有 `handleDownload`（第 226-238 行）替换为三个函数：

```ts
  const downloadBlob = useCallback((blob: Blob | null, ext: string) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeStyle}_${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }, [activeStyle])

  const handleDownloadPng = useCallback(() => {
    canvasRef.current?.toBlob((b) => downloadBlob(b, 'png'), 'image/png')
  }, [downloadBlob])

  const handleDownloadJpg = useCallback(() => {
    // JPG has no alpha: composite onto black if background is off.
    const styleDef = getStyle(activeStyle)
    const showBg = params['uShowBg'] ?? 1
    if (styleDef?.renderMode === 'canvas2d' && showBg !== 1) {
      const src = canvasRef.current
      if (!src) return
      const tmp = document.createElement('canvas')
      tmp.width = src.width; tmp.height = src.height
      const ctx = tmp.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, tmp.width, tmp.height)
      ctx.drawImage(src, 0, 0)
      tmp.toBlob((b) => downloadBlob(b, 'jpg'), 'image/jpeg')
      return
    }
    canvasRef.current?.toBlob((b) => downloadBlob(b, 'jpg'), 'image/jpeg')
  }, [activeStyle, params, downloadBlob])

  const handleDownloadSvg = useCallback(() => {
    const family = fontParams['uFont']?.family ?? 'monospace'
    const svg = asciiRendererRef.current?.exportSvg(family)
    if (!svg) return
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'svg')
  }, [fontParams, downloadBlob])
```

- [ ] **Step 3: ActionBar 调用处传入新 props**

修改 App2D 的 `<ActionBar ... />`（第 305-310 行）：

```tsx
      <ActionBar
        onDownloadPng={handleDownloadPng}
        onDownloadJpg={handleDownloadJpg}
        onDownloadSvg={handleDownloadSvg}
        renderMode={currentStyle?.renderMode}
        onReset={handleReset}
        onRandom={handleRandom}
        imageInfo={imageInfo}
      />
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无错误。

- [ ] **Step 5: 手动验证（对照 spec §10 #7）**

Run: `npm run dev`

在 ASCII 风格下：
1. 点 JPG / PNG / SVG 各导出一次，文件正确下载（`.jpg` / `.png` / `.svg`）。
2. 用浏览器打开导出的 SVG，放大不失真，且只有字符、无原图位图。
3. 关闭「显示原图背景」：PNG 导出透明背景；JPG 导出为黑底。
4. 切到 halftone 等其他风格：ActionBar 回到单 PNG 按钮，导出 PNG 正常（回归）。

Expected: 全部符合预期。

- [ ] **Step 6: Commit**

```bash
git add src/components/ActionBar.tsx src/components/App2D.tsx
git commit -m "feat(ascii): add JPG/PNG/SVG export with format-aware ActionBar"
```

---

## Task 9: 缩放控件 (ZoomControl)

**Files:**
- Create: `src/components/ZoomControl.tsx`
- Modify: `src/components/CompareSlider.tsx`
- Modify: `src/components/App2D.tsx`

**说明：** 缩放用 CSS `transform: scale()` 作用于 canvas 显示尺寸，不改变 canvas 内部分辨率，不影响导出。缩放状态放在 App2D，传给 CompareSlider 包裹 canvas。

- [ ] **Step 1: 新建 ZoomControl.tsx**

Create `src/components/ZoomControl.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

interface ZoomControlProps {
  zoom: number
  onZoom: (z: number) => void
  min?: number
  max?: number
  step?: number
}

function ZoomControl({ zoom, onZoom, min = 0.2, max = 4, step = 0.2 }: ZoomControlProps) {
  const { t } = useTranslation()
  const clamp = (z: number) => Math.min(max, Math.max(min, z))
  return (
    <div className="zoom-control">
      <button className="zoom-btn" onClick={() => onZoom(clamp(zoom - step))} title="-">−</button>
      <span className="zoom-label">{Math.round(zoom * 100)}%</span>
      <button className="zoom-btn" onClick={() => onZoom(clamp(zoom + step))} title="+">+</button>
      <button className="zoom-btn zoom-reset" onClick={() => onZoom(1)} title={t('common.reset')}>{t('common.reset')}</button>
    </div>
  )
}

export default ZoomControl
```

- [ ] **Step 2: CompareSlider 接收 zoom 并应用 transform**

修改 `src/components/CompareSlider.tsx`。

2.1 props 接口（第 4-10 行）增加 `zoom`：

```ts
interface CompareSliderProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  originalImage: HTMLImageElement | null
  compareMode: boolean
  zoom: number
  onToggleCompare: () => void
  onClose: () => void
}
```

2.2 解构加入 `zoom`（第 12-18 行）。

2.3 给 `<canvas ref={canvasRef} />`（第 102 行）套一个 transform 容器，并把 ZoomControl 放到 `.compare-container` 内。把第 96-128 行的 `.canvas-wrapper` 内部与闭合处改为：

```tsx
      <div className="canvas-wrapper" ref={containerRef} onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
        <div className="canvas-scaler" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          <canvas ref={canvasRef} />

          {compareMode && originalImage && (
            <img
              src={originalImage.src}
              alt="Original"
              style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none',
                clipPath: `inset(0 ${clipInsetPercent}% 0 0)`,
              }}
            />
          )}

          {compareMode && (
            <div className="compare-divider" style={{ left: `${sliderPosition * 100}%` }} />
          )}
        </div>
      </div>

      <ZoomControl zoom={zoom} onZoom={onZoom} />
```

2.4 顶部 import 增加：

```ts
import ZoomControl from './ZoomControl'
```

2.5 props 解构补充 `onZoom` 透传：因 ZoomControl 的 `onZoom` 由 App2D 提供，需在 CompareSliderProps 增加 `onZoom: (z: number) => void`，并解构传入 `<ZoomControl zoom={zoom} onZoom={onZoom} />`。

> 完整 CompareSliderProps 应含：`canvasRef, originalImage, compareMode, zoom, onZoom, onToggleCompare, onClose`。

- [ ] **Step 3: App2D 加 zoom 状态并传入**

修改 `src/components/App2D.tsx`。

3.1 在 `fontParams` 状态附近增加：

```ts
  const [zoom, setZoom] = useState(1)
```

3.2 `<CompareSlider ... />`（第 283-289 行）增加 `zoom` / `onZoom`：

```tsx
          <CompareSlider
            canvasRef={canvasRef}
            originalImage={image}
            compareMode={compareMode}
            zoom={zoom}
            onZoom={setZoom}
            onToggleCompare={() => setCompareMode((prev) => !prev)}
            onClose={() => setShowCloseDialog(true)}
          />
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无错误。

- [ ] **Step 5: 手动验证（对照 spec §10 #8）**

Run: `npm run dev`

1. 上传图后，右下角出现缩放控件，显示 100%。
2. 点 `−` / `+` 缩放预览；点「还原」回到 100%。
3. 缩放后导出 PNG/SVG，分辨率与缩放前一致（导出不受缩放影响）。
4. 原图对比模式在缩放下仍可用。

Expected: 全部符合预期。

- [ ] **Step 6: Commit**

```bash
git add src/components/ZoomControl.tsx src/components/CompareSlider.tsx src/components/App2D.tsx
git commit -m "feat(ascii): add zoom control (css-transform display scaling)"
```

---

## Task 10: 样式 + 全量回归 + 收尾

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/components/ImageUploader.tsx`（性能提示文案，可选）

- [ ] **Step 1: 新控件样式**

在 `src/styles/global.css` 末尾追加：

```css
/* ---- ASCII font upload ---- */
.param-font-upload {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.param-font-upload input[type="file"] { font-size: 12px; }
.param-font-name { font-size: 12px; color: var(--muted, #888); }

/* ---- primary action button (SVG export) ---- */
.action-btn--primary {
  background: #00ff66;
  color: #000;
  font-weight: 600;
  border: none;
}

/* ---- zoom control ---- */
.zoom-control {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  z-index: 5;
}
.zoom-btn {
  min-width: 24px;
  height: 24px;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
  border-radius: 4px;
}
.zoom-label { min-width: 42px; text-align: center; }
```

> 颜色/间距与现有主题协调即可；`--muted` 若不存在用字面值。`action-btn--primary` 的荧光绿对应 SVG 主按钮。

- [ ] **Step 2: （可选）上传区性能提示**

在 `src/components/ImageUploader.tsx` 的上传按钮下方加一行小字提示「避免卡顿，图像建议控制在 2K 分辨率内」（用 i18n key，如 `app2d.sizeHint`，并在 en/zh.json 补对应文案）。若时间紧可跳过，记为后续 polish。

- [ ] **Step 3: 全量单测**

Run: `npm test`
Expected: density / image / svg 全部 PASS。

- [ ] **Step 4: 类型检查 + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: 无错误。

- [ ] **Step 5: 生产构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动全量回归（对照 spec §10 全部 12 项）**

Run: `npm run dev`

逐项核对 spec §10 测试清单 #1-#12：
- ASCII 风格列表、参数面板、实时渲染、密度映射、字体上传、大小写、背景过滤、三格式导出、SVG 矢量、缩放、原图对比、中英文、Reset/Random、**切回其他 10 个 shader 风格正常**。

Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add src/styles/global.css src/components/ImageUploader.tsx src/i18n/en.json src/i18n/zh.json
git commit -m "feat(ascii): add styles for font/zoom/primary export buttons"
```

---

## 完成标准

- [ ] 所有 Task 的 checkbox 完成
- [ ] `npm test` 全绿（3 个纯函数测试文件）
- [ ] `npm run build` 成功
- [ ] spec §10 全部 12 项手动验证通过
- [ ] 10 个 shader 风格回归正常
- [ ] 每个_task_都有独立 commit

## 预留接口（不在本计划实现）

视频序列帧 / GIF / MP4 —— `AsciiCanvasRenderer.render` 已设计为单帧无状态（仅缓存 `lastMatrix` 供 SVG），未来逐帧调用即可接入序列帧管线，无需重构。
