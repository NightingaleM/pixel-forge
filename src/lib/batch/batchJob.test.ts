// src/lib/batch/batchJob.test.ts
// v1 行状态模型(BatchJob/BatchRow/种子解析)退役后,此处只测保留的纯逻辑:
// 格式回退、导出命名与上限校验。行种子/工作副本见 imageList.test.ts,
// 队列执行与渲染态解析见 runBatch.test.ts。
import { describe, it, expect } from 'vitest'
import { BATCH_MAX_ROWS, canRunBatch, dedupeName, effectiveFormat, zipEntryName } from './batchJob'

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
