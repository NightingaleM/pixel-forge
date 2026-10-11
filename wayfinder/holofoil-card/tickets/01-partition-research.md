---
title: 研究票——边缘检测与自动分区选型（选择性加箔）
labels: [wayfinder:research]
status: open
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
