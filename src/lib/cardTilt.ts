// src/lib/cardTilt.ts
// 转卡手感引擎(wayfinder/holofoil-card 票04 demo 定稿、票06 规格):目标倾角→
// 阻尼平滑→CSS rotateX/rotateY + 箔色流动 uniform。DOM/CSS 与 WebGL 重渲都经
// onFrame 回调交调用方闭包执行(引擎只管数学与节奏)。
// 手感四值=产品常量不入种子码:幅度默认 12°(悬浮窗 5-20 可调,会话态)、
// 自摆/阴影微动默认开(悬浮窗可关)、流动增益 2.6 封死在 shader 内。
// 外观两值(圆角/黑底舞台)同为会话态,引擎数学不消费——由 React 侧与导出
// 模板读 CardTiltFeel 渲染。
export const CARD_TILT_IDLE_DELAY = 2500
export const CARD_TILT_DAMPING = 0.10
export const CARD_TILT_SWING = 0.42
export const CARD_TILT_REDRAW_THRESHOLD = 0.0015
/** 指针超出卡面仍有余量,钳到 1.35 满幅感(demo 同值) */
export const CARD_TILT_CLAMP = 1.35

export interface CardTiltFeel {
  /** 幅度 5..20,默认 12 */
  amp: number
  /** 箔色流动(关=只转卡不变色) */
  flow: boolean
  /** 闲置自摆 */
  idle: boolean
  /** 阴影/高光微动 */
  light: boolean
  /** 卡面圆角 px 0..48,默认 16(与导出闪卡 HTML 定稿值一致) */
  radius: number
  /** 转卡舞台纯黑背景 */
  darkBg: boolean
}

export const DEFAULT_CARD_TILT_FEEL: CardTiltFeel = {
  amp: 12, flow: true, idle: true, light: true, radius: 16, darkBg: true,
}

export interface CardTiltFrame {
  /** 平滑后倾角 -1..1 */
  cx: number
  cy: number
  /** CSS 角度(度,已乘 amp) */
  rx: number
  ry: number
  /** 流动开时的 uniform 值(关=0) */
  fx: number
  fy: number
  idleActive: boolean
  /** 是否需要 WebGL 重渲(流动倾角变化超阈值) */
  redraw: boolean
}

/** 单步数学(纯函数,可单测):自摆接管 → 阻尼平滑 → 帧数据。
 *  state 与 lastTilt 由调用方持有(引擎实例/测试各自管理)。 */
export function stepTilt(
  state: { tx: number; ty: number; cx: number; cy: number; lastPointer: number },
  feel: CardTiltFeel,
  t: number,
  lastTilt: [number, number],
): CardTiltFrame {
  const idleActive = feel.idle && t - state.lastPointer > CARD_TILT_IDLE_DELAY
  if (idleActive) {
    // Lissajous 式小圈,幅度挂钩 swing 比例(12° 时约 ±5°)
    state.tx = Math.sin(t / 1500) * CARD_TILT_SWING
    state.ty = Math.cos(t / 1800) * CARD_TILT_SWING * 0.72
  }
  state.cx += (state.tx - state.cx) * CARD_TILT_DAMPING
  state.cy += (state.ty - state.cy) * CARD_TILT_DAMPING

  const rx = -state.cy * feel.amp
  const ry = state.cx * feel.amp
  const fx = feel.flow ? state.cx : 0
  const fy = feel.flow ? state.cy : 0
  const redraw =
    Math.abs(fx - lastTilt[0]) > CARD_TILT_REDRAW_THRESHOLD ||
    Math.abs(fy - lastTilt[1]) > CARD_TILT_REDRAW_THRESHOLD
  if (redraw) {
    lastTilt[0] = fx
    lastTilt[1] = fy
  }
  return { cx: state.cx, cy: state.cy, rx, ry, fx, fy, idleActive, redraw }
}

export class CardTiltEngine {
  private state = { tx: 0, ty: 0, cx: 0, cy: 0, lastPointer: performance.now() }
  private lastTilt: [number, number] = [99, 99]
  private raf = 0
  feel: CardTiltFeel = { ...DEFAULT_CARD_TILT_FEEL }
  onFrame: ((f: CardTiltFrame) => void) | null = null

  /** 指针位置(相对卡面中心归一化 -1..1,允许超界)→ 目标倾角 */
  pointerTo(nx: number, ny: number): void {
    const c = CARD_TILT_CLAMP
    this.state.tx = Math.max(-c, Math.min(c, nx))
    this.state.ty = Math.max(-c, Math.min(c, ny))
    this.state.lastPointer = performance.now()
  }

  /** 离开/抬手:目标回正(若 idle 开,2.5s 后自摆接管) */
  release(): void {
    this.state.tx = 0
    this.state.ty = 0
    this.state.lastPointer = performance.now()
  }

  /** useShader 重链接后 uniform 复位:强制下一帧重设 uTilt(参数变化触发的
   *  renderWithStyle 之后由调用方调) */
  forceRedraw(): void {
    this.lastTilt = [99, 99]
  }

  setFeel(patch: Partial<CardTiltFeel>): void {
    this.feel = { ...this.feel, ...patch }
  }

  start(): void {
    if (this.raf) return
    // 开档视为一次交互:lastPointer 刷新,静止 2.5s 后自摆才接管(否则引擎是
    // 页面加载时创建的,lastPointer 早过期,开转卡立即自摆)
    this.state.lastPointer = performance.now()
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop)
      this.step(t)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    // 停机归零:下次 start 从正位开始,不留残余倾角
    this.state.tx = 0
    this.state.ty = 0
    this.state.cx = 0
    this.state.cy = 0
    this.lastTilt = [99, 99]
  }

  private step(t: number): void {
    this.onFrame?.(stepTilt(this.state, this.feel, t, this.lastTilt))
  }
}
