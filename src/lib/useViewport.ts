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
