# Anime Light 体积光神光 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Anime Light 的"斑马线"神光替换为屏幕空间体积光(光束跟随画面亮部),光源自动检测最亮点、可手动滑块覆盖。

**Architecture:** composite shader 内联 32 步径向散射(GPU Gems 3 Ch.13 简化版);JS 侧 `findBrightestPoint` 纯函数在图片加载时于 32×32 缩略图上找最亮点,经 App2D state 注入渲染 uniform 并驱动滑块显示层覆盖;配套修复 `handleRandom` 全量替换丢参数、`handleApplySeed` 缺 toggle 兜底两个既有缺口。

**Tech Stack:** React 19 + TypeScript + WebGL 1(GLSL ES 1.0)+ vitest。spec: `docs/superpowers/specs/2026-08-31-animelight-godray-volumetric-design.md`

**基准线:** eslint 基线 11 个预先存在错误(全在 3D 文件),验收标准是不新增;`tsc -b` 通过;`npx vitest run` 66 个测试全过(参数表变更后 seedCodec 有 1 处断言需按新值更新,见 Task 2)。

---

### Task 1: findBrightestPoint 纯函数(TDD)

**Files:**
- Create: `src/lib/brightPoint.ts`
- Test: `src/lib/brightPoint.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/lib/brightPoint.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findBrightestPoint } from './brightPoint'

const THUMB = 4 // 4x4 缩略图,构造数据小而直观

// 构造全黑 4x4 RGBA,再把 (px,py) 像素设为白色
function imageDataWithBrightAt(px: number, py: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(THUMB * THUMB * 4)
  const i = (py * THUMB + px) * 4
  data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255
  return data
}

describe('findBrightestPoint', () => {
  it('最亮在右上角(canvas 坐标)→ UV 右上角', () => {
    // canvas (3,0):x 最大、y 最小(顶部)
    const p = findBrightestPoint(imageDataWithBrightAt(3, 0), THUMB, THUMB)
    expect(p.x).toBeCloseTo((3 + 0.5) / THUMB)
    expect(p.y).toBeCloseTo(1 - (0 + 0.5) / THUMB) // y 翻转:canvas 顶 → UV 顶
  })

  it('y 翻转:canvas 下半亮 → UV y < 0.5', () => {
    const p = findBrightestPoint(imageDataWithBrightAt(1, 3), THUMB, THUMB) // canvas 底部
    expect(p.y).toBeLessThan(0.5)
  })

  it('按 luma 加权:绿通道亮度高于蓝通道', () => {
    const data = new Uint8ClampedArray(THUMB * THUMB * 4)
    const blue = 0 * 4; data[blue + 2] = 255                      // (0,0) 纯蓝
    const green = 1 * 4; data[green + 1] = 255                    // (1,0) 纯绿
    const p = findBrightestPoint(data, THUMB, THUMB)
    expect(p.x).toBeCloseTo((1 + 0.5) / THUMB) // luma(绿)=0.587 > luma(蓝)=0.114
  })

  it('平局取行序第一个(全黑 → 首像素)', () => {
    const data = new Uint8ClampedArray(THUMB * THUMB * 4) // 全黑,luma 全 0
    const p = findBrightestPoint(data, THUMB, THUMB)
    expect(p.x).toBeCloseTo(0.5 / THUMB)
    expect(p.y).toBeCloseTo(1 - 0.5 / THUMB)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/brightPoint.test.ts`
Expected: FAIL —— `Cannot find module './brightPoint'`(或等价的模块缺失错误)

- [ ] **Step 3: 最小实现**

创建 `src/lib/brightPoint.ts`:

```ts
export interface BrightPoint {
  x: number // UV 坐标,0..1,向右增大
  y: number // UV 坐标,0..1,向上增大
}

/**
 * 在缩略图像素数据中找最亮点(luma = 0.299r + 0.587g + 0.114b 最大)。
 * 返回 UV 坐标:canvas 坐标系 y 向下,而纹理经 UNPACK_FLIP_Y_WEBGL 上传后
 * UV 的 y 向上,因此 y 需翻转。平局取行序第一个(确定性)。
 */
export function findBrightestPoint(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): BrightPoint {
  let bestIdx = 0
  let bestLuma = -1
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    if (luma > bestLuma) {
      bestLuma = luma
      bestIdx = i
    }
  }
  const px = bestIdx % w
  const py = Math.floor(bestIdx / w)
  return { x: (px + 0.5) / w, y: 1 - (py + 0.5) / h }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/brightPoint.test.ts`
