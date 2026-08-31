# 2D 参数控件类型改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2D 风格注册表中 11 个误用滑条的参数改为 select(7)/toggle(4)，并给所有数字滑条加数值内联编辑（点击键入精确值）。

**Architecture:** 纯声明式改造——只改 StyleRegistry 的参数类型定义、i18n 文案、ParamPanel 渲染；uniform 值/默认值/shader/preset/seed/随机逻辑零改动。新增 `src/lib/paramValue.ts` 纯函数承载 clamp+step 对齐逻辑（TDD）。

**Tech Stack:** React 19 + TypeScript + vitest（node 环境，无 jsdom）。Spec: `docs/superpowers/specs/2026-08-31-2d-param-control-types-design.md`

**项目约束：**
- UI 禁止 emoji，图标一律内联 SVG（本次无新图标需求）
- lint 基线 11 个既有错误均在 3D 文件——验收标准是**不新增**
- 注释与 commit message 用中文

---

### Task 1: snapToStep 纯函数（TDD）

**Files:**
- Create: `src/lib/paramValue.ts`
- Test: `src/lib/paramValue.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/lib/paramValue.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { snapToStep } from './paramValue'

describe('snapToStep', () => {
  it('clamps 到 [min,max]', () => {
    expect(snapToStep(999, 2, 50, 1, 15)).toBe(50)
    expect(snapToStep(-5, 2, 50, 1, 15)).toBe(2)
  })

  it('按 step 对齐（整数 step）', () => {
    expect(snapToStep(14.4, 2, 50, 1, 15)).toBe(14)
    expect(snapToStep(14.6, 2, 50, 1, 15)).toBe(15)
  })

  it('按 step 对齐（小数 step）且无浮点尾巴', () => {
    const v = snapToStep(0.256, 0, 1, 0.01, 0.5)
    expect(v).toBeCloseTo(0.26, 10)
    expect(String(v)).toBe('0.26')
  })

  it('相对 min 的网格对齐（min=0.5, step=0.1）', () => {
    expect(snapToStep(0.73, 0.5, 2, 0.1, 1)).toBeCloseTo(0.7, 10)
  })

  it('NaN / Infinity 回退 fallback', () => {
    expect(snapToStep(NaN, 2, 50, 1, 15)).toBe(15)
    expect(snapToStep(Infinity, 2, 50, 1, 15)).toBe(15)
  })

  it('step 不整除范围时结果不超过 max', () => {
    // min=2 max=50 step=7：50 → 2 + round(48/7)*7 = 51 → 需再 clamp 到 50
    expect(snapToStep(50, 2, 50, 7, 15)).toBe(50)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/paramValue.test.ts`
Expected: FAIL，报错模块 `./paramValue` 不存在

- [ ] **Step 3: 写实现**

创建 `src/lib/paramValue.ts`：

```ts
// 2D 参数面板数值输入的纯数学，不依赖 React/DOM，便于单测。

/**
 * 把键入值规范化为参数合法值：
 * NaN/Infinity 返回 fallback；clamp 到 [min,max]；相对 min 按 step 对齐并修浮点误差。
 * 对齐后可能因 step 不整除范围而超出 max（如 min=2 max=50 step=7），故再 clamp 一次。
 */
export function snapToStep(
  v: number,
  min: number,
  max: number,
  step: number,
  fallback: number,
): number {
  if (!Number.isFinite(v)) return fallback
  const clamped = Math.min(max, Math.max(min, v))
  const snapped = Math.min(max, min + Math.round((clamped - min) / step) * step)
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return parseFloat(snapped.toFixed(decimals))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/paramValue.test.ts`
Expected: PASS（6 个用例全绿）

- [ ] **Step 5: Commit**

```bash
git add src/lib/paramValue.ts src/lib/paramValue.test.ts
git commit -m "feat(lib): snapToStep 数值规范化纯函数——clamp/step 对齐/浮点精度/NaN 回退"
```

---

### Task 2: i18n 新增选项 label + 重写 11 个 Desc

