# 四种新特效设计文档

## 概述

为 web_pic_design_ai 新增4种 WebGL fragment shader 特效：文字栅格、万花筒镜像切片、网纹底稿、动画光影。遵循现有 `StyleRegistry` + `ShaderRenderer` 架构，仅在文字栅格特效处做最小架构扩展以支持文本输入。

## 新增特效一览

| 特效 | ID | Shader 类型 | 需要架构改动 |
|------|-----|------------|-------------|
| 文字栅格 | `textraster` | 单 pass + 文字纹理 | 是 |
| 万花筒镜像 | `kaleidoscope` | 单 pass | 否 |
| 网纹底稿 | `crosshatch` | 单 pass | 否 |
| 动画光影 | `animelight` | 多 pass (3 pass) | 否 |

## 1. 文字栅格（textraster）

### 效果描述
将图片重构为文字栅格画面。每个网格单元以一个字符表示，字符密度（笔画面积占比）映射到该区域的亮度：暗区用密集字符（如 `#`, `W`, `@`），亮区用稀疏字符（如 `.`, `:` 或空格）。字符颜色取自原图对应区域的颜色。适合制作文本海报、信息屏和实验排版效果。

### Shader 原理
1. 将画面分为 N×M 的字符网格
2. 每个单元采样原图中心像素获取亮度和颜色
3. 根据亮度值决定使用哪个字符（从文字纹理 atlas 中查找）
4. 输出：字符的前景色 = 原图颜色 × 字符 alpha 掩码，背景色 = 黑色/自定义

### 参数定义

| 参数 | Uniform | 类型 | 范围 | 默认值 | 说明 |
|------|---------|------|------|--------|------|
| 字符大小 | `uCellSize` | number | 4-40 | 12 | 每个字符单元的像素大小 |
| 文本内容 | `uTextContent` | text | - | "01" | 用户输入的文字，渲染为纹理 atlas |
| 字体大小 | `uFontSize` | number | 8-72 | 24 | 文字纹理中的字体大小 |
| 背景亮度 | `uBgBrightness` | number | 0.0-1.0 | 0.0 | 背景色亮度，0=纯黑 |
| 字符颜色强度 | `uColorStrength` | number | 0.0-2.0 | 1.0 | 字符前景色的饱和度/强度 |
| 网格旋转角度 | `uAngle` | number | 0-360 | 0 | 网格整体旋转角度 |

### 架构改动

#### types.ts
将 `ParamDef` 改为 discriminated union，消除类型歧义：
```typescript
interface NumberParamDef {
  type?: 'number'          // 默认 'number'
  name: string
  uniform: string
  min: number
  max: number
  step: number
  default: number
  description?: string
}

interface TextParamDef {
  type: 'text'
  name: string
  uniform: string          // 用于标识参数，不传给 GLSL
  textDefault: string      // 默认文本内容
  description?: string
}

type ParamDef = NumberParamDef | TextParamDef
```

`StyleId` 联合类型新增 `'textraster' | 'kaleidoscope' | 'crosshatch' | 'animelight'`。

#### ParamPanel.tsx
当 `param.type === 'text'` 时，渲染 `<input type="text">` 替代滑块。回调使用独立的 `onTextChange` 处理器。

#### ShaderRenderer.ts
新增 `loadTextTexture(text: string, fontSize: number): WebGLTexture` 方法：
1. 创建离屏 Canvas 2D
2. 计算字符 atlas 布局：每个字符占 `fontSize × fontSize` 的固定宽度格子，按单行水平排列
3. 逐字符绘制到 Canvas，白色文字 + 透明背景
4. 上传为 WebGL 纹理
5. 返回纹理对象

新增 `bindTexture(texture: WebGLTexture, unit: number)` 方法将纹理绑定到指定纹理单元。

Shader 接口协议（JS 和 GLSL 共同遵守）：
- `uCharAtlas` (sampler2D, TEXTURE1): 字符 atlas 纹理
- `uAtlasCount` (float): atlas 中的字符总数
- `uCellSize` (float): 每个字符单元的像素大小
- Shader 中亮度 → 字符索引映射：`charIndex = floor(luminance * uAtlasCount)`，然后在 atlas 中按 `uv.x = (charIndex + 0.5) / uAtlasCount` 采样

#### App.tsx
- 状态新增 `textParams: Record<string, string>` 存储文本参数值
- `initParams()` 只处理 `type !== 'text'` 的参数，跳过文本类型
- `handleRandom()` 只随机化数值参数，跳过文本类型
- 渲染管线中：在调用 `renderWithStyle` 前，对文本参数调用 `loadTextTexture` 生成纹理并绑定到 TEXTURE1
- `renderWithStyle` 增加对文本纹理的处理逻辑

