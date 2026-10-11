---
title: 规格收口与设计确认
id: 02
labels: [wayfinder:grilling]
status: closed
assignee: OY_runchi
blocked-by: [01]
parent: map
---

## Question

把「玻璃质感原型定稿」的结果收口成一份可执行规格，并取得用户的设计确认——**这张票的关闭就是"设计确认"门，触发执行票的全自动模式**。

规格须覆盖：

1. 风格 id（如 `glassdistort`）与中英命名：style 名、label、desc（`zh.json` / `en.json` 的 style 块）。
2. 参数布局：玻璃类型 select 的选项数/顺序/文案（**三选项**：大波浪默认/方格压花/橘皮，票1 已定），强度三档命名与锚点值（各类型基准强度 0.78/0.51/0.34 已定，三档锚点围绕基准展开——比例外推 or 独立拍板，见 map 雾条）；确认无多余参数。
3. i18n 键清单（两文件 `:103` 起的 style 块，680 行对齐）。
4. 内置 presets 取舍（见 map 的 Not yet specified）。
5. 注册表追加位置确认（末位，map 已定铁律，此处只核对）与种子码增量（两个 select 各自的码长贡献，随机池入列确认）。
6. 定稿参数表落位：frag uniform 名与档位值直接抄「玻璃质感原型定稿」的 Resolution。

产出：完整规格清单记入 Resolution，格式让执行票可照抄不动脑。

## Resolution

**设计确认达成（2026-10-11，用户五问全按推荐收口）。以下即完整规格，票3 照抄不动脑。**

### 1. 风格 id 与命名

- id：`glassdistort`（`src/types.ts` StyleId union 同步加）
- zh label「玻璃扭曲」／ en label「Glass Distort」
- zh desc：「通过噪声位移场全幅重映射画面，如同隔着非平滑玻璃观看——大波浪、方格压花与橘皮三种玻璃质感。」
- en desc："Remaps the whole picture through a noise-driven displacement field, as if viewed through uneven glass — rolling waves, pressed grid, or orange peel."

### 2. 参数布局（仅两个 select，面板顺序：类型在前、强度在后）

| 参数 | uniform | 选项（value） | 默认 |
|---|---|---|---|
| 玻璃类型 glassType | `uGlassType` | 大波浪=0 / 方格压花=1 / 橘皮=2 | 0 |
| 扭曲强度 strength | `uStrengthLevel` | 轻微=0 / 标准=1 / 强烈=2 | 1 |

select 的 value = 档位序号；真实强度在 frag 内按（类型, 档位）查 §3 锚点矩阵。

### 3. 强度锚点矩阵（比例外推：弱 ×0.6／基准／强 ×1.25，大波浪强档 clamp 0.95）

| 玻璃类型 | 弱 | 中（默认） | 强 |
|---|---|---|---|
| 大波浪 | 0.47 | 0.78 | 0.95 |
| 方格压花 | 0.31 | 0.51 | 0.64 |
| 橘皮 | 0.20 | 0.34 | 0.43 |

基准即票1 定稿值；K 位移系数是 strength 的曲线函数，比例缩放沿曲线滑行，弱档自然温和（工程铁律意图）。

### 4. i18n 键清单（`zh.json`/`en.json` style 块末位，两文件对齐）

`style.glassdistort.` 下：`label`、`desc`、`glassType`（玻璃类型/Glass Type）、`glassTypeDesc`、`typeWave`（大波浪/Rolling Waves）、`typeGrid`（方格压花/Pressed Grid）、`typePeel`（橘皮/Orange Peel）、`strength`（扭曲强度/Distortion Strength）、`strengthDesc`、`strengthSubtle`（轻微/Subtle）、`strengthStandard`（标准/Standard）、`strengthStrong`（强烈/Strong）。Desc 文案按现有风格惯例一句功能描述。

### 5. presets

**不做**：参数空间 3×3=9，select 即达；随机种子可抽中全组合；面板（尤其 H5）保持干净。

### 6. 注册表与种子码增量

- `StyleRegistry.ts` styles 数组**末位**追加（第 12 个风格），renderMode 缺省即 shader。
- 种子码：两个 select 各贡献 3 进制位（seedCodec 的 select=options.length），入码且入随机池（randomSeed 自动覆盖 select）；无 toggle/text/font。追加末位 + SEED_VERSION 不变 → 旧码（v0/v1）不受影响。
- frag uniforms：`uImage`/`uResolution`（+ aspect 所需的尺寸 uniform，**按生产注入惯例核对**，执行票第一件事）+ `uGlassType`(int) + `uStrengthLevel`(int)。lab 的 uP0–uP3 全部常量化（抄票1 定稿表）、uSeam 固定开（仅方格分支）、uBypass 删除（对比走现有 compare）。
