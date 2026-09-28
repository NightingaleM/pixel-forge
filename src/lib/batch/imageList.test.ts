// src/lib/batch/imageList.test.ts
// v2 行状态纯逻辑测试:行种子(null=跟随基线)与工作副本的编解码往返、
// 容错回退、随机与快照。构造方式参考 batchJob.test.ts(halftone 造基线与种子)。
import { describe, it, expect } from 'vitest'
import {
  rowEffectiveSeed, syncRowSeed, loadWorking, randomizeRowSeed,
  assembleProcessingTasks, isTaskSharedEdit, seedMatchesStyle, blobExt,
  displaySeed, rowDisplaySeed, rowPreviewSig, truncateSeed,
  type BatchImage, type BatchBase,
} from './imageList'
import { getStyle } from '../StyleRegistry'
// 静态 import(describe 回调内的顶层 await import 在 vitest 不合法)
import { encodeSeed, decodeSeed } from '../seedCodec'
import { randomSeed } from '../randomSeed'

const def = getStyle('halftone')!
// 基线含非默认值(uColorMode=0/uShape=2),用于区分「回基线」与「回风格默认」两种兜底
const base: BatchBase = {
  params: { uCellSize: 9, uDotScale: 1.2, uColorMode: 0, uAngle: 45, uShape: 2, uHueShift: 30 },
  textParams: {},
}

/** 构造最小行:纯逻辑不触达 DOM,image 用空对象顶替(测试环境无 HTMLImageElement)。 */
function makeRow(overrides: Partial<BatchImage> = {}): BatchImage {
  return {
    id: 'r1',
    fileName: 'cake.jpg',
    image: {} as HTMLImageElement,
    seed: null,
    status: 'pending',
    blob: null,
    objectUrl: null,
    error: null,
    renderedSeed: null,
    renderedStyleId: null,
    previewUrl: null,
    previewSig: null,
    ...overrides,
  }
}

describe('rowEffectiveSeed', () => {
  it('seed=null 时按需编码基线', () => {
    expect(rowEffectiveSeed(makeRow(), base, def))
      .toBe(encodeSeed('halftone', base.params, def, base.textParams))
  })
  it('seed 非 null 时原样返回行种子(不校验,校验职责在上游)', () => {
    expect(rowEffectiveSeed(makeRow({ seed: '0A5' }), base, def)).toBe('0A5')
  })
})

describe('syncRowSeed', () => {
  it('工作副本编回行种子:seed 恒非 null,decode 往返保留 seedable 值', () => {
    const working = { params: { ...base.params, uCellSize: 33 }, textParams: {} }
    const synced = syncRowSeed(makeRow(), def, working)
    expect(synced.seed).not.toBeNull()
    const decoded = decodeSeed(synced.seed!)!
    expect(decoded.styleId).toBe('halftone')
    expect(decoded.params.uCellSize).toBe(33)
    expect(decoded.params.uAngle).toBe(45)
  })
  it('返回新对象,原行不被改动(React 不可变更新依赖)', () => {
    const row = makeRow()
    const synced = syncRowSeed(row, def, { params: {}, textParams: {} })
    expect(synced).not.toBe(row)
    expect(row.seed).toBeNull()
    // 空 working 也合法:encodeSeed 对缺失参数取风格默认
    expect(decodeSeed(synced.seed!)).not.toBeNull()
  })
})

