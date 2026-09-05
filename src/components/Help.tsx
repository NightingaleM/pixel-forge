import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

export default function Help() {
  const { t } = useTranslation()

  return (
    <InfoPage titleKey="help.title">
      <section>
        <h2>{t('help.style2dTitle')}</h2>
        <p className="info-steps">{t('help.style2dSteps')}</p>
      </section>

      <section>
        <h2>{t('help.style3dTitle')}</h2>
        <p className="info-steps">{t('help.style3dSteps')}</p>
      </section>

      <section>
        <h2>{t('help.tipsTitle')}</h2>
        <ul>
          <li>{t('help.tipsBrowser')}</li>
          <li>{t('help.tipsFormats')}</li>
          <li>{t('help.tipsPerformance')}</li>
        </ul>
      </section>
    </InfoPage>
  )
}
