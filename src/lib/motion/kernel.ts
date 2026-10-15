/**
 * 通用动效时间轴内核(万花筒动图导出, wayfinder kaleido-motion spec §4)。
 *
 * 纯函数、零 React 依赖;风格侧仅声明「参数名 → uniform」映射即可接入,
 * 内核不知道任何具体风格。预览与导出共享同一条 sample 数学:
 * 预览 rAF 喂实时 t,导出按 t = 帧号/fps 确定性反推。
 */

/** 单参数动效类型。
 *  - static: 静止,值恒为当前滑杆值(base)。
 *  - pingpong: 往返,起点 a(与左侧滑杆实时同步)→ 终点 b → 回 a,余弦缓动。
 *  - drift: 单向漂移,速度恒定线性积分(X/Y 专属;缩放无漂移,无法无缝循环)。 */
export type MotionSpec =
  | { type: 'static' }
  | { type: 'pingpong'; a: number; b: number }
  | { type: 'drift'; speed: number }

/** 参数名 → 动效声明。键即风格参数名(如 zoom/centerX/centerY)。 */
export type MotionParams = Record<string, MotionSpec>

/** 一条动效时间轴:参数动效 + 当前基准值 + 整循环时长。 */
export interface MotionTimeline {
  /** 整循环(去+回)时长 T,秒;默认 3,可调 1–10。 */
  duration: number
  /** 当前滑杆值:static 恒值与 drift 起点积分 v₀ 的来源。pingpong 的 a 存在 spec 里。 */
  base: Record<string, number>
  params: MotionParams
}

/** 漂移循环周期 = 4 uCenter 单位:着色器 tileMirror 周期 2(UV),uCenter 项再乘 0.5,
 *  uCenter 每变 4.0 画面重合——GIF 无缝要求 |速度|×循环时长 ∈ 4 的整数倍。 */
export const DRIFT_LOOP_PERIOD = 4

/** 吸附 ceil 的浮点防护:|s|·T 恰为周期整数时浮点可能略超,裸 ceil 会多跳一档。 */
const CEIL_EPS = 1e-9

/** 采样单个参数在 t 秒时刻的值。 */
function sampleSpec(spec: MotionSpec, base: number, t: number, duration: number): number {
  switch (spec.type) {
    case 'static':
      return base
    case 'pingpong': {
      // 相位回卷到 [0,1):t=T 时严格回到相位 0,循环点与 t=0 逐位相等;
      // 余弦缓动让速度渐起渐停,循环点两侧对称无顿挫。
      const ph = ((t / duration) % 1 + 1) % 1
      const ease = (1 - Math.cos(2 * Math.PI * ph)) / 2
      return spec.a + (spec.b - spec.a) * ease
    }
    case 'drift':
      return base + spec.speed * t
  }
}

/** 采样整条时间轴:返回 params 声明的每个参数在 t 秒时刻的有效值。 */
export function sampleMotion(tl: MotionTimeline, t: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of Object.keys(tl.params)) {
    out[key] = sampleSpec(tl.params[key], tl.base[key] ?? 0, t, tl.duration)
  }
  return out
}

/** 是否存在任一非静止参数——预览 rAF 的启停边界:全静止/未开动效即停,回按需渲染。 */
export function hasAnimatedParams(tl: MotionTimeline): boolean {
  return Object.values(tl.params).some((s) => s.type !== 'static')
}

/**
 * GIF 导出时的漂移速度吸附(spec §3):ceil 到最近整周期倍数(保号、非零保证)。
 * 吸附后 |eff|·T 严格是 DRIFT_LOOP_PERIOD 的整数倍 → GIF 循环无缝;
 * 预览不受影响,只在导出面板 GIF 档提示行展示对齐后的有效速度。
 */
export function alignDriftForGif(speed: number, loopSeconds: number): number {
  const sign = speed < 0 ? -1 : 1
  const cycles = Math.ceil((Math.abs(speed) * loopSeconds) / DRIFT_LOOP_PERIOD - CEIL_EPS)
  const n = Math.max(cycles, 1)
  return (sign * n * DRIFT_LOOP_PERIOD) / loopSeconds
}
