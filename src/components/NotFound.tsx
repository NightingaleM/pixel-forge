import LangLink from './LangLink'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="not-found-page">
      <h1 className="not-found-code">{t('notFound.title')}</h1>
      <p className="not-found-msg">{t('notFound.message')}</p>
      <LangLink to="/" className="not-found-btn">← {t('common.backToHome')}</LangLink>
    </div>
  )
}
