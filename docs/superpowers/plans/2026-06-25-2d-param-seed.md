# 2D 参数种子（可分享配置码）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 2D 风格化模块增加「参数种子」——把当前特效的数值参数编码成 6–13 字符的 base62 短码，可复制分享、粘贴复现。

**Architecture:** 纯函数编解码层 `seedCodec.ts`（混合进制打包 + BigInt + base62），与 `StyleRegistry` 解耦；`SeedBar` 组件经 `ParamPanel` 新增的 `top` slot 注入到参数面板顶部；`App2D` 用 `useMemo` 派生种子码 + `handleApplySeed` 应用粘贴码。随机逻辑不改。

**Tech Stack:** React 19 + TypeScript + Vite + vitest（node 环境）。零新依赖（仅原生 `BigInt`）。

**对应 spec:** [`docs/superpowers/specs/2026-06-25-2d-param-seed-design.md`](../specs/2026-06-25-2d-param-seed-design.md)

**测试约束（来自 spec §8）:** vitest 未配置 `environment`，默认 node 环境。自动化测试**仅覆盖 `seedCodec` 纯函数**；`SeedBar` 组件交互走手动验证。

---

## 文件结构

| 文件 | 责任 | 类型 |
|---|---|---|
| `src/lib/seedCodec.ts` | 编码/解码纯函数 + base62 + 混合进制打包。零依赖 | 新建 |
| `src/lib/seedCodec.test.ts` | 纯函数单元测试（node 环境） | 新建 |
| `src/components/SeedBar.tsx` | 种子 UI：展示/编辑态、复制、应用、错误提示 | 新建 |
| `src/components/ParamPanel.tsx` | 新增 `top?: ReactNode` prop，渲染于 body 顶部 | 修改 |
| `src/components/App2D.tsx` | `seed` 派生、`handleApplySeed`、传 `top` | 修改 |
| `src/i18n/zh.json` / `en.json` | `seed.*` 文案 | 修改 |
| `src/styles/global.css` | `.seed-bar` 样式 | 修改 |

**不改动：** `StyleRegistry`、`ShaderRenderer`、`AsciiCanvasRenderer`、`ActionBar`、shader 源码、随机逻辑。

---

## Task 1: base62 与 BigInt 转换工具（TDD）

**Files:**
- Create: `src/lib/seedCodec.ts`
- Test: `src/lib/seedCodec.test.ts`

- [ ] **Step 1: 写失败测试 — base62 编解码 + 零值约定**

`src/lib/seedCodec.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { encodeB62, decodeB62 } from './seedCodec'

describe('encodeB62 / decodeB62', () => {
  const CASES: [bigint, string][] = [
    [0n, ''],
    [1n, '1'],
    [61n, 'z'],           // ALPHABET[61]
    [62n, '10'],          // 62 = 1*62 + 0 → '10'
    [12345n, '3D7'],      // 已验算：62²×3 + 62×13 + 7；大写字母在前（A=10..Z=35, a=36..z=61）
    [123456789n, '8M0kX'],
  ]
  it('encodes BigInt → base62 string', () => {
    for (const [n, s] of CASES) expect(encodeB62(n)).toBe(s)
  })
  it('decodes base62 string → BigInt', () => {
    for (const [n, s] of CASES) expect(decodeB62(s)).toBe(n)
  })
  it('round-trips arbitrary values', () => {
    for (const n of [0n, 1n, 62n, 999999n, 123456789012345n]) {
      expect(decodeB62(encodeB62(n))).toBe(n)
    }
  })
  it('treats empty string as 0n', () => {
    expect(decodeB62('')).toBe(0n)
  })
  it('decodes case-sensitively (a=36, A=10)', () => {
    expect(decodeB62('A')).toBe(10n)
    expect(decodeB62('a')).toBe(36n)
  })
})
```

> 以上预期值均已用 ALPHABET（`0-9 A-Z a-z`，大写在前）手算核实，可直接作断言。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: FAIL — 模块不存在 / 函数未定义。

- [ ] **Step 3: 实现 base62 工具**

