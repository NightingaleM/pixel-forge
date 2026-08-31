# 2D 颜色参数改原生色板选择器 —— 设计文档

日期：2026-08-31
状态：已与用户确认设计，待实现

## 背景与目标

2D 风格里有 7 个颜色相关滑条参数，分两类：

- **3 个「绝对颜色」**——shader 里 `hue2rgb(色相)` 直接取色，饱和度/亮度被 shader 写死：
  - sketch `uLineColor`（线条颜色，`hue2rgb(uLineColor/360)`，哨兵 `<=0.5` 为黑）
  - lightshadow `uGlowColor`（光晕颜色，`mix(白, hue2rgb(h), 0.5)`，哨兵 `<=0.5` 为白）
  - animelight `uGodRayColor`（神光颜色，`hsv2rgb(h, 0.6, 1.0)` 特制版）
- **4 个「色相偏移」**（halftone/popart/kaleidoscope/animelight 的 `uHueShift`）——相对偏移量（0=不变），色板语义不符，**保持滑条不动**。

本次把 3 个绝对颜色参数改为原生色板（`<input type="color">`，选完整 RGB），饱和度/亮度首次可调。

### 用户确认的决策

| 决策点 | 结论 |
|---|---|
| 范围 | 仅 3 个绝对颜色参数；4 个色相偏移保持滑条 |
| 形态 | 原生色板（非彩虹色相条）；shader 取色行改 vec3 直取 |
| 哨兵语义 | 删除 `if (hue > 0.5)` 哨兵——选黑即黑线、选白即白光晕，语义更自然 |
| 默认视觉 | 新 default hex 按各 shader 原公式**精确换算**，保证新旧默认渲染逐像素一致 |

## 1. 参数定义改造（StyleRegistry.ts）

3 个参数从 `NumberParamDef` 改为现成的 `ColorParamDef`（`type: 'color'`，default 为 hex，走 textParams 数据流——`defaultTextParams`/预设存储/随机跳过均已支持）：

| 参数 | 现 default（hue°） | 新 default hex | 换算依据（各 shader 原公式） |
|---|---|---|---|
| `style.sketch.lineColor` / `uLineColor` | 27 | `#FF7300` | `hue2rgb(27/360)` = (1.0, 0.45, 0.0) → 255,115,0 |
| `style.lightshadow.glowColor` / `uGlowColor` | 0 | `#FFFFFF` | default hue=0 时哨兵 `if (uGlowColor > 0.5)` 为 false，原默认渲染即纯白光晕 (1,1,1) |
| `style.animelight.godRayColor` / `uGodRayColor` | 17 | `#FF9166` | 特制 `hsv2rgb(17/360, 0.6, 1)` = (1.0, 0.57, 0.4) → 255,145,102 |

三处 shader 的 `hue2rgb` 为同一三角波实现：`r=|h*6-3|-1, g=2-|h*6-2|, b=2-|h*6-4|`（clamp 0..1）；animelight 的 `hsv2rgb` 为 `mix(vec3(V), hue2rgb(H)*V, S)`。hex 取整用 Math.round。

## 2. shader 取色行改造（3 文件各 1-3 行）

- **sketch.frag**：uniform 声明 `uLineColor` → `uLineColorR/uLineColorG/uLineColorB` 三行；main 中 `vec3 lineColor = vec3(0.0); if (uLineColor > 0.5) {...}` → `vec3 lineColor = vec3(uLineColorR, uLineColorG, uLineColorB);`
- **lightshadow_composite.frag**：`uGlowColor` → 三 uniform；`vec3 glowTint = vec3(1.0); if (...) glowTint = mix(vec3(1.0), hue2rgb(...), 0.5);` → `vec3 glowTint = vec3(uGlowColorR, uGlowColorG, uGlowColorB);`（删 mix 与哨兵；选白 #FFFFFF 即原「无色调」效果）
- **animelight_composite.frag**：`uGodRayColor` → 三 uniform；`vec3 rayColor = hsv2rgb(vec3(uGodRayColor/360.0, 0.6, 1.0));` → `vec3 rayColor = vec3(uGodRayColorR, uGodRayColorG, uGodRayColorB);`

