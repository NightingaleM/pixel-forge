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
  // 在 effect 中同步（而非 render 期间直接写 .current），避免违反
  // react-hooks/refs 规则（render 期间访问 ref 会破坏 concurrent/strict-mode）。
  const viewportRef = useRef(viewport)
  const getContentSizeRef = useRef(getContentSize)
  const elRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])
  useEffect(() => {
    getContentSizeRef.current = getContentSize
  }, [getContentSize])
  // 中转外部 ref 到本地 ref：react-hooks v7 的 preserve-manual-memoization
  // 对“参数传入的 ref”(viewportEl) 不豁免、对“本地 useRef”豁免，故经 elRef 中转，
  // 使空依赖回调与 React Compiler 推断一致。
  useEffect(() => {
    elRef.current = viewportEl.current
  })

  // clampWithSize：所有外部捕获值通过 ref 读取，故可空依赖（[]）保持引用稳定。
  // 这是 react-hooks v7 (React Compiler lint) 下与手动 memo 共存的标准模式：
  // ref.current 读取不计入依赖，Compiler 推断与手动依赖数组一致。
  const clampWithSize = useCallback((vp: Viewport): Viewport => {
    const el = elRef.current
    const content = getContentSizeRef.current()
    if (!el || !content) return vp
    const rect = el.getBoundingClientRect()
    return clampPan(vp, { w: rect.width, h: rect.height }, content)
  }, [])

  // --- 滚轮缩放：原生非 passive 以便 preventDefault ---
  useEffect(() => {
    const el = elRef.current
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
  }, [clampWithSize, min, max])

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
      const next = { ...vp, panX: startPan.current.x + dx, panY: startPan.current.y + dy }
      setViewport(clampWithSize(next))
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
  }, [clampWithSize])

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
      setViewport(clampWithSize(zoomAtCursor(viewportRef.current, anchor, target, min, max)))
    },
    [clampWithSize, min, max],
  )

  const reset = useCallback(() => {
    setViewport(clampWithSize({ zoom: 1, panX: 0, panY: 0 }))
  }, [clampWithSize])

  return { viewport, panHandlers: { onMouseDown }, setZoom, reset, isPanning }
}
