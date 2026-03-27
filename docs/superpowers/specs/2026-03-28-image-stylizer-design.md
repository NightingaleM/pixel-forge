# 图片风格化工具网站 — 设计文档

## 概述

一个纯前端的在线图片风格化工具网站。用户上传图片后可选择 6 种风格效果，实时调参预览，下载处理后的图片。当前阶段目标：先做实验性页面，验证各风格效果质量。

**定位**：在线工具网站
**用户**：普通用户 / 设计师
**技术栈**：React + Vite + WebGL (GLSL Shader)
**运行方式**：纯前端，无需后端服务器

---

## 系统架构

三层架构，纯前端运行：

```
用户层 → 应用层 (React) → 渲染引擎 (WebGL)
```

### 用户层
- 上传图片（拖拽或点击）
- 选择风格
- 调整参数
- 预览对比 / 下载结果

### 应用层 (React)
核心模块：
- **ShaderRenderer** — WebGL 上下文管理、shader 编译、纹理上传、渲染管线
- **StyleRegistry** — 风格注册表，定义每种风格的名称、shader 路径、默认参数、参数范围
- **ParamController** — 参数面板组件，将 slider 映射为 shader uniform，支持实时预览
- **CompareView** — 原图/效果图对比预览，支持滑动分割线对比

### 渲染引擎 (WebGL)
- 所有风格共享同一个 vertex shader
- 每种风格对应一个 GLSL fragment shader
- 参数通过 uniform 传入，变更实时重渲染
- 统一 uniform 接口：

```glsl
uniform sampler2D uImage;   // 原图纹理
uniform vec2 uResolution;   // 画布尺寸
uniform float uTime;        // 时间（动画用）
uniform float uParams[N];   // 各风格自定义参数
```

---

## 页面布局

三栏布局：

| 区域 | 位置 | 宽度 | 内容 |
|------|------|------|------|
| 风格列表 | 左侧 | 180px 固定 | 6 种风格垂直排列 |
| 预览区 | 中间 | 自适应 | Canvas 画布 + 滑动对比 |
| 操作面板 | 右侧 | 160px 固定 | 下载、重置、随机、图片信息 |

参数面板位于预览区下方，随风格切换联动更新。Slider 拖动实时反映到 Canvas。

---

## 视觉设计规范

极简硬朗风格：

- **背景色**：浅暖灰 `#F5F5F0` / 纯白 `#FFF`
- **边框**：纯黑 `#000`，1-2px solid，全部直角无圆角（border-radius: 0）
- **选中态**：黑底（`#000`）白字（`#FFF`），无阴影无圆角
- **默认态**：白底黑字
- **hover 态**：浅灰底 `#F0F0F0`
- **文字色**：`#000` / `#333` / `#999` 三级灰度
- **Slider**：细线轨道 + 方形滑块
- **无阴影、无渐变、无圆角**

---

## 6 种风格详细设计

### 01 网点 Halftone

**算法**：将图像划分为规则网格，每个格子中心画一个圆，圆的半径由该区域平均亮度决定。亮区圆小，暗区圆大。

**伪代码**：
```
grid(uv, cellSize) → avgBrightness(uv, cellSize) → circle(uv, center, radius * brightness)
```

**参数**：
| 参数 | 说明 | 范围 | 默认值 |
|------|------|------|--------|
| cellSize | 网格大小 | 2-20 | 6 |
| dotScale | 圆点缩放 | 0.1-2.0 | 1.0 |
| colorMode | 单色/CMYK/彩色 | 0/1/2 | 2 |
| angle | 网格旋转角度 | 0-360° | 45 |

---

### 02 扩散 Diffusion

**算法**：多 pass 处理。先量化颜色，再基于 Bayer 矩阵或蓝噪声纹理做有序抖动，模拟误差扩散的颗粒质感。

**伪代码**：
```
bayerMatrix(index) → quantize(color, levels) + bayer * spread → threshold → output
```

**参数**：
| 参数 | 说明 | 范围 | 默认值 |
|------|------|------|--------|
| levels | 色阶数 | 2-32 | 8 |
| spread | 扩散强度 | 0.0-2.0 | 1.0 |
| pixelSize | 像素化粒度 | 1-8 | 1 |
| noiseType | Bayer/蓝噪声/随机 | 0/1/2 | 0 |

---

### 03 波普 Pop Art

**算法**：先做色调分离（posterize），再将颜色映射到高饱和度波普色板。可选 Ben-Day 圆点叠加模拟漫画印刷效果。

**伪代码**：
```
posterize(color, levels) → mapToPalette(color, palette) → optional: benDayDots(uv)
```

