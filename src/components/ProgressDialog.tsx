import { useTranslation } from 'react-i18next'

interface ProgressDialogProps {
  progress: number // 0-100, -1 for indeterminate
  onCancel: () => void
}

export default function ProgressDialog({ progress, onCancel }: ProgressDialogProps) {
  const { t } = useTranslation()

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <p className="dialog-message">{t('app3d.sampling')}</p>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: progress >= 0 ? `${progress}%` : '0%' }}
          />
        </div>
        <p className="progress-bar-text">
          {progress >= 0 ? `${progress}%` : ''}
        </p>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn--secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
