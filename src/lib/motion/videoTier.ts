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
