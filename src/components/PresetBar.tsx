import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface PresetBarProps {
  defaultName: string
  onSave: (name: string) => boolean
  onToggleList: () => void
  listOpen: boolean
  count: number
}

function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

export default function PresetBar({ defaultName, onSave, onToggleList, listOpen, count }: PresetBarProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const start = useCallback(() => {
    setDraft(defaultName)
    setFailed(false)
    setEditing(true)
  }, [defaultName])

  const cancel = useCallback(() => {
    setEditing(false)
    setFailed(false)
  }, [])

  const confirm = useCallback(() => {
    const name = draft.trim() || defaultName
    if (onSave(name)) {
      setEditing(false)
      setFailed(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } else {
      setFailed(true)
    }
  }, [draft, defaultName, onSave])

  if (editing) {
    return (
      <div className="preset-bar preset-bar--edit">
        <input
          className="seed-bar-input"
          value={draft}
          placeholder={t('preset.namePlaceholder')}
          aria-label={t('preset.namePlaceholder')}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => { setDraft(e.target.value); setFailed(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirm()
            if (e.key === 'Escape') cancel()
          }}
        />
        <button className="seed-bar-btn seed-bar-btn--primary" onClick={confirm}>{t('preset.confirm')}</button>
        <button className="seed-bar-btn" onClick={cancel}>{t('common.cancel')}</button>
        {failed && <div className="seed-bar-error">{t('preset.saveFailed')}</div>}
      </div>
    )
  }

  return (
    <div className="preset-bar">
      <button className="seed-bar-btn" onClick={start} title={t('preset.save')}>
        <SaveIcon /> {savedFlash ? t('preset.saved') : t('preset.save')}
      </button>
      <button
        className={listOpen ? 'seed-bar-btn seed-bar-btn--primary' : 'seed-bar-btn'}
        onClick={onToggleList}
        title={t('preset.list')}
      >
        <ListIcon /> {t('preset.list')}{count > 0 ? ` (${count})` : ''}
      </button>
    </div>
  )
}
