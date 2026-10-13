---
title: 移轴微缩（tilt-shift miniature）深入研究与交付
labels: [wayfinder:map]
status: closed
tracker: local-markdown
created: 2026-10-13
---

## Destination

把上一批被判「效果不对」的移轴微缩做对并交付为正式 2D 风格：深度研究（旧版失败病理 + 真实移轴观感要素 + 变半径 bokeh 实现路径）→ 实验室样张（4 张判定图 × 候选方案矩阵，可调参工具页）→ 用户判定合格 → 锁规格 → 全自动执行入库（styles 末位追加、面板/批量/H5/i18n/三端验收）→ 本地 commit 合入 main 不 push。

## Notes

- **判定基准（用户指定）**：[assets/testimg/](assets/testimg/) 4 张俯拍密集场景图（纽约街道车流 / 黄昏海滩人群 / 竖幅印度集市 / 河内路口车流；视觉评估适配度 4~4.5/5，含 1 张竖幅）。旧失败素材 local_test_pic 已不存在，无回归可用。
- **失败史（上图遗留）**：两版样张均未获用户认可——v1 是 7px 轻糊（错），v2 是 FBO 5 轮高斯重糊（渲染「成立」但用户仍未认可）。旧实现在 [wayfinder/2d-new-effects/assets/sampler/sampler.html:146-158,243-253](../2d-new-effects/assets/sampler/sampler.html)（blur 核在 73-83 行）。上图教训：**清晰度重分配类效果必须「一眼可见」**，本图合格线据此定为戏剧化优先。
- **制图期已定约束（grilling 2026-10-13，票内不得重开）**：
  - **一图到底**：合格门后直接执行入库，不再请示（沿用常设偏好）。
  - **焦带定位 = 手动参数 + 智能默认**：参数手动可调（位置/宽度/倾角），首次载入自动估焦带（复用 [src/lib/brightPoint.ts](../../../src/lib/brightPoint.ts) 的 32px 缩略图 CPU 分析思路），估不准可手调。
  - **合格线 = 戏剧化优先**：默认参数即「一眼玩具感」（重 bokeh + 高饱和高对比，对齐首钢大跳台参考图 [wayfinder/2d-new-effects/assets/refs/tiltshift-bigair-shougang.jpg](../2d-new-effects/assets/refs/tiltshift-bigair-shougang.jpg)）；自然轻柔作为低强度参数可达，不占默认位。
  - **光圈形状入参数**：圆/六角/椭圆等失焦盘形状做成 select 参数（骰子随机空间 +1）。代价：透支未来「散景焦外」候选的独有卖点（见 Out of scope）。
  - **变虚化驱动 = 几何代理**：模糊半径由「像素到焦带的画面距离」驱动，不用 AI 深度估计（无 worker/模型推理基础设施，2048 实时与批量约束下不可行）。
- **域事实**：架构底座见 [wayfinder/assets/2d-style-architecture-scout.md](../assets/2d-style-architecture-scout.md)（11 风格时点）。现况复核：**14 风格**（末位 `prism`，[src/lib/StyleRegistry.ts:398](../../../src/lib/StyleRegistry.ts)）；multi-pass FBO 基建在 [src/lib/ShaderRenderer.ts:300](../../../src/lib/ShaderRenderer.ts) `renderMultiPass`（末 pass 绑 uImage+uOriginal，光影 3-pass 先例）；CPU 缩略图分析先例 brightPoint.ts（批量管线已接）；`visibleWhen` 通用能力（src/types.ts）；测试基线 **341**；渲染上限 2048；批量/移动 H5 注册表驱动自动复用；**凡 CPU 全图逐像素一律禁止**。
- **常设偏好（执行票必须遵守）**：设计确认后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增（基线 11 错全在 3D，2D 期望 0）；UI 图标手绘内联 SVG 禁 emoji；浏览器实测按 memory 中 browser-verification-playbook（WebGL 画布自动化验证必须 canvas.toDataURL 直出）。
- **种子码兼容铁律**：新风格必须**追加在 styles 数组末位**（prism 之后）；shader 风格无 SVG 导出（回退 PNG），勿加 SVG 分支。
- **技能说明**：本环境可用技能中无 research / prototype / domain-modeling——研究票以通用 web 搜索子代理代替；原型确认以实验室样张页代替。
- **搜索工具降级规则**：内置 WebSearch/WebFetch 失败即改用智谱 MCP `zhipu_web_search`（技术调研 search_pro、中文生态 search_pro_sogou），单向降级不回切。
- **Tracker 约定（local-markdown）**：本图自带子目录（map.md + tickets/ + assets/）。票 frontmatter：`labels`（wayfinder:research/prototype/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（票 id 列表，用文件名 stem）。前沿 = open + 无 assignee + blocked-by 全 closed。关票：正文追加 `## Resolution` 记答案，status 改 closed，本图 Decisions so far 加一行指针。

## Decisions so far

