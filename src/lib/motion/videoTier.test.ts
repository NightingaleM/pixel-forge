// src/lib/motion/videoTier.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extForTier, probeVideoTier, recorderMimeFor, resetVideoTierCache } from './videoTier'

afterEach(() => resetVideoTierCache())

describe('probeVideoTier 两级判定(spec §1)', () => {
  it('WebCodecs 过 → webcodecs-mp4,不再问 MediaRecorder', async () => {
    const wc = vi.fn(async () => true)
    const mr = vi.fn(() => true)
    expect(await probeVideoTier({ probeWebCodecs: wc, probeRecorderMime: mr })).toBe('webcodecs-mp4')
    expect(mr).not.toHaveBeenCalled()
  })

  it('WebCodecs 不过 + mp4 支持 → mediarecorder-mp4', async () => {
    const tier = await probeVideoTier({
      probeWebCodecs: async () => false,
      probeRecorderMime: (m) => m === 'video/mp4;codecs=avc1',
    })
    expect(tier).toBe('mediarecorder-mp4')
  })

  it('mp4 不支持 + vp9 支持 → mediarecorder-webm(vp8 同理)', async () => {
    const viaVp9 = await probeVideoTier({
      probeWebCodecs: async () => false,
      probeRecorderMime: (m) => m === 'video/webm;codecs=vp9',
    })
    expect(viaVp9).toBe('mediarecorder-webm')
    resetVideoTierCache()
    const viaVp8 = await probeVideoTier({
      probeWebCodecs: async () => false,
      probeRecorderMime: (m) => m === 'video/webm;codecs=vp8',
    })
    expect(viaVp8).toBe('mediarecorder-webm')
  })

  it('两层全落空 → none', async () => {
    expect(await probeVideoTier({ probeWebCodecs: async () => false, probeRecorderMime: () => false })).toBe('none')
  })

  it('会话级记忆化:同参只探测一次,reset 后重探', async () => {
    const wc = vi.fn(async () => true)
    await probeVideoTier({ probeWebCodecs: wc, probeRecorderMime: () => false })
    await probeVideoTier({ probeWebCodecs: wc, probeRecorderMime: () => false })
    expect(wc).toHaveBeenCalledTimes(1)
    resetVideoTierCache()
    await probeVideoTier({ probeWebCodecs: wc, probeRecorderMime: () => false })
    expect(wc).toHaveBeenCalledTimes(2)
  })
})

describe('recorderMimeFor / extForTier(spec §1 派生)', () => {
  it('mp4 tier → avc1 mime;webm tier → vp9 优先退 vp8;其余 null', () => {
    expect(recorderMimeFor('mediarecorder-mp4', () => true)).toBe('video/mp4;codecs=avc1')
    expect(recorderMimeFor('mediarecorder-webm', (m) => m === 'video/webm;codecs=vp9')).toBe('video/webm;codecs=vp9')
    expect(recorderMimeFor('mediarecorder-webm', (m) => m === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8')
    expect(recorderMimeFor('webcodecs-mp4', () => true)).toBeNull()
    expect(recorderMimeFor('none', () => true)).toBeNull()
  })

  it('extForTier:mp4 档→mp4,webm 档→webm,webcodecs→mp4,none→null', () => {
    expect(extForTier('webcodecs-mp4')).toBe('mp4')
    expect(extForTier('mediarecorder-mp4')).toBe('mp4')
    expect(extForTier('mediarecorder-webm')).toBe('webm')
    expect(extForTier('none')).toBeNull()
  })
})
