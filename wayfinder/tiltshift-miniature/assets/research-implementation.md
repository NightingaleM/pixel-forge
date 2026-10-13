# 移轴微缩 · 实现路径研究（票 02 交付）

状态：closed 2026-10-13 · assignee research-agent
上游输入：[01 病理复盘](../tickets/01-failure-forensics.md)（进行中，本文旧版基线数字为代码推算值，待 01 票交叉验证）；下游取用：[03 实验室样张](../tickets/03-lab-prototype.md) 按「A/B/C 蓝图」出图。

---

## 0. TL;DR

- **推荐路线 = 案 A「多级金字塔混合」为骨架、案 C「半分辨率 disc gather + 重糊层」为并列候选**，实验室两案都出样张对比；案 B（单 pass 全分辨率螺旋 disc）作为质感上界参照与轻量档备选。
- 变半径由**几何代理**驱动：像素到斜置焦带的距离 d → 模糊半径 r(d) 单调渐增（修正旧版「一刀进满糊」病理）。
- bokeh 盘质感来自两条腿：金字塔各级的半径连续插值（底糊）+ **高光偏置/形状核 disc gather**（高光晕成盘）。纯高斯金字塔不叠盘感增强 = 旧版凡士林病理复发。
- **核 pass 全部半分辨率及以下跑**（「散景焦外」候选的预判成立，且移轴最大半径更大、更必须）；清晰像素始终取全分辨率 `uOriginal`，无画质损失。
- 色彩增益链（饱和/对比/暗角/微暖）**全部做在末合成 pass**，不设独立 bloom pass（盘感已承担高光晕开职责）。
- 智能默认焦带：32px 缩略图**逐行梯度能量 → 1D 剖面 → 滑窗找带**，置信不足回退 `y=0.45 / 宽 0.12 / 倾角 0` 水平带。
- 基建需要一处轻量扩展（`renderToFBO` 可选输出尺寸 + 上屏 pass 可绑额外纹理单元，合计约 30 行，向后兼容，不碰光影 3-pass 语义）。

---

## 1. 仓库基建事实与旧版基线（设计前提）

### 1.1 基建现状

| 设施 | 现状 | 对本效果的含义 |
|---|---|---|
| `renderMultiPass`（ShaderRenderer.ts:300） | ping-pong 双 FBO，**全部全分辨率**；每个中间 pass 绑 uImage(TU0)+uOriginal(TU1)；`uResolution` 恒为画布全尺寸（注释里的坑已声明） | 不支持变尺寸 FBO / 多于两张存活中间纹理 → 金字塔需轻扩展；半分 pass 内求 texel 必须 `0.5/uResolution` 自算 |
| `renderImage.ts:151-152` | multi-pass 时**同一份 mergedParams 发给所有 pass**（shader 里没有的 uniform 被 setUniform 静默跳过） | 各 pass 可共用一套参数名，无需 per-pass uniform 机制 |
| `renderToFBO`（ShaderRenderer.ts:248） | 输出尺寸固定 imageWidth/Height | 需加可选 `outWidth/outHeight`（金字塔唯一硬需求） |
| `render()` 上屏（ShaderRenderer.ts:233-241） | 固定绑 `this.texture` 到 TU0 | 末合成 pass 需要读「模糊塔合并图」→ 需要一个可绑额外纹理的上屏变体 |
| `brightPoint.ts` + runBatch.ts:140-148 / App2D.tsx:1052-1058 | 32px 短边缩略图 `drawImage → getImageData →` CPU 扫描，跨域失败回退默认 | 焦带估计复用**同一管线**（同一张缩略图甚至同一份 ImageData），新增纯函数文件即可单测 |
| StyleRegistry 参数面 | slider / select(int) / toggle / color / `visibleWhen`；select 自动入随机种子空间 | 光圈形状 select 三档（圆 0 / 六角 1 / 椭圆 2）零额外成本入骰子空间 |

### 1.2 旧版基线（代码推算）

旧实现在 sampler.html:73-83（blur 核）+146-158（合成）+243-253（5 轮 H/V 链）：

