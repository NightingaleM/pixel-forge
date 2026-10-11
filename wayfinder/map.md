---
title: 2D 玻璃扭曲特效（非平滑玻璃覆盖）
labels: [wayfinder:map]
status: closed
tracker: local-markdown
---

## Destination

2D 风格库新增第 12 个风格「玻璃扭曲」：基于噪声位移场的全幅 UV 重映射，做出"隔着非平滑玻璃看图"的质感（参考图见 `assets/ref-glass-1.png` 大波浪 / `ref-glass-2.png` 橘皮细纹）。终点 = 已验收的可调参视觉原型 + 锁定的可执行规格，随后按常设偏好全自动实施至本地合入（不 push）。

## Notes

- **领域事实**：2D 特效为注册表驱动（`src/lib/StyleRegistry.ts`，11 个风格，10 shader + 1 canvas2d）。完整侦察报告见 [assets/2d-style-architecture-scout.md](assets/2d-style-architecture-scout.md)——改动画、复用点、验收基线都在里面，动手前必读。
- **制图期已定约束（grilling Q1–Q7 全按推荐收口，票内不得重开）**：
  - 质感三档（票1 用户裁决，取代制图期"两档"）：大波浪（**默认**）/ 方格压花 / 橘皮，同一特效下的"玻璃类型"select 档位。注：ref-glass-1.png 经视觉分析实为方格压花格纹（非"大波浪"），票1 裁决三套全做。
  - 全幅覆盖；参数 = 玻璃类型 select + 强度三档 select，无连续滑杆。
  - 种子码：风格序号入码；两个 select 入码且可被随机抽中；无额外 toggle（风格本体即开关）。
  - 免费，不做 per-style 会员门槛（现无该机制，造它属扩范围）。
  - 三端一致验收：桌面 / 批量 / 移动 H5（架构上自动复用，成本只剩测试）。
- **常设偏好（执行票必须遵守）**：设计确认（「规格收口与设计确认」关闭）后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增（基线 11 错全在 3D，2D 期望 0）；测试基线 324 用例；UI 图标手绘内联 SVG 禁 emoji（本特效注册表驱动，无需新图标）；浏览器实测按 memory 中 browser-verification-playbook（vite dev + puppeteer-core + Edge headless，视觉复核放大局部截图）。
- **技能说明**：本环境可用技能中无 prototype / domain-modeling；原型票以 superpowers:brainstorming + 直接实现轻量 harness 代替，grilling 票调 grilling 技能。
- **种子码兼容铁律**：新风格必须**追加在 styles 数组末位**（风格按序号入码，插入会废掉旧码）。shader 风格无 SVG 导出（自动回退 PNG），与现有 10 个 shader 风格一致，勿加 SVG 分支。
- **Tracker 约定（local-markdown）**：本目录即 issue tracker。票 = `tickets/*.md`，frontmatter：`labels`（wayfinder:prototype/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（票 id 列表）。前沿 = open + 无 assignee + blocked-by 全 closed。关闭票时：正文追加 `## Resolution` 记答案，status 改 closed，并在本图 Decisions so far 加一行指针。如日后经 /setup-matt-pocock-skills 配置真实 tracker，此图可迁移。

## Decisions so far

- [玻璃质感原型定稿](tickets/01-glass-prototype.md): 三套噪声场全部进正式档（用户三张截图拍板，突破原"两档"），默认=大波浪；定稿参数表已固化为 [glass-lab.html](assets/glass-lab.html) 默认值（强度 0.78/0.51/0.34）；单 pass 全部成立；工程铁律——高频场 K 按频率折减（橘皮用 strength² 曲线）、fBm 的 gain×lacunarity 必须 <1 防采样折叠碎屑、方格跨缝不连续靠逐格 jitter。
- [规格收口与设计确认](tickets/02-spec-lock.md): **设计确认门通过**。id=`glassdistort`；两 select（玻璃类型 0/1/2 默认大波浪；强度档 0/1/2 默认标准，锚点矩阵 9 值 frag 内查表：波浪 0.47/0.78/0.95、方格 0.31/0.51/0.64、橘皮 0.20/0.34/0.43）；类型在前强度在后；**不做 presets**；i18n 键清单与 uniform 内化规则全在票内 Resolution，票3 照抄。
- [注册表接入与三端验收执行](tickets/03-execute.md): **已交付本地 main（未 push）**。5 文件改动（新 frag + StyleId + 注册表末位 + 双 i18n + 测试）；验收全过：328/328 测试（基线 324→328）、lint 持平 11、三端 18/18 断言、种子码往返无损、三类型视觉复核（含"中轴黑点=源图立杆非伪影"的原图对照定案）。关键交接：WebGL 画布自动化视觉验证必须 canvas.toDataURL 直出（合成器截图拿不到内容）。
- [参数开放——试验台自由度移植](tickets/04-param-freedom.md): **图关闭后用户追加决议，已交付本地 main（未 push）**。推翻票2"仅两 select"：强度改连续滑杆（0-200%，100%=该类型基准，clamp 0.95），11 项气质参数+缝亮脊 toggle 全开放（值域=试验台定稿）；新框架能力 `visibleWhen` 条件显隐（面板 5/7/6 控件，值保留）。329/329 测试、渲染与上一版逐字节等价、新码 16 字符往返无损、旧码优雅解为新组合（不崩溃）。

## Not yet specified

（无——两片雾均随「规格收口与设计确认」毕业；前沿只剩执行票。）

## Out of scope

- **局部玻璃板 / 区域蒙版**：用户手摆玻璃区域的整套交互（grilling Q3 已裁全幅；要做另立新图）。
- **per-style 会员收费基础设施**：grilling Q6 已裁免费；现有付费墙只在导出水印，不为单个特效开收费先例。
- **3D 侧玻璃效果**：仅 2D。
- **shader 风格 SVG 导出**：现状即回退 PNG，全部 shader 风格一致，不为本特效单独支持。
