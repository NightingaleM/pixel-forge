---
title: 研究票——边缘检测与自动分区选型（选择性加箔）
labels: [wayfinder:research]
status: closed
assignee: 研究子代理（建图时已发）
blocked-by: []
---

## Question

为「选择性全息箔」三个能力层选定浏览器内技术方案，并给出与现有架构的整合方式：

1. **边缘加箔**：shader 内 Sobel/Canny 类边缘检测（边缘宽度/阈值可控、抗噪）能否在单 pass 内成立？prism 紫边模式的 luma 梯度检测先例可参考到什么程度？
2. **自动分区**：把图自动分成若干大区（天空/主体等）——颜色量化+k-means lite / flood fill 连通域 / SLIC 超像素等候选对比（成熟 npm 库的体积/维护状态须查证）；CPU（canvas 回读）vs GPU 各自性能量级（2048×2048 毫秒级估算）；分区结果如何变成 holofoil.frag 可用的掩膜纹理（架构允许 multi-pass/FBO 与 CPU 预处理）。
3. **点选开关面**：基于 2 的分区做点击拾取（连通域标记+命中测试）的可行性与成本；移动端 H5 同样要能用。

输入：`src/shaders/holofoil.frag`（现有单 pass 结构）、`src/shaders/prism.frag`（luma 梯度先例）、`src/lib/StyleRegistry.ts`、`src/types.ts`（ParamDef/visibleWhen）。约束：不得重开 map Notes 制图期裁决。

产出落 `../assets/research-partition.md`：三分层各一节（方案对比表、推荐+理由、备选、性能量级、掩膜纹理整合方式）+ 结论摘要 ≤10 行。

## Resolution

**2026-10-11 研究完成**，全文见 [assets/research-partition.md](../assets/research-partition.md)（含代码事实核对、npm 库查证来源）。结论：

1. **边缘加箔**：单 pass 内 Sobel 基座 + holofoil 现有 ±2px 多基线梯度取 max，smoothstep 软阈值（prism 紫边 idiom 照搬，复用度 ~80%），邻域 max 做边宽（1–4）；真 Canny 出局；**全图模式路径零改动，保旧码逐字节等价**。2048² 桌面 1–4ms。
2. **自动分区**：自研 k-means lite（RGB+xy、k≈6、固定 seed）在 ≤256² 低清格 + 两遍 union-find 连通域 + 小区并入；一次性 **<50ms 桌面 / <150ms 移动**；ml-kmeans 7.0.0（活跃、~63kB）为可信备选；SLIC（npm 库不可靠）/ opencv.js（8MB）/ image-q（停更）出局。
3. **点选开关面**：label grid 留 CPU，点击＝坐标换算 + O(1) 查表（毫秒级、无 GPU readPixels），H5 同套 pointer 换算无特化；on-the-fly flood fill 仅作「容差」增强备选。
4. **掩膜整合**：0/1 掩膜 canvas → texImage2D → bindTexture(3) + setSampler('uZoneMask')，逐行照抄 textraster 文字图集管线（renderImage.ts:88-110 先例）；holofoil 末尾加 `uZoneMask`/`uZoneEnabled` 两 uniform，**uZoneEnabled 默认 0 保旧码安全**；选择集走组件旁路 state（textParams 先例），不塞参数表。
5. **遗留裁决点（已并入票 06）**：分区跨设备浮点复现性 → 种子码「选中集合」编码方式（特征整数化 vs 本地不入码）须规格票裁决；低端移动 GPU 边宽核 fetch 需实测（超预算降档纯 smoothstep 带宽）；k 与 xy 权重默认值样张阶段定。