- 核 = 5 权重线性采样高斯（w≈0.227/0.195/0.122/0.054/0.016），tap 间距 3px → 单 pass σ≈3px；每轮 H+V → σ_round≈4.2px；5 轮累计 **σ_total≈9.5px**（@960 宽画布）。
- 合成 = `smoothstep(0.03, 0.28, dist)` 一步到位 mix 原图/满糊图——**三明治结构**：只有「清晰/满糊」两种状态加权，模糊半径不随距离渐增，盘也不随距离变大。
- 三条病理对应：①核形态=纯高斯，无光圈形状 → 凡士林；②半径曲线=阶跃非单调渐增；③9.5px@960 在缩放观看下强度不足。
- 任何新路线必须同时修这三条：**形状核（或形状盘感增强）+ r(d) 单调渐增曲线 + 默认强度对齐参考图量级（归一化到画幅短边的百分比，而非固定像素——这是旧版在不同尺寸画布观感漂移的隐性坑）**。

---

## 2. 变半径模糊技术谱系对比（票任务 1）

候选路线全表。「成本」以 @2048 全分 = 4.19M 像素计；对照基线：现有光影 3-pass 链 ≈ 84M texture fetch（9+9 tap ×全分 + composite）。

| # | 路线 | pass 数 × 采样 | 总 fetch @2048 | bokeh 盘质感 | banding/振铃风险 | renderMultiPass 适配度 |
|---|---|---|---|---|---|---|
| ① | **多级下采样金字塔 + 按带距插值合成**（Unity 旧版 TiltShift、多数移动 DOF、毛星云 TiltShiftBlurV2 同族） | 3 降采样 + 1 合并 + 1 合成 = 5-6 pass；每 pass 2-4 fetch | **≈38M**（含 16-fetch 盘感层；不含则 ≈22M） | 中：各级是高斯/box，混合出连续半径；**高光成盘要靠盘感增强层补**（否则=旧版涂抹升级版） | 低：级间三角权重插值平滑；注意上采样 halo（见 §5） | 中：需「变尺寸 FBO + 多纹理存活」轻扩展 |
| ② | **单 pass 黄金螺旋 disc gather**（Shadertoy 经典 DOF with bokeh v2.4 同族：费马螺线+黄金角，r+=1/r，N=48-96） | 1 pass × N fetch | **N=64 → 268M**（光影链 3.2 倍） | **最高：真光圈卷积，高光必成盘，形状核天然** | 中：大半径欠采样出螺旋纹（N=48、r=60px 时每 235px²/采），需 jitter 抖动 + 限半径上限；dependent read 缓存不友好 | **最高：单 pass 零改动**（走现有 useShader 路径） |
| ③ | 半分辨率 disc gather（②的半分版）+ 重糊层 + 合成（=本文案 C） | 3-4 pass；24 fetch 半分 + 降采样 + 合成 | **≈40-57M** | 中高：中半径区(r≤14px)真盘、形状可辨；超大半径区高斯底糊（远景只剩色块——恰是真实移轴远景观感） | 低-中：盘区欠采样缓解（26px²/采），过渡带衔接需调 | 中：同①的轻扩展 |
| ④ | 逐行/逐列变半径可分离高斯 | 2 pass × 9-11 fetch | ≈84M | 差：可分离假设在变半径处破裂（H/V 半径不一致→椭圆化伪影）；倾角焦带时水平行采样直接错误 | 高：各向异性伪影 + 高斯涂抹病理 | — **排除**（旧版同族） |
| ⑤ | scatter/sprite bokeh（GPU Pro5 "Bokeh Effects on the SPU"：亮度阈值→叠六角 sprite） | 亮点检测 pass + N 个 sprite 绘制 | 不定（亮点数） | 高（sprite 即盘） | 高：WebGL1 无实例化，`gl.POINTS` 的 gl_PointSize 上限/移动端支持不稳；JS 组 drawcall 或读回 CPU 都违反约束 | — **排除**（WebGL1 工程风险），point sprite 备忘 |
| ⑥ | 硬件 mipmap/bias 采样（`texture2D(tex, uv, bias)` 或预生成 mip） | ~0-1 pass | 最低 | 差：mip=各向同性 box 近似，权重不可控、CLAMP 边缘行为不定、驱动质量参差 | 高：级间跳变 + 非 2 次幂尺寸失效 | — **排除**（记录为理论下界） |

