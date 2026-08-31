# 2D 风格参数控件类型改造（下拉/开关/自定义值） —— 设计文档

日期：2026-08-31
状态：已与用户确认设计，待实现

## 背景与目标

2D 风格参数面板（ParamPanel，由 StyleRegistry 驱动）目前几乎全部参数渲染为滑条，即使参数本质是**枚举**（如 halftone 色彩模式 0/1/2）或**布尔**（如 grayscale 0/1）——用户必须盯 tooltip 才知道数字含义。本次改造：

1. **枚举滑条 → 下拉列表（select）**：7 个参数，选项文案直接可见。
2. **布尔滑条 → 开关（toggle）**：4 个参数。
3. **数字滑条 → 支持自定义值**：所有 number 滑条的数值标签点击后可内联键入精确值（clamp + 按 step 对齐）。

基础设施已存在：`ParamDef` 联合类型支持 number/text/toggle/color/select/font，`ParamPanel.renderParam` 全部能渲染；ascii 风格与 3D `BASE_PARAMS` 已在正确使用。本次只是把 2D 注册表里误用滑条的参数改对类型，并给滑条补内联编辑。

### 用户确认的决策

| 决策点 | 结论 |
|---|---|
| 范围 | 仅 2D 风格面板（StyleRegistry 的 11 个风格）。背景/录制/3D 光照面板的滑条均为连续量，不动 |
| 自定义值形态 | 点击数值标签内联变输入框（Enter/失焦提交、Esc 取消），非常驻输入框 |
| 随机按钮对 select/toggle | 保留现值（2D 现状行为，App2D 随机已跳过这两类，无需改代码） |
| 实现方案 | 方案 A：纯声明式改造。被否决：B（新增 stepper 控件，YAGNI）、C（滑条刻度吸附，不解决认知问题） |

## 1. 注册表类型改造（StyleRegistry.ts，11 个参数）

底层 uniform 值、值域、默认值**全部不变**，仅 UI 控件类型变化 → shader、preset/seed 存储、旧预设兼容性零影响。

### select（7 个）

| 风格 / uniform | 新 i18n 选项 key（value = 现数值） |
|---|---|
| halftone / `uColorMode` | `modeGray`(0) / `modeColor`(1) / `modeDuotone`(2) |
| halftone / `uShape` | `shapeCircle`(0) / `shapeSquare`(1) / `shapeDiamond`(2) |
| diffusion / `uNoiseType` | `noiseOrdered4`(0) / `noiseOrdered8`(1) / `noiseRandom`(2) |
| popart / `uPalette` | `paletteOriginal`(0) / `paletteWarm`(1) / `paletteCool`(2) / `paletteNeon`(3) / `paletteVintage`(4) |
| sketch / `uEdgeMethod` | `edgeSobel`(0) / `edgePrewitt`(1) |
| pointillism / `uShape` | `shapeCircle`(0) / `shapeSquare`(1) / `shapeTriangle`(2) |
| sketch / `uBgColor` | `bgWhite`(0) / `bgNavy`(1) |

选项 key 用语义命名，沿用 ascii 既有惯例（`caseKeep`/`caseUpper`/`caseLower`）。halftone 与 pointillism 的 `shape*` 分属各自命名空间，无冲突。

写法与 ascii 的 `caseMode` 一致：

```ts
{ name: 'style.halftone.colorMode', uniform: 'uColorMode', type: 'select' as const, options: [
  { label: 'style.halftone.modeGray', value: 0 },
  { label: 'style.halftone.modeColor', value: 1 },
  { label: 'style.halftone.modeDuotone', value: 2 },
], default: 1, description: 'style.halftone.colorModeDesc' },
```

### toggle（4 个）

| 风格 / uniform | 语义 |
|---|---|
| diffusion / `uGrayscale` | 灰度输出开关 |
| popart / `uBenDay` | 本戴点叠加开关 |
| sketch / `uHatching` | 影线效果开关 |
| crosshatch / `uInvert` | 反相（黑底白线）开关 |

## 2. i18n 更新（zh.json / en.json 同步）

