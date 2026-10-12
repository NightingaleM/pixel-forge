import { useState, useRef, useEffect, type RefObject } from 'react'
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
  /** holofoil 转卡模式(与 compare 互斥,App2D 层裁决):onToggleCard 传入才渲染
   *  转卡钮(holofoil 专属,不通用化——票05 拍板)。 */
  cardMode?: boolean
  onToggleCard?: () => void
  /** 指针(相对卡面归一化 -1..1)→ 目标倾角;鼠标 hover 与单指拖动共用 */
  onCardTilt?: (nx: number, ny: number) => void
  /** 抬手/离开 → 目标回正(交自摆) */
  onCardRelease?: () => void
  /** 分区档点选拾取:画布 UV(0..1,已含 viewport transform)。转卡/对比模式不触发 */
  onZonePick?: (u: number, v: number) => void
  /** 转卡 3D 容器 ref(App2D 的转卡引擎每帧写 transform,经 ref 直达 DOM) */
  tiltRef?: RefObject<HTMLDivElement | null>
  /** 转卡手感悬浮窗入口(齿轮,cardMode 时出现) */
  onOpenCardSettings?: () => void
}

function CompareSlider({
  canvasRef,
  asciiCanvasRef,
  renderMode,
  originalImage,
  compareMode,
  onToggleCompare,
  onClose,
  cardMode,
  onToggleCard,
  onCardTilt,
  onCardRelease,
  onZonePick,
  tiltRef,
  onOpenCardSettings,
}: CompareSliderProps) {
  const { t } = useTranslation()
  const [sliderPosition, setSliderPosition] = useState(0.5)
  const [contentSize, setContentSize] = useState<Size | null>( null)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 内容（缩放前）尺寸：由 ResizeObserver 在 effect 中读 canvas.offsetWidth 并存入
  // state——绝不在 render 期间访问 ref（react-hooks/refs）。ShaderRenderer 会异步把
  // canvas 默认 300×150 改为图片适配尺寸，RO 能捕捉该变化。
  useEffect(() => {
    const canvas = renderMode === 'canvas2d' ? asciiCanvasRef.current : canvasRef.current
    if (!canvas) return
    const update = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      const next = w === 0 || h === 0 ? null : { w, h }
      setContentSize((prev) => (prev && next && prev.w === next.w && prev.h === next.h ? prev : next))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [renderMode, asciiCanvasRef, canvasRef])

  const { viewport, pointerHandlers, setZoom, applyViewport, reset, isPanning } = useViewport(containerRef)

  // 转卡开档:卡片内容区化(aspect-ratio 生效后 flex 居中)再复位到 75% 居中——
  // 缩放以 scaler 左上为原点(transform-origin 0 0),pan=w*(1-zoom)/2 补偿回中,
  // 舞台留出投影/倾转余量;关档复位 {1,0,0}(scaler 回全區,pan 语义同步归零)。
  // scaler 尺寸同帧可量:effect 时 React 已 commit,inline aspectRatio 与 CSS
  // 布局同步生效,offsetWidth 无需等 ResizeObserver。
  useEffect(() => {
    if (!cardMode) {
      reset()
      return
    }
    const scaler = containerRef.current?.querySelector<HTMLElement>('.canvas-scaler')
    if (!scaler) return
    applyViewport({ zoom: 0.75, panX: scaler.offsetWidth * 0.125, panY: scaler.offsetHeight * 0.125 })
  }, [cardMode, applyViewport, reset])

  // compare 分割线位置 = canvas 内容坐标比例 [0,1]（非视口比例），这样放大后分割线/
  // clipPath（在缩放的 canvas-scaler 内）仍与鼠标对齐。读本地 ref + state，普通函数即可。
  const getPositionFromEvent = (clientX: number): number => {
    const container = containerRef.current
    if (!container) return 0.5
    const rect = container.getBoundingClientRect()
    const contentW = contentSize?.w || rect.width
    const ratio = (clientX - rect.left - viewport.panX) / (viewport.zoom * contentW)
    return Math.min(1, Math.max(0, ratio))
  }

  // window 级 compare 拖动通过 ref 读最新 getPositionFromEvent，使监听只绑一次。
  const getPositionFromEventRef = useRef(getPositionFromEvent)
  useEffect(() => {
    getPositionFromEventRef.current = getPositionFromEvent
  })

  const handleCompareMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    setSliderPosition(getPositionFromEvent(e.clientX))
  }

  const handleCompareTouchStart = (e: React.TouchEvent) => {
    dragging.current = true
    setSliderPosition(getPositionFromEvent(e.touches[0].clientX))
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      setSliderPosition(getPositionFromEventRef.current(e.clientX))
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      setSliderPosition(getPositionFromEventRef.current(e.touches[0].clientX))
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
  }, [])

  // ---- 转卡模式指针(票06:H5 单指拖=转卡、双指缩放保留;桌面 hover 跟随) ----
  // pointers Map 只收按下的指针;鼠标 hover(未按下)的 pointermove 也转发倾角。
  // 双指时以指距比为 pinch 因子,中心锚定缩放(viewport 归本组件,不动 useViewport
  // 的单指平移路径——循 compare「按模式换手势」先例,摘平移/双击复位、留 pinch)。
  const cardPtrs = useRef(new Map<number, { x: number; y: number }>())
  const cardDist = useRef(0)
  const tiltFromPointer = (e: React.PointerEvent) => {
    const el = renderMode === 'canvas2d' ? asciiCanvasRef.current : canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    onCardTilt?.(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2)
  }
  const onCardPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    cardPtrs.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top })
    if (cardPtrs.current.size === 1) {
      tiltFromPointer(e)
    } else if (cardPtrs.current.size === 2) {
      const [a, b] = [...cardPtrs.current.values()]
      cardDist.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onCardPointerMove = (e: React.PointerEvent) => {
    if (!cardPtrs.current.has(e.pointerId)) {
      // 鼠标 hover(未按下):跟随(demo 手感——无需按住)
      if (e.pointerType === 'mouse') tiltFromPointer(e)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    cardPtrs.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top })
    if (cardPtrs.current.size === 1) {
      tiltFromPointer(e)
    } else if (cardPtrs.current.size >= 2) {
      const pts = [...cardPtrs.current.values()].slice(0, 2)
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (cardDist.current > 1 && d > 1) setZoom(viewport.zoom * (d / cardDist.current))
      cardDist.current = d
    }
  }
  const onCardPointerUp = (e: React.PointerEvent) => {
    cardPtrs.current.delete(e.pointerId)
    if (cardPtrs.current.size === 0) onCardRelease?.()
    else if (cardPtrs.current.size === 1) cardDist.current = 0
  }
  const onCardPointerLeave = (e: React.PointerEvent) => {
    // 鼠标离开画布区:回正(触摸的离开走 pointerup/cancel)
    if (e.pointerType === 'mouse' && cardPtrs.current.size === 0) onCardRelease?.()
  }

  // 分区档点选:canvas 点击 → UV(getBoundingClientRect 已含 viewport transform,
  // 线性映射即可)。compare/cardMode 时不触发(各自接管了点击语义)。
  const onCanvasClick = (e: React.MouseEvent) => {
    if (compareMode || cardMode || !onZonePick) return
    const el = e.currentTarget as HTMLCanvasElement
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    onZonePick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }

  const onWrapperMouseDown = (e: React.MouseEvent) => {
    if (!compareMode) return // 平移已由 pointerDown 统一处理
    handleCompareMouseDown(e)
  }

  const cursor = compareMode ? 'ew-resize' : cardMode ? 'crosshair' : isPanning ? 'grabbing' : 'grab'
  const contentW = contentSize?.w ?? 0
  const clipInsetPercent = (1 - sliderPosition) * 100

  return (
    <div className="compare-container">
      <button className="close-btn" onClick={onClose} title={t('compare.closeImage')}>x</button>
      <div
        className={`canvas-wrapper${cardMode ? ' canvas-wrapper--card' : ''}`}
        ref={containerRef}
        onMouseDown={onWrapperMouseDown}
        onPointerDown={cardMode ? onCardPointerDown : compareMode ? undefined : pointerHandlers.onPointerDown}
        onPointerMove={cardMode ? onCardPointerMove : undefined}
        onPointerUp={cardMode ? onCardPointerUp : undefined}
        onPointerCancel={cardMode ? onCardPointerUp : undefined}
        onPointerLeave={cardMode ? onCardPointerLeave : undefined}
        onTouchStart={compareMode ? handleCompareTouchStart : undefined}
        onDoubleClick={compareMode || cardMode ? undefined : reset}
        style={{ cursor }}
      >
        <div
          className="canvas-scaler"
          style={{
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            // 转卡档:盒=图片比例(--card 样式下 width/height auto + max 约束),
            // canvas fill 无 letterbox——object-fit: contain 的白边不复存在
            aspectRatio:
              cardMode && originalImage?.naturalWidth && originalImage?.naturalHeight
                ? `${originalImage.naturalWidth} / ${originalImage.naturalHeight}`
                : undefined,
          }}
        >
          {/* 转卡 3D 容器:恒挂载(canvas 的 WebGL 上下文绑定在元素上,重挂载即重建
              上下文),非转卡时无 transform 无样式副作用。引擎每帧写 transform。 */}
          <div className={`card-tilt${cardMode ? ' card-tilt--on' : ''}`} ref={tiltRef}>
            {/* 拦截右键/拖拽:预览画布永不落水印(水印只在导出副本),右键「图片另存为」
                「复制图片」或拖拽到桌面都会存出无水印 PNG,绕过导出 gating 的额度与
                水印。无差别拦截(不分会员态),避免会员态切换的漏网窗口 */}
            <canvas
              ref={canvasRef}
              style={{ display: renderMode === 'canvas2d' ? 'none' : 'block' }}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              onClick={onCanvasClick}
            />
            <canvas
              ref={asciiCanvasRef}
              style={{ display: renderMode === 'canvas2d' ? 'block' : 'none' }}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              onClick={onCanvasClick}
            />
            {/* 转卡光效层:高光微动(斜向光带随倾角滑移)+ 侧旋暗角,引擎按倾角驱动 */}
            <div className="card-gloss" aria-hidden="true" />
            <div className="card-vignette" aria-hidden="true" />
          </div>

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
                objectFit: 'contain',
                pointerEvents: 'none',
                clipPath: `inset(0 ${clipInsetPercent}% 0 0)`,
              }}
            />
          )}

          {compareMode && (
            <div className="compare-divider" style={{ left: `${sliderPosition * contentW}px` }} />
          )}
        </div>
      </div>

      <ZoomControl zoom={viewport.zoom} onZoom={setZoom} onReset={reset} />

      <button
        className={`compare-toggle${compareMode ? ' active' : ''}`}
        onClick={onToggleCompare}
      >
        {compareMode ? t('compare.compareOn') : t('compare.compare')}
      </button>

      {/* 转卡开关:holofoil 专属(onToggleCard 由 App2D 只在 holofoil 传入),
          与 compare 互斥(开转卡自动退出对比,反之亦然) */}
      {onToggleCard && (
        <button
          className={`compare-toggle card-toggle${cardMode ? ' active' : ''}`}
          onClick={onToggleCard}
        >
          {/* 卡片微倾示意:平行四边形卡面(手绘 SVG,禁 emoji) */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true">
            <path d="M7 4l13 3-3 13L4 17z" />
            <path d="M7 4l3 13" opacity="0.55" />
          </svg>
          {t('card.toggle')}
        </button>
      )}

      {/* 转卡手感齿轮:cardMode 时出现,打开可拖拽手感悬浮窗 */}
      {cardMode && onOpenCardSettings && (
        <button
          className="compare-toggle card-settings-btn"
          onClick={onOpenCardSettings}
          title={t('card.settings')}
          aria-label={t('card.settings')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
            {/* 齿轮:外圈轮体 + 中孔 + 8 根粗齿(与放射线太阳图标区分) */}
            <circle cx="12" cy="12" r="5.2" strokeWidth="2" />
            <circle cx="12" cy="12" r="1.8" strokeWidth="2" />
            <path d="M12 3.2v2.6M12 18.2v2.6M3.2 12h2.6M18.2 12h2.6M5.8 5.8l1.9 1.9M16.3 16.3l1.9 1.9M18.2 5.8l-1.9 1.9M7.7 16.3l-1.9 1.9" strokeWidth="2.4" />
          </svg>
        </button>
      )}

      {/* 分区档点选提示(票06:预览区提示文案) */}
      {onZonePick && !compareMode && !cardMode && (
        <div className="zone-pick-hint">{t('style.holofoil.zonePickHint')}</div>
      )}
    </div>
  )
}

export { CompareSlider }
