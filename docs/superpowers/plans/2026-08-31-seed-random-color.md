# 种子与随机支持色板颜色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复色板特性遗留：随机按钮随机 color 参数、种子码编码/解码 color 参数。

**Architecture:** seedCodec 的 mixed-radix 序列纳入 color 档（radix 2^24，hex↔index 双向映射）；App2D 三处接线（encode 传 textParams、apply 合 colorParams、random 生成随机 hex）。

**Tech Stack:** 纯 TS + vitest。Spec: `docs/superpowers/specs/2026-08-31-seed-random-color-design.md`

**注意：** 本机 vitest 默认 threads 池故障，所有 vitest 命令必须带 `--pool=vmThreads`。

---

### Task 1: seedCodec 支持 color 编解码（TDD）

**Files:**
- Test: `src/lib/seedCodec.test.ts`
- Modify: `src/lib/seedCodec.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/seedCodec.test.ts` 变更三处：

(a) import 行的 `encodeSeed` 处不变，但文件顶部加 `import { defaultTextParams } from './StyleRegistry'`（若未引入）。

(b) `describe('encodeSeed / decodeSeed')` 内，`全 max 码长等于 spec 表` 用例的 animelight 断言与注释更新：

```ts
    expect(maxOf('animelight')).toBe(21)  // color 档回归编码：+2^24 因子 ≈ +4~5 字符（实测校准，见注释）
```

（执行时先按 21 跑；若实测差 1，以实测值填入并在行尾注释记录推导。该用例的 maxOf 需同时传 color 全值：见 (c) 的 helper。）

同时给该 describe 新增 helper 与用例（放在 `前导零等价` 用例之后）：

```ts
  function colorParamsOf(def: StyleDefinition): Record<string, string> {
    const o: Record<string, string> = {}
    for (const p of def.params) {
      if (p.type === 'color') o[p.uniform] = p.default
    }
    return o
  }

  it('color 参数参与编码：往返还原（解码统一小写）', () => {
    const def = getStyle('sketch')!
    const params = numericParams(def, (p) => p.default)
    const code = encodeSeed('sketch', params, def, { uLineColor: '#00FF7F' })
    const decoded = decodeSeed(code)
    expect(decoded).not.toBeNull()
    expect(decoded!.colorParams).toEqual({ uLineColor: '#00ff7f' })
    expect(decoded!.params).toEqual(params)   // numeric 部分不受影响
  })

  it('color 档位两端往返：#000000 与 #FFFFFF', () => {
    const def = getStyle('animelight')!
    const params = numericParams(def, (p) => p.default)
    for (const hex of ['#000000', '#FFFFFF']) {
      const code = encodeSeed('animelight', params, def, { uGodRayColor: hex })
      expect(decodeSeed(code)!.colorParams).toEqual({
        uGodRayColor: hex.toLowerCase(),
      })
    }
  })

  it('不传 textParams 时 color 用 default（旧三参调用兼容）', () => {
    const def = getStyle('lightshadow')!
    const params = numericParams(def, (p) => p.default)
    const decoded = decodeSeed(encodeSeed('lightshadow', params, def))
    expect(decoded!.colorParams).toEqual({ uGlowColor: '#FFFFFF' })
  })

  it('无 color 参数的风格：旧格式种子解码不变（向后兼容）', () => {
    const def = getStyle('halftone')!
    const maxed = numericParams(def, (p) => p.max)
    const decoded = decodeSeed(encodeSeed('halftone', maxed, def))
    expect(decoded!.params).toEqual(maxed)
    expect(decoded!.colorParams).toEqual({})
  })
```

(c) `全 max 往返` 用例（86-95 行）的码长上限放宽：`expect(code.length).toBeLessThanOrEqual(17)` → `toBeLessThanOrEqual(21)`（color 全值档位 +4~5 字符）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/seedCodec.test.ts --pool=vmThreads`
Expected: FAIL——color 往返用例报 `decoded.colorParams` 为 undefined（现实现不产出）；animelight 码长断言不符

- [ ] **Step 3: 实现**

`src/lib/seedCodec.ts` 变更：

(a) `encodeSeed` 签名与实现（保持 def 第 3 参位置不变，textParams 可选第 4 参）：

```ts
/** 编码：{ styleId, params, textParams(color 部分) } → 种子码字符串.
 *  textParams 缺省时 color 参数取各自 default（旧三参调用语义不变）. */
