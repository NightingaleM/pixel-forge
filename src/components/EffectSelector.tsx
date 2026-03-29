import type { EffectDef, EffectId } from '../types'

interface EffectSelectorProps {
  effects: EffectDef[]
  activeId: EffectId
  onSelect: (id: EffectId) => void
}

export default function EffectSelector({ effects, activeId, onSelect }: EffectSelectorProps) {
  return (
    <div className="effect-selector">
      <div className="effect-selector-header">粒子特效</div>
      <div className="effect-list">
        {effects.map((effect) => (
          <button
            key={effect.id}
            className={`effect-item ${activeId === effect.id ? 'active' : ''}`}
            onClick={() => onSelect(effect.id)}
          >
            <div className="effect-item-label">{effect.label}</div>
            <div className="effect-item-desc">{effect.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
