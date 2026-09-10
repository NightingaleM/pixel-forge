import { useTranslation } from 'react-i18next'
import type { BuiltInPresetDefinition } from '../types'

interface BuiltInPresetBarProps {
  presets: BuiltInPresetDefinition[]
  activeId: string | null
  onApply: (preset: BuiltInPresetDefinition) => void
}

export default function BuiltInPresetBar({ presets, activeId, onApply }: BuiltInPresetBarProps) {
  const { t } = useTranslation()
  if (presets.length === 0) return null
  return (
    <div className="built-in-presets">
      <div className="built-in-presets-label">{t('preset.quickStyles')}</div>
      <div className="built-in-presets-grid">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`built-in-preset-btn${activeId === preset.id ? ' active' : ''}`}
            aria-pressed={activeId === preset.id}
            onClick={() => onApply(preset)}
          >
            {t(preset.label)}
          </button>
        ))}
      </div>
    </div>
  )
}
