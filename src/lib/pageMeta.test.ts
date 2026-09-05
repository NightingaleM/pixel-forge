import { describe, it, expect } from 'vitest'
import { PAGE_METAS, resolvePageMeta, NOT_FOUND_META, SITE_URL } from './pageMeta'
import zh from '../i18n/zh.json'
import en from '../i18n/en.json'

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
  it('精确匹配 7 个常规路由', () => {
    expect(resolvePageMeta('/').titleKey).toBe('meta.home.title')
    expect(resolvePageMeta('/2d').titleKey).toBe('meta.p2d.title')
    expect(resolvePageMeta('/3d').titleKey).toBe('meta.p3d.title')
    expect(resolvePageMeta('/about').titleKey).toBe('meta.about.title')
    expect(resolvePageMeta('/privacy').titleKey).toBe('meta.privacy.title')
    expect(resolvePageMeta('/terms').titleKey).toBe('meta.terms.title')
    expect(resolvePageMeta('/help').titleKey).toBe('meta.help.title')
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

  it('7 个常规路由均不带 noindex', () => {
    for (const meta of PAGE_METAS) {
      expect(meta.noindex).toBe(false)
    }
  })

  it('PAGE_METAS 覆盖且仅覆盖 7 个常规路由', () => {
    expect(PAGE_METAS.map((m) => m.path)).toEqual(['/', '/2d', '/3d', '/about', '/privacy', '/terms', '/help'])
  })

  it('notFound 无 descKey(保留默认 description)', () => {
    expect(NOT_FOUND_META.descKey).toBeUndefined()
  })
})

describe('PAGE_METAS i18n 键完整性', () => {
  it.each([...PAGE_METAS, NOT_FOUND_META])('$path 的 title/desc 键在 zh 与 en 中均存在且非空', (meta) => {
    expect(getNested(zh, meta.titleKey)).toBeTruthy()
    expect(getNested(en, meta.titleKey)).toBeTruthy()
    if (meta.descKey) {
      expect(getNested(zh, meta.descKey)).toBeTruthy()
      expect(getNested(en, meta.descKey)).toBeTruthy()
    }
  })
})

describe('SITE_URL', () => {
  it('与 index.html canonical 一致', () => {
    expect(SITE_URL).toBe('https://pixelforge.oylz.site')
  })
})
