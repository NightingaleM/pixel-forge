import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('notFound.message')}` }, [t])

  return (
    <div className="not-found-page">
      <h1 className="not-found-code">{t('notFound.title')}</h1>
      <p className="not-found-msg">{t('notFound.message')}</p>
      <Link to="/" className="not-found-btn">← {t('common.backToHome')}</Link>
    </div>
  )
}
