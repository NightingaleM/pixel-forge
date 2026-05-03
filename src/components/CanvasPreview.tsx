import { useTranslation } from 'react-i18next'
import type { RefObject } from 'react'

interface CanvasPreviewProps {
  canvasRef: RefObject<HTMLCanvasElement>
}

function CanvasPreview({ canvasRef }: CanvasPreviewProps) {
  const { t } = useTranslation()

  return (
    <div className="preview-area">
      <canvas ref={canvasRef} />
      <span className="placeholder-text">{t('app2d.uploadFirst')}</span>
    </div>
  )
}

export default CanvasPreview