`src/lib/seedCodec.ts`（本步只写 base62 部分，后续 Task 追加）:
```ts
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const SEED_ALPHABET = ALPHABET   // 导出供测试构造越界序号（Task 4）
const CHAR_TO_VAL: Record<string, number> = (() => {
  const m: Record<string, number> = {}
  for (let i = 0; i < ALPHABET.length; i++) m[ALPHABET[i]] = i
  return m
})()

/** BigInt → base62 string. encodeB62(0n) === '' (空串，零值的唯一表示). */
export function encodeB62(n: bigint): string {
  if (n < 0n) throw new Error('encodeB62: negative input')
  if (n === 0n) return ''
  let s = ''
  let x = n
  while (x > 0n) {
    s = ALPHABET[Number(x % 62n)] + s
    x = x / 62n
  }
  return s
}

/** base62 string → BigInt. 空串 → 0n. 严格区分大小写. */
export function decodeB62(s: string): bigint | null {
  let n = 0n
  for (const ch of s) {
    const v = CHAR_TO_VAL[ch]
    if (v === undefined) return null
    n = n * 62n + BigInt(v)
  }
  return n
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: PASS（CASES 预期值已核实）。若失败，说明 `encodeB62`/`decodeB62` 实现有误，排查 ALPHABET 顺序与 `% 62n`、`/ 62n` 逻辑。

- [ ] **Step 5: 提交**

```bash
git add src/lib/seedCodec.ts src/lib/seedCodec.test.ts
git commit -m "feat(seed): base62 BigInt 编解码工具 + 单测"
```

---

## Task 2: 档位/索引计算（TDD）

**Files:**
- Modify: `src/lib/seedCodec.ts`
- Modify: `src/lib/seedCodec.test.ts`

- [ ] **Step 1: 写失败测试 — 档位数与索引**

在 `seedCodec.test.ts` 追加:
```ts
import { paramCount, paramIndex, valueOfIndex } from './seedCodec'
import type { NumberParamDef } from '../types'

const p: NumberParamDef = { name: 't', uniform: 'uT', min: 0, max: 10, step: 2, default: 0 }

