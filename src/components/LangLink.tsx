import { Link, useLocation, type LinkProps } from 'react-router-dom'
import { parseLangPath, DEFAULT_LANG } from '../i18n/langs'

/**
 * 语言感知内链：自动带当前语言前缀。`to` 传语言内路径（'/2d'、'/about'、'/'），
 * 无前缀上下文（理论仅旧路径直达的 404 边缘）回退默认语言。
 */
export default function LangLink({ to, ...rest }: LinkProps) {
  const { lang } = parseLangPath(useLocation().pathname)
  const base = `/${lang ?? DEFAULT_LANG}`
  const target = to === '/' ? `${base}/` : `${base}${to}`
  return <Link to={target} {...rest} />
}