**谱系结论**：几何代理（带距→半径）在所有路线里都是同一个函数 r(d)（§4.4），路线差异只在「给定 r 后怎么取模糊像素」。②是质感上界但 fetch 成本在移动端批量下不可预算；①③把「大半径」交给低分辨率层，把「质感」交给中小半径的形状盘，是成本-质感 Pareto 前沿上的两点，正好构成实验室 A/C 对照；④⑤⑥有明确排除理由。

---

## 3. 光圈形状核 GLSL 方案（票任务 2）

### 3.1 形状函数（SDF 掩码，WebGL1 可用）

```glsl
// p: 采样偏移(已除以当前半径), 柔边 e≈0.10-0.15
float apertureMask(vec2 p, float e) {
  float d;
  if (uAperture == 1) {            // 六角: IQ 六角 SDF
    const vec2 k = vec2(-0.866025404, 0.5);            // -√3/2, 1/2
    p = abs(p);
    d = max(dot(p, k.xy), p.x);                         // 平顶六角, 边朝上
  } else if (uAperture == 2) {     // 椭圆: 各向异性缩放(固定 2:1, 可加 uApertureAspect)
    p *= vec2(1.0, 2.0);
    d = length(p) * 0.75;           // 0.75 面积归一补偿
  } else {                          // 圆
    d = length(p);
  }
  return smoothstep(1.0 + e, 1.0 - e, d);   // 盘内 1, 盘外 0, 柔边过渡
}
```

- **柔边** e 随半径轻微缩放（小盘边硬、大盘边柔，模拟球差），最低不小于 1.5px 等效，防止走样。
- 形状随半径缩放：掩码在「偏移/半径」归一空间定义，天然随 r 缩放，无需分支。
- 六角方向随倾角轻微旋转（`rot(uBandTilt)`）可让盘与地平线呼应——样张票定夺是否保留（默认不转）。

### 3.2 螺旋 disc gather 主体（②/③案核心，伪代码级）

```glsl
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;          // ②: 原图; ③: 半分降采样图
uniform vec2 uResolution;          // 画布全尺寸(基建约定), 半分 pass 内 texel=0.5/uResolution
uniform float uMaxBlur;            // 最大半径(画幅短边 %, JS 侧换算为 px)
uniform float uAperture;           // 0圆 1六角 2椭圆
uniform float uSampleCount;        // 质量分档(预览 48 / 导出 64), 常量上界内 break
// ...焦带参数见 §4.4

float GOLDEN = 2.39996323;         // 黄金角
float hash12(vec2 p) { ... }       // 每像素 jitter, 破螺旋纹

void main() {
  float r = blurRadiusAt(vUv);             // §4.4: 带距→半径, 焦带内=0
  if (r < 0.5) { gl_FragColor = texture2D(uImage, vUv); return; }
  vec2 texel = 1.0 / uResolution;          // 半分 pass: 0.5/uResolution
  float rotA = hash12(vUv * uResolution) * 6.2831853;   // 旋转抖动
  vec2 o = vec2(cos(rotA), sin(rotA)) * 0.35;           // 从 ~0.35r 起采, 焦内权重不浪费
  float ca = cos(GOLDEN), sa = sin(GOLDEN);
  mat2 rot = mat2(ca, sa, -sa, ca);
  float rad = 0.35, wsum = 0.0; vec3 col = vec3(0.0);
  float hi = 0.0;                          // 高光能量(用于盘感亮度偏置)
  for (int i = 0; i < 96; i++) {
    if (float(i) >= uSampleCount) break;
    o = rot * o;
    rad += 1.0 / rad;                      // 费马螺线 r∝√n 的增量近似
    vec2 off = o * min(rad, r) * texel;
    vec3 s = texture2D(uImage, vUv + off).rgb;
    float w = apertureMask(vec2(off) / (r * texel), 0.12);
    float lum = dot(s, vec3(0.299, 0.587, 0.114));
    w *= 1.0 + uHighlightBias * smoothstep(0.72, 0.95, lum);  // 高光偏置: 亮源撑满盘
    col += s * w; wsum += w;
    hi += w * smoothstep(0.72, 0.95, lum);
  }
  vec3 outc = col / max(wsum, 1e-4);
  outc *= 1.0 + uBokehGlow * clamp(hi / max(wsum,1e-4) - 0.35, 0.0, 1.0);  // 盘内再提亮
  gl_FragColor = vec4(outc, 1.0);
}
```

