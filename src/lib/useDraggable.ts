import { useRef, useState, useCallback, useEffect } from 'react'

export interface DragPos { x: number; y: number }

/** 四边限位：面板完整留在视口内；视口装不下时贴左上角，不翻转。 */
export function clampPanelPos(
  raw: DragPos,
  viewport: { w: number; h: number },
  panel: { w: number; h: number },
): DragPos {
  return {
    x: Math.max(0, Math.min(viewport.w - panel.w, raw.x)),
    y: Math.max(0, Math.min(viewport.h - panel.h, raw.y)),
  }
}

/**
 * 浮动面板拖动：标题栏按下 → window mousemove 移动（按面板实际尺寸四边限位）→ mouseup 结束。
 * 窗口 resize / 挂载时对当前位置重新限位，防止面板滞留视口外。
 * 返回 ref 挂在面板根节点、onHeaderMouseDown 挂在标题栏。
 */
export function useDraggable(defaultPos?: DragPos) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<DragPos>(
    defaultPos ?? { x: typeof window !== 'undefined' ? window.innerWidth - 320 : 600, y: 35 },
  )
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return
    // 标题栏内按钮（折叠/关闭/随机等）按下不应触发拖动
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    const rect = ref.current.getBoundingClientRect()
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    // 面板尺寸会变（折叠/内容增减），每次拖动都读实时尺寸
    const clampToViewport = (raw: DragPos): DragPos => {
      const rect = ref.current?.getBoundingClientRect()
      return clampPanelPos(
        raw,
        { w: window.innerWidth, h: window.innerHeight },
        { w: rect?.width ?? 0, h: rect?.height ?? 0 },
      )
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos(clampToViewport({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y }))
    }
    const onMouseUp = () => { dragging.current = false }
    // 挂载与 resize 时把当前面板拉回视口内（拖动只在 move 时限位，窗口缩小后面板会悬在外）
    const reclamp = () => setPos((p) => clampToViewport(p))
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('resize', reclamp)
    reclamp()
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('resize', reclamp)
    }
  }, [])

  return { ref, pos, onHeaderMouseDown }
}
