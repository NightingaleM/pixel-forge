import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LANGS, LANG_META, parseLangPath, DEFAULT_LANG, LANG_STORAGE_KEY, type Lang } from '../i18n/langs'
import { loadLanguage } from '../i18n'

/** 内联 SVG 地球图标（UI 铁律：禁 emoji，图标手绘 SVG） */
function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.6 9h16.8" />
      <path d="M3.6 15h16.8" />
    </svg>
  )
}

/** 语言切换器：当前语言由 URL 前缀决定（事实来源），切换 = 载字典 + 改 URL + 记 localStorage */
export default function LangSwitch() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // 根分发页自身即语言入口，不显示切换器（hooks 全部调用后再提前返回，保持 hooks 顺序）
  if (location.pathname === '/') return null

  const { lang, rest } = parseLangPath(location.pathname)
  const current: Lang = lang ?? DEFAULT_LANG

  async function pick(next: Lang) {
    setOpen(false)
    if (next === current) return
    try {
      await loadLanguage(next)
    } catch {
      return // 字典加载失败保持现状，URL 不动
    }
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      /* 隐私模式等存储不可用：仅本次会话生效 */
    }
    const target = rest === '/' ? `/${next}/` : `/${next}${rest}`
    navigate(target)
  }

  return (
    <div className="lang-switch" ref={rootRef}>
      <button
        type="button"
        className="lang-switch-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GlobeIcon />
        <span>{LANG_META[current].short}</span>
      </button>
      {open && (
        <ul className="lang-menu" role="listbox">
          {LANGS.map((l) => (
            <li key={l}>
              <button
                type="button"
                role="option"
                aria-selected={l === current}
                className={l === current ? 'lang-option current' : 'lang-option'}
                onClick={() => void pick(l)}
                lang={LANG_META[l].htmlLang}
              >
                {LANG_META[l].label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
