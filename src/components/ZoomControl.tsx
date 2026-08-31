import { useTranslation } from 'react-i18next'

interface ZoomControlProps {
  zoom: number
  onZoom: (z: number) => void
  /** 重置：恢复缩放并把图片回到视口正中（区别于仅改 zoom 的 onZoom）。 */
  onReset: () => void
  min?: number
  max?: number
  step?: number
}

function ZoomControl({ zoom, onZoom, onReset, min = 0.2, max = 16, step = 0.2 }: ZoomControlProps) {
  const { t } = useTranslation()
  const clamp = (z: number) => Math.min(max, Math.max(min, z))
  return (
    <div className="zoom-control">
      <button className="zoom-btn" onClick={() => onZoom(clamp(zoom - step))} title="-">−</button>
      <span className="zoom-label">{Math.round(zoom * 100)}%</span>
      <button className="zoom-btn" onClick={() => onZoom(clamp(zoom + step))} title="+">+</button>
      <button className="zoom-btn zoom-reset" onClick={onReset} title={t('common.reset')}>{t('common.reset')}</button>
    </div>
  )
}

export default ZoomControl
