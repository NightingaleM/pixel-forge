// src/lib/batch/sessionIdb.ts
// 会话恢复(方案B)的 IndexedDB 存取层:原生 API 手写 promise 封装,零新依赖。
// 单库单 store 单记录(key '2d-current')。任何异常(打开失败/写失败/超配额)
// → console.warn + 内部 disabled 永久降级:后续调用直接 no-op,不弹错不重试
// (spec 边界:静默放弃持久化)。node 环境无 IDB,本层不做单测,浏览器手测覆盖。
import type { StoredSession } from './sessionCodec'

const DB_NAME = 'pixel-forge-session'
const DB_VERSION = 1
const STORE = 'sessions'
const KEY = '2d-current'

let dbPromise: Promise<IDBDatabase> | null = null
let disabled = false

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb request failed'))
  })
}

/** 惰性单例打开。失败 → disabled(打开失败多属环境不支持/隐私模式,重试无意义)。 */
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      // executor 内 try:同步 throw(极端环境 indexedDB 未定义等)也要走 reject,
      // 否则外层 await 永悬(downscaleImage 同款防御)
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('idb open failed'))
        req.onblocked = () => reject(new Error('idb open blocked'))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('idb open threw'))
      }
    })
    // 挂一个 catch 吃掉 rejection(防 unhandled),降级标志在 save/load/clear 的
    // 各自 catch 里统一置位——这里只防 promise 泄漏
    dbPromise.catch(() => {})
  }
  return dbPromise
}

/** 写入会话记录(整记录覆盖)。返回 false=已降级(调用方无需处理,静默语义)。 */
export async function saveSessionRecord(rec: StoredSession): Promise<boolean> {
  if (disabled) return false
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(rec, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb put failed'))
      tx.onabort = () => reject(tx.error ?? new Error('idb put aborted'))
    })
    return true
  } catch (err) {
    disabled = true
    console.warn('[session] persistence disabled:', err)
    return false
  }
}

/** 读回记录(原样 unknown,形状校验归 normalizeStoredSession)。无记录/已降级 → null。 */
export async function loadSessionRecord(): Promise<unknown> {
  if (disabled) return null
  try {
    const db = await openDb()
    const result = await reqAsPromise(db.transaction(STORE).objectStore(STORE).get(KEY))
    return result ?? null
  } catch (err) {
    disabled = true
    console.warn('[session] persistence unavailable:', err)
    return null
  }
}

/** 删除记录(正常关闭会话)。失败同样降级(残留记录只影响下次多弹一次确认)。 */
export async function clearSessionRecord(): Promise<void> {
  if (disabled) return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'))
      tx.onabort = () => reject(tx.error ?? new Error('idb delete aborted'))
    })
  } catch (err) {
    disabled = true
    console.warn('[session] clear failed:', err)
  }
}
