import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="footer">
      <div className="footer-links">
        <Link to="/about" className="footer-link">{t('footer.about')}</Link>
        <Link to="/privacy" className="footer-link">{t('footer.privacy')}</Link>
        <Link to="/terms" className="footer-link">{t('footer.terms')}</Link>
        <Link to="/help" className="footer-link">{t('footer.help')}</Link>
      </div>
      <p className="footer-copyright">{t('footer.copyright')}</p>
    </footer>
  )
}
