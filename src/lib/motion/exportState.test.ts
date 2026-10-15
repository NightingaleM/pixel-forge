import { describe, expect, it } from 'vitest'
import { exportReducer, initialExportState } from './exportState'

describe('exportReducer (导出状态机: 进度/取消/换格式再导, spec §8)', () => {
  it('idle 起点:无进度无错误,GIF 默认', () => {
    const s = initialExportState()
    expect(s.phase).toBe('idle')
    expect(s.format).toBe('gif')
    expect(s.framesDone).toBe(0)
    expect(s.estimatedBytes).toBeNull()
  })

  it('start: idle → encoding,记录总帧数,进度清零', () => {
    const s = exportReducer(exportReducer(initialExportState(), { type: 'setFormat', format: 'video' }), {
      type: 'start',
      format: 'video',
      framesTotal: 180,
    })
    expect(s.phase).toBe('encoding')
    expect(s.format).toBe('video')
    expect(s.framesTotal).toBe(180)
    expect(s.framesDone).toBe(0)
  })

  it('progress: 帧数与预估体积推进且单调(不回退)', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'gif', framesTotal: 38 })
    s = exportReducer(s, { type: 'progress', framesDone: 1, estimatedBytes: 60000, bytesSoFar: 1580 })
    expect(s.framesDone).toBe(1)
    expect(s.estimatedBytes).toBe(60000)
    s = exportReducer(s, { type: 'progress', framesDone: 5, estimatedBytes: 42000, bytesSoFar: 9000 })
    expect(s.framesDone).toBe(5)
    expect(s.estimatedBytes).toBe(60000) // 预估只增不减(取历史最大)
    expect(s.bytesSoFar).toBe(9000)
  })

  it('requestCancel: encoding → canceling(取消中仍显示,再点无效)', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'gif', framesTotal: 38 })
    s = exportReducer(s, { type: 'requestCancel' })
    expect(s.phase).toBe('canceling')
    s = exportReducer(s, { type: 'requestCancel' })
    expect(s.phase).toBe('canceling')
  })

  it('canceled: canceling → canceled,可 reset 再导', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'gif', framesTotal: 38 })
    s = exportReducer(s, { type: 'requestCancel' })
    s = exportReducer(s, { type: 'canceled' })
    expect(s.phase).toBe('canceled')
    s = exportReducer(s, { type: 'reset' })
    expect(s.phase).toBe('idle')
  })

  it('done: encoding → done(自动下载后面板留存,可换格式再导)', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'video', framesTotal: 180 })
    s = exportReducer(s, { type: 'progress', framesDone: 180, estimatedBytes: 6e6, bytesSoFar: 6e6 })
    s = exportReducer(s, { type: 'done' })
    expect(s.phase).toBe('done')
    // 换格式再导:done 状态下可切格式
    s = exportReducer(s, { type: 'setFormat', format: 'gif' })
    expect(s.format).toBe('gif')
    s = exportReducer(s, { type: 'start', format: 'gif', framesTotal: 38 })
    expect(s.phase).toBe('encoding')
  })

  it('encoding 中禁止 setFormat(防状态串档)', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'gif', framesTotal: 38 })
    s = exportReducer(s, { type: 'setFormat', format: 'video' })
    expect(s.format).toBe('gif')
    expect(s.phase).toBe('encoding')
  })

  it('error: 任意活动态 → error 带文案,reset 回 idle', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'video', framesTotal: 180 })
    s = exportReducer(s, { type: 'error', message: '编码失败' })
    expect(s.phase).toBe('error')
    expect(s.errorMessage).toBe('编码失败')
    s = exportReducer(s, { type: 'reset' })
    expect(s.phase).toBe('idle')
    expect(s.errorMessage).toBeNull()
  })

  it('done/canceled/error 后 start 前自动等效 reset(直接开新导出)', () => {
    let s = exportReducer(initialExportState(), { type: 'start', format: 'gif', framesTotal: 38 })
    s = exportReducer(s, { type: 'done' })
    s = exportReducer(s, { type: 'start', format: 'video', framesTotal: 180 })
    expect(s.phase).toBe('encoding')
    expect(s.framesTotal).toBe(180)
    expect(s.framesDone).toBe(0)
  })
})