## 2. 万花筒镜像（kaleidoscope）

### 效果描述
将图片以画面中心为原点分割为 N 个等分扇区，对每个扇区的 UV 做极坐标折叠 + 镜像翻转，产生万花筒式的对称图案。适合制作故障拼贴、错位人像和实验感画面。

### Shader 原理
1. 将 UV 转为以中心为原点的极坐标 (r, theta)
2. 计算 `theta mod (2π/N)` 得到扇区内角度
3. 对扇区内角度做镜像翻转（奇偶交替取反）
4. 将折叠后的极坐标转回笛卡尔坐标
5. 用折叠后的 UV 采样原图

### 参数定义

| 参数 | Uniform | 类型 | 范围 | 默认值 | 说明 |
|------|---------|------|------|--------|------|
| 扇区数 | `uSegments` | number | 2-24 | 6 | 万花筒的镜像分割数量 |
| 旋转角度 | `uRotation` | number | 0-360 | 0 | 整体旋转角度 |
| 缩放 | `uZoom` | number | 0.1-5.0 | 1.0 | 画面缩放倍率 |
| 中心 X 偏移 | `uCenterX` | number | -1.0-1.0 | 0.0 | 中心点水平偏移 |
| 中心 Y 偏移 | `uCenterY` | number | -1.0-1.0 | 0.0 | 中心点垂直偏移 |
| 边缘发光 | `uEdgeGlow` | number | 0.0-2.0 | 0.0 | 扇区边缘的发光强度 |
| 色相偏移 | `uHueShift` | number | 0-360 | 0 | 整体色相偏移 |

### 文件
- Shader: `src/shaders/kaleidoscope.frag`
- 无架构改动，遵循现有单 pass 模式

## 3. 网纹底稿（crosshatch）

### 效果描述
黑白底稿风格 + 纸张噪声 + 可旋转纹理网点。模拟漫画网纸/网点纸效果：先用边缘检测提取线稿轮廓，再用规则点阵填充暗部区域（点的大小与亮度成反比），叠加纸张纹理噪声增加质感。

### Shader 原理
1. Sobel 边缘检测提取轮廓线（黑色线条）
2. 计算亮度，暗区用更大的网点填充
3. 网点纹理通过旋转矩阵可调角度
4. 添加 Perlin noise 模拟纸张颗粒感
5. 输出：白底 + 黑色线稿 + 灰度网点

### 参数定义

| 参数 | Uniform | 类型 | 范围 | 默认值 | 说明 |
|------|---------|------|------|--------|------|
| 网点大小 | `uDotSize` | number | 2-30 | 8 | 纹理网点的基础大小 |
| 网点旋转角度 | `uScreenAngle` | number | 0-360 | 45 | 网点纹理的旋转角度 |
| 边缘灵敏度 | `uEdgeSensitivity` | number | 0.01-1.0 | 0.15 | 边缘检测的灵敏度阈值 |
| 线条粗细 | `uLineWidth` | number | 0.5-5.0 | 1.5 | 底稿轮廓线的粗细 |
| 纸张噪声强度 | `uPaperNoise` | number | 0.0-0.3 | 0.05 | 纸张纹理噪声的强度 |
| 网点浓度 | `uScreenDensity` | number | 0.1-3.0 | 1.0 | 网点覆盖的浓度/对比度 |
| 反转模式 | `uInvert` | number | 0-1 | 0 | 0=白底黑线 1=黑底白线 |

### 文件
- Shader: `src/shaders/crosshatch.frag`
- 无架构改动，遵循现有单 pass 模式

## 4. 动画光影（animelight）

### 效果描述
高饱和气氛光、描边 + 神光束，偏日系动画美术感。通过多 pass 管线实现：先提取边缘做描边，再做高斯模糊产生氛围光晕，最后合成高饱和色彩 + 描边 + 神光束（god ray）效果。

### Shader 原理（2 pass）

**Pass 1 — 边缘提取 + 模糊光晕 (`animelight_edge_blur.frag`)**
- Sobel 边缘检测提取边缘信息
- 在同一 shader 内对高亮区域做可分离模糊（采样周围像素取平均）产生光晕
- 输出编码到 RGBA：R=光晕强度，G=边缘强度，B/A=保留

