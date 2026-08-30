import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
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
  onRandom?: () => void
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

function ParamPanel({ title, description, params, values, textValues, onChange, onTextChange, fontValues, onFontChange, onRandom, onClose, defaultPos, children, top, defaultCollapsed }: ParamPanelProps) {
  const { t } = useTranslation()
  const { ref: panelRef, pos, onHeaderMouseDown } = useDraggable(defaultPos)
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

  return (
    <div className="param-panel" ref={panelRef} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{title}</div>
          <div className="param-panel-actions">
            {onRandom && (
              <button
                className="param-panel-random"
                onClick={onRandom}
                title={t('common.random')}
                aria-label={t('common.random')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
                  <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
                  <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
                  <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
                </svg>
              </button>
            )}
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
