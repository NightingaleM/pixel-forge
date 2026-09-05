import type { TFunction } from 'i18next'

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
]

/** 尾斜杠归一化后精确匹配；未知路径回退 notFound（预渲染脚本的路由清单须与 PAGE_METAS 保持一致） */
export function resolvePageMeta(pathname: string): PageMeta {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return PAGE_METAS.find((m) => m.path === normalized) ?? NOT_FOUND_META
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * 按路由集中应用页面 meta：title / description / og / twitter / canonical。
 * 404 页设 robots noindex 并跳过 canonical（无索引价值的页面不声明规范地址）。
 * 语言切换时由调用方以新 t 重入。
 */
export function applyPageMeta(pathname: string, t: TFunction): void {
  const meta = resolvePageMeta(pathname)
  const title = t(meta.titleKey)
  document.title = title

  if (meta.noindex) {
    upsertMeta('name', 'robots', 'noindex')
    return
  }
  document.head.querySelector('meta[name="robots"]')?.remove()

  if (meta.descKey) {
    const desc = t(meta.descKey)
    upsertMeta('name', 'description', desc)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('name', 'twitter:description', desc)
  }

  upsertMeta('property', 'og:title', title)
  upsertMeta('name', 'twitter:title', title)

  const url = SITE_URL + (meta.path === '/' ? '/' : meta.path)
  upsertMeta('property', 'og:url', url)

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', url)
}
