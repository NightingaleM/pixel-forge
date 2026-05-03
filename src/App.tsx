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
