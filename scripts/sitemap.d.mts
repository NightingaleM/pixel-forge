/** 语言内页面路径 → 带 /{lang} 前缀的站点路径（根带尾斜杠；与 pageMeta.langUrlPath 同规则，单测锁定一致） */
export declare function langUrlPath(lang: string, route: string): string

/** 生成多语言 sitemap XML（每 URL 含每语言 alternate + x-default→站点根） */
export declare function buildSitemap(opts: {
  siteUrl: string
  langs: string[]
  routes: string[]
}): string
