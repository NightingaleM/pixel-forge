import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PAGE_METAS, SITE_URL, langUrlPath } from './pageMeta'
import { LANGS, LANG_META } from '../i18n/langs'
import { buildSitemap, langUrlPath as sitemapLangUrlPath } from '../../scripts/sitemap.mjs'
import { styles } from './StyleRegistry'

// ============================================================
// 四清单一致性锁（规格 D10）：LANGS × PAGE_METAS（src 事实来源）
// ↔ scripts/prerender.mjs 的 LANGS/ROUTES/LANG_LABELS 字面量
// ↔ buildSitemap 输出。任何一处漂移（如 /license 漏网复发）即红。
// ============================================================

const prerenderSrc = readFileSync(
  fileURLToPath(new URL('../../scripts/prerender.mjs', import.meta.url)),
  'utf8',
)

function extractArrayLiteral(src: string, name: string): string[] {
  const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(src)
  if (!m) throw new Error(`prerender.mjs 中未找到 ${name} 导出字面量`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('prerender 脚本与 src 常量一致', () => {
  it('LANGS 与 src/i18n/langs.ts 一致', () => {
    expect(extractArrayLiteral(prerenderSrc, 'LANGS')).toEqual([...LANGS])
  })

  it('ROUTES 与 PAGE_METAS 路径集一致（/license 漏网防复发）', () => {
    expect(extractArrayLiteral(prerenderSrc, 'ROUTES')).toEqual(PAGE_METAS.map((m) => m.path))
  })

  it('LANG_LABELS 键集 == LANGS（根 stub 语言链接不漏）', () => {
    const m = /export const LANG_LABELS = \{([^}]*)\}/.exec(prerenderSrc)
    if (!m) throw new Error('prerender.mjs 中未找到 LANG_LABELS')
    const keys = [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1])
    expect([...keys].sort()).toEqual([...LANGS].sort())
  })
})

describe('buildSitemap 输出结构', () => {
  const xml = buildSitemap({
    siteUrl: SITE_URL,
    langs: [...LANGS],
    routes: PAGE_METAS.map((m) => m.path),
  })

  it('URL 集恰为 LANGS × PAGE_METAS', () => {
    expect(xml.match(/<loc>/g)).toHaveLength(LANGS.length * PAGE_METAS.length)
    for (const meta of PAGE_METAS) {
      for (const lang of LANGS) {
        expect(xml).toContain(`<loc>${SITE_URL}${langUrlPath(lang, meta.path)}</loc>`)
      }
    }
  })

  it('每条 URL 含每语言 alternate + x-default→根分发页（与 applyPageMeta hreflang 集群同构）', () => {
    expect(xml.match(/hreflang="x-default"/g)).toHaveLength(LANGS.length * PAGE_METAS.length)
    for (const block of xml.split('<url>').slice(1)) {
      for (const lang of LANGS) {
        expect(block).toContain(`hreflang="${lang}"`)
      }
      expect(block).toContain(`hreflang="x-default" href="${SITE_URL}/"`)
    }
  })

  it('sitemap 的 langUrlPath 与 pageMeta 的同规则', () => {
    for (const meta of PAGE_METAS) {
      for (const lang of LANGS) {
        expect(sitemapLangUrlPath(lang, meta.path)).toBe(langUrlPath(lang, meta.path))
      }
    }
  })
})

describe('LANG_META 完整性', () => {
  it('覆盖全部语言，label/htmlLang/ogLocale 非空', () => {
    for (const lang of LANGS) {
      expect(LANG_META[lang].label).toBeTruthy()
      expect(LANG_META[lang].short).toBeTruthy()
      expect(LANG_META[lang].htmlLang).toBeTruthy()
      expect(LANG_META[lang].ogLocale).toBeTruthy()
    }
  })
})

describe('风格计数防漂移（D11：字典文案数字须等于注册表长度）', () => {
  const COUNT_RE = /(\d+)\s*(?:种|種|個|art styles?|art filters?|styles?|filtros?|estilos?|efectos?|efeitos?)/gi
  const i18nDir = fileURLToPath(new URL('../i18n', import.meta.url))

  it.each(LANGS)('%s：home/p2d 计数与 styles.length=%d 一致', (lang) => {
    const dict = JSON.parse(readFileSync(join(i18nDir, `${lang}.json`), 'utf8')) as {
      meta: Record<string, { title?: string; desc?: string }>
    }
    let totalCounts = 0
    for (const page of ['home', 'p2d']) {
      for (const field of ['title', 'desc'] as const) {
        const text = dict.meta?.[page]?.[field] ?? ''
        for (const m of text.matchAll(COUNT_RE)) {
          expect(Number(m[1]), `${lang} meta.${page}.${field} 计数漂移`).toBe(styles.length)
          totalCounts += 1
        }
      }
    }
    // home + p2d 合并至少出现一次准确计数（各语种骨架允许计数放在 home 或 p2d 任一处；
    // 用 matchAll 计数而非 .test()：/g 正则的 lastIndex 状态会让连续 test 误判）
    expect(totalCounts, `${lang} meta.home/p2d 均缺少风格计数`).toBeGreaterThan(0)
  })
})
