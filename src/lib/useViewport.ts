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

/** 两指从 prev 到 next 的增量：scale = 距离比，anchor = 当前帧中点。
 *  上帧距离为 0 时 scale=1 防除零。 */
export function pinchInfo(prev: [Point, Point], next: [Point, Point]): { scale: number; anchor: Point } {
  const d0 = Math.hypot(prev[1].x - prev[0].x, prev[1].y - prev[0].y)
  const d1 = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y)
  return {
    scale: d0 === 0 ? 1 : d1 / d0,
    anchor: { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 },
  }
}

export interface UseViewportResult {
  viewport: Viewport
  /** 仅在非 compare 模式挂到 wrapper 的 onPointerDown（单指/鼠标=平移，双指=pinch）。 */
  pointerHandlers: { onPointerDown: (e: React.PointerEvent) => void }
  /** 供 ZoomControl 按钮：以视口中心为锚点缩放。 */
  setZoom: (z: number) => void
  /** 直接写视口（调用方自管 pan 语义；转卡开档 75% 居中复位用）。 */
  applyViewport: (v: Viewport) => void
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
  // effect 兜底同步（reset/外部 setViewport 等低频路径）+ commitViewport 事件内即时同步:
  // 触摸双指每秒可产生 120-240 个 pointermove,若等 effect 提交,pinch 每帧读到的是
  // 上上帧 stale viewport,增量丢失导致缩放/平移漂移不跟手。事件处理器内写 ref 合规
  // (react-hooks 仅禁止 render 期间写)。
  const viewportRef = useRef(viewport)
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])
  const commitViewport = useCallback((next: Viewport) => {
    viewportRef.current = next
    setViewport(next)
  }, [])

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
      commitViewport(zoomAtCursor(cur, anchor, cur.zoom * factor, min, max))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [min, max, commitViewport])

  // --- 统一指针：单指/鼠标=平移，双指=pinch 缩放+平移，wheel 保留 ---
  // 指针状态：pointerId → 上帧位置。el 内坐标（相对 getBoundingClientRect）。
  const pointers = useRef(new Map<number, Point>())
  const startPan = useRef<Point | null>(null)
  const dragStart = useRef<Point | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    pointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY }
      startPan.current = { x: viewportRef.current.panX, y: viewportRef.current.panY }
      setIsPanning(true)
    } else {
      // 进入双指：清空单指平移基准，避免抬指后跳变
      dragStart.current = null
      startPan.current = null
      setIsPanning(false)
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const rect = elRef.current?.getBoundingClientRect()
      if (!rect || !pointers.current.has(e.pointerId)) return
      const cur: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const prev = pointers.current.get(e.pointerId)!
      pointers.current.set(e.pointerId, cur)

      if (pointers.current.size === 1 && dragStart.current && startPan.current) {
        // 单指/鼠标平移（屏幕坐标差，与 rect 无关）
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        commitViewport({
          ...viewportRef.current,
          panX: startPan.current.x + dx,
          panY: startPan.current.y + dy,
        })
      } else if (pointers.current.size >= 2) {
        const ids = [...pointers.current.keys()].slice(0, 2)
        const pair = ids.map((id) => pointers.current.get(id)!) as [Point, Point]
        const prevPair = [
          ids[0] === e.pointerId ? prev : pair[0],
          ids[1] === e.pointerId ? prev : pair[1],
        ] as [Point, Point]
        const { scale, anchor } = pinchInfo(prevPair, pair)
        // 缩放锚定在上帧中点（内容跟随手指），再叠加中点位移完成双指平移。
        // （若直接以新中点为锚，纯双指平移时 pan 不动，违背「双指=缩放+平移」契约。）
        const prevMid = {
          x: (prevPair[0].x + prevPair[1].x) / 2,
          y: (prevPair[0].y + prevPair[1].y) / 2,
        }
        const v = zoomAtCursor(viewportRef.current, prevMid, viewportRef.current.zoom * scale, min, max)
        commitViewport({
          ...v,
          panX: v.panX + (anchor.x - prevMid.x),
          panY: v.panY + (anchor.y - prevMid.y),
        })
      }
    }
    const handleUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size === 0) {
        dragStart.current = null
        startPan.current = null
        setIsPanning(false)
      }
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [min, max, commitViewport])

  const setZoom = useCallback(
    (z: number) => {
      const el = elRef.current
      const target = clampZoom(z, min, max)
      if (!el) {
        commitViewport({ ...viewportRef.current, zoom: target })
        return
      }
      const rect = el.getBoundingClientRect()
      const anchor: Point = { x: rect.width / 2, y: rect.height / 2 }
      commitViewport(zoomAtCursor(viewportRef.current, anchor, target, min, max))
    },
    [min, max, commitViewport],
  )

  const reset = useCallback(() => {
    commitViewport({ zoom: 1, panX: 0, panY: 0 })
  }, [commitViewport])

  const applyViewport = useCallback((v: Viewport) => {
    commitViewport(v)
  }, [commitViewport])

  return { viewport, pointerHandlers: { onPointerDown }, setZoom, applyViewport, reset, isPanning }
}
