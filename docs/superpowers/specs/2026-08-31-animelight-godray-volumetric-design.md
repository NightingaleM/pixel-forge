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

在 `animelight_composite.frag` 中替换现有 godRay 段(下方片段为**伪代码**,亮度计算
以正文说明的内联 `dot` / `luma()` helper 为准):

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
- **保留**现有 `if (uGodRayStrength > 0.01)` 早退分支(强度为 0 时跳过 32 次采样,
  兼作性能开关)。
- 亮度计算与现状一致内联 `dot(rgb, vec3(0.299, 0.587, 0.114))`(可提取 `luma()`
  helper,循环内外共用)。

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

- `uCenterX`/`uCenterY` 在 `SKIP_RANDOM_UNIFORMS`(App2D)名单中;toggle 类型在
  `handleRandom` 中本就被跳过。**注意**:`handleRandom` 目前构建全新 `randomParams`
  后整体 `setParams`,被 skip 的参数会从 state 中**消失**(ParamPanel 靠
  `?? param.default` 才显示正常)。若不处理,随机后 `uGodRayAuto === 1` 判断失效、
  X/Y uniform 不再被设置,自动光源静默失效。**配套修改**:`handleRandom` 改为以
  当前 params 为底、只覆盖参与随机的键(即 `{ ...params }` 起底或从 prev 合并),
  保持 toggle 与 skip 参数不丢。
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
函数,结果存入 **常规 state**(如 `brightest`,不用 ref——检测值同时驱动 §4 的滑块
显示视图,ref 变更不触发重渲染会让滑块短暂显示旧值)。

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

- ParamPanel 中 X/Y 滑块**始终显示**。自动模式下显示**检测到的光源值**:实现方式为
  **显示层覆盖**——App2D 传给 ParamPanel 的 `values` 用一个合并视图
  (`auto === 1 && 检测值存在` 时覆盖 X/Y),`params` state 本身不动
  (避免写回 state 触发依赖 `params` 的渲染 effect 循环)。
- 用户拖动 `uCenterX`/`uCenterY` 时,`handleParamChange` 检测到这两个 uniform,
  同时把 `uGodRayAuto` 置 0(自动切手动,一行拦截逻辑)。
- 切回自动:把 toggle 打开即可。
- `handleRandom` 的配套修改见 §2(保留 toggle/skip 参数,不再全量替换)。

### 5. 兼容性

- **预设(presetStore)**:`mergeWithDefaults` 以风格默认值为底合并,旧预设中的
  `uGodRayAngle` 成为多余键被忽略;新参数缺失时回落默认值。
- **seed(seedCodec)**:`decodeSeed` 会从当前注册表重建全部 numeric 参数,数字键不会
  缺失;真正的缺口是 `isNumeric` 不含 `type: 'toggle'`,解码结果永远没有
  `uGodRayAuto`,而 `handleApplySeed` 裸 `setParams(decoded.params)` 全量替换会让
  自动模式静默关闭。**配套修改(必做)**:`handleApplySeed` 改为以
  `mergeWithDefaults` 合并后再 set,缺失的 `uGodRayAuto` 回落默认值 1。
- **旧 seed 数值错位(已决策,接受)**:参数表增删会改变混合进制 seed 的布局,
  改动前生成的 animelight 旧 seed 会解码出"格式合法但数值错位"的参数。seed 定位为
  短期分享码而非持久资产,不引入 SEED_VERSION;在发布说明中提示重新生成 seed 即可。
- **码长信封放宽(已决策,接受)**:新参数集下 animelight 全 max 种子码长为
  17 字符(原信封 6–13,见 `2026-06-25-2d-param-seed-design.md` §2.7)。
  分享码仍可正常复制/手输,不为压缩码长牺牲参数精度;seedCodec 测试的长度断言
  同步更新(13 → 17、上限 ≤13 → ≤17)。

## 错误处理

- 图片未加载:`brightestRef` 为空 → 注入逻辑跳过,X/Y 用参数表默认值。
- 图片跨域导致 `getImageData` 抛错:try/catch,回落默认光源(画面中心),console.warn。

## 测试

- `findBrightestPoint` 纯函数 vitest:最亮在角落、平局取第一、全黑图返回确定值、
  **y 翻转正确性**(构造上亮下暗的数据验证 UV y)。
- Shader 视觉效果:项目无 GLSL 测试基建,人工验收——亮部(天空/光源)拉出光束、
  阈值/长度/颜色/强度均有可感知变化、自动光源落在画面最亮区域、拖 X/Y 切手动生效。
- 交互回归(人工):随机按钮后自动光源仍生效(uGodRayAuto 未丢);应用旧 seed 后
  自动模式仍开启。
- **handleRandom 行为变化波及所有风格**(合并底取代全量替换):其他风格的 skip/toggle
  参数(如 kaleidoscope 的 `uCenterX`、ascii 的 `uShowBg`)随机后**保留当前值**而非
  从 state 消失——这是修正后的正确行为,但对 animelight 之外的风格抽查随机按钮无异常。
- 回归:eslint(不超 11 错误基线)、`tsc -b`、现有 vitest 全过。

## 性能

- composite 每像素新增 32 次纹理采样;2048² 图约 1.3 亿次采样,现代 GPU 实时无压力;
  与现有 edge_blur(81 次采样/像素)同量级。
