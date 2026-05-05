# 3D 生产工具功能增强设计

**日期**: 2026-05-05
**状态**: 已确认
**范围**: PixelForge 3D 粒子设计工具的6项生产功能

## 背景

PixelForge 的 3D 模式目前是一个粒子效果展示工具，缺少让用户将其作为生产工具的关键功能：背景自定义、光照控制、截图/录制、粒子配色灵活性。本设计为这些功能定义交互方案和技术实现路径。

## 功能概览

| # | 功能 | 优先级 | 依赖 |
|---|------|--------|------|
| 1 | 自定义背景色 | P0 | 无 |
| 2 | 上传背景图片（3D 平面） | P0 | 功能1 |
| 3 | 图片变换调整 | P0 | 功能2 |
| 4 | 光照调整（预设+微调） | P0 | 无 |
| 5 | 截图 + 视频录制 | P0 | 无 |
| 6 | 粒子多色配色 | P1 | 无 |

---

## 1. 自定义背景色

**目标**: 替代当前硬编码的 `0x1a1a2e`，让用户自定义背景。

**交互**:
- 侧边栏添加背景色选择器（color input）
- 支持纯色模式
- 默认值保持当前 `#000000`

**技术实现**:
- `App3D.tsx` 中添加 `backgroundColor` state
- 通过 `ParticleEngine` 的公开方法更新 `scene.background`
- 背景色变更时不需要重建粒子系统

**与背景图片的交互**:
- `scene.background` 始终保持为背景色（Color 对象）
- 背景图片是场景内的独立平面，不替换 `scene.background`
- 上传图片后，背景色仍然可见（图片外围区域和图片透明区域）
- 用户可通过 `removeBackgroundImage()` 移除图片，回到纯色背景

---

## 2. 上传背景图片

**目标**: 用户可上传图片作为 3D 场景中的平面，粒子可在图片前后飞过。

**交互**:
- 侧边栏背景色区域下方添加"上传背景图片"按钮
- 上传后图片以 PlaneGeometry + MeshStandardMaterial 渲染在场景中（受光照影响）
- 图片位于粒子后方（Z 轴负方向），默认 z = -2
- 图片宽高比保持原始比例，宽度适配视口

**技术实现**:
- 使用 `THREE.TextureLoader` 加载图片
- 创建 `THREE.PlaneGeometry` + `THREE.MeshStandardMaterial`（受光照影响，支持透明度）
- 图片平面添加到 scene，独立于粒子系统
- 通过 `ParticleEngine` 暴露的接口控制图片属性

**数据流**:
```
用户上传 → FileReader → TextureLoader.load(dataURL) → 创建 PlaneMesh → 添加到 scene
```

---

## 3. 图片变换调整（A+B 混合方案）

**目标**: 用户可直观地调整背景图片的位置、大小、角度和透明度。

### 3.1 画布直接交互

| 操作 | 交互 | 效果 |
|------|------|------|
| 拖拽图片 | 鼠标左键拖拽 | XY 平面移动图片 |
| 缩放 | 滚轮（悬停在图片上） | 放大/缩小图片 |
| 前后推拉 | Shift + 拖拽 | Z 轴深度调整 |

**技术要点**:
- `THREE.Raycaster` 检测鼠标是否悬停在图片平面上
- 拖拽时临时禁用 `OrbitControls`，松开后恢复
- 拖拽图片时同时禁用粒子弹簧交互（设 `uMouseEnabled = 0`），松开后恢复，避免拖拽图片时附近粒子跟随鼠标移动
- Z 轴推拉：将鼠标 Y 轴位移映射到 Z 轴方向
- 画布光标样式变化提示当前可操作

### 3.2 精确滑块面板

浮动面板，包含以下控件：

| 参数 | 类型 | 范围 | 默认值 |
|------|------|------|--------|
| 前后距离 | 滑块 | -10 ~ 5 | -2.0 |
| 缩放 | 滑块 | 0.1 ~ 5.0 | 1.0 |
| 旋转 | 滑块 | -180° ~ 180° | 0° |
| 不透明度 | 滑块 | 0 ~ 1 | 1.0 |
| 重置 | 按钮 | — | 归位到默认值 |