**Files:**
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`

先新增（未被引用也无害，Task 3 的 registry 将引用它们）。

- [ ] **Step 1: zh.json 新增 21 个选项 key**

在 `style.halftone` 对象内（与既有 `colorModeDesc` 等同级）追加：

```json
"modeGray": "灰度",
"modeColor": "彩色",
"modeDuotone": "双色调",
"shapeCircle": "圆形",
"shapeSquare": "方形",
"shapeDiamond": "菱形",
```

`style.diffusion` 内追加：

```json
"noiseOrdered4": "4×4有序抖动",
"noiseOrdered8": "8×8有序抖动",
"noiseRandom": "随机噪声",
```

`style.popart` 内追加：

```json
"paletteOriginal": "原色",
"paletteWarm": "暖色",
"paletteCool": "冷色",
"paletteNeon": "霓虹",
"paletteVintage": "复古",
```

`style.sketch` 内追加：

```json
"edgeSobel": "Sobel",
"edgePrewitt": "Prewitt",
"bgWhite": "白色",
"bgNavy": "深蓝",
```

`style.pointillism` 内追加：

```json
"shapeCircle": "圆形",
"shapeSquare": "方形",
"shapeTriangle": "三角形",
```

（halftone 与 pointillism 的 `shapeCircle`/`shapeSquare` 分属各自命名空间，各有一份——合计 21 个 key。）

- [ ] **Step 2: zh.json 重写 11 个 Desc**

替换现有值（key 不变）：

| key | 新值（zh） |
|---|---|
| `style.halftone.colorModeDesc` | `"输出色彩模式"` |
| `style.halftone.shapeDesc` | `"网点形状"` |
| `style.diffusion.noiseTypeDesc` | `"抖动噪声类型"` |
| `style.diffusion.grayscaleDesc` | `"开启后输出灰度图像"` |
| `style.popart.paletteDesc` | `"色调映射调色板"` |
| `style.popart.benDayDesc` | `"叠加本戴点（Ben-Day Dots）网点效果"` |
| `style.sketch.edgeMethodDesc` | `"边缘检测算法"` |
| `style.sketch.bgColorDesc` | `"纸张背景色"` |
| `style.sketch.hatchingDesc` | `"叠加影线排线效果"` |
| `style.pointillism.shapeDesc` | `"笔触点形状"` |
| `style.crosshatch.invertDesc` | `"反转线条与背景（黑底白线）"` |

- [ ] **Step 3: en.json 同步**

`style.halftone`: `"modeGray": "Grayscale"`, `"modeColor": "Color"`, `"modeDuotone": "Duotone"`, `"shapeCircle": "Circle"`, `"shapeSquare": "Square"`, `"shapeDiamond": "Diamond"`

`style.diffusion`: `"noiseOrdered4": "4×4 Ordered"`, `"noiseOrdered8": "8×8 Ordered"`, `"noiseRandom": "Random Noise"`

`style.popart`: `"paletteOriginal": "Original"`, `"paletteWarm": "Warm"`, `"paletteCool": "Cool"`, `"paletteNeon": "Neon"`, `"paletteVintage": "Vintage"`

`style.sketch`: `"edgeSobel": "Sobel"`, `"edgePrewitt": "Prewitt"`, `"bgWhite": "White"`, `"bgNavy": "Navy"`

`style.pointillism`: `"shapeCircle": "Circle"`, `"shapeSquare": "Square"`, `"shapeTriangle": "Triangle"`

Desc 重写（en）：

| key | 新值（en） |
|---|---|
| `style.halftone.colorModeDesc` | `"Output color mode"` |
| `style.halftone.shapeDesc` | `"Dot shape"` |
| `style.diffusion.noiseTypeDesc` | `"Dithering noise type"` |
| `style.diffusion.grayscaleDesc` | `"Output grayscale image when enabled"` |
| `style.popart.paletteDesc` | `"Tone-mapping palette"` |
| `style.popart.benDayDesc` | `"Overlay Ben-Day Dots effect"`（保持原文即可） |
| `style.sketch.edgeMethodDesc` | `"Edge detection algorithm"` |
| `style.sketch.bgColorDesc` | `"Paper background color"` |
| `style.sketch.hatchingDesc` | `"Overlay hatching strokes"` |
| `style.pointillism.shapeDesc` | `"Dot shape"` |
| `style.crosshatch.invertDesc` | `"Invert line and background (white on black)"` |

- [ ] **Step 4: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/zh.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/i18n/zh.json src/i18n/en.json
git commit -m "feat(i18n): 21 个枚举选项 label + 11 个参数描述去数值编码改自然文案"
```

