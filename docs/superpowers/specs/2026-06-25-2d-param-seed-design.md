# Pixel Forge — 2D 参数种子（可分享配置码）设计文档

- **日期**: 2026-06-25
- **分支**: `feat/2d-param-seed`
- **状态**: 已通过需求对齐，待实现规划
- **作者**: OY_runchi + Claude

---

## 1. 概述

### 1.1 目标

为 2D 风格化模块（App2D）增加**参数种子**：把当前特效的一组数值参数编码成一段**短小的字符串（种子码）**，用户可复制分享；他人粘贴种子码即可在自己的图片上复现**完全相同的参数配置**。

种子码是**当前参数值的指纹**——它不关心参数是「随机摇出来的」还是「手动微调的」，二者本质相同（都是 [`App2D`](../../src/components/App2D.tsx) 里 `params: Record<string, number>` 的数值）。因此种子能忠实复现任意状态，包括随机后再手调的微调。

### 1.2 非目标（第一版明确不做）

- **不存非数值参数**：文本内容（`uTextContent`）、字符集（`uCharset`）、字体（`uFont`）、颜色（`uCharColor`）、下拉/开关（`uCaseMode`/`uShowBg` 等）**不编码**，粘贴种子后这些走各自默认值。用户已确认接受此取舍。
- **不存 ASCII 运行时抖动**：[`AsciiCanvasRenderer.ts`](../../src/lib/AsciiCanvasRenderer.ts) 中 per-cell 的 `Math.random()` 字符大小扰动**完全不改**；`uRandomScale`（抖动幅度）作为数值参数照常编码，但其产生的逐字符随机外观不复现。用户已确认接受「非参数导致的渲染差异」。
- **不做 3D**：仅 2D。编码层设计为泛型、与 `StyleRegistry` 解耦，为未来 3D（`EffectRegistry`，同构）预留接入位（见 §9）。
- **不做种子库 / localStorage 收藏 / 服务端分享**：第一版仅本机复制粘贴。

### 1.3 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 种子编码内容 | **紧凑参数编码**：把当前数值参数值本身打包成短码（非 PRNG 种子、非 JSON）。统一「随机」与「手调」——能复现任意状态。 |
| 字符集 | **base62**（`0-9 A-Z a-z`，区分大小写）。码长最短；复制粘贴为主，区分大小写可接受。 |
| 作用范围 | **仅 2D**；编码层为 3D 预留泛型接口。 |
| SeedBar 位置 | **ParamPanel（参数面板）顶部**，通过新增 `top` slot 注入，不破坏现有参数渲染。 |
| ASCII 字符集取舍 | 接受：分享 ASCII 种子时，对方字符集/颜色/字体等走默认值，不复现自定义内容。 |
| 随机逻辑 | **不改** [`App2D`](../../src/components/App2D.tsx) 现有 `Math.random()`（[:202](../../src/components/App2D.tsx) / [:265](../../src/components/App2D.tsx)）。种子是值的指纹，不驱动随机。 |

---

## 2. 编解码核心

### 2.1 方案：混合进制打包（不是 PRNG）

每个数值参数在其 `min/max/step` 上有确定的「档位」数量。把所有数值参数的档位索引组合编码成一个大整数，再转 base62 字符串。

- **不使用 PRNG 种子**：PRNG 种子（一个数字驱动随机序列）只能复现「点随机按钮那一瞬」，无法表达手调值，且无法编码颜色/文本——已否决。
- **不使用 JSON+base64**：JSON 的 key 名与结构开销占绝大部分体积（真实参数信息仅几十 bit），码过长——已否决。
- **混合进制编码**：码长 ≈ 参数总信息量，最紧凑，且忠实编码值本身。

### 2.2 档位与索引

对每个 `NumberParamDef`（`type` 为 `number` 或缺省）：

```
count(p) = floor((p.max - p.min) / p.step) + 1                                    // 合法档位数
idx(p, value) = clamp(round((value - p.min) / p.step), 0, count(p) - 1)           // 仅编码侧容错：手调值越界时夹紧
```

> **编码侧 clamp，解码侧不 clamp**（见 §5）：编码时若手调值因浮点误差略越界，clamp 保证写出合法 idx；解码时若还原出的 idx ≥ count（说明码与当前参数定义不匹配），直接判失败，绝不夹紧成「看似合理」的值。