**Pass 2 — 合成 (`animelight_composite.frag`)**
- 输入：TEXTURE0 = Pass 1 输出（光晕+边缘），TEXTURE1 = 原图 (`uOriginal`)
- 从原图读取颜色，增强饱和度和对比度
- 从 Pass 1 输出读取边缘强度叠加描边（深色/黑色边缘线）
- 从 Pass 1 输出读取光晕强度叠加氛围光晕
- 神光束（God Ray）：在合成 shader 中通过径向采样计算，无需额外 pass
- 最终色调映射

> 注意：简化为 2 pass 是因为当前 `renderMultiPass` 使用两 FBO ping-pong，只能传递一个中间纹理给最终 pass。2 pass 方案完全可行：边缘检测和模糊在同一 shader 中完成，神光束在合成 pass 中计算。

### 参数定义

| 参数 | Uniform | 类型 | 范围 | 默认值 | 说明 |
|------|---------|------|------|--------|------|
| 饱和度 | `uSaturation` | number | 0.5-4.0 | 1.8 | 色彩饱和度增强 |
| 描边宽度 | `uEdgeWidth` | number | 0.5-5.0 | 1.5 | 动画面描边的线条粗细 |
| 描边阈值 | `uEdgeThreshold` | number | 0.01-0.5 | 0.1 | 边缘检测灵敏度 |
| 神光强度 | `uGodRayStrength` | number | 0.0-3.0 | 1.0 | 神光束的亮度强度 |
| 神光方向 | `uGodRayAngle` | number | 0-360 | 135 | 神光束的发射方向角度 |
| 光晕半径 | `uGlowRadius` | number | 1-50 | 10 | 光晕扩散的模糊半径 |
| 色相偏移 | `uHueShift` | number | 0-360 | 0 | 整体色相偏移 |
| 对比度 | `uContrast` | number | 0.5-3.0 | 1.3 | 画面对比度 |

### 文件
- Shader: `src/shaders/animelight_edge_blur.frag`, `src/shaders/animelight_composite.frag`
- 遵循现有 `lightshadow` 的多 pass 模式（`isMultiPass: true`）

### 多 pass 原图访问问题

当前 `renderMultiPass` 管线中，每个 pass 只接收上一个 pass 的输出作为 `TEXTURE0` 上的 `uImage`，无法访问原始图片。animelight 合成 pass 和现有 `lightshadow_composite.frag` 都需要读取原图。

**解决方案**：修改 `renderMultiPass` 方法，在每次 pass 渲染前，额外将原始图片纹理绑定到 `TEXTURE1`。

**全局命名约定**（多 pass composite shader 统一遵守）：
- `TEXTURE0` → `uImage`: 上一个 pass 的输出
- `TEXTURE1` → `uOriginal`: 原始图片

具体改动（`ShaderRenderer.ts` 的 `renderMultiPass` 方法内）：
```typescript
// 在每个 pass 的纹理绑定之后、绘制之前，添加：
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, this.texture); // 原始图片始终在 TEXTURE1
```

**现有 lightshadow 修复**：同步修改 `lightshadow_composite.frag`，将 `uniform sampler2D uImage`（读取原图）改为 `uniform sampler2D uOriginal`，并删除未使用的 `uniform sampler2D uBlur` 声明。`uImage` 现在代表 blur_v 的输出（即 TEXTURE0 上的前一 pass 结果），`uOriginal` 代表原图（TEXTURE1）。

## 实施计划

### 阶段一：架构扩展（文字栅格支持）
1. 修改 `types.ts` — 扩展 ParamDef 和 StyleId
2. 修改 `ParamPanel.tsx` — 支持文本输入控件
3. 修改 `ShaderRenderer.ts` — 新增文字纹理生成方法
4. 修改 `App.tsx` — 处理文本参数和纹理绑定

### 阶段二：万花筒镜像（最简单，无需架构改动）
1. 创建 `kaleidoscope.frag` shader
2. 在 `StyleRegistry.ts` 注册

### 阶段三：网纹底稿
1. 创建 `crosshatch.frag` shader
2. 在 `StyleRegistry.ts` 注册

### 阶段四：动画光影（多 pass）
1. 修改 `renderMultiPass` 绑定原图到 TEXTURE1
2. 修复 `lightshadow_composite.frag` 使用 `uOriginal` 约定
3. 创建2个 shader 文件（edge_blur + composite）
4. 在 `StyleRegistry.ts` 注册

### 阶段五：文字栅格（依赖阶段一）
1. 创建 `textraster.frag` shader
2. 在 `StyleRegistry.ts` 注册
3. 集成文本纹理生成
