# 视频导出兜底层（MediaRecorder 兼容路径）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebCodecs 不可用的环境（局域网 IP http、移动端 WebView/微信）自动降级 MediaRecorder 实时录制导出视频（MP4 优先、WebM 兜底），微信内走灯箱长按保存。

**Architecture:** 新增探测层 `videoTier.ts`（WebCodecs → MediaRecorder isTypeSupported 两级判定，会话记忆化）与录制写入器 `videoRecorder.ts`（staging 画布 captureStream + 墙钟 rAF 驱动）；`exportAnimation.ts` 按 tier 分发编码器；App2D/面板/灯箱做状态与交付改造。WebCodecs 主路径零改动。

**Tech Stack:** TypeScript · Vite · React · mediabunny（不动）· MediaRecorder/captureStream · vitest + puppeteer-core（浏览器实测）

**Spec:** `docs/superpowers/specs/2026-10-16-video-export-fallback-design.md`

## Global Constraints

- lint 基线 11 个预先存在错误（均在 3D 文件），验收 = 不新增（`npm run lint`）。
- i18n zh/en 同步新增/修改，键名沿用 `animExport.*` 段。
- UI 不用 emoji 图标；本次无新增图标（徽标为纯文本 `MP4`/`WebM`）。
- 视频预设不变：1280×720 · 30fps · 2 循环 · 8Mbps（`VIDEO_PRESET`）。
- WebCodecs 主路径（`encodeMp4`/`probeVideoSupport`）行为与签名零改动。
- 提交信息末尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`；只 commit 本地 main，不 push。
- 测试命令用 `npx vitest run <file>`（坑：直接 `vitest` 可能跑起 watch 模式）。

---

### Task 1: VideoTier 探测模块

**Files:**
- Create: `src/lib/motion/videoTier.ts`
- Test: `src/lib/motion/videoTier.test.ts`

**Interfaces:**
- Consumes: `probeVideoSupport`、`VIDEO_PRESET`（`src/lib/motion/videoWriter.ts`，已存在）。
- Produces（后续任务依赖，签名精确）:
  - `export type VideoTier = 'webcodecs-mp4' | 'mediarecorder-mp4' | 'mediarecorder-webm' | 'none'`
  - `export async function probeVideoTier(opts?: { probeWebCodecs?: () => Promise<boolean>; probeRecorderMime?: (mime: string) => boolean }): Promise<VideoTier>`
  - `export function recorderMimeFor(tier: VideoTier, probe?: (mime: string) => boolean): string | null`
  - `export function extForTier(tier: VideoTier): 'mp4' | 'webm' | null`（`'none'`/null tier → null）
  - `export function resetVideoTierCache(): void`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/motion/videoTier.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/lib/motion/videoTier.ts
/**
 * 视频导出能力探测层级(spec 2026-10-16-video-export-fallback §1):
 * WebCodecs(mediabunny avc)→ MediaRecorder(mp4;codecs=avc1 → webm vp9/vp8)。
 * 会话级记忆化;探测函数可注入(单测)。WebCodecs 主路径零改动。
 */
import { probeVideoSupport, VIDEO_PRESET } from './videoWriter'

export type VideoTier = 'webcodecs-mp4' | 'mediarecorder-mp4' | 'mediarecorder-webm' | 'none'

/** 默认 MediaRecorder 探测:接口存在 + captureStream 可用 + isTypeSupported。 */
function defaultProbeRecorderMime(mime: string): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    MediaRecorder.isTypeSupported(mime)
  )
}

/** 会话级缓存:探测参数固定(VIDEO_PRESET),单条结果即可。 */
let cachedTier: VideoTier | undefined

export function resetVideoTierCache(): void {
  cachedTier = undefined
}

export async function probeVideoTier(opts?: {
  probeWebCodecs?: () => Promise<boolean>
  probeRecorderMime?: (mime: string) => boolean
}): Promise<VideoTier> {
  if (cachedTier !== undefined) return cachedTier
  const wc = opts?.probeWebCodecs ?? (() =>
    probeVideoSupport({
      width: VIDEO_PRESET.width,
      height: VIDEO_PRESET.height,
      frameRate: VIDEO_PRESET.fps,
      bitrate: VIDEO_PRESET.bitrate,
    }))
  const mr = opts?.probeRecorderMime ?? defaultProbeRecorderMime
  let tier: VideoTier = 'none'
  if (await wc()) {
    tier = 'webcodecs-mp4'
  } else {
    if (mr('video/mp4;codecs=avc1')) tier = 'mediarecorder-mp4'
    else if (mr('video/webm;codecs=vp9') || mr('video/webm;codecs=vp8')) tier = 'mediarecorder-webm'
  }
  cachedTier = tier
  return tier
}

/** tier → MediaRecorder mimeType(webm 档 vp9 优先退 vp8,与探测同序)。 */
export function recorderMimeFor(tier: VideoTier, probe: (mime: string) => boolean = defaultProbeRecorderMime): string | null {
  if (tier === 'mediarecorder-mp4') return 'video/mp4;codecs=avc1'
  if (tier === 'mediarecorder-webm') {
    if (probe('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9'
    if (probe('video/webm;codecs=vp8')) return 'video/webm;codecs=vp8'
    return null
  }
  return null
}

/** tier → 产物扩展名(导出结果 ext 用;webcodecs 同为 mp4)。 */
export function extForTier(tier: VideoTier): 'mp4' | 'webm' | null {
  if (tier === 'webcodecs-mp4' || tier === 'mediarecorder-mp4') return 'mp4'
  if (tier === 'mediarecorder-webm') return 'webm'
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/motion/videoTier.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/motion/videoTier.ts src/lib/motion/videoTier.test.ts
git commit -m "feat: videoTier 两级探测(WebCodecs→MediaRecorder mime 优先级)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: MediaRecorder 录制写入器

**Files:**
- Create: `src/lib/motion/videoRecorder.ts`
- Test: `src/lib/motion/videoRecorder.test.ts`

**Interfaces:**
- Consumes: `ExportCancelledError`、`VIDEO_PRESET`（`videoWriter.ts`）。
- Produces（Task 3 依赖）:
  - `export async function encodeViaMediaRecorder(opts: { canvas: HTMLCanvasElement; mimeType: string; fps: number; durationSec: number; frameCount: number; drawFrame: (t: number, index: number) => Promise<void> | void; onProgress?: (framesDone: number) => void; isCancelled?: () => boolean; now?: () => number; waitNextFrame?: () => Promise<void> }): Promise<Blob>`
  - 返回 Blob 的 type 为容器 mime（`video/mp4` 或 `video/webm`，取 `mimeType.split(';')[0]`）。

- [ ] **Step 1: 写失败测试**

```ts
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
  start(_timeslice?: number) { this.state = 'recording' }
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/motion/videoRecorder.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/lib/motion/videoRecorder.ts
/**
 * MediaRecorder 实时录制写入器(spec 2026-10-16-video-export-fallback §2):
 * WebCodecs 不可用环境的兜底。staging 画布(含水印)captureStream(fps),
 * 墙钟驱动 drawFrame(t),到时补末帧定格再 stop。取消抛 ExportCancelledError。
 * 页面切走 rAF 停转 → 画面冻结段(面板提示文案缓解),不做机械补偿。
 */
