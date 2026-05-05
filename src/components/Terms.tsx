import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

const sections = ['acceptance', 'license', 'userContent', 'limitations', 'disclaimer', 'governingLaw', 'changes', 'contact'] as const

export default function Terms() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('terms.title')}` }, [t])

  return (
    <InfoPage titleKey="terms.title">
      <p className="info-updated">{t('terms.lastUpdated')}</p>
      {sections.map((key) => (
        <section key={key}>
          <h2>{t(`terms.${key}Title`)}</h2>
          <p>{t(`terms.${key}Body`)}</p>
        </section>
      ))}
    </InfoPage>
  )
}