describe('loadWorking', () => {
  it('seed=null 回基线', () => {
    const w = loadWorking(makeRow(), base, def)
    expect(w.params).toEqual(base.params)
    expect(w.textParams).toEqual(base.textParams)
  })
  it('非法 seed 回基线且不抛错', () => {
    // 版本错/长度不足/非法字符/空串,decodeSeed 一律 null
    for (const bad of ['zz', '', '0', '9ZZZ']) {
      const w = loadWorking(makeRow({ seed: bad }), base, def)
      expect(w.params).toEqual(base.params)
      expect(w.textParams).toEqual(base.textParams)
    }
  })
  it('有 seed 行解析为工作副本:seedable 项取种子值', () => {
    const seed = encodeSeed('halftone', { ...base.params, uCellSize: 33 }, def, {})
    const w = loadWorking(makeRow({ seed }), base, def)
    expect(w.params.uCellSize).toBe(33)
    expect(w.params.uAngle).toBe(45)
  })
  it('与 handleApplySeed 同 merge 语义:select/toggle 随种子码携带(v1)', () => {
    // v1 布局种子=完整配方:select 档随码走(取非默认值 2 以示区分);
    // 旧 v0 码不携带离散档 → 解码缺失,由 merge 回风格默认——双版本语义见 seedCodec
    const seed = encodeSeed('halftone', { ...base.params, uColorMode: 2, uShape: 2 }, def, {})
    const w = loadWorking(makeRow({ seed }), base, def)
    expect(w.params.uColorMode).toBe(2)
    expect(w.params.uShape).toBe(2)
  })
  it('异风格种子容错解析:不抛错,参数集按传入 def 补齐', () => {
    // 上游(SeedBar 粘贴校验)会拒绝异风格;此处只保证拿到种子不崩:
    // popart 专属 uniform 被丢弃,同名 uniform(uHueShift)数值仍可用
    const seed = encodeSeed('popart', {}, getStyle('popart')!, {})
    const w = loadWorking(makeRow({ seed }), base, def)
    expect(w.params).toHaveProperty('uCellSize')
    expect(w.params).not.toHaveProperty('uSaturation')
    expect(w.params.uHueShift).toBe(88) // popart 默认值经种子带过来
  })
  it('往返:loadWorking(syncRowSeed(working)) 保留 working 的 seedable 键值', () => {
    // sketch 带 color 档(存于 textParams),覆盖 color 的编码往返
    const sketchDef = getStyle('sketch')!
    const working = {
      params: { uEdgeWidth: 2.5, uSensitivity: 0.5, uDetail: 0.8, uHatchDensity: 6, uEdgeMethod: 0 },
      textParams: { uBgColor: '#102030', uLineColor: '#ff8800' },
    }
    const synced = syncRowSeed(makeRow(), sketchDef, working)
    const w = loadWorking(synced, { params: {}, textParams: {} }, sketchDef)
    expect(w).toMatchObject({
      params: { uEdgeWidth: 2.5, uSensitivity: 0.5, uDetail: 0.8, uHatchDensity: 6 },
      textParams: { uBgColor: '#102030', uLineColor: '#ff8800' },
    })
    // toggle(uHatching) 不参与随机但参与编码:working 缺省 → 风格默认 0 随码往返;
    // select(uEdgeMethod) v1 起随码携带:working 值 0 往返保留(不再回风格默认 1)
    expect(w.params.uHatching).toBe(0)
    expect(w.params.uEdgeMethod).toBe(0)
  })
})

describe('randomizeRowSeed', () => {
  it('产出合法种子,与 randomSeed(def, base, rand) 一致,原行不改', () => {
    const rand = () => 0.42
    const row = makeRow()
    const r = randomizeRowSeed(row, def, base, rand)
    expect(decodeSeed(r.seed!)).not.toBeNull()
    expect(r.seed).toBe(randomSeed(def, base.params, base.textParams, rand))
    expect(r).not.toBe(row)
    expect(row.seed).toBeNull()
  })
  it('缺省 rand 可用(默认 Math.random)', () => {
    const r = randomizeRowSeed(makeRow(), def, base)
    expect(decodeSeed(r.seed!)).not.toBeNull()
  })
})

