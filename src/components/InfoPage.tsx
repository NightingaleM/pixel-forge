import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

interface Props {
  titleKey: string
  children: ReactNode
}

export default function InfoPage({ titleKey, children }: Props) {
  const { t } = useTranslation()

  return (
    <div className="info-page">
      <div className="info-card">
        <Link to="/" className="info-back-link">← {t('common.backToHome')}</Link>
        <h1 className="info-title">{t(titleKey)}</h1>
        <div className="info-accent" />
        <div className="info-content">{children}</div>
      </div>
    </div>
  )
}
