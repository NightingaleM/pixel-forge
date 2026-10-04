// src/lib/batch/sessionCodec.ts
// 会话恢复(方案B)纯逻辑:内存会话 → IDB 记录的快照构建,与读回记录的恢复决策
// (防御校验/归一)。不依赖 React/DOM/IDB,便于 vitest 单测;IDB 存取在 sessionIdb,
// App2D 只做接线。照片与参数的绑定由数据结构保证:每行 = 原图 blob + 行种子码
// (decodeSeed 完整还原该行参数),不靠文件名匹配。
import type { StyleId } from '../../types'
import { getStyle } from '../StyleRegistry'
import { encodeSeed } from '../seedCodec'
import type { BatchImage, BatchBase } from './imageList'
import type { BatchFormat } from './batchJob'

export const SESSION_SCHEMA_VERSION = 1

/** 落盘行:BatchImage 的可序列化投影(渲染期字段 image/objectUrl/preview 等不存)。 */
export interface StoredSessionRow {
  id: string
  fileName: string
  /** null=跟随整批基线(与 BatchImage.seed 同语义);恢复经 loadWorking 还原参数。 */
  seed: string | null
  /** 落盘即归一:processing/failed→pending(恢复后重跑);done 且有结果才存 done。 */
  status: 'pending' | 'done'
  originBlob: Blob
  resultBlob: Blob | null
  renderedSeed: string | null
  renderedStyleId: StyleId | null
}

/** IDB 单记录(整会话)。schemaVersion 变更时 normalizeStoredSession 拒旧版。 */
export interface StoredSession {
  schemaVersion: typeof SESSION_SCHEMA_VERSION
  savedAt: number
  activeStyle: StyleId
  seedMode: 'unified' | 'perImage'
  format: BatchFormat
  selectedIndex: number
  batchBase: { params: Record<string, number>; textParams: Record<string, string> }
  rows: StoredSessionRow[]
}

/** buildSessionRecord 入参:App2D 渲染期状态(sessInputsRef 持有的最新快照)。 */
export interface SessionSnapshotInput {
  activeStyle: StyleId
  seedMode: 'unified' | 'perImage'
  format: BatchFormat
  selectedIndex: number
  /** 选中行工作副本(独立模式编入选中行 seed 用,「所见即所存」)。 */
  params: Record<string, number>
  textParams: Record<string, string>
  base: BatchBase
  rows: readonly BatchImage[]
  /** savedAt 注入(测试确定性);缺省 Date.now()。 */
  now?: number
}

/** 内存会话 → 存储记录。originFile 缺失的行剔除(测试图 fetch 未落定窗口);
 *  全部剔除/未知风格 → null(不产出无意义记录,调用方据此跳过写入)。
 *  独立模式选中行的 seed 用工作副本实时编码编入快照(不写回 state)——编辑中
 *  未到懒同步点(切行/开始处理)的参数不因被杀丢失;统一模式行种子原样透传
 *  (工作副本==基线双写,null=跟随语义保留)。 */
export function buildSessionRecord(input: SessionSnapshotInput): StoredSession | null {
  const def = getStyle(input.activeStyle)
  if (!def) return null
  const rows: StoredSessionRow[] = []
  for (let i = 0; i < input.rows.length; i++) {
    const r = input.rows[i]
    if (!r.originFile) continue
    const seed = input.seedMode === 'perImage' && i === input.selectedIndex
      ? encodeSeed(input.activeStyle, input.params, def, input.textParams)
      : r.seed
    const done = r.status === 'done' && r.blob !== null
    rows.push({
      id: r.id,
      fileName: r.fileName,
      seed,
      status: done ? 'done' : 'pending',
      originBlob: r.originFile,
      resultBlob: done ? r.blob : null,
      renderedSeed: r.renderedSeed,
      renderedStyleId: r.renderedStyleId,
    })
  }
  if (rows.length === 0) return null
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt: input.now ?? Date.now(),
    activeStyle: input.activeStyle,
    seedMode: input.seedMode,
    format: input.format,
    selectedIndex: Math.max(0, Math.min(input.selectedIndex, rows.length - 1)),
    batchBase: { params: { ...input.base.params }, textParams: { ...input.base.textParams } },
    rows,
  }
}

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** 读回记录 → 可恢复会话(防御校验+归一)。IDB 内容可能被手改或来自旧版本:
 *  整体不可信字段(版本/风格/模式/格式/基线形状)坏 → null 丢弃;行级问题逐行
 *  剔除/归一(processing/failed→pending,done 缺结果→pending,originBlob 非
 *  Blob 剔除)。全部行被剔 → null。返回值可直接消费,无需二次校验。 */
export function normalizeStoredSession(raw: unknown): StoredSession | null {
  if (!isPlainRecord(raw)) return null
  if (raw.schemaVersion !== SESSION_SCHEMA_VERSION) return null
  if (typeof raw.activeStyle !== 'string' || !getStyle(raw.activeStyle as StyleId)) return null
  if (raw.seedMode !== 'unified' && raw.seedMode !== 'perImage') return null
  if (raw.format !== 'png' && raw.format !== 'jpg' && raw.format !== 'svg') return null
  if (!Array.isArray(raw.rows)) return null
  const bb = raw.batchBase
  if (!isPlainRecord(bb) || !isPlainRecord(bb.params) || !isPlainRecord(bb.textParams)) return null
  const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : 0

  const rows: StoredSessionRow[] = []
  for (const r of raw.rows) {
    if (!isPlainRecord(r)) continue
    if (typeof r.id !== 'string' || r.id === '') continue
    if (!(r.originBlob instanceof Blob)) continue
    const hasResult = r.resultBlob instanceof Blob
    rows.push({
      id: r.id,
      fileName: typeof r.fileName === 'string' ? r.fileName : '',
      seed: typeof r.seed === 'string' ? r.seed : null,
      status: r.status === 'done' && hasResult ? 'done' : 'pending',
      originBlob: r.originBlob,
      resultBlob: r.status === 'done' && hasResult ? r.resultBlob : null,
      renderedSeed: typeof r.renderedSeed === 'string' ? r.renderedSeed : null,
      renderedStyleId: typeof r.renderedStyleId === 'string' ? r.renderedStyleId as StyleId : null,
    })
  }
  if (rows.length === 0) return null
  const sel = typeof raw.selectedIndex === 'number' && Number.isFinite(raw.selectedIndex)
    ? raw.selectedIndex
    : 0
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt,
    activeStyle: raw.activeStyle as StyleId,
    seedMode: raw.seedMode,
    format: raw.format,
    selectedIndex: Math.max(0, Math.min(Math.floor(sel), rows.length - 1)),
    batchBase: {
      params: { ...bb.params } as Record<string, number>,
      textParams: { ...bb.textParams } as Record<string, string>,
    },
    rows,
  }
}
