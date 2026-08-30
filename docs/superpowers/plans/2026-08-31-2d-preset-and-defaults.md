# 2D 配置记忆、随机按钮与本地预设 —— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 spec [2026-08-31-2d-preset-and-defaults-design.md](../specs/2026-08-31-2d-preset-and-defaults-design.md) 的三个功能：风格默认值与会话记忆、ParamPanel 随机按钮、localStorage 命名预设 + 可拖动浮动列表窗。

**Architecture:** 风格记忆用 App2D 内 `useRef` 会话缓存；预设存取抽为纯逻辑模块 `presetStore.ts`（可注入 Storage，vitest 单测）；ParamPanel 拖动逻辑抽成 `useDraggable` hook 供 ParamPanel 与新组件 PresetPanel 共用；ParamPanel 仅新增可选 prop `onRandom` 保持向后兼容。

**Tech Stack:** React 19 + TypeScript + Vite、vitest（node 环境，无 jsdom）、i18next（zh/en）、手写 CSS（global.css，黑白 neo-brutalism 风格）。

**回归命令（每个任务结束必须全绿）：** `npm test`、`npm run lint`、`npm run build`（在仓库根目录 `c:\Users\Night\Desktop\dev\web_pic_design_ai` 执行）。

**图标规范（用户要求）：** 所有按钮 icon 用内联 SVG（viewBox 24、`stroke="currentColor"` 线条风格），禁止 emoji。

---

### Task 1: StyleRegistry 导出 defaultParams / defaultTextParams

