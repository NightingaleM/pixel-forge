# Anime Light 体积光神光重设计

日期:2026-08-31
状态:已与用户对齐方向(体积光 + 自动光源 + 手动覆盖,方案 1 内联实现)

## 背景

Anime Light 当前的神光效果([animelight_composite.frag](../../../src/shaders/animelight_composite.frag))是
"固定频率正弦条纹 × 画面中央窄带"的硬编码组合:

- 条纹频率(`sin(projection * 30.0)`)、条纹锐度、光带宽度(`perpDist < 0.3`)、
  颜色(`vec3(1.0, 0.9, 0.6)`)全部硬编码;
- 可调参数只有强度与角度两个;
- 形态上无论怎么调都是等宽等距的"斑马线"。

用户反馈:可配置维度太少,形状死板,不符合预期。经澄清,目标形态为
**体积光(volumetric light scattering)**——光束从画面亮部(太阳、窗户、天空)
沿光源方向拉出,跟随实际图像内容。

## 目标

1. 神光改为屏幕空间体积光(径向散射,GPU Gems 3 Ch.13 经典算法),光束跟随画面亮部。
2. 光源位置默认**自动检测画面最亮点**(JS 侧粗扫描),可**手动滑块覆盖**。
3. 提供合理参数集:强度、长度、亮部阈值、颜色(色相)。
4. 参数增删与既有 seed / 预设机制兼容。

## 非目标

- 不做密度/权重等细分参数(第一版固定采样密度,YAGNI)。
- 不支持画面外的光源位置(滑块限 0–1)。
- 不做动画、时间维度。
- 不改动 lightshadow 风格(它有自己的光照模型)。
- 不新建通用"自动参数"框架——自动光源目前只有 animelight 一个使用者,逻辑收在
  App2D 一处;出现第二个使用者时再抽通用机制。

## 设计

### 1. Shader 算法(composite 内联)

在 `animelight_composite.frag` 中替换现有 godRay 段:

```glsl
// Volumetric light scattering(GPU Gems 3 Ch.13 简化版)
vec2 lightPos = vec2(uCenterX, uCenterY);
vec2 delta = (vUv - lightPos) * 0.9 / 32.0;   // density 固定 0.9
vec2 uv = vUv;
float decay = mix(0.85, 0.99, uGodRayLength); // 长度参数映射衰减系数
float illum = 1.0;
float acc = 0.0;
for (int i = 0; i < 32; i++) {
  uv -= delta;
  float lum = luminance(uOriginal, uv);
  acc += smoothstep(uGodRayThreshold, uGodRayThreshold + 0.1, lum) * illum;
  illum *= decay;
}
vec3 rayColor = hsv2rgb(vec3(uGodRayColor / 360.0, 0.6, 1.0)); // 复用现有 hsv 函数
color += rayColor * acc * uGodRayStrength * (1.0 / 32.0) * 2.0;
```

- 采样 32 次,每次向光源步进;`smoothstep` 做亮部提取(柔和阈值)。
- 原有的亮度门限 `smoothstep(0.3, 0.6, lum)` 由新的 `uGodRayThreshold` 参数取代。
- `uGodRayAngle` 删除:体积光方向由光源位置天然决定。
- 采样使用 `uOriginal`(TEXTURE1 原图),与 pass1 输出无耦合。

### 2. 参数表(StyleRegistry.animelight)

| uniform | 类型 | 范围 | 默认(初版,待实测回填) |
|---|---|---|---|
| uGodRayStrength 神光强度 | slider | 0–3, step 0.01 | 0.8 |
| uGodRayLength 神光长度 | slider | 0–1, step 0.01 | 0.5 |
| uGodRayThreshold 亮部阈值 | slider | 0.1–1, step 0.01 | 0.6 |
| uGodRayColor 神光颜色 | slider(色相) | 0–360, step 1 | 45(暖金) |
| uGodRayAuto 光源自动 | toggle | 0/1 | 1 |
| uCenterX 光源横位置 | slider | 0–1, step 0.01 | 0.5 |
| uCenterY 光源纵位置 | slider | 0–1, step 0.01 | 0.3 |

- `uCenterX`/`uCenterY` 已在 `SKIP_RANDOM_UNIFORMS`(App2D)名单中,随机时保持不动;
  toggle 类型在 `handleRandom` 中本就被跳过。
- i18n:zh.json / en.json 的 animelight 段同步增删词条(删 godRayAngle,增上述六项)。

### 3. 自动光源:最亮点检测

新增纯函数(建议放 `src/lib/brightPoint.ts`):

```ts
findBrightestPoint(data: Uint8ClampedArray | Uint8Array, w: number, h: number): { x: number; y: number }
```

- 输入缩略图像素数据,按 luma = 0.299r + 0.587g + 0.114b 找最大值;
- 返回 **UV 坐标**:`x = (px + 0.5) / w`,`y = 1.0 - (py + 0.5) / h`
  (**注意 y 翻转**:canvas 坐标系 y 向下,纹理因 `UNPACK_FLIP_Y_WEBGL` 上传后 UV y 向上);
- 全黑/平局:返回第一个最大值位置(确定性行为)。

App2D 在 `loadImage` effect 中:把图缩到 32×32 离屏 canvas,`getImageData` 后调用上述
函数,结果存入 state(如 `brightestRef`)。

渲染注入(`renderWithStyle` 内,构建 `mergedParams` 时):

```ts
// 体积光自动光源:开启时用检测到的最亮点覆盖光源参数(animelight 专用,出现
// 第二个使用者再抽通用机制)
if (currentParams['uGodRayAuto'] === 1 && brightestRef.current) {
  mergedParams['uCenterX'] = brightestRef.current.x
  mergedParams['uCenterY'] = brightestRef.current.y
}
```

### 4. 自动/手动切换交互

- ParamPanel 中 X/Y 滑块**始终显示**;自动模式下其值为注入的检测值。
- 用户拖动 `uCenterX`/`uCenterY` 时,`handleParamChange` 检测到这两个 uniform,
  同时把 `uGodRayAuto` 置 0(自动切手动,一行拦截逻辑)。
- 切回自动:把 toggle 打开即可。

### 5. 兼容性

- **预设(presetStore)**:`mergeWithDefaults` 以风格默认值为底合并,旧预设中的
  `uGodRayAngle` 成为多余键被忽略;新参数缺失时回落默认值。
- **seed(seedCodec)**:实现时需确认 `decodeSeed` 返回的 params 是否经过默认值合并;
  若 `handleApplySeed` 直接 `setParams(decoded.params)` 且缺新参数键,顺手改为
  `mergeWithDefaults` 兜底(与本设计参数增删直接相关的既有缺口)。

## 错误处理

- 图片未加载:`brightestRef` 为空 → 注入逻辑跳过,X/Y 用参数表默认值。
- 图片跨域导致 `getImageData` 抛错:try/catch,回落默认光源(画面中心),console.warn。

## 测试

- `findBrightestPoint` 纯函数 vitest:最亮在角落、平局取第一、全黑图返回确定值、
  **y 翻转正确性**(构造上亮下暗的数据验证 UV y)。
- Shader 视觉效果:项目无 GLSL 测试基建,人工验收——亮部(天空/光源)拉出光束、
  阈值/长度/颜色/强度均有可感知变化、自动光源落在画面最亮区域、拖 X/Y 切手动生效。
- 回归:eslint(不超 11 错误基线)、`tsc -b`、现有 vitest 全过。

## 性能

- composite 每像素新增 32 次纹理采样;2048² 图约 1.3 亿次采样,现代 GPU 实时无压力;
  与现有 edge_blur(81 次采样/像素)同量级。