> `SKIP_RANDOM_UNIFORMS`（`uCenterX/uCenterY/uRotation/uAngle`）在随机时被设为 0，但它们是合法数值参数，**照常参与编码**——手调后有值时需被复现。无需特殊处理。

### 2.3 打包 / 解包（混合进制，大端）

**编码契约**：只编码 `NumberParamDef`（即 `p.type === undefined || p.type === 'number'`）。`toggle`/`select` 虽然在运行时 `params` 里也是 number（[`initParams`](../../src/components/App2D.tsx) 会把它们的 `default` 写进 `params`），但它们属于另一类参数，**编码层绝不触及**——故用**显式白名单**而非黑名单过滤，避免误编。

```ts
const numericParams = styleDef.params.filter(
  (p): p is NumberParamDef => p.type === undefined || p.type === 'number'
)
```

`color`/`text`/`font` 因 `type` 为字面量，天然被白名单排除。按 `numericParams` 在 params 数组中的**原始顺序**编码（顺序是编码契约，不可乱序）。

```
打包:
  big = 0n
  for p in numericParams:              // 正序
    big = big * BigInt(count(p)) + BigInt(idx(p))

解包:
  for p in reverse(numericParams):     // 逆序
    c = BigInt(count(p))
    idx = Number(big % c)
    big = big / c                      // 整数除法
    value = p.min + idx * p.step
```

用原生 **`BigInt`**，无新依赖，无 `Number` 精度损失。

### 2.4 base62 字符表与转换

```
ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'   // 62 字符，严格区分大小写

BigInt → string:  反复 big % 62n 取字符（低位在前），再反转
string → BigInt:  反复 big = big * 62n + digit(char)
```

**零值约定**：`encodeB62(0n) === ''`（空串）。当某特效全部参数取各自 `min`（idx 全 0）时参数码为空，种子码退化为仅前 2 位前缀。这是合法且**唯一**的零值表示——解码侧空串对应 `0n`。**切勿**给空串补前导 `'0'`（如 `if (!s) s = '0'`），那会破坏下面的前导零语义。

### 2.5 种子码结构

```
[ 版本号 1 字符 ][ 特效序号 1 字符 ][ 参数码（base62，变长）]
```

- **版本号**：第 0 位。当前版本固定为 `ALPHABET[0]`，即字符 `'0'`（版本号取 ALPHABET 索引即字符，二者是同一事实的两种表述，非巧合）。
- **特效序号**：第 1 位。取 [`styles`](../../src/lib/StyleRegistry.ts) 数组中该特效的 `index`，转 base62（当前 10 个特效，1 字符够且留扩展）。
- **参数码**：第 2 位起，§2.3 打包结果的 base62。

**切分与长度**：解码时 `code[0]` 取版本、`code[1]` 取特效序号、`code.slice(2)` 整体当 base62 解析为 `big`，再用该特效 `numericParams` 逆序逐个剥离。参数码**长度可变**：

- 解码**不依赖固定码长**，唯一终止条件是逆序剥离后 `big === 0n`（见 §5）。
- **前导 `'0'` 合法**：因 `'0'` 对应数值 0，参数码前补任意个 `'0'` 不改变 `big`，解出相同参数。故「全 min 短码」与「补零长码」互为等价码，解码均接受。
- **单参数特效亦成立**：即便某特效仅 1 个数值参数（当前 registry 最少是 ascii 的 4 个，但 §9 为 3D 预留时可能出现），`big = idx`，剥离一次后归零，校验通过，无歧义。

### 2.6 模块 API（`src/lib/seedCodec.ts`，纯函数）

```ts
import { styles, getStyle } from './StyleRegistry'
import type { StyleId, StyleDefinition } from '../types'

export const SEED_VERSION = 0   // 对应字符 '0'

// 编码：返回种子码字符串
export function encodeSeed(
  styleId: StyleId,
  params: Record<string, number>,
  styleDef: StyleDefinition,
): string

// 解码：成功返回 { styleId, params }；任何非法情况返回 null
export function decodeSeed(
  code: string,
  registry: StyleDefinition[] = styles,   // 默认全局 registry；可注入便于测试
): { styleId: StyleId; params: Record<string, number> } | null
```