import { ExportCancelledError, VIDEO_PRESET } from './videoWriter'

/** 默认下一帧等待:rAF(无 rAF 环境回落 setTimeout,同 exportAnimation.yieldFrame 惯例)。 */
const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0))

export interface MediaRecorderEncodeOptions {
  /** 逐帧内容画布(导出编排的 staging,尺寸恒定,已含水印)。 */
  canvas: HTMLCanvasElement
  /** 'video/mp4;codecs=avc1' | 'video/webm;codecs=vp9|vp8'(recorderMimeFor 给出)。 */
  mimeType: string
  fps: number
  durationSec: number
  frameCount: number
  /** 渲染 t 时刻一帧(index 0 走 renderImage 全参数语义,由编排层保证)。 */
  drawFrame: (t: number, index: number) => Promise<void> | void
  onProgress?: (framesDone: number) => void
  isCancelled?: () => boolean
  /** 测试注入:可控墙钟与帧等待。 */
  now?: () => number
  waitNextFrame?: () => Promise<void>
}

export async function encodeViaMediaRecorder(opts: MediaRecorderEncodeOptions): Promise<Blob> {
  const now = opts.now ?? (() => performance.now())
  const wait = opts.waitNextFrame ?? nextFrame
  const stream = opts.canvas.captureStream(opts.fps)
  const recorder = new MediaRecorder(stream, {
    mimeType: opts.mimeType,
    videoBitsPerSecond: VIDEO_PRESET.bitrate,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start(250)
  const start = now()
  try {
    for (;;) {
      if (opts.isCancelled?.()) throw new ExportCancelledError()
      const t = (now() - start) / 1000
      if (t >= opts.durationSec) break
      const index = Math.min(opts.frameCount - 1, Math.floor(t * opts.fps))
      await opts.drawFrame(t, index)
      opts.onProgress?.(Math.min(opts.frameCount, Math.floor(t * opts.fps) + 1))
      await wait()
    }
    // 末帧定格:画 (durationSec - 1/fps, frameCount-1) 再停,避免结尾拖黑帧
    await opts.drawFrame(opts.durationSec - 1 / opts.fps, opts.frameCount - 1)
    opts.onProgress?.(opts.frameCount)
    recorder.stop()
    await stopped
    return new Blob(chunks, { type: opts.mimeType.split(';')[0] })
  } catch (err) {
    if (recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* 已停 */ }
    }
    await stopped
    throw err
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/motion/videoRecorder.test.ts`
Expected: PASS（3 例全绿）

- [ ] **Step 5: Commit**

```bash
git add src/lib/motion/videoRecorder.ts src/lib/motion/videoRecorder.test.ts
git commit -m "feat: MediaRecorder 实时录制写入器(墙钟驱动/末帧定格/取消释放)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: exportAnimation 按 tier 分发

**Files:**
- Modify: `src/lib/motion/exportAnimation.ts`（video 分支约 175-190 行；`AnimationExportResult` 约 76-80 行；imports 18 行；opts 约 55-74 行）

**Interfaces:**
- Consumes: `VideoTier`/`recorderMimeFor`/`extForTier`（Task 1）、`encodeViaMediaRecorder`（Task 2）、现有 `encodeMp4`/`planVideoFrames`/`VIDEO_PRESET`/`ExportCancelledError`。
- Produces: `RunAnimationExportOptions.videoTier?: VideoTier`（默认 `'webcodecs-mp4'`，旧调用零破坏）；`AnimationExportResult.ext: 'gif' | 'mp4' | 'webm'`。

说明：分发正确性由 Task 6 浏览器测试在真环境验收（`runAnimationExport` 依赖 WebGL/ShaderRenderer，单测 mock 面过大，不做桩测——与仓库现状一致：该文件单测只测纯函数）。

- [ ] **Step 1: 修改类型与分发**

`exportAnimation.ts` 改动点（精确）：

1. import 行（原 18 行）追加：
```ts
import { encodeViaMediaRecorder } from './videoRecorder'
import { extForTier, recorderMimeFor, type VideoTier } from './videoTier'
```
2. `AnimationExportResult` 的 `ext` 类型 `'gif' | 'mp4'` → `'gif' | 'mp4' | 'webm'`。
3. `RunAnimationExportOptions` 在 `format: AnimExportFormat` 后加：
```ts
  /** 视频编码档(探测层给出);默认 webcodecs-mp4 保持旧行为。 */
  videoTier?: VideoTier
```
4. video 分支（原「视频：时长=动效×2…」段，175-190 行）替换为：
```ts
    if (!videoPlan) throw new Error('video-plan-missing')

    // 视频:时长=动效×2;预估体积按码率×时长一次给定
    const videoEstimate = estimateVideoBytesPre(videoPlan.durationSec)
    const tier: VideoTier = opts.videoTier ?? 'webcodecs-mp4'
    const drawFrame = (t: number, i: number) => drawAt(t, i)
    if (tier === 'webcodecs-mp4') {
      const bytes = await encodeMp4({
        canvas: stage,
        width: w,
        height: h,
        fps: videoPlan.fps,
        bitrate: VIDEO_PRESET.bitrate,
        frameCount: videoPlan.frameCount,
        drawFrame,
        onProgress: (done) => opts.onProgress?.(done, videoEstimate),
        isCancelled: opts.isCancelled,
      })
      return { blob: new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), ext: 'mp4', frames: videoPlan.frameCount }
    }
    const mime = recorderMimeFor(tier)
    if (!mime) throw new Error('video-tier-mime-missing')
    const blob = await encodeViaMediaRecorder({
      canvas: stage,
      mimeType: mime,
      fps: videoPlan.fps,
      durationSec: videoPlan.durationSec,
      frameCount: videoPlan.frameCount,
      drawFrame,
      onProgress: (done) => opts.onProgress?.(done, videoEstimate),
      isCancelled: opts.isCancelled,
    })
    return { blob, ext: extForTier(tier)!, frames: videoPlan.frameCount }
```

- [ ] **Step 2: 类型与既有测试回归**

Run: `npx vitest run src/lib/motion/exportAnimation.test.ts && npx tsc --noEmit`
Expected: PASS / 0 错误（lint 基线外不新增——tsc 是主门槛）

- [ ] **Step 3: Commit**

```bash
git add src/lib/motion/exportAnimation.ts
git commit -m "feat: 动图导出按 videoTier 分发(WebCodecs|MediaRecorder),ext 扩 webm

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Lightbox 视频支持 + 移动端视频走灯箱

**Files:**
- Modify: `src/components/Lightbox.tsx`（`LightboxItem` 4-9 行；stage 60-64 行）
- Modify: `src/components/App2D.tsx`（`downloadBlob` 1347-1360 行；`saveLightbox` 节点 1925 行附近）

**Interfaces:**
- Consumes: 现有 `Lightbox`/`planDownload`/`anchorDownload`。
- Produces: `LightboxItem.kind?: 'image' | 'video'`（默认 image）；App2D 内部分流逻辑（无对外接口）。

说明：Lightbox/downloadFlow 无组件级测试基建（仓库现状），本任务验收 = tsc + Task 6 浏览器实测 + 手动目检；`planDownload` 签名不动（复用 `forceLightbox`），`downloadFlow.test.ts` 不需改。

- [ ] **Step 1: Lightbox 支持 video**

`LightboxItem` 加字段：
```ts
export interface LightboxItem {
  objectUrl: string
  fileName: string
  seed: string
  ext: string
  /** 图片(默认)或视频(微信/移动端视频导出走灯箱长按保存)。 */
  kind?: 'image' | 'video'
}
```
stage 内渲染替换（原 `<img src={cur.objectUrl}…>` 一行）：
```tsx
        {cur.kind === 'video'
          ? <video src={cur.objectUrl} controls playsInline loop />
          : <img src={cur.objectUrl} alt={cur.fileName} />}
```
（外层样式沿用 `batch-lightbox-stage`；同时在对应样式文件补一条规则保证 video 与 img 同尺寸约束：`.batch-lightbox-stage video { max-width: 100%; max-height: 100%; }`——找到 `.batch-lightbox-stage img` 所在 CSS 文件，紧随其后追加同选择器组。）

- [ ] **Step 2: App2D downloadBlob 视频分流**

`downloadBlob`（1347 行起）两处改动：
1. 开头取视频标记：
```ts
    const isVideo = ext === 'mp4' || ext === 'webm'
```
2. `planDownload` 调用改（原 `forceLightbox: isMobile && isSvg`）：
```ts
    const plan = planDownload({ isSvg, forceLightbox: isMobile && (isSvg || isVideo) })
```
3. 灯箱分支 setSaveLightbox 的 item 加 `kind: isVideo ? 'video' : 'image'`。

- [ ] **Step 3: 类型回归 + 目检**

Run: `npx tsc --noEmit`
Expected: 0 错误
（视觉目检留到 Task 6 后统一做：微信开发者工具/真机。）

- [ ] **Step 4: Commit**

```bash
git add src/components/Lightbox.tsx src/components/App2D.tsx
git commit -m "feat: 灯箱支持视频(长按保存),移动端视频导出一律走灯箱

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: App2D 探测接线 + 面板展示 + i18n

**Files:**
- Modify: `src/components/App2D.tsx`（`videoSupported` 状态 246-247 行、探测 effect 1401-1414 行、导出 guard 1424 行、视图 1506/1510 行、依赖数组 1471/1513 行）
- Modify: `src/components/MotionExportPanel.tsx`（`MotionExportView` 37-38 行、视频档 label 241-259 行、导出中 meta 324-328 行）
- Modify: `src/i18n/zh.json`（`animExport` 段 677-701 行）、`src/i18n/en.json`（同段）

**Interfaces:**
- Consumes: `probeVideoTier`/`VideoTier`（Task 1）、`runAnimationExport` 的 `videoTier` 参数（Task 3）。
- Produces: `MotionExportView.videoTier: VideoTier | null`（`videoSupported` 字段删除）。

- [ ] **Step 1: i18n 键（zh/en 同步）**

zh.json `animExport` 段：
- `"format.video": "视频 MP4"` → `"视频"`（可能产 WebM，泛化）
- `"videoUnsupported": "此浏览器不支持视频导出，请改用 GIF"` → `"当前环境无法导出视频，请改用 GIF"`
- 新增 `"videoRecordHint": "实时录制中，请保持页面可见"`

en.json 对应：
- `"format.video": "Video"`
- `"videoUnsupported": "Video export unavailable in this environment — use GIF"`
- `"videoRecordHint": "Recording in real time — keep this page visible"`

- [ ] **Step 2: App2D 换 tier**

1. 状态（246-247 行）：
```ts
  /** null=检测中,'none'=禁用视频档(两级探测均落空,probeVideoTier 会话级记忆化) */
  const [videoTier, setVideoTier] = useState<VideoTier | null>(null)
```
（import 追加 `probeVideoTier, type VideoTier` from `../lib/motion/videoTier`。）
2. 探测 effect（1401-1414 行）：`probeVideoSupport({…}).then((ok)=>…)` 换成 `probeVideoTier().then((tier) => { if (alive) setVideoTier(tier) }).catch(() => { if (alive) setVideoTier('none') })`；守卫 `videoSupported !== null` → `videoTier !== null`；依赖数组同步。
3. 导出 guard（1424 行）：`if (!isGif && videoSupported === false) return` → `if (!isGif && videoTier === 'none') return`。
4. `runAnimationExport` 调用（1436-1453 行）加一行：`videoTier: videoTier ?? 'webcodecs-mp4',`。
5. 视图（1506 行）`videoSupported,` → `videoTier,`；`canExport`（1510 行）`(isGif || videoSupported === true)` → `(isGif || (videoTier !== null && videoTier !== 'none'))`。
6. 两处依赖数组（1471、1513 行）`videoSupported` → `videoTier`。

- [ ] **Step 3: 面板展示**

1. `MotionExportView`（37-38 行）：
```ts
  /** null = 检测中,'none' = 禁用视频档(两级探测均落空)。 */
  videoTier: VideoTier | null
```
（import type `{ VideoTier }` from `../lib/motion/videoTier`。）
2. 视频档 label（241、246 行）：`view.videoSupported === false ? ' na' : ''` → `view.videoTier === 'none' ? ' na' : ''`；`disabled={exporting || view.videoSupported === false}` → `disabled={exporting || view.videoTier === 'none'}`。
3. 描述行（258 行）：
```tsx
{view.videoTier === 'none'
  ? t('animExport.videoUnsupported')
  : `720p · 30fps · ${t('animExport.twoLoops')}(${(motion.duration * 2).toFixed(1)}s)` +
    (view.videoTier === 'mediarecorder-mp4' ? ' · MP4' : view.videoTier === 'mediarecorder-webm' ? ' · WebM' : '')}
```
4. 导出中 meta 行（327 行 `{view.phase === 'canceling' …}` 的 span 内，帧数后）追加录制提示：
```tsx
{' '}{view.framesDone}/{view.framesTotal} · {fmtBytes(view.estimatedBytes ?? view.bytesSoFar)}
{view.videoTier !== null && view.videoTier !== 'webcodecs-mp4' && (
  <><br />{t('animExport.videoRecordHint')}</>
)}
```

- [ ] **Step 4: 回归**

Run: `npx vitest run src/lib/motion src/lib/downloadFlow.test.ts && npx tsc --noEmit && npm run lint`
Expected: 测试全 PASS；tsc 0 错；lint 仍为基线 11 错（不新增）

- [ ] **Step 5: Commit**

```bash
git add src/components/App2D.tsx src/components/MotionExportPanel.tsx src/i18n/zh.json src/i18n/en.json
git commit -m "feat: 面板接入 videoTier(徽标/录制提示/归因文案),导出走探测档

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: 浏览器实测——非安全上下文兜底链路

**Files:**
- Modify: `src/lib/motion/exportAnimation.browser.test.ts`（vite config 66-74 行；imports 20 行区；视频用例 300-318 行）

**Interfaces:**
- Consumes: Task 1-5 全部（真实链路）。
- Produces: 无（验收型测试）。

- [ ] **Step 1: 扩展浏览器测试**

1. imports 追加：
```ts
import os from 'node:os'
import { probeVideoTier } from './videoTier'
```
（页内动态 import 部分相应加 `/src/lib/motion/videoTier.ts` 模块。）
2. vite 临时 config（68-72 行）`server` 加 `host: true`（绑 0.0.0.0，供局域网 IP 访问；端口 strictPort 不变）。
3. 新增取局域网 IPv4 的工具函数：
```ts
function lanIpv4(): string | null {
  const addrs = Object.values(os.networkInterfaces()).flat().filter(Boolean) as os.NetworkInterfaceInfo[]
  const hit = addrs.find((a) => a.family === 'IPv4' && !a.internal)
  return hit?.address ?? null
}
```
4. 现有视频用例的 `probe`/`probeAgain` 改为 `tier`/`tierAgain`（页内调 `vt.probeVideoTier()` 两次），断言：`typeof r.tier === 'string'`、`r.tierAgain === r.tier`；`r.tier === 'webcodecs-mp4'` 时走原 ftyp/duration 断言（1.8-2.2s），否则 `expect(r.ok).toBe(false)`——**本机 Chrome headless 实测 tier 为 `webcodecs-mp4`，原断言语义保持**。
5. 新增用例「非安全上下文:MediaRecorder 兜底产真 MP4」：
```ts
  it('非安全上下文(http 局域网 IP):tier=mediarecorder-mp4,产物 ftyp 魔数 + duration 放宽', async () => {
    const ip = lanIpv4()
    if (!ip) return // 无局域网环境跳过(本机必有)
    const r = await runInPageAt(`http://${ip}:${PORT}`, 'video', 'none')
    expect(r.error).toBeUndefined()
    expect(r.tier).toBe('mediarecorder-mp4')
    expect(r.ok).toBe(true)
    expect(r.frames).toBe(60)
    const bytes = Uint8Array.from(atob(r.mp4B64!), (c) => c.charCodeAt(0))
    expect(String.fromCharCode(...bytes.slice(4, 8))).toBe('ftyp')
    // MediaRecorder 时戳精度放宽:目标 2.0s ±0.4
    expect(r.mp4Duration!).toBeGreaterThan(1.6)
    expect(r.mp4Duration!).toBeLessThan(2.4)
  }, 120_000)
```
（`runInPageAt(url, format, watermark)` = 现有 `runInPage` 参数化 goto URL 版本——把 `p.goto(DEV_URL)` 改为 `p.goto(url)`，其余照旧；原 `runInPage` 变为 `runInPageAt(DEV_URL, …)` 的薄封装。页内调用 `runAnimationExport` 时传 `videoTier: tier`（页内先 `probeVideoTier()` 拿真值）。）

- [ ] **Step 2: 跑浏览器测试**

Run: `npx vitest run src/lib/motion/exportAnimation.browser.test.ts`
Expected: 全 PASS（含新非安全上下文用例；swiftshader 渲染较慢，用例超时已放宽 120s）

- [ ] **Step 3: Commit**

```bash
git add src/lib/motion/exportAnimation.browser.test.ts
git commit -m "test: 非安全上下文浏览器实测——MediaRecorder 兜底产真 MP4 取证

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: 收口——全量回归 + lint 基线 + build 冒烟

**Files:**
- 无新改动（验证型任务；发现问题回对应任务修）

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全 PASS

- [ ] **Step 2: lint 基线**

Run: `npm run lint`
Expected: 11 个预先存在错误（3D 文件），无新增

- [ ] **Step 3: build 冒烟**

Run: `npm run build`
Expected: 构建成功（产物含 videoTier/videoRecorder 模块）

- [ ] **Step 4: 真机取证清单交付提醒**

真机项（spec §真机取证清单）不在本计划自动化范围：微信 Android/iOS tier 结果、长按 video 保存菜单、WebM duration 元数据、真机掉帧观察。计划执行完毕后输出该清单给用户按 spec 逐项取证，**长按保存可用性为交付前必判项**。

- [ ] **Step 5: Commit（若有修复性改动才提交）**

```bash
git status --short
# 有改动则:git add -A && git commit -m "fix: 兜底层收口修复(全量回归/lint/build)

# Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
