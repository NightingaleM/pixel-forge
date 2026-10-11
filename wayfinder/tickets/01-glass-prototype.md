---
title: 玻璃质感原型定稿
id: 01
labels: [wayfinder:prototype]
status: closed
assignee: claude
blocked-by: []
parent: map
---

## Question

玻璃扭曲的视觉到底长什么样、各档参数是多少？用一个**独立轻量试验台**（单 HTML 文件或最小 vite 页，不接 StyleRegistry、不动仓库源码）实现 WebGL 玻璃扭曲 shader，与用户眼验迭代至定稿。

**实现要点**（出处见 [map 资产](../assets/2d-style-architecture-scout.md)）：

- 范式 = 噪声位移场改写采样坐标（`texture2D(uImage, uv)` 前的重映射）；万花筒 `src/shaders/kaleidoscope.frag:57-119` 是现成 UV 改写参考，其 `tileMirror` 防边缘拉丝教训要吸收。
- 噪声可复用/改造 `src/shaders/crosshatch.frag:15-27` 的 hash + 双线性 value noise；按需叠倍频。
- 至少覆盖：**玻璃类型两档**（图1 大波浪连绵起伏 = 默认 / 图2 细密橘皮鼓包）× **强度三档**，全部实时可调。
- 对照参考图：`wayfinder/assets/ref-glass-1.png`、`ref-glass-2.png`。
- 纹理上传钳制 2048（`ShaderRenderer.ts:18`），试验台取同上限以保所见即所得。

**产出**：harness 文件 + 定稿参数表（各档噪声形态/频率/倍频/幅度/方向性、默认值、强度映射曲线），记入 Resolution。

HITL：档位气质与最终定稿必须用户过目拍板，不得代理。可并行试多套噪声场方案（Workflow judge panel 式）供用户挑选，但定稿权在用户。

## Resolution

**结论：三套噪声场全部成立、全部进正式档（用户裁决，突破制图期"两档"约束）；默认档 = 大波浪。**

### 制图期矛盾的裁决

视觉分析发现 ref-glass-1.png 实为**方格压花格纹**（正交格点透镜阵，非票面所写"大波浪"）。用户选择"三套都做进试验台"，最终三张截图拍板三种气质全留、默认大波浪。

### 定稿参数表（已固化为 glass-lab.html 默认值，切模式自动带出定稿强度）

| 参数 (uniform) | 大波浪（默认） | 方格压花 | 橘皮 |
|---|---|---|---|
| 定稿强度 | 0.78 | 0.51 | 0.34 |
| uP0 | 波长尺度 0.73 | 格数 N 20.5 | 鼓包基频 26 |
| uP1 | 倍频粗糙度 0.52 | 逐格错位 0.52 | 低频流动 0.25 |
| uP2 | 方向拉伸(y密) 1.37 | 透镜鼓包 0.32 | domain warp 0.12 |
| uP3 | — | 翻转概率 0.16 | 疏密包络 0.12 |
| 其他 | — | 缝亮脊+逐格曝光 **开** | — |

### 实现范式（票3 照抄）

- 位移 = 噪声高度场**梯度**折射位移（透镜/微缩复制感的来源），非直接 value 位移。
- 高度场：大波浪=3 octave fBm（基频 1.8/scale）；橘皮=4 octave fBm+domain warp+疏密包络+低频流动；方格压花=结构化格点场（`floor(uv*N)` 逐格 hash jitter + 钟形透镜包络 + 概率翻转），**不走 fBm**。
- 采样越界用三角波 mirrorWrap（吸收 kaleidoscope tileMirror 教训）。
- value noise 用 quintic 平滑（C2 连续，透镜面光滑）。
- 方格缝亮脊：采样后叠加（`0.5-max(|f.x|,|f.y|)` 距缝场 → 亮脊+暗影+逐格曝光），**非独立 pass**。
- **单 pass 全部成立**——三套场均无多 pass 需求（雾条已答）。

### 迭代出的工程铁律（票3 必守）

1. **高频场 K 必须按频率量纲折减**：橘皮（基频 26）梯度比波浪（基频 ~2.5）大一个量级，同 K 会过度碎片化。定稿：波浪 `K=0.11·s^1.5`，橘皮 `K=0.032·strength²`（二次曲线让弱档温和）。
2. **gain×lacunarity 必须 <1**：否则高频 octave 的位移/波长比逐级暴涨 → 采样折叠（fold-over）→ 高对比边界出黑白碎屑。定稿 gain 0.35 × lac 1.95 ≈ 0.68/octave。此 bug 曾连续三轮（v2 过猛→v3 白斑→v4 边缘碎屑），v5 治本。
3. 梯度数值差分步长取 0.004（抗高频走样）。
4. 方格"跨缝不连续感"必须靠**逐格随机 jitter**，连续正弦场做不出。

### 迭代记录

v2 用户反馈"强度不高即不可辨" → K 压半；v3 中档过猛+高对比白斑 → 二次曲线+密度 22→16+eps 加大；v4 边缘碎屑定位病根=采样折叠 → gain 0.52→0.35 衰减；v5 三档全过（弱✓中✓强贴顶）；包络 0.40→0.12、密度 16→26 等终值为用户三张截图拍板。

### 资产

- [assets/glass-lab.html](../assets/glass-lab.html)——试验台即定稿参数表活文档（默认值=定稿值）。
- puppeteer 自验截图存 `c:/tmp/glass-shots/`（v2–v5 迭代过程）。
