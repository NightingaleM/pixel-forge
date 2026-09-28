import type { StyleDefinition } from '../types'
import { encodeSeed } from './seedCodec'
import { snapToStep } from './paramValue'

// 这些 uniform 随机会产生不可用结果（居中/旋转类），随机时保持不动
export const SKIP_RANDOM_UNIFORMS = ['uCenterX', 'uCenterY', 'uRotation', 'uAngle']

/** 以 base 为底随机 seedable 参数（select 均匀随机一档，color 均匀随机；
 *  toggle/text/font 保留现值——开关类不随机，棱镜默认关等定稿不受骰子干扰）。 */
export function randomizeParams(
  def: StyleDefinition,
  baseParams: Record<string, number>,
  baseTextParams: Record<string, string>,
  rand: () => number = Math.random,
): { params: Record<string, number>; textParams: Record<string, string> } {
  const params = { ...baseParams }
  const textParams = { ...baseTextParams }
  for (const p of def.params) {
    if (p.type === 'text' || p.type === 'toggle' || p.type === 'font') continue
    if (p.type === 'select') {
      // select 参与随机（v1 种子布局同步）：rand()*n ∈ [0,n) 天然不越界
      params[p.uniform] = p.options[Math.floor(rand() * p.options.length)].value
      continue
    }
    if (p.type === 'color') {
      // 均匀随机 RGB（与 3D 随机一致），rand()*2^24 覆盖含 #FFFFFF 的全值域
      textParams[p.uniform] = '#' + Math.floor(rand() * 16777216).toString(16).padStart(6, '0')
      continue
    }
    if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) continue
    const raw = p.min + rand() * (p.max - p.min)
    // 相对 min 对齐 + clamp + 修浮点尾——与手输路径共用同一把 snapToStep 尺子
    params[p.uniform] = snapToStep(raw, p.min, p.max, p.step, p.default)
  }
  return { params, textParams }
}

/** 随机后直接编码为种子码（批量骰子用）。 */
export function randomSeed(
  def: StyleDefinition,
  baseParams: Record<string, number>,
  baseTextParams: Record<string, string>,
  rand: () => number = Math.random,
): string {
  const r = randomizeParams(def, baseParams, baseTextParams, rand)
  return encodeSeed(def.id, r.params, def, r.textParams)
}