Expected: PASS —— 4 个测试全过

- [ ] **Step 5: Commit**

```bash
git add src/lib/brightPoint.ts src/lib/brightPoint.test.ts
git commit -m "feat(lib): findBrightestPoint——缩略图最亮点检测,返回翻转后 UV 坐标"
```

---

### Task 2: shader 体积光 + 参数表 + i18n

**Files:**
- Modify: `src/shaders/animelight_composite.frag`(godRay 段,当前约 75-93 行)
- Modify: `src/lib/StyleRegistry.ts`(animelight 参数表,当前约 172-179 行)
- Modify: `src/i18n/zh.json` / `src/i18n/en.json`(animelight 段)
- Test: `src/lib/seedCodec.test.ts`(仅当 105 行断言因码长变化失败时更新)

- [ ] **Step 1: 替换 composite shader 的 godRay 段**

在 `animelight_composite.frag` 中,uniform 声明区:删除 `uniform float uGodRayAngle;`,新增:

```glsl
uniform float uGodRayLength;
uniform float uGodRayThreshold;
uniform float uGodRayColor;
uniform float uCenterX;
uniform float uCenterY;
```

把现有 godRay 段(`if (uGodRayStrength > 0.01) { ... }` 整块,含 `godRayAngle`/`godDir`/`beam`/`beamMask` 等)替换为:

```glsl
  if (uGodRayStrength > 0.01) {
    // Volumetric light scattering (GPU Gems 3 Ch.13, simplified): march from
    // this pixel toward the light source, accumulating thresholded luminance
    // with distance decay — beams follow the bright parts of the image.
    vec2 lightPos = vec2(uCenterX, uCenterY);
    vec2 delta = (vUv - lightPos) * 0.9 / 32.0;
    vec2 sampleUv = vUv;
    float decay = mix(0.85, 0.99, uGodRayLength);
    float illum = 1.0;
    float accum = 0.0;
    for (int i = 0; i < 32; i++) {
      sampleUv -= delta;
      float lum = dot(texture2D(uOriginal, sampleUv).rgb, vec3(0.299, 0.587, 0.114));
      accum += smoothstep(uGodRayThreshold, uGodRayThreshold + 0.1, lum) * illum;
      illum *= decay;
    }
    vec3 rayColor = hsv2rgb(vec3(uGodRayColor / 360.0, 0.6, 1.0));
    color += rayColor * accum * uGodRayStrength * (2.0 / 32.0);
  }
```

- [ ] **Step 2: 更新 StyleRegistry 参数表**

`src/lib/StyleRegistry.ts` animelight 段,删除 `godRayStrength`/`godRayAngle` 两行,替换为:

```ts
      { name: 'style.animelight.godRayStrength', uniform: 'uGodRayStrength', min: 0.0, max: 3.0, step: 0.01, default: 0.8, description: 'style.animelight.godRayStrengthDesc' },
      { name: 'style.animelight.godRayLength', uniform: 'uGodRayLength', min: 0.0, max: 1.0, step: 0.01, default: 0.5, description: 'style.animelight.godRayLengthDesc' },
      { name: 'style.animelight.godRayThreshold', uniform: 'uGodRayThreshold', min: 0.1, max: 1.0, step: 0.01, default: 0.6, description: 'style.animelight.godRayThresholdDesc' },
      { name: 'style.animelight.godRayColor', uniform: 'uGodRayColor', min: 0, max: 360, step: 1, default: 45, description: 'style.animelight.godRayColorDesc' },
      { name: 'style.animelight.godRayAuto', uniform: 'uGodRayAuto', type: 'toggle' as const, default: 1, description: 'style.animelight.godRayAutoDesc' },
      { name: 'style.animelight.centerX', uniform: 'uCenterX', min: 0.0, max: 1.0, step: 0.01, default: 0.5, description: 'style.animelight.centerXDesc' },
      { name: 'style.animelight.centerY', uniform: 'uCenterY', min: 0.0, max: 1.0, step: 0.01, default: 0.3, description: 'style.animelight.centerYDesc' },
```

