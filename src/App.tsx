import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import LangSwitch from './components/LangSwitch'
import { applyPageMeta } from './lib/pageMeta'

const Home = lazy(() => import('./components/Home'))
const App2D = lazy(() => import('./components/App2D'))
const App3D = lazy(() => import('./components/App3D'))
const About = lazy(() => import('./components/About'))
const Privacy = lazy(() => import('./components/Privacy'))
const Terms = lazy(() => import('./components/Terms'))
const Help = lazy(() => import('./components/Help'))
const NotFound = lazy(() => import('./components/NotFound'))

/** Router 上下文内的 meta 管理器：按路由应用 title/og/canonical，语言切换时重应用 */
function PageMetaApplier() {
  const { t, i18n } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    applyPageMeta(location.pathname, t)
    document.documentElement.lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  }, [location.pathname, t, i18n.language])

  return null
}

export default function App() {

  // Global wheel handler for all param sliders — adjust by step per tick
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const el = e.target as HTMLInputElement
      if (el.type !== 'range' || !el.classList.contains('param-slider')) return
      e.preventDefault()
      const step = parseFloat(el.step) || 1
      const delta = e.deltaY < 0 ? step : -step
      const next = Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), parseFloat(el.value) + delta))
      // Round to step precision to avoid floating-point drift
      el.value = (Math.round(next / step) * step).toString()
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  return (
    <BrowserRouter>
      <PageMetaApplier />
      <LangSwitch />
      <Suspense fallback={<div className="loading">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/2d" element={<App2D />} />
          <Route path="/3d" element={<App3D />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
