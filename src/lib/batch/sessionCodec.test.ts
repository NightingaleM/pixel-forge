// src/lib/batch/sessionCodec.test.ts
// 会话恢复(方案B)纯逻辑测试:快照构建(buildSessionRecord)与恢复决策
// (normalizeStoredSession)。行构造参考 imageList.test.ts(纯逻辑不触达 DOM,
// image 用空对象顶替;Blob 用 Node 18+ 全局 Blob)。
import { describe, it, expect } from 'vitest'
import {
  buildSessionRecord, normalizeStoredSession,
  type SessionSnapshotInput, type StoredSession, type StoredSessionRow,
} from './sessionCodec'
import { getStyle } from '../StyleRegistry'
import { encodeSeed, decodeSeed } from '../seedCodec'
import type { BatchImage, BatchBase } from './imageList'

const def = getStyle('halftone')!
const base: BatchBase = {
  params: { uCellSize: 9, uDotScale: 1.2, uColorMode: 0, uAngle: 45, uShape: 2, uHueShift: 30 },
  textParams: {},
}

/** 构造最小行:image 空对象顶替(持久化不消费它);originFile 缺省给 blob。 */
function makeRow(overrides: Partial<BatchImage> = {}): BatchImage {
  return {
    id: 'r1',
    fileName: 'cake.jpg',
    image: {} as HTMLImageElement,
    seed: null,
    status: 'pending',
    blob: null,
    objectUrl: null,
    error: null,
    renderedSeed: null,
    renderedStyleId: null,
    previewUrl: null,
    previewSig: null,
    originFile: new Blob(['img1']),
    ...overrides,
  }
}

function makeInput(overrides: Partial<SessionSnapshotInput> = {}): SessionSnapshotInput {
  return {
    activeStyle: 'halftone',
    seedMode: 'unified',
    format: 'png',
    selectedIndex: 0,
    params: { ...base.params },
    textParams: {},
    base,
    rows: [],
    now: 1_700_000_000_000,
    ...overrides,
  }
}