要点：**WebGL1 循环上界必须常量**（`i<96`）+ `uSampleCount` break 分档；数组不用（无索引限制问题）；`rad` 增量从 0.35 起避免中心重复采样；jitter 只旋转起点+可选半径微扰，保证静止无闪烁（确定性 hash，无 time）。

### 3.3 金字塔路线的形状核（①案补丁）

金字塔各级本身是高斯——形状感全部由合成 pass 内的「高光形状层」承担：

```glsl
// 合成 pass 内, 对 uOriginal 做一次小 N 形状 disc gather, 只贡献高光
vec3 bokehHi = discGather(uOriginal, vUv, r, /*N=*/16, /*highlightOnly=*/true);
float mask = smoothstep(0.70, 0.95, luma(blurredTower));   // 模糊图已亮区=原高光晕开区
vec3 merged = mix(towerMix, bokehHi, uHighlightGlow * mask);
```

即：底糊塔负责「整体变虚」，形状层负责「高光按光圈形状撑成盘」。这是①案不复发涂抹感的关键补丁，成本 +16 fetch/像素（半分下 +4 fetch/全分像素）。

---

## 4. 智能默认焦带算法草案（票任务 4）

### 4.1 输入与复用关系

- 数据源：**短边 32px 缩略图**（保持长宽比），与 animelight 的 brightPoint 检测完全同路径：`drawImage(image,0,0,tw,th) → getImageData`。单图（App2D.tsx:1052 模式）与批量（runBatch.ts:140 模式）各加一个 try 块。
- 若同一风格管线将来两分析并存，可共享同一份 ImageData（同一 canvas）；当前 animelight 与 tiltshift 是不同风格、不同图片处理分支，**不抽公共 runtime helper，只共享算法文件与测试模式**。
- 新文件 `src/lib/tiltshiftBand.ts`（纯函数，仿 brightPoint.ts 布局 + tiltshiftBand.test.ts，用 4×4~32×24 构造数据单测），签名：

```ts
export interface FocusBand { y: number; tilt: number; width: number; confident: boolean }
export function estimateFocusBand(data: Uint8ClampedArray | Uint8Array, w: number, h: number): FocusBand
```

### 4.2 算法（CPU，32×~24 像素级，成本 <0.1ms，无逐像素全图违规）

1. **灰度化**：luma 0.299/0.587/0.114（与 findBrightestPoint 同式）。
2. **梯度能量图**：`g(x,y) = |luma(x+1,y) − luma(x,y)| + |luma(x,y+1) − luma(x,y)|`（前向差分，一行扫完）。天空/水面/沥青路面≈0，车流/人群/建筑立面细节高。
3. **候选倾角投影**：θ ∈ {0°, ±8°, ±16°}（5 档；移轴倾角惯例 <20°）。对每个 θ，把每像素梯度能量沿法线方向投影累加为 1D 剖面：
   `p_θ(s) = Σ g(x,y)·δ(round((x−cx)·sinθ·asp + (y)·cosθ) = s)`，s 为归一化「带距轴」坐标（0..1，除以剖面长）。
4. **1D 滑窗找带**（每个 θ）：固定候选带宽 w ∈ {0.08, 0.12, 0.18}（画幅短边比例），滑窗中心 c ∈ 0.15..0.85 步 0.02，窗内权重 = 梯形（带内全权重、带外 0.05 半宽过渡衰减）。score = 窗内 p 的加权和 − 0.5·窗外均值·窗宽（惩罚把带贴到高背景区）。取全局最优 (θ*, c*, w*)。
5. **置信判据**（confident 布尔，一并返回）：
   - 集中度：带内能量 / 全图能量 ≥ **0.55**；
   - 峰度：最优窗均值 / 剖面中位数 ≥ **2.0**；
   - 平坦图守门：全图平均梯度 ≥ **3.0**（0-255 尺度；纯天空/夜景低对比图直接不猜）。
   - 三条任一不满足 → `confident=false`，调用方回退默认带，UI 不标注「智能」。
   - `getImageData` 抛错（跨域）→ 同回退（沿用 animelight catch 先例）。