`decodeSeed` 失败（返回 `null`）的条件见 §5。`registry` 参数默认从 `StyleRegistry` 取，调用方无需显式传入；测试时可注入自定义 registry。

### 2.7 码长预估（base62，含 2 位前缀）

**计算公式**：参数码长度 = `ceil(log62(totalCount))`，其中 `totalCount = ∏count(p)`（各数值参数档位数的连乘）；总码长 = `2 + 参数码长度`。**向上取整**——最坏情况（所有参数同时取各自 max）也必须放得下，宁可多一位。下表「码长」列均按此公式取 max 时的值（已逐一用 `62^k` 阈值复核）：

| 特效 | 数值参数数 | totalCount（max idx+1） | 参数码长 | 总码长 |
|---|---|---|---|---|
| ascii | 4 | 21×35×21×51 ≈ 7.9e5 | 4 | 6 |
| diffusion | 6 | 63×201×16×3×101×2 ≈ 1.2e8 | 5 | 7 |
| halftone | 6 | 49×291×3×361×3×361 ≈ 1.7e10 | 6 | 8 |
| textraster | 5 | 37×65×101×201×361 ≈ 1.8e10 | 6 | 8 |
| sketch | 8 | 96×100×101×2×2×361×10×2 ≈ 2.8e10 | 6 | 8 |
| pointillism | 6 | 59×491×101×101×91×3 ≈ 8.1e10 | 7 | 9 |
| crosshatch | 7 | 29×361×100×46×31×291×2 ≈ 8.7e11 | 7 | 9 |
| popart | 7 | 15×401×481×5×2×361×19 ≈ 2.0e11 | 7 | 9 |
| kaleidoscope | 7 | 23×361×491×201×201×201×361 ≈ 1.2e16 | 9 | 11 |
| lightshadow | 7 | 251×81×501×361×201×361×201 ≈ 5.4e16 | 10 | 12 |
| animelight | 8 | 351×46×50×301×361×491×361×251 ≈ 3.9e18 | 11 | 13 |

范围 **6–13 字符**，多数 7–10，符合「十来位」心智。

| 特效 | 数值参数数 | 典型码长 | 说明 |
|---|---|---|---|
| ascii | 4 | 6 | 仅 cellSize/charScale/randomScale/bgFilter |
| diffusion | 6 | 7 | — |
| halftone | 6 | 8 | — |
| textraster | 5 | 8 | 不含 textContent |
| sketch | 8 | 8 | — |
| pointillism | 6 | 9 | — |
| crosshatch | 7 | 9 | — |
| popart | 7 | 9 | — |
| kaleidoscope | 7 | 11 | — |
| lightshadow | 7 | 12 | — |
| animelight | 8 | 13 | 最长 |

范围 **6–13 字符**，多数 7–10，符合「十来位」心智。

---

## 3. App2D 集成

### 3.1 派生当前种子码（`useMemo`）

```ts
const seed = useMemo(
  () => currentStyle ? encodeSeed(activeStyle, params, currentStyle) : '',
  [activeStyle, params, currentStyle],
)
```

种子码由 `activeStyle + params` 派生，**单向**。以下操作会自动更新种子码：

- 点「随机」([:257](../../src/components/App2D.tsx)) / 切换特效 ([:188](../../src/components/App2D.tsx))：`params` 变 → 种子码变。
- 手拖滑块 (`handleParamChange` [:241](../../src/components/App2D.tsx))：`params` 变 → 种子码变。

调到满意时，复制那一刻的种子码即可。

### 3.2 应用种子码（粘贴）

```ts
const handleApplySeed = useCallback((code: string): boolean => {
  if (!image) return false                              // 无图时拒绝：渲染 effect 因 !image 早退，改了状态画面也不变
  const decoded = decodeSeed(code)
  if (!decoded) return false
  const def = getStyle(decoded.styleId)
  if (!def) return false
  setActiveStyle(decoded.styleId)
  setParams(decoded.params)
  setTextParams(initTextParams(decoded.styleId))   // 非数值参数走默认
  setFontParams({})                                  // 字体清空（走默认）
  return true
}, [image])
```

