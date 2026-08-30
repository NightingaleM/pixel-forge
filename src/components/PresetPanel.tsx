import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { getStyle } from '../lib/StyleRegistry'
import type { PresetEntry } from '../lib/presetStore'

interface PresetPanelProps {
  presets: PresetEntry[]
  onApply: (entry: PresetEntry) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

/** 已保存配置的浮动列表窗：可拖动/折叠/关闭；点条目应用，垃圾桶删除。 */
export default function PresetPanel({ presets, onApply, onDelete, onClose }: PresetPanelProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const { ref, pos, onHeaderMouseDown } = useDraggable(
    { x: Math.max(20, window.innerWidth - 620), y: Math.max(120, window.innerHeight - 460) },
  )

  return (
    <div className="preset-panel" ref={ref} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('preset.list')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-collapse" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? '▸' : '▾'}
            </button>
            <button className="param-panel-close" onClick={onClose}>x</button>
          </div>
        </div>
      </div>
      {!collapsed && (
        <div className="preset-panel-body">
          {presets.length === 0 && <div className="preset-panel-empty">{t('preset.empty')}</div>}
          {presets.map((e) => (
            <div key={e.id} className="preset-item" onClick={() => onApply(e)} title={t('preset.apply')}>
              <div className="preset-item-info">
                <div className="preset-item-name">{e.name}</div>
                <div className="preset-item-sub">
                  {t(getStyle(e.styleId)?.label ?? e.styleId)} · {formatTime(e.createdAt)}
                </div>
              </div>
              <button
                className="preset-item-delete"
                title={t('preset.delete')}
                aria-label={t('preset.delete')}
                onClick={(ev) => { ev.stopPropagation(); onDelete(e.id) }}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
