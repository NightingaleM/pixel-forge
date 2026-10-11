---
title: 2D 新风格第二批（光学/镜头优先）
labels: [wayfinder:map]
status: closed
tracker: local-markdown
---

## Destination

为 2D 风格库（现 12 个）选定并交付一批「更有意思」的新风格：候选谱系扫描（光学/镜头轴深挖、全谱系广扫）→ 用户拍板选型（复杂 1 个 / 简单可多个）→ 每个入选风格轻量样张确认 → 锁定规格 → 按常设偏好全自动执行至三端验收、本地合入 main（不 push）。

## Notes

- **领域事实**：架构侦察报告见上张图 [wayfinder/assets/2d-style-architecture-scout.md](../assets/2d-style-architecture-scout.md)（11 风格时点，仍有效）。本次复核更新：现 12 风格（含 `glassdistort`，`StyleRegistry.ts:325`）；`visibleWhen` 已是通用能力（`src/types.ts:13`，三种 ParamDef 均可挂，隐藏值保留）；测试基线 **329**；渲染上限 2048；批量/移动 H5 注册表驱动自动复用。
- **制图期已定约束（grilling Q1–Q8，票内不得重开）**：
  - 终点 = 全自动交付本地 main；数量弹性——**复杂 1 个 / 简单可多个**，拍板时按候选复杂度定。
  - 研究方向：**光学/镜头轴深挖**，其余四轴（几何重映射/材质印刷/结构重组/文字符号）广扫；参考图由调研代理找（用户暂无新参考图，中途可随时丢进来）。
  - 继续免费，付费墙只在导出水印，不开 per-style 先例。
  - 技术按需：multi-pass（FBO）、canvas2d 特例均允许，但每个风格保持**单会话可交付**体量。
  - 确认门：每个入选风格先做**轻量样张**（一张对比页即可，不必完整试验台），用户过目拍板后才锁规格，随后全自动执行。
  - 候选评估：**惊艳度 × 可玩性双维**，两维都低才淘汰；「视觉惊艳但参数少」的效果可保留，不因可玩性单项低而出局。
- **常设偏好（执行票必须遵守）**：设计确认后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增（基线 11 错全在 3D，2D 期望 0）；测试基线 329；UI 图标手绘内联 SVG 禁 emoji；浏览器实测按 memory 中 browser-verification-playbook（WebGL 画布自动化验证必须 canvas.toDataURL 直出）。
- **种子码兼容铁律**：新风格必须**追加在 styles 数组末位**；shader 风格无 SVG 导出（回退 PNG），勿加 SVG 分支。
- **技能说明**：本环境可用技能中无 research / prototype / domain-modeling——研究票以通用 web 搜索子代理代替；原型确认以轻量样张页代替（Q7 已裁）。
- **Tracker 约定（local-markdown）**：本图自带子目录（map.md + tickets/ + assets/）。票 frontmatter：`labels`（wayfinder:research/prototype/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（票 id 列表，用文件名 stem）。前沿 = open + 无 assignee + blocked-by 全 closed。关票：正文追加 `## Resolution` 记答案，status 改 closed，本图 Decisions so far 加一行指针。

## Decisions so far

- [候选谱系扫描——光学/镜头优先](tickets/01-candidates-research.md): 18 主候选 + 5 观望区落盘 [assets/candidates.md](assets/candidates.md)（5 张参考图在 refs/）；Top 3 全出光学轴——胶片晕光颗粒 5×5（3-pass）、全息箔 5×4（单 pass）、移轴微缩 5×4（2-pass），「光线情绪」维度在现有 12 风格中完全空缺且基础设施全现成；无一触淘汰线；调研建议批 = top3 + 小星球。
- [代表候选实渲染样张](tickets/03-sampler-renders.md): [assets/sampler/](assets/sampler/) 5 效果粗 shader 真渲染（car 图 + 用户俯拍山景图两版），样张页升级为可换图工具（`?img=&bandY=&bandTilt=`）；移轴首版 7px 轻糊判错、修复为 FBO 重虚化后渲染成立但用户仍未认可。关键学到：**全图色彩/质感变换一眼可认可，「清晰度重分配」类难获认可——后续候选评估调高「一眼可见」权重**。
- [用户拍板选型](tickets/02-shortlist-grilling.md): **本批 = 全息箔 + 棱镜彩虹色散**（均单 pass，「简单可多个」）；移轴微缩出局本批、另立新图深入研究（见 Out of scope）；晕光（top1）留在候选池下批优先。
- [规格收口与设计确认](tickets/04-spec-lock.md): **设计确认门通过（用户「认可」）**。holofoil 8 参数（质感 select 三档 + 强度/密度/角度 + 底色 color 随机 + visibleWhen 专属参数）、prism 4 参数（模式 select 三档 + 色散量 + visibleWhen）；styles 末位追加 holofoil→prism；不做 presets；i18n 34 键×2；拉丝/珠光无样档执行时实测定稿、复核可砍。
- [注册表接入与三端验收执行](tickets/05-execute.md): **已交付本地 main（99ef607，未 push）——图目的地达成**。341/341 测试（329→341）、lint 持平、tsc 0 错、三端 18/18、旧码回填渲染逐字节一致；拉丝/珠光实测定稿成立（verify/ 8 图视觉复核），用户复核仍可砍档；H5 实测先清 IDB、shader 测试源图三条教训在票内。

## Not yet specified

（无——执行票已毕业，前沿只剩执行票 05。）

## Out of scope

- **移轴微缩（本批出局）**：实渲染样张两版（轻糊错版 + FBO 重虚化修复版，用户俯拍山景素材）用户均未看出效果，裁决暂不做——后续作为独立项目深入研究，重启时另立新图（连同素材适配性一起研究：高角度俯拍大场景是硬前提）。详见 [代表候选实渲染样张](tickets/03-sampler-renders.md)。
- **per-style 会员收费**：本批继续免费；付费墙维持只在导出水印（制图期 Q5 已裁）。
- **3D 侧效果**：本图仅 2D。
- **动态/时间维效果**（视频/GIF/动画导出）：本批静态图导出为界，要做另立图。
- 沿用上张图裁决：**局部玻璃板/区域蒙版**类手摆交互、**shader 风格 SVG 导出**（现状即回退 PNG）。
