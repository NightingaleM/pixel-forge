import { useRef, useState, useCallback, useEffect } from 'react'
import type { ParamDef } from '../types'

interface ParamPanelProps {
  title: string
  description: string
  params: ParamDef[]
  values: Record<string, number>
  textValues: Record<string, string>
  onChange: (uniform: string, value: number) => void
  onTextChange: (uniform: string, value: string) => void
  onClose?: () => void
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function ParamPanel({ title, description, params, values, textValues, onChange, onTextChange, onClose }: ParamPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 16, y: 60 })
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.param-panel-body')) return
    dragging.current = true
    const rect = panelRef.current!.getBoundingClientRect()
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offset.current.y))
      setPos({ x, y })
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <div className="param-panel" ref={panelRef} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{title}</div>
          {onClose && (
            <button className="param-panel-close" onClick={onClose}>x</button>
          )}
        </div>
        <div className="param-panel-desc">{description}</div>
      </div>
      <div className="param-panel-body">
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

        if (param.type === 'toggle') {
          return (
            <div key={param.uniform} className="param-row">
              <label className="param-toggle">
                <input
                  type="checkbox"
                  checked={(values[param.uniform] ?? param.default) === 1}
                  onChange={(e) => onChange(param.uniform, e.target.checked ? 1 : 0)}
                />
                <span className="param-label">{param.name}</span>
              </label>
            </div>
          )
        }

        if (param.type === 'color') {
          return (
            <div key={param.uniform} className="param-row">
              <div className="param-header">
                <span className="param-label">{param.name}</span>
              </div>
              <input
                type="color"
                className="param-color-input"
                value={textValues[param.uniform] ?? param.default}
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  onTextChange(param.uniform, (e.target as HTMLInputElement).value)
                }}
              />
            </div>
          )
        }

        if (param.type === 'select') {
          return (
            <div key={param.uniform} className="param-row">
              <div className="param-header">
                <span className="param-label">{param.name}</span>
              </div>
              <select
                className="param-select"
                value={values[param.uniform] ?? param.default}
                onChange={(e) => onChange(param.uniform, parseFloat(e.target.value))}
              >
                {param.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )
        }

        // Default: number slider
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
    </div>
  )
}

export default ParamPanel