---

### Task 3: StyleRegistry 11 个参数改类型

**Files:**
- Modify: `src/lib/StyleRegistry.ts`

只改类型定义；uniform 名、数值、default 一律不动。

- [ ] **Step 1: 逐参数替换**

halftone（[StyleRegistry.ts:15](../../src/lib/StyleRegistry.ts)）`uColorMode` 行替换为：

```ts
      { name: 'style.halftone.colorMode', uniform: 'uColorMode', type: 'select' as const, options: [
        { label: 'style.halftone.modeGray', value: 0 },
        { label: 'style.halftone.modeColor', value: 1 },
        { label: 'style.halftone.modeDuotone', value: 2 },
      ], default: 1, description: 'style.halftone.colorModeDesc' },
```

halftone `uShape` 行替换为：

```ts
      { name: 'style.halftone.shape', uniform: 'uShape', type: 'select' as const, options: [
        { label: 'style.halftone.shapeCircle', value: 0 },
        { label: 'style.halftone.shapeSquare', value: 1 },
        { label: 'style.halftone.shapeDiamond', value: 2 },
      ], default: 1, description: 'style.halftone.shapeDesc' },
```

diffusion `uNoiseType` 行替换为：

```ts
      { name: 'style.diffusion.noiseType', uniform: 'uNoiseType', type: 'select' as const, options: [
        { label: 'style.diffusion.noiseOrdered4', value: 0 },
        { label: 'style.diffusion.noiseOrdered8', value: 1 },
        { label: 'style.diffusion.noiseRandom', value: 2 },
      ], default: 1, description: 'style.diffusion.noiseTypeDesc' },
```

diffusion `uGrayscale` 行替换为：

```ts
      { name: 'style.diffusion.grayscale', uniform: 'uGrayscale', type: 'toggle' as const, default: 0, description: 'style.diffusion.grayscaleDesc' },
```

popart `uPalette` 行替换为：

```ts
      { name: 'style.popart.palette', uniform: 'uPalette', type: 'select' as const, options: [
        { label: 'style.popart.paletteOriginal', value: 0 },
        { label: 'style.popart.paletteWarm', value: 1 },
        { label: 'style.popart.paletteCool', value: 2 },
        { label: 'style.popart.paletteNeon', value: 3 },
        { label: 'style.popart.paletteVintage', value: 4 },
      ], default: 3, description: 'style.popart.paletteDesc' },
```

popart `uBenDay` 行替换为：

```ts
      { name: 'style.popart.benDay', uniform: 'uBenDay', type: 'toggle' as const, default: 1, description: 'style.popart.benDayDesc' },
```

sketch `uEdgeMethod` 行替换为：

```ts
      { name: 'style.sketch.edgeMethod', uniform: 'uEdgeMethod', type: 'select' as const, options: [
        { label: 'style.sketch.edgeSobel', value: 0 },
        { label: 'style.sketch.edgePrewitt', value: 1 },
      ], default: 1, description: 'style.sketch.edgeMethodDesc' },
```

sketch `uBgColor` 行替换为：

```ts
      { name: 'style.sketch.bgColor', uniform: 'uBgColor', type: 'select' as const, options: [
        { label: 'style.sketch.bgWhite', value: 0 },
        { label: 'style.sketch.bgNavy', value: 1 },
      ], default: 0, description: 'style.sketch.bgColorDesc' },
```

sketch `uHatching` 行替换为：