注:`defaultParams`(StyleRegistry.ts:236-245)对 `type: 'toggle'` 会纳入输出(只排除 text/color/font),`uGodRayAuto: 1` 自动进入风格默认参数,无需改动。

- [ ] **Step 3: 更新 i18n 词条**

`src/i18n/zh.json` animelight 段:删除 `"godRayAngle"`/`"godRayAngleDesc"` 两行,新增:

```json
      "godRayLength": "神光长度",
      "godRayLengthDesc": "光束从光源延伸的距离",
      "godRayThreshold": "亮部阈值",
      "godRayThresholdDesc": "多亮的区域才产生光束",
      "godRayColor": "神光颜色",
      "godRayColorDesc": "光束色相(0-360)",
      "godRayAuto": "光源自动检测",
      "godRayAutoDesc": "开启后光源自动取画面最亮区域,拖动光源位置会自动关闭",
      "centerX": "光源横位置",
      "centerXDesc": "光源在画面上的横向位置(手动模式生效)",
      "centerY": "光源纵位置",
      "centerYDesc": "光源在画面上的纵向位置(手动模式生效)",
```

`src/i18n/en.json` animelight 段:删除 `"godRayAngle"`/`"godRayAngleDesc"` 两行,新增:

```json
      "godRayLength": "Ray Length",
      "godRayLengthDesc": "How far beams extend from the light source",
      "godRayThreshold": "Brightness Threshold",
      "godRayThresholdDesc": "How bright a region must be to cast beams",
      "godRayColor": "Ray Color",
      "godRayColorDesc": "Beam hue (0-360)",
      "godRayAuto": "Auto Light Source",
      "godRayAutoDesc": "Light source follows the brightest region; dragging the source turns this off",
      "centerX": "Source X",
      "centerXDesc": "Horizontal light source position (manual mode)",
      "centerY": "Source Y",
      "centerYDesc": "Vertical light source position (manual mode)",
```

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `npx tsc -b && npx vitest run`
Expected: tsc 通过。vitest 中 `seedCodec.test.ts` **两处**断言预期失败,均为 animelight 全 max 码长变化所致——参数表删 1 增 6(toggle 不参与编码)后,全 max 码长经 BigInt 精算为 **17 字符**(15 位 payload + 2 位前缀;当前 13):

- 约 105 行 `expect(maxOf('animelight')).toBe(13)` → 改为 `.toBe(17)`
- 约 90 行 `expect(code.length).toBeLessThanOrEqual(13)`(全风格循环)→ 改为 `.toBeLessThanOrEqual(17)`

**信封决策(已定)**:原 seed 设计(`docs/superpowers/specs/2026-06-25-2d-param-seed-design.md` §2.7)以 6–13 字符为产品信封;新参数集下 17 字符属可接受的信封放宽(分享码仍可复制/手输),不为压缩码长牺牲参数精度。此决策已回写本功能 spec §5,发布说明中与"旧 seed 需重新生成"一并提示。

- [ ] **Step 5: 视觉冒烟(手动 X/Y 已可用,自动检测 Task 3 接线)**

Run: `npm run dev`,加载 `local_test_pic/car2.jpg`,切到 Anime Light。
Expected: 强度 > 0 时光束从默认光源位置(0.5, 0.3)向亮部拉出;长度/阈值/颜色滑块有可感知变化;无竖线、无着色器编译报错(控制台干净)。此时自动检测尚未接线,光源用默认值——属预期。

- [ ] **Step 6: Commit**

```bash
git add src/shaders/animelight_composite.frag src/lib/StyleRegistry.ts src/i18n/zh.json src/i18n/en.json src/lib/seedCodec.test.ts
git commit -m "feat(animelight): 神光改为体积光——径向散射跟随画面亮部,参数集扩为强度/长度/阈值/颜色/光源"
```