describe('buildSessionRecord', () => {
  it('基本形状:会话级字段+行字段透传,status 归一 pending,savedAt/schemaVersion', () => {
    const rows = [
      makeRow({ id: 'a', fileName: 'a.jpg', seed: '1Bc', renderedSeed: '1Bc', renderedStyleId: 'halftone' }),
      makeRow({ id: 'b', fileName: 'b.jpg', seed: null }),
    ]
    const rec = buildSessionRecord(makeInput({ rows, selectedIndex: 1, seedMode: 'perImage', format: 'jpg' }))!
    expect(rec.schemaVersion).toBe(1)
    expect(rec.savedAt).toBe(1_700_000_000_000)
    expect(rec.activeStyle).toBe('halftone')
    expect(rec.seedMode).toBe('perImage')
    expect(rec.format).toBe('jpg')
    expect(rec.selectedIndex).toBe(1)
    expect(rec.batchBase).toEqual(base)
    expect(rec.rows).toHaveLength(2)
    expect(rec.rows[0]).toMatchObject({
      id: 'a', fileName: 'a.jpg', seed: '1Bc',
      status: 'pending', resultBlob: null, renderedSeed: '1Bc', renderedStyleId: 'halftone',
    })
    expect(rec.rows[0].originBlob).toBeInstanceOf(Blob)
    // perImage+selectedIndex=1:行 b 是选中行,seed 为工作副本实时编码(设计行为);
    // 行 a 非选中,行码透传
    expect(rec.rows[1]).toMatchObject({
      id: 'b', fileName: 'b.jpg',
      seed: encodeSeed('halftone', base.params, def, {}), status: 'pending',
    })
  })

  it('originFile 缺失的行被剔除;全部缺失返回 null(不产出无意义记录)', () => {
    const rows = [
      makeRow({ id: 'a', originFile: null }),
      makeRow({ id: 'b', originFile: new Blob(['x']) }),
    ]
    const rec = buildSessionRecord(makeInput({ rows }))!
    expect(rec.rows.map((r) => r.id)).toEqual(['b'])
    expect(buildSessionRecord(makeInput({ rows: [makeRow({ originFile: null })] }))).toBeNull()
  })

  it('done 且有 blob → status done + resultBlob 携带;rendered 快照透传', () => {
    const resultBlob = new Blob(['result'])
    const row = makeRow({
      status: 'done', blob: resultBlob, renderedSeed: '9Z', renderedStyleId: 'halftone',
    })
    const rec = buildSessionRecord(makeInput({ rows: [row] }))!
    expect(rec.rows[0].status).toBe('done')
    expect(rec.rows[0].resultBlob).toBe(resultBlob)
    expect(rec.rows[0].renderedSeed).toBe('9Z')
  })

  it('done 但 blob 为 null → 归一 pending;processing/failed → 归一 pending', () => {
    const rows = [
      makeRow({ status: 'done', blob: null }),
      makeRow({ status: 'processing' }),
      makeRow({ status: 'failed', error: 'boom' }),
    ]
    const rec = buildSessionRecord(makeInput({ rows }))!
    expect(rec.rows.map((r) => r.status)).toEqual(['pending', 'pending', 'pending'])
    expect(rec.rows.every((r) => r.resultBlob === null)).toBe(true)
  })

  it('独立模式选中行:seed 用工作副本实时编码(未同步编辑入快照,所见即所存)', () => {
    const working = { params: { ...base.params, uCellSize: 33 }, textParams: {} }
    const rows = [
      makeRow({ id: 'a', seed: 'old' }),   // 选中行,行上有旧码
      makeRow({ id: 'b', seed: 'keep' }),  // 非选中行透传
    ]
    const rec = buildSessionRecord(makeInput({
      rows, selectedIndex: 0, seedMode: 'perImage', params: working.params,
    }))!
    expect(rec.rows[0].seed).toBe(encodeSeed('halftone', working.params, def, working.textParams))
    expect(decodeSeed(rec.rows[0].seed!)!.params.uCellSize).toBe(33)
    expect(rec.rows[1].seed).toBe('keep')
  })

  it('统一模式:行种子原样透传(选中行不做工作副本覆写,null=跟随语义保留)', () => {
    const rows = [makeRow({ id: 'a', seed: null }), makeRow({ id: 'b', seed: 'residual' })]
    const rec = buildSessionRecord(makeInput({
      rows, selectedIndex: 0, seedMode: 'unified', params: { ...base.params, uCellSize: 77 },
    }))!
    expect(rec.rows[0].seed).toBeNull()
    expect(rec.rows[1].seed).toBe('residual')
  })

  it('选中行被剔除时 selectedIndex 钳制到剩余行范围内', () => {
    const rows = [makeRow({ id: 'a', originFile: null }), makeRow({ id: 'b' })]
    const rec = buildSessionRecord(makeInput({ rows, selectedIndex: 0 }))!
    expect(rec.rows.map((r) => r.id)).toEqual(['b'])
    expect(rec.selectedIndex).toBe(0)
  })

  it('未知风格(def 缺失)返回 null:不可编码选中行实时种子的会话不落盘', () => {
    expect(buildSessionRecord(makeInput({ activeStyle: 'nope' as never }))).toBeNull()
  })
})

