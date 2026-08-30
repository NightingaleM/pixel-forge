import { useRef, useState, useCallback, useEffect } from 'react'

export interface DragPos { x: number; y: number }

/**
 * 浮动面板拖动：标题栏按下 → window mousemove 移动（clamp 在视口内）→ mouseup 结束。
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
    dragging.current = true
    const rect = ref.current!.getBoundingClientRect()
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offset.current.y))
      setPos({ x, y })
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return { ref, pos, onHeaderMouseDown }
}