---

### Task 3: App2D 自动光源接线

**Files:**
- Modify: `src/components/App2D.tsx`(state 区约 31-50 行、loadImage effect 约 163-173 行、renderWithStyle 约 111-115 行、handleParamChange 约 223-225 行、ParamPanel values 约 449 行)

- [ ] **Step 1: 新增 brightest state + 检测 effect**

import 区新增:`import { findBrightestPoint } from '../lib/brightPoint'`

state 区(`const [imageInfo, ...]` 附近)新增:

```tsx
// 体积光自动光源:图片最亮点的 UV 坐标(检测失败为 null)
const [brightest, setBrightest] = useState<{ x: number; y: number } | null>(null)
```

在现有 `create renderer & load image` effect 之后新增 effect:

```tsx
// ---------------------------------------------------------------------------
// Effect: detect brightest point (auto light source for volumetric god rays)
// ---------------------------------------------------------------------------

useEffect(() => {
  if (!image) return
  const THUMB = 32
  try {
    const c = document.createElement('canvas')
    c.width = THUMB
    c.height = THUMB
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(image, 0, 0, THUMB, THUMB)
    setBrightest(findBrightestPoint(ctx.getImageData(0, 0, THUMB, THUMB).data, THUMB, THUMB))
  } catch {
    // 跨域图片等导致 getImageData 失败:回落默认光源位置
    console.warn('[animelight] brightest point detection failed, using default light source')
    setBrightest(null)
  }
}, [image])
```

- [ ] **Step 2: renderWithStyle 注入检测值**

`renderWithStyle` 内,`const mergedParams = { ...currentParams }` 块(if textTextures 之后)追加:

```ts
      // 体积光自动光源:animelight 开启自动时用检测到的最亮点覆盖光源参数。
      // 守卫必须用 === 1 而非 !== 0:其他风格(如 kaleidoscope 也有 uCenterX/Y,
      // 范围 -1..1)的 params 里没有 uGodRayAuto,undefined !== 0 为 true 会跨风格
      // 污染它们的光源/中心参数。animelight 的 uGodRayAuto 由 defaultParams 与
      // mergeWithDefaults 保证始终存在,=== 1 判断足够。
      if (currentParams['uGodRayAuto'] === 1 && brightest) {
        mergedParams['uCenterX'] = brightest.x
        mergedParams['uCenterY'] = brightest.y
      }
```

`renderWithStyle` 的依赖数组从 `[image]` 改为 `[image, brightest]`。

- [ ] **Step 3: 滑块显示层覆盖**

组件渲染区(ParamPanel 之前)新增:

```tsx
// 自动模式下 X/Y 滑块显示检测值(仅显示层,state 不动,避免渲染 effect 循环)
const panelValues = useMemo(() => {
  if (activeStyle !== 'animelight' || params['uGodRayAuto'] === 0 || !brightest) return params
  return { ...params, uCenterX: brightest.x, uCenterY: brightest.y }
}, [activeStyle, params, brightest])
```

ParamPanel 的 `values={params}` 改为 `values={panelValues}`。

- [ ] **Step 4: 拖动光源切手动**

`handleParamChange` 改为:

```tsx
  const handleParamChange = useCallback((uniform: string, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [uniform]: value }
      // 拖动光源位置 = 用户接管,自动检测让位。判断用 === 1 而非 !== 0:
      // 其他风格(如 kaleidoscope)拖自己的 uCenterX/Y 时不写入无关的 uGodRayAuto 键
      if ((uniform === 'uCenterX' || uniform === 'uCenterY') && next['uGodRayAuto'] === 1) {
        next['uGodRayAuto'] = 0
      }
      return next
    })
  }, [])
```

注意:上一步的显示层覆盖会让滑块显示检测值,用户拖动产生的是基于检测值的连续调整,体验自然。

- [ ] **Step 5: 类型检查 + 视觉验收**

Run: `npx tsc -b`
Expected: 通过

Run: `npm run dev`,加载 `car2.jpg`,切 Anime Light。
Expected:
- 默认(自动开):光束从画面最亮区域(车2 图的亮部/天空)发出,X/Y 滑块显示检测值;
- 拖 X/Y:自动开关熄灭,光源跟随手动值;
- 重新打开自动开关:光源回到检测值。