6. **回退默认**：`y=0.45 / width=0.12 / tilt=0`（水平带、略偏中下——俯拍密集场景主体集中于中下 2/3 的构图惯例）。
7. **倾角保守化**：|θ*| 与 0° 的 score 差 <5% 时强制 θ=0（防噪声斜带）；默认参数本身就允许用户手调倾角，估计只求「首载入不荒谬」。

### 4.3 横竖幅通吃

- 带方向永远相对 uv.y（水平带）估计与表达；竖幅不转置、不换轴——移轴惯例焦带水平（竖幅画面里带依然是水平的横条，只是画面窄）。投影公式里 `asp = w/h` 已吸收长宽比，32×57 竖缩略图与 32×24 横缩略图同码。
- 竖幅特例仅一处：若估计 `confident=false` 且 h>w，回退 y 改 0.5（竖幅构图主体更居中）。
- 智能默认产出的三元组以**参数默认值**形式注入（首次载入即用户可改可锁，沿用「参数级锁死」基建；骰子随机空间照常覆盖——估计只填默认位）。

### 4.4 带距→半径几何代理（两案共用核心公式）

```glsl
// uBandY: 带中心(uv.y, 0..1)  uBandTilt: 倾角(度)  uBandWidth: 带全宽(画幅短边%)
// 距离按画幅几何校正: uv 乘 aspect 后求平面距离, 单位=画幅短边比例
float bandDist(vec2 uv) {
  float a = uResolution.x / uResolution.y;                 // aspect
  vec2 p = vec2((uv.x - 0.5) * a, uv.y - uBandY);
  float t = radians(uBandTilt);
  float s = abs(p.x * sin(t) + p.y * cos(t));              // 到带中线距离(短边比例)
  return max(s - 0.5 * uBandWidth, 0.0);                   // 带内=0
}
float blurRadiusAt(vec2 uv) {                              // 半径曲线: 单调渐增(修病理②)
  float d = bandDist(uv);
  return uMaxBlur * pow(smoothstep(0.0, uFeather, d), 1.5); // uFeather≈0.18-0.30(短边%)
}
```

- `pow(...,1.5)`：近带缓、远带急，符合真实移轴 CoC 增长观感（远近对称用同曲线；上下不对称留样张定夺，可加 `uFarBoost` 让远端(画面上部)更重——真实俯拍远景在上）。
- 所有长度量以**画幅短边百分比**表达，960 预览与 2048 导出观感一致（修 §1.2 的尺寸漂移坑）。

---

## 5. 性能预算与半分辨率验证（票任务 3）

### 5.1 「核 pass 必须半分辨率」预判验证：成立，且移轴更甚

- 理由同「散景焦外」候选的预判：大核 pass 的成本瓶颈是 texture 带宽（fetch 数 × 每像素），不是着色 ALU；半分把 fetch 减 4 倍，而输出本来要糊——上采样不损失有效信息。
- 移轴的最大半径更大（对齐参考图量级需 画幅短边 12-20%，@2048 竖幅即 250-410px），②案全分在此半径下欠采样最严重，半分 + 抖动是唯一能把采样密度拉回可用的手段。
- **画质无损论证**：清晰像素 100% 来自全分辨率 `uOriginal`（末 pass TU1，基建已绑）；模糊区像素来自低分辨率层，其有效信息量本就低于半分奈奎斯特（大核模糊是低通）。
- **唯一风险 = 过渡带 halo**：清晰/模糊交界的亮像素经低分模糊层渗入清晰区。缓解：①过渡带 `uFeather` ≥0.15（短边%）保证权重渐变覆盖上采样核；②合成 pass 权重用 `r(d)` 而非层间硬切；③A 案合并层从 1/4→1/2 逐级上采样（每级双线性），不做 1/8→全分一步跳。
- **分档结论**：预览（≤1024 画布）与导出（2048）**同链同参数，无需分档**（金字塔级数固定，各级物理尺寸随画布缩放）；唯②案若入选，`uSampleCount` 预览 48 / 导出 64（uniform break，见 §3.2）。

### 5.2 各案预算表（texture fetch / 输出像素 @2048，对照光影链 84M）

