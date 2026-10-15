---
title: 动效面板 + 导出面板交互原型 lab
ticket: 03-motion-panel-prototype
labels: [wayfinder:prototype]
status: closed
assignee: main
blocked-by: []
date: 2026-10-15
---

## Question

动效面板（A/B 状态槽、参数参与 toggle、时长）与导出面板（格式/档位/预估体积/进度/取消）的**交互布局与编辑语义**，做成可操作的 HTML lab 实物给用户过目——重点验证「存入 A / 存入 B」的槽语义与拖滑杆时的编辑行为是否顺手，以及平滑往返循环的动效观感是否合格。

> **产物**：[motion-lab.html](../assets/motion-lab.html)（2026-10-15，单文件、真 kaleidoscope.frag 渲染、默认照片内嵌、可拖图替换）。冒烟+视觉复核已过（[verify-lab.mjs](../assets/verify-lab.mjs)，SMOKE PASS；headless 勿用 swiftshader 参数会 CONTEXT_LOST_WEBGL）。**待用户实物判定后关票**。
>
> **v2 迭代**（2026-10-15，用户判定 v1）：①「A/B 槽不爽」→ 砍掉存入/回看/未存入提示整套间接层：**左侧滑杆直接就是往返起点 A**（拖动即时生效），动效卡每参数一行 = 类型下拉（静止/往返/单向漂移）+ 终点 B 或漂移速度——**此改动覆盖制图期「整体状态快照」裁决，关票时同步修 map Notes**。② 新增**单向漂移**（X/Y 专属；tileMirror 镜像平铺天然无缝；缩放无单向——无法无缝循环）；速度 ±0.6/s 带方向。③ 漂移 × GIF 冲突显性化：无缝 GIF 需 速度×时长 ∈ 4 的整数倍（uCenter×0.5、tileMirror 周期 2），UI 橙色对齐提示 + 导出吸附策略，取舍留给用户判定（提速对齐 / 允许接缝 / 漂移配视频）。v2 冒烟+视觉复核 PASS。

### 任务

1. 单文件 HTML lab（惯例同 glass-lab / sampler）：预览画布**实时循环播放** A↔B（平滑正弦缓动、默认整循环 3s）；渲染用真万花筒（复用 [src/shaders/kaleidoscope.frag](../../../src/shaders/kaleidoscope.frag)）或等价简化模拟（若真 shader 接入成本高，模拟须能表达三参数联动观感）。
2. 动效面板：动效开关、「存入 A」「存入 B」状态槽（各自快照 zoom/centerX/centerY 全三值）、每参数「参与动效」toggle、时长滑杆（1–10s）；**滑杆编辑语义要给出方案并让用户实测**（编辑中的槽高亮/循环暂停与恢复的时机、另一槽如何切换查看）。
3. 导出面板：GIF/视频格式选择、默认档（GIF 512/12fps/1 循环；视频 720p/30fps/2 循环）+ 高级自定义、预估体积占位、进度条 + 取消按钮（可假进度）。
4. 用户实物判定：布局/槽语义/编辑行为 + **循环观感**（平滑往返是否自然、默认 3s 是否合适）逐项过，意见记 Resolution。
5. 图标遵守内联 SVG 手绘、禁 emoji。

### 交付

lab html 与截图落 [assets/](../assets/)，用户判定意见记票内 Resolution；不合格则按意见迭代（≤2 轮，再不合重启 grilling）。

## Resolution

**用户判定：v2 通过（2026-10-15）。**

- **交互模型定稿 = 每参数独立动效类型**：静止 / 往返（起点 A = 左侧滑杆直接编辑、终点 B 独立滑杆）/ 单向漂移（X/Y 专属，速度 ±0.6/s 带方向）。v1 的 A/B 整体状态槽（存入/回看/未存入提示）被用户否决（"不爽，有点奇怪"），整套砍除——**覆盖制图期「整体快照 + 参与 toggle」裁决，map Notes 已同步修正**。
- **循环观感合格**：平滑正弦往返自然，默认整循环 3s 认可（1–10s 可调保留）。
- **漂移 × GIF 取舍 = A（提速对齐）**：无缝 GIF 优先；漂移速度在导出时**向上吸附**到最近的整周期倍数（ceil，保证非零、循环无缝；周期 = 4 uCenter 单位，来自 tileMirror 周期 2 × uCenter×0.5）。速度滑杆范围/默认值档位进规格票微调。视频为片段播放，不受此约束。
- **256 色量化目检未提出异议** → 按研究票结论抖动默认关，自研 FS 升级路径保留。
- 产物：[motion-lab.html](../assets/motion-lab.html)（v2）+ [verify-lab.mjs](../assets/verify-lab.mjs)（SMOKE PASS）+ 截图 lab-shot-overview / lab-shot-zoom。
