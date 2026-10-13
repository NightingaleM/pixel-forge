---
title: 规格锁定——参数谱系、默认值、智能默认行为、验收口径
ticket: 04-spec-lock
labels: [wayfinder:grilling]
status: closed
assignee: claude
blocked-by: [03-lab-prototype]
date: 2026-10-13
---

## Question

样张合格后，把产品规格一次锁死（HITL grilling）：本风格入库的全部参数与行为，执行票照单全收不再请示。

### 待锁清单（制图期已知项）

- 参数谱系与默认值：焦带位置/宽度/倾角、模糊强度（+爬升曲线形态）、光圈形状 select 档位集合、饱和/对比/暗角量级；`visibleWhen` 适用性；骰子随机空间（哪些参数入随机、范围）。
- 智能默认焦带：估计算法采纳版本、置信判据与回退行为（估不准回退什么默认）、面板/批量/H5 三端是否都跑。
- 性能验收口径：实时预览帧率底线、批量 20 行可接受增幅、是否半分辨率跑模糊 pass。
- i18n：风格名/描述（含素材适配提示文案——上批「高角度俯拍大场景是硬前提」教训入 desc）+ 全参数键 ×2。
- 合格判定的 4 张图作为执行验收的视觉回归基准。

### 交付

票内 Resolution 记锁定规格全文；测试基线数字（341→执行后目标）在此更新。

## Resolution（2026-10-13 锁定；用户终判 + 制图期约束推导，执行票照单全收）

### 1. 风格身份

- id：`tiltshift`，**追加在 styles 数组末位（prism 之后）**——种子码兼容铁律。
- 单 pass？否——**A 金字塔混合多 pass 链**（4 ds + 深层上下两份动态加轮 + 1 合成），走 `renderToFBO` 变尺寸扩展 + `renderToCanvas` 可绑额外纹理（研究票 §8 基建清单）。
- 无 SVG 导出（shader 风格回退 PNG），不加 SVG 分支。

### 2. 参数面（13 slider，无 select/无 visibleWhen，全部常显）

| 参数 | uniform | 范围/步长 | 默认 | i18n zh / en |
|---|---|---|---|---|
| 焦带位置 | uBandY | 0.05–0.95 / 0.01 | 智能或 0.5 | 焦带位置 / Focus Band |
| 焦带宽度 | uBandW | 0.02–0.34 / 0.01 | 智能或 0.02 | 焦带宽度 / Band Width |
| 焦带倾角 | uBandTilt | -90–90° / 1 | 智能或 0 | 焦带倾角 / Band Tilt |
| 上缘虚化 | uMaxBlurTop | 1–25% / 0.5 | 6 | 上缘虚化 / Top Blur |
| 下缘虚化 | uMaxBlurBottom | 1–25% / 0.5 | 5 | 下缘虚化 / Bottom Blur |
| 过渡带 | uFeather | 0.03–0.70 / 0.01 | 0.34 | 过渡带宽度 / Feather |
| 高光盘感 | uHiGlow | 0–1 / 0.01 | 0.5 | 高光盘感 / Highlight Glow |
| 饱和 | uSat | 1.0–2.0 / 0.01 | 1.5 | 饱和度 / Saturation |
| 对比 | uCon | 0.8–1.8 / 0.01 | 1.3 | 对比度 / Contrast |
| 焦带锐化 | uClar | 0–1 / 0.01 | 0.5 | 焦带锐化 / Band Clarity |
| 暗角 | uVig | 0–0.5 / 0.01 | 0.25 | 暗角 / Vignette |
| 暖调 | uWarm | 0–1 / 0.01 | 0.5 | 暖调 / Warm Tone |
| 抖动 | uDith | 0–0.012 / 0.001 | 0.006 | 抖动 / Dither |

- **光圈形状参数砍除**（票 03 终判）：核固定圆盘。
- `uSamples`（高光层 tap 数）为内部常量（32），不入参数面、不入种子码。
- 长度单位统一**画幅短边比例**（跨尺寸观感一致）。

