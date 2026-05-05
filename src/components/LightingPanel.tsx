import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export interface LightingState {
  mainIntensity: number
  ambientIntensity: number
  colorTemp: number
  directionIndex: number
  preset: string
}

const PRESETS: Record<string, Omit<LightingState, 'preset'>> = {
  daylight:  { mainIntensity: 0.8, ambientIntensity: 0.4, colorTemp: 0.3, directionIndex: 2 },
  moonlight: { mainIntensity: 0.5, ambientIntensity: 0.3, colorTemp: 0.85, directionIndex: 0 },
  spotlight: { mainIntensity: 1.2, ambientIntensity: 0.1, colorTemp: 0.5, directionIndex: 1 },
  even:      { mainIntensity: 0, ambientIntensity: 0.8, colorTemp: 0.5, directionIndex: 4 },
}

interface LightingPanelProps {
  state: LightingState
  onChange: (state: LightingState) => void
}

export default function LightingPanel({ state, onChange }: LightingPanelProps) {
  const { t } = useTranslation()

  const applyPreset = useCallback((preset: string) => {
    if (preset === 'custom') {
      onChange({ ...state, preset: 'custom' })
    } else {
      const p = PRESETS[preset]
      if (p) onChange({ ...p, preset })
    }
  }, [state, onChange])

  const updateParam = useCallback((key: keyof Omit<LightingState, 'preset'>, value: number) => {
    onChange({ ...state, [key]: value, preset: 'custom' })
  }, [state, onChange])

  const presetButtons = [
    { key: 'daylight', icon: '☀' },
    { key: 'moonlight', icon: '🌙' },
    { key: 'spotlight', icon: '🔦' },
    { key: 'even', icon: '💡' },
  ]

  return (
    <>
      <div className="lighting-presets">
        {presetButtons.map(p => (
          <button
            key={p.key}
            className={`preset-btn ${state.preset === p.key ? 'active' : ''}`}
            onClick={() => applyPreset(p.key)}
            title={t(`app3d.lightingPresets.${p.key}`)}
          >
            {p.icon}
          </button>
        ))}
      </div>

      <div className="param-row">
        <div className="param-header">
          <span className="param-label">{t('app3d.mainLightIntensity')}</span>
          <span className="param-value">{state.mainIntensity.toFixed(1)}</span>
        </div>
        <input type="range" className="param-slider" min={0} max={2} step={0.1}
          value={state.mainIntensity}
          onInput={e => updateParam('mainIntensity', parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="param-row">
        <div className="param-header">
          <span className="param-label">{t('app3d.ambientIntensity')}</span>
          <span className="param-value">{state.ambientIntensity.toFixed(1)}</span>
        </div>
        <input type="range" className="param-slider" min={0} max={2} step={0.1}
          value={state.ambientIntensity}
          onInput={e => updateParam('ambientIntensity', parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="param-row">
        <div className="param-header">
          <span className="param-label">{t('app3d.colorTemp')}</span>
          <span className="param-value">{state.colorTemp < 0.4 ? t('app3d.warm') : state.colorTemp > 0.6 ? t('app3d.cool') : t('app3d.neutral')}</span>
        </div>
        <input type="range" className="param-slider color-temp-slider" min={0} max={1} step={0.01}
          value={state.colorTemp}
          onInput={e => updateParam('colorTemp', parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="param-row">
        <div className="param-header">
          <span className="param-label">{t('app3d.lightDirection')}</span>
        </div>
        <div className="direction-grid">
          {Array.from({ length: 9 }, (_, i) => (
            <button
              key={i}
              className={`dir-btn ${state.directionIndex === i ? 'active' : ''}`}
              onClick={() => updateParam('directionIndex', i)}
            />
          ))}
        </div>
      </div>
    </>
  )
}