| 案 | pass 链（尺寸） | fetch 合计 | 桌面独显估时 | Intel 核显估时 | 移动 GPU 估时 | 批量 20 张增量 |
|---|---|---|---|---|---|---|
| A 金字塔 | 降采样 1/2、1/4、1/8（各 4f）→ 合并 1/2（3f+盘感层）→ 合成全分（3f） | **≈38M**（0.45×光影链） | ~2-4ms | ~5-10ms | ~10-25ms | +0.2-0.5s，安全 |
| B 螺旋 disc | 单 pass 全分 ×64f | **≈268M**（3.2×） | ~5-15ms | ~30-80ms | ~50-150ms | 桌面勉强，**移动/核显 1-3s 超时风险** |
| C 半分 disc+重糊 | 半分 disc（24f）→ 重糊降采样 1/4（4f）→ 合并半分（3f）→ 合成全分（3f） | **≈40-57M** | ~3-5ms | ~8-15ms | ~15-35ms | +0.3-0.7s，安全 |
| （对照）光影 3-pass | 全分 9f+9f+2f | 84M | — | — | 现网已跑 | — |

（估时为带宽模型推算 + 现网光影链开销类比，实验室票须以 `performance.now()` 实测覆盖此表——尤其 B 案移动端，实测超标即砍 B。）

---

## 6. 色彩增益链建议（票任务 5）

**位置：全部在末合成 pass，顺序固定，无独立 pass、无独立 bloom。**

```glsl
// 合成 pass 内, 在 mix(sharp, blurTower, w) 之后:
vec3 col = mix(uOriginal采样, blurTower, blurWeight(r));
float l = luma(col);
col = mix(vec3(l), col, uSaturation * (1.1 - 0.15 * blurW));  // 饱和: 清晰区略强, 模糊区略收(防溢出)
col = (col - 0.5) * uContrast + 0.5;                          // 对比: 绕 0.5 pivot
col *= 1.0 - uVignette * smoothstep(0.45, 1.05, length((vUv-0.5)*vec2(a,1.0)));  // 暗角
col *= vec3(1.02, 1.0, 0.985);                                // 微暖移(玩具涂装感), 量样张定
```

- **饱和**：默认 1.45（区间 1.0-2.0）；产品惯例 +25~+40 饱和（Snapseed 教程流：饱和 +25/对比 +15 量级）。
- **对比**：默认 1.15（0.8-1.8）；高饱和+高对比是「模型涂装」错觉的必需品，两者要一起动。
- **暗角**：默认 0.15（0-0.5），微缩感辅助（玩具镜头场曲暗示），不做参数也行——建议留参数给样张定。
- **模糊区高光 bloom：不要独立做。** 盘感增强层（§3.3/§3.2 高光偏置）已在「高光晕成盘」的职责位上；再叠 bloom pass 会 +2 pass 成本 + 过曝风险 + 盘感被冲淡。若样张阶段盘感仍不足，优先调 `uHighlightBias/uBokehGlow`，而不是加 bloom。
- **不做负片/色相旋转类链**：与既有 14 风格参数面保持克制（map.md 观感要素清单是唯一色彩量级来源）。

---

## 7. A/B/C 实现蓝图（票任务 6，供 03 实验室票取用）

### 案 A：多级金字塔混合 —— 推荐度 ★★★（默认主案）

- **路线**：①（金字塔）+ §3.3 形状高光层补丁。
- **pass 链**：
  1. `ds` 降采样全分→1/2（2×2 box + 高光阈值化可选）
  2. `ds` 1/2→1/4
  3. `ds` 1/4→1/8
  4. `merge` 1/4 尺寸：读 L1+L2，按 r(d) 三角权重插值（权重函数：`w_i = max(0, 1−|r−R_i|/(R_{i+1}−R_i))`，r<R_0 → 全原图、r>R_max → 全 L2）
  5. `merge` 1/2 尺寸：读 L0+M1 同式插值，得「模糊塔 M0」
  6. `composite` 全分上屏：`mix(uOriginal, M0, w(r))` + §3.3 形状高光层 + §6 全色彩链
- **参数面草案**（StyleRegistry 追加在 prism 末位，风格 id 建议 `tiltshift`）：

