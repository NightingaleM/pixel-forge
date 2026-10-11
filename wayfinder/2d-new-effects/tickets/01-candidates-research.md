---
title: 候选谱系扫描——光学/镜头优先
labels: [wayfinder:research]
status: closed
assignee: 调研子代理（已完成并核实）
blocked-by: []
---

## Question

在**光学/镜头轴深挖**（色差、移轴、lomo、胶片、全息、光晕、散景、棱镜、扫描故障等）、其余四轴（几何重映射 / 材质印刷 / 结构重组 / 文字符号）**广扫**的前提下，产出 **≥10 个候选新风格**清单，每个包含：

1. 中文效果名（不得与现有 12 风格重名）+ 一句话描述
2. 视觉参考（web 链接，或精确到可脑补的文字描述）
3. 实现路径初判：WebGL1 单 pass / multi-pass(FBO) / canvas2d；可复用的现有基础设施（GLSL 噪声= crosshatch/diffusion/pointillism 的 hash+value noise、UV 重映射范式 = kaleidoscope/glassdistort）
4. 与现有 12 风格的重复风险标注（半色调/扩散抖动已占印刷质感位，万花筒/玻璃扭曲已占几何重映射位）
5. 惊艳度 × 可玩性双维评分（1–5）+ 理由；**两维都低（均 ≤2）才淘汰**；「惊艳但参数少」可保留

产出落盘 `assets/candidates.md`（中文、按推荐度排序、标出 top 3），参考图链接优先；top 3 可选下载至 `assets/refs/`（尽力而为，失败跳过）。

**现状事实**（评分与可行性判断的底座）：现有 12 风格 = 半色调 halftone、扩散抖动 diffusion、波普艺术 popart、光影 lightshadow(3pass)、素描 sketch、点彩 pointillism、万花筒 kaleidoscope、网纹底稿 crosshatch、动画光影 animelight(2pass)、文字栅格 textraster、ASCII字符艺术 ascii(canvas2d)、玻璃扭曲 glassdistort。参数体系：number/toggle/select/color/text/font + `visibleWhen` 条件显隐（`src/types.ts:13`）；select/color 入种子码且随机。渲染上限 2048、实时 GPU、无 worker。种子码铁律：新风格追加数组末位。

## Resolution

**2026-10-11 调研子代理完成，主会话核实落盘后关闭。**

- **产出**：[assets/candidates.md](../assets/candidates.md)——18 个主候选（光学 9 / 几何 2 / 印刷 3 / 结构 2 / 文字 2）+ 5 个观望区候选（乐高马赛克、照片拼贴马赛克、Droste、CRT、水面涟漪，均附否决理由）。参考图 5 张落盘 `assets/refs/`（halation-cinestill-50d.png、holographic-foil-rolls.jpg/-2.jpg、tiltshift-bigair-shougang.jpg、tiltshift-cablecar-forest.jpg），均经视觉模型核验对题。
- **核心结论**：光学/镜头轴全面胜出——现有 12 风格全在「质感/结构」维度，「光线情绪」维度完全空缺。Top 3 = 胶片晕光颗粒（5×5，Cinestill 红晕+银盐颗粒+划痕，3-pass FBO）、全息箔（5×4，碎冰/拉丝/珠光三模式镭射，单 pass）、移轴微缩（5×4，可调焦带+饱和增益，2-pass FBO）；所需基础设施（FBO 链、噪声库、brightPoint）全部现成。第一梯队备选：镜头光晕（4×5，复用 brightPoint）、小星球（4×3，约七成复用 kaleidoscope 极坐标代码）。
- **风险标注**：散景焦外是唯一需半分辨率兜底的性能风险项；RISO/铜版蚀刻/盲文点阵标中重复风险及差异化验收标准；二维码马赛克注明「装饰非可扫真码」。主候选无一触「两维均 ≤2」淘汰线。
- **调研建议**：第一批落地 top 3 + 小星球（最终由票 02 用户拍板）。
- **搜索工具记录**：内置 WebFetch ×3 被网络策略拦截（域名安全校验失败），按规则单向降级智谱 5 次（search_pro ×3 + search_pro_sogou ×2）全部成功；维基百科链接需代理查看，文档内已附 CN 直连替代链接。
