// src/lib/batch/batchJob.ts
// 批量任务的纯逻辑:行状态模型、种子→渲染状态解析、导出命名。
// 不依赖 React/DOM 渲染,便于单测;组件与队列执行器(runBatch)共用。
import type { StyleId } from '../../types'
import { decodeSeed } from '../seedCodec'
import { getStyle } from '../StyleRegistry'
import { mergeWithDefaults } from '../presetStore'

export type BatchFormat = 'png' | 'jpg' | 'svg'
export type BatchRowStatus = 'pending' | 'processing' | 'done' | 'failed'

/** 送入批量时的完整状态快照(种子不携带 text/font/toggle/select,这些走基线)。 */
export interface BatchBaseline {
  styleId: StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  fontParams: Record<string, FontFace | null>
}

export interface BatchRow {
  id: string
  fileName: string
  image: HTMLImageElement
  /** null=跟随统一种子;画廊"重骰"后为独立值,不再跟随统一 */
  seedOverride: string | null
  status: BatchRowStatus
  blob: Blob | null
  objectUrl: string | null
  error: string | null
}

export interface BatchJob {
  baseline: BatchBaseline
  unifiedSeed: string
  seedMode: 'unified' | 'perImage'
  format: BatchFormat
  rows: BatchRow[]
}

/** 单批硬上限:每行持有原图引用+结果 blob,控制峰值内存。后期付费提额的杠杆之一。 */
export const BATCH_MAX_ROWS = 20

/** 付费预留:当前恒放行(仅校验数量),后期在此接授权/配额。 */
export function canRunBatch(count: number): boolean {
  return count > 0 && count <= BATCH_MAX_ROWS
}

/** 种子→行渲染状态。与 App2D.handleApplySeed 同语义:decode 产出以目标风格
 *  默认值为底合并;基线参数打底保证 toggle/select 等(种子不携带项)延续调参现场。
 *  种子携带其他风格时跟随种子(种子是完整状态)。非法返回 null。 */
export function resolveRowRenderState(
  baseline: BatchBaseline,
  seedCode: string,
): { styleId: StyleId; params: Record<string, number>; textParams: Record<string, string> } | null {
  const decoded = decodeSeed(seedCode)
  if (!decoded) return null
  const def = getStyle(decoded.styleId)
  if (!def) return null
  const merged = mergeWithDefaults(
    def,
    { ...baseline.params, ...decoded.params },
    { ...baseline.textParams, ...decoded.colorParams },
  )
  return { styleId: decoded.styleId, params: merged.params, textParams: merged.textParams }
}

export function rowSeed(job: BatchJob, row: BatchRow): string {
  return row.seedOverride ?? job.unifiedSeed
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
