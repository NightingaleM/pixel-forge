import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Footer from './Footer'

export default function Home() {
  const { t } = useTranslation()

  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">PixelForge</h1>
        <p className="home-subtitle">{t('home.subtitle')}</p>

        <div className="home-links">
          <Link to="/2d" className="home-link">
            <div className="home-link-card">
              <div className="home-link-icon">🎨</div>
              <div className="home-link-title">{t('home.style2d')}</div>
              <div className="home-link-desc">{t('home.style2dDesc')}</div>
            </div>
          </Link>

          <Link to="/3d" className="home-link">
            <div className="home-link-card">
              <div className="home-link-icon">🎭</div>
              <div className="home-link-title">{t('home.style3d')}</div>
              <div className="home-link-desc">{t('home.style3dDesc')}</div>
            </div>
          </Link>
        </div>

      </div>

      <Footer />
    </div>
  )
}