describe('normalizeStoredSession', () => {
  function makeStoredRow(overrides: Partial<StoredSessionRow> = {}): StoredSessionRow {
    return {
      id: 'a',
      fileName: 'a.jpg',
      seed: null,
      status: 'pending',
      originBlob: new Blob(['img']),
      resultBlob: null,
      renderedSeed: null,
      renderedStyleId: null,
      ...overrides,
    }
  }
  function makeStored(overrides: Partial<StoredSession> = {}): StoredSession {
    return {
      schemaVersion: 1,
      savedAt: 1_700_000_000_000,
      activeStyle: 'halftone',
      seedMode: 'unified',
      format: 'png',
      selectedIndex: 0,
      batchBase: { params: {}, textParams: {} },
      rows: [makeStoredRow()],
      ...overrides,
    }
  }

  it('合法记录原样通过(往返幂等:normalize 自己的产出稳定)', () => {
    const rec = makeStored({
      seedMode: 'perImage', format: 'svg', selectedIndex: 0,
      rows: [makeStoredRow({ id: 'a', seed: '1Bc', status: 'done', resultBlob: new Blob(['r']), renderedStyleId: 'halftone' })],
    })
    expect(normalizeStoredSession(rec)).toEqual(rec)
  })

  it('schemaVersion 不符 → null(升级判断,旧记录不可恢复)', () => {
    expect(normalizeStoredSession(makeStored({ schemaVersion: 2 as never }))).toBeNull()
    expect(normalizeStoredSession(makeStored({ schemaVersion: 0 as never }))).toBeNull()
  })

  it('非法 activeStyle/seedMode/format → null(记录不可信整体丢弃)', () => {
    expect(normalizeStoredSession(makeStored({ activeStyle: 'nope' as never }))).toBeNull()
    expect(normalizeStoredSession(makeStored({ seedMode: 'mixed' as never }))).toBeNull()
    expect(normalizeStoredSession(makeStored({ format: 'webp' as never }))).toBeNull()
  })

  it('行防御:processing/failed 归一 pending;done 缺 resultBlob 归一 pending', () => {
    const rec = normalizeStoredSession(makeStored({
      rows: [
        makeStoredRow({ id: 'a', status: 'processing' as never }),
        makeStoredRow({ id: 'b', status: 'failed' as never }),
        makeStoredRow({ id: 'c', status: 'done', resultBlob: null }),
      ],
    }))!
    expect(rec.rows.map((r) => r.status)).toEqual(['pending', 'pending', 'pending'])
  })

  it('originBlob 非 Blob 的行剔除;全部剔除 → null', () => {
    const rec = normalizeStoredSession(makeStored({
      rows: [makeStoredRow({ id: 'a', originBlob: 'oops' as never }), makeStoredRow({ id: 'b' })],
    }))!
    expect(rec.rows.map((r) => r.id)).toEqual(['b'])
    expect(normalizeStoredSession(makeStored({ rows: [makeStoredRow({ originBlob: undefined as never })] }))).toBeNull()
  })

  it('selectedIndex 钳制:负数→0,超界→末行', () => {
    const rows = [makeStoredRow({ id: 'a' }), makeStoredRow({ id: 'b' })]
    expect(normalizeStoredSession(makeStored({ rows, selectedIndex: -3 }))!.selectedIndex).toBe(0)
    expect(normalizeStoredSession(makeStored({ rows, selectedIndex: 5 }))!.selectedIndex).toBe(1)
  })

  it('非对象输入/rows 非数组/batchBase 形状坏 → null', () => {
    expect(normalizeStoredSession(null)).toBeNull()
    expect(normalizeStoredSession('junk')).toBeNull()
    expect(normalizeStoredSession(makeStored({ rows: 'junk' as never }))).toBeNull()
    expect(normalizeStoredSession(makeStored({ batchBase: null as never }))).toBeNull()
  })

  it('build→normalize 往返:build 的产出被 normalize 无损接受(行数与身份字段守恒)', () => {
    const rows = [
      makeRow({ id: 'a', seed: '1Bc', status: 'done', blob: new Blob(['r']), renderedSeed: '1Bc' }),
      makeRow({ id: 'b' }),
    ]
    const stored = buildSessionRecord(makeInput({ rows, selectedIndex: 1 }))!
    const back = normalizeStoredSession(stored)!
    expect(back.rows).toHaveLength(2)
    expect(back.rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(back.rows.map((r) => r.seed)).toEqual(['1Bc', null])
    expect(back.rows[0].status).toBe('done')
    expect(back.selectedIndex).toBe(1)
  })
})
