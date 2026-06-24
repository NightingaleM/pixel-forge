import { useCallback, useEffect, useRef, useState } from 'react'

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

/**
 * 以 wrapper 内锚点 (mx, my) 为中心缩放到 newZoom，使该内容点保持在光标下。
 * newZoom 会被 clamp；pan 不做边界限制——图片可随意拖动（即便全部展示）。
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
 */
export function useViewport(
  viewportEl: React.RefObject<HTMLElement | null>,
  opts: { min?: number; max?: number } = {},
): UseViewportResult {
  const { min = MIN_ZOOM, max = MAX_ZOOM } = opts
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [isPanning, setIsPanning] = useState(false)

  // 用 ref 持有最新 viewport，供 window 级事件读取，避免 stale closure。
  // 在 effect 中同步（而非 render 期间直接写 .current），避免违反 react-hooks/refs。
  const viewportRef = useRef(viewport)
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  // 中转外部 ref 到本地 ref：react-hooks v7 的 preserve-manual-memoization
  // 对“参数传入的 ref”(viewportEl) 不豁免、对“本地 useRef”豁免，故经 elRef 中转。
  const elRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    elRef.current = viewportEl.current
  })

  // --- 滚轮缩放：原生非 passive 以便 preventDefault ---
  // 注：el 在 effect 运行时读取（containerRef 是静态 div，不会运行时替换）。
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const anchor: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const cur = viewportRef.current
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      setViewport(zoomAtCursor(cur, anchor, cur.zoom * factor, min, max))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [min, max])

  // --- 拖动平移：window 级 mousemove/mouseup（pan 自由，不限制边界）---
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
      setViewport({ ...vp, panX: startPan.current.x + dx, panY: startPan.current.y + dy })
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
  }, [])

  const setZoom = useCallback(
    (z: number) => {
      const el = elRef.current
      const target = clampZoom(z, min, max)
      if (!el) {
        setViewport((vp) => ({ ...vp, zoom: target }))
        return
      }
      const rect = el.getBoundingClientRect()
      const anchor: Point = { x: rect.width / 2, y: rect.height / 2 }
      setViewport(zoomAtCursor(viewportRef.current, anchor, target, min, max))
    },
    [min, max],
  )

  const reset = useCallback(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 })
  }, [])

  return { viewport, panHandlers: { onMouseDown }, setZoom, reset, isPanning }
}
