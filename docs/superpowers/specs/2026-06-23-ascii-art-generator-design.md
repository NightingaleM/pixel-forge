# ZoA — ASCII 字符艺术生成器 设计文档

- **日期**: 2026-06-23
- **分支**: `feat/ascii-art-generator`
- **状态**: 已通过需求对齐，待实现规划
- **作者**: OY_runchi + Claude

---

## 1. 概述

### 1.1 目标

在现有 2D 图片风格化模块（App2D）中新增第 11 个风格项 **ASCII 字符艺术生成器（ZoA）**。通过图像灰度映射算法，将用户上传的图片转换为由自定义字符集组成的 ASCII 艺术图像，支持字符集 / 字体 / 颜色 / 密度等精细调节，并提供 JPG / PNG / SVG 三格式导出。

### 1.2 非目标（第一版明确不做）

- **视频序列帧**上传 / 播放 / 批量导出（仅预留接口，详见 §11）
- GIF / MP4 编码导出
- 移动端深度适配（仅保证桌面端可用，移动端基础可用即可）

### 1.3 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 形态定位 | **路线 B**：作为 App2D 第 11 个风格融入框架，ASCII 项用 Canvas 2D 特例渲染（其余 10 个风格仍走 WebGL shader） |
| 字符 → 灰度映射 | **按像素密度自动排序**：离屏 canvas 测量每个字符填充像素率，自动从稀疏（亮区）到密集（暗区）排列，中英文/符号通用 |
| 「轮廓/背景过滤」滑块语义 | **背景过滤阈值**：局部对比度低于阈值的平淡区域不画字符，ASCII 只出现在有纹理/边缘/主体的区域 |
| 视觉主题 | **沿用现有 App2D 亮色主题**，不单独做纯黑+荧光绿皮肤；仅将「字符颜色」参数默认值设为荧光绿 `#00ff66` |
| SVG 导出内容 | **只导出矢量字符层**（不含原图位图背景），保证「无限放大不失真」 |

---

## 2. 架构与接入

### 2.1 渲染分流

现有架构中，所有 2D 风格统一走 `ShaderRenderer`（WebGL fragment shader）。ASCII 因需支持「自定义字体上传」与「真·SVG 矢量导出」，二者均要求 Canvas 2D，故对 ASCII 这一项做特例分流。

在 [`StyleDefinition`](../../src/types.ts) 上新增可选字段：

```ts
export interface StyleDefinition {
  // ... 现有字段
  renderMode?: 'shader' | 'canvas2d'  // 默认 'shader'，现有 10 个风格零改动
}
```

[`App2D.renderWithStyle`](../../src/components/App2D.tsx) 在入口处按 `renderMode` 分流：

- `canvas2d` → 调用新建的 `AsciiCanvasRenderer`
- `shader`（默认）→ 现有 `ShaderRenderer` 逻辑不变

**canvas 元素共用同一个 `canvasRef`**，使 CompareSlider / 原图对比 / 导出全部复用，不引入第二块画布。

### 2.2 接入点改动范围

ASCII 风格注册后，以下机制**自动生效**，无需额外改动：左侧 `StyleSelector` 列表显示新项、`ParamPanel` 按参数定义自动生成控件、风格切换时的参数随机化（数值参数）/ 重置、参数变化触发的重渲染 useEffect。

---

## 3. 渲染管线（Canvas 2D）

```
1. 取原图 → 离屏 canvas 计算灰度图 + 局部对比度图
2. 按 uCellSize 划分字符网格
3. 逐 cell:
   a. 平均亮度 L ∈ [0,1]
   b. 局部对比度 C
   c. 若 C < uBgFilter → 跳过（不画字符，背景过滤）
   d. 否则: L → 字符密度 ramp 索引 → 选定字符
   e. fillText(char, color=uCharColor, font=当前字体,
              size=uCellSize × uCharScale × (1 ± uRandomScale))
4. 背景层: 若 uShowBg=1 → 在字符层下方先 drawImage(原图)
```

### 3.1 字符密度 ramp（缓存）

用户字符集或字体变化时，**重算一次**并缓存：

1. 创建离屏 canvas，对字符集中每个字符以固定字号绘制
2. `getImageData` 统计非透明（或非白）像素占比 = 字符填充率
3. 按填充率升序排序 → 密度 ramp（稀疏→密集）
4. 亮度 L 映射到 ramp 索引：`index = floor(L × (ramp.length - 1))`

英文字符大小写转换（`uCaseMode`）在测量前对字符集应用：保持 / `.toUpperCase()` / `.toLowerCase()`。

### 3.2 字体处理

