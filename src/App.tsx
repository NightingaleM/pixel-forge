import { BrowserRouter, Routes, Route, useLocation, useParams, Navigate, Outlet } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import LangSwitch from './components/LangSwitch'
import LangDispatch from './components/LangDispatch'
import { isLang } from './i18n/langs'
import { applyPageMeta } from './lib/pageMeta'

const Home = lazy(() => import('./components/Home'))
const App2D = lazy(() => import('./components/App2D'))
const App3D = lazy(() => import('./components/App3D'))
const About = lazy(() => import('./components/About'))
const Privacy = lazy(() => import('./components/Privacy'))
const Terms = lazy(() => import('./components/Terms'))
const Help = lazy(() => import('./components/Help'))
const LicenseHelp = lazy(() => import('./components/LicenseHelp'))
const NotFound = lazy(() => import('./components/NotFound'))

/** Router 上下文内的 meta 管理器：按路由应用 title/og/canonical/hreflang，语言切换时重应用 */
function PageMetaApplier() {
  const { t } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    applyPageMeta(location.pathname, t)
  }, [location.pathname, t])

  return null
}

/** 语言前缀闸门：非法前缀（/fr/2d）按 404 处理，合法则放行内层路由 */
function LangGate() {
  const { lang } = useParams()
  if (!isLang(lang)) return <NotFound />
  return <Outlet />
}

/** 旧无前缀路径的客户端兜底跳转（生产以 nginx 301 为准，规格 D3）；历史为中文站，固定跳 zh */
function LegacyRedirect({ to }: { to: string }) {
  return <Navigate to={`/zh${to}`} replace />
}

const LEGACY_PATHS = ['/2d', '/3d', '/about', '/privacy', '/terms', '/help', '/license']

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
          {/* 根分发页：dev 环境的协商入口；prod 由 prerender 产出的静态 stub 承担（规格 D2） */}
          <Route path="/" element={<LangDispatch />} />
          <Route path="/:lang" element={<LangGate />}>
            <Route index element={<Home />} />
            <Route path="2d" element={<App2D />} />
            <Route path="3d" element={<App3D />} />
            <Route path="about" element={<About />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="help" element={<Help />} />
            <Route path="license" element={<LicenseHelp />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          {LEGACY_PATHS.map((p) => (
            <Route key={p} path={p} element={<LegacyRedirect to={p} />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
