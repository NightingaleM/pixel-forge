# 2D 图片展示区域：滚轮缩放 + 鼠标拖动平移

- 日期：2026-06-24
- 状态：设计待审
- 影响模块：`src/components/CompareSlider.tsx`、`src/components/App2D.tsx`、`src/components/ZoomControl.tsx`、`src/lib/useViewport.ts`（新增）、`src/styles/global.css`

## 1. 背景与问题

2D 图片展示区域（`App2D` 的 `CompareSlider`）当前缩放能力有局限：

- 仅靠 `ZoomControl` 的 `+/−/reset` 按钮缩放，步长固定 0.2，范围 [0.2, 4]。
- 缩放通过 `canvas-scaler` 的 `transform: scale(zoom)`、`transformOrigin: top left` 实现。
- **没有滚轮缩放**；**没有平移（pan）**。放大后内容向右下方溢出，但变换原点固定在左上角且无法平移，导致溢出部分完全不可见——用户表现为"无法缩放/查看"。

## 2. 目标

为 2D 展示区域提供专业画布级的查看交互：

1. **滚轮缩放**（含 trackpad 双指捏合），以光标位置为锚点（zoom-to-cursor）。
2. **鼠标拖动平移**，且**限制在图片范围内**。
3. 与现有 **compare（对比）模式分隔条拖动**互不冲突。
4. 保留 `ZoomControl` 按钮，与滚轮/拖动共享同一视图状态。
5. 缩放范围扩大到 **0.2x – 16x**（满足 ASCII 风格像素级查看需求）。

## 3. 非目标（YAGNI）

- 不做旋转、翻转、多点触控手势（pinch-to-pan）之外的复杂手势。
- 不为 `App3D` 实际接入（仅保证 hook 可复用，不在本次接入）。
- 不改变 canvas 的内部分辨率/重渲染管线（缩放纯为 CSS 显示层，不影响导出质量）。
- 不引入第三方缩放库。

## 4. 用户确认的关键决策

| 决策点 | 选择 |
| --- | --- |
| compare 模式拖动冲突 | 画布平移**仅在非 compare 模式生效**；compare 模式下保留分隔条拖动，pan 锁定（缩放仍可用） |
| 平移边界 | **限制在图片范围内**（图片边缘不拖出视口） |
| 缩放上限 | **0.2x – 16x** |

## 5. 架构

### 5.1 状态模型

新增视图状态对象：

```ts
type Viewport = { zoom: number; panX: number; panY: number }
```

- `zoom` ∈ [0.2, 16]，初始 1。
- `panX / panY`：`canvas-scaler` 相对视口（`.canvas-wrapper`）的平移偏移，单位 px，初始 0。

**归属**：viewport 状态由 `useViewport` hook 持有，挂在 `CompareSlider` 内部。`App2D` 移除 `const [zoom, setZoom] = useState(1)` 及向 `CompareSlider` 传递的 `zoom/onZoom`（经确认当前仅 `CompareSlider` 消费 zoom，无需留在上层）。

### 5.2 新增 `src/lib/useViewport.ts`

一个自定义 hook，封装全部视口行为，对外暴露受控的视图状态与事件处理器：

```ts
// 纯函数（便于单测，与 DOM 无关）
clampZoom(z: number, min: number, max: number): number
zoomAtCursor(viewport, anchor: {mx, my}, newZoom: number): Viewport   // 保持锚点压在光标下
clampPan(viewport, view: {vw, vh}, content: {cw, ch}): Viewport        // 限制内容不拖出视口

// hook
useViewport({ min, max }): {
  viewport: Viewport
  onWheel: (e: WheelEvent | React.WheelEvent) => void   // zoom-to-cursor
  panHandlers: { onMouseDown, ... }                      // 仅非 compare 时挂载
  setZoom: (z: number) => void                           // 供 ZoomControl 按钮
  reset: () => void                                      // 双击复位
}
```

设计要点：
- **纯函数优先**：`clampZoom`、`zoomAtCursor`、`clampPan` 不依赖 React/DOM，单独导出供单元测试。
- hook 负责：状态持有、读取 DOM 尺寸（`getBoundingClientRect`）、事件接驳、在每次状态变更后调用 `clampPan` 保证内容不越界。

### 5.3 渲染层（`CompareSlider.tsx`）

`canvas-scaler` 变换升级：

```jsx
<div className="canvas-scaler" style={{
  transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
  transformOrigin: '0 0',
}}>
```

