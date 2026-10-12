import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { snapToStep } from '../lib/paramValue'
import type { ParamDef } from '../types'

interface ParamPanelProps {
  /** 桌面外壳标题；embedded 模式下由宿主(BottomSheet)承担，可不传 */
  title?: string
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
  storageKey?: string
  children?: ReactNode
  top?: ReactNode
  defaultCollapsed?: boolean
  /** sheet 内嵌模式：不渲染 .param-panel 拖拽定位壳/关闭钮/折叠头，填满父容器(宽 100%)。
   *  标题/描述/随机由宿主(BottomSheet + m-params-actions)承担；参数控件本体两模式共用。 */
  embedded?: boolean
}

function formatValue(value: number, step?: number): string {
  if (Number.isInteger(value) && Number.isInteger(step)) return value.toString()
  const precision = step ? Math.max(0, Math.ceil(-Math.log10(step))) : 2
  return value.toFixed(precision)
}

/** 参数名 + 可选「?」描述 tooltip。preventDefault 防止在 label 内（toggle 分支）点击图标触发勾选。
 *  tooltip 经 portal 挂 body + fixed 定位：浮层若留在 .param-panel-body(overflow 滚动容器)内，
 *  固定 224px 宽锚行内图标会使右缘恒溢出内容宽——横向滚动条 + 超出部分被裁且滚不过去。 */
function ParamLabel({ name, description }: { name: string; description?: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  /** 非 null 即显示；值为 tooltip 左缘视口坐标 */
  const [tipLeft, setTipLeft] = useState<number | null>(null)

  const showTip = () => {
    const icon = wrapRef.current?.getBoundingClientRect()
    if (!icon) return
    const width = Math.min(224, window.innerWidth - 16)
    setTipLeft(Math.min(Math.max(8, icon.left + icon.width / 2 - width / 2), window.innerWidth - width - 8))
  }

  // 垂直摆位直接同步到 portal 节点(paint 前,无闪烁):上方放得下贴上方,否则翻到图标下方。
  // 只动 DOM 不进 state,避免 setState-in-effect 级联渲染。
  useLayoutEffect(() => {
    if (tipLeft == null || !tipRef.current || !wrapRef.current) return
    const el = tipRef.current
    const icon = wrapRef.current.getBoundingClientRect()
    const h = el.offsetHeight
    const above = icon.top - 6 - h >= 8
    el.style.top = `${above ? icon.top - 6 - h : icon.bottom + 6}px`
    el.dataset.placed = 'true'
  }, [tipLeft])

  // 滚动/resize 后图标已移位，直接关闭（capture 捕获 overflow 容器不冒泡的 scroll）
  useEffect(() => {
    if (tipLeft == null) return
    const close = () => setTipLeft(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [tipLeft])

  return (
    <span className="param-label">
      {name}
      {description && (
        <span
          ref={wrapRef}
          className="param-tooltip-wrap"
          onMouseEnter={showTip}
          onMouseLeave={() => setTipLeft(null)}
          onClick={(e) => e.preventDefault()}
        >
          <span className="param-tooltip-icon">?</span>
          {tipLeft != null && createPortal(
            <span
              ref={tipRef}
              className="param-tooltip-text"
              style={{ left: tipLeft }}
              data-placed="false"
            >
              {description}
            </span>,
            document.body,
          )}
        </span>
      )}
    </span>
  )
}

/** 数字滑条数值标签：点击后内联编辑，Enter/失焦提交（clamp + step 对齐），Esc 取消。 */
function ParamValueInput({ value, min, max, step, name, onCommit }: {
  value: number
  min: number
  max: number
  step: number
  name: string
  onCommit: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const display = formatValue(value, step)

  // 进入编辑态时聚焦并全选。用 effect（依赖 [editing]）而非 inline ref：
  // inline ref 每次渲染都会重挂，导致每敲一键就全选、下一个字符覆盖全部输入。
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  if (!editing) {
    return (
      <span
        className="param-value param-value-editable"
        onClick={() => {
          setDraft(display)
          setEditing(true)
        }}
      >
        {display}
      </span>
    )
  }

  const commit = () => {
    setEditing(false)
    const v = parseFloat(draft)
    if (Number.isNaN(v)) return
    onCommit(snapToStep(v, min, max, step, value))
  }

  return (
    <input
      ref={inputRef}
      className="param-value-input"
      type="text"
      inputMode="decimal"
      aria-label={name}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return  // 输入法组合中的 Enter 不提交
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
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
          <ParamLabel name={param.name} description={param.description} />
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
          <ParamLabel name={param.name} description={param.description} />
        </label>
      </div>
    )
  }

  if (param.type === 'color') {
    return (
      <div key={param.uniform} className="param-row">
        <div className="param-header">
          <ParamLabel name={param.name} description={param.description} />
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
          <ParamLabel name={param.name} description={param.description} />
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
          <ParamLabel name={param.name} description={param.description} />
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
        <ParamLabel name={param.name} description={param.description} />
        <ParamValueInput
          value={values[param.uniform] ?? param.default}
          min={param.min}
          max={param.max}
          step={param.step}
          name={param.name}
          onCommit={(v) => onChange(param.uniform, v)}
        />
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

function ParamPanel({ title, description, params, values, textValues, onChange, onTextChange, fontValues, onFontChange, onRandom, onClose, defaultPos, storageKey, children, top, defaultCollapsed, embedded }: ParamPanelProps) {
  const { t } = useTranslation()
  // embedded 下禁用拖拽(hook 恒调以满足规则，enabled=false 不绑事件不定位)
  const { ref: panelRef, pos, onHeaderMouseDown } = useDraggable(defaultPos, storageKey, { enabled: !embedded })
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

  // 参数控件本体：embedded 与桌面两外壳共用同一 JSX 块（不复制渲染代码）。
  // visibleWhen 条件显隐只作用于渲染:隐藏参数的值仍保留在 values/种子码中
  const controls = children ?? params?.filter((p) => !p.visibleWhen || p.visibleWhen(values ?? {})).map((p) => renderParam(
    p,
    values ?? {},
    textValues ?? {},
    onChange ?? (() => {}),
    onTextChange ?? (() => {}),
    onFontChange ?? (() => {}),
    fontValues ?? {},
  ))

  if (embedded) {
    return (
      <div className="param-panel-embedded">
        {top}
        {controls}
      </div>
    )
  }

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
          {controls}
        </div>
      )}
    </div>
  )
}

export default ParamPanel
