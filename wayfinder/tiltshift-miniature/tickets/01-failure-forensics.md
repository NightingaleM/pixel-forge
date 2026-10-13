---
title: 旧版失败病理定量复盘 + 真实移轴观感要素集
ticket: 01-failure-forensics
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
date: 2026-10-13
---

## Question

上一批两版移轴样张为什么都不对（可量化的病理结论）？以及：真实移轴微缩摄影里让人产生「玩具小人国」错觉的**观感要素全集**是什么——每项要素给出量级基准（模糊半径占画高比例、过渡带宽、饱和/对比增益、焦带几何），作为实验室样张与规格锁定的设计输入。

### 已知病理假设（待证实/证伪/补全）

1. **模糊本质错**：旧版是高斯涂抹（9-tap 拉伸核 × 5 轮 H/V 叠糊），观感=蒙凡士林/雾；真实失焦=光圈形状 bokeh 盘卷积，高光晕成圆盘、边缘盘状结构。「涂抹感 vs 失焦感」可能是认可与否的分水岭。
2. **模糊爬升错**：旧 shader 焦带外 `smoothstep(0.03,0.28,db)` 一刀进满糊（三明治结构）；真实移轴模糊半径随离焦带距离单调递增，远处应重到只剩色块。
3. **观感强度不足**：σ≈20px 在 960 画布经缩放观看仅剩轻度柔化（视觉核验连明显模糊都没看到）；参考图模糊量、饱和度、对比均远高于此。

### 任务

1. 读旧实现代码：[wayfinder/2d-new-effects/assets/sampler/sampler.html:146-158,243-253](../../2d-new-effects/assets/sampler/sampler.html)（blur 核 73-83 行）——推算实际有效模糊半径与核形态，验证/修正上述假设。
2. 视觉对比分析三组图（用图像分析工具逐张过）：2 张参考图（首钢大跳台、秋林索道，在 [wayfinder/2d-new-effects/assets/refs/](../../2d-new-effects/assets/refs/)）× 旧两版渲染（[wayfinder/2d-new-effects/assets/sampler/06-tiltshift*.png](../../2d-new-effects/assets/sampler/)）× 4 张判定图（[assets/testimg/](../assets/testimg/)）。参考图提取要素量级；旧渲染确认失败模式；判定图给出每张的焦带建议（位置/走向/宽度）。
3. Web 调研 miniature faking / tilt-shift photography 技巧文与佳作分析（拍摄角度先验、饱和对比惯例、模糊梯度速度、什么素材出效果、什么会穿帮）。
4. 产出**观感要素清单**：每项要素 = 名称 + 量级建议 + 对应判定图的适配备注；并明确回答「高斯 vs bokeh 盘是不是关键分水岭」。

### 交付

落盘 [assets/research-forensics.md](../assets/research-forensics.md)，票内 Resolution 记结论摘要。

## Resolution

**根因（超出三条假设的新发现）**：blur shader 采样偏移用了 UV 单位而非 texel（`vUv + uDir*(i*3)`，偏移 9/18/27/36 全部越界被 CLAMP 钳到画面边缘行列）——每 pass 实为「22.7% 保留自身 + 77.3% 混入行列端点」，5 轮后原图信息权重 0.227¹⁰≈3×10⁻⁷。**旧版从未产生过任何真实模糊，有效 σ=0**。headless Edge 复刻探针实锤：白块能量 4080 → 5 轮后 0（真模糊应能量守恒）。

三条假设裁决：H1 证伪并改写（不是高斯涂抹，是边界调和场+alpha 混合雾；bokeh 非分水岭）；H2 方向对但机理改写（真问题是 alpha 混合替代半径渐变，非一刀切）；H3 结论成立、数值前提证伪（σ=0 而非 20px）。

scene2「模糊不可见」= 满糊区被替换成边界色场且恰落在天空/路面低频区 + 过渡带呈雾感非失焦感。另：scene2 素材经鉴定是圣保罗城市街景俯拍，非票 03 所记「山景」，信源冲突待裁决。

观感要素基准（参考图实测+调研收敛）：焦带宽 12–25%H、满糊晕开宽 2–5%H（σ 1–3.5%H，下缘≥上缘）、半径单调渐变、过渡带每侧 8–20%H、饱和 +12–18 点、对比 +10–20%、带内加锐、素材俯角>25°。4 张判定图焦带/模糊预算逐张给出（海滩图斜带 +13° 沿水线；竖幅集市图下缘半径×0.65 且 ≤45px 封顶）。

**高斯 vs bokeh：不是分水岭**——参考图本身即数字模拟软晕；真分水岭 = 半径渐变+剂量+色彩分离+俯角素材。bokeh 列 P2 可选参数。

全文见 [assets/research-forensics.md](../assets/research-forensics.md)。
