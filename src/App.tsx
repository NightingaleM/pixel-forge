import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import LangSwitch from './components/LangSwitch'

const Home = lazy(() => import('./components/Home'))
const App2D = lazy(() => import('./components/App2D'))
const App3D = lazy(() => import('./components/App3D'))

export default function App() {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    document.title = `PixelForge - ${t('home.subtitle')}`
    document.documentElement.lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  }, [t, i18n.language])

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
      <LangSwitch />
      <Suspense fallback={<div className="loading">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/2d" element={<App2D />} />
          <Route path="/3d" element={<App3D />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
