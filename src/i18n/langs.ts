// ============================================================
// 语言清单与 URL 前缀解析（多语言 SEO 架构核心）
// 规格：wayfinder/seo-multilang 规格票 D1/D8 —— URL 前缀是语言
// 的事实来源：/{lang}/{route}；无前缀路径走 nginx 301 或根分发页。
// 新增语种：在 LANGS 与 loaders(src/i18n/index.ts) 各加一行，
// 单测会锁定两处与 src/i18n/*.json 文件集一致。
// ============================================================

/** 支持的语言（zh 为默认与兜底）。第一波五语言（规格 Q3）：zh/en/ja/es/pt */
export const LANGS = ['zh', 'en', 'ja', 'es', 'pt'] as const

export type Lang = (typeof LANGS)[number]

export const DEFAULT_LANG: Lang = 'zh'

export interface LangMeta {
  /** 语言原生写法（切换器与分发页展示用） */
  label: string
  /** 切换器收起态短标签 */
  short: string
  /** <html lang> 值 */
  htmlLang: string
  /** og:locale 值 */
  ogLocale: string
}

export const LANG_META: Record<Lang, LangMeta> = {
  zh: { label: '中文', short: '中', htmlLang: 'zh', ogLocale: 'zh_CN' },
  en: { label: 'English', short: 'EN', htmlLang: 'en', ogLocale: 'en_US' },
  ja: { label: '日本語', short: '日', htmlLang: 'ja', ogLocale: 'ja_JP' },
  es: { label: 'Español', short: 'ES', htmlLang: 'es', ogLocale: 'es_ES' },
  pt: { label: 'Português', short: 'PT', htmlLang: 'pt', ogLocale: 'pt_BR' },
}

export function isLang(value: string | undefined | null): value is Lang {
  return !!value && (LANGS as readonly string[]).includes(value)
}

export interface ParsedLangPath {
  /** URL 中的语言前缀；无前缀路径（旧路径/根路径/非法前缀）为 null */
  lang: Lang | null
  /** 剥离语言前缀后的语言内路径（保持原样，含非法前缀路径，交由 resolvePageMeta 判 404） */
  rest: string
}

/**
 * 解析 pathname 的语言前缀：'/ja/2d'→{ja,'/2d'}；'/zh/'→{zh,'/'}；
 * '/2d'→{null,'/2d'}；'/fr/2d'→{null,'/fr/2d'}（fr 非法，整段保留走 404）。
 */
export function parseLangPath(pathname: string): ParsedLangPath {
  const m = /^\/([A-Za-z-]+)(\/.*)?$/.exec(pathname)
  if (m && isLang(m[1].toLowerCase())) {
    return { lang: m[1].toLowerCase() as Lang, rest: m[2] ?? '/' }
  }
  return { lang: null, rest: pathname }
}

/** localStorage 键沿用旧 languagedetector 默认（i18nextLng），老用户选择无缝保留 */
export const LANG_STORAGE_KEY = 'i18nextLng'

/**
 * 根分发页的语言协商：localStorage（i18nextLng，含 'zh-CN' 等区域形式）→
 * navigator.languages 前缀匹配。命中支持语言返回之，否则 null（调用方兜底 zh）。
 * 预渲染/测试环境无 navigator 时安全返回存储命中或 null。
 */
export function matchNavigatorLang(): Lang | null {
  let stored: string | null = null
  try {
    stored = typeof localStorage === 'object' ? localStorage.getItem(LANG_STORAGE_KEY) : null
  } catch {
    stored = null
  }
  if (isLang(stored?.split('-')[0])) return stored!.split('-')[0] as Lang

  if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) {
    for (const raw of navigator.languages) {
      const base = raw.split('-')[0]
      if (isLang(base)) return base
    }
  }
  return null
}
