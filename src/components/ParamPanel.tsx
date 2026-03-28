import type { ParamDef } from '../types'

interface ParamPanelProps {
  styleLabel: string
  styleDescription: string
  params: ParamDef[]
  values: Record<string, number>
  textValues: Record<string, string>
  onChange: (uniform: string, value: number) => void
  onTextChange: (uniform: string, value: string) => void
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function ParamPanel({ styleLabel, styleDescription, params, values, textValues, onChange, onTextChange }: ParamPanelProps) {
  return (
    <div className="param-panel">
      <div className="param-panel-header">
        <div className="param-panel-title">{styleLabel}</div>
        <div className="param-panel-desc">{styleDescription}</div>
      </div>
      {params.map((param) => {
        if (param.type === 'text') {
          return (
            <div key={param.uniform} className="param-row">
              <div className="param-header">
                <span className="param-label">
                  {param.name}
                  {param.description && (
                    <span className="param-tooltip-wrap">
                      <span className="param-tooltip-icon">?</span>
                      <span className="param-tooltip-text">{param.description}</span>
                    </span>
                  )}
                </span>
              </div>
              <input
                type="text"
                className="param-text-input"
                value={textValues[param.uniform] ?? param.textDefault}
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  onTextChange(param.uniform, (e.target as HTMLInputElement).value)
                }}
              />
            </div>
          )
        }

        return (
          <div key={param.uniform} className="param-row">
            <div className="param-header">
              <span className="param-label">
                {param.name}
                {param.description && (
                  <span className="param-tooltip-wrap">
                    <span className="param-tooltip-icon">?</span>
                    <span className="param-tooltip-text">{param.description}</span>
                  </span>
                )}
              </span>
              <span className="param-value">{formatValue(values[param.uniform] ?? param.default)}</span>
            </div>
            <input
              type="range"
              className="param-slider"
              min={param.min}
              max={param.max}
              step={param.step}
              value={values[param.uniform] ?? param.default}
              onInput={(e: React.FormEvent<HTMLInputElement>) => {
                onChange(param.uniform, parseFloat((e.target as HTMLInputElement).value))
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default ParamPanel
