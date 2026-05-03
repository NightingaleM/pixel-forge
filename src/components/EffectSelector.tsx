import { useTranslation } from 'react-i18next'
import type { EffectDef, EffectId } from '../types'

interface EffectSelectorProps {
  effects: EffectDef[]
  activeId: EffectId
  onSelect: (id: EffectId) => void
}

export default function EffectSelector({ effects, activeId, onSelect }: EffectSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="effect-selector">
      <div className="effect-selector-header">{t('app3d.particleEffect')}</div>
      <div className="effect-list">
        {effects.map((effect) => (
          <button
            key={effect.id}
            className={`effect-item ${activeId === effect.id ? 'active' : ''}`}
            onClick={() => onSelect(effect.id)}
          >
            <div className="effect-item-label">{t(effect.label)}</div>
            <div className="effect-item-desc">{t(effect.description)}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