把 App2D 内私有的 `initParams` / `initTextParams`（[App2D.tsx:19-40](src/components/App2D.tsx#L19-L40)）移到 [StyleRegistry.ts](src/lib/StyleRegistry.ts) 导出，供 App2D 与 presetStore 共用（DRY）。

**Files:**
- Modify: `src/lib/StyleRegistry.ts`（文件末尾追加）
- Create: `src/lib/StyleRegistry.test.ts`
- Modify: `src/components/App2D.tsx:1-40`

- [ ] **Step 1: 写失败测试** `src/lib/StyleRegistry.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { styles, defaultParams, defaultTextParams } from './StyleRegistry'
import type { StyleId } from '../types'

describe('defaultParams / defaultTextParams', () => {
  it('returns {} for unknown style', () => {
    expect(defaultParams('nonexistent' as StyleId)).toEqual({})
    expect(defaultTextParams('nonexistent' as StyleId)).toEqual({})
  })

  it('collects number/toggle/select defaults for every style', () => {
    for (const s of styles) {
      const p = defaultParams(s.id)
      for (const def of s.params) {
        if (def.type === 'text' || def.type === 'color' || def.type === 'font') continue
        expect(p[def.uniform]).toBe(def.default)
      }
      // 不含 text/color/font 的 uniform
      for (const def of s.params) {
        if (def.type === 'text' || def.type === 'color' || def.type === 'font') {
          expect(p[def.uniform]).toBeUndefined()
        }
      }
    }
  })

  it('collects text defaults for every style', () => {
    for (const s of styles) {
      const tp = defaultTextParams(s.id)
      for (const def of s.params) {
        if (def.type === 'text') expect(tp[def.uniform]).toBe(def.textDefault)
        else expect(tp[def.uniform]).toBeUndefined()
      }
    }
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/StyleRegistry.test.ts`
Expected: FAIL —— `defaultParams` / `defaultTextParams` 未导出（import 报错）。

- [ ] **Step 3: 实现**（追加到 `src/lib/StyleRegistry.ts` 末尾；该文件已有 `getStyle`，直接复用）

```ts
/** 风格的全部数值型参数（number/toggle/select）默认值；未知 styleId 返回 {}。 */
export function defaultParams(styleId: StyleId): Record<string, number> {
  const def = getStyle(styleId)
  if (!def) return {}
  const out: Record<string, number> = {}
  for (const p of def.params) {
    if (p.type === 'text' || p.type === 'color' || p.type === 'font') continue
    out[p.uniform] = p.default
  }
  return out
}

/** 风格的全部 text 参数默认值；未知 styleId 返回 {}。 */
export function defaultTextParams(styleId: StyleId): Record<string, string> {
  const def = getStyle(styleId)
  if (!def) return {}
  const out: Record<string, string> = {}
  for (const p of def.params) {
    if (p.type === 'text') out[p.uniform] = p.textDefault
  }
  return out
}
```

注意：`StyleRegistry.ts` 顶部 import 需补 `StyleId` 类型（现仅 `StyleDefinition, StyleId` 的话不用动；执行时看现状）。

- [ ] **Step 4: 运行测试通过**

Run: `npx vitest run src/lib/StyleRegistry.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: App2D 改用导出版本（纯重构，行为不变）**

`src/components/App2D.tsx`：
- 第 6 行 import 改为 `import { styles, getStyle, defaultParams, defaultTextParams } from '../lib/StyleRegistry'`
- 删除本地 `initParams`（19-28 行）与 `initTextParams`（30-40 行）两个函数
- 全文 `initParams(` → `defaultParams(`、`initTextParams(` → `defaultTextParams(`（共 6 处：两个 useState 初始化（52、53 行）、handleStyleChange 两处（193、195 行）、handleReset 一处（256 行）、handleApplySeed 一处（369 行））

- [ ] **Step 6: 回归 + 提交**

Run: `npm test && npm run lint && npm run build`
Expected: 全部通过。

```bash
git add src/lib/StyleRegistry.ts src/lib/StyleRegistry.test.ts src/components/App2D.tsx
git commit -m "refactor(registry): initParams/initTextParams 移入 StyleRegistry 导出为 defaultParams/defaultTextParams"
```

---

### Task 2: presetStore —— localStorage 预设存取（TDD）

**Files:**
- Create: `src/lib/presetStore.ts`
- Test: `src/lib/presetStore.test.ts`

- [ ] **Step 1: 写失败测试** `src/lib/presetStore.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadPresets, savePreset, removePreset, mergeWithDefaults, setPresetStorage,
  type PresetEntry,
} from './presetStore'
import { getStyle } from './StyleRegistry'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
}

class ThrowingStorage extends MemoryStorage {
  getItem() { throw new Error('unavailable') }
  setItem() { throw new Error('quota') }
}

const HALFTONE = { name: 'n', styleId: 'halftone' as const, params: { uCellSize: 12 }, textParams: {} }

beforeEach(() => {
  setPresetStorage(new MemoryStorage())
})

describe('loadPresets', () => {
  it('returns [] when storage empty', () => {
    expect(loadPresets()).toEqual([])
  })
  it('returns [] for corrupted JSON', () => {
    const s = new MemoryStorage()
    s.setItem('pixel-forge.presets.v1', '{not json')
    setPresetStorage(s)
    expect(loadPresets()).toEqual([])
  })
  it('drops invalid entries, keeps valid ones', () => {
    const s = new MemoryStorage()
    s.setItem('pixel-forge.presets.v1', JSON.stringify([
      { id: 'a', name: 'ok', styleId: 'halftone', params: {}, textParams: {}, createdAt: 2 },
      { id: 'b', name: 'bad-style', styleId: 'nope', params: {}, textParams: {}, createdAt: 3 },
      { id: 'c', name: 'bad-params', styleId: 'halftone', params: 5, textParams: {}, createdAt: 4 },
    ]))
    setPresetStorage(s)
    expect(loadPresets().map((e) => e.id)).toEqual(['a'])
  })
  it('sorts by createdAt descending', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    savePreset(HALFTONE)
    vi.setSystemTime(2000)
    savePreset(HALFTONE)
    vi.useRealTimers()
    const list = loadPresets()
    expect(list).toHaveLength(2)
    expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt)
  })
  it('returns [] when storage throws', () => {
    setPresetStorage(new ThrowingStorage())
    expect(loadPresets()).toEqual([])
  })
})

describe('savePreset', () => {
  it('persists and returns full entry', () => {
    const e = savePreset(HALFTONE)
    expect(e).not.toBeNull()
    expect(e!.id).toBeTruthy()
    expect(e!.createdAt).toBeGreaterThan(0)
    const list = loadPresets()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('n')
    expect(list[0].params.uCellSize).toBe(12)
  })
  it('returns null when storage throws (quota/private mode)', () => {
    setPresetStorage(new ThrowingStorage())
    expect(savePreset(HALFTONE)).toBeNull()
  })
})

describe('removePreset', () => {
  it('removes existing entry → true', () => {
    const e = savePreset(HALFTONE)!
    expect(removePreset(e.id)).toBe(true)
    expect(loadPresets()).toEqual([])
  })
  it('returns false for unknown id', () => {
    expect(removePreset('nope')).toBe(false)
  })
})

describe('mergeWithDefaults', () => {
  it('overlays stored values onto defaults, fills missing, ignores unknown keys', () => {
    const def = getStyle('halftone')!
    const merged = mergeWithDefaults(def, { uCellSize: 30, uBogus: 1 }, {})
    expect(merged.params.uCellSize).toBe(30)
    expect(merged.params.uShape).toBe(def.params.find(p => p.uniform === 'uShape')!.default) // 缺失 → 默认
    expect(merged.params.uBogus).toBeUndefined() // 未知 key 被忽略
  })
  it('keeps text param defaults when preset has none', () => {
    const def = getStyle('ascii')! // ascii 含 text 参数 uCharset
    const merged = mergeWithDefaults(def, {}, {})
    const charset = def.params.find(p => p.type === 'text') as { uniform: string; textDefault: string }
    expect(merged.textParams[charset.uniform]).toBe(charset.textDefault)
  })
  it('color params live in textParams', () => {
    const def = getStyle('ascii')! // ascii 含 color 参数 uCharColor
    const color = def.params.find(p => p.type === 'color') as { uniform: string; default: string }
    const merged = mergeWithDefaults(def, {}, { [color.uniform]: '#ff0000' })
    expect(merged.textParams[color.uniform]).toBe('#ff0000')
  })
})
```

（执行时注意：`PresetEntry` 的 type import 用 `import { type PresetEntry }` 或单独 `import type` 行均可，与项目 eslint 配置不冲突。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/presetStore.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现** `src/lib/presetStore.ts`

```ts
import type { StyleDefinition, StyleId } from '../types'
import { styles, getStyle, defaultParams, defaultTextParams } from './StyleRegistry'

export interface PresetEntry {
  id: string        // 唯一 id
  name: string      // 用户命名
  styleId: StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  createdAt: number // epoch ms
}

export type PresetInput = Omit<PresetEntry, 'id' | 'createdAt'>

const STORAGE_KEY = 'pixel-forge.presets.v1'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// 默认 window.localStorage；测试通过 setPresetStorage 注入内存实现（node 环境无 window）
let storage: StorageLike | null = typeof window !== 'undefined' ? window.localStorage : null

export function setPresetStorage(s: StorageLike | null): void {
  storage = s
}

function isValidEntry(raw: unknown): raw is PresetEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const e = raw as Record<string, unknown>
  return typeof e.id === 'string'
    && typeof e.name === 'string'
    && typeof e.styleId === 'string'
    && styles.some((s) => s.id === e.styleId)
    && typeof e.params === 'object' && e.params !== null
    && typeof e.textParams === 'object' && e.textParams !== null
    && typeof e.createdAt === 'number'
}