describe('档位与索引', () => {
  it('paramCount = floor((max-min)/step)+1', () => {
    expect(paramCount(p)).toBe(6)        // (10-0)/2+1 = 6 档: 0,2,4,6,8,10
  })
  it('paramIndex 映射 value→idx，min=0', () => {
    expect(paramIndex(p, 0)).toBe(0)
    expect(paramIndex(p, 10)).toBe(5)
    expect(paramIndex(p, 6)).toBe(3)
  })
  it('paramIndex clamp 越界（编码侧容错）', () => {
    expect(paramIndex(p, -5)).toBe(0)
    expect(paramIndex(p, 99)).toBe(5)
  })
  it('valueOfIndex 映射 idx→value', () => {
    expect(valueOfIndex(p, 0)).toBe(0)
    expect(valueOfIndex(p, 5)).toBe(10)
    expect(valueOfIndex(p, 3)).toBe(6)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: FAIL — 三个函数未导出。

- [ ] **Step 3: 实现档位函数**

在 `seedCodec.ts` 追加:
```ts
import type { NumberParamDef } from '../types'

/** 合法档位数 = floor((max-min)/step) + 1. */
export function paramCount(p: NumberParamDef): number {
  return Math.floor((p.max - p.min) / p.step) + 1
}

/** value → 档位索引，编码侧 clamp 到 [0, count-1]（容错越界值）. */
export function paramIndex(p: NumberParamDef, value: number): number {
  const count = paramCount(p)
  const raw = Math.round((value - p.min) / p.step)
  return Math.max(0, Math.min(count - 1, raw))
}

/** 档位索引 → value（解码侧用，不 clamp，越界由 decodeSeed 判失败）. */
export function valueOfIndex(p: NumberParamDef, idx: number): number {
  return p.min + idx * p.step
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/seedCodec.ts src/lib/seedCodec.test.ts
git commit -m "feat(seed): 数值参数档位/索引计算"
```

---

## Task 3: encodeSeed / decodeSeed 核心编解码（TDD）

**Files:**
- Modify: `src/lib/seedCodec.ts`
- Modify: `src/lib/seedCodec.test.ts`

- [ ] **Step 1: 写失败测试 — 编解码往返（含全 max、前导零、单参数）**

在 `seedCodec.test.ts` 追加（导入真实 styles）:
```ts
import { encodeSeed, decodeSeed, SEED_VERSION } from './seedCodec'
import { styles, getStyle } from './StyleRegistry'
import type { StyleDefinition, StyleId, NumberParamDef } from '../types'

// 从某 style 的 params 构造「全 min / 全 max / 默认」的 params 对象
function numericParams(def: StyleDefinition, pick: (p: NumberParamDef) => number): Record<string, number> {
  const o: Record<string, number> = {}
  for (const p of def.params) {
    if (p.type === undefined || p.type === 'number') o[p.uniform] = pick(p as NumberParamDef)
  }
  return o
}

describe('encodeSeed / decodeSeed', () => {
  it('SEED_VERSION = 0', () => {
    expect(SEED_VERSION).toBe(0)
  })

  it('默认值往返（每个特效）', () => {
    for (const def of styles) {
      const defaults = numericParams(def, (p) => p.default)
      const code = encodeSeed(def.id, defaults, def)
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.styleId).toBe(def.id)
      expect(decoded!.params).toEqual(defaults)
    }
  })

  it('全 max 往返（每个特效，最易触发码长不足）', () => {
    for (const def of styles) {
      const maxed = numericParams(def, (p) => p.max)
      const code = encodeSeed(def.id, maxed, def)
      // 码长不超过 spec §2.7 表的「总码长」上界（ascii=6 ... animelight=13）
      expect(code.length).toBeLessThanOrEqual(13)
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.params).toEqual(maxed)
    }
  })

  it('全 max 码长等于 spec §2.7 表（抽样强校验打包正确性）', () => {
    const maxOf = (id: StyleId) => {
      const def = getStyle(id)!
      return encodeSeed(id, numericParams(def, (p) => p.max), def).length
    }
    expect(maxOf('ascii')).toBe(6)          // 最短
    expect(maxOf('halftone')).toBe(8)
    expect(maxOf('kaleidoscope')).toBe(11)
    expect(maxOf('animelight')).toBe(13)    // 最长
  })

  it('全 min 往返（参数码为空，仅 2 位前缀）', () => {
    for (const def of styles) {
      const mined = numericParams(def, (p) => p.min)
      const code = encodeSeed(def.id, mined, def)
      expect(code.length).toBe(2)   // 仅版本+特效号，参数码空
      const decoded = decodeSeed(code)
      expect(decoded).not.toBeNull()
      expect(decoded!.params).toEqual(mined)
    }
  })

  it('前导零等价：补零后解码结果相同', () => {
    const def = getStyle('halftone')!
    const params = numericParams(def, (p) => p.default)
    const code = encodeSeed('halftone', params, def)
    const padded = code.slice(0, 2) + '000' + code.slice(2)
    expect(decodeSeed(padded)?.params).toEqual(params)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: FAIL — `encodeSeed`/`decodeSeed`/`SEED_VERSION` 未导出。

- [ ] **Step 3: 实现 encodeSeed / decodeSeed**

在 `seedCodec.ts` 追加:
```ts
import type { StyleDefinition, StyleId, NumberParamDef } from '../types'

export const SEED_VERSION = 0   // 对应字符 '0'（ALPHABET[0]）

function isNumeric(p: StyleDefinition['params'][number]): p is NumberParamDef {
  return p.type === undefined || p.type === 'number'
}

/** 取 style 的数值参数（保持数组顺序）。*/
function numericListOf(def: StyleDefinition): NumberParamDef[] {
  return def.params.filter(isNumeric)
}

/** 编码：{ styleId, params } → 种子码字符串. */
export function encodeSeed(styleId: StyleId, params: Record<string, number>, def: StyleDefinition): string {
  const numerics = numericListOf(def)
  let big = 0n
  for (const p of numerics) {            // 正序打包（大端）
    const count = BigInt(paramCount(p))
    const idx = BigInt(paramIndex(p, params[p.uniform] ?? p.default))
    big = big * count + idx
  }
  const version = ALPHABET[SEED_VERSION]
  // 按 id 在 styles 中查序号（不依赖引用同一性，比 indexOf(def) 稳健）
  const styleIdx = styles.findIndex((s) => s.id === styleId)
  if (styleIdx < 0) throw new Error(`encodeSeed: unknown styleId ${styleId}`)
  return version + ALPHABET[styleIdx] + encodeB62(big)
}

/** 解码：种子码 → { styleId, params }；任何非法情况返回 null. */
export function decodeSeed(
  code: string,
  registry: StyleDefinition[] = styles,
): { styleId: StyleId; params: Record<string, number> } | null {
  if (code.length < 2) return null
  const versionVal = CHAR_TO_VAL[code[0]]
  if (versionVal !== SEED_VERSION) return null        // 版本号必须 == 0
  const styleVal = CHAR_TO_VAL[code[1]]
  if (styleVal === undefined || styleVal >= registry.length) return null
  const def = registry[styleVal]
  if (!def) return null

  const big = decodeB62(code.slice(2))
  if (big === null) return null                       // 含非法字符

  const numerics = numericListOf(def)
  const out: Record<string, number> = {}
  let rem = big
  for (let i = numerics.length - 1; i >= 0; i--) {    // 逆序剥离
    const p = numerics[i]
    const count = BigInt(paramCount(p))
    const idx = Number(rem % count)
    rem = rem / count
    if (idx < 0 || idx >= paramCount(p)) return null  // idx 越界 → 失败（不 clamp）
    out[p.uniform] = valueOfIndex(p, idx)
  }
  if (rem !== 0n) return null                         // 码超过该特效所需（解包有余数）
  return { styleId: def.id, params: out }
}
```

> **注：** `encodeSeed` 用 `styles.findIndex(s => s.id === styleId)` 取序号，按 id 查找而非按引用，调用方传入任何 `def` 都能正确编码。`decodeSeed` 里 `registry[styleVal].id` 是对称的反向操作。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: PASS（默认/全max/全min/前导零全部通过）。若某特效「全 max」往返失败，说明码长不足或打包有误——回到 §2.3/§2.7 排查。

- [ ] **Step 5: 提交**

```bash
git add src/lib/seedCodec.ts src/lib/seedCodec.test.ts
git commit -m "feat(seed): encodeSeed/decodeSeed 核心编解码 + 往返测试"
```

---

## Task 4: decodeSeed 容错测试（TDD 补全）

**Files:**
- Modify: `src/lib/seedCodec.test.ts`

- [ ] **Step 1: 写失败测试 — 非法码与 registry 改版**

在 `seedCodec.test.ts` 追加:
```ts
import { SEED_ALPHABET } from './seedCodec'

describe('decodeSeed 容错', () => {
  it('空串与长度<2 → null', () => {
    expect(decodeSeed('')).toBeNull()
    expect(decodeSeed('0')).toBeNull()
  })
  it('含非 base62 字符 → null', () => {
    expect(decodeSeed('0a!zzz')).toBeNull()
    expect(decodeSeed('0a-xx')).toBeNull()
    expect(decodeSeed('0a 中')).toBeNull()
  })
  it('版本号非 0 → null', () => {
    expect(decodeSeed('1ahalftone')).toBeNull()   // '1' 不是当前版本
  })
  it('特效序号越界 → null', () => {
    // styles.length = 11，SEED_ALPHABET[11] = 'B'；序号 11 >= 11 → 越界
    const over = SEED_ALPHABET[styles.length]
    expect(decodeSeed('0' + over)).toBeNull()
  })
  it('解包余数非 0（码过长）→ null', () => {
    const def = getStyle('ascii')!
    const code = encodeSeed('ascii', {}, def)
    // 末尾补 'Z'：等价于 big = big*62 + 35，逆序剥离 4 个参数后余数必然非 0
    expect(decodeSeed(code + 'Z')).toBeNull()
  })
  it('registry 改版：旧码在新（收窄 max）registry 下 → null', () => {
    const def = getStyle('halftone')!
    const maxed = numericParams(def, (p) => p.max)
    const code = encodeSeed('halftone', maxed, def)
    const newDef: StyleDefinition = {
      ...def,
      params: def.params.map((p) =>
        p.uniform === 'uCellSize' && (p.type === undefined || p.type === 'number')
          ? { ...p, max: 6 } as NumberParamDef
          : p,
      ),
    }
    expect(decodeSeed(code, [newDef])).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认通过**

Run: `npx vitest run src/lib/seedCodec.test.ts`
Expected: 全部 PASS（这些测的是既有 `decodeSeed` 的容错分支，实现已在 Task 3 就绪；`SEED_ALPHABET` 已在 Task 1 导出）。若有失败，说明 Task 3 的容错分支有漏洞，按 spec §5 修补。

- [ ] **Step 3: 提交**

```bash
git add src/lib/seedCodec.test.ts
git commit -m "test(seed): decodeSeed 容错（非法码/registry 改版）"
```

---

## Task 5: i18n 文案

**Files:**
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: 在两个 json 的顶层加 `seed` 对象**

> 现有 `zh.json` / `en.json` 的最后一个顶层 key 是 `export`（如 `"export": { "png": ..., "jpg": ..., "svg": ... }`），**无尾逗号**。插入时：在 `"export": {...}` 块的闭合 `}` **后补一个逗号**，再紧接插入 `"seed": {...}`，确保 JSON 合法。

`zh.json` 顶层加（与 `export` 同级）:
```json
"seed": {
  "label": "种子",
  "copy": "复制",
  "copied": "已复制",
  "copyFailed": "复制失败，请手动选中复制",
  "edit": "编辑",
  "apply": "应用",
  "cancel": "取消",
  "placeholder": "粘贴种子码…",
  "invalid": "种子码无效",
  "hint": "复制当前配置或粘贴他人种子码以复现"
}
```

`en.json` 顶层加:
```json
"seed": {
  "label": "Seed",
  "copy": "Copy",
  "copied": "Copied",
  "copyFailed": "Copy failed, select manually",
  "edit": "Edit",
  "apply": "Apply",
  "cancel": "Cancel",
  "placeholder": "Paste seed code…",
  "invalid": "Invalid seed code",
  "hint": "Copy current config or paste a seed to reproduce"
}
```

- [ ] **Step 2: 校验 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/zh.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('ok')"`
Expected: 输出 `ok`。

- [ ] **Step 3: 提交**

```bash
git add src/i18n/zh.json src/i18n/en.json
git commit -m "feat(seed): seed.* i18n 文案（zh/en）"
```

---

## Task 6: ParamPanel 新增 `top` slot

**Files:**
- Modify: `src/components/ParamPanel.tsx`

- [ ] **Step 1: 给 ParamPanelProps 加 `top`**

在 `ParamPanel.tsx` 的 `interface ParamPanelProps` 加一个字段（与现有 `children` 同级）:
```ts
interface ParamPanelProps {
  // ... 现有字段
  top?: ReactNode
  children?: ReactNode
  // ... 其余
}
```

- [ ] **Step 2: 在 body 渲染 `top`（在 params 列表之前）**

把 `ParamPanel` 函数签名加入 `top`（与 `children` 同级）。body 当前是：

```tsx
{!collapsed && (
  <div className="param-panel-body">
    {children ?? params?.map((p) => renderParam(
      p,
      values ?? {},
      textValues ?? {},
      onChange ?? (() => {}),
      onTextChange ?? (() => {}),
      onFontChange ?? (() => {}),
      fontValues ?? {},
    ))}
  </div>
)}
```

**只做一处改动**：在 `{children ?? params?.map(...)}` 这一行**之前**插入 `{top}`，其余完全不动：

```tsx
{!collapsed && (
  <div className="param-panel-body">
    {top}
    {children ?? params?.map((p) => renderParam(
      p,
      values ?? {},
      textValues ?? {},
      onChange ?? (() => {}),
      onTextChange ?? (() => {}),
      onFontChange ?? (() => {}),
      fontValues ?? {},
    ))}
  </div>
)}
```

> 关键：`{top}` 与 `{children ?? ...}` **并列**（不是二选一），`top` 在前。现有 App2D 调用不传 `children`，走 params 分支，`top` 显示在最上。`renderParam` 的 7 个位置参数保持原样，勿动。

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b`
Expected: 无新增错误。

- [ ] **Step 4: 提交**

```bash
git add src/components/ParamPanel.tsx
git commit -m "feat(seed): ParamPanel 新增 top slot"
```

---

## Task 7: SeedBar 组件

**Files:**
- Create: `src/components/SeedBar.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 实现 SeedBar**

`src/components/SeedBar.tsx`:
```tsx
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface SeedBarProps {
  seed: string
  onApply: (code: string) => boolean
}

export function SeedBar({ seed, onApply }: SeedBarProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(seed)
  const [applyError, setApplyError] = useState(false)   // 粘贴码无效
  const [copied, setCopied] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)  // 'copied' | 'copyFailed' | null

  const startEdit = useCallback(() => {
    setDraft(seed)
    setApplyError(false)
    setEditing(true)
  }, [seed])

  const cancel = useCallback(() => {
    setEditing(false)
    setApplyError(false)
  }, [])

  const apply = useCallback(() => {
    const ok = onApply(draft.trim())
    if (ok) {
      setEditing(false)
      setApplyError(false)
    } else {
      setApplyError(true)
    }
  }, [draft, onApply])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(seed)
      setCopyMsg('copied')
      setTimeout(() => setCopyMsg(null), 1500)
    } catch {
      // 非 HTTPS / 旧浏览器降级：提示手动复制，不阻塞
      setCopyMsg('copyFailed')
      setTimeout(() => setCopyMsg(null), 2500)
    }
  }, [seed])

  const copyLabel = copyMsg === 'copied' ? t('seed.copied')
    : copyMsg === 'copyFailed' ? t('seed.copyFailed')
    : t('seed.copy')

  if (editing) {
    return (
      <div className="seed-bar seed-bar--edit">
        <input
          className="seed-bar-input"
          value={draft}
          placeholder={t('seed.placeholder')}
          onChange={(e) => { setDraft(e.target.value); setApplyError(false) }}
          autoFocus
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            if (e.key === 'Escape') cancel()
          }}
        />
        <button className="seed-bar-btn seed-bar-btn--primary" onClick={apply}>{t('seed.apply')}</button>
        <button className="seed-bar-btn" onClick={cancel}>{t('seed.cancel')}</button>
        {applyError && <div className="seed-bar-error">{t('seed.invalid')}</div>}
      </div>
    )
  }

  return (
    <div className="seed-bar">
      <span className="seed-bar-label">{t('seed.label')}</span>
      <code className="seed-bar-code" title={t('seed.hint')} onClick={startEdit}>{seed}</code>
      <button className="seed-bar-btn" onClick={copy}>{copyLabel}</button>
      <button className="seed-bar-btn" onClick={startEdit}>{t('seed.edit')}</button>
    </div>
  )
}

export default SeedBar
```

- [ ] **Step 2: 加 CSS（global.css，参照现有 `.action-btn` / `.param-*` 风格）**

在 `global.css` 追加（建议放在 `.param-panel-body` 规则附近）:
```css
.seed-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.seed-bar-label { font-size: 12px; color: #666; }
.seed-bar-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: all;
  flex: 1;
  min-width: 60px;
}
.seed-bar--edit { flex-wrap: wrap; }
.seed-bar-input {
  flex: 1;
  min-width: 80px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 2px 4px;
}
.seed-bar-btn {
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: #f5f5f5;
  cursor: pointer;
  border-radius: 3px;
}
.seed-bar-btn:hover { background: #eaeaea; }
.seed-bar-btn--primary { background: #00ff66; border-color: #00cc52; color: #003314; }
.seed-bar-error { width: 100%; color: #c00; font-size: 11px; }
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b`
Expected: 无新增错误。

- [ ] **Step 4: 提交**

```bash
git add src/components/SeedBar.tsx src/styles/global.css
git commit -m "feat(seed): SeedBar 组件（展示/复制/粘贴应用）"
```

---

## Task 8: App2D 接入

**Files:**
- Modify: `src/components/App2D.tsx`

- [ ] **Step 1: 导入 + 派生 seed + handleApplySeed**

`App2D.tsx` 现有第 1 行是 `import { useState, useRef, useEffect, useCallback } from 'react'`（**无 `useMemo`**），改为补上 `useMemo`：
```ts
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
```

在顶部 import 区加（其余 import 不动）:
```ts
import { encodeSeed, decodeSeed } from '../lib/seedCodec'
import { SeedBar } from './SeedBar'
```
> `getStyle` 已在 App2D 现有 import 中（`import { styles, getStyle } from '../lib/StyleRegistry'`），无需重复。

在 `App2D` 组件内、`handleRandom` 回调附近加。**复用现有 `currentStyle` 变量**（约 [:352](../../src/components/App2D.tsx) `const currentStyle = getStyle(activeStyle)` 已存在，勿重复定义）:
```ts
const seed = useMemo(
  () => currentStyle ? encodeSeed(activeStyle, params, currentStyle) : '',
  [activeStyle, params, currentStyle],
)

const handleApplySeed = useCallback((code: string): boolean => {
  if (!image) return false
  const decoded = decodeSeed(code)
  if (!decoded) return false
  const def = getStyle(decoded.styleId)
  if (!def) return false
  setActiveStyle(decoded.styleId)
  setParams(decoded.params)
  setTextParams(initTextParams(decoded.styleId))
  setFontParams({})
  return true
}, [image])
```

> `initTextParams` 是模块级函数（[:28](../../src/components/App2D.tsx)），组件内可见，无需 import。`setParams/setTextParams/setFontParams/setActiveStyle` 均在组件作用域。

- [ ] **Step 2: 把 SeedBar 经 `top` 传入 ParamPanel**

找到 `<ParamPanel ... />`（约 [:396](../../src/components/App2D.tsx)），加 `top`:
```tsx
<ParamPanel
  title={t(currentStyle.label)}
  description={t(currentStyle.description)}
  params={currentStyle.params.map(/* 现有 */)}
  values={params}
  textValues={textParams}
  onChange={handleParamChange}
  onTextChange={handleTextChange}
  fontValues={fontParams}
  onFontChange={handleFontChange}
  top={<SeedBar seed={seed} onApply={handleApplySeed} />}
/>
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc -b && npx vite build`
Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add src/components/App2D.tsx
git commit -m "feat(seed): App2D 接入 SeedBar（派生 seed + 应用粘贴码）"
```

---

## Task 9: 手动验证（spec §8 组件项）

**Files:** 无（运行应用）

- [ ] **Step 1: 启动 dev server**

Run: `npm run dev`（后台运行；用浏览器打开 Vite 提示的 URL）

- [ ] **Step 2: 逐项手动验证**

按 spec §8 组件项 9–14 验证:
- [ ] 上传图 → ParamPanel 顶部出现 SeedBar，显示种子码。
- [ ] 点「复制」→ 按钮短暂变「已复制」；剪贴板含种子码。
- [ ] 手拖任一滑块 → 种子码变化。
- [ ] 点「随机」→ 种子码变化。
- [ ] 切换特效 → 种子码变化（特效号也变）。
- [ ] 点种子码 → 进入编辑态，输入框预填当前码。
- [ ] 粘贴一个刚复制的合法码 → 切到对应特效 + 还原参数（含跨特效：在 ascii 复制，切到 halftone，粘贴 ascii 码 → 切回 ascii）。
- [ ] 粘贴乱码（如 `!!!`）→ 显示「种子码无效」，当前状态不变。
- [ ] ASCII 种子：粘贴后字符集/颜色/字体走默认（不复现自定义）。
- [ ] 中英文切换 → `seed.*` 文案正确。
- [ ] 回归：其他 10 个 shader 特效渲染正常。

- [ ] **Step 3: 若发现问题，回到对应 Task 修复后重新验证；全部通过则结束**

- [ ] **Step 4: 停止 dev server**

验证完成后停止后台 dev server（`Ctrl+C` 或通过任务管理/TaskStop），避免遗留进程。

---

## Task 10: 最终回归与提交

**Files:** 无

- [ ] **Step 1: 跑全部测试**

Run: `npx vitest run`
Expected: 全绿（含 seedCodec 全部用例 + 现有用例）。

- [ ] **Step 2: 跑 lint**

Run: `npm run lint`
Expected: 无错误（warning 可接受）。

- [ ] **Step 3: 构建确认**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: 收尾提交（若有未提交改动）**

```bash
git add -A
git commit -m "chore(seed): 回归通过"
```
（若 Task 1–8 已分别提交且无遗留改动，本步可跳过。）
