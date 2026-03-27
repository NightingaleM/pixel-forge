import type { StyleDefinition, StyleId } from '../types'

interface StyleSelectorProps {
  styles: StyleDefinition[]
  activeId: StyleId
  onSelect: (id: StyleId) => void
}

function StyleSelector({ styles, activeId, onSelect }: StyleSelectorProps) {
  return (
    <div className="style-list">
      {styles.map((style) => (
        <div
          key={style.id}
          className={`style-item${style.id === activeId ? ' active' : ''}`}
          onClick={() => onSelect(style.id)}
        >
          {style.label}
        </div>
      ))}
    </div>
  )
}

export default StyleSelector
