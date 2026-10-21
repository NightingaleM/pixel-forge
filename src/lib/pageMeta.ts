import type { TFunction } from 'i18next'
import { LANGS, LANG_META, parseLangPath, DEFAULT_LANG, type Lang } from '../i18n/langs'

/** 站点绝对地址，与 index.html canonical 保持一致（单测锁定） */
export const SITE_URL = 'https://pixelforge.oylz.site'

export interface PageMeta {
  path: string
  titleKey: string
  descKey?: string
  noindex: boolean
}

export const NOT_FOUND_META: PageMeta = {
  path: '*',
  titleKey: 'meta.notFound.title',
  // 404 无独立 description，保留 index.html 默认值；noindex 使其不进索引
  noindex: true,
}

export const PAGE_METAS: readonly PageMeta[] = [
  { path: '/', titleKey: 'meta.home.title', descKey: 'meta.home.desc', noindex: false },
  { path: '/2d', titleKey: 'meta.p2d.title', descKey: 'meta.p2d.desc', noindex: false },
  { path: '/3d', titleKey: 'meta.p3d.title', descKey: 'meta.p3d.desc', noindex: false },
  { path: '/about', titleKey: 'meta.about.title', descKey: 'meta.about.desc', noindex: false },
  { path: '/privacy', titleKey: 'meta.privacy.title', descKey: 'meta.privacy.desc', noindex: false },
  { path: '/terms', titleKey: 'meta.terms.title', descKey: 'meta.terms.desc', noindex: false },
  { path: '/help', titleKey: 'meta.help.title', descKey: 'meta.help.desc', noindex: false },
  { path: '/license', titleKey: 'meta.license.title', descKey: 'meta.license.desc', noindex: false },
]

/** 根分发页（无前缀 `/`，prod 为 prerender 生成的静态 stub）：不进索引 */
const ROOT_DISPATCH_META: PageMeta = {
  path: '/',
  titleKey: 'meta.dispatch.title',
  noindex: true,
}

/** 语言内页面路径 → 带 /{lang} 前缀的站点路径（根带尾斜杠）。sitemap/脚本侧同规则实现由单测锁定一致。 */
export function langUrlPath(lang: Lang, pagePath: string): string {
  return pagePath === '/' ? `/${lang}/` : `/${lang}${pagePath}`
}

/**
 * 尾斜杠归一化 + 语言前缀剥离后精确匹配；未知路径回退 notFound
 * （prerender 脚本的路由清单须与 PAGE_METAS 保持一致）。
 * '/ja/2d' 与 '/2d' 解析到同一条 meta；'/fr/2d'（非法前缀）整段保留 → notFound。
 */
export function resolvePageMeta(pathname: string): PageMeta {
  const { rest } = parseLangPath(pathname)
  const normalized = rest.length > 1 && rest.endsWith('/') ? rest.slice(0, -1) : rest
  return PAGE_METAS.find((m) => m.path === normalized) ?? NOT_FOUND_META
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(metaSelector(attr, key))
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function metaSelector(attr: 'name' | 'property', key: string): string {
  return attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`
}

function upsertLinkAlternate(hreflang: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${hreflang}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'alternate')
    el.setAttribute('hreflang', hreflang)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** 语言清单变化后清理悬空的 alternate 声明（noindex 页也全清，避免指向无索引页） */
function pruneAlternates(keep: readonly string[]): void {
  const keepSet = new Set(keep)
  for (const el of document.head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')) {
    if (!keepSet.has(el.getAttribute('hreflang') ?? '')) el.remove()
  }
}

function upsertJsonLd(description: string, url: string): void {
  let el = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')
  if (!el) {
    el = document.createElement('script')
    el.setAttribute('type', 'application/ld+json')
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'PixelForge',
    description,
    url,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    browserRequirements: 'Requires a WebGL-capable browser',
  })
}

/**
 * 按路由集中应用页面 meta：title / description / og / twitter / canonical /
 * hreflang 集群（每语言一条 + x-default→根分发页）/ og:locale / JSON-LD / <html lang>。
 * 404 与根分发页设 robots noindex 并跳过 canonical（无索引价值的页面不声明规范地址）。
 * 语言切换时由调用方以新 t 重入。
 */
export function applyPageMeta(pathname: string, t: TFunction): void {
  const { lang, rest } = parseLangPath(pathname)
  const effective: Lang = lang ?? DEFAULT_LANG
  const isDispatch = lang === null && rest === '/'
  const meta = isDispatch ? ROOT_DISPATCH_META : resolvePageMeta(rest)

  document.documentElement.lang = LANG_META[isDispatch ? DEFAULT_LANG : effective].htmlLang
  document.title = t(meta.titleKey)

  if (meta.noindex) {
    upsertMeta('name', 'robots', 'noindex')
    pruneAlternates([])
    return
  }
  document.head.querySelector('meta[name="robots"]')?.remove()

  const desc = meta.descKey ? t(meta.descKey) : undefined
  if (desc) {
    upsertMeta('name', 'description', desc)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('name', 'twitter:description', desc)
  }

  const title = t(meta.titleKey)
  upsertMeta('property', 'og:title', title)
  upsertMeta('name', 'twitter:title', title)

  const url = SITE_URL + langUrlPath(effective, meta.path)
  upsertMeta('property', 'og:url', url)

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', url)

  // hreflang 集群：每语言一条指向对应语言页；x-default 指向根分发页（语言协商入口）
  for (const l of LANGS) {
    upsertLinkAlternate(l, SITE_URL + langUrlPath(l, meta.path))
  }
  upsertLinkAlternate('x-default', `${SITE_URL}/`)
  pruneAlternates([...LANGS, 'x-default'])

  upsertMeta('property', 'og:locale', LANG_META[effective].ogLocale)
  upsertMeta(
    'property',
    'og:locale:alternate',
    LANGS.filter((l) => l !== effective)
      .map((l) => LANG_META[l].ogLocale)
      .join(' '),
  )

  upsertJsonLd(desc ?? '', url)
}