成功返回 `true`，SeedBar 退出编辑态；失败返回 `false`，SeedBar 显示错误提示且**不改变当前任何状态**。

**渲染时序与批量更新**：4 个 setState 在 React 18 下批量合并为一次提交，[重渲染 useEffect](../../src/components/App2D.tsx)（依赖 `[image, activeStyle, params, textParams, fontParams]`）只跑一次，参数一致。切到 ASCII（canvas2d）无就绪问题——`AsciiCanvasRenderer` 懒创建、不依赖 `rendererRef`；切到 shader 特效也无问题——`rendererRef` 在 `image` 就绪时即创建（不依赖 `activeStyle`）。

**与「点 StyleSelector 切特效」语义一致**：`setFontParams({})` 与 [`handleStyleChange`](../../src/components/App2D.tsx) 一样丢弃当前字体。即粘贴种子**不保留**当前字体——对方若要精确复现带字体的 ASCII，需重新上传同一字体（§1.3 已确认接受此取舍）。`setActiveStyle` 直接触发，**不经过** `handleStyleChange`（后者是 StyleSelector 点击回调，会随机重置 params），故必须在此显式 `setParams(decoded.params)`。

---

## 4. UI：SeedBar 组件

### 4.1 ParamPanel 新增 `top` slot

[`ParamPanel`](../../src/components/ParamPanel.tsx) 当前 body 为 `children ?? params?.map(...)`。新增可选 prop：

```ts
interface ParamPanelProps {
  // ... 现有字段
  top?: ReactNode        // 新增：渲染在 .param-panel-body 最顶部，参数列表之前
}
```

渲染处：

```tsx
<div className="param-panel-body">
  {top}
  {children ?? params?.map(...)}
</div>
```

SeedBar 通过 `top` 注入，零侵入现有参数渲染。App2D 调用处（[:396](../../src/components/App2D.tsx)）增加 `top={<SeedBar seed={seed} onApply={handleApplySeed} />}`。

### 4.2 SeedBar 交互

**展示态**（默认）：

```
┌─────────────────────────────────────────────┐
│ 种子  1a8Kx3fP2Q              [复制] [编辑] │
└─────────────────────────────────────────────┘
```

- 种子码等宽字体显示，可手动选中。
- **复制**：`navigator.clipboard.writeText(seed)`，成功后按钮短暂变为「已复制」（~1.5s 还原）。
- **编辑**：切到编辑态。

**编辑态**：

```
┌─────────────────────────────────────────────┐
│ [粘贴种子码…___________________] [应用] [取消] │
│  ⚠ 种子码无效                                  │
└─────────────────────────────────────────────┘
```

- 输入框预填当前种子码，聚焦全选，方便覆盖粘贴。
- **应用**：调用 `onApply(draft)`；成功 → 退出编辑态、清错误；失败 → 显示 `seed.invalid`，保持编辑态与输入内容。
- **取消**：丢弃 draft，回展示态。

### 4.3 SeedBar props

```ts
interface SeedBarProps {
  seed: string                 // 当前派生种子码
  onApply: (code: string) => boolean   // 返回是否成功
}
```

无图 / 无特效时（`seed === ''`）SeedBar 不渲染（由 App2D 控制：仅在 `image && currentStyle` 的 ParamPanel 内传入）。

---

## 5. 边界与容错

`decodeSeed` 在以下任一情况返回 `null`（SeedBar 显示「种子码无效」，不改状态）：

| 情况 | 处理 |
|---|---|
| 空字符串 / 长度 < 2（缺版本或序号） | `null` |
| 含非 base62 字符（如 `-`、空格、中文） | `null` |
| 版本号 ≠ `'0'`（未来版本或损坏） | `null`（v1+ 由未来迁移逻辑处理） |
| 特效序号超出 `registry.length`（未知特效） | `null` |
| 参数码 base62 解析为大整数后，逆序解包完仍有余数（`big > 0n`） | `null`（码超过该特效所需，合法种子应刚好解完归零） |
| 解包出某参数 `idx >= count(p)`（参数定义收窄，如 `max` 调小） | `null` |

**合法但不报错的等价情形**（非 `null`）：

