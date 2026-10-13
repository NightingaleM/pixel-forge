---
title: 变半径 bokeh 模糊 GPU 实现路径 + 智能默认焦带算法
ticket: 02-implementation-research
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
date: 2026-10-13
---

## Question

在硬约束（2048 渲染上限、实时 GPU、无 worker、批量 20 行不显著超时）下：**变半径 bokeh 失焦的最优 GPU 实现路径**是什么？以及**智能默认焦带估计算法**（32px 缩略图 CPU 分析）怎么做、置信判据是什么？

### 任务

1. **变半径模糊技术谱系调研**（Web：Shadertoy tilt-shift 名作、可分离高斯多级金字塔混合、环形/螺旋 disc 采样、逐行变半径、anamorphic 模糊等）：每条路线给出 pass 数 × 每像素采样数 @2048 的成本估算、bokeh 盘质感（高光是否成盘）、banding/振铃风险、与 [src/lib/ShaderRenderer.ts:300](../../../src/lib/ShaderRenderer.ts) `renderMultiPass`（光影 3-pass 先例，末 pass 绑 uImage+uOriginal）的接线适配度。
2. **光圈形状核**：圆盘/六角/椭圆 bokeh 核的 GLSL 实现方案（SDF 掩码 or 解析权重），柔边处理，形状随模糊半径的缩放行为。
3. **性能预算与降级路径**：全分辨率 vs 半分辨率跑模糊 pass 的画质/性能取舍（上批「散景焦外」候选曾预判「核 pass 必须半分辨率跑」——验证该预判是否同样适用于移轴）；实时预览与批量导出可否分档。
4. **智能默认焦带算法**：32px 缩略图逐行细节密度/梯度能量/饱和杂度 → 焦带位置+宽度+倾角估计；置信度判据（何时不猜、回退默认）；横竖幅通吃；与 brightPoint.ts（32px 缩略图 luma 扫描先例，批量管线已接）的复用关系。
5. **色彩增益链**：饱和/对比/暗角在哪个 pass 做（合成 pass 内 or 独立）、模糊区高光 bloom 要不要。
6. 产出 **A/B/C 实现蓝图**：每案 = 路线 + 参数面草案 + 成本 + 风险 + 推荐度排序，供实验室样张票取用。

### 交付

落盘 [assets/research-implementation.md](../assets/research-implementation.md)，票内 Resolution 记结论摘要。

## Resolution

结论全文见 [assets/research-implementation.md](../assets/research-implementation.md)（路线对比表、光圈形状核 GLSL 伪代码、焦带算法、A/B/C 蓝图、基建改动清单、风险登记簿）。摘要：

- **推荐 A（多级金字塔混合+高光形状层，≈38M fetch @2048，0.45× 光影链）≥ C（半分螺旋 disc+重糊层，≈40-57M）> B（单 pass 全分 disc，268M，移动端批量超时风险，仅作质感上界对照）**。A/C 进实验室，B 定盘感合格线。
- 半分辨率预判**成立且移轴更甚**（最大半径 250-410px@2048）；清晰像素恒取全分 uOriginal，唯一风险=过渡带 halo，三件套缓解（宽 feather/r 权重/逐级上采样）。
- 光圈形状核：SDF 掩码（圆/六角/椭圆）×黄金角螺旋 gather，柔边 smoothstep，WebGL1 常量上界+uSampleCount break 分档。
- 智能默认焦带：32px 缩略图梯度能量→5 档倾角 1D 投影→滑窗找带；三重置信守门（集中度≥0.55/峰度≥2/平均梯度≥3），不满足回退 y=0.45/w=0.12/tilt=0；横竖幅同码（带恒水平）。
- 色彩链全做末合成 pass（饱和默认 1.45/对比 1.15/暗角 0.15/微暖移），**不加独立 bloom**。
- 基建最小改动：renderToFBO 可选输出尺寸 + 新增 renderToCanvas(boundUnits)（约 30 行，不动 renderMultiPass 光影语义）。
