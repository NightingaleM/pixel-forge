// src/lib/batch/batchJob.test.ts
import { describe, it, expect } from 'vitest'
import {
  BATCH_MAX_ROWS, canRunBatch, dedupeName, effectiveFormat,
  resolveRowRenderState, rowSeed, zipEntryName,
  type BatchJob, type BatchRow,
} from './batchJob'
import { getStyle } from '../StyleRegistry'
// 静态 import（describe 回调内的顶层 await import 在 vitest 不合法）
import { encodeSeed } from '../seedCodec'

const baseline = {
  styleId: 'halftone' as const,
  params: { uCellSize: 9 },
  textParams: {},
  fontParams: {},
}

describe('resolveRowRenderState', () => {
  it('合法种子:seedable 项被种子覆盖,其余走基线', () => {
    // 用 encodeSeed 造一个 uCellSize=max 的种子
    const def = getStyle('halftone')!
    const p = def.params.find((x) => x.uniform === 'uCellSize') as { min: number; max: number }
    const seed = encodeSeed('halftone', { uCellSize: p.max }, def, {})
    const st = resolveRowRenderState(baseline, seed)!
    expect(st.styleId).toBe('halftone')
    expect(st.params.uCellSize).toBe(p.max)
  })

  it('非法种子返回 null', () => {
    expect(resolveRowRenderState(baseline, 'zz')).toBeNull()
    expect(resolveRowRenderState(baseline, '')).toBeNull()
  })

  it('种子携带其他风格时跟随种子的 styleId', () => {
    const seed = encodeSeed('popart', {}, getStyle('popart')!, {})
    const st = resolveRowRenderState(baseline, seed)!
    expect(st.styleId).toBe('popart')
  })
})

describe('rowSeed', () => {
  const job = { baseline, unifiedSeed: '0A1', seedMode: 'unified', format: 'png', rows: [] } as BatchJob
  const row = { id: 'r1', seedOverride: null } as BatchRow
  it('override 优先,否则统一值', () => {
    expect(rowSeed(job, row)).toBe('0A1')
    expect(rowSeed(job, { ...row, seedOverride: '9z' })).toBe('9z')
  })
})

describe('effectiveFormat', () => {
  it('svg 仅 canvas2d 风格有效,其余回退 png', () => {
    expect(effectiveFormat('ascii', 'svg')).toBe('svg')
    expect(effectiveFormat('halftone', 'svg')).toBe('png')
    expect(effectiveFormat('halftone', 'jpg')).toBe('jpg')
  })
})

describe('命名', () => {
  it('zipEntryName 去掉原扩展名', () => {
    expect(zipEntryName('halftone', 'cake.jpg', 'Ab3', 'png')).toBe('halftone_cake_Ab3.png')
    expect(zipEntryName('halftone', 'noext', 'Ab3', 'png')).toBe('halftone_noext_Ab3.png')
  })
  it('dedupeName 冲突递增后缀', () => {
    const taken = new Set(['a.png'])
    expect(dedupeName('a.png', taken)).toBe('a (2).png')
    taken.add('a (2).png')
    expect(dedupeName('a.png', taken)).toBe('a (3).png')
    expect(dedupeName('b.png', taken)).toBe('b.png')
  })
})

describe('canRunBatch', () => {
  it('1..MAX 为 true,0 与超限为 false', () => {
    expect(canRunBatch(1)).toBe(true)
    expect(canRunBatch(BATCH_MAX_ROWS)).toBe(true)
    expect(canRunBatch(0)).toBe(false)
    expect(canRunBatch(BATCH_MAX_ROWS + 1)).toBe(false)
  })
})
