import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

// 错误对照表:提示文案直接复用浮窗 license.errX(单一事实源,不另抄一份),
// 解释文案在本页 hintX——两处键名后缀一致,漂移即缺键可见
const ERRS = [
  'Format', 'Signature', 'Expired', 'Used',
  'IdentityConflict', 'DeviceExhausted', 'Network', 'RateLimit',
] as const

export default function LicenseHelp() {
  const { t } = useTranslation()

  return (
    <InfoPage titleKey="licenseHelp.title">
      <section>
        <h2>{t('licenseHelp.compareTitle')}</h2>
        <p><strong>{t('licenseHelp.freeTitle')}</strong> — {t('licenseHelp.freeBody')}</p>
        <p><strong>{t('licenseHelp.memberTitle')}</strong> — {t('licenseHelp.memberBody')}</p>
      </section>

      <section>
        <h2>{t('licenseHelp.activateTitle')}</h2>
        <p>{t('licenseHelp.activateBody')}</p>
      </section>

      <section>
        <h2>{t('licenseHelp.renewTitle')}</h2>
        <p>{t('licenseHelp.renewBody')}</p>
      </section>

      <section>
        <h2>{t('licenseHelp.deviceTitle')}</h2>
        <ul>
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>{t(`licenseHelp.device${n}`)}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t('licenseHelp.errTitle')}</h2>
        <ul>
          {ERRS.map((key) => (
            <li key={key}><strong>{t(`license.err${key}`)}</strong> — {t(`licenseHelp.hint${key}`)}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t('licenseHelp.tipsTitle')}</h2>
        <ul>
          {[1, 2, 3].map((n) => (
            <li key={n}>{t(`licenseHelp.tip${n}`)}</li>
          ))}
        </ul>
        <p><Link to="/terms" className="info-back-link">{t('licenseHelp.termsLink')} →</Link></p>
      </section>
    </InfoPage>
  )
}
