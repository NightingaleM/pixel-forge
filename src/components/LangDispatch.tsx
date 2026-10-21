import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LANGS, LANG_META, matchNavigatorLang, DEFAULT_LANG } from '../i18n/langs'

/**
 * 根路径语言分发（dev 环境）：按 localStorage→navigator 协商跳转，
 * 未命中兜底 zh；同时渲染语言链接列表供 JS 失效/爬虫识别。
 * 生产环境此路由不会运行——prerender 产出零依赖静态 stub 覆盖 dist/index.html。
 */
export default function LangDispatch() {
  const navigate = useNavigate()

  useEffect(() => {
    const target = matchNavigatorLang() ?? DEFAULT_LANG
    navigate(`/${target}/`, { replace: true })
  }, [navigate])

  return (
    <div className="lang-dispatch">
      <h1 className="lang-dispatch-title">PixelForge</h1>
      <ul className="lang-dispatch-list">
        {LANGS.map((l) => (
          <li key={l}>
            <a href={`/${l}/`} lang={LANG_META[l].htmlLang}>
              {LANG_META[l].label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