- **参数码前导 `'0'`**：`decodeSeed(code)` 与 `decodeSeed(code.slice(0,2) + '0'.repeat(n) + code.slice(2))` 返回相同参数（见 §2.5）。
- **全 min 短码**：参数码为空时（§2.4 零值约定），解出全部参数 = 各自 `min`。

> **不采用 clamp 兜底**：种子应精确还原，clamp 会偷偷产生非预期值，不如明确失败让用户知道码与当前版本不匹配。

**应用层额外校验**（`handleApplySeed`，见 §3.2）：

| 情况 | 处理 |
|---|---|
| 无图（`image` 为空）时调用 | 返回 `false`（防御：当前 SeedBar 仅在有图时挂载，但保留此守卫防未来 UI 重构污染状态） |

**剪贴板降级**：优先 `navigator.clipboard.writeText`；非 HTTPS / 旧浏览器（部分 Firefox）可能不可用，`catch` 后回退提示用户手动选中复制，不阻塞功能。

---

## 6. 国际化（i18n）

在 [`zh.json`](../../src/i18n/zh.json) / [`en.json`](../../src/i18n/en.json) 顶层新增 `seed` 对象（非某 style 专属）：

| key | zh | en |
|---|---|---|
| `seed.label` | 种子 | Seed |
| `seed.copy` | 复制 | Copy |
| `seed.copied` | 已复制 | Copied |
| `seed.edit` | 编辑 | Edit |
| `seed.apply` | 应用 | Apply |
| `seed.cancel` | 取消 | Cancel |
| `seed.placeholder` | 粘贴种子码… | Paste seed code… |
| `seed.invalid` | 种子码无效 | Invalid seed code |
| `seed.hint` | 复制配置或粘贴他人种子复现 | Copy config or paste a seed to reproduce |

---

## 7. 文件级改动清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/lib/seedCodec.ts` | **新建** | `encodeSeed` / `decodeSeed` + base62 + 混合进制打包；纯函数，零依赖（仅用原生 `BigInt`） |
| `src/lib/seedCodec.test.ts` | **新建** | 单元测试（见 §8） |
| `src/components/SeedBar.tsx` | **新建** | 种子 UI（展示/编辑态、复制、应用、错误提示） |
| [`src/components/App2D.tsx`](../../src/components/App2D.tsx) | 修改 | `seed` 派生（`useMemo`）；`handleApplySeed`；ParamPanel 传 `top={<SeedBar/>}` |
| [`src/components/ParamPanel.tsx`](../../src/components/ParamPanel.tsx) | 修改 | 新增 `top?: ReactNode` prop，渲染于 body 顶部 |
| [`src/i18n/zh.json`](../../src/i18n/zh.json) / [`en.json`](../../src/i18n/en.json) | 修改 | 新增 `seed.*` 文案 |
| [`src/styles/global.css`](../../src/styles/global.css) | 修改 | `.seed-bar` 及子元素样式（与现有 `.param-*` 风格一致） |

> **不改动**：`StyleRegistry`、`ShaderRenderer`、`AsciiCanvasRenderer`、`ActionBar`、shader 源码、随机逻辑。

---

## 8. 测试清单

> **测试环境约束**：项目 vitest 未配置 `environment`（无 jsdom/happy-dom），测试默认在 **node 环境**跑。故自动化单元测试**仅覆盖 `seedCodec` 纯函数**（原生 BigInt 在 node 可用）；SeedBar 组件交互（剪贴板、DOM）走手动验证，第一版不引入 jsdom 配置变动。

`seedCodec.test.ts`（纯函数，参考 [`src/lib/ascii/*.test.ts`](../../src/lib/ascii/) 模式）：