/** 读全部预设（坏库 → []；坏条目丢弃；createdAt 降序）。 */
export function loadPresets(): PresetEntry[] {
  if (!storage) return []
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isValidEntry).sort((a, b) => b.createdAt - a.createdAt)
}

/** 追加保存；成功返回完整条目，失败（存储不可用/配额满）返回 null。 */
export function savePreset(input: PresetInput): PresetEntry | null {
  if (!storage) return null
  const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: PresetEntry = { ...input, id, createdAt: Date.now() }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([entry, ...loadPresets()]))
  } catch {
    return null
  }
  return entry
}

/** 删除；成功 true，id 不存在或存储失败 false。 */
export function removePreset(id: string): boolean {
  if (!storage) return false
  const current = loadPresets()
  if (!current.some((e) => e.id === id)) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(current.filter((e) => e.id !== id)))
  } catch {
    return false
  }
  return true
}

/**
 * 以风格默认值为底合并预设：只覆盖风格定义中存在的 uniform，
 * 缺失参数取默认值（容忍风格定义后续增删参数的旧预设）。
 * color 参数的值按现有约定存放在 textParams。
 */
export function mergeWithDefaults(
  def: StyleDefinition,
  params: Record<string, number>,
  textParams: Record<string, string>,
): { params: Record<string, number>; textParams: Record<string, string> } {
  const outP: Record<string, number> = {}
  const outT: Record<string, string> = {}
  for (const p of def.params) {
    if (p.type === 'font') continue
    if (p.type === 'text') {
      outT[p.uniform] = typeof textParams[p.uniform] === 'string' ? textParams[p.uniform] : p.textDefault
    } else if (p.type === 'color') {
      outT[p.uniform] = typeof textParams[p.uniform] === 'string' ? textParams[p.uniform] : p.default
    } else {
      outP[p.uniform] = typeof params[p.uniform] === 'number' ? params[p.uniform] : p.default
    }
  }
  return { params: outP, textParams: outT }
}
```

- [ ] **Step 4: 运行测试通过**

Run: `npx vitest run src/lib/presetStore.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 回归 + 提交**

