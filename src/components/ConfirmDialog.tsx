import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  message: string
  /** 确认钮文案;缺省沿用「确认退出」(退出编辑场景),批量等场景按语义传入 */
  confirmLabel?: string
  /** 取消钮文案;缺省「取消」;会话恢复等场景传「丢弃」等更明确的动作词 */
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    },
    [onCancel],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn--secondary" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button className="dialog-btn dialog-btn--primary" onClick={onConfirm}>
            {confirmLabel ?? t('app2d.confirmExitBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