- 新增上表选项 label，共 **21 个 i18n key**（`shapeCircle`/`shapeSquare` 在 halftone 与 pointillism 两个命名空间各有一份；zh：灰度/彩色/双色调、圆形/方形/菱形/三角形、4×4有序抖动/8×8有序抖动/随机噪声、原色/暖色/冷色/霓虹/复古、Sobel/Prewitt、白色/深蓝；en：Grayscale/Color/Duotone…）。
- 11 个参数的 Desc 去掉「0=xxx 1=xxx」编码说明，改为一句自然描述（语义已由选项/开关承载）。例：`crosshatch.invertDesc` → 「反转线条与背景（黑底白线）」。

## 3. 数值内联编辑（ParamPanel.tsx）

### 纯函数（新建 `src/lib/paramValue.ts` + 同名单测，沿用项目「纯函数放 lib 可单测」惯例）

```ts
/** 把键入值规范化为参数合法值：NaN 返回 fallback；clamp 到 [min,max]；相对 min 按 step 对齐并修浮点误差。 */
export function snapToStep(v: number, min: number, max: number, step: number, fallback: number): number
```

- 对齐公式：`Math.round((clamped - min) / step) * step + min`，再按 step 的小数位数 `toFixed` 修精度（避免 0.30000000000000004）。
- 显示沿用现有 `formatValue` 的精度规则，两者对同一值产出一致字符串。

### ParamValueInput（ParamPanel 内小组件，约 40 行）

- 点击数值 span → 切换为 `<input type="text" inputMode="decimal">`（不用原生 number，规避 spinner 与 Esc 行为差异），`autoFocus` 并全选当前值。
- Enter / 失焦 → 提交 `onChange(uniform, snapToStep(...))`；Esc → 取消还原。
- CSS：`.param-value-input` 追加到 global.css，宽度约 3.5em、右对齐，沿用 `param-value` 视觉变量。
- **共享组件自然外溢**：App3D 也用 ParamPanel，其效果参数滑条同样获得内联编辑（不改 3D 的 registry/行为，仅共享组件能力提升，视为一致体验）。

## 4. toggle / select 分支补 tooltip

`renderParam` 的 toggle 分支与 select 分支当前均不渲染 description tooltip（slider/text 均有）——select 的 Desc 现状是死文案（ascii 的 `caseModeDesc` 同样无处显示）。两分支都补齐同款 `param-tooltip-wrap` 结构：toggle 的 4 个、select 的 7 个转换参数均有有用描述；3D 既有 toggle（`mouseEnabled` 等）无 description 字段，不受影响。

## 5. 明确不改的部分

- shader uniform 名与取值、`defaultParams` / `defaultTextParams`（select/toggle 走既有 default 分支，天然兼容）
- App2D 随机逻辑（已跳过 select/toggle/text/color/font）
- preset / seed 编解码（存储仍是数字）
- 3D EffectRegistry、背景/录制/光照面板

## 6. 测试

- 新增 `snapToStep` 单测：常规对齐、clamp 上下界、浮点精度（step=0.01）、NaN 回退、非零 min 的网格对齐（如 min=0.5, step=0.1）。
- `StyleRegistry.test.ts` 现有循环断言对新类型天然兼容，预期不需改；如跑挂则修断言而非逻辑。
- 回归：`npm test` 全绿；`npm run lint` 不新增基线错误（11 个既有错误均在 3D 文件）；`npm run build` 通过。

## 7. 手动验收标准

1. halftone 风格：色彩模式/网点形状显示为下拉，选项文案正确，切换即生效（渲染结果与手输原数值一致）
2. diffusion/popart/sketch/crosshatch：grayscale/benDay/hatching/invert 显示为开关，勾选态与原数值 1 对应
3. 任意滑条（2D 与 3D 面板）：点击数值 → 输入 217 回车 → 值生效且滑条移动；输入越界值被 clamp；Esc 取消
4. 随机按钮：select/toggle 保持现值不变，连续量照常随机
5. 旧 localStorage 预设应用后，新下拉/开关正确落在预设存的数值上
6. 中英语言切换，选项与描述文案均正常显示
