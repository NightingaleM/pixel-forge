// src/lib/useCopyFeedback.ts
// 种子码「点击复制」短反馈(v3):feedback 标记最近一次复制项与成败,超时自动
// 清空;同刻只标记一项(连点以最后一次为准)。ImageStrip 种子条与 BatchPanel
// 行列表共用同款交互。
import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyFeedback() {
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean } | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const copy = useCallback(async (id: string, text: string) => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = false
    }
    setFeedback({ id, ok })
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFeedback(null), ok ? 1500 : 2500)
  }, [])

  // 卸载清计时器,避免 setState on unmounted
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return { feedback, copy }
}