- 未上传字体：使用系统等宽字体（如 `monospace`）
- 上传字体（TTF/WOFF/OTF）：通过 `FontFace` API 动态加载，`document.fonts.add` 后用于 canvas `ctx.font`
- 字体异步加载完成前，先用 fallback 渲染，加载完成后自动触发一次重绘

---

## 4. 参数系统扩展

### 4.1 新增 FontParamDef

在 [`ParamDef`](../../src/types.ts) 联合类型中新增：

```ts
export interface FontParamDef {
  type: 'font'
  name: string
  uniform: string
  description?: string
}
```

- [`ParamPanel`](../../src/components/ParamPanel.tsx) 增加文件选择控件（接受 `.ttf,.woff,.otf,.woff2`）
- [`App2D`](../../src/components/App2D.tsx) 新增 `fontParams: Record<string, FontFace | null>` 状态，`initParams` / `initTextParams` 同步跳过 `font` 类型
- `handleStyleChange` / `handleRandom` 跳过 `font` 类型（不可随机）

### 4.2 ASCII 参数清单

| 参数 | ParamDef 类型 | uniform | 范围 / 默认 | 说明 |
|---|---|---|---|---|
| 字符集 | `text` | `uCharset` | 默认 `哇真的是你啊!@#$%^&*+/=三:.` | 支持中英文/符号自由输入 |
| 自定义字体 | `font`（新） | `uFont` | 默认无（系统等宽） | 上传 TTF/WOFF/OTF |
| 大小写转换 | `select` | `uCaseMode` | 0 保持 / 1 大写 / 2 小写，默认 0 | 仅作用于英文字母 |
| 字符颜色 | `color` | `uCharColor` | 默认 `#00ff66`（荧光绿） | 字符填充色 |
| 显示原图背景 | `toggle` | `uShowBg` | 默认 1（开启） | 字符层下叠加原图 |
| 字符大小 | `number` | `uCharScale` | 0.5–1.5，step 0.05，默认 1.0 | 字符在格内的填充比例 |
| 字符间距/疏密 | `number` | `uCellSize` | 6–40，step 1，默认 14 | 格子像素尺寸，越小越密 |
| 字符随机缩放 | `number` | `uRandomScale` | 0–1，step 0.05，默认 0（关） | 随机缩放增强层次 |
| 背景过滤 | `number` | `uBgFilter` | 0–0.5，step 0.01，默认 0.12 | 平淡区不画字符 |

> **参数语义厘清**：「字符大小」(`uCharScale`) 与「间距/疏密」(`uCellSize`) 在网格模型中是两个独立维度：`uCellSize` 决定一行有多少字符（疏密），`uCharScale` 决定字符在格子内画多大。二者解耦，调节互不干扰。

---

## 5. 导出（JPG / PNG / SVG）

现有 [`handleDownload`](../../src/components/App2D.tsx) 仅有 PNG 单按钮。升级为三格式，导出当前预览帧：

| 格式 | 按钮 | 实现 | 背景行为 |
|---|---|---|---|
| **JPG** | 次要（白） | `canvas.toBlob('image/jpeg')` | `uShowBg` 关时 JPG 不支持透明 → 纯黑底 |
| **PNG** | 次要（白） | `canvas.toBlob('image/png')` | `uShowBg` 关时**透明背景** |
| **SVG** | 主（荧光绿，突出推荐） | 遍历字符矩阵生成 `<svg><text>` 矢量元素 | **只导字符层**，不含原图位图，保证无限放大不失真 |

文件名沿用 `{styleId}_{timestamp}.{ext}`，如 `ascii_1719...svg`。

**UI 接入**：`ActionBar` 增加导出格式选择。ASCII 风格（`renderMode: 'canvas2d'`）显示三按钮；其余 10 个 shader 风格保持现有单 PNG 按钮（最小化改动，不强行统一）。

---

## 6. 预览与交互

- **实时渲染**：复用现有参数变化 → useEffect → `renderWithStyle` 机制；Canvas 2D 路径用 `requestAnimationFrame` + debounce 节流重绘。
- **缩放控制（新）**：预览区右下角 `-` / `+` / `还原` + 百分比显示（默认 100%）。使用 CSS `transform: scale()` 缩放**显示**，不改变 canvas 渲染分辨率，**不影响导出**。
- **原图对比**：复用现有 [`CompareSlider`](../../src/components/CompareSlider.tsx) 的 `compareMode`（左原图 / 右效果图）。
- **状态反馈**：上传处理完成后显示「图像处理完成」提示（复用/扩展现有 `imageInfo` 反馈区）。
- **性能提示**：上传区标注「避免卡顿，图像建议控制在 2K 分辨率内」（i18n 文案）。

---

## 7. 性能与边界

