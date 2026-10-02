// src/lib/downloadFlow.test.ts
import { describe, it, expect } from 'vitest'
import { planDownload } from './downloadFlow'

describe('planDownload', () => {
  it('微信内 png/jpg → lightbox(长按保存)', () => {
    expect(planDownload({ wechat: true, isSvg: false })).toBe('lightbox')
  })
  it('非微信 png/jpg → anchor', () => {
    expect(planDownload({ wechat: false, isSvg: false })).toBe('anchor')
  })
  it('移动端 svg → lightbox(转 png)', () => {
    expect(planDownload({ wechat: false, isSvg: true, forceLightbox: true })).toBe('lightbox')
  })
  it('桌面 svg → anchor(原行为)', () => {
    expect(planDownload({ wechat: false, isSvg: true })).toBe('anchor')
  })
})
