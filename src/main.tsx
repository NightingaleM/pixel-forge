import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/mobile.css'
import { loadLanguage } from './i18n'
import { parseLangPath, DEFAULT_LANG } from './i18n/langs'
import App from './App'

// URL 前缀是语言事实来源（规格 D8）：先解析初始语言并载入字典，就绪后再渲染首帧，
// 保证首帧即目标语言（预渲染快照同理）。目标字典加载失败兜底 zh。
const initialLang = parseLangPath(window.location.pathname).lang ?? DEFAULT_LANG

loadLanguage(initialLang)
  .catch(() => loadLanguage(DEFAULT_LANG))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
