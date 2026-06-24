# 2D 画布滚轮缩放 + 鼠标拖动平移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 2D 图片展示区域提供 zoom-to-cursor 滚轮缩放 + 限制在图片范围内的鼠标拖动平移，并与 compare 对比模式分隔条拖动互斥。

**Architecture:** 新增 `useViewport` hook（纯函数数学 + React 状态/事件），由 `CompareSlider` 持有 viewport `{zoom, panX, panY}`；`canvas-scaler` 用 `translate + scale` 显示变换；`App2D` 移除上层 zoom 状态。纯函数（`clampZoom`/`zoomAtCursor`/`clampPan`）独立单测，hook/组件层手动验证。

**Tech Stack:** React 19 + TypeScript、Vite、Vitest（纯函数单测）、现有 CSS。

**Spec:** `docs/superpowers/specs/2026-06-24-2d-canvas-zoom-pan-design.md`

---

## 关键事实（实现前必读）

- **坐标系**：以 `.canvas-wrapper` 左上角为原点。`canvas-wrapper`（`containerRef`）是视口，`overflow:hidden`。
- **尺寸来源（重要）**：
  - 视口尺寸 `vw/vh`：`wrapper.getBoundingClientRect().width/height`。
  - 内容（缩放前）尺寸 `cw/ch`：**当前可见 canvas 的 `offsetWidth/offsetHeight`**。`offset*` 不受 CSS `transform` 影响，故在任意 zoom 下都返回布局（缩放前）尺寸。当前可见 canvas 由 `renderMode` 决定（`canvas2d` → `asciiCanvasRef`，否则 `canvasRef`）。
  - 因 wrapper 紧贴 canvas，`vw==cw`、`vh==ch`，但代码仍按两者独立处理以保稳健。
- **滚轮必须用原生监听**：React 合成 `onWheel` 在 root 上为 passive，无法 `preventDefault` 阻止页面滚动。故在 `useEffect` 内对 wrapper DOM 调 `addEventListener('wheel', h, { passive: false })`。
- **拖动用 window 级监听**（沿用 `CompareSlider` 现有模式）：`mousedown` 记起点，`window` 上 `mousemove`/`mouseup`。
- **互斥**：`compareMode===true` → wrapper 的 `onMouseDown` 走 compare 分隔条逻辑（保留现状）；`false` → 走 pan。
- **关图复位**：`image` 为 null 时 `CompareSlider` 卸载，hook 状态随之丢弃，无需显式 reset。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/lib/useViewport.ts`（新增） | 导出纯函数 `clampZoom`/`zoomAtCursor`/`clampPan` + 类型 `Viewport`/`Point`/`Size` + 常量 `MIN_ZOOM`/`MAX_ZOOM`/`ZOOM_FACTOR` + hook `useViewport` |
| `src/lib/useViewport.test.ts`（新增） | 三个纯函数的单元测试 |
| `src/components/CompareSlider.tsx`（修改） | 接入 hook；scaler 变换升级为 `translate+scale`；wrapper 条件挂 compare/pan；双击重置；光标 |
| `src/components/ZoomControl.tsx`（修改） | `max` 默认 4 → 16 |
| `src/components/App2D.tsx`（修改） | 删除 `zoom` 状态与 `zoom/onZoom` 传参 |
| `src/styles/global.css`（修改） | `.canvas-wrapper` 默认 `cursor: grab` |

---

## Task 1: viewport 纯函数（TDD）

**Files:**
- Create: `src/lib/useViewport.ts`
- Test: `src/lib/useViewport.test.ts`

本 Task 只写**纯函数与类型/常量**，hook 留到 Task 2。按 TDD：每个函数先写失败测试 → 跑红 → 写实现 → 跑绿。

### 1a. clampZoom

- [ ] **Step 1: 写失败测试** — 在 `src/lib/useViewport.test.ts` 创建文件并写入：

```ts
import { describe, it, expect } from 'vitest'
import { clampZoom } from './useViewport'

