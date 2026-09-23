// src/lib/batch/runBatch.test.ts
import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import { createBatchRunner, buildBatchZip } from './runBatch'
import type { BatchJob, BatchRow } from './batchJob'

function mkRow(id: string, status: BatchRow['status'] = 'pending'): BatchRow {
  return { id, fileName: `${id}.jpg`, image: {} as HTMLImageElement, seedOverride: null, status, blob: null, objectUrl: null, error: null }
}
function mkJob(rows: BatchRow[]): BatchJob {
  return { baseline: { styleId: 'halftone', params: {}, textParams: {}, fontParams: {} }, unifiedSeed: '00', seedMode: 'unified', format: 'png', rows }
}

describe('createBatchRunner', () => {
  it('顺序处理 pending 行并通过 onRowUpdate 上报', async () => {
    const events: Array<[string, string]> = []
    const job = mkJob([mkRow('a'), mkRow('b'), mkRow('c', 'done')])
    const runner = createBatchRunner(async (t) => new Blob([t.row.id]))
    await runner.run(job, { onRowUpdate: (id, p) => events.push([id, p.status!]) })
    // done 行不重跑;a、b 各经历 processing→done
    expect(events).toEqual([['a', 'processing'], ['a', 'done'], ['b', 'processing'], ['b', 'done']])
  })

  it('单行失败不阻塞后续行', async () => {
    const job = mkJob([mkRow('a'), mkRow('b')])
    const runner = createBatchRunner(async (t) => {
      if (t.row.id === 'a') throw new Error('boom')
      return new Blob(['ok'])
    })
    const statuses: Record<string, string> = {}
    await runner.run(job, { onRowUpdate: (id, p) => { if (p.status) statuses[id] = p.status } })
    expect(statuses['a']).toBe('failed')
    expect(statuses['b']).toBe('done')
  })

  it('cancel 后当前行完成即停,剩余行保持 pending', async () => {
    const job = mkJob([mkRow('a'), mkRow('b'), mkRow('c')])
    const runner = createBatchRunner(async (t) => {
      if (t.row.id === 'a') runner.cancel()   // a 处理中取消
      return new Blob(['x'])
    })
    const statuses: Record<string, string> = {}
    await runner.run(job, { onRowUpdate: (id, p) => { if (p.status) statuses[id] = p.status } })
    expect(statuses['a']).toBe('done')     // 当前行跑完
    expect(statuses['b']).toBeUndefined()  // 未启动
    expect(job.rows[1].status).toBe('pending')
  })

  it('失败行的 error 写入 patch', async () => {
    const job = mkJob([mkRow('a')])
    const runner = createBatchRunner(async () => { throw new Error('boom') })
    let err: string | null = null
    await runner.run(job, { onRowUpdate: (_id, p) => { err = p.error ?? null } })
    expect(err).toBeTruthy()
  })
})

describe('buildBatchZip', () => {
  it('打出的 zip 可解回且内容一致', async () => {
    const zip = await buildBatchZip([
      { name: 'halftone_a_00.png', blob: new Blob([new Uint8Array([1, 2, 3])]) },
      { name: 'halftone_b_01.png', blob: new Blob([new Uint8Array([9])]) },
    ])
    const buf = new Uint8Array(await zip.arrayBuffer())
    const out = unzipSync(buf)
    expect(Object.keys(out).sort()).toEqual(['halftone_a_00.png', 'halftone_b_01.png'])
    expect(Array.from(out['halftone_a_00.png'])).toEqual([1, 2, 3])
  })
})