- [执行入库交付](tickets/05-execute.md): **全票关闭，图收官**。第 15 风格 `tiltshift` 交付本地 main（commit 见票内）。验收：387/387 测试（基线 341→387）、lint 持平 11、tsc 0 新增、桌面+H5 E2E 16/16、lab 断言 57/57、视觉回归 8-9/10、旧码 roundtrip 全过。规格偏差三处（bandY 0-1 / feather 0.72 为种子码浮点档位安全；估计 width 不采纳）均记票内；新坑三条（量纲两端同空间 / H5 触屏 sheet 坐标点击不触发 / 自定义 pass 链 finally 删纹理）入档。
- [规格锁定](tickets/04-spec-lock.md): id `tiltshift` 末位追加、A 金字塔多 pass 链；**13 slider 参数面**（焦带位置/宽/倾角±90°、上下缘虚化独立 1-25%、过渡带 0.03-0.70、高光盘感、饱和/对比/焦带锐化/暗角/暖调/抖动）全入随机、无 select/visibleWhen；智能焦带=实验室 64px 彩色度加权版（置信 ≥0.55，回退 y.5/w.02/tilt0，三端都跑，`tiltshiftBand.ts` 纯函数+单测）；渲染规格与验收断言沿用 sweep 口径（解耦逐位/单调）；性能 ≤120M fetch、批量 +≤2s；i18n zh「移轴微缩」+13 键 ×2；测试基线 341 起步、lint 持平 11、4 图默认参数作视觉回归基准。
- [实验室样张——用户判定合格](tickets/03-lab-prototype.md): **A 金字塔混合胜出**；默认参数定稿（用户实调）：`bandY .5 / bandW .02 / tilt 0 / maxBlurTop 6% / maxBlurBottom 5% / feather .34 / hiGlow .5 / sat 1.5 / con 1.3 / clar .5 / vig .25 / warm .5 / dith .006`，极窄带+长过渡+浓色彩；**光圈形状参数砍除**（白昼素材不可见，核固定圆）；**竖幅默认 0° 倾角、范围放开 ±90°**；上/下满糊半径独立参数且完全解耦（sweep 逐位验证）、R% 经深层动态加轮（每 4% 一轮）全程单调有效；B 出局（欠采样噪声随 R% 反增）、C 出局（交叉带重影）。
- [变半径 bokeh 模糊 GPU 实现路径 + 智能默认焦带算法](tickets/02-implementation-research.md): [research-implementation.md](assets/research-implementation.md) 落盘——推荐 **A 金字塔混合（≈38M fetch，0.45× 光影链）为主案、C 半分螺旋 disc 并列进实验室，B 全分单 pass 仅作质感上界对照**；半分辨率预判成立且移轴更甚（最大半径 250-410px@2048），清晰像素恒取全分 uOriginal；光圈形状=SDF 掩码×黄金角螺旋；智能焦带=32px 梯度能量投影滑窗+三重置信守门，回退 y0.45/w0.12/tilt0；色彩链全在末 pass、不加独立 bloom；基建仅需约 30 行轻扩展（变尺寸 FBO+上屏可绑额外纹理）。
- [旧版失败病理定量复盘 + 真实移轴观感要素集](tickets/01-failure-forensics.md): [research-forensics.md](assets/research-forensics.md) 落盘——**根因实锤：旧版 blur 偏移用 UV 单位而非 texel，全部越界被 CLAMP 钳到边缘行列，有效 σ=0（从未产生真实模糊；探针实测能量不守恒）**；三条病理假设两证伪一改写，「高斯 vs bokeh」判为**非分水岭**（真分水岭=真实半径渐变+足够剂量+饱和对比增益+俯角先验），bokeh 盘降为可选加分项；观感基准：焦带宽 12-25%H、满糊晕开 2-5%H（下≥上）、饱和 +12-18、对比 +10-20%+带内加锐；4 张判定图焦带建议逐张在文；另鉴定旧 scene2 素材实为圣保罗街景（旧图票 03 所记「山景」有误，仅记录不重开）。

## Not yet specified

- **样张若两轮迭代仍不认可**的应对（换实现路线重开研究 / 降级目标 / 关图）——待 [实验室样张](tickets/03-lab-prototype.md) 结果才能成形。
- **智能默认的置信判据与回退行为**（何时不猜、回退什么默认）——挂实现研究产出，规格锁定票收口。
- **饱和/对比/暗角等色彩定稿量级、形状 select 档位集合**——挂样张对比结果，规格锁定票收口。

## Out of scope

- **AI 深度估计路线**：制图期已裁——客户端无 worker/无模型推理基础设施，2048 实时与批量 20 行约束下不可行；几何代理 + 智能默认焦带已够戏剧化合格线。
- **「散景焦外」候选池处置**：光圈形状入移轴参数后其独有卖点被透支——影响记录在案，未来候选扫描时直接考量；本图不动候选池。
- 旧失败素材（用户俯拍山景 scene2）回归判定：原图不可得，判定基准 = 新 4 张。
- 沿用上两图裁决：shader 风格 SVG 导出（现状回退 PNG）、局部手摆蒙版交互、动态/时间维效果、3D 侧效果、per-style 会员收费（继续免费，付费墙只在导出水印）。
