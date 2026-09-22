export interface PanelPos { x: number; y: number }

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

// 与 presetStore 相同的防御：阻止所有 cookie 的 Chrome / 某些 webview 中访问
// localStorage getter 会抛 SecurityError，模块加载时执行必须捕获。
let storage: StorageLike | null = null
try {
  storage = typeof window !== 'undefined' ? window.localStorage : null
} catch {
  storage = null
}

export function setPanelPosStorage(s: StorageLike | null): void {
  storage = s
}

function isValidPos(raw: unknown): raw is PanelPos {
  if (typeof raw !== 'object' || raw === null) return false
  const p = raw as Record<string, unknown>
  return typeof p.x === 'number' && Number.isFinite(p.x)
    && typeof p.y === 'number' && Number.isFinite(p.y)
}

/** 读面板位置（无记录 / 坏库 → null，调用方回退默认位置）。 */
export function loadPanelPos(key: string): PanelPos | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isValidPos(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 写面板位置（存储不可用 / 写入失败静默跳过，位置持久化是尽力而为）。 */
export function savePanelPos(key: string, pos: PanelPos): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(pos))
  } catch {
    // 配额满或隐私模式：忽略，不中断拖动
  }
}
