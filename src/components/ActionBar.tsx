import { useTranslation } from 'react-i18next'

interface ActionBarProps {
  onDownloadPng: () => void
  onDownloadJpg?: () => void
  onDownloadSvg?: () => void
  renderMode?: 'shader' | 'canvas2d'
  onReset: () => void
  onRandom: () => void
  imageInfo: { width: number; height: number; size: string } | null
}

function ActionBar({ onDownloadPng, onDownloadJpg, onDownloadSvg, renderMode, onReset, onRandom, imageInfo }: ActionBarProps) {
  const { t } = useTranslation()
  const isCanvas2d = renderMode === 'canvas2d'

  return (
    <div className="action-bar">
      {isCanvas2d ? (
        <>
          <button className="action-btn" onClick={onDownloadJpg}>{t('export.jpg')}</button>
          <button className="action-btn" onClick={onDownloadPng}>{t('export.png')}</button>
          <button className="action-btn action-btn--primary" onClick={onDownloadSvg}>{t('export.svg')}</button>
        </>
      ) : (
        <button className="action-btn" onClick={onDownloadPng}>{t('common.download')}</button>
      )}
      <button className="action-btn action-btn--secondary" onClick={onReset}>{t('common.reset')}</button>
      <button className="action-btn action-btn--secondary" onClick={onRandom}>{t('common.random')}</button>
      {imageInfo && (
        <div className="image-info">
          {imageInfo.width} x {imageInfo.height} | {imageInfo.size}
        </div>
      )}
    </div>
  )
}

export default ActionBar
