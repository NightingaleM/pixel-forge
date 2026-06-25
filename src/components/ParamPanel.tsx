import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { ParamDef } from '../types'

interface ParamPanelProps {
  title: string
  description?: string
  params?: ParamDef[]
  values?: Record<string, number>
  textValues?: Record<string, string>
  onChange?: (uniform: string, value: number) => void
  onTextChange?: (uniform: string, value: string) => void
  fontValues?: Record<string, FontFace | null | undefined>
  onFontChange?: (uniform: string, font: FontFace | null) => void
  onClose?: () => void
  defaultPos?: { x: number; y: number }
  children?: ReactNode
  top?: ReactNode
  defaultCollapsed?: boolean
}

function formatValue(value: number, step?: number): string {
  if (Number.isInteger(value) && Number.isInteger(step)) return value.toString()
  const precision = step ? Math.max(0, Math.ceil(-Math.log10(step))) : 2
  return value.toFixed(precision)
}

function renderParam(
  param: ParamDef,
  values: Record<string, number>,
  textValues: Record<string, string>,
  onChange: (u: string, v: number) => void,
  onTextChange: (u: string, v: string) => void,
  onFontChange: (u: string, f: FontFace | null) => void,
  fontValues: Record<string, FontFace | null | undefined>,
) {
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

  if (param.type === 'font') {
    const current = fontValues[param.uniform]
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) {
        onFontChange(param.uniform, null)
        return
      }
      file.arrayBuffer().then((buf) => {
        const family = file.name.replace(/\.[^.]+$/, '')
        const face = new FontFace(family, buf)
        face.load().then(() => {
          document.fonts.add(face)
          onFontChange(param.uniform, face)
        }).catch(() => onFontChange(param.uniform, null))
      })
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
        </div>
        <label className="param-font-upload">
          <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFile} />
          <span className="param-font-name">{current ? current.family : ''}</span>
        </label>
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
        <span className="param-value">{formatValue(values[param.uniform] ?? param.default, param.step)}</span>
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
}

function ParamPanel({ title, description, params, values, textValues, onChange, onTextChange, fontValues, onFontChange, onClose, defaultPos, children, top, defaultCollapsed }: ParamPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(defaultPos ?? { x: typeof window !== 'undefined' ? window.innerWidth - 320 : 600, y: 35 })
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)
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
          <div className="param-panel-actions">
            <button className="param-panel-collapse" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? '▸' : '▾'}
            </button>
            {onClose && (
              <button className="param-panel-close" onClick={onClose}>x</button>
            )}
          </div>
        </div>
        {description && <div className="param-panel-desc">{description}</div>}
      </div>
      {!collapsed && (
        <div className="param-panel-body">
          {top}
          {children ?? params?.map((p) => renderParam(
            p,
            values ?? {},
            textValues ?? {},
            onChange ?? (() => {}),
            onTextChange ?? (() => {}),
            onFontChange ?? (() => {}),
            fontValues ?? {},
          ))}
        </div>
      )}
    </div>
  )
}

export default ParamPanel
