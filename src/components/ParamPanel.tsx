import type { ParamDef } from '../types'

interface ParamPanelProps {
  params: ParamDef[]
  values: Record<string, number>
  onChange: (uniform: string, value: number) => void
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function ParamPanel({ params, values, onChange }: ParamPanelProps) {
  return (
    <div className="param-panel">
      {params.map((param) => (
        <div key={param.uniform} className="param-row">
          <span className="param-label">{param.name}</span>
          <span className="param-value">{formatValue(values[param.uniform] ?? param.default)}</span>
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
      ))}
    </div>
  )
}

export default ParamPanel
