import { useTranslation } from 'react-i18next'
import type { StyleDefinition, StyleId } from '../types'

interface StyleSelectorProps {
  styles: StyleDefinition[]
  activeId: StyleId
  onSelect: (id: StyleId) => void
}

function StyleSelector({ styles, activeId, onSelect }: StyleSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="style-list">
      {styles.map((style) => (
        <div
          key={style.id}
          className={`style-item${style.id === activeId ? ' active' : ''}`}
          onClick={() => onSelect(style.id)}
        >
          <span className="style-item-label">{t(style.label)}</span>
          <span className="style-item-desc">{t(style.description)}</span>
        </div>
      ))}
    </div>
  )
}

export default StyleSelector
