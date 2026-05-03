import { useTranslation } from 'react-i18next'

export default function LangSwitch() {
  const { i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  return (
    <button
      className="lang-switch"
      onClick={() => i18n.changeLanguage(isZh ? 'en' : 'zh')}
    >
      {isZh ? 'EN' : '中'}
    </button>
  )
}
