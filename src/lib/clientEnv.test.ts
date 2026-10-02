import { describe, it, expect } from 'vitest'
import { isWeChatUA } from './clientEnv'

describe('isWeChatUA', () => {
  it('微信内置浏览器 UA 为 true', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13) ... MicroMessenger/8.0.49'
    expect(isWeChatUA(ua)).toBe(true)
  })
  it('iOS 微信 UA 为 true', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ... MicroMessenger/8.0.49(0x18002931)'
    expect(isWeChatUA(ua)).toBe(true)
  })
  it('普通浏览器为 false', () => {
    expect(isWeChatUA('Mozilla/5.0 (Windows NT 10.0) Chrome/128.0')).toBe(false)
    expect(isWeChatUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15')).toBe(false)
  })
  it('空 UA 为 false', () => {
    expect(isWeChatUA('')).toBe(false)
  })
})