1. **往返（默认值）**：每个特效，`decodeSeed(encodeSeed(id, defaultParams, def))` 深等于 `{ styleId: id, params: defaultParams }`。
2. **全 max 往返**（最易触发码长不足）：每个特效，所有数值参数同时取各自 `max`，编码解码后精确还原。
3. **边界值**：每个数值参数分别取 `min` 与 `max`，编码解码后精确还原（含 step 量化）。
4. **码长**：各特效 default 参数编码后，码长在 §2.7 表「总码长」列范围内。
5. **前导零等价**：`decodeSeed(code.slice(0,2) + '000' + code.slice(2))` 深等于 `decodeSeed(code)`；全 min 时参数码为空、种子码仅前 2 位，解码出全 min。
6. **非法码**：空串、长度 < 2、含非 base62 字符（`-`/空格/中文）、版本号非 `'0'`、特效序号越界、解包余数非 0、idx 越界 → 均 `null`。
7. **大小写敏感**：base62 解码严格区分大小写（`'a'` ≠ `'A'`）。
8. **registry 改版**（注入方向）：用「旧 registry（max 较大）编码」→ 用「新 registry（max 调小）解码」→ 返回 `null`（idx 越界），验证 §5 容错。通过 `decodeSeed(code, newRegistry)` 注入。

组件 / 集成（**手动**，原因见上方约束）：

9. SeedBar 展示当前派生种子码；复制按钮写入剪贴板并短暂提示「已复制」；http://localhost 下剪贴板不可用时回退提示手动复制。
10. 粘贴合法种子 → 切换到对应特效 + 还原数值参数 + 非数值参数为默认（含 ASCII：字符集/颜色/字体/大小写/背景开关走默认）。
11. 粘贴非法种子 → 显示 `seed.invalid`，当前特效/参数/图片状态不变。
12. 手拖滑块 / 点随机 / 切特效 → 种子码自动更新。
13. 中英文切换，`seed.*` 文案正确。
14. 切换到其他 10 个 shader 风格仍正常工作（回归）。

---

## 9. 未来扩展（预留接口，不在第一版实现）

- **3D 接入**：`EffectRegistry` 与 `StyleRegistry` 同构（都有 `params: ParamDef[]`）。`seedCodec` 已通过 `registry` 参数解耦，可直接复用于 3D `EffectDef`；仅需在 App3D 加同样的 `seed` 派生 + SeedBar。
- **版本迁移**：当参数定义变化（min/max/step 改动或增删参数），升 `SEED_VERSION`，在 `decodeSeed` 内按版本分支做迁移映射。
- **种子库**：localStorage 收藏常用种子；服务端短链分享。

---

## 10. 评审修订记录

本文档经独立 spec review（子代理）后修订。逐条处置如下：

| 评审条目 | 处置 | 落地位置 |
|---|---|---|
| **B1** 过滤用黑名单易误编 toggle/select | ✅ 采纳：改显式白名单 `p.type === undefined \|\| p.type === 'number'`，并声明 toggle/select 在 params 中也是 number 但不参与编码 | §2.3 |
| **B2**「码长表偏小」 | ❌ **驳回（评审算术有误）**：评审系统性高估 `log62`（疑误用 `log10(36)`≈1.55 作除数）且 animelight/lightshadow 的 totalCount 乘积算错（把 3.9e18 记成 3.9e21）。已用 `62^k` 阈值逐一复核全部 11 个特效，原表数字全部正确（见 §2.7 重列）。但**吸收其有效建议**：显式给出 `ceil(log62(totalCount))` 公式、补 totalCount 列、新增「全 max 往返」测试 | §2.7、§8 |
| **B3** 变长参数码前导零歧义 | ✅ 采纳：声明前导 `'0'` 合法、解码靠 `big===0n` 收尾不依赖固定码长、单参数特效成立 | §2.5 |
| **B4** 无图粘贴防御 + 批量更新说明 | ✅ 采纳：`handleApplySeed` 加 `if (!image) return false`；补 React 18 批量更新与 ASCII/shader 渲染时序说明 | §3.2、§5 |
| **N1** 零值 `encodeB62(0n)===''` 约定 | ✅ 采纳 | §2.4 |
| **N2** fontParams 清空与切特效语义一致 | ✅ 采纳：声明粘贴种子不保留字体 | §3.2 |
| **N4** 测试补全 max / 前导零 / registry 注入方向 | ✅ 采纳：测试项重构 | §8 |
| **N5** 编码侧 clamp / 解码侧不 clamp 标注 | ✅ 采纳 | §2.2、§5 |
| **N6** 版本号与 ALPHABET[0] 关系说明 | ✅ 采纳 | §2.5 |
| vitest 默认 node 环境、组件测试策略 | ✅ 采纳：声明自动化仅覆盖纯函数，组件走手动 | §8 |
