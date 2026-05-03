import { useTranslation } from 'react-i18next'

interface ActionBarProps {
  onDownload: () => void
  onReset: () => void
  onRandom: () => void
  imageInfo: { width: number; height: number; size: string } | null
}

function ActionBar({ onDownload, onReset, onRandom, imageInfo }: ActionBarProps) {
  const { t } = useTranslation()

  return (
    <div className="action-bar">
      <button className="action-btn" onClick={onDownload}>{t('common.download')}</button>
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
