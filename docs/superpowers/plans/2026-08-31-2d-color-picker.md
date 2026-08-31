# 2D 颜色参数改原生色板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 3 个绝对颜色参数（sketch 线条、lightshadow 光晕、animelight 神光）从色相滑条改为原生色板（`input type=color`），shader 改 RGB 直取，饱和度/亮度首次可调，默认渲染逐像素不变。

**Architecture:** 渲染链路原子切换——shader uniform 从单 hue 值改 R/G/B 三值，registry 参数改现成的 color 类型（走 textParams 数据流），App2D 渲染前用新纯函数 hexToRgb 拆 uniform（照抄 ParticleEngine 3D 先例）。4 个 hueShift 滑条不动。

**Tech Stack:** React 19 + TypeScript + WebGL 原生 shader + vitest。Spec: `docs/superpowers/specs/2026-08-31-2d-color-picker-design.md`

**项目约束：** UI 禁 emoji；注释与 commit 中文；lint 基线 11 个既有错误（均在 3D 文件）不得新增。

---

### Task 1: hexToRgb 纯函数（TDD）

**Files:**
- Modify: `src/lib/paramValue.ts`
- Test: `src/lib/paramValue.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `src/lib/paramValue.test.ts` 的 import 与 describe 之间——import 行改为 `import { snapToStep, hexToRgb } from './paramValue'`，新增 describe 块）

```ts
describe('hexToRgb', () => {
  it('把 #RRGGBB 转为 0..1 浮点三元组', () => {
    expect(hexToRgb('#FF7300')).toEqual([1, 115 / 255, 0])
    expect(hexToRgb('#FF8080')).toEqual([1, 128 / 255, 128 / 255])
    expect(hexToRgb('#FF9166')).toEqual([1, 145 / 255, 102 / 255])
  })

  it('非法输入返回 [0,0,0]', () => {
    expect(hexToRgb('')).toEqual([0, 0, 0])
    expect(hexToRgb('red')).toEqual([0, 0, 0])
    expect(hexToRgb('#12345')).toEqual([0, 0, 0])
    expect(hexToRgb('#GGGGGG')).toEqual([0, 0, 0])
  })

  it('容忍省略 # 前缀', () => {
    expect(hexToRgb('ff7300')).toEqual([1, 115 / 255, 0])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/paramValue.test.ts`
Expected: FAIL，报错 `hexToRgb` 未导出（snapToStep 用例仍绿）

- [ ] **Step 3: 写实现**（追加到 `src/lib/paramValue.ts` 末尾）

```ts
/** '#RRGGBB' → [r,g,b]（0..1 浮点，供 shader uniform）；非法输入返回 [0,0,0]。 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/paramValue.test.ts`
Expected: PASS（原 6 + 新 3 = 9 用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/paramValue.ts src/lib/paramValue.test.ts
git commit -m "feat(lib): hexToRgb 纯函数——色板 hex 拆 0..1 浮点供 shader uniform"
```

---

### Task 2: 渲染链路原子改造（shader + registry + App2D + i18n）

这 7 个文件必须一个 commit（uniform 名变了与数据源变了必须同步，拆开会留损坏的中间态）。

**Files:**
- Modify: `src/shaders/sketch.frag`
- Modify: `src/shaders/lightshadow_composite.frag`
- Modify: `src/shaders/animelight_composite.frag`
- Modify: `src/lib/StyleRegistry.ts`
- Modify: `src/components/App2D.tsx`
- Modify: `src/i18n/zh.json`、`src/i18n/en.json`

- [ ] **Step 1: sketch.frag**

uniform 声明行（第 12 行）替换：

```glsl
uniform float uLineColor;     // 0-360 hue, 0 = black
```

→

```glsl
uniform float uLineColorR;
uniform float uLineColorG;
uniform float uLineColorB;
```

删除 `hue2rgb` 函数（16-22 行整段——已核实全文件仅 144 行一处引用，改后成死代码）。

main 中（141-145 行）替换：

```glsl
  // 8. Line color (0 = black, >0 = hue-based color)
  vec3 lineColor = vec3(0.0);
  if (uLineColor > 0.5) {
    lineColor = hue2rgb(uLineColor / 360.0);
  }
```

→

```glsl
  // 8. Line color (color picker RGB; black = black lines)
  vec3 lineColor = vec3(uLineColorR, uLineColorG, uLineColorB);
```

- [ ] **Step 2: lightshadow_composite.frag**

uniform 声明行（第 11 行 `uniform float uGlowColor;`）替换为三行 `uGlowColorR/G/B`。

删除 `hue2rgb` 函数（14-20 行——已核实仅 30 行一处引用）。

main 中（28-31 行）替换：

```glsl
  vec3 glowTint = vec3(1.0);
  if (uGlowColor > 0.5) {
    glowTint = mix(vec3(1.0), hue2rgb(uGlowColor / 360.0), 0.5);
  }
```

→

```glsl
  vec3 glowTint = vec3(uGlowColorR, uGlowColorG, uGlowColorB);
```

- [ ] **Step 3: animelight_composite.frag**

uniform 声明行（第 14 行 `uniform float uGodRayColor;`）替换为三行 `uGodRayColorR/G/B`。

第 98 行替换：

```glsl
    vec3 rayColor = hsv2rgb(vec3(uGodRayColor / 360.0, 0.6, 1.0));
```

→

```glsl
    vec3 rayColor = vec3(uGodRayColorR, uGodRayColorG, uGodRayColorB);
```

**不要动** `rgb2hsv`/`hue2rgb`/`hsv2rgb` 任何函数（67/75 行主图颜色转换链仍引用它们——已核实）。

- [ ] **Step 4: StyleRegistry.ts 三个参数改 color**

lightshadow `uGlowColor` 行替换为：

```ts
      { name: 'style.lightshadow.glowColor', uniform: 'uGlowColor', type: 'color' as const, default: '#FFFFFF', description: 'style.lightshadow.glowColorDesc' },
```

sketch `uLineColor` 行替换为：

```ts
      { name: 'style.sketch.lineColor', uniform: 'uLineColor', type: 'color' as const, default: '#FF7300', description: 'style.sketch.lineColorDesc' },
```

animelight `uGodRayColor` 行替换为：

```ts
      { name: 'style.animelight.godRayColor', uniform: 'uGodRayColor', type: 'color' as const, default: '#FF9166', description: 'style.animelight.godRayColorDesc' },
```

（default hex 由各 shader 原**默认分支**精确换算：sketch `hue2rgb(27/360)`=(1,0.45,0)→#FF7300，default 27 > 哨兵 0.5 走取色分支；lightshadow default hue=0 时哨兵 `if (uGlowColor > 0.5)` 为 **false**，原默认即纯白光晕→#FFFFFF（勿错用 mix 分支换算）；animelight `hsv2rgb(17°,0.6,1)`=(1,0.57,0.4)→#FF9166。勿改动这些值。）

- [ ] **Step 5: App2D.tsx 渲染拆分**

顶部 import 行 `import { ... } from '../lib/paramValue'` 加入 `hexToRgb`（若无该 import 则新增 `import { hexToRgb } from '../lib/paramValue'`）。

`renderWithStyle` 内 `mergedParams` 构建与 textTextures 合并之后、godRayAuto 覆盖逻辑之前（约 118-120 行之间）插入：

```ts
      // color 参数（色板 hex）拆 R/G/B 并入数字 uniform——shader 端声明 uXxxR/G/B，
      // 模式同 ParticleEngine 的 3D color 处理。setUniform 对未声明 uniform 静默跳过，
      // 故 multi-pass 中非 composite pass 自动忽略，无副作用。
      for (const p of styleDef.params) {
        if (p.type !== 'color') continue
        const [r, g, b] = hexToRgb(currentTextParams[p.uniform] ?? p.default)
        mergedParams[`${p.uniform}R`] = r
        mergedParams[`${p.uniform}G`] = g
        mergedParams[`${p.uniform}B`] = b
      }
```

（注意函数内变量名为 `currentTextParams` / `currentParams` / `mergedParams`；插入前读 100-130 行确认上下文。）

- [ ] **Step 6: i18n Desc 更新（措辞从色相角度改为颜色）**

zh.json：`"glowColorDesc": "光晕的色相角度"` → `"光晕的颜色"`；`"lineColorDesc": "线条的色相角度"` → `"线条的颜色"`；`"godRayColorDesc": "光束色相(0-360)"` → `"光束的颜色"`

en.json：`"glowColorDesc": "Glow hue angle"` → `"Glow color"`；`"lineColorDesc": "Line hue angle"` → `"Line color"`；`"godRayColorDesc": "Beam hue (0-360)"` → `"Beam color"`

- [ ] **Step 7: 验证**

Run: `npx tsc -b --pretty false && npx vitest run && npx eslint src/lib/StyleRegistry.ts src/components/App2D.tsx && node -e "['zh','en'].forEach(l=>JSON.parse(require('fs').readFileSync('src/i18n/'+l+'.json','utf8')));console.log('i18n OK')"`
Expected: tsc 无输出；vitest 全绿（86：83 + Task 1 的 3）；eslint exit 0；i18n OK

（shader 编译错误 vitest 抓不到，`npm run build` 也只过 TS——shader 正确性由 Task 4 手动验收兜底；插入的 GLSL 每行已在上文逐字给出。）

- [ ] **Step 8: Commit**

```bash
git add src/shaders/sketch.frag src/shaders/lightshadow_composite.frag src/shaders/animelight_composite.frag src/lib/StyleRegistry.ts src/components/App2D.tsx src/i18n/zh.json src/i18n/en.json
git commit -m "feat(shader): 3 个颜色参数改原生色板——hue2rgb 直取改 RGB 三 uniform，饱和度亮度首次可调"
```

---

### Task 3: ParamPanel color 分支统一 ParamLabel + color 不变量测试

**Files:**
- Modify: `src/components/ParamPanel.tsx`
- Test: `src/lib/StyleRegistry.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 StyleRegistry.test.ts）

```ts
  it('color 参数 default 为合法 #RRGGBB hex', () => {
    for (const s of styles) {
      for (const def of s.params) {
        if (def.type !== 'color') continue
        expect(def.default, `${s.id}.${def.uniform}`).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })
```

Run: `npx vitest run src/lib/StyleRegistry.test.ts`
Expected: PASS（Task 2 已改 registry——此测试为防回归不变量；若 Task 2 未执行会 FAIL，属预期顺序依赖）

- [ ] **Step 2: ParamPanel color 分支换 ParamLabel**

color 分支（特征：param-header 后紧跟 `<input type="color"`）中替换：

```tsx
        <div className="param-header">
          <span className="param-label">{param.name}</span>
        </div>
        <input
          type="color"
```

→

```tsx
        <div className="param-header">
          <ParamLabel name={param.name} description={param.description} />
        </div>
        <input
          type="color"
```

（text/font 分支已用 ParamLabel，勿重复改。）

- [ ] **Step 3: 验证**

Run: `npx tsc -b --pretty false && npx vitest run && npx eslint src/components/ParamPanel.tsx`
Expected: 全过（87 用例）

- [ ] **Step 4: Commit**

```bash
git add src/components/ParamPanel.tsx src/lib/StyleRegistry.test.ts
git commit -m "feat(ui): color 分支统一 ParamLabel 补 tooltip + color 默认值 hex 不变量测试"
```

---

### Task 4: 全量回归 + 手动验收

- [ ] **Step 1: 全量验证**

Run: `npx vitest run && npx eslint . 2>&1 | tail -3 && npm run build`
Expected: vitest 87/87；eslint 仍 11 个既有错误；build 成功

- [ ] **Step 2: 手动验收清单（dev server，留给用户）**

1. sketch：线条颜色为色板（默认 #FF7300），**默认渲染与改造前逐像素一致**；选黑 → 黑线；选淡蓝 → 淡蓝线（新能力）
2. lightshadow：光晕颜色色板（默认 #FFFFFF，即原哨兵 0 的白光晕），默认渲染一致；选深色 → 深色光晕（新能力）
3. animelight：神光颜色色板（默认 #FF9166），默认渲染一致
4. 随机按钮不动颜色；预设保存/载出完整还原颜色
5. 4 个 hueShift 滑条不变；3D 页面无变化
