// 环境事实:vitest 默认 node 环境,jsdom/happy-dom 与 @testing-library/react 均未安装,
// 依赖约束禁止新增依赖 → brief 的 createRoot mount 方案无法运行(无 document)。
// 裁决:实现中的 subscribe/snapshot 内联回调提取为可导出纯函数(行为逐字保留),
// 在 node 环境对 hook 契约做真实断言;另用 react-dom/server renderToString 验证 SSR 路径。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import {
  useMediaQuery,
  subscribeMediaQuery,
  getMediaQuerySnapshot,
  getMediaQueryServerSnapshot,
} from './useMediaQuery'

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners: (() => void)[] = []
  const queriesSeen: string[] = []
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  vi.stubGlobal('window', {
    matchMedia: (q: string) => {
      queriesSeen.push(q)
      return mql
    },
  })
  return {
    fire: () => listeners.forEach((cb) => cb()),
    setMatches: (v: boolean) => {
      matches = v
    },
    listeners,
    queriesSeen,
  }
}

describe('useMediaQuery 契约', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('getSnapshot 返回当前 matches', () => {
    const stub = stubMatchMedia(true)
    expect(getMediaQuerySnapshot('(max-width: 767px)')).toBe(true)
    // query 原样透传给 matchMedia
    expect(stub.queriesSeen).toEqual(['(max-width: 767px)'])
    stubMatchMedia(false)
    expect(getMediaQuerySnapshot('(max-width: 767px)')).toBe(false)
  })

  it('subscribe 注册 change 监听,清理后可卸载', () => {
    const stub = stubMatchMedia(true)
    let fired = 0
    const unsub = subscribeMediaQuery('(max-width: 767px)', () => {
      fired++
    })
    expect(stub.listeners).toHaveLength(1)
    stub.fire()
    expect(fired).toBe(1)
    unsub()
    expect(stub.listeners).toHaveLength(0)
    stub.fire()
    expect(fired).toBe(1) // 清理后不再触发
  })

  it('matches 变化时:监听器触发,重读快照得到新值', () => {
    const stub = stubMatchMedia(true)
    expect(getMediaQuerySnapshot('(max-width: 767px)')).toBe(true)
    let notified = false
    const unsub = subscribeMediaQuery('(max-width: 767px)', () => {
      notified = true
    })
    stub.setMatches(false)
    stub.fire()
    expect(notified).toBe(true)
    // useSyncExternalStore 收到 change 后会重读快照,应拿到新值并触发重渲
    expect(getMediaQuerySnapshot('(max-width: 767px)')).toBe(false)
    unsub()
  })

  it('getServerSnapshot 为 false', () => {
    expect(getMediaQueryServerSnapshot()).toBe(false)
  })

  it('SSR 冒烟:renderToString 渲染 hook 返回 server 快照 false', () => {
    const Comp = () => createElement('span', null, String(useMediaQuery('(max-width: 767px)')))
    expect(renderToString(createElement(Comp))).toBe('<span>false</span>')
  })
})