- **处理分辨率**：ASCII 处理分辨率限制 ≤ 1280px（再放大显示），降低 cell 总数。
- **cell 数量估算**：1280px 宽 / `uCellSize=14` ≈ 91×91 ≈ 8300 cell，`fillText` 调用量可控。
- **节流**：参数滑动用 RAF + debounce（~16ms 合并），目标调节响应 ≤ 100ms。
- **缓存**：字符密度 ramp 仅在字符集/字体/大小写模式变化时重算。
- **异常**：超大文件 / 不支持格式 → 明确错误提示（扩展现有上传校验）；WebGL 不可用不影响 ASCII（其走 Canvas 2D）。

---

## 8. 国际化（i18n）

在 [`en.json`](../../src/i18n/en.json) / [`zh.json`](../../src/i18n/zh.json) 的 `style` 对象下新增 `ascii` 子树，遵循现有命名约定 `style.{styleId}.{key}` / `style.{styleId}.{keyDesc}`：

```
style.ascii.label / desc
style.ascii.charset / charsetDesc
style.ascii.font / fontDesc
style.ascii.caseMode / caseModeDesc (+ 选项 label)
style.ascii.charColor / charColorDesc
style.ascii.showBg / showBgDesc
style.ascii.charScale / charScaleDesc
style.ascii.cellSize / cellSizeDesc
style.ascii.randomScale / randomScaleDesc
style.ascii.bgFilter / bgFilterDesc
```

另需 `export.svg / export.jpg`（若现有文案无）、「图像处理完成」「2K 分辨率提示」等通用文案。

---

## 9. 文件级改动清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| [`src/types.ts`](../../src/types.ts) | 修改 | `StyleId` 加 `'ascii'`；新增 `FontParamDef`；`StyleDefinition` 加 `renderMode?` |
| [`src/lib/StyleRegistry.ts`](../../src/lib/StyleRegistry.ts) | 修改 | 注册 `ascii` 风格（`renderMode:'canvas2d'` + §4.2 参数） |
| `src/lib/AsciiCanvasRenderer.ts` | **新建** | Canvas 2D 渲染器：灰度/对比度计算、密度 ramp、背景过滤、字符绘制、SVG 生成 |
| [`src/components/App2D.tsx`](../../src/components/App2D.tsx) | 修改 | `renderWithStyle` 分流；`fontParams` 状态与初始化；导出分流（JPG/PNG/SVG） |
| [`src/components/ParamPanel.tsx`](../../src/components/ParamPanel.tsx) | 修改 | 新增 `font` 类型文件选择控件 |
| [`src/components/ActionBar.tsx`](../../src/components/ActionBar.tsx) | 修改 | ASCII 项显示三格式导出按钮，其余保持单 PNG |
| `src/components/ZoomControl.tsx` | **新建** | 缩放控件（- / + / 还原 + 百分比） |
| [`src/i18n/en.json`](../../src/i18n/en.json) / [`zh.json`](../../src/i18n/zh.json) | 修改 | `style.ascii.*` 及通用导出/提示文案 |
| [`src/styles/global.css`](../../src/styles/global.css) | 修改 | font 控件、三格式按钮、缩放控件样式 |

> 不新增 `.frag` 着色器——ASCII 走 Canvas 2D，不经 shader 管线。

---

## 10. 测试清单

1. 左侧列表出现「ASCII 字符艺术」项，点击切换后右侧参数面板正确显示全部 9 个参数。
2. 上传图片后实时渲染 ASCII 效果，调节每个参数预览即时更新。
3. 字符集输入中英文/符号混合，密度 ramp 正确（亮区稀疏字符、暗区密集字符）。
4. 上传 TTF/WOFF/OTF 字体后字符使用该字体渲染。
5. 大小写转换对英文字母生效，中文符号不受影响。
6. 背景过滤：提高 `uBgFilter` 平淡区字符减少；关闭原图背景时 PNG 导出透明。
7. 导出 JPG / PNG / SVG 三格式均可下载；SVG 放大不失真且不含位图背景。
8. 缩放控件 `-` / `+` / `还原` 正常，不影响导出分辨率。
9. 原图对比模式正常。
10. 中英文切换文案正确。
11. Reset 重置到默认值；Random 随机化数值参数（字符集/字体/颜色不随机）。
12. 切换到其他 10 个 shader 风格仍正常工作（回归）。

---

## 11. 未来扩展（预留接口，不在第一版实现）

- 视频序列帧上传 / 逐帧 ASCII 化 / 播放预览
- 序列帧批量导出为 GIF / MP4（需引入编码库）
- 移动端深度适配

`AsciiCanvasRenderer` 的核心渲染函数（输入：一帧图像 + 参数 → 输出：canvas/SVG）设计为**单帧无状态**，便于未来逐帧复用，无需重构即可接入序列帧管线。