describe('assembleProcessingTasks', () => {
  it('逐行 effective seed,id/image 顺序保留(null 行编码基线,非 null 原样)', () => {
    const imgA = {} as HTMLImageElement
    const imgB = {} as HTMLImageElement
    const tasks = assembleProcessingTasks(
      [makeRow({ id: 'a', image: imgA, seed: null }), makeRow({ id: 'b', image: imgB, seed: '0A5' })],
      base, def,
    )
    expect(tasks).toEqual([
      { id: 'a', image: imgA, seed: encodeSeed('halftone', base.params, def, base.textParams) },
      { id: 'b', image: imgB, seed: '0A5' },
    ])
  })
  it('回归:drain 期间行种子被改写后,再次组装取新种子(不用启动时的陈旧快照)', () => {
    // 场景:drain 首轮跑完 r1 后,用户对 r1 重骰(row.seed 被改写并回 pending),
    // 下一轮组装必须用新种子,否则重跑出同图
    const row = makeRow({ id: 'r1', seed: null })
    const first = assembleProcessingTasks([row], base, def)
    const rerolled = { ...row, seed: '0B7' }
    const second = assembleProcessingTasks([rerolled], base, def)
    expect(second[0].seed).toBe('0B7')
    expect(second[0].seed).not.toBe(first[0].seed)
  })
  it('base/def 定格下对未改写的行确定性等价(同输入两次组装结果相同)', () => {
    const row = makeRow({ id: 'r1' })
    expect(assembleProcessingTasks([row], base, def)[0].seed)
      .toBe(assembleProcessingTasks([row], base, def)[0].seed)
  })
  it('空列表返回空', () => {
    expect(assembleProcessingTasks([], base, def)).toEqual([])
  })
})

describe('isTaskSharedEdit', () => {
  it('数值流:toggle/select 回 true(不参与种子编码,须双写基线)', () => {
    expect(isTaskSharedEdit(def, 'uColorMode', 'number')).toBe(true)   // halftone select
    expect(isTaskSharedEdit(getStyle('diffusion')!, 'uGrayscale', 'number')).toBe(true) // toggle
  })
  it('数值流:seedable 数值参数回 false(由种子携带,只写工作副本)', () => {
    expect(isTaskSharedEdit(def, 'uCellSize', 'number')).toBe(false)
  })
  it('文本流:text 回 true(如 ascii 字符集,不参与种子编码)', () => {
    expect(isTaskSharedEdit(getStyle('ascii')!, 'uCharset', 'text')).toBe(true)
    expect(isTaskSharedEdit(getStyle('textraster')!, 'uTextContent', 'text')).toBe(true)
  })
  it('文本流:color 由种子携带回 false', () => {
    expect(isTaskSharedEdit(getStyle('sketch')!, 'uBgColor', 'text')).toBe(false)
    expect(isTaskSharedEdit(getStyle('ascii')!, 'uCharColor', 'text')).toBe(false)
  })
  it('流别交叉:toggle/select 走文本流回 false,text 走数值流回 false', () => {
    expect(isTaskSharedEdit(def, 'uColorMode', 'text')).toBe(false)
    expect(isTaskSharedEdit(getStyle('ascii')!, 'uCharset', 'number')).toBe(false)
  })
  it('未注册 uniform 或 def 缺失回 false(维持只写工作副本的既有行为)', () => {
    expect(isTaskSharedEdit(def, 'uNotExist', 'number')).toBe(false)
    expect(isTaskSharedEdit(undefined, 'uColorMode', 'number')).toBe(false)
  })
})

describe('seedMatchesStyle', () => {
  it('本风格 true', () => {
    expect(seedMatchesStyle(encodeSeed('halftone', base.params, def, {}), 'halftone')).toBe(true)
  })
  it('异风格 false', () => {
    expect(seedMatchesStyle(encodeSeed('popart', {}, getStyle('popart')!, {}), 'halftone')).toBe(false)
  })
  it('非法种子 false(decode 失败按不匹配处理)', () => {
    expect(seedMatchesStyle('zz', 'halftone')).toBe(false)
    expect(seedMatchesStyle('', 'halftone')).toBe(false)
  })
})

describe('blobExt', () => {
  it('按 MIME 推导扩展名,未知类型兜底 png', () => {
    expect(blobExt(new Blob([], { type: 'image/svg+xml' }))).toBe('svg')
    expect(blobExt(new Blob([], { type: 'image/jpeg' }))).toBe('jpg')
    expect(blobExt(new Blob([], { type: 'image/png' }))).toBe('png')
    expect(blobExt(new Blob([]))).toBe('png')
  })
})

