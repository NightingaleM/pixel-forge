// src/lib/batch/runBatch.test.ts
import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import { createBatchRunner, buildBatchZip, resolveRowRenderState, type ProcessingJob, type ProcessingTask, type ProcessingBaseline } from './runBatch'
import type { BatchImage } from './imageList'
import { encodeSeed } from '../seedCodec'
import { getStyle } from '../StyleRegistry'

const halftone = getStyle('halftone')!

function mkTask(id: string, seed = encodeSeed('halftone', {}, halftone, {})): ProcessingTask {
  return { id, image: {} as HTMLImageElement, seed }
}
function mkBaseline(overrides: Partial<ProcessingBaseline> = {}): ProcessingBaseline {
  return { params: {}, textParams: {}, fontParams: {}, ...overrides }
}
function mkJob(tasks: ProcessingTask[], overrides: Partial<ProcessingJob> = {}): ProcessingJob {
  return { tasks, format: 'png', baseline: mkBaseline(), ...overrides }
}

describe('createBatchRunner', () => {
  it('按 tasks 顺序处理并通过 onRowUpdate 上报', async () => {
    const events: Array<[string, string]> = []
    const job = mkJob([mkTask('a'), mkTask('b'), mkTask('c')])
    const runner = createBatchRunner(async (t) => new Blob([t.id]))
    await runner.run(job, { onRowUpdate: (id, p) => events.push([id, p.status!]) })
    // 每行各经历 processing→done;待跑行的过滤(pending)归调用方 drain
    expect(events).toEqual([['a', 'processing'], ['a', 'done'], ['b', 'processing'], ['b', 'done'], ['c', 'processing'], ['c', 'done']])
  })

  it('单行失败不阻塞后续行', async () => {
    const job = mkJob([mkTask('a'), mkTask('b')])
    const runner = createBatchRunner(async (t) => {
      if (t.id === 'a') throw new Error('boom')
      return new Blob(['ok'])
    })
    const statuses: Record<string, string> = {}
    await runner.run(job, { onRowUpdate: (id, p) => { if (p.status) statuses[id] = p.status } })
    expect(statuses['a']).toBe('failed')
    expect(statuses['b']).toBe('done')
  })

  it('cancel 后当前行完成即停,剩余行不启动', async () => {
    const job = mkJob([mkTask('a'), mkTask('b'), mkTask('c')])
    const runner = createBatchRunner(async (t) => {
      if (t.id === 'a') runner.cancel()   // a 处理中取消
      return new Blob(['x'])
    })
    const statuses: Record<string, string> = {}
    await runner.run(job, { onRowUpdate: (id, p) => { if (p.status) statuses[id] = p.status } })
    expect(statuses['a']).toBe('done')     // 当前行跑完
    expect(statuses['b']).toBeUndefined()  // 未启动
    expect(statuses['c']).toBeUndefined()
  })

  it('失败行的 error 写入 patch', async () => {
    const job = mkJob([mkTask('a')])
    const runner = createBatchRunner(async () => { throw new Error('boom') })
    let err: string | null = null
    await runner.run(job, { onRowUpdate: (_id, p) => { err = p.error ?? null } })
    expect(err).toBeTruthy()
  })

  it('done patch 快照渲染种子与解析风格,processing patch 先清空旧快照', async () => {
    // 跨风格种子:任务种子携带 popart(baseline 打底不限定风格)
    const popartSeed = encodeSeed('popart', {}, getStyle('popart')!, {})
    const job = mkJob([mkTask('a', popartSeed)])
    const patches: Array<Partial<BatchImage>> = []
    const runner = createBatchRunner(async () => new Blob(['x']))
    await runner.run(job, { onRowUpdate: (_id, p) => patches.push({ ...p }) })
    expect(patches[0]).toMatchObject({ status: 'processing', renderedSeed: null, renderedStyleId: null })
    expect(patches[1]).toMatchObject({ status: 'done', renderedSeed: popartSeed, renderedStyleId: 'popart' })
  })

  it('tasks 是调用时快照:run 期间数组追加不进本轮', async () => {
    const tasks = [mkTask('a'), mkTask('b')]
    const seen: string[] = []
    const runner = createBatchRunner(async (t) => {
      if (t.id === 'a') tasks.push(mkTask('c'))   // 处理中追加
      seen.push(t.id)
      return new Blob(['x'])
    })
    await runner.run(mkJob(tasks), { onRowUpdate: () => {} })
    expect(seen).toEqual(['a', 'b'])
  })
})

describe('resolveRowRenderState', () => {
  const baseline = mkBaseline({ params: { uCellSize: 9, uColorMode: 0 } })
  it('合法种子:seedable 项被种子覆盖,非 seedable 项走基线打底', () => {
    // 用 encodeSeed 造一个 uCellSize=max 的种子(uColorMode 是 select,不参与编码)
    const p = halftone.params.find((x) => x.uniform === 'uCellSize') as { min: number; max: number }
    const seed = encodeSeed('halftone', { uCellSize: p.max }, halftone, {})
    const st = resolveRowRenderState(baseline, seed)!
    expect(st.styleId).toBe('halftone')
    expect(st.params.uCellSize).toBe(p.max)
    // T1 concern:toggle/select 必须取基线而非风格默认(uColorMode 默认 1)
    expect(st.params.uColorMode).toBe(0)
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
