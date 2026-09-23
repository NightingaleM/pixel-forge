// src/lib/batch/imageList.ts
// v2 批量行状态纯逻辑:行种子(seed=null ⇔ 跟随整批活基线)与工作副本
// (params/textParams)之间的编解码、随机与任务快照。不依赖 React/DOM 渲染,
// 便于单测;App2D(状态唯一所有者)与 BatchPanel(纯视图)共用。
import type { StyleDefinition, StyleId } from '../../types'
import { encodeSeed, decodeSeed } from '../seedCodec'
import { mergeWithDefaults } from '../presetStore'
import { randomSeed } from '../randomSeed'

// BatchFormat 的定义家在 batchJob(与上限/命名等纯逻辑同处);在此转发,
// 让 App2D/BatchPanel 与本模块的消费者从同一入口拿,避免两处 import 路径
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

/** drain 单轮任务组装:对给定行「此刻」逐行取生效种子(id/image 顺序保留)。
 *  why 不能在 drain 外先建一份种子 Map 快照再进循环:drain 运行期间行种子会被
 *  重骰/「全部随机」改写(改写即回 pending 等下一轮),陈旧 Map 会让改写后的行
 *  仍按旧种子跑、重跑出同图。base/def 由调用方传入 drain 启动时的定格快照,
 *  对未改写的行,此刻逐行取值与启动快照确定性等价(不引入新的漂移)。 */
export function assembleProcessingTasks(
  rows: BatchImage[],
  base: BatchBase,
  def: StyleDefinition,
): { id: string; image: HTMLImageElement; seed: string }[] {
  return rows.map((r) => ({ id: r.id, image: r.image, seed: rowEffectiveSeed(r, base, def) }))
}

/** perImage 模式「类型感知双写」分派(纯):被编辑 uniform 是否必须同时写整批基线。
 *  toggle/select(数值流)与 text(文本流)不参与种子编码,批量渲染只能从基线
 *  取值(runBatch.resolveRowRenderState 基线打底),不双写 base 即 WYSIWYG 失守
 *  ——预览变了、批量出图仍是旧值;这些参数按任务级共享语义与 base 同步(spec
 *  「整批共享一份」)。数值/color 由种子携带,仍只写工作副本(编回行种子)。
 *  def 缺失或 uniform 不在风格参数表中回 false,维持既有「只写工作副本」行为。 */
export function isTaskSharedEdit(
  def: StyleDefinition | undefined,
  uniform: string,
  kind: 'number' | 'text',
): boolean {
  const p = def?.params.find((q) => q.uniform === uniform)
  if (!p) return false
  return kind === 'number' ? p.type === 'toggle' || p.type === 'select' : p.type === 'text'
}

/** SeedBar 粘贴校验:种子风格与目标一致才放行(批量行不随种子切风格,
 *  activeStyle 全局唯一);decode 失败视为不匹配。 */
export function seedMatchesStyle(seed: string, styleId: StyleId): boolean {
  return decodeSeed(seed)?.styleId === styleId
}

/** blob MIME → 扩展名。行的实际格式可能与面板所选不同(effectiveFormat 会按
 *  风格把 svg 回退 png),下载命名与灯箱标注以 blob 为准。 */
export function blobExt(b: Blob): string {
  return b.type === 'image/svg+xml' ? 'svg' : b.type === 'image/jpeg' ? 'jpg' : 'png'
}

/** 行种子展示语义(v3):统一模式一律返回基线编码码(统一语义下行 seed 恒为
 *  跟随,残留非 null 值容错忽略);独立模式非 null 行原样透传(不校验,校验在
 *  上游),null 返回 null 由视图层渲染「跟随」短标。与 rowEffectiveSeed 的
 *  区别:后者把 null 编码成基线码供处理任务消费,前者把「跟随」语义保留给 UI。 */
export function displaySeed(
  img: BatchImage,
  mode: 'unified' | 'perImage',
  base: BatchBase,
  def: StyleDefinition,
): string | null {
  if (mode === 'perImage') return img.seed
  return encodeSeed(def.id, base.params, def, base.textParams)
}

/** 种子码截断:保前缀(版本位+风格位在头部,保前缀即可辨),超出加省略号。 */
export function truncateSeed(code: string, keep = 7): string {
  return code.length <= keep ? code : code.slice(0, keep) + '…'
}

/** 行种子展示视图(v3):App2D 统一计算后下发,ImageStrip 种子条与 BatchPanel
 *  行列表共用同一份数据,两处显示永不漂移。full=null ⇔ 「跟随」短标。 */
export interface RowSeedView {
  id: string
  full: string | null
  short: string | null
}
