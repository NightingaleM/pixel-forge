import { useSyncExternalStore } from 'react'

/** 注册 media query change 监听;返回卸载函数(useSyncExternalStore 的 subscribe)。 */
export function subscribeMediaQuery(query: string, cb: () => void): () => void {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

/** 客户端快照:当前是否命中 query(useSyncExternalStore 的 getSnapshot)。 */
export function getMediaQuerySnapshot(query: string): boolean {
  return window.matchMedia(query).matches
}

/** SSR 快照:纯 Vite SPA 无关,占位 false。 */
export function getMediaQueryServerSnapshot(): boolean {
  return false
}

/** 订阅 CSS media query;SSR 无关(纯 Vite SPA),getServerSnapshot 仅占位。 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => subscribeMediaQuery(query, cb),
    () => getMediaQuerySnapshot(query),
    getMediaQueryServerSnapshot,
  )
}
