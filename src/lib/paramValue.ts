// 2D 参数面板数值输入的纯数学，不依赖 React/DOM，便于单测。

/**
 * 把键入值规范化为参数合法值：
 * NaN/Infinity 返回 fallback；clamp 到 [min,max]；相对 min 按 step 对齐并修浮点误差。
 * 对齐后可能因 step 不整除范围而超出 max（如 min=2 max=50 step=7），故再 clamp 一次。
 */
export function snapToStep(
  v: number,
  min: number,
  max: number,
  step: number,
  fallback: number,
): number {
  if (!Number.isFinite(v)) return fallback
  const clamped = Math.min(max, Math.max(min, v))
  const snapped = Math.min(max, min + Math.round((clamped - min) / step) * step)
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return parseFloat(snapped.toFixed(decimals))
}
