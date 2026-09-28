import { describe, it, expect } from 'vitest'
import { randomizeParams, randomSeed, SKIP_RANDOM_UNIFORMS } from './randomSeed'
import { getStyle } from './StyleRegistry'
import { decodeSeed } from './seedCodec'
import type { NumberParamDef } from '../types'

const halftone = getStyle('halftone')!
// ascii 有 text/color/font 参数,覆盖全类型分支
const ascii = getStyle('ascii')!

describe('randomizeParams', () => {
  it('numeric 参数落在 min..max 且对齐 step', () => {
    const { params } = randomizeParams(halftone, { uCellSize: 10 }, {}, () => 0.999)
    // halftone 的 uCellSize 是数值参数,谓词收窄后才能取 .max
    const p = halftone.params.find((x): x is NumberParamDef => x.uniform === 'uCellSize')!
    expect(params.uCellSize).toBe(p.max)
  })

  it('跳过 SKIP_RANDOM_UNIFORMS 与 toggle/text/font；select 均匀随机落档', () => {
    const base = { uCellSize: 7, uCaseMode: 0, uShowBg: 0, uCenterX: 0.25 }
    const { params } = randomizeParams(ascii, base, { uCharset: 'ABC' }, () => 0.5)
    expect(params.uCaseMode).toBe(1)      // select：floor(0.5×3)=1 档 → value 1
    expect(params.uShowBg).toBe(0)        // toggle 保留（开关不随机）
    expect(params.uCenterX).toBe(0.25)    // SKIP 名单保留(若该风格有此参数则必须不动)
  })

  it('select 随机覆盖两端档位（rand=0→首档，rand→1 时末档不越界）', () => {
    const base = { uCaseMode: 1 }
    expect(randomizeParams(ascii, base, {}, () => 0).params.uCaseMode).toBe(0)
    expect(randomizeParams(ascii, base, {}, () => 0.999999).params.uCaseMode).toBe(2)
  })

  it('万花筒镜像模式参与随机（本次修复的核心诉求）', () => {
    const kaleido = getStyle('kaleidoscope')!
    const seen = new Set<number>()
    // rand 序列只喂 select 前的参数不动——直接用固定 rand 驱动三档各来一次
    for (const r of [0, 0.5, 0.999999]) {
      const { params } = randomizeParams(kaleido, { uMirrorMode: 0 }, {}, () => r)
      seen.add(params.uMirrorMode)
    }
    expect(seen).toEqual(new Set([0, 1, 2]))   // 三种镜像模式均可被骰到
    // 棱镜 toggle 不随机：base 0 恒 0
    expect(randomizeParams(kaleido, { uPrism: 0 }, {}, () => 0.999999).params.uPrism).toBe(0)
  })

  it('color 参数随机为 6 位 hex', () => {
    const { textParams } = randomizeParams(ascii, {}, {}, () => 0)
    expect(textParams.uCharColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('不修改入参对象', () => {
    const base = { uCellSize: 3 }
    randomizeParams(halftone, base, {}, () => 0.5)
    expect(base).toEqual({ uCellSize: 3 })
  })

  it('SKIP 名单内参数绝不被改写(halftone.uAngle 在名单中)', () => {
    // 名单常量本身在此被验证:名单内 uniform 即使存在也不参与随机
    expect(SKIP_RANDOM_UNIFORMS).toContain('uAngle')
    const base = { uAngle: 45 }
    const { params } = randomizeParams(halftone, base, {}, () => 0.5)
    expect(params.uAngle).toBe(45)
  })
})

describe('randomSeed', () => {
  it('产出可 decode 回同一风格的合法种子', () => {
    const seed = randomSeed(halftone, { uCellSize: 5 }, {}, () => 0.42)
    const decoded = decodeSeed(seed)
    expect(decoded).not.toBeNull()
    expect(decoded!.styleId).toBe('halftone')
  })
})
