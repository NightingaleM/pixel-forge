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
  // 用普通函数（非 useCallback）：它读取参数 ref（canvasRef/asciiCanvasRef），
  // 若包进 useCallback 会触发 preserve-manual-memoization；useViewport 内部已用
  // ref 同步此函数，故无需手动 memo。
  const getContentSize = (): Size | null => {
    const canvas = renderMode === 'canvas2d' ? asciiCanvasRef.current : canvasRef.current
    if (!canvas) return null
    return { w: canvas.offsetWidth, h: canvas.offsetHeight }
  }

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