```ts
      { name: 'style.sketch.hatching', uniform: 'uHatching', type: 'toggle' as const, default: 0, description: 'style.sketch.hatchingDesc' },
```

pointillism `uShape` 行替换为：

```ts
      { name: 'style.pointillism.shape', uniform: 'uShape', type: 'select' as const, options: [
        { label: 'style.pointillism.shapeCircle', value: 0 },
        { label: 'style.pointillism.shapeSquare', value: 1 },
        { label: 'style.pointillism.shapeTriangle', value: 2 },
      ], default: 0, description: 'style.pointillism.shapeDesc' },
```

crosshatch `uInvert` 行替换为：

```ts
      { name: 'style.crosshatch.invert', uniform: 'uInvert', type: 'toggle' as const, default: 0, description: 'style.crosshatch.invertDesc' },
```

- [ ] **Step 2: 跑既有测试确认兼容**

Run: `npx vitest run src/lib/StyleRegistry.test.ts`
Expected: PASS（select/toggle 走 default 分支，循环断言天然兼容）

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b --pretty false`
Expected: 无输出（0 错误）

- [ ] **Step 4: Commit**

```bash
git add src/lib/StyleRegistry.ts
git commit -m "feat(registry): 11 个枚举/布尔参数滑条改 select/toggle——uniform 值域不变"
```

---

### Task 4: ParamPanel 内联编辑 + toggle/select tooltip + CSS

**Files:**
- Modify: `src/components/ParamPanel.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: import snapToStep 并加 ParamValueInput 组件**

[ParamPanel.tsx](../../src/components/ParamPanel.tsx) 顶部：

```ts
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { snapToStep } from '../lib/paramValue'
import type { ParamDef } from '../types'
```

在 `formatValue` 函数之后新增组件（已按质量审查修正：用 effect 聚焦而非 inline ref——inline ref 每次渲染重挂会导致每敲一键全选；另提取 ParamLabel 消除 5 处 tooltip 重复、preventDefault 防 label 内点击）：

```tsx
/** 参数名 + 可选「?」描述 tooltip。preventDefault 防止在 label 内（toggle 分支）点击图标触发勾选。 */
function ParamLabel({ name, description }: { name: string; description?: string }) {
  return (
    <span className="param-label">
      {name}
      {description && (
        <span className="param-tooltip-wrap" onClick={(e) => e.preventDefault()}>
          <span className="param-tooltip-icon">?</span>
          <span className="param-tooltip-text">{description}</span>
        </span>
      )}
    </span>
  )
}

/** 数字滑条数值标签：点击后内联编辑，Enter/失焦提交（clamp + step 对齐），Esc 取消。 */
function ParamValueInput({ value, min, max, step, name, onCommit }: {
  value: number
  min: number
  max: number
  step: number
  name: string
  onCommit: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const display = formatValue(value, step)

  // 进入编辑态时聚焦并全选。用 effect（依赖 [editing]）而非 inline ref：
  // inline ref 每次渲染都会重挂，导致每敲一键就全选、下一个字符覆盖全部输入。
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  if (!editing) {
    return (
      <span
        className="param-value param-value-editable"
        onClick={() => {
          setDraft(display)
          setEditing(true)
        }}
      >
        {display}
      </span>
    )
  }

  const commit = () => {
    setEditing(false)
    const v = parseFloat(draft)
    if (Number.isNaN(v)) return
    onCommit(snapToStep(v, min, max, step, value))
  }

  return (
    <input
      ref={inputRef}
      className="param-value-input"
      type="text"
      inputMode="decimal"
      aria-label={name}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return  // 输入法组合中的 Enter 不提交
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}
```

（import 行相应为 `import { useEffect, useRef, useState, type ReactNode } from 'react'`；滑条调用处传 `name={param.name}`。原计划"toggle/select 补 tooltip"的展开 JSX 由 `ParamLabel` 组件统一承担——text/font/slider 分支的既有 tooltip 也替换为该组件。）

- [ ] **Step 2: 滑条分支接入**

`renderParam` 末尾默认分支（number 滑条）里，替换：

