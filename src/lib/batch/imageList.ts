// src/lib/batch/imageList.ts
// v2 批量行状态纯逻辑:行种子(seed=null ⇔ 跟随整批活基线)与工作副本
// (params/textParams)之间的编解码、随机与任务快照。不依赖 React/DOM 渲染,
// 便于单测;App2D(状态唯一所有者)与 BatchPanel(纯视图)共用。
import type { StyleDefinition, StyleId } from '../../types'
import { encodeSeed, decodeSeed } from '../seedCodec'
import { mergeWithDefaults } from '../presetStore'
import { randomSeed } from '../randomSeed'

// v2 期间 batchJob 仍持有 BatchFormat(T4 才退役重排);在此转发,
// 让 T2/T3 与 BatchImage 从同一入口消费,避免两处 import 路径
export type { BatchFormat } from './batchJob'

/** 批量图片行(替代 v1 BatchRow:行状态从 BatchJob 上移到 App2D)。 */
export interface BatchImage {
  id: string
  fileName: string
  image: HTMLImageElement
  /** null=跟随整批基线(统一模式天然连续);非 null 为独立模式的行种子。 */
  seed: string | null
  status: 'pending' | 'processing' | 'done' | 'failed'
  blob: Blob | null
  objectUrl: string | null
  error: string | null
  /** done 时的渲染元数据快照(v1 语义沿用):结果定格时刻的种子/风格,
   *  重骰/换基线后旧结果仍按生成时刻标注。 */
  renderedSeed: string | null
  /** v2 行种子限定当前风格,此值恒等于 activeStyle;字段保留以兼容命名/灯箱。 */
  renderedStyleId: StyleId | null
}

/** 整批共享基线:统一模式即唯一状态;独立模式是行 seed=null 的回退目标。 */
export interface BatchBase {
  params: Record<string, number>
  textParams: Record<string, string>
}

/** 行的生效种子:null 时按需编码基线(与 App2D 顶部 seed useMemo 同式)。 */
export function rowEffectiveSeed(img: BatchImage, base: BatchBase, def: StyleDefinition): string {
  return img.seed ?? encodeSeed(def.id, base.params, def, base.textParams)
}

/** 懒同步:工作副本编回行种子。返回新对象(React 状态不可变更新),seed 恒非 null。 */
export function syncRowSeed(
  img: BatchImage,
  def: StyleDefinition,
  working: { params: Record<string, number>; textParams: Record<string, string> },
): BatchImage {
  return { ...img, seed: encodeSeed(def.id, working.params, def, working.textParams) }
}

/** 行种子 → 工作副本。与 App2D.handleApplySeed 同 merge 语义:decode 产出以
 *  风格默认为底合并(toggle/select/text 不在种子内,回风格默认——与单图粘贴
 *  种子行为一致);styleId 用传入 def 而非种子内风格,异风格种子容错解析
 *  (数值照用,由调用方在上游拒绝异风格输入)。null/解析失败回基线,不抛错。 */
export function loadWorking(
  img: BatchImage,
  base: BatchBase,
  def: StyleDefinition,
): { params: Record<string, number>; textParams: Record<string, string> } {
  const decoded = img.seed === null ? null : decodeSeed(img.seed)
  if (!decoded) {
    // 回基线:拷贝一份,避免调用方编辑工作副本时污染共享的 base 对象
    return { params: { ...base.params }, textParams: { ...base.textParams } }
  }
  return mergeWithDefaults(def, decoded.params, decoded.colorParams)
}

/** 重骰单行:以基线为底随机(toggle/select/text 保留基线值),返回新对象。 */
export function randomizeRowSeed(
  img: BatchImage,
  def: StyleDefinition,
  base: BatchBase,
  rand?: () => number,
): BatchImage {
  return { ...img, seed: randomSeed(def, base.params, base.textParams, rand) }
}

/** 开始处理快照:定格每行 effective seed(id 顺序保留)。之后调参只影响
 *  下一次处理,进行中任务不受影响——快照即隔离边界。 */
export function snapshotTaskSeeds(
  images: BatchImage[],
  base: BatchBase,
  def: StyleDefinition,
): { id: string; seed: string }[] {
  return images.map((img) => ({ id: img.id, seed: rowEffectiveSeed(img, base, def) }))
}

/** SeedBar 粘贴校验:种子风格与目标一致才放行(批量行不随种子切风格,
 *  activeStyle 全局唯一);decode 失败视为不匹配。 */
export function seedMatchesStyle(seed: string, styleId: StyleId): boolean {
  return decodeSeed(seed)?.styleId === styleId
}
