// src/components/Lightbox.tsx
import { useEffect, useCallback } from 'react'

export interface LightboxItem {
  objectUrl: string
  fileName: string
  seed: string
  ext: string
}

/** 结果灯箱:全屏遮罩大图,←/→ 导航,Esc 关闭。 */
function Lightbox({ items, index, onClose, onNavigate }: {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const nav = useCallback((d: number) => {
    // 空列表时组件虽返回 null 但仍保持挂载,键盘事件仍会触发,直接忽略避免取模得到 NaN
    if (items.length === 0) return
    onNavigate((index + d + items.length) % items.length)
  }, [index, items.length, onNavigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') nav(-1)
      else if (e.key === 'ArrowRight') nav(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, onClose])

  if (items.length === 0) return null
  const cur = items[Math.min(index, items.length - 1)]

  return (
    <div className="batch-lightbox" onClick={onClose}>
      <button className="batch-lightbox-close" onClick={onClose} aria-label="close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {items.length > 1 && (
        <>
          <button className="batch-lightbox-nav batch-lightbox-nav--prev" onClick={(e) => { e.stopPropagation(); nav(-1) }} aria-label="previous">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button className="batch-lightbox-nav batch-lightbox-nav--next" onClick={(e) => { e.stopPropagation(); nav(1) }} aria-label="next">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </>
      )}
      <div className="batch-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <img src={cur.objectUrl} alt={cur.fileName} />
        <div className="batch-lightbox-info">{cur.fileName} · {cur.seed} · {cur.ext.toUpperCase()}</div>
      </div>
    </div>
  )
}

export default Lightbox