**参数**：
| 参数 | 说明 | 范围 | 默认值 |
|------|------|------|--------|
| levels | 色调分离级数 | 2-8 | 4 |
| saturation | 饱和度 | 0.5-3.0 | 2.0 |
| contrast | 对比度 | 0.5-3.0 | 1.5 |
| palette | 色板预设 | 0-4 | 0 |
| benDay | 叠加圆点开关 | 0/1 | 0 |

---

### 04 光影 Light & Shadow

**算法**：用高斯模糊提取低频信息做光晕，再用阈值分割强化明暗交界。可叠加方向性光效模拟戏剧打光。

**伪代码**：
```
gaussianBlur(luminance) → threshold(shadow/highlight) → blend(original, glow, strength)
```

**参数**：
| 参数 | 说明 | 范围 | 默认值 |
|------|------|------|--------|
| contrast | 明暗对比 | 0.5-3.0 | 1.5 |
| threshold | 阈值分割点 | 0.1-0.9 | 0.5 |
| glowRadius | 光晕半径 | 0-20 | 5 |
| lightDir | 光照方向角度 | 0-360° | 135 |

---

### 05 底稿 Sketch

**算法**：多方向 Sobel 边缘检测叠加，反色后白底黑线。可选叠加交叉影线（cross-hatching）增强素描质感。

**伪代码**：
```
sobel(0°) + sobel(45°) + sobel(90°) + sobel(135°) → invert → optional: hatchPattern()
```

**参数**：
| 参数 | 说明 | 范围 | 默认值 |
|------|------|------|--------|
| edgeWidth | 边缘线宽 | 0.5-5.0 | 1.0 |
| sensitivity | 边缘灵敏度 | 0.01-0.5 | 0.1 |
| detail | 细节保留 | 0.0-1.0 | 0.5 |
| hatching | 影线叠加 | 0/1 | 0 |
| bgColor | 背景色 白/蓝图蓝 | 0/1 | 0 |

---

### 06 圆点 Pointillism

**算法**：在规则/随机网格上画圆，颜色取原图采样，圆点大小可加随机抖动。整体呈现点彩画派风格。

**伪代码**：
```
jitteredGrid(uv, size, randomness) → sampleColor(center) → circle(uv, center, dotSize)
```

**参数**：
| 参数 | 说明 | 范围 | 默认值 |
|------|------|------|--------|
| dotSize | 圆点大小 | 2-30 | 8 |
| density | 密度 | 0.3-3.0 | 1.0 |
| randomness | 随机抖动 | 0.0-1.0 | 0.3 |
| bgFill | 背景填充色 | 色值 | #FFFFFF |

---

## 项目目录结构

```
web_pic_design_ai/
├── src/
│   ├── components/
│   │   ├── App.tsx              # 主应用
│   │   ├── ImageUploader.tsx    # 图片上传
│   │   ├── StyleSelector.tsx    # 风格列表
│   │   ├── CanvasPreview.tsx    # Canvas 预览区
│   │   ├── CompareSlider.tsx    # 滑动对比
│   │   ├── ParamPanel.tsx       # 参数面板
│   │   └── ActionBar.tsx        # 操作按钮
│   ├── shaders/
│   │   ├── common.vert          # 共享 vertex shader
│   │   ├── halftone.frag        # 网点
│   │   ├── diffusion.frag       # 扩散
│   │   ├── popart.frag          # 波普
│   │   ├── lightshadow.frag     # 光影
│   │   ├── sketch.frag          # 底稿
│   │   └── pointillism.frag     # 圆点
│   ├── lib/
│   │   ├── ShaderRenderer.ts    # WebGL 渲染引擎
│   │   └── StyleRegistry.ts     # 风格注册表
│   ├── styles/
│   │   └── global.css           # 全局样式
│   └── main.tsx
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 数据流

```
用户上传图片 → FileReader → HTMLImageElement → WebGL Texture
                                                   ↓
用户选风格 → StyleRegistry 查询 → 加载对应 fragment shader → 编译链接
                                                   ↓
用户调参 → ParamPanel onChange → 更新 uniform → 触发重渲染 → Canvas 更新
                                                   ↓
用户下载 → canvas.toBlob() → download
```

---

## 当前阶段范围

- 单页应用，无路由
- 6 种风格 + 参数实时调整
- 滑动对比预览
- 下载效果图
- 暗色/极简风格 UI（极简硬朗风格，浅色背景、黑边框直角、黑底白字选中态）

## 后续可能扩展（不在当前范围）

- 多图批量处理
- 用户账户 / 历史记录
- 自定义色板
- AI 模型增强
- PWA 离线支持
