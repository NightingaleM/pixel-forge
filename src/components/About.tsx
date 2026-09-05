import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

export default function About() {
  const { t } = useTranslation()

  return (
    <InfoPage titleKey="about.title">
      <p>{t('about.description')}</p>

      <h2>{t('about.featuresTitle')}</h2>
      <p>{t('about.feature2d')}</p>
      <p>{t('about.feature3d')}</p>

      <h2>{t('about.techTitle')}</h2>
      <p>{t('about.techStack')}</p>

      <h2>{t('about.contactTitle')}</h2>
      <p>{t('about.contactEmail')}</p>
    </InfoPage>
  )
}
