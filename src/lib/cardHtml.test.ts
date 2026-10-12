// src/lib/cardHtml.test.ts
// 闪卡 HTML 模板生成(票02 方案(i) + 票06 规格):冻结参数/shader 源单一来源/
// base64 内嵌/降级链/陀螺仪三分支/verify 钩子。浏览器端行为由导出模板 verify
// 脚本覆盖(票07 验收)。
import { describe, it, expect } from 'vitest'
import { buildCardHtml } from './cardHtml'
import holofoilFrag from '../shaders/holofoil.frag?raw'

const baseInput = () => ({
  imageDataUrl: 'data:image/jpeg;base64,AAAA',
  fallbackDataUrl: 'data:image/jpeg;base64,BBBB',
  aspect: 1.5,
  params: {
    uTexture: 0, uStrength: 1, uBandDensity: 1, uBandAngle: 22,
    uFoilColorR: 0.1, uFoilColorG: 0.1, uFoilColorB: 0.13,
    uCrackleDensity: 38, uStreakDensity: 14, uSparkleDensity: 1,
    uScope: 0, uEdgeThreshold: 0.5, uEdgeWidth: 2, uEdgeSoftBand: 1.5, uEdgeHysteresis: 0.15,
    uZoneBoost: 0,
  },
  title: '全息箔 · 闪卡 HTML',
  ui: { hint: '移动鼠标或手指转卡', gyroButton: '开启陀螺仪转卡', fallbackNote: '已显示静态效果' },
})

describe('buildCardHtml(单文件模板,票06 规格)', () => {
  it('shader 源单一来源:内嵌当前 holofoil.frag 全文(import 同一份)', () => {
    const html = buildCardHtml(baseInput())
    expect(html).toContain(holofoilFrag.slice(0, 200))
    expect(html).toContain('uEdgeHysteresis')
    expect(html).toContain('uTiltX')
  })

  it('冻结参数字面量注入(含选择性加箔与倾角 uniform 名单)', () => {
    const html = buildCardHtml(baseInput())
    expect(html).toContain('uScope:0,uEdgeThreshold:0.5,uEdgeWidth:2')
    expect(html).toContain('uEdgeSoftBand:1.5,uEdgeHysteresis:0.15,uZoneBoost:0')
    // 浮点收敛:1/3 档位值 round 到 4 位小数
    const p2 = baseInput()
    p2.params.uStrength = 1 / 3
    expect(buildCardHtml(p2)).toContain('uStrength:0.3333')
  })

  it('源图与静态帧 base64 内嵌;触摸约定与降级链在场', () => {
    const html = buildCardHtml(baseInput())
    // 静态帧=fallback img src;源图=JS 侧 JSON 字符串注入
    expect(html).toContain('src="data:image/jpeg;base64,BBBB"')
    expect(html).toContain('"data:image/jpeg;base64,AAAA"')
    expect(html).toContain('touch-action: none')
    expect(html).toContain('webglcontextlost')
    expect(html).toContain('showFallback')
  })

  it('陀螺仪三分支:iOS requestPermission 按钮路径 + 直接监听路径 + 无数据回退', () => {
    const html = buildCardHtml(baseInput())
    expect(html).toContain('DeviceOrientationEvent')
    expect(html).toContain('requestPermission')
    expect(html).toContain('gyroBtn')
  })

  it('verify 自检钩子(票06 验收:模板自带 verify 断言)', () => {
    const html = buildCardHtml(baseInput())
    expect(html).toContain('window.__card')
    expect(html).toContain('W.glOk')
    expect(html).toContain('W.drawn')
    expect(html).toContain('W.tilt')
  })

  it('转卡手感常量:幅度 12/自摆开/阴影开(查看者不可调,参数冻结)', () => {
    const html = buildCardHtml(baseInput())
    expect(html).toContain('var AMP = 12, FLOW = true, IDLE = true, LIGHT = true')
  })

  it('标题与 UI 文案经 HTML 转义注入', () => {
    const p = baseInput()
    p.title = 'a<b>"c"'
    const html = buildCardHtml(p)
    expect(html).toContain('<title>a&lt;b&gt;&quot;c&quot;</title>')
  })
})
