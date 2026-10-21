// ============================================================
// sitemap 生成器（纯函数，供 prerender.mjs 调用与 vitest 直接 import）
// 规则与 src/lib/pageMeta.ts 的 langUrlPath/hreflang 集群保持一致，
// 一致性由 pageMeta.test.ts 锁定（URL 集 == LANGS × PAGE_METAS，
// 每条 alternate == 每语言 + x-default → 站点根）。
// ============================================================

/** 语言内页面路径 → 带 /{lang} 前缀的站点路径（根带尾斜杠；与 pageMeta.langUrlPath 同规则） */
export function langUrlPath(lang, route) {
  return route === '/' ? `/${lang}/` : `/${lang}${route}`
}

/**
 * 生成多语言 sitemap XML。
 * @param siteUrl 站点绝对地址（无尾斜杠）
 * @param langs 语言清单（如 ['zh','en']）
 * @param routes 语言内路由清单（如 ['/','/2d',...]）
 */
export function buildSitemap({ siteUrl, langs, routes }) {
  const urls = []
  for (const route of routes) {
    for (const lang of langs) {
      const alternates = [
        ...langs.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${siteUrl}${langUrlPath(l, route)}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/"/>`,
      ]
      urls.push([
        '  <url>',
        `    <loc>${siteUrl}${langUrlPath(lang, route)}</loc>`,
        ...alternates,
        '  </url>',
      ].join('\n'))
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}
