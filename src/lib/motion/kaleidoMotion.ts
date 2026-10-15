/**
 * 万花筒动效的 UI 态与内核时间轴的胶水(wayfinder kaleido-motion spec §4:
 * 风格侧仅声明「参数名 → uniform」映射;本期 UI 仅万花筒开放)。
 * MotionUiState 是面板工作态(pingpong 的 a 不存,恒=左侧滑杆当前值);
 * buildMotionTimeline 在采样时刻把滑杆值注入 a / v₀——拖动即时生效的来源。
 */
import { hasAnimatedParams, type MotionParams, type MotionSpec, type MotionTimeline } from './kernel'

export type MotionParamKey = 'zoom' | 'centerX' | 'centerY'
export const MOTION_PARAM_KEYS: MotionParamKey[] = ['zoom', 'centerX', 'centerY']

/** 参数名 → uniform 映射(风格侧声明;未来其他风格接入=换一张表)。 */
export const MOTION_UNIFORMS: Record<MotionParamKey, string> = {
  zoom: 'uZoom',
  centerX: 'uCenterX',
  centerY: 'uCenterY',
}

/** 每参数动效 UI 态(b/speed 独立持有;pingpong 起点恒=左侧滑杆当前值,不入此态)。 */
export interface MotionParamUiState {
  type: 'static' | 'pingpong' | 'drift'
  /** 往返终点 B。 */
  b: number
  /** 漂移速度(±0.6/s)。 */
  speed: number
}

export interface MotionUiState {
  on: boolean
  /** 整循环时长 1–10s,默认 3。 */
  duration: number
  params: Record<MotionParamKey, MotionParamUiState>
}

export function initialMotionUiState(): MotionUiState {
  return {
    on: false,
    duration: 3,
    params: {
      // 缩放默认往返呼吸(lab 同款首启观感),X 默认往返,Y 默认静止
      zoom: { type: 'pingpong', b: 1.6, speed: 0.3 },
      centerX: { type: 'pingpong', b: 0.25, speed: 0.15 },
      centerY: { type: 'static', b: -0.25, speed: 0.15 },
    },
  }
}

function toSpec(p: MotionParamUiState, liveValue: number): MotionSpec {
  if (p.type === 'pingpong') return { type: 'pingpong', a: liveValue, b: p.b }
  if (p.type === 'drift') return { type: 'drift', speed: p.speed }
  return { type: 'static' }
}

/** UI 态 + 当前滑杆值 → 内核时间轴(a/v₀ 即时注入,所见即所调)。 */
export function buildMotionTimeline(motion: MotionUiState, values: Record<string, number>): MotionTimeline {
  const base: Record<string, number> = {}
  const params: MotionParams = {}
  for (const key of MOTION_PARAM_KEYS) {
    const v = values[MOTION_UNIFORMS[key]] ?? 0
    base[key] = v
    params[key] = toSpec(motion.params[key], v)
  }
  return { duration: motion.duration, base, params }
}

/** 预览 rAF 启停条件:总开关开 且 任一参数非静止(spec §4)。 */
export function isMotionActive(motion: MotionUiState): boolean {
  if (!motion.on) return false
  const tl: MotionTimeline = {
    duration: motion.duration,
    base: {},
    params: Object.fromEntries(
      MOTION_PARAM_KEYS.map((k) => [k, toSpec(motion.params[k], 0)]),
    ) as unknown as MotionParams,
  }
  return hasAnimatedParams(tl)
}

/** GIF 自定义档(仅 GIF 可调;视频仅预设,spec §1)。 */
export interface GifSettingsUi {
  size: number
  fps: number
}

export const GIF_SIZE_OPTIONS = [256, 512, 768, 1024] as const
export const GIF_FPS_OPTIONS = [8, 10, 12, 15, 20, 24] as const
export const GIF_DEFAULTS: GifSettingsUi = { size: 512, fps: 12 }
