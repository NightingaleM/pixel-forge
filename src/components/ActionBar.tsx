import { useTranslation } from 'react-i18next'

interface ActionBarProps {
  onDownloadPng: () => void
  onDownloadJpg?: () => void
  onDownloadSvg?: () => void
  renderMode?: 'shader' | 'canvas2d'
  onReset: () => void
  onRandom: () => void
  onBatchApply: () => void
  imageInfo: { width: number; height: number; size: string } | null
}

function ActionBar({ onDownloadPng, onDownloadJpg, onDownloadSvg, renderMode, onReset, onRandom, onBatchApply, imageInfo }: ActionBarProps) {
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
        <>
          <button className="action-btn" onClick={onDownloadPng}>{t('common.download')}</button>
          <button className="action-btn" onClick={onDownloadJpg}>{t('export.jpg')}</button>
        </>
      )}
      <button className="action-btn action-btn--secondary" onClick={onReset}>{t('common.reset')}</button>
      <button className="action-btn action-btn--secondary" onClick={onRandom}>{t('common.random')}</button>
      <button className="action-btn action-btn--secondary" onClick={onBatchApply}>
        {/* 两个叠加方块:一图变多图的批量语义(手绘 SVG,禁 emoji) */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" rx="2" />
          <rect x="11" y="11" width="10" height="10" rx="2" />
        </svg>
        {t('batch.apply')}
      </button>
      {imageInfo && (
        <div className="image-info">
          {imageInfo.width} x {imageInfo.height} | {imageInfo.size}
        </div>
      )}
    </div>
  )
}

export default ActionBar