**技术实现**:
- 复用现有浮动面板组件（如 `EffectParamPanel` 的样式）
- 面板在图片上传后才显示
- 滑块变化实时更新 PlaneMesh 的 position/scale/rotation/material.opacity
- 画布操作和面板滑块双向同步

---

## 4. 光照调整（A+B 混合方案）

**目标**: 让用户快速调整场景光照氛围，主要影响背景图片和 Mesh 模式。

**影响范围**: 背景图片平面 + Mesh 显示模式。粒子保持自发光，不受光照影响。光照面板在所有模式下可见，但实际效果只在有背景图片或 Mesh 显示模式时可见。GLTF 模型的材质如果是 `MeshBasicMaterial` 则不响应光照，如果是 `MeshStandardMaterial`/`MeshPhongMaterial` 则响应。

### 4.1 预设场景

| 预设 | 主光 | 环境光 | 色温 | 方向 |
|------|------|--------|------|------|
| 日光 | 强度 0.8 | 0.4 | 暖白 | 右上 |
| 月光 | 强度 0.5 | 0.3 | 冷蓝 | 左上 |
| 聚光灯 | 强度 1.2 | 0.1 | 中性 | 正上 |
| 均匀 | — | 0.8 | 中性 | — |
| 自定义 | 用户设置 | 用户设置 | 用户设置 | 用户设置 |

选择预设自动填充参数值，用户可在此基础上微调。

### 4.2 参数微调面板

| 参数 | 类型 | 说明 |
|------|------|------|
| 主光强度 | 滑块 (0~2) | DirectionalLight.intensity |
| 环境光强度 | 滑块 (0~2) | AmbientLight.intensity |
| 主光色温 | 色温条 | 暖→冷渐变，映射到颜色值 |
| 主光方向 | 九宫格 | 9个方向选择光源照射角度 |

**色温映射**:
- 暖端: `0xffaa66` (~3500K)
- 中性: `0xffffff` (~5500K)
- 冷端: `0xaaccff` (~9000K)

**方向九宫格**:
- 3x3 网格代表光源从哪个方向照射
- 对应 DirectionalLight.position 的 XZ 平面投影
- 高度固定在 Y=10

| 九宫格位置 | X | Z |
|-----------|-----|-----|
| 左上 | -5 | -5 |
| 中上 | 0 | -5 |
| 右上 | 5 | -5 |
| 左中 | -5 | 0 |
| 正中 | 0 | 0 |
| 右中 | 5 | 0 |
| 左下 | -5 | 5 |
| 中下 | 0 | 5 |
| 右下 | 5 | 5 |

**技术实现**:
- 将现有固定灯光配置改为参数化：将 `ambientLight` 和 `directionalLight` 存储为 `ParticleEngine` 的实例字段（当前仅在构造函数内局部变量），以便后续通过方法更新
- `ParticleEngine` 暴露 `updateLighting(params)` 方法
- 预设作为参数组合存储
- 面板使用现有浮动面板样式

---

## 5. 截图 + 视频录制

**目标**: 简单的截图和视频录制功能，一键操作。

### 5.1 截图

**交互**: 点击截图按钮 → 自动下载 PNG

**技术实现**:
- 不使用 `preserveDrawingBuffer: true`（有性能开销），而是采用 render-then-capture 模式：先调用 `renderer.render(scene, camera)` 渲染一帧，然后立即调用 `canvas.toBlob()` 获取 PNG
- 创建下载链接触发浏览器下载
- 文件名格式: `pixelforge_3d_{timestamp}.png`

### 5.2 视频录制

**交互**: 点击录制按钮开始 → 按钮变为"停止录制"（红色） → 再次点击停止 → 自动下载 WebM

**技术实现**:
- 使用 `canvas.captureStream(30)` 获取 30fps 流
- `MediaRecorder` 录制流为 WebM 格式
- 录制状态下按钮视觉反馈（红色闪烁）
- 停止时通过 `ondataavailable` 收集数据，创建 Blob 下载
- 文件名格式: `pixelforge_3d_{timestamp}.webm`

**UI 位置**: 右上角操作栏，与现有的随机、重置按钮并排

---

## 6. 粒子多色配色

**目标**: 将当前单色自定义升级为多色渐变色带，支持多种分配模式。

### 6.1 渐变色带编辑器

**色带预览条**: 顶部可视化显示当前渐变效果

