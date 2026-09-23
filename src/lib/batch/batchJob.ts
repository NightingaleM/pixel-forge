// src/lib/batch/batchJob.ts
// 批量纯逻辑:格式语义、上限校验与导出命名。v1 的行状态模型(BatchJob/BatchRow/
// 种子解析)已退役——行状态与种子编解码见 imageList.ts,队列执行见 runBatch.ts
// (ProcessingJob)。不依赖 React/DOM 渲染,便于单测;组件与队列执行器共用。
import type { StyleId } from '../../types'
import { getStyle } from '../StyleRegistry'

export type BatchFormat = 'png' | 'jpg' | 'svg'

/** 单批硬上限:每行持有原图引用+结果 blob,控制峰值内存。后期付费提额的杠杆之一。 */
export const BATCH_MAX_ROWS = 20

/** 付费预留:当前恒放行(仅校验数量),后期在此接授权/配额。 */
export function canRunBatch(count: number): boolean {
  return count > 0 && count <= BATCH_MAX_ROWS
}

/** SVG 导出仅对 canvas2d(ASCII)风格有意义;行种子切到 shader 风格时回退 png。 */
export function effectiveFormat(styleId: StyleId, format: BatchFormat): BatchFormat {
  if (format !== 'svg') return format
  return getStyle(styleId)?.renderMode === 'canvas2d' ? 'svg' : 'png'
}

/** {styleId}_{原文件名去扩展}_{种子码}.{ext} */
export function zipEntryName(styleId: string, fileName: string, seed: string, ext: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  return `${styleId}_${base}_${seed}.${ext}`
}

/** 同名冲突加 " (n)" 递增(同图同种子跑两次的场景)。 */
export function dedupeName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot < 0 ? name : name.slice(0, dot)
  const ext = dot < 0 ? '' : name.slice(dot)
  let i = 2
  while (taken.has(`${stem} (${i})${ext}`)) i++
  return `${stem} (${i})${ext}`
}