### 3. 骰子随机空间

- 13 参数全入随机（各自 min–max 内均匀）；焦带三参数（位置/宽/倾角）入随机——倾角全域 ±90° 随机会出现竖带，接受（参数自由语义）。
- 无 select → 无档位随机。种子码含全部 13 参数（沿用参数级锁死基建）。

### 4. 智能默认焦带

- **采纳实验室版**：64px 短边缩略图（比研究票 32px 抗量化噪声），灰度梯度能量 × 彩色度加权（0.4+0.6·chroma），倾角候选 {0,±8,±16}（采纳须 1.25× 于 0° 分），带宽候选 {0.08,0.12,0.18,0.24}，滑窗步 0.02，中心先验 -1.0·total·(c-0.5)²，3bin 平滑。
- **置信判据**：带内能量占比 ≥0.55 → confident；全图平均梯度 <3 → 平坦图不猜。
- **回退**：confident=false → 终判默认带 `y=0.5 / w=0.02 / tilt=0`（竖幅同值）；`getImageData` 跨域异常同回退（沿用 animelight catch 先例）。
- **三端都跑**：App2D 首载、runBatch 每图、H5 同管线（注册表驱动自动复用）；产出仅填焦带三参数默认位，其余 10 参数用全局默认；估计值用户可改可锁。
- 新文件 `src/lib/tiltshiftBand.ts`（纯函数 + 单测，构造数据验证：高频横带/竖带/平坦图/跨域回退）。

### 5. 渲染规格（A 路线，票 03 定稿语义）

- 半径曲线 `r = rm·pow(smoothstep(0, feather, d), 1.5)`，rm 按像素取本侧（上/下独立完全解耦）。
- 金字塔 L0..L3（1/2..1/16）+ 深层上下两份动态加轮 `rounds = clamp(round(R%/4), 1, 6)`。
- 权重按本侧归一 t 空间三角窗（T=0.117/0.25/0.517/1.0），清晰区权重平滑归零。
- 高光层：32-tap 费马螺旋 disc（固定圆核）on uOriginal，hiMask 平滑混入。
- 色彩链（合成 pass 末段，顺序固定）：带内 unsharp 加锐 → 饱和（模糊区 -18% 收）→ 对比 → 暗角 → 微暖 → 抖动。
- **验收断言沿用 [sweep.mjs](../assets/lab/sweep.mjs) 口径**：上/下解耦逐位一致、R% 单调（2→25% 顶缘边缘能量降）。

### 6. 性能验收口径

- 预览（≤1024 画布）：滑杆拖动不卡顿（单帧渲染 <16ms 量级，实验室 960 实测 <1ms）。
- 导出 2048：等效 fetch ≤120M（合成 21 fetch 全分 + 低分 ds 链；光影链 84M 先例内）。
- 批量 20 行：增量 ≤2s；H5 同链跑通（先清 pixel-forge-session IDB 再测——上批教训）。
- B/C 路线不入产品。

### 7. i18n 文案

- zh 名「移轴微缩」；desc：「俯拍大场景秒变微缩模型：焦带清晰、带外渐进重虚化、高饱和塑料感。高角度俯拍且车辆/人群等密集小元素效果最佳；平视特写不适用。」
- en 名 "Tilt-Shift Miniature"；desc: "Turn high-angle scenes into toy models: a crisp focus band with progressive heavy blur and punchy saturation. Best on aerial views of traffic and crowds; not for eye-level close-ups."
- 13 参数键 ×2 按上表。

### 8. 验收基准

- 测试基线 **341** → 执行后目标 ≥341+新增（tiltshiftBand 单测 + 注册表/渲染回归）；lint 持平 11（2D 0 新增）；tsc 0。
- **视觉回归**：4 张判定图 × 终判默认参数，生产管线直出 PNG 对照 [lab out/](../assets/lab/out/) 同参数 lab 直出（口径：宏观一致，金字塔 ds 实现细节差异允许）。
- 三端（面板/批量/H5）手测清单按上批 18 项惯例执行票内列。