export function encodeSeed(
  styleId: StyleId,
  params: Record<string, number>,
  def: StyleDefinition,
  textParams: Record<string, string> = {},
): string {
  const seedable = seedableListOf(def)
  let big = 0n
  for (const p of seedable) {
    if (isNumeric(p)) {
      const count = BigInt(paramCount(p))
      const idx = BigInt(paramIndex(p, params[p.uniform] ?? p.default))
      big = big * count + idx
    } else {
      // color 档：hex → 24-bit index，radix 2^24 覆盖 #000000..#FFFFFF 全值域
      const hex = textParams[p.uniform] ?? p.default
      big = big * 16777216n + BigInt(parseInt(hex.slice(1), 16))
    }
  }
  const version = ALPHABET[SEED_VERSION]
  const styleIdx = styles.findIndex((s) => s.id === styleId)
  if (styleIdx < 0) throw new Error(`encodeSeed: unknown styleId ${styleId}`)
  return version + ALPHABET[styleIdx] + encodeB62(big)
}
```

(b) `decodeSeed` 返回类型与解包循环：

```ts
export function decodeSeed(
  code: string,
  registry: StyleDefinition[] = styles,
): { styleId: StyleId; params: Record<string, number>; colorParams: Record<string, string> } | null {
  if (code.length < 2) return null
  const versionVal = CHAR_TO_VAL[code[0]]
  if (versionVal !== SEED_VERSION) return null
  const styleVal = CHAR_TO_VAL[code[1]]
  if (styleVal === undefined || styleVal >= registry.length) return null
  const def = registry[styleVal]
  if (!def) return null

  const big = decodeB62(code.slice(2))
  if (big === null) return null

  const seedable = seedableListOf(def)
  const out: Record<string, number> = {}
  const colorOut: Record<string, string> = {}
  let rem = big
  for (let i = seedable.length - 1; i >= 0; i--) {
    const p = seedable[i]
    if (isNumeric(p)) {
      const count = BigInt(paramCount(p))
      const idx = Number(rem % count)
      rem = rem / count
      if (idx < 0 || idx >= paramCount(p)) return null
      out[p.uniform] = valueOfIndex(p, idx)
    } else {
      // color 档：24-bit index → 小写 hex（与 input type=color 产出一致）
      const n = rem % 16777216n
      rem = rem / 16777216n
      colorOut[p.uniform] = '#' + n.toString(16).padStart(6, '0')
    }
  }
  if (rem !== 0n) return null
  return { styleId: def.id, params: out, colorParams: colorOut }
}
```

(c) `numericListOf` 旁新增（isNumeric 保持不动）：

```ts
function seedableListOf(def: StyleDefinition): StyleDefinition['params'][number][] {
  return def.params.filter((p) => isNumeric(p) || p.type === 'color')
}
```

（类型注意：seedable 元素为联合类型，循环内用 isNumeric(p) 收窄到 NumberParamDef；else 分支 TS 需能收窄到 ColorParamDef——若联合中还有其他类型残留，用 `p.type === 'color'` 显式判断替代 else。以 tsc 通过为准。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/seedCodec.test.ts --pool=vmThreads`
Expected: PASS（若 animelight 码长与 21 差 1，按实测校准断言值并在注释记录）

- [ ] **Step 5: 全量回归**

Run: `npx tsc -b --pretty false && npx vitest run --pool=vmThreads && npx eslint src/lib/seedCodec.ts src/lib/seedCodec.test.ts`
Expected: tsc 无输出；全绿（87 + 新 4 = 91）；eslint exit 0

- [ ] **Step 6: Commit**

```bash
git add src/lib/seedCodec.ts src/lib/seedCodec.test.ts
git commit -m "feat(seed): 种子码编码 color 参数——mixed-radix 纳入 2^24 色档，解码产出 colorParams"
```

---

### Task 2: App2D 接线（种子生成/应用 + 随机颜色）

**Files:**
- Modify: `src/components/App2D.tsx`

- [ ] **Step 1: 种子生成传 textParams**（约 411-414 行）

```tsx
  const seed = useMemo(
    () => currentStyle ? encodeSeed(activeStyle, params, currentStyle, textParams) : '',
    [activeStyle, params, textParams, currentStyle],
  )
```

- [ ] **Step 2: 种子应用合并 colorParams**（约 416-431 行 handleApplySeed）

merge 行改为：

```tsx
    // decodeSeed 产出 numeric + color 参数(toggle/select 仍不参与编码),以风格默认值
    // 为底合并补齐;colorParams 覆盖默认色,text 类型(charset 等)仍回默认
    const merged = mergeWithDefaults(def, decoded.params, {
      ...defaultTextParams(decoded.styleId),
      ...decoded.colorParams,
    })
```

- [ ] **Step 3: 随机按钮支持 color**（handleRandom，约 294-301 行的 skip 循环）

在循环中 `p.type === 'color'` 不再 continue，改为收集随机色并在循环后合并写入（与 randomParams 同步）：

```tsx
    const randomParams: Record<string, number> = { ...params }
    const randomColors: Record<string, string> = {}
    for (const p of styleDef.params) {
      if (p.type === 'text' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
      if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) continue
      if (p.type === 'color') {
        // 均匀随机 RGB(与 3D 随机一致),16777216 覆盖含 #FFFFFF 的全值域
        randomColors[p.uniform] = '#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0')
        continue
      }
      const range = p.max - p.min
      const raw = p.min + Math.random() * range
      randomParams[p.uniform] = Math.round(raw / p.step) * p.step
    }
    setParams(randomParams)
    if (Object.keys(randomColors).length > 0) {
      setTextParams((prev) => ({ ...prev, ...randomColors }))
    }
```

（color 参数无 SKIP_RANDOM 概念——SKIP_RANDOM_UNIFORMS 列表里若含 color uniform 以现状为准，不新增条目。）

- [ ] **Step 4: 验证**

Run: `npx tsc -b --pretty false && npx vitest run --pool=vmThreads && npx eslint src/components/App2D.tsx`
Expected: 全过

- [ ] **Step 5: Commit**

```bash
git add src/components/App2D.tsx
git commit -m "fix(app2d): 随机按钮随机色板颜色 + 种子生成/应用纳入 color 参数"
```

---

### Task 3: 全量回归

- [ ] Run: `npx vitest run --pool=vmThreads && npx eslint . 2>&1 | tail -3 && npm run build`
- Expected: 91/91；lint 11 基线；build 成功
- [ ] 手动验收（留给用户）：sketch 调色 → 种子码变化 → 应用种子颜色还原；随机按钮每次变色；halftone 等旧种子照常可用