- [ ] **Step 6: Commit**

```bash
git add src/components/App2D.tsx
git commit -m "feat(app2d): 体积光自动光源接线——最亮点检测/渲染注入/滑块显示覆盖/拖动切手动"
```

---

### Task 4: handleRandom 保留参数 + handleApplySeed 兜底

**Files:**
- Modify: `src/components/App2D.tsx`(handleRandom 约 239-251 行、handleApplySeed 约 341-353 行)

- [ ] **Step 1: handleRandom 改为合并底**

```tsx
  const handleRandom = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    if (!styleDef) return
    // 以当前参数为底:toggle / skip 类参数保留现值,不再被整体替换丢弃
    // (此前全量替换会让 animelight 的 uGodRayAuto、kaleidoscope 的 uCenterX 等
    //  从 state 消失,自动光源静默失效)
    const randomParams: Record<string, number> = { ...params }
    for (const p of styleDef.params) {
      if (p.type === 'text' || p.type === 'color' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
      if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) continue
      const range = p.max - p.min
      const raw = p.min + Math.random() * range
      randomParams[p.uniform] = Math.round(raw / p.step) * p.step
    }
    setParams(randomParams)
  }, [activeStyle, params])
```

- [ ] **Step 2: handleApplySeed 用 mergeWithDefaults 合并**

`mergeWithDefaults` 已在 App2D import(来自 `../lib/presetStore`)。改为:

```tsx
  const handleApplySeed = useCallback((code: string): boolean => {
    if (!image) return false
    const decoded = decodeSeed(code)
    if (!decoded) return false
    const def = getStyle(decoded.styleId)
    if (!def) return false
    // decodeSeed 只产出 numeric 参数(toggle 不参与编码),裸 setParams 会让
    // uGodRayAuto 等开关被替换掉;以风格默认值为底合并补齐
    const merged = mergeWithDefaults(def, decoded.params, defaultTextParams(decoded.styleId))
    setActiveStyle(decoded.styleId)
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
    styleMemoryRef.current[decoded.styleId] = merged
    return true
  }, [image])
```

- [ ] **Step 3: 验证**

Run: `npx tsc -b && npx vitest run && npm run lint`
Expected: tsc/vitest 通过;lint 仍为 11 个基线错误(3D 文件),无新增

手动:`npm run dev` —— Anime Light 点随机:自动开关保持开、光束仍从最亮点发出;抽查 kaleidoscope 随机(uCenterX 保留现值)与 ascii 随机(uShowBg 保留)无异常;生成 seed → 应用 → 自动模式仍开。

- [ ] **Step 4: Commit**

```bash
git add src/components/App2D.tsx
git commit -m "fix(app2d): 随机按钮保留 toggle/skip 参数,应用 seed 以默认值合并兜底"
```

---

### Task 5: 全量验证 + 人工验收清单

- [ ] **Step 1: 全量自动化验证**

Run: `npm run lint && npx tsc -b && npx vitest run`
Expected: lint 11 个基线错误无新增;tsc 通过;vitest 全过(66 + Task 1 新增 4 = 70 个左右)

- [ ] **Step 2: 人工验收清单(dev server,Anime Light)**

- [ ] 光束从画面亮部(天空/光源)拉出,不再是等距斑马线
- [ ] 神光长度/亮部阈值/神光颜色/强度拖动均有可感知变化
- [ ] 自动光源落在画面最亮区域,X/Y 滑块同步显示检测值
- [ ] 拖 X/Y 切手动;重开自动恢复检测值
- [ ] 随机按钮后自动光源仍生效
- [ ] 应用旧 seed 后自动模式仍开启(数值可能错位——已接受的决策)
- [ ] 对比模式/导出 PNG·JPG 正常

- [ ] **Step 3: 收尾 Commit(如有零星修正)**

验收中发现的问题当场修复并 commit;默认参数的实测回填由用户完成(项目惯例:用户调参 → 贴预设 JSON → 回填 StyleRegistry)。
