// src/components/CardSettingsPanel.tsx
// 转卡手感悬浮窗(wayfinder/holofoil-card 票06):preset-panel 拖拽底盘先例
// (LicensePanel 同款)。幅度+三开关,会话态不入种子码(刷新回默认)——
// 浮窗调值只写 CardTiltEngine.feel,不进 params/textParams。
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import type { CardTiltFeel } from '../lib/cardTilt'

interface CardSettingsPanelProps {
  feel: CardTiltFeel
  onChange: (patch: Partial<CardTiltFeel>) => void
  onClose: () => void
}

function CardSettingsPanel({ feel, onChange, onClose }: CardSettingsPanelProps) {
  const { t } = useTranslation()
  const { ref, pos, onHeaderMouseDown } = useDraggable(
    { x: Math.max(20, window.innerWidth - 300), y: 140 },
    'pixel-forge.panelPos.cardTilt',
  )

  const toggles: { key: 'flow' | 'idle' | 'light'; label: string; desc: string }[] = [
    { key: 'flow', label: t('card.flow'), desc: t('card.flowDesc') },
    { key: 'idle', label: t('card.idle'), desc: t('card.idleDesc') },
    { key: 'light', label: t('card.shine'), desc: t('card.shineDesc') },
  ]

  return (
    <div className="preset-panel card-settings-panel" ref={ref} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('card.settings')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-close" onClick={onClose}>x</button>
          </div>
        </div>
      </div>
      <div className="card-settings-body">
        <div className="param-row">
          <div className="param-header">
            <span className="param-label">{t('card.amplitude')}</span>
            <span className="param-value">{feel.amp.toFixed(1)}°</span>
          </div>
          <input
            type="range"
            className="param-slider"
            min={5}
            max={20}
            step={0.5}
            value={feel.amp}
            onInput={(e) => onChange({ amp: parseFloat((e.target as HTMLInputElement).value) })}
          />
        </div>
        {toggles.map((tg) => (
          <div className="param-row" key={tg.key}>
            <label className="param-toggle">
              <input
                type="checkbox"
                checked={feel[tg.key]}
                onChange={(e) => onChange({ [tg.key]: e.target.checked } as Partial<CardTiltFeel>)}
              />
              <span className="param-label">
                {tg.label}
                <span className="card-settings-desc">{tg.desc}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CardSettingsPanel