```tsx
        <span className="param-value">{formatValue(values[param.uniform] ?? param.default, param.step)}</span>
```

为：

```tsx
        <ParamValueInput
          value={values[param.uniform] ?? param.default}
          min={param.min}
          max={param.max}
          step={param.step}
          onCommit={(v) => onChange(param.uniform, v)}
        />
```

- [ ] **Step 3: toggle 分支补 tooltip**

toggle 分支中替换：

```tsx
        <label className="param-toggle">
          <input
            type="checkbox"
            checked={(values[param.uniform] ?? param.default) === 1}
            onChange={(e) => onChange(param.uniform, e.target.checked ? 1 : 0)}
          />
          <span className="param-label">{param.name}</span>
        </label>
```

为：

```tsx
        <label className="param-toggle">
          <input
            type="checkbox"
            checked={(values[param.uniform] ?? param.default) === 1}
            onChange={(e) => onChange(param.uniform, e.target.checked ? 1 : 0)}
          />
          <span className="param-label">
            {param.name}
            {param.description && (
              <span className="param-tooltip-wrap">
                <span className="param-tooltip-icon">?</span>
                <span className="param-tooltip-text">{param.description}</span>
              </span>
            )}
          </span>
        </label>
```

- [ ] **Step 4: select 分支补 tooltip**

select 分支中替换：

```tsx
        <div className="param-header">
          <span className="param-label">{param.name}</span>
        </div>
        <select
```

为：

```tsx
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
        <select
```

（select 分支的 `param-header` div 与 font 分支的相似——注意只改 select 那一处，依据是它后面紧跟 `<select` 元素。）

- [ ] **Step 5: CSS**

[global.css](../../src/styles/global.css) 的 `.param-value` 规则（约 491 行）之后追加：

```css
.param-value-editable {
  cursor: text;
  border-bottom: 1px dotted #999;
}

.param-value-editable:hover {
  color: #000;
}

.param-value-input {
  width: 6ch;
  font-size: 12px;
  color: #000;
  background: #FFF;
  border: 1px solid #999;
  border-radius: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-variant-numeric: tabular-nums;
  text-align: right;
  padding: 1px 4px;
  outline: none;
}

.param-value-input:focus {
  border-color: #000;
}
```

（注意：`.param-panel` 为白底，输入框/hover 必须用黑字——原计划此处误写 `#FFF`，已修正。）

（视觉变量对齐现有黑白风格；若与暗色主题变量冲突，参照 `.param-slider`/`.param-text-input` 既有取值微调。）

- [ ] **Step 6: 验证**

Run: `npx tsc -b --pretty false && npx vitest run && npx eslint src/components/ParamPanel.tsx src/lib/paramValue.ts`
Expected: tsc 无输出；vitest 全绿（新增 6 用例 + 既有 76 = 82）；eslint exit 0

- [ ] **Step 7: Commit**

```bash
git add src/components/ParamPanel.tsx src/styles/global.css
git commit -m "feat(ui): 滑条数值内联编辑 + toggle/select 分支补描述 tooltip"
```

---

### Task 5: 全量回归验证

**Files:** 无新改动（只读验证）

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全绿（既有 76 + 新增 6 = 82）

- [ ] **Step 2: lint 全仓（确认不新增基线错误）**

Run: `npx eslint . 2>&1 | tail -5`
Expected: 仍为 11 个既有错误（全在 3D 文件），无新增

- [ ] **Step 3: 生产构建**

Run: `npm run build`
Expected: 成功，无类型错误

- [ ] **Step 4: 手动验收清单（留给用户，dev server: `npm run dev`）**

1. halftone：色彩模式/网点形状为下拉，选项与渲染结果一致
2. diffusion/popart/sketch/crosshatch：grayscale/benDay/hatching/invert 为开关
3. 任意滑条点数值 → 键入 217 回车生效；越界被 clamp；Esc 取消
4. 随机按钮：select/toggle 保持现值
5. 旧 localStorage 预设应用后落在存的数值上
6. 中英文切换文案正常