| 参数 | uniform | 型 | 域 | 默认 |
|---|---|---|---|---|
| 焦带位置 | uBandY | slider | 0-1 / 0.01 | 智能或 0.45 |
| 焦带宽度 | uBandWidth | slider | 0.02-0.30 / 0.01 | 智能或 0.12 |
| 焦带倾角 | uBandTilt | slider | -30..30° / 1 | 智能或 0 |
| 虚化强度 | uMaxBlur | slider | 2-25%（短边）/ 0.5 | 12 |
| 过渡带 | uFeather | slider | 0.10-0.40 / 0.01 | 0.22 |
| 光圈形状 | uAperture | select | 圆0/六角1/椭圆2 | 0 |
| 高光盘感 | uHighlightGlow | slider | 0-1 / 0.01 | 0.35 |
| 饱和 | uSaturation | slider | 1.0-2.0 / 0.01 | 1.45 |
| 对比 | uContrast | slider | 0.8-1.8 / 0.01 | 1.15 |
| 暗角 | uVignette | slider | 0-0.5 / 0.01 | 0.15 |

- **成本**：≈38M fetch（0.45× 光影链）；批量 20 张 +0.2-0.5s。
- **风险**：①盘感不如真卷积（靠高光层补，样张判定够不够）；②基建轻扩展（见 §8）；③halo（§5.1 缓解三件套）。
- **为什么排第一**：成本余量最大（移动/核显/批量全安全）、半径上限天然大（低分层的等效半径按分辨率翻倍）、观感与 Unity/PS 等产品级实现同族（已被市场验证「像移轴」）、参数面全部风格化可控。

### 案 B：单 pass 黄金螺旋 disc gather —— 推荐度 ★★☆（质感上界/轻量档备选）

- **路线**：②，§3.2 全量实现（形状核天然、色彩链同 pass 收尾）。
- **pass 链**：1 pass 上屏（单 pass 风格路径，`shaderImports` 一项，**基建零改动**）。
- **参数面**：同 A 减 uHighlightGlow（自带）加 uSampleCount（内部质量档，不暴露 UI：预览 48/导出 64）、uHighlightBias（0-1，默认 0.4）。
- **成本**：268M fetch；桌面可用，**核显/移动批量超时风险**——实验室必须实测，超时则只保留为「桌面导出加质感」档或弃。
- **风险**：①欠采样螺旋纹（jitter+限 r≤画幅短边 8% 后与 C 案拼接=回到 C）；②大半径下盘密度不足导致「脏糊」；③移动端批量违约。
- **保留价值**：真光圈卷积的质感是①③的上界标尺——实验室以 B 的样张定「盘感合格线」，A/C 达不到就说明高光层参数要加码。

### 案 C：半分 disc + 重糊层分层混合 —— 推荐度 ★★★（并列候选，质感/成本折中）

- **路线**：③，B 案的可预算化工程版。
- **pass 链**：
  1. `ds` 全分→1/2（box 降采样，disc 的输入）
  2. `disc` 1/2 尺寸：§3.2 螺旋 gather，N=24，**半径上限=画幅短边 7%**（@2048≈72px 全分=36px 半分，采样密度 26px²/采，平滑）
  3. `heavy` 1/2→1/4 降采样 + box（超大半径底糊层）
  4. `composite` 全分上屏：r≤7% 用 disc 结果，7%<r 用 heavy 层（交叉过渡 2%），清晰区 uOriginal；色彩链同 pass
- **参数面**：同 A（uHighlightGlow 语义变为 uHighlightBias）。
- **成本**：40-57M fetch；批量 +0.3-0.7s，安全。
- **风险**：①disc/heavy 交叉带的衔接（过渡窗内双 lerp，样张盯）；②中半径真盘+大半径高斯的观感一致性（远景只剩色块恰好符合真实移轴，大概率是加分项——需样张确认）。
- **为什么并列第一**：真盘质感覆盖「观感敏感区」（带外第一段落虚化区，人眼注意力所在），超大半径区交给糊——与真实移轴的注意力模型吻合，且成本与 A 同量级。

### 排序与实验建议

**A ≥ C > B**。实验室票出样张矩阵：A、C 全参数面 × 4 判定图 × 光圈三形状；B 出 1 组对照（定盘感合格线）+ 移动端实测耗时表（覆盖 §5.2 估时）。A/C 若盘感不足，先加码 `uHighlightGlow`（A）再考虑切 C 为主案。

---

## 8. 基建改动清单（三案共用的最小集）

