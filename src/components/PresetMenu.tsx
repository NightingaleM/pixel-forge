// src/components/PresetMenu.tsx
// 种子/配置下拉菜单(v3):数据源复用 localStorage 预设系统(presetStore),
// 点击=应用该配置(与 PresetPanel 点条目完全同语义,含切风格/整批基线双写),
// 应用后关闭;不含删除——管理仍在 PresetPanel(单一职责)。锚定入口按钮绝对
// 定位,点击外部/Esc 关闭。锚按钮(data-preset-anchor)不算外部——menu 开着
// 时点锚走 click toggle 收起,否则 mousedown 先关+click 重开导致永远关不掉。
// SeedBar 与 BatchPanel 行列表头两处复用。
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getStyle } from '../lib/StyleRegistry'
import type { PresetEntry } from '../lib/presetStore'

interface PresetMenuProps {
  presets: PresetEntry[]
  onApply: (entry: PresetEntry) => void
  onClose: () => void
}

/** 菜单入口图标(三横线列表),SeedBar 与 BatchPanel 行列表头共用(禁 emoji) */
// eslint-disable-next-line react-refresh/only-export-components -- 图标常量与组件同文件导出供两入口共用,无状态,hmr 重建无副作用
export const presetListIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
)

export default function PresetMenu({ presets, onApply, onClose }: PresetMenuProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current && !ref.current.contains(t) && !t.closest('[data-preset-anchor]')) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="preset-menu" ref={ref}>
      {presets.length === 0 && <div className="preset-menu-empty">{t('preset.menuEmpty')}</div>}
      {presets.map((e) => (
        <button key={e.id} className="preset-menu-item" onClick={() => onApply(e)}>
          <span className="preset-menu-name">{e.name}</span>
          <span className="preset-menu-style">{t(getStyle(e.styleId)?.label ?? e.styleId)}</span>
        </button>
      ))}
    </div>
  )
}
