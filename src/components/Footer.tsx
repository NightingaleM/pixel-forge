import LangLink from './LangLink'
import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="footer">
      <div className="footer-links">
        <LangLink to="/about" className="footer-link">{t('footer.about')}</LangLink>
        <LangLink to="/privacy" className="footer-link">{t('footer.privacy')}</LangLink>
        <LangLink to="/terms" className="footer-link">{t('footer.terms')}</LangLink>
        <LangLink to="/help" className="footer-link">{t('footer.help')}</LangLink>
        <LangLink to="/license" className="footer-link">{t('footer.license')}</LangLink>
      </div>
      <p className="footer-copyright">{t('footer.copyright')}</p>
    </footer>
  )
}
