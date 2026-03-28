# PixelForge

**Web-based real-time image artistic style transfer tool powered by WebGL shaders.**

<p align="center">
  <strong>English</strong> | <a href="#中文">中文</a>
</p>

---

## Features

- **10 Artistic Styles** — Halftone, Diffusion Dithering, Pop Art, Light & Shadow, Sketch, Pointillism, Kaleidoscope, Crosshatch, Anime Light, Text Raster
- **Real-time Preview** — All effects rendered via WebGL fragment shaders with instant parameter feedback
- **Fine-grained Controls** — Each style exposes dedicated parameters for precise tuning
- **Before/After Compare** — Drag a slider to compare original vs. processed image
- **One-click Random** — Generate creative variations with randomized parameters
- **Drag & Drop Upload** — Simply drag an image onto the canvas to get started
- **PNG Export** — Download the processed result at full resolution

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **WebGL** custom shader renderer (multi-pass support)
- Zero external UI library — minimalist hard-edge design

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Available Styles

| Style | Description |
|-------|-------------|
| Halftone | Classic print halftone dots with grid, color mode, and shape controls |
| Diffusion | Error-diffusion dithering with configurable noise types |
| Pop Art | High-contrast saturated art with Ben-Day dots |
| Light & Shadow | Dramatic lighting with glow and shadow enhancement |
| Sketch | Pencil sketch effect via edge detection with optional hatching |
| Pointillism | Pointillist painting with configurable dot size and density |
| Kaleidoscope | Mirror symmetry with adjustable segments and transforms |
| Crosshatch | Comic / screen-tone draft with dot patterns and paper texture |
| Anime Light | Japanese animation style with glow and edge enhancement |
| Text Raster | Converts image into text-character mosaic |

## License

MIT

---

<h2 id="中文">PixelForge（中文）</h2>

**基于 WebGL 着色器的实时图像艺术风格转换工具。**

## 功能特性

- **10 种艺术风格** — 半调、扩散抖动、波普艺术、光影、素描、点彩、万花筒、交叉排线、动漫光影、文字栅格
- **实时预览** — 所有效果通过 WebGL 片段着色器渲染，调参即时生效
- **精细控制** — 每种风格提供专属参数面板，精确调节
- **前后对比** — 滑动对比原图与效果图
- **一键随机** — 随机化参数，快速生成创意变体
- **拖拽上传** — 将图片直接拖入画布即可开始
- **PNG 导出** — 以原始分辨率下载处理结果

## 技术栈

- **React 19** + **TypeScript** + **Vite**
- **WebGL** 自定义着色器渲染器（支持多通道渲染）
- 零外部 UI 库 — 硬边极简设计

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build
```

## 风格列表

| 风格 | 说明 |
|------|------|
| 半调（Halftone） | 经典印刷半调网点，支持网格、色彩模式和形状控制 |
| 扩散抖动（Diffusion） | 误差扩散抖动，可配置噪声类型 |
| 波普艺术（Pop Art） | 高对比度饱和色彩 + Ben-Day 网点 |
| 光影（Light & Shadow） | 戏剧性光照效果，增强辉光与阴影 |
| 素描（Sketch） | 基于边缘检测的铅笔素描，可选排线 |
| 点彩（Pointillism） | 点彩画派风格，可调节圆点大小与密度 |
| 万花筒（Kaleidoscope） | 镜像对称，可调分段数与变换参数 |
| 交叉排线（Crosshatch） | 漫画/网点稿风格，带纸纹质感 |
| 动漫光影（Anime Light） | 日式动画风格，辉光 + 边缘强化 |
| 文字栅格（Text Raster） | 将图像转换为文字字符马赛克 |

## 开源协议

MIT
