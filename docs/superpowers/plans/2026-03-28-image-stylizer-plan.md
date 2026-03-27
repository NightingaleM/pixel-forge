# 图片风格化工具网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯前端图片风格化工具网站，支持 6 种风格（网点、扩散、波普、光影、底稿、圆点）的实时 WebGL Shader 渲染与参数调整。

**Architecture:** React + Vite 单页应用，WebGL GLSL Shader 做图像处理。ShaderRenderer 封装 WebGL 上下文管理，StyleRegistry 管理风格定义与参数，React 组件负责 UI 交互。光影风格需要 FBO 多 pass 渲染。

**Tech Stack:** React 18, TypeScript, Vite, WebGL 1.0 (GLSL ES 1.0), Vite raw import for shaders

**Spec:** `docs/superpowers/specs/2026-03-28-image-stylizer-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types.ts` | 全局类型定义（StyleDefinition, ParamDef, StyleId） |
| `src/lib/StyleRegistry.ts` | 风格注册表，导出 6 种风格定义 |
| `src/lib/ShaderRenderer.ts` | WebGL 上下文、shader 编译、纹理上传、渲染、FBO 管理 |
| `src/shaders/common.vert` | 共享 vertex shader |
| `src/shaders/halftone.frag` | 网点风格 fragment shader |
| `src/shaders/diffusion.frag` | 扩散风格 fragment shader |
| `src/shaders/popart.frag` | 波普风格 fragment shader |
| `src/shaders/lightshadow_blur_h.frag` | 光影风格 — 水平高斯模糊 pass |
| `src/shaders/lightshadow_blur_v.frag` | 光影风格 — 垂直高斯模糊 pass |
| `src/shaders/lightshadow_composite.frag` | 光影风格 — 最终合成 pass |
| `src/shaders/sketch.frag` | 底稿风格 fragment shader |
| `src/shaders/pointillism.frag` | 圆点风格 fragment shader |
| `src/styles/global.css` | 全局极简硬朗风格 CSS |
| `src/components/App.tsx` | 主应用，状态管理，布局组合 |
| `src/components/ImageUploader.tsx` | 图片上传（拖拽 + 点击） |
| `src/components/StyleSelector.tsx` | 左侧风格列表 |
| `src/components/CanvasPreview.tsx` | Canvas 预览区 |
| `src/components/ParamPanel.tsx` | 参数面板（Slider 控件） |
| `src/components/ActionBar.tsx` | 右侧操作按钮 |
| `src/components/CompareSlider.tsx` | 滑动对比组件 |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`

- [ ] **Step 1: 初始化 Vite + React + TypeScript 项目**

```bash
cd c:/Users/Night/Desktop/dev/web_pic_design_ai
npm create vite@latest tmp-scaffold -- --template react-ts
# 移动文件到项目根目录（排除已有的 docs/ 和 .git/）
cp -r tmp-scaffold/* . && cp tmp-scaffold/.gitignore . 2>/dev/null; rm -rf tmp-scaffold
npm install
```

- [ ] **Step 2: 配置 Vite 支持 shader 文件 raw import**

修改 `vite.config.ts`（不需要额外配置，Vite 原生支持 `?raw` 导入）：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

添加 `src/vite-env.d.ts` 中声明 shader `?raw` 模块类型：

```ts
/// <reference types="vite/client" />
declare module '*.vert?raw' {
  const value: string
  export default value
}
declare module '*.frag?raw' {
  const value: string
  export default value
}
```

**重要**: 所有 shader 文件导入必须使用 `?raw` 后缀，例如：
```ts
import halftoneFrag from './shaders/halftone.frag?raw'
```

- [ ] **Step 3: 清空默认模板内容**

清空 `src/App.tsx`、`src/App.css`、`src/index.css`，`src/App.css` 和 `src/index.css` 直接删除。

- [ ] **Step 4: 启动 dev server 验证**

```bash
npm run dev
```

Expected: 浏览器打开后显示空白页面，无报错。

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html src/ && git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

## Task 2: Types & StyleRegistry

**Files:**
- Create: `src/types.ts`
- Create: `src/lib/StyleRegistry.ts`

- [ ] **Step 1: 创建类型定义 `src/types.ts`**

```ts
export type StyleId = 'halftone' | 'diffusion' | 'popart' | 'lightshadow' | 'sketch' | 'pointillism'

export interface ParamDef {
  name: string       // UI 显示名
  uniform: string    // GLSL uniform 名
  min: number
  max: number
  step: number
  default: number
}

export interface ShaderPass {
  fragSource: string       // shader 源码字符串
  uniforms: Record<string, number>  // 该 pass 专用的额外 uniform（可选）
}

export interface StyleDefinition {
  id: StyleId
  label: string       // UI 显示名
  shaderImports: (() => Promise<string>)[]  // 函数数组，每个返回一个 fragment shader 源码
  params: ParamDef[]
  isMultiPass?: boolean  // 是否需要 FBO 多 pass
}
```

注意：`shaderImports` 用函数形式以支持动态导入。单 pass 风格只有 1 个元素，光影风格有 3 个。

- [ ] **Step 2: 创建 StyleRegistry `src/lib/StyleRegistry.ts`**

根据 spec 中各风格的参数定义，导出 `styles` 数组和 `getStyle` 工具函数。包含全部 6 种风格的完整参数定义（uniform 名、范围、step、默认值）。具体参数参考 spec 中"各风格 uniform 声明"和"6 种风格详细设计"两节。

波普色板预设（palette 0-4）的 hex 颜色硬编码在 `popart.frag` shader 中，不通过 uniform 传入。

**圆点背景色特殊处理**：pointillism 的背景色由 3 个 uniform（uBgR/uBgG/uBgB）控制。在 StyleRegistry 中，用 3 个 ParamDef 分别定义（name: "背景R/背景G/背景B"），UI 中显示为 3 个 slider。或者简化为白色背景固定值，不暴露给用户。

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/lib/StyleRegistry.ts
git commit -m "feat: add types and StyleRegistry with all 6 style definitions"
```

---

## Task 3: ShaderRenderer Core

**Files:**
- Create: `src/lib/ShaderRenderer.ts`
- Create: `src/shaders/common.vert`

- [ ] **Step 1: 创建 vertex shader `src/shaders/common.vert`**

```glsl
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
```

- [ ] **Step 2: 创建 ShaderRenderer `src/lib/ShaderRenderer.ts`**

核心 API：

```ts
class ShaderRenderer {
  constructor(canvas: HTMLCanvasElement)
  loadImage(image: HTMLImageElement): void   // 创建纹理，处理尺寸限制（max 2048）
  useShader(fragSource: string): void        // 编译+链接 shader program
  setUniform(name: string, value: number | number[]): void
  render(): void                             // 单 pass 渲染到 canvas
  renderToFBO(fragSource: string, uniforms: Record<string, number>): WebGLTexture  // 渲染到 FBO 纹理
  renderMultiPass(passes: ShaderPass[]): void // 多 pass 渲染：前 N-1 pass 渲染到 FBO，最后 pass 渲染到 canvas
  destroy(): void                            // 清理 WebGL 资源
}
```

`renderMultiPass` 实现：
- 接收 ShaderPass 数组
- 创建 2 个 FBO 用于 ping-pong
- 前 N-1 个 pass：输入纹理（原图或上一 pass 输出）→ FBO
- 最后 1 个 pass：输入纹理 → canvas
- 每次调用前自动创建 FBO（如尺寸不匹配则重建）

实现要点：
- WebGL 上下文 `preserveDrawingBuffer: true`
- 全屏四边形（两个三角形）渲染
- `MAX_TEXTURE_SIZE` 检测，图片超限时等比缩小
- Shader 编译错误捕获并 throw
- FBO 创建/管理用于光影风格的多 pass 渲染

- [ ] **Step 3: Commit**

```bash
git add src/shaders/common.vert src/lib/ShaderRenderer.ts
git commit -m "feat: add ShaderRenderer with WebGL context, texture, FBO management"
```

---

## Task 4: First Shader — Halftone

**Files:**
- Create: `src/shaders/halftone.frag`

- [ ] **Step 1: 编写 halftone fragment shader**

核心算法：
1. UV 坐标旋转（按 angle）
2. 将 UV 按 cellSize 划分网格
3. 每个网格中心采样平均亮度
4. 画圆，半径 = dotScale * (1.0 - brightness)
5. colorMode: 0=单色(黑), 1=CMYK 四通道叠加, 2=彩色(保留原色)

```glsl
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uCellSize;
uniform float uDotScale;
uniform float uColorMode;
uniform float uAngle;

float circle(vec2 uv, vec2 center, float radius) {
  return 1.0 - smoothstep(radius - 1.0, radius, length(uv - center));
}

void main() {
  // rotate UV
  float rad = uAngle * 3.14159265 / 180.0;
  vec2 uv = vUv - 0.5;
  uv = mat2(cos(rad), -sin(rad), sin(rad), cos(rad)) * uv;
  uv = uv + 0.5;

  vec2 pixelSize = 1.0 / uResolution;
  float cellSize = uCellSize;
  vec2 cellCount = uResolution / cellSize;
  vec2 cellUv = uv * cellCount;
  vec2 cellId = floor(cellUv);
  vec2 cellLocal = fract(cellUv) - 0.5;

  // sample center of cell
  vec2 sampleUv = (cellId + 0.5) / cellCount;
  vec3 color = texture2D(uImage, sampleUv).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  float radius = uDotScale * (1.0 - lum) * 0.45;
  float d = circle(cellLocal, vec2(0.0), radius);

  if (uColorMode < 0.5) {
    // monochrome
    gl_FragColor = vec4(vec3(d), 1.0);
  } else {
    // color
    gl_FragColor = vec4(color * d, 1.0);
  }
}
```

注意：CMYK 模式（colorMode=1）在实现中可选，基础版先实现单色和彩色两种。

- [ ] **Step 2: Commit**

```bash
git add src/shaders/halftone.frag
git commit -m "feat: add halftone fragment shader"
```

---

## Task 5: Global Styles

**Files:**
- Create: `src/styles/global.css`

- [ ] **Step 1: 创建全局样式**

极简硬朗风格规范：
- 背景 `#F5F5F0`，边框 `#000`，直角无圆角
- 选中态黑底白字
- Slider 细线轨道 + 方形滑块
- 文字三级灰度 `#000` / `#333` / `#999`

涵盖：body, 按钮基础样式, slider 样式, 布局工具类。

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add global minimalist CSS styles"
```

---

## Task 6: UI Components

**Files:**
- Create: `src/components/ImageUploader.tsx`
- Create: `src/components/StyleSelector.tsx`
- Create: `src/components/ParamPanel.tsx`
- Create: `src/components/ActionBar.tsx`
- Create: `src/components/CanvasPreview.tsx`

- [ ] **Step 1: ImageUploader 组件**

Props: `onImageLoad: (image: HTMLImageElement) => void`
- 支持拖拽上传和点击选择文件
- FileReader 读取为 HTMLImageElement
- 校验文件类型为图片
- 无图片时显示上传提示区域

- [ ] **Step 2: StyleSelector 组件**

Props: `styles: StyleDefinition[], activeId: StyleId, onSelect: (id: StyleId) => void`
- 垂直列表显示 6 种风格
- 选中态：黑底白字；默认态：白底黑字
- 点击切换风格

- [ ] **Step 3: ParamPanel 组件**

Props: `params: ParamDef[], values: Record<string, number>, onChange: (uniform: string, value: number) => void`
- 每个参数一行：名称 + 当前值 + Slider
- Slider 的 min/max/step 从 ParamDef 获取
- onChange 实时触发（用 input 事件而非 change）

- [ ] **Step 4: ActionBar 组件**

Props: `onDownload: () => void, onReset: () => void, onRandom: () => void, imageInfo: { width, height, size } | null`
- 下载（黑底白字按钮）、重置、随机参数
- 底部显示图片信息

- [ ] **Step 5: CanvasPreview 组件**

Props: `canvasRef: RefObject<HTMLCanvasElement>`
- 渲染一个 Canvas 元素
- 无图片时显示占位提示

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add all UI components"
```

---

## Task 7: App Integration

**Files:**
- Create: `src/components/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: 编写 App.tsx 主组件**

状态管理：
```ts
const [image, setImage] = useState<HTMLImageElement | null>(null)
const [activeStyle, setActiveStyle] = useState<StyleId>('halftone')
const [params, setParams] = useState<Record<string, number>>({})
const canvasRef = useRef<HTMLCanvasElement>(null)
const rendererRef = useRef<ShaderRenderer | null>(null)
```

核心逻辑：
- image 变化时：创建 ShaderRenderer，loadImage
- activeStyle 变化时：useShader 加载对应 fragment shader，重置参数为默认值
- params 变化时：setUniform + render
- 使用 useEffect 管理 renderer 生命周期

布局：三栏（StyleSelector | CanvasPreview + ParamPanel | ActionBar）

- [ ] **Step 2: 更新 main.tsx**

导入 global.css，渲染 App 到 DOM。

- [ ] **Step 3: 启动 dev server，用一张测试图片手动验证**

```bash
npm run dev
```

Expected: 上传图片 → 选择"网点"风格 → 看到网点效果 → 调整参数实时更新。

- [ ] **Step 4: Commit**

```bash
git add src/components/App.tsx src/main.tsx
git commit -m "feat: integrate App with ShaderRenderer pipeline, halftone working end-to-end"
```

---

## Task 8: Remaining 5 Shaders

**Files:**
- Create: `src/shaders/diffusion.frag`
- Create: `src/shaders/popart.frag`
- Create: `src/shaders/lightshadow.frag`
- Create: `src/shaders/sketch.frag`
- Create: `src/shaders/pointillism.frag`

逐个实现每个 shader，每完成一个就提交并在浏览器中验证效果。

- [ ] **Step 1: 扩散 Diffusion shader**

单 pass Bayer 矩阵有序抖动：
1. 像素化（按 pixelSize 取整 UV）
2. 采样颜色
3. 量化到 levels 个色阶
4. 叠加 Bayer 矩阵阈值偏移（spread 控制强度）
5. noiseType: 0=Bayer 4x4, 1= Bayer 8x8, 2=伪随机

- [ ] **Step 2: Commit diffusion**

```bash
git add src/shaders/diffusion.frag && git commit -m "feat: add diffusion shader (ordered dithering)"
```

- [ ] **Step 3: 波普 Pop Art shader**

1. 色调分离（posterize 到 levels 级）
2. 提高饱和度和对比度
3. 映射到硬编码波普色板（5 个预设，通过 palette uniform 选择）
4. 可选 Ben-Day 圆点叠加

5 个色板的颜色直接在 shader 中用 if/else 或数组定义。

- [ ] **Step 4: Commit popart**

```bash
git add src/shaders/popart.frag && git commit -m "feat: add pop art shader with 5 palettes"
```

- [ ] **Step 5: 光影 Light & Shadow shader**

此风格需要多 pass：
1. **Pass 1** (FBO): 对亮度通道做水平高斯模糊（glowRadius 控制模糊范围）
2. **Pass 2** (FBO): 对 Pass 1 结果做垂直高斯模糊 → 得到光晕纹理
3. **Pass 3** (Canvas): 混合原图 + 光晕，应用 contrast 和 threshold 做明暗分割，叠加方向性光照

ShaderRenderer 需扩展支持多 pass 调用。lightshadow.frag 实现为 3 个 shader 源码（用分隔标记或拆为 3 个文件），或者在 ShaderRenderer 中增加 `renderMultiPass` 方法。

实际实现建议：将 lightshadow 拆为 `lightshadow_blur_h.frag`、`lightshadow_blur_v.frag`、`lightshadow_composite.frag` 三个文件，ShaderRenderer 提供 `renderMultiPass(passes)` 方法。

- [ ] **Step 6: Commit lightshadow**

```bash
git add src/shaders/lightshadow*.frag src/lib/ShaderRenderer.ts src/lib/StyleRegistry.ts
git commit -m "feat: add light & shadow shader with FBO multi-pass rendering"
```

- [ ] **Step 7: 底稿 Sketch shader**

单 pass：
1. 灰度化
2. 4 方向 Sobel 边缘检测（0°, 45°, 90°, 135°），叠加得到边缘强度
3. sensitivity 控制阈值，detail 控制保留多少细节
4. edgeWidth 通过调整 Sobel 采样距离实现
5. 反色（白底黑线）
6. 可选 cross-hatching 叠加（用方向性线条填充暗区）
7. bgColor: 0=白底, 1=蓝图蓝底 (#1A3A5C)

- [ ] **Step 8: Commit sketch**

```bash
git add src/shaders/sketch.frag && git commit -m "feat: add sketch shader with multi-directional Sobel"
```

- [ ] **Step 9: 圆点 Pointillism shader**

1. 将 UV 按 density 缩放得到网格
2. 对网格坐标加 randomness 随机偏移（用 hash 函数）
3. 每个网格中心采样原图颜色
4. 画圆（dotSize 大小）
5. 背景填充 uBgR/uBgG/uBgB

- [ ] **Step 10: Commit pointillism**

```bash
git add src/shaders/pointillism.frag && git commit -m "feat: add pointillism shader"
```

---

## Task 9: CompareSlider

**Files:**
- Create: `src/components/CompareSlider.tsx`
- Modify: `src/components/App.tsx`

- [ ] **Step 1: 实现 CompareSlider 组件**

包裹 CanvasPreview，添加对比模式 toggle。

Props: `canvasRef, originalImage: HTMLImageElement | null, rendererRef, activeStyle, params`

实现：
- Canvas 渲染 shader 效果图
- 在 Canvas 上方叠加一个 `<img>` 元素显示原图，使用 `clip-path: inset()` 裁切为左半部分
- 拖拽分割线：改变 clip-path 的 inset 值
- `<img>` 的尺寸和位置与 Canvas 完全同步（用 `position: absolute` 叠加）
- 分割线是一个 2px 宽的黑色竖线 div，跟随鼠标拖拽
- 一个 toggle 按钮切换对比模式开/关（开时显示 img overlay + 分割线，关时只显示 canvas）

- [ ] **Step 2: 集成到 App.tsx**

替换 CanvasPreview 为 CompareSlider。

- [ ] **Step 3: Commit**

```bash
git add src/components/CompareSlider.tsx src/components/App.tsx
git commit -m "feat: add compare slider for original vs stylized comparison"
```

---

## Task 10: Download & Polish

**Files:**
- Modify: `src/components/ActionBar.tsx`
- Modify: `src/components/App.tsx`
- Modify: `src/lib/ShaderRenderer.ts`

- [ ] **Step 1: 实现下载功能**

```ts
const handleDownload = () => {
  const canvas = canvasRef.current
  if (!canvas) return
  // 确保渲染结果在 buffer 中
  renderer.render()
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `picstyle_${activeStyle}_${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
```

- [ ] **Step 2: 实现随机参数**

遍历当前风格的 params，对每个参数在 min-max 范围内随机取值。

- [ ] **Step 3: 实现 WebGL 不可用提示**

App 初始化时检测 WebGL 支持，不支持时显示提示页面。

- [ ] **Step 4: 最终手动测试全部 6 种风格**

逐个切换风格，调整参数，测试对比模式，测试下载。

- [ ] **Step 5: Commit**

```bash
git add src/components/ActionBar.tsx src/components/App.tsx src/lib/ShaderRenderer.ts && git commit -m "feat: add download, random params, WebGL fallback"
```

---

## Task 11: Final Verification & Cleanup

- [ ] **Step 1: 检查所有 6 种 shader 在浏览器中渲染正常**

- [ ] **Step 2: 检查参数调整实时响应**

- [ ] **Step 3: 检查对比模式拖拽流畅**

- [ ] **Step 4: 检查下载功能输出正确**

- [ ] **Step 5: 检查大图片（>2048）自动缩小**

- [ ] **Step 6: 清理 console.log、未使用的 import**

- [ ] **Step 7: Final commit**

```bash
git add src/ && git commit -m "chore: cleanup and final verification"
```
