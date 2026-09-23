import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { PresetEntry } from '../lib/presetStore'
import PresetMenu, { presetListIcon } from './PresetMenu'

interface SeedBarProps {
  seed: string
  onApply: (code: string) => boolean
  /** 已保存配置(种子列表数据源,App2D presets) */
  presets: PresetEntry[]
  /** 应用配置(与 PresetPanel 同语义) */
  onApplyPreset: (entry: PresetEntry) => void
}

export function SeedBar({ seed, onApply, presets, onApplyPreset }: SeedBarProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(seed)
  const [applyError, setApplyError] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)

  const startEdit = useCallback(() => {
    setDraft(seed)
    setApplyError(false)
    setEditing(true)
  }, [seed])

  const cancel = useCallback(() => {
    setEditing(false)
    setApplyError(false)
  }, [])

  const apply = useCallback(() => {
    const ok = onApply(draft.trim())
    if (ok) {
      setEditing(false)
      setApplyError(false)
    } else {
      setApplyError(true)
    }
  }, [draft, onApply])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(seed)
      setCopyMsg('copied')
      setTimeout(() => setCopyMsg(null), 1500)
    } catch {
      setCopyMsg('copyFailed')
      setTimeout(() => setCopyMsg(null), 2500)
    }
  }, [seed])

  const copyLabel = copyMsg === 'copied' ? t('seed.copied')
    : copyMsg === 'copyFailed' ? t('seed.copyFailed')
    : t('seed.copy')

  if (editing) {
    return (
      <div className="seed-bar seed-bar--edit">
        <input
          className="seed-bar-input"
          value={draft}
          placeholder={t('seed.placeholder')}
          onChange={(e) => { setDraft(e.target.value); setApplyError(false) }}
          autoFocus
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            if (e.key === 'Escape') cancel()
          }}
        />
        <button className="seed-bar-btn seed-bar-btn--primary" onClick={apply}>{t('seed.apply')}</button>
        <button className="seed-bar-btn" onClick={cancel}>{t('seed.cancel')}</button>
        {applyError && <div className="seed-bar-error">{t('seed.invalid')}</div>}
      </div>
    )
  }

  return (
    <div className="seed-bar">
      <span className="seed-bar-label">{t('seed.label')}</span>
      <code className="seed-bar-code" title={t('seed.hint')} onClick={startEdit}>{seed}</code>
      <button className="seed-bar-btn" onClick={copy}>{copyLabel}</button>
      <button className="seed-bar-btn" onClick={startEdit}>{t('seed.edit')}</button>
      <div className="seed-bar-preset-anchor">
        <button
          className="seed-bar-btn"
          title={t('batch.seedList')}
          aria-label={t('batch.seedList')}
          aria-expanded={presetOpen}
          onClick={() => setPresetOpen((v) => !v)}
        >
          {presetListIcon}
        </button>
        {presetOpen && (
          <PresetMenu
            presets={presets}
            onApply={(e) => { onApplyPreset(e); setPresetOpen(false) }}
            onClose={() => setPresetOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

export default SeedBar
