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
  const [contentSize, setContentSize] = useState<Size | null>(null)
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

  const { viewport, panHandlers, setZoom, reset, isPanning } = useViewport(containerRef)

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

  const onWrapperMouseDown = (e: React.MouseEvent) => {
    if (compareMode) handleCompareMouseDown(e)
    else panHandlers.onMouseDown(e)
  }

  const cursor = compareMode ? 'ew-resize' : isPanning ? 'grabbing' : 'grab'
  const contentW = contentSize?.w ?? 0
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