**色标列表**:
- 每个色标包含: 颜色值、位置百分比 (0-100%)
- 支持添加、删除、修改颜色
- 最少 2 个色标（首尾），最多 8 个

**数据结构**:
```typescript
interface ColorStop {
  color: string;    // hex color
  position: number; // 0-1
}
interface GradientConfig {
  stops: ColorStop[];
  mode: 'height' | 'radial' | 'random';
}
```

### 6.2 三种分配模式

| 模式 | 说明 | Shader 采样方式 |
|------|------|-----------------|
| 高度渐变 | 颜色沿 Y 轴从底部到顶部过渡 | UV = (position.y - minY) / (maxY - minY) |
| 径向渐变 | 颜色从中心到外围过渡 | UV = distance(position, center) / maxRadius |
| 随机分配 | 每个粒子随机选一个色标颜色 | hash(particleId) % numStops |

### 6.3 技术实现

**生成渐变纹理**:
- 创建 256x1 的 `THREE.DataTexture`，格式 `THREE.RGBAFormat`，类型 `THREE.UnsignedByteType`
- 根据 ColorStop 数组在像素间线性插值
- 设置 `texture.minFilter = THREE.LinearFilter`、`texture.magFilter = THREE.LinearFilter`
- 更新后设 `texture.needsUpdate = true`
- 传给 shader 作为 `uGradientMap` sampler2D

**Shader 修改**:
- 顶点着色器：在 `%%EFFECT_TRANSFORM%%` chunk 区域内，根据分配模式（`uGradientMode` uniform: 0=height, 1=radial, 2=random）计算 UV 坐标，传给片元着色器作为 `vGradientUV` varying
- 片元着色器：在 `particle_default.frag` 中添加渐变分支。当 `uUseCustomColor == 1` 时，用 `texture2D(uGradientMap, vec2(vGradientUV, 0.5))` 替换原来的纯色，而非直接覆盖 `vColor`
- 随机模式复用现有 `aRandom` attribute（已存在于粒子系统中，每个粒子有一个随机浮点值），用 `floor(aRandom * numStops) / numStops` 生成离散 UV，无需新增 attribute

**兼容性**:
- 保留 `uUseCustomColor` 开关
- 开启时使用新的多色渐变系统，关闭时回退到原始程序化颜色
- 现有单色配置迁移为两个相同色标的色带

---

## 架构影响

### 新增/修改的文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `ParticleEngine.ts` | 修改 | 添加背景图平面、光照参数化、截图/录制接口、渐变纹理生成 |
| `App3D.tsx` | 修改 | 添加所有新功能的 state 和 UI 控件 |
| `shaders/` | 修改 | 粒子着色器增加渐变纹理采样逻辑 |
| 新组件文件 | 新增 | BackgroundPanel、LightingPanel、GradientEditor、RecordingControls |

### ParticleEngine 新增公开方法

```typescript
// 背景
setBackgroundColor(color: string): void
addBackgroundImage(dataURL: string): void
removeBackgroundImage(): void
transformImage(params: ImageTransform): void

// 光照
updateLighting(params: LightingParams): void
applyLightingPreset(preset: LightingPreset): void

// 截图/录制
captureScreenshot(): Promise<Blob>
startRecording(): void
stopRecording(): Promise<Blob>

// 粒子配色
updateGradient(config: GradientConfig): void
```

### 交互冲突处理

| 场景 | 处理策略 |
|------|----------|
| 拖拽图片 vs OrbitControls | Raycaster 检测命中图片时禁用 OrbitControls |
| 拖拽图片 vs 粒子鼠标交互 | Raycaster 命中图片时禁用 OrbitControls 并设 `uMouseEnabled = 0`，松开后恢复 |
| 录制中切换效果 | 允许，录制持续进行 |
| 截图时画面捕获 | 不用 preserveDrawingBuffer，采用 render-then-capture 模式 |

---

## 不包含的内容

- 光源在画布内的可视化拖拽（过于复杂，九宫格方案已足够）
- 3D Transform Gizmo（图片是简单平面，不需要）
- 图片的3D旋转（只需Z轴旋转，不需要XY轴旋转）
- 多个背景图片（一次只支持一张）
- GIF 导出（只做视频录制）
- 视频录制的分辨率/帧率自定义（使用固定值）
