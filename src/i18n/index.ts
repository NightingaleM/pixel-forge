import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh.json'
import { DEFAULT_LANG, type Lang } from './langs'

// ============================================================
// i18n 懒加载管线（规格 D8/D9）：
// - URL 前缀是语言事实来源——初始语言由 main.tsx 从 pathname 解析后
//   调 loadLanguage；旧 languagedetector 已移除，localStorage 读写由
//   LangSwitch/分发页自管（键沿用 i18nextLng，老用户选择无缝保留）。
// - 按语言懒加载：首屏只载当前语言 chunk；zh 同步打底作为默认/兜底。
// - 新增语种：在 LANGS(src/i18n/langs.ts) 与下方 loaders 各加一行，
//   Record<Lang,...> 类型会强制两处同步，单测另锁 json 文件集。
// ============================================================

const loaders: Record<Lang, () => Promise<{ default: object }>> = {
  zh: () => import('./zh.json'),
  en: () => import('./en.json'),
  ja: () => import('./ja.json'),
  es: () => import('./es.json'),
  pt: () => import('./pt.json'),
}

const loaded = new Set<Lang>([DEFAULT_LANG])

/** 载入目标语言字典（已载则跳过）并切换 i18n 语言；失败向上抛由调用方兜底 */
export async function loadLanguage(lang: Lang): Promise<void> {
  if (!loaded.has(lang)) {
    const mod = await loaders[lang]()
    i18n.addResourceBundle(lang, 'translation', mod.default, true, true)
    loaded.add(lang)
  }
  await i18n.changeLanguage(lang)
}

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh } },
  lng: DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
