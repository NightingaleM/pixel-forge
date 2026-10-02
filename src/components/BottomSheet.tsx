import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { settleSnap } from '../lib/sheetSnap'

/** 拖拽中高度下限:跌破后不再跟手,防拖没。 */
const MIN_SHEET_PX = 120

function snapPx(snap: 'peek' | 'full', vh: number): number {
  return Math.round(vh * (snap === 'full' ? 0.9 : 0.6))
}

/** 移动端底部抽屉:peek(60%)/full(90%)两档 + 把手拖拽 + 点遮罩关闭。
 *  拖动时 height = base − 累计下移量(min 120px)实时跟手;松手按 settleSnap
 *  吸附(offset=当前高度,velocity 下正)。transition 只在非拖拽态启用。
 *  拖拽位移用 clientY 逐事件差值累计(pointer capture 绑在把手上,事件不丢);
 *  vh 用 state 跟踪 resize,旋转/地址栏收展后两档像素重算。
 *  dismissible=false(批量面板):遮罩不关、下拉不 close——关闭必须走面板内
 *  关闭钮(运行中须先经确认弹窗,遮罩误触不能绕过,用户验收反馈 #1)。
 *  sheetClassName 追加到 .m-sheet(如批量场景改 body 布局,交 CSS 控制)。 */
export default function BottomSheet({ open, onClose, title, full = false, dismissible = true, sheetClassName, children }: {
  open: boolean
  onClose: () => void
  title?: string
  full?: boolean
  dismissible?: boolean
  sheetClassName?: string
  children: ReactNode
}) {
  const [snap, setSnap] = useState<'peek' | 'full'>(full ? 'full' : 'peek')
  // 非 null = 拖拽中;值为本次拖拽累计下移量(clientY 差值求和,下正)
  const [drag, setDrag] = useState<number | null>(null)
  const dragRef = useRef(0)
  const last = useRef<{ y: number; t: number } | null>(null)
  const vel = useRef(0)
  const [vh, setVh] = useState(() => window.innerHeight)

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    if (last.current) return // 拖拽中第二指再按把手:忽略,防 dragRef/drag 归零导致高度瞬跳回 base
    e.currentTarget.setPointerCapture?.(e.pointerId)
    last.current = { y: e.clientY, t: performance.now() }
    vel.current = 0
    dragRef.current = 0
    setDrag(0)
  }, [])

  const onHandleMove = useCallback((e: React.PointerEvent) => {
    if (!last.current) return
    const now = performance.now()
    const dt = now - last.current.t
    const dy = e.clientY - last.current.y
    if (dt > 0) vel.current = (dy / dt) * 1000
    last.current = { y: e.clientY, t: now }
    dragRef.current += dy
    setDrag(dragRef.current)
  }, [])

  const onHandleUp = useCallback(() => {
    if (!last.current) return
    last.current = null
    const peek = snapPx('peek', vh)
    const fullPx = snapPx('full', vh)
    const base = snapPx(snap, vh)
    const cur = Math.max(MIN_SHEET_PX, base - dragRef.current)
    const closeTh = Math.max(MIN_SHEET_PX, Math.round(peek * 0.3))
    const target = settleSnap(cur, vel.current, peek, fullPx, closeTh)
    setDrag(null)
    if (target === 'close') {
      if (dismissible) onClose()
      else setSnap('peek') // 不可关闭场景:下拉意图只收到 peek,不 close
    } else setSnap(target)
  }, [snap, vh, onClose, dismissible])

  if (!open) return null
  const base = snapPx(snap, vh)
  const height = drag !== null ? Math.max(MIN_SHEET_PX, base - drag) : base
  return (
    <div className="m-sheet-mask" onClick={dismissible ? onClose : undefined}>
      <div
        className={`m-sheet${drag !== null ? ' m-sheet--dragging' : ''}${sheetClassName ? ` ${sheetClassName}` : ''}`}
        style={{ height }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 把手命中区:透明 zone 撑到 ≥44px 高(全宽),视觉圆条仍 40×5;
            pointer 事件挂 zone(捕获/拖拽/松手都在 zone 上) */}
        <div
          className="m-sheet-handle-zone"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="m-sheet-handle" />
        </div>
        {title && <div className="m-sheet-title">{title}</div>}
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  )
}
