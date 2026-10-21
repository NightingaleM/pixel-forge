import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PAGE_METAS, resolvePageMeta, NOT_FOUND_META, SITE_URL } from './pageMeta'
import { LANGS } from '../i18n/langs'

const i18nDir = fileURLToPath(new URL('../i18n', import.meta.url))

function loadDict(lang: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(i18nDir, `${lang}.json`), 'utf8'))
}

function getNested(obj: unknown, keyPath: string): string | undefined {
  const val = keyPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
  return typeof val === 'string' ? val : undefined
}

describe('resolvePageMeta', () => {
  it('精确匹配 8 个常规路由（语言内路径）', () => {
    expect(resolvePageMeta('/').titleKey).toBe('meta.home.title')
    expect(resolvePageMeta('/2d').titleKey).toBe('meta.p2d.title')
    expect(resolvePageMeta('/3d').titleKey).toBe('meta.p3d.title')
    expect(resolvePageMeta('/about').titleKey).toBe('meta.about.title')
    expect(resolvePageMeta('/privacy').titleKey).toBe('meta.privacy.title')
    expect(resolvePageMeta('/terms').titleKey).toBe('meta.terms.title')
    expect(resolvePageMeta('/help').titleKey).toBe('meta.help.title')
    expect(resolvePageMeta('/license').titleKey).toBe('meta.license.title')
  })

  it('语言前缀路径解析到同一条 meta（URL 是语言事实来源）', () => {
    expect(resolvePageMeta('/zh/')).toEqual(resolvePageMeta('/'))
    expect(resolvePageMeta('/zh/2d')).toEqual(resolvePageMeta('/2d'))
    expect(resolvePageMeta('/en/2d')).toEqual(resolvePageMeta('/2d'))
    expect(resolvePageMeta('/en/about/')).toEqual(resolvePageMeta('/about'))
  })

  it('非法语言前缀整段按未知路径处理', () => {
    expect(resolvePageMeta('/fr/2d')).toEqual(NOT_FOUND_META)
  })

  it('尾斜杠归一化到同一路由', () => {
    expect(resolvePageMeta('/2d/')).toEqual(resolvePageMeta('/2d'))
    expect(resolvePageMeta('/help/')).toEqual(resolvePageMeta('/help'))
  })

  it('未知路径回退 notFound 且带 noindex', () => {
    expect(resolvePageMeta('/nonexistent')).toEqual(NOT_FOUND_META)
    expect(NOT_FOUND_META.noindex).toBe(true)
    expect(NOT_FOUND_META.titleKey).toBe('meta.notFound.title')
  })

  it('8 个常规路由均不带 noindex', () => {
    for (const meta of PAGE_METAS) {
      expect(meta.noindex).toBe(false)
    }
  })

  it('PAGE_METAS 覆盖且仅覆盖 8 个常规路由', () => {
    expect(PAGE_METAS.map((m) => m.path)).toEqual(['/', '/2d', '/3d', '/about', '/privacy', '/terms', '/help', '/license'])
  })

  it('notFound 无 descKey(保留默认 description)', () => {
    expect(NOT_FOUND_META.descKey).toBeUndefined()
  })
})

describe('字典文件集与 LANGS 同步', () => {
  it('src/i18n 下的 json 文件 stem 集恰为 LANGS（漏建/漏登记都会红）', () => {
    const stems = readdirSync(i18nDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
    expect(stems).toEqual([...LANGS].sort())
  })
})

describe('PAGE_METAS i18n 键完整性（全部语言）', () => {
  const dicts = Object.fromEntries(LANGS.map((l) => [l, loadDict(l)]))

  it.each(LANGS)('%s：全部页面 title/desc 键存在且非空', (lang) => {
    const dict = dicts[lang]
    for (const meta of [...PAGE_METAS, NOT_FOUND_META]) {
      expect(getNested(dict, meta.titleKey), `${lang} ${meta.titleKey}`).toBeTruthy()
      if (meta.descKey) {
        expect(getNested(dict, meta.descKey), `${lang} ${meta.descKey}`).toBeTruthy()
      }
    }
    // 根分发页标题（applyPageMeta 的 ROOT_DISPATCH_META 使用）
    expect(getNested(dict, 'meta.dispatch.title'), `${lang} meta.dispatch.title`).toBeTruthy()
  })
})

describe('SITE_URL', () => {
  it('与 index.html canonical 一致', () => {
    expect(SITE_URL).toBe('https://pixelforge.oylz.site')
  })
})