describe('displaySeed', () => {
  it('统一模式:行 seed=null 返回基线编码码(与 rowEffectiveSeed 同值)', () => {
    expect(displaySeed(makeRow(), 'unified', base, def))
      .toBe(encodeSeed('halftone', base.params, def, base.textParams))
  })
  it('统一模式:重骰残留的行 seed 原样透传(与处理链 assembleProcessingTasks/renderedSeed 消费同值,展示=实际出图种子)', () => {
    expect(displaySeed(makeRow({ seed: '0A5' }), 'unified', base, def)).toBe('0A5')
  })
  it('独立模式:seed 非 null 原样透传(不校验,校验职责在上游)', () => {
    expect(displaySeed(makeRow({ seed: '0A5' }), 'perImage', base, def)).toBe('0A5')
  })
  it('独立模式:seed=null 返回 null(视图层渲染「跟随」短标)', () => {
    expect(displaySeed(makeRow(), 'perImage', base, def)).toBeNull()
  })
})

describe('rowDisplaySeed', () => {
  const working = { params: { ...base.params, uCellSize: 33 }, textParams: {} }
  it('独立模式选中行:工作副本实时编码(编辑即所见,不等懒同步点)', () => {
    expect(rowDisplaySeed(makeRow(), true, working, 'perImage', base, def))
      .toBe(encodeSeed('halftone', working.params, def, working.textParams))
  })
  it('独立模式选中行 seed=null 也显示实时码(工作副本即该行当前状态,与 SeedBar 同源)', () => {
    expect(rowDisplaySeed(makeRow(), true, working, 'perImage', base, def))
      .toBe(encodeSeed('halftone', working.params, def, working.textParams))
  })
  it('独立模式未选中行:行种子透传(null → null 渲染「跟随」)', () => {
    expect(rowDisplaySeed(makeRow({ seed: '0A5' }), false, working, 'perImage', base, def)).toBe('0A5')
    expect(rowDisplaySeed(makeRow(), false, working, 'perImage', base, def)).toBeNull()
  })
  it('统一模式不受选中影响:与 displaySeed 同值(重骰残留透传)', () => {
    expect(rowDisplaySeed(makeRow({ seed: '0A5' }), true, working, 'unified', base, def)).toBe('0A5')
  })
})

describe('rowPreviewSig', () => {
  const working = { params: { ...base.params, uCellSize: 33 }, textParams: {} }
  it('选中行工作副本变化 → 签名变化(预览需重渲染)', () => {
    const a = rowPreviewSig(makeRow(), true, working, 'perImage', base, def, 'S')
    const b = rowPreviewSig(makeRow(), true, { ...working, params: { ...working.params, uCellSize: 11 } }, 'perImage', base, def, 'S')
    expect(a).not.toBe(b)
  })
  it('任务级共享段变化(风格/text/字体)→ 签名变化', () => {
    const a = rowPreviewSig(makeRow(), false, working, 'perImage', base, def, 'S1')
    expect(a).not.toBe(rowPreviewSig(makeRow(), false, working, 'perImage', base, def, 'S2'))
  })
  it('非选中行:行种子变化 → 签名变化;同一输入签名稳定(幂等)', () => {
    const a = rowPreviewSig(makeRow({ seed: '0A5' }), false, working, 'perImage', base, def, 'S')
    expect(a).toBe(rowPreviewSig(makeRow({ seed: '0A5' }), false, working, 'perImage', base, def, 'S'))
    expect(a).not.toBe(rowPreviewSig(makeRow({ seed: '0A6' }), false, working, 'perImage', base, def, 'S'))
  })
  it('统一模式:基线变化 → 签名变化(基线编码进种子展示)', () => {
    const a = rowPreviewSig(makeRow(), false, working, 'unified', base, def, 'S')
    const b = rowPreviewSig(makeRow(), false, working, 'unified', { params: { ...base.params, uCellSize: 55 }, textParams: {} }, def, 'S')
    expect(a).not.toBe(b)
  })
})

describe('truncateSeed', () => {
  it('短码原样返回', () => {
    expect(truncateSeed('0A5', 7)).toBe('0A5')
  })
  it('超长截断保前缀加 …', () => {
    expect(truncateSeed('0A123456789', 7)).toBe('0A12345…')
  })
  it('长度恰等于 keep 原样(边界含等号)', () => {
    expect(truncateSeed('0123456', 7)).toBe('0123456')
  })
  it('空串安全', () => {
    expect(truncateSeed('', 7)).toBe('')
  })
  it('keep 缺省为 7', () => {
    expect(truncateSeed('0A123456789')).toBe('0A12345…')
  })
})