1. `renderToFBO` 加可选参数 `outWidth/outHeight`（默认现值，向后兼容）——金字塔/半分 pass 的唯一硬需求。
2. 上屏 pass 需绑「非 this.texture」的纹理：加一个 `renderToCanvas(boundUnits: Array<{unit:number; tex:WebGLTexture}>, fragSource, uniforms)` 公共方法（约 20 行，复用 useShader/setUniform/drawArrays），或等价地给 `renderMultiPass` 的 pass 定义加可选 `extraTextures`——**推荐前者**（不动 renderMultiPass 的光影语义）。
3. `renderImage.ts` 的 tiltshift 分支：手动链调 renderToFBO（各级尺寸/合并）+ 末 pass renderToCanvas；mergedParams 照旧全量传（静默跳过机制兜底）。
4. `src/lib/tiltshiftBand.ts` + 测试（§4.1）；App2D/runBatch 各加缩略图 try 块（照 animelight 先例）。
5. 半分 pass 内 texel 尺寸自算（`0.5/uResolution`）——写进 shader 文件头注释，防后人踩 uResolution 坑。

---

## 9. 风险登记簿

| 风险 | 等级 | 缓解 |
|---|---|---|
| B 案移动端批量超时 | 高 | uSampleCount 分档 + 实测门禁（§5.2）；超时砍 B |
| A 案盘感不足（涂抹感复发） | 中 | §3.3 高光形状层是必选件非可选件；B 样张定合格线 |
| 过渡带 halo（半分上采样渗漏） | 中 | §5.1 三件套：宽 feather + r 权重 + 逐级上采样 |
| 欠采样螺旋纹（disc 路线） | 中 | hash 旋转 jitter + 半分 + 限半径上限（C 案设计已内建） |
| WebGL1 循环/数组限制 | 低 | 常量上界+break；不用数组；highp 声明 |
| 智能默认误判（天空/夜景低梯度） | 低 | §4.2 三重置信守门 + 回退默认带 |
| 长图（>2:1）金字塔级数不够 | 低 | uMaxBlur 上限 25% 时 1/8 层等效半径≈短边 60px，已覆盖；样张含竖幅集市图验证 |

---

## 10. 参考来源

- [Unity 旧版 Tilt Shift（Lens Blur）文档转载](https://www.zf3d.com/bbs_list.asp?id=163464)（下采样+迭代的金字塔族先例）
- [毛星云《十种图像模糊算法总结与实现》](http://m.jiangsulong.com/a/2020/0427/042L330132020_11.html) + [X-PostProcessing-Library（TiltShiftBlurV2 / IrisBlurV2 实现）](https://github.com/QianMo/X-PostProcessing-Library)
- [知乎《游戏中的景深效果》](https://zhuanlan.zhihu.com/p/630570619)（简单混合法病理=「盘不逐渐变大、只有颜色过渡」——与旧版病理①②完全同构；disc 采样法；GPU Pro5 半分辨率 sprite bokeh）
- [GLSL Depth of Field with Bokeh v2.4（blenderartists 原帖，Shadertoy 移植源）](http://blenderartists.org/forum/showthread.php?237488-GLSL-depth-of-field-with-bokeh-v2-4-(update))（黄金角螺旋 gather 的经典实现）
- [CSDN《Bokeh 散景效果 Shader 深度解析》](https://blog.csdn.net/qq_39267110/article/details/156695696)（黄金角+费马螺线 r+=1/r 增量近似）
- [蜂鸟网：Photoshop CS6 Blur Gallery（Field/Iris/Tilt-Shift）](http://www.360doc.com/content/12/0721/16/596518_225644335.shtml)（产品参数面先例：Blur 强度+Distortion 扭曲）
- [Snapseed 移轴模糊用法汇总](https://www.haomeiwen.com/subject/zagjtxtx.html)（镜头模糊→移轴模式、强度/过渡两个手柄——移动端产品参数面先例）
- GPU Pro 5 "Bokeh Effects on the SPU"（半分辨率 RT + 亮度阈值 sprite 路线，本文排除但成本论证可参考）
- NVIDIA GPU Gems "Practical Post-Process Depth of Field"（CoC 驱动 gather 的原始谱系）
- 检索过程：内置 WebSearch 额度耗尽（429，reset 2026-10-16）后按降级规则改用 zhipu search_pro（4 次）。