- compare 的原图 `<img>` 与分隔条已在 `canvas-scaler` 内，天然跟随同一变换，无需额外处理。
- ASCII（`asciiCanvasRef`）与 shader（`canvasRef`）通过 `display` 切换，二者都在 scaler 内，共用同一 viewport。

### 5.4 交互挂载（`CompareSlider.tsx`）

- `canvas-wrapper` 挂 `onWheel={onWheel}`：始终生效（含 compare 模式）。
- 拖动：`compareMode === false` 时挂 `panHandlers`；`compareMode === true` 时挂现有分隔条拖动逻辑（互斥）。
- `onDoubleClick={reset}`：双击复位 `{1, 0, 0}`。
- 光标：非 compare + 非拖动 `grab`，拖动中 `grabbing`。

## 6. 关键数学

坐标系：以 `.canvas-wrapper` 左上角为原点的视口坐标。

### 6.1 zoom-to-cursor

设光标在视口内坐标 `(mx, my)`，缩放前：

1. 光标指向的内容世界坐标：`worldX = (mx - panX) / zoom`，`worldY = (my - panY) / zoom`。
2. 计算新缩放：`newZoom = clampZoom(zoom * factor, min, max)`，`factor = deltaY < 0 ? 1.1 : 1/1.1`（指数步进，手感均匀）。
3. 反求 pan 使该世界点保持在光标下：`panX = mx - worldX * newZoom`，`panY = my - worldY * newZoom`。
4. 结果过 `clampPan` 收敛。

`ZoomControl` 按钮缩放（无锚点）等价于以视口中心为锚点的 `zoomAtCursor`。

### 6.2 平移 clamp（限制在图片范围内）

运行时通过 `getBoundingClientRect` 读取：
- 视口尺寸 `vw, vh`（`.canvas-wrapper` 客户区）。
- 内容显示尺寸 `cw, ch`（缩放前 `canvas-scaler` 的渲染尺寸，即 canvas CSS 显示尺寸）。

放大后内容大于视口时：`panX ∈ [vw - cw * zoom, 0]`，`panY ∈ [vh - ch * zoom, 0]`。
缩小（`zoom < 1`）内容小于视口时：居中，`panX = (vw - cw * zoom) / 2`（可能为正，表示居中右移），`panY` 同理。**居中是 `clampPan` 的一个返回分支，由该函数统一计算，调用方不另算**。
拖动过程中实时 clamp；缩放后也 clamp。

## 7. 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `src/lib/useViewport.ts`（新增） | viewport 状态 + wheel/drag/clamp/reset + 纯函数导出 |
| `src/components/CompareSlider.tsx` | 接入 `useViewport`；移除 `zoom/onZoom` props；scaler 变换升级；条件挂 compare 拖动 vs pan；双击重置；光标 |
| `src/components/ZoomControl.tsx` | `max` 默认值改 16 |
| `src/components/App2D.tsx` | 删除 `zoom` 状态与 `zoom/onZoom` 传参。**关图复位无需显式处理**：`image` 为 null 时 `CompareSlider` 卸载，hook 状态随之丢弃 |
| `src/styles/global.css` | `.canvas-wrapper` 光标 `grab`/`grabbing` |

## 8. 边界情况

- **compare 模式**：pan 锁定，滚轮缩放照常（分隔条两侧同步缩放）。
- **切换/关闭图片**：viewport 复位（hook 内部 + App2D 关图清理）。
- **canvas 尺寸**：clamp 用运行时 `getBoundingClientRect`，不依赖固定假设，兼容 ASCII/shader 两种 canvas 显示尺寸。
- **wheel 默认行为**：`onWheel` 内 `preventDefault` 阻止页面滚动（注意 React 受控 `onWheel` 为 passive 时无法阻止，必要时用原生 `addEventListener('wheel', ..., {passive:false})` —— 实现时以能阻止页面滚动为准）。
- **缩放下限**：`zoom < 1` 时内容居中，避免出现空白偏移。

## 9. 测试策略（TDD）

纯函数先行，单元测试覆盖：

- `clampZoom`：越界收敛、边界值、正常值。
- `zoomAtCursor`：给定锚点缩放后，该锚点的视口坐标不变（不变式：`anchor ≈ pan + world*newZoom`）。
- `clampPan`：放大越界收敛、缩小居中、刚好等大（pan=0/居中）。

组件层（如项目无组件测试基建则手动验证清单）：
- 滚轮缩放以光标为中心。
- 拖动平移受限、内容不拖出。
- compare 模式拖动分隔条、pan 不触发。
- 双击复位、ZoomControl 按钮联动、范围 [0.2, 16]。
- ASCII 与 shader 风格下行为一致。