describe('clampZoom', () => {
  it('returns value inside range unchanged', () => {
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(1)).toBe(1)
  })
  it('clamps above max (16)', () => {
    expect(clampZoom(100)).toBe(16)
  })
  it('clamps below min (0.2)', () => {
    expect(clampZoom(0.01)).toBe(0.2)
  })
  it('respects custom min/max', () => {
    expect(clampZoom(50, 1, 4)).toBe(4)
    expect(clampZoom(-5, 1, 4)).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npx vitest run src/lib/useViewport.test.ts`
  Expected: FAIL（`Failed to resolve import "./useViewport"`）

- [ ] **Step 3: 写最小实现** — 创建 `src/lib/useViewport.ts`：

```ts
// 2D 画布视口（缩放 + 平移）的纯数学与 React hook。
// 纯函数不依赖 React/DOM，便于单测；hook 负责状态与事件接驳。

export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 16
// 每个滚轮 tick 的指数步进倍率，保证缩放手感均匀。
export const ZOOM_FACTOR = 1.1

/** 把缩放值限制在 [min, max]。 */
export function clampZoom(z: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, z))
}
```

- [ ] **Step 4: 跑测试确认通过** — Run: `npx vitest run src/lib/useViewport.test.ts`
  Expected: PASS（4 个）

### 1b. zoomAtCursor

- [ ] **Step 1: 追加失败测试** — 在 test 文件追加：

```ts
import { zoomAtCursor } from './useViewport'

describe('zoomAtCursor', () => {
  it('keeps the anchor point fixed under the cursor when zooming in', () => {
    // 起点 zoom=1, pan=0；锚点 (50,50) 缩放到 2 倍
    const next = zoomAtCursor({ zoom: 1, panX: 0, panY: 0 }, { x: 50, y: 50 }, 2)
    expect(next.zoom).toBe(2)
    expect(next.panX).toBe(-50)
    expect(next.panY).toBe(-50)
  })
  it('invariant: anchor world point maps back to the same wrapper coords', () => {
    const cur = { zoom: 2, panX: -100, panY: 0 }
    const anchor = { x: 0, y: 0 }
    const next = zoomAtCursor(cur, anchor, 1)
    // 缩放后锚点的 wrapper 坐标应仍等于 anchor
    const worldX = (anchor.x - cur.panX) / cur.zoom
    const worldY = (anchor.y - cur.panY) / cur.zoom
    expect(next.panX + worldX * next.zoom).toBeCloseTo(anchor.x, 7)
    expect(next.panY + worldY * next.zoom).toBeCloseTo(anchor.y, 7)
  })
  it('clamps newZoom to [min, max]', () => {
    const next = zoomAtCursor({ zoom: 1, panX: 0, panY: 0 }, { x: 0, y: 0 }, 999)
    expect(next.zoom).toBe(16)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npx vitest run src/lib/useViewport.test.ts`
  Expected: FAIL（`zoomAtCursor is not a function`）

- [ ] **Step 3: 写最小实现** — 在 `useViewport.ts` 追加：

```ts
/**
 * 以 wrapper 内锚点 (mx, my) 为中心缩放到 newZoom，使该内容点保持在光标下。
 * newZoom 会被 clamp。注意：返回值的 panX/panY 未做边界 clamp（交给 clampPan）。
 *
 * 推导：缩放前锚点对应内容世界坐标 world = (anchor - pan) / zoom；
 * 缩放后为保持压在光标下：anchor = pan' + world * newZoom'
 * => pan' = anchor - world * newZoom'
 */
export function zoomAtCursor(
  viewport: Viewport,
  anchor: Point,
  newZoom: number,
  min = MIN_ZOOM,
  max = MAX_ZOOM,
): Viewport {
  const z = clampZoom(newZoom, min, max)
  const worldX = (anchor.x - viewport.panX) / viewport.zoom
  const worldY = (anchor.y - viewport.panY) / viewport.zoom
  return {
    zoom: z,
    panX: anchor.x - worldX * z,
    panY: anchor.y - worldY * z,
  }
}
```

- [ ] **Step 4: 跑测试确认通过** — Run: `npx vitest run src/lib/useViewport.test.ts`
  Expected: PASS（7 个累计）

### 1c. clampPan

- [ ] **Step 1: 追加失败测试** — 在 test 文件追加：

```ts
import { clampPan } from './useViewport'

describe('clampPan', () => {
  it('clamps pan to 0 when content is larger and pan goes positive', () => {
    // zoom=2, content 100x100 → scaled 200 > view 100；panX=50 越上界 → 0
    const r = clampPan({ zoom: 2, panX: 50, panY: 0 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(0)
    expect(r.panY).toBe(0)
  })
  it('keeps a valid in-range pan unchanged', () => {
    // panX=-50 在 [100-200, 0]=[-100,0] 内
    const r = clampPan({ zoom: 2, panX: -50, panY: -50 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(-50)
    expect(r.panY).toBe(-50)
  })
  it('clamps pan to lower bound (view - scaled)', () => {
    // panX=-999 → 收敛到 100-200 = -100
    const r = clampPan({ zoom: 2, panX: -999, panY: -999 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(-100)
    expect(r.panY).toBe(-100)
  })
  it('centers content when smaller than viewport (zoom<1)', () => {
    // zoom=0.5, content 100 → scaled 50 < view 100 → 居中 (100-50)/2=25
    const r = clampPan({ zoom: 0.5, panX: 0, panY: 0 }, { w: 100, h: 100 }, { w: 100, h: 100 })
    expect(r.panX).toBe(25)
    expect(r.panY).toBe(25)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npx vitest run src/lib/useViewport.test.ts`
  Expected: FAIL（`clampPan is not a function`）

- [ ] **Step 3: 写最小实现** — 在 `useViewport.ts` 追加：

```ts
/**
 * 限制内容不拖出视口：
 *  - 内容（content*zoom）大于视口：pan ∈ [viewSize - scaledSize, 0]
 *  - 内容小于等于视口：居中 pan = (viewSize - scaledSize) / 2
 * content 为缩放前尺寸；scaledSize = content * zoom。
 */
export function clampPan(viewport: Viewport, view: Size, content: Size): Viewport {
  const { zoom, panX, panY } = viewport
  return {
    zoom,
    panX: clampAxis(panX, view.w, content.w * zoom),
    panY: clampAxis(panY, view.h, content.h * zoom),
  }
}

function clampAxis(pan: number, viewSize: number, scaledSize: number): number {
  if (scaledSize <= viewSize) return (viewSize - scaledSize) / 2
  return Math.min(0, Math.max(viewSize - scaledSize, pan))
}
```

- [ ] **Step 4: 跑全部测试确认通过** — Run: `npx vitest run src/lib/useViewport.test.ts`
  Expected: PASS（11 个累计）

- [ ] **Step 5: 提交**

```bash
git add src/lib/useViewport.ts src/lib/useViewport.test.ts
git commit -m "feat(viewport): 纯函数 clampZoom/zoomAtCursor/clampPan 及单测

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: useViewport hook

**Files:**
- Modify: `src/lib/useViewport.ts`（追加 hook，不改纯函数）

hook 涉及 DOM，无 testing-library 故不做组件级单测；纯函数已覆盖数学正确性。本 Task 实现 + 类型检查。

- [ ] **Step 1: 追加 hook 实现** — 在 `src/lib/useViewport.ts` **最顶部第一行**（在所有类型/常量导出之前）加入 React 引用；hook 函数与 `UseViewportResult` 类型追加到文件末尾：

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseViewportResult {
  viewport: Viewport
  /** 仅在非 compare 模式挂到 wrapper 的 onMouseDown。 */
  panHandlers: { onMouseDown: (e: React.MouseEvent) => void }
  /** 供 ZoomControl 按钮：以视口中心为锚点缩放。 */
  setZoom: (z: number) => void
  /** 复位到 {1,0,0}（双击调用）。 */
  reset: () => void
  /** 是否正在拖动平移（供光标 grabbing）。 */
  isPanning: boolean
}

/**
 * @param viewportEl 视口元素 ref（.canvas-wrapper），用于读取尺寸、挂 wheel 监听
 * @param getContentSize 返回内容缩放前尺寸（用 offsetWidth/offsetHeight），无则 null
 */
export function useViewport(
  viewportEl: React.RefObject<HTMLElement | null>,
  getContentSize: () => Size | null,
  opts: { min?: number; max?: number } = {},
): UseViewportResult {
  const { min = MIN_ZOOM, max = MAX_ZOOM } = opts
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [isPanning, setIsPanning] = useState(false)

  // 用 ref 持有最新 viewport，供 window 级事件读取，避免 stale closure。
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  const clampWithSize = useCallback(
    (vp: Viewport): Viewport => {
      const el = viewportEl.current
      const content = getContentSize()
      if (!el || !content) return vp
      const rect = el.getBoundingClientRect()
      return clampPan(vp, { w: rect.width, h: rect.height }, content)
    },
    [viewportEl, getContentSize],
  )

  const applyClamped = useCallback(
    (vp: Viewport) => setViewport(clampWithSize(vp)),
    [clampWithSize],
  )

  // --- 滚轮缩放：原生非 passive 以便 preventDefault ---
  useEffect(() => {
    const el = viewportEl.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const anchor: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const cur = viewportRef.current
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      const next = zoomAtCursor(cur, anchor, cur.zoom * factor, min, max)
      setViewport(clampWithSize(next))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [viewportEl, clampWithSize, min, max])

  // --- 拖动平移：window 级 mousemove/mouseup ---
  const dragStart = useRef<Point | null>(null)
  const startPan = useRef<Point | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragStart.current = { x: e.clientX, y: e.clientY }
    const vp = viewportRef.current
    startPan.current = { x: vp.panX, y: vp.panY }
    setIsPanning(true)
  }, [])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragStart.current || !startPan.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const vp = viewportRef.current
      applyClamped({ ...vp, panX: startPan.current.x + dx, panY: startPan.current.y + dy })
    }
    const handleUp = () => {
      if (dragStart.current) {
        dragStart.current = null
        startPan.current = null
        setIsPanning(false)
      }
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [applyClamped])

  const setZoom = useCallback(
    (z: number) => {
      const el = viewportEl.current
      const target = clampZoom(z, min, max)
      if (!el) {
        setViewport((vp) => ({ ...vp, zoom: target }))
        return
      }
      const rect = el.getBoundingClientRect()
      const anchor: Point = { x: rect.width / 2, y: rect.height / 2 }
      setViewport(clampWithSize(zoomAtCursor(viewportRef.current, anchor, target, min, max)))
    },
    [viewportEl, clampWithSize, min, max],
  )

  const reset = useCallback(() => {
    setViewport(clampWithSize({ zoom: 1, panX: 0, panY: 0 }))
  }, [clampWithSize])

  return { viewport, panHandlers: { onMouseDown }, setZoom, reset, isPanning }
}
```

- [ ] **Step 2: 类型检查** — Run: `npx tsc -b --noEmit`
  Expected: 无错误（注意 `React` 类型已由 tsconfig 全局可用，如报 `Cannot find name 'React'`，确认 `tsconfig` 含 `"jsx": "react-jsx"`，本项目 vite-react 模板已具备）。

- [ ] **Step 3: 跑既有测试确保纯函数未受影响** — Run: `npx vitest run`
  Expected: 全绿（含 `src/lib/ascii/*.test.ts` 与新文件）。

- [ ] **Step 4: 提交**

```bash
git add src/lib/useViewport.ts
git commit -m "feat(viewport): useViewport hook（滚轮缩放/拖动平移/复位）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: CompareSlider 接入 hook

**Files:**
- Modify: `src/components/CompareSlider.tsx`

- [ ] **Step 1: 重写 CompareSlider** — 用以下内容替换整个文件。变更点：删除 `zoom/onZoom` props；引入 `useViewport`；`getContentSize` 按 renderMode 选 canvas 的 offset 尺寸；wrapper `onMouseDown` 按 `compareMode` 分流（compare 走分隔条，否则 pan）；`onDoubleClick={reset}`；scaler 用 `translate+scale`；光标按模式/拖动状态。

```tsx
import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import ZoomControl from './ZoomControl'
import { useViewport, type Size } from '../lib/useViewport'

interface CompareSliderProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  asciiCanvasRef: RefObject<HTMLCanvasElement | null>
  renderMode?: 'shader' | 'canvas2d'
  originalImage: HTMLImageElement | null
  compareMode: boolean
  onToggleCompare: () => void
  onClose: () => void
}

function CompareSlider({
  canvasRef,
  asciiCanvasRef,
  renderMode,
  originalImage,
  compareMode,
  onToggleCompare,
  onClose,
}: CompareSliderProps) {
  const { t } = useTranslation()
  const [sliderPosition, setSliderPosition] = useState(0.5)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 内容（缩放前）尺寸：offset* 不受 CSS transform 影响。
  // 必须用 useCallback 稳定引用：useViewport 的 wheel 监听依赖它，
  // 引用不稳定会导致每渲染重绑监听（性能差 + 潜在 stale）。
  const getContentSize = useCallback((): Size | null => {
    const canvas = renderMode === 'canvas2d' ? asciiCanvasRef.current : canvasRef.current
    if (!canvas) return null
    return { w: canvas.offsetWidth, h: canvas.offsetHeight }
  }, [renderMode, asciiCanvasRef, canvasRef])

  const { viewport, panHandlers, setZoom, reset, isPanning } = useViewport(containerRef, getContentSize)

  const getPositionFromEvent = useCallback(
    (clientX: number): number => {
      const container = containerRef.current
      if (!container) return 0.5
      const rect = container.getBoundingClientRect()
      const ratio = (clientX - rect.left) / rect.width
      return Math.min(1, Math.max(0, ratio))
    },
    [],
  )

  // compare 分隔条拖动（仅 compare 模式）。
  const handleCompareMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      setSliderPosition(getPositionFromEvent(e.clientX))
    },
    [getPositionFromEvent],
  )

  const handleCompareTouchStart = useCallback(
    (e: React.TouchEvent) => {
      dragging.current = true
      setSliderPosition(getPositionFromEvent(e.touches[0].clientX))
    },
    [getPositionFromEvent],
  )

  // compare 模式下的 window 级拖动（mousemove/touchmove/mouseup）。
  // 非 compare 模式不会进入：dragging.current 只在 handleCompareMouseDown 置 true，
  // 而 handleCompareMouseDown 仅在 compareMode 时由 onWrapperMouseDown 调用。
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      setSliderPosition(getPositionFromEvent(e.clientX))
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      setSliderPosition(getPositionFromEvent(e.touches[0].clientX))
    }
    const handleEnd = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchend', handleEnd)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [getPositionFromEvent])

  const onWrapperMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (compareMode) handleCompareMouseDown(e)
      else panHandlers.onMouseDown(e)
    },
    [compareMode, handleCompareMouseDown, panHandlers],
  )

  const cursor = compareMode ? 'ew-resize' : isPanning ? 'grabbing' : 'grab'
  const clipInsetPercent = (1 - sliderPosition) * 100

  return (
    <div className="compare-container">
      <button className="close-btn" onClick={onClose} title={t('compare.closeImage')}>x</button>
      <div
        className="canvas-wrapper"
        ref={containerRef}
        onMouseDown={onWrapperMouseDown}
        onTouchStart={compareMode ? handleCompareTouchStart : undefined}
        onDoubleClick={reset}
        style={{ cursor }}
      >
        <div
          className="canvas-scaler"
          style={{
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <canvas ref={canvasRef} style={{ display: renderMode === 'canvas2d' ? 'none' : 'block' }} />
          <canvas ref={asciiCanvasRef} style={{ display: renderMode === 'canvas2d' ? 'block' : 'none' }} />

          {compareMode && originalImage && (
            <img
              src={originalImage.src}
              alt="Original"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                clipPath: `inset(0 ${clipInsetPercent}% 0 0)`,
              }}
            />
          )}

          {compareMode && (
            <div className="compare-divider" style={{ left: `${sliderPosition * 100}%` }} />
          )}
        </div>
      </div>

      <ZoomControl zoom={viewport.zoom} onZoom={setZoom} />

      <button
        className={`compare-toggle${compareMode ? ' active' : ''}`}
        onClick={onToggleCompare}
      >
        {compareMode ? t('compare.compareOn') : t('compare.compare')}
      </button>
    </div>
  )
}

export { CompareSlider }
```

- [ ] **Step 2: 类型检查 + lint** — Run: `npx tsc -b --noEmit && npx eslint src/components/CompareSlider.tsx`
  Expected: 无错误。

- [ ] **Step 3: 跑全部测试** — Run: `npx vitest run`
  Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git add src/components/CompareSlider.tsx
git commit -m "feat(2d): CompareSlider 接入 useViewport（滚轮缩放+拖动平移）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: ZoomControl max + App2D 清理

**Files:**
- Modify: `src/components/ZoomControl.tsx`
- Modify: `src/components/App2D.tsx`

- [ ] **Step 1: ZoomControl max 改 16** — 在 `src/components/ZoomControl.tsx:11`：

```tsx
function ZoomControl({ zoom, onZoom, min = 0.2, max = 16, step = 0.2 }: ZoomControlProps) {
```

- [ ] **Step 2: App2D 删除 zoom 状态** — 在 `src/components/App2D.tsx`：
  - 删除 `const [zoom, setZoom] = useState(1)`（约第 60 行）。
  - 在传给 `CompareSlider` 的 props 中删除 `zoom={zoom}` 与 `onZoom={setZoom}` 两行（约 371-372 行）。

- [ ] **Step 3: 类型检查 + lint** — Run: `npx tsc -b --noEmit && npx eslint src/components/App2D.tsx src/components/ZoomControl.tsx`
  Expected: 无错误（确认 `CompareSlider` 不再要求 `zoom/onZoom` props —— Task 3 已删除其接口定义，故 App2D 不传也通过类型检查）。

- [ ] **Step 4: 跑全部测试** — Run: `npx vitest run`
  Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add src/components/ZoomControl.tsx src/components/App2D.tsx
git commit -m "refactor(2d): ZoomControl 上限 16x；App2D 移除上层 zoom 状态

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 光标样式 + 手动验证

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: 加默认 grab 光标** — 在 `.canvas-wrapper` 规则内（约 `src/styles/global.css:503-509`）追加 `cursor: grab;`：

```css
.canvas-wrapper {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  line-height: 0;
  overflow: hidden;
  cursor: grab;
}
```

（JS 的 inline `cursor` 会按 compare/grabbing 状态覆盖此默认值。）

- [ ] **Step 2: 完整构建** — Run: `npm run build`
  Expected: 构建成功，无 TS/打包错误。

- [ ] **Step 3: 手动验证清单** — Run: `npm run dev`，浏览器打开 2D 页面，加载测试图（cake/car），逐项确认：

  - [ ] 滚轮上滚放大、下滚缩小；**缩放以光标位置为中心**（把鼠标放在某个字符上滚轮，该字符保持在光标下）。
  - [ ] 缩放范围 0.2x–16x；超出不再变化。
  - [ ] 放大后**左键拖动**可平移；**图片边缘不会拖出视口**（到边即止）。
  - [ ] 拖动时光标变 `grabbing`，松开回 `grab`。
  - [ ] **双击**复位到 100%、居中。
  - [ ] `ZoomControl` 的 `+/−/reset` 与滚轮/拖动**共享同一视图状态**（按钮缩放后滚轮接着缩放连续）。
  - [ ] 开启 **compare 对比模式**：拖动只移动分隔条（光标 `ew-resize`），**不触发画布平移**；滚轮缩放仍生效，分隔条两侧同步缩放。
  - [ ] 切换到 **ASCII 风格**（canvas2d）：滚轮缩放/拖动行为与 shader 风格一致。
  - [ ] 关闭图片再重新打开：viewport 复位（100%、居中）。

- [ ] **Step 4: 提交**

```bash
git add src/styles/global.css
git commit -m "style(2d): canvas-wrapper 默认 grab 光标

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 完成标准

- 全部 5 个 Task 提交完成。
- `npx vitest run` 全绿（11 个新单测 + 既有）。
- `npm run build` 成功。
- Task 5 手动验证清单全部勾选。

## 风险与备注

- **wheel passive**：若发现页面仍随滚轮滚动，确认 hook 的 `addEventListener('wheel', …, { passive: false })` 确实绑定到 wrapper DOM（`containerRef.current`）。
- **offsetWidth 为 0**：canvas 未渲染时 `getContentSize` 返回 null，clamp 跳过；首次渲染后即有值。若验证时 clamp 不生效，检查 canvas 是否已挂载且有尺寸。
- **compare + pan 共存**：本设计为互斥（compare 锁定 pan）。若将来需 compare 下也 pan，需引入修饰键——非本次范围。