Run: `npm test && npm run lint && npm run build`

```bash
git add src/lib/presetStore.ts src/lib/presetStore.test.ts
git commit -m "feat(preset): presetStore——localStorage 预设存取与默认值合并（可注入 Storage）"
```

---

### Task 3: useDraggable hook 抽取（行为不变重构）

把 [ParamPanel.tsx:183-211](src/components/ParamPanel.tsx#L183-L211) 的拖动实现抽成 `src/lib/useDraggable.ts`（与 `useViewport.ts` 同放 lib，是本项目惯例）。原实现里 `closest('.param-panel-body')` 是死防御（mousedown 只挂在 header 上，header 内无 body），抽取时去除。

**Files:**
- Create: `src/lib/useDraggable.ts`
- Modify: `src/components/ParamPanel.tsx`

- [ ] **Step 1: 新建** `src/lib/useDraggable.ts`

```ts
import { useRef, useState, useCallback, useEffect } from 'react'

export interface DragPos { x: number; y: number }

/**
 * 浮动面板拖动：标题栏按下 → window mousemove 移动（clamp 在视口内）→ mouseup 结束。
 * 返回 ref 挂在面板根节点、onHeaderMouseDown 挂在标题栏。
 */
export function useDraggable(defaultPos?: DragPos) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<DragPos>(
    defaultPos ?? { x: typeof window !== 'undefined' ? window.innerWidth - 320 : 600, y: 35 },
  )
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    const rect = ref.current!.getBoundingClientRect()
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offset.current.y))
      setPos({ x, y })
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return { ref, pos, onHeaderMouseDown }
}
```

- [ ] **Step 2: ParamPanel 接入**

`src/components/ParamPanel.tsx`：
- import 加 `import { useDraggable } from '../lib/useDraggable'`
- 删除组件内 `pos` state、`dragging` / `offset` ref、`onMouseDown` 回调、window mousemove/mouseup effect（183-211 行对应代码）
- 替换为 `const { ref: panelRef, pos, onHeaderMouseDown } = useDraggable(defaultPos)`
- header 的 `onMouseDown={onMouseDown}` 改为 `onMouseDown={onHeaderMouseDown}`

- [ ] **Step 3: 手动验证 + 回归**

Run: `npm run dev`，浏览器打开 2D 页上传图片：拖动 ParamPanel 标题栏可移动、clamp 在视口内（行为与重构前一致）。
Run: `npm test && npm run lint && npm run build`

- [ ] **Step 4: 提交**

```bash
git add src/lib/useDraggable.ts src/components/ParamPanel.tsx
git commit -m "refactor(panel): ParamPanel 拖动逻辑抽为 useDraggable hook"
```

---

### Task 4: ParamPanel 随机按钮（onRandom + 骰子 SVG）

**Files:**
- Modify: `src/components/ParamPanel.tsx`
- Modify: `src/styles/global.css`（`.param-panel-collapse` 样式块附近追加）

- [ ] **Step 1: ParamPanel 加 prop 与按钮**

`src/components/ParamPanel.tsx`：
- import `useTranslation`：`import { useTranslation } from 'react-i18next'`
- Props 接口加 `onRandom?: () => void`；解构参数加 `onRandom`
- 组件内加 `const { t } = useTranslation()`
- actions 区（`param-panel-actions` div 内、折叠按钮之前）插入：

```tsx
{onRandom && (
  <button
    className="param-panel-random"
    onClick={onRandom}
    title={t('common.random')}
    aria-label={t('common.random')}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  </button>
)}
```

- [ ] **Step 2: CSS**（global.css 追加，复用 param-panel-collapse 的视觉）

```css
.param-panel-random {
  background: none;
  border: 1px solid #FFF;
  color: #FFF;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.param-panel-random:hover {
  background: rgba(255,255,255,0.1);
}
.param-panel-random:active {
  transform: rotate(15deg);
}
```

- [ ] **Step 3: 手动验证 + 回归**

`npm run dev`：临时在 App2D 的 ParamPanel 上传 `onRandom={() => {}}`（或等 Task 8 接线后一并验证——本任务只验证按钮渲染与 hover 样式，App3D 六处 ParamPanel 不传 onRandom 无按钮）。
Run: `npm test && npm run lint && npm run build`

- [ ] **Step 4: 提交**

```bash
git add src/components/ParamPanel.tsx src/styles/global.css
git commit -m "feat(panel): ParamPanel 标题栏随机按钮（可选 prop onRandom，SVG icon）"
```

---

### Task 5: i18n preset 命名空间

**Files:**
- Modify: `src/i18n/zh.json`、`src/i18n/en.json`

- [ ] **Step 1: zh.json** 在顶层加（与 `seed` 平级）：

```json
"preset": {
  "save": "保存配置",
  "confirm": "保存",
  "namePlaceholder": "配置名称…",
  "saveFailed": "保存失败（存储不可用）",
  "saved": "已保存",
  "list": "我的配置",
  "empty": "暂无保存的配置，调整参数后点「保存配置」",
  "apply": "应用",
  "delete": "删除"
}
```

- [ ] **Step 2: en.json** 对应：

```json
"preset": {
  "save": "Save Preset",
  "confirm": "Save",
  "namePlaceholder": "Preset name…",
  "saveFailed": "Save failed (storage unavailable)",
  "saved": "Saved",
  "list": "My Presets",
  "empty": "No presets yet — tweak params and click \"Save Preset\"",
  "apply": "Apply",
  "delete": "Delete"
}
```

- [ ] **Step 3: 验证 + 提交**

Run: `npm test && npm run lint && npm run build`（build 会做 JSON 语法检查）

```bash
git add src/i18n/zh.json src/i18n/en.json
git commit -m "feat(i18n): preset 命名空间（zh/en）"
```

---

### Task 6: PresetBar 保存入口组件

**Files:**
- Create: `src/components/PresetBar.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 组件** `src/components/PresetBar.tsx`（交互模式复用 SeedBar 的 editing 视觉）

```tsx
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface PresetBarProps {
  defaultName: string
  onSave: (name: string) => boolean
  onToggleList: () => void
  listOpen: boolean
  count: number
}

function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

export default function PresetBar({ defaultName, onSave, onToggleList, listOpen, count }: PresetBarProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const start = useCallback(() => {
    setDraft(defaultName)
    setFailed(false)
    setEditing(true)
  }, [defaultName])

  const cancel = useCallback(() => {
    setEditing(false)
    setFailed(false)
  }, [])

  const confirm = useCallback(() => {
    const name = draft.trim() || defaultName
    if (onSave(name)) {
      setEditing(false)
      setFailed(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } else {
      setFailed(true)
    }
  }, [draft, defaultName, onSave])

  if (editing) {
    return (
      <div className="preset-bar preset-bar--edit">
        <input
          className="seed-bar-input"
          value={draft}
          placeholder={t('preset.namePlaceholder')}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => { setDraft(e.target.value); setFailed(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
            if (e.key === 'Escape') cancel()
          }}
        />
        <button className="seed-bar-btn seed-bar-btn--primary" onClick={confirm}>{t('preset.confirm')}</button>
        <button className="seed-bar-btn" onClick={cancel}>{t('common.cancel')}</button>
        {failed && <div className="seed-bar-error">{t('preset.saveFailed')}</div>}
      </div>
    )
  }

  return (
    <div className="preset-bar">
      <button className="seed-bar-btn" onClick={start} title={t('preset.save')}>
        <SaveIcon /> {savedFlash ? t('preset.saved') : t('preset.save')}
      </button>
      <button
        className={listOpen ? 'seed-bar-btn seed-bar-btn--primary' : 'seed-bar-btn'}
        onClick={onToggleList}
        title={t('preset.list')}
      >
        <ListIcon /> {t('preset.list')}{count > 0 ? ` (${count})` : ''}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: CSS**（global.css 追加；布局沿用 seed-bar 模式，位于 ParamPanel body 顶部）

```css
.preset-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
```

- [ ] **Step 3: 回归 + 提交**

Run: `npm test && npm run lint && npm run build`

```bash
git add src/components/PresetBar.tsx src/styles/global.css
git commit -m "feat(preset): PresetBar 保存入口（可编辑命名 + 列表开关）"
```

---

### Task 7: PresetPanel 浮动列表窗

**Files:**
- Create: `src/components/PresetPanel.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 组件** `src/components/PresetPanel.tsx`

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { getStyle } from '../lib/StyleRegistry'
import type { PresetEntry } from '../lib/presetStore'

interface PresetPanelProps {
  presets: PresetEntry[]
  onApply: (entry: PresetEntry) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

/** 已保存配置的浮动列表窗：可拖动/折叠/关闭；点条目应用，垃圾桶删除。 */
export default function PresetPanel({ presets, onApply, onDelete, onClose }: PresetPanelProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const { ref, pos, onHeaderMouseDown } = useDraggable(
    { x: Math.max(20, window.innerWidth - 620), y: Math.max(120, window.innerHeight - 460) },
  )

  return (
    <div className="preset-panel" ref={ref} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('preset.list')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-collapse" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? '▸' : '▾'}
            </button>
            <button className="param-panel-close" onClick={onClose}>x</button>
          </div>
        </div>
      </div>
      {!collapsed && (
        <div className="preset-panel-body">
          {presets.length === 0 && <div className="preset-panel-empty">{t('preset.empty')}</div>}
          {presets.map((e) => (
            <div key={e.id} className="preset-item" onClick={() => onApply(e)} title={t('preset.apply')}>
              <div className="preset-item-info">
                <div className="preset-item-name">{e.name}</div>
                <div className="preset-item-sub">
                  {t(getStyle(e.styleId)?.label ?? e.styleId)} · {formatTime(e.createdAt)}
                </div>
              </div>
              <button
                className="preset-item-delete"
                title={t('preset.delete')}
                aria-label={t('preset.delete')}
                onClick={(ev) => { ev.stopPropagation(); onDelete(e.id) }}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: CSS**（global.css 追加；复用 param-panel 的黑白 neo-brutalism 视觉）

```css
/* --- Preset Panel (draggable floating list) --- */

.preset-panel {
  position: fixed;
  z-index: 1000;
  background: #FFF;
  border: 2px solid #000;
  width: 260px;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
}
.preset-panel-body {
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}
.preset-panel-empty {
  font-size: 12px;
  color: #999;
  padding: 12px 8px;
  text-align: center;
}
.preset-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  margin-bottom: 6px;
  cursor: pointer;
}
.preset-item:hover {
  background: #f0f0f0;
  border-color: #000;
}
.preset-item-info { flex: 1; min-width: 0; }
.preset-item-name {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-item-sub { font-size: 11px; color: #999; }
.preset-item-delete {
  background: none;
  border: none;
  color: #999;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}
.preset-item-delete:hover { color: #c00; }
```

- [ ] **Step 3: 回归 + 提交**

Run: `npm test && npm run lint && npm run build`

```bash
git add src/components/PresetPanel.tsx src/styles/global.css
git commit -m "feat(preset): PresetPanel 可拖动浮动列表窗（应用/删除）"
```

---

### Task 8: App2D 风格记忆 + 随机按钮接线（完成需求 1、2）

**Files:**
- Modify: `src/components/App2D.tsx`

- [ ] **Step 1: 加风格记忆 ref**（state 声明区，`fontParams` 之后）

```ts
// 会话级风格记忆：每个风格最后一次离开时的参数状态（刷新即失，不持久化）
const styleMemoryRef = useRef<Partial<Record<StyleId, {
  params: Record<string, number>
  textParams: Record<string, string>
}>>>({})
```

顶部 import 补 `StyleId`（已有 `type { StyleId }`，确认在即可）。

- [ ] **Step 2: 重写 handleStyleChange**（替换 [App2D.tsx:190-211](src/components/App2D.tsx#L190-L211)，删除随机生成代码）

```ts
const handleStyleChange = useCallback(
  (id: StyleId) => {
    // 无条件快照当前风格状态：默认/随机/手动调整的最后状态一视同仁
    styleMemoryRef.current[activeStyle] = { params, textParams }
    // 目标风格：有记忆用记忆（用户最后一次离开时的样子），无记忆用默认值
    const memo = styleMemoryRef.current[id]
    setParams(memo?.params ?? defaultParams(id))
    setTextParams(memo?.textParams ?? defaultTextParams(id))
    setFontParams({})
    setActiveStyle(id)
  },
  [activeStyle, params, textParams],
)
```

注意依赖数组从 `[]` 改为 `[activeStyle, params, textParams]`（spec 修正意见）。

- [ ] **Step 3: SKIP_RANDOM_UNIFORMS 注释补充**

`SKIP_RANDOM_UNIFORMS` 常量（17 行）保留在模块顶层原位置（`handleRandom` 在组件内，引用模块常量即可），在定义行上方加注释：`// 这些 uniform 随机会产生不可用结果（居中/旋转类），随机时保持不动`。

- [ ] **Step 4: handleApplySeed 写入记忆**（[App2D.tsx:361-372](src/components/App2D.tsx#L361-L372)，`return true` 前加一行）

```ts
styleMemoryRef.current[decoded.styleId] = { params: decoded.params, textParams: defaultTextParams(decoded.styleId) }
```

- [ ] **Step 5: ParamPanel 接线随机按钮**（渲染处加 prop）

```tsx
<ParamPanel
  ...
  onRandom={handleRandom}
  top={...}
/>
```

- [ ] **Step 6: 手动验证（spec 验收 1、2 条）**

`npm run dev` + 上传测试图：
1. 首次点击某风格 → 全默认值（无随机跳变）
2. 调滑块/文字 → 切到别的风格 → 切回 → 恢复调整值
3. ParamPanel 标题栏骰子按钮 → 参数随机化；ActionBar 底部随机按钮仍可用
4. 应用一个种子码 → 切走 → 切回 → 保留种子状态

- [ ] **Step 7: 回归 + 提交**

Run: `npm test && npm run lint && npm run build`

```bash
git add src/components/App2D.tsx
git commit -m "feat(app2d): 风格默认值+会话记忆替代点击随机；面板随机按钮接线"
```

---

### Task 9: App2D 预设集成（完成需求 3）

**Files:**
- Modify: `src/components/App2D.tsx`

- [ ] **Step 1: import**

```ts
import { loadPresets, savePreset, removePreset, mergeWithDefaults, type PresetEntry } from '../lib/presetStore'
import PresetBar from './PresetBar'
import PresetPanel from './PresetPanel'
```

- [ ] **Step 2: state**（`showCloseDialog` 之后）

```ts
const [presets, setPresets] = useState<PresetEntry[]>(() => loadPresets())
const [showPresetPanel, setShowPresetPanel] = useState(false)
```

- [ ] **Step 3: handlers**（`handleApplySeed` 附近）

```ts
const handleSavePreset = useCallback((name: string): boolean => {
  const entry = savePreset({ name, styleId: activeStyle, params, textParams })
  if (!entry) return false
  setPresets(loadPresets())
  return true
}, [activeStyle, params, textParams])

const handleApplyPreset = useCallback((entry: PresetEntry) => {
  const def = getStyle(entry.styleId)
  if (!def) return
  const merged = mergeWithDefaults(def, entry.params, entry.textParams)
  styleMemoryRef.current[entry.styleId] = merged
  setActiveStyle(entry.styleId)
  setParams(merged.params)
  setTextParams(merged.textParams)
  setFontParams({})
}, [])

const handleDeletePreset = useCallback((id: string) => {
  removePreset(id)
  setPresets(loadPresets())
}, [])
```

- [ ] **Step 4: 默认预设名**（`seed` useMemo 附近）

```ts
const presetDefaultName = useMemo(() => {
  if (!currentStyle) return ''
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t(currentStyle.label)} ${p(d.getHours())}:${p(d.getMinutes())}`
}, [currentStyle, t])
```

- [ ] **Step 5: 渲染**——ParamPanel 的 `top` 改为：

```tsx
top={
  <>
    <SeedBar seed={seed} onApply={handleApplySeed} />
    <PresetBar
      defaultName={presetDefaultName}
      onSave={handleSavePreset}
      onToggleList={() => setShowPresetPanel((v) => !v)}
      listOpen={showPresetPanel}
      count={presets.length}
    />
  </>
}
```

并在 ConfirmDialog 渲染之前加：

```tsx
{image && currentStyle && showPresetPanel && (
  <PresetPanel
    presets={presets}
    onApply={handleApplyPreset}
    onDelete={handleDeletePreset}
    onClose={() => setShowPresetPanel(false)}
  />
)}
```

- [ ] **Step 6: 手动验证（spec 验收 3、4 条）**

`npm run dev` + 上传测试图：
1. 调参 → 保存配置（改名/默认名均可）→「我的配置 (1)」浮窗出现该条目
2. 刷新页面 → 打开我的配置 → 条目仍在
3. 换别的风格/参数 → 点列表条目 → 完整还原（含 ASCII 字符集/颜色）
4. 垃圾桶删除 → 条目消失，刷新后不再出现
5. 浮窗可拖动、折叠、关闭；PresetBar 编辑态 Esc/Enter 行为正常
6. DevTools → Application → Local Storage 确认 `pixel-forge.presets.v1` 数据结构

- [ ] **Step 7: 回归 + 提交**

Run: `npm test && npm run lint && npm run build`

```bash
git add src/components/App2D.tsx
git commit -m "feat(app2d): 接入 presetStore/PresetBar/PresetPanel——localStorage 预设保存与应用"
```

---

### Task 10: 全量回归与验收清单

- [ ] **Step 1: 全量命令**

Run: `npm test && npm run lint && npm run build`
Expected: 三项全部通过。

- [ ] **Step 2: 过一遍 spec 第 12 节手动验收清单**（5 条，见 spec；Task 8/9 已逐条验过，此处整体复查）

- [ ] **Step 3: 确认 3D 页无回归**

`npm run dev` 打开 3D 页：ParamPanel 无随机按钮（未传 prop）、拖动正常、`npm test` 无 3D 相关失败。

- [ ] **Step 4: 提交（如有零星修正）并汇总**

向用户汇报完成情况，提醒用户按 spec 第 13 节做实测：每个风格保存一组推荐值 → 导出 localStorage 的 `pixel-forge.presets.v1` 内容交给开发者回填 StyleRegistry 默认值。

---

## 任务依赖

- Task 1 → Task 2（mergeWithDefaults 用 defaultParams）与 Task 8（defaultParams/defaultTextParams）
- Task 3 → Task 7（PresetPanel 用 useDraggable）
- Task 4、5、6 相互独立，可并行
- Task 8、9 依赖前置全部完成；Task 10 收尾
