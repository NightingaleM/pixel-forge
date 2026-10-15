// src/lib/motion/videoRecorder.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeViaMediaRecorder } from './videoRecorder'
import { ExportCancelledError } from './videoWriter'

/** 假 MediaRecorder:记录实例与调用,stop 时吐一块数据并触发 onstop。 */
class FakeRecorder {
  static instances: FakeRecorder[] = []
  state = 'inactive'
  mimeType: string
  bitrate: number
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_stream: unknown, opts: { mimeType?: string; videoBitsPerSecond?: number }) {
    this.mimeType = opts.mimeType ?? ''
    this.bitrate = opts.videoBitsPerSecond ?? 0
    FakeRecorder.instances.push(this)
  }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['frame-bytes']) })
    this.onstop?.()
  }
}

afterEach(() => { FakeRecorder.instances = []; vi.unstubAllGlobals() })

/** 可控墙钟:t 手动推进,waitNextFrame 每次模拟一帧间隔(1000/fps ms)。 */
function makeClock(fps: number) {
  let t = 0
  return { now: () => t, tickFrame: async () => { t += 1000 / fps } }
}

function makeCanvas(): HTMLCanvasElement {
  return { captureStream: (fps: number) => ({ kind: 'fake-stream', fps }) } as unknown as HTMLCanvasElement
}

describe('encodeViaMediaRecorder(spec §2)', () => {
  it('墙钟走完:首帧 (0,0)、末帧定格、stop 收 chunks 成 Blob', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    const fps = 30
    const clock = makeClock(fps)
    const frames: Array<[number, number]> = []
    const blob = await encodeViaMediaRecorder({
      canvas: makeCanvas(),
      mimeType: 'video/mp4;codecs=avc1',
      fps,
      durationSec: 1,
      frameCount: 30,
      drawFrame: async (t, i) => { frames.push([t, i]) },
      onProgress: () => {},
      now: clock.now,
      waitNextFrame: clock.tickFrame,
    })
    const rec = FakeRecorder.instances[0]!
    expect(rec.mimeType).toBe('video/mp4;codecs=avc1')
    expect(rec.bitrate).toBe(8e6)
    expect(rec.state).toBe('inactive')
    expect(frames[0]).toEqual([0, 0])
    // 末帧:t 达标后补画 (durationSec - 1/fps, frameCount-1) 定格再 stop
    const last = frames[frames.length - 1]!
    expect(last[1]).toBe(29)
    expect(last[0]).toBeCloseTo(1 - 1 / fps, 6)
    expect(blob.type).toBe('video/mp4')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('取消:抛 ExportCancelledError,不产出 Blob', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    const fps = 30
    const clock = makeClock(fps)
    let calls = 0
    await expect(encodeViaMediaRecorder({
      canvas: makeCanvas(),
      mimeType: 'video/webm;codecs=vp9',
      fps,
      durationSec: 1,
      frameCount: 30,
      drawFrame: async () => { calls++ },
      now: clock.now,
      waitNextFrame: clock.tickFrame,
      isCancelled: () => calls >= 2,
    })).rejects.toBeInstanceOf(ExportCancelledError)
    expect(FakeRecorder.instances[0]!.state).toBe('inactive') // 取消路径也 stop 释放
  })

  it('进度:framesDone 单调,最终到 frameCount', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    const fps = 30
    const clock = makeClock(fps)
    const seen: number[] = []
    await encodeViaMediaRecorder({
      canvas: makeCanvas(),
      mimeType: 'video/mp4;codecs=avc1',
      fps,
      durationSec: 1,
      frameCount: 30,
      drawFrame: async () => {},
      onProgress: (d) => seen.push(d),
      now: clock.now,
      waitNextFrame: clock.tickFrame,
    })
    expect(seen[seen.length - 1]).toBe(30)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!)
  })
})