因换用直取 + default 按原渲染结果换算，**默认视觉逐像素不变**；此后选什么渲什么（可调饱和度/明度）。死函数清理（实施前以引用 grep 为准，已预核）：sketch 的 `hue2rgb` 仅 144 行引用，改后删除；lightshadow 的 `hue2rgb` 仅此一处引用，改后删除；**animelight 的 `hsv2rgb` 在 75 行仍有主图颜色转换引用，保留**（其 `hue2rgb` 若只被 `hsv2rgb` 引用则一并保留）。

## 3. 2D 渲染路径拆 uniform（App2D.tsx 一处）

`renderWithStyle` 构建 `mergedParams` 后（godRayAuto 覆盖逻辑附近），遍历 `styleDef.params` 中 `type === 'color'` 的参数：从 `textParams[param.uniform] ?? param.default` 取 hex，`parseInt(hex.slice(1,3|3,5|5,7),16)/255` 拆 R/G/B 写入 `mergedParams[`${uniform}R/G/B`]`（照抄 ParticleEngine.ts:977-981 的 3D 先例）。

安全性：`ShaderRenderer.setUniform` 对未声明/被优化掉的 uniform 静默跳过（loc === null return，ShaderRenderer.ts:192），multi-pass（lightshadow 3-pass、animelight 2-pass）中 R/G/B 只在 composite pass 声明，其余 pass 自动忽略，无副作用。

## 4. ParamPanel color 分支统一 ParamLabel（顺带一致性）

color 分支是 renderParam 中唯一未挂 tooltip 的分支（ascii `charColorDesc` 为死文案）——换用上一任务提取的 `ParamLabel`，与 text/toggle/select/font/slider 五分支统一，charColor 的描述顺带激活。

## 5. 兼容性影响

- **旧预设**：存的 hue 数字（number）因类型变化在 `mergeWithDefaults` 中被丢弃 → 回新默认。**保存在默认 hue 附近的预设渲染视觉不变**（default 按原渲染结果换算）；保存过自定义 hue 的预设，该颜色回默认色（同类已接受权衡）。
- **种子码**：3 个参数退出 seedCodec 编码（`isNumeric` 只认 undefined/number），sketch/lightshadow/animelight 的旧种子失效——注意 mixed-radix 错位下部分旧种子可能解码"成功"但数值错位（QA 时按无效对待）；新种子不含颜色参数（应用种子回默认色）。与上一任务 11 参数的同类已接受权衡。
- **随机按钮**：App2D 随机已跳过 color 类型。
- **3D**：不涉及（其 color 机制独立且已工作）。
- shader、`ShaderRenderer`、presetStore、seedCodec 本体不改逻辑。

## 6. 测试

- `StyleRegistry.test.ts` 不变量扩展：color 参数 default 必须匹配 `/^#[0-9a-fA-F]{6}$/`。
- 三个 default hex 的换算正确性由「新旧默认渲染逐像素一致」验收兜底（hex 由 shader 公式手算锁定，见第 1 节表格）。
- 回归：vitest 全绿（现 83 + 新增）、tsc 0 错、lint 基线 11 持平、build 通过。

## 7. 手动验收标准

1. sketch：线条颜色显示色板（默认 #FF7300），默认渲染与改造前逐像素一致；选黑色 → 黑线（原哨兵效果）
2. lightshadow：光晕颜色色板（默认 #FFFFFF，即原哨兵 0 的白光晕），默认渲染一致；选深色 → 深色光晕（新能力）
3. animelight：神光颜色色板（默认 #FF9166），默认渲染一致
4. 饱和度/明度可调：选淡蓝/暗红等非纯色生效
5. 随机按钮不动这 3 个颜色；预设保存/载入颜色完整还原
6. 4 个 hueShift 滑条完全不变；3D 页面无变化
