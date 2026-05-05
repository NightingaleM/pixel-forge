import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

const sections = ['collect', 'usage', 'cookies', 'thirdParty', 'security', 'rights', 'changes', 'contact'] as const

export default function Privacy() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('privacy.title')}` }, [t])

  return (
    <InfoPage titleKey="privacy.title">
      <p className="info-updated">{t('privacy.lastUpdated')}</p>
      {sections.map((key) => (
        <section key={key}>
          <h2>{t(`privacy.${key}Title`)}</h2>
          <p>{t(`privacy.${key}Body`)}</p>
        </section>
      ))}
    </InfoPage>
  )
}
