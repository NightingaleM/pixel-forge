// src/lib/license/gating.ts
// 导出决策:唯一知道"会员态×额度"组合规则的地方。纯逻辑,无 DOM。
// 单图:额度内消耗 1 次得 none,尽则 corner;批量:会员 none,免费 tiled(不消耗额度)。
import { getLicenseStatus } from './verify'
import { consumeOne } from './quota'

export type SingleExportMode = { mode: 'none' | 'corner' }
export type BatchExportMode = { mode: 'none' | 'tiled' }

export function decideSingleExport(now: number = Date.now()): SingleExportMode {
  if (getLicenseStatus(now).active) return { mode: 'none' }
  return consumeOne(now) ? { mode: 'none' } : { mode: 'corner' }
}

export function decideBatchExport(now: number = Date.now()): BatchExportMode {
  if (getLicenseStatus(now).active) return { mode: 'none' }
  return { mode: 'tiled' }
}
