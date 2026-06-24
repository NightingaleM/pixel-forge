import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import ZoomControl from './ZoomControl'

interface CompareSliderProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  asciiCanvasRef: RefObject<HTMLCanvasElement | null>
  renderMode?: 'shader' | 'canvas2d'
  originalImage: HTMLImageElement | null
  compareMode: boolean
  onToggleCompare: () => void
  onClose: () => void
  zoom: number
  onZoom: (z: number) => void
}

function CompareSlider({
  canvasRef,
  asciiCanvasRef,
  renderMode,
  originalImage,
  compareMode,
  onToggleCompare,
  onClose,
  zoom,
  onZoom,
}: CompareSliderProps) {
  const { t } = useTranslation()
  const [sliderPosition, setSliderPosition] = useState(0.5)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const getPositionFromEvent = useCallback(
    (clientX: number): number => {
      const container = containerRef.current
      if (!container) return 0.5
      const rect = container.getBoundingClientRect()
      const x = clientX - rect.left
      const ratio = x / rect.width
      return Math.min(1, Math.max(0, ratio))
    },
    [],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!compareMode) return
      e.preventDefault()
      dragging.current = true
      setSliderPosition(getPositionFromEvent(e.clientX))
    },
    [compareMode, getPositionFromEvent],
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!compareMode) return
      dragging.current = true
      setSliderPosition(getPositionFromEvent(e.touches[0].clientX))
    },
    [compareMode, getPositionFromEvent],
  )

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

  const clipInsetPercent = (1 - sliderPosition) * 100

  return (
    <div className="compare-container">
      <button
        className="close-btn"
        onClick={onClose}
        title={t('compare.closeImage')}
      >
        x
      </button>
      <div
        className="canvas-wrapper"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="canvas-scaler" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          <canvas
            ref={canvasRef}
            style={{ display: renderMode === 'canvas2d' ? 'none' : 'block' }}
          />
          <canvas
            ref={asciiCanvasRef}
            style={{ display: renderMode === 'canvas2d' ? 'block' : 'none' }}
          />

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
            <div
              className="compare-divider"
              style={{
                left: `${sliderPosition * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      <ZoomControl zoom={zoom} onZoom={onZoom} />

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
