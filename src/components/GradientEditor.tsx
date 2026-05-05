import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ColorStop, GradientConfig } from '../types'

interface GradientEditorProps {
  config: GradientConfig
  onChange: (config: GradientConfig) => void
}

export default function GradientEditor({ config, onChange }: GradientEditorProps) {
  const { t } = useTranslation()

  const updateStop = useCallback((index: number, field: keyof ColorStop, value: string | number) => {
    const stops = [...config.stops]
    stops[index] = { ...stops[index], [field]: value }
    onChange({ ...config, stops })
  }, [config, onChange])

  const addStop = useCallback(() => {
    if (config.stops.length >= 8) return
    const lastPos = config.stops[config.stops.length - 1]?.position ?? 0.5
    const newPos = Math.min(1, lastPos + 0.2)
    const stops = [...config.stops, { color: '#ffffff', position: Math.round(newPos * 100) / 100 }]
    onChange({ ...config, stops })
  }, [config, onChange])

  const removeStop = useCallback((index: number) => {
    if (config.stops.length <= 2) return
    const stops = config.stops.filter((_, i) => i !== index)
    onChange({ ...config, stops })
  }, [config, onChange])

  const setMode = useCallback((mode: GradientConfig['mode']) => {
    onChange({ ...config, mode })
  }, [config, onChange])

  const gradientCSS = config.stops
    .sort((a, b) => a.position - b.position)
    .map(s => `${s.color} ${(s.position * 100).toFixed(0)}%`)
    .join(', ')

  return (
    <div className="gradient-editor">
      <div className="gradient-preview" style={{ background: `linear-gradient(to right, ${gradientCSS})` }} />

      {config.stops.map((stop, i) => (
        <div key={i} className="gradient-stop-row">
          <input
            type="color"
            className="param-color-input gradient-stop-color"
            value={stop.color}
            onChange={(e) => updateStop(i, 'color', e.target.value)}
          />
          <input
            type="range"
            className="param-slider"
            min={0} max={1} step={0.01}
            value={stop.position}
            onInput={(e) => updateStop(i, 'position', parseFloat((e.target as HTMLInputElement).value))}
          />
          <span className="param-value">{Math.round(stop.position * 100)}%</span>
          {config.stops.length > 2 && (
            <button className="gradient-stop-remove" onClick={() => removeStop(i)}>x</button>
          )}
        </div>
      ))}

      {config.stops.length < 8 && (
        <button className="action-btn" style={{ marginTop: 4, width: '100%' }} onClick={addStop}>
          {t('app3d.addColorStop')}
        </button>
      )}

      <div className="gradient-modes">
        {(['height', 'radial', 'random'] as const).map(mode => (
          <button
            key={mode}
            className={`preset-btn ${config.mode === mode ? 'active' : ''}`}
            onClick={() => setMode(mode)}
          >
            {t(`app3d.gradientMode.${mode}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
