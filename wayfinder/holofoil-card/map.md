---
title: 全息箔闪卡——选择性加箔 + 3D 转卡交互与导出
labels: [wayfinder:map]
status: open
tracker: local-markdown
---

## Destination

把全息箔从「全图静态滤镜」升级为「闪卡」，两条线程经 研究→样张→拍板门→锁规格→全自动执行 交付本地 main（不 push）：**静态线程**＝边缘/自动分区选择性加箔（holofoil 新参数，三端+批量全量）；**转卡线程**＝holofoil 专属 3D 转卡预览（桌面鼠标+H5 触摸）+ 单文件转卡 HTML 导出（**会员专属格式**，非会员只能导出图片）。拍板门可砍整条线程，互不连坐。

## Notes

- **领域事实（2026-10-11 实测）**：
  - holofoil 现状：单 pass shader `src/shaders/holofoil.frag`，styles[12]，8 参数（质感三档/强度/密度/角度/底色/三条件密度，visibleWhen），亮度梯度伪法线→光谱色带映射；prism 紫边模式有 luma 梯度检测先例。
  - 会员体系完整可用：license/兑换码制 `src/lib/license/`，判定 `getLicenseStatus().active`（verify.ts:279），会员×额度唯一收口 `src/lib/license/gating.ts:10`（decideSingleExport/decideBatchExport）；语义＝会员导出无水印、免费每日 5 次无水印单图后右下角水印、免费批量恒平铺；购买入口已删（c807ee6）但激活/续费 UI 完整。localStorage 键 `pixel-forge.license.v2` 等。
  - 导出管线：一格式一按钮一 handler（ActionBar.tsx:23 / MobileShell2D.tsx:153 / App2D.tsx:1128 起），水印 watermark.ts（canvas corner/tiled + SVG 注入），交付 downloadFlow.ts（微信 UA 长按 Lightbox）。批量 BatchFormat 枚举共 4 处挂点（batchJob.ts:8 / BatchPanel.tsx:166 / runBatch.ts:168-188 / App2D.tsx 接线）。全库无 HTML 导出痕迹，无 card/转卡代码。
  - 测试基线 **341**；lint 基线 11（全在 3D，2D 期望 0）；渲染上限 2048；tsc 0 错；三端 18 项断言（桌面/批量/H5）。
- **制图期已定约束（grilling R1 Q1–Q8 + R2 Q1–Q7，票内不得重开）**：
  - 路径模式：研究→样张→拍板门→锁规格→全自动执行（沿用两次已验证模式）。
  - 一张图两线程：静态（想法1）与转卡（想法2+3）；拍板门可砍线程。
  - 想法1 分层：边缘加箔 + 自动分区进样张；**点选开关面＝样张后裁决**（粗 demo 进第一轮样张，直面旧「手摆蒙版」裁决）；**AI 语义分割出局**。
  - 想法1 载体：holofoil 追加「应用范围」select（参数表末位，保旧码兼容），范围子参数 visibleWhen 条件显隐；参数表 8→11–13 可接受；入码+随机照旧。
  - 想法2 落点：holofoil 专属「转卡模式」开关（预览区），**不通用化**；转卡设置**不入种子码**；手感三项（幅度 ±10–15° demo 可调 / idle 自摆 / 阴影高光微动）进 demo、拍板定稿。
  - 想法3 形态：**单文件 HTML**（图片 base64 内嵌）、**冻结参数**（查看者只能转卡）；静态 PNG 角度序列＝执行时低成本附赠；**SVG 动态导出放弃**。
  - 会员墙（用户改判，覆盖制图期原推荐）：**HTML 导出＝格式级会员专属**，非会员只能导出图片（点导出弹会员提示＝转化入口）；**会员导出 HTML 无水印**（与现有会员语义一致）；gating 首次出现「格式拒绝」型决策。
  - 陀螺仪：加分项非验收项——导出 HTML 内置 + iOS 权限按钮 + 触摸回退；验收只覆盖鼠标/触摸。
  - 三端分工：想法1 三端+批量全量；想法2 桌面鼠标+H5 触摸（陀螺仪 H5 彩蛋待评估）；想法3 导出入口桌面+H5；批量无动态导出。
- **常设偏好（执行票必须遵守）**：设计确认后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增；测试基线 341 只增不减；UI 图标手绘内联 SVG 禁 emoji；浏览器实测按 memory 中 browser-verification-playbook（WebGL 画布必须 canvas.toDataURL 直出、局部放大复核）。
- **种子码铁律**：不新增风格、不动 styles 位置（holofoil=styles[12]）；新参数**末位追加**，旧码缺参走默认（fa4afbb 先例）；风格序号入码不变。
- **技能说明**：本环境无 research / prototype / domain-modeling 技能——研究票以通用 web 搜索子代理代替（WebSearch 优先，报额度/限流即降级 zhipu_web_search，见全局 CLAUDE.md）；原型票以轻量 demo 页/样张页代替。
- **Tracker 约定（local-markdown）**：本图自带子目录（map.md + tickets/ + assets/）。票 frontmatter：`labels`（wayfinder:research/prototype/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（文件名 stem 列表）。前沿 = open + 无 assignee + blocked-by 全 closed。关票：正文追加 `## Resolution` 记答案，status 改 closed，本图 Decisions so far 加一行指针。

## Decisions so far

（无——制图期约束见 Notes；票 01/02 研究进行中。）

## Not yet specified

- **H5 预览端陀螺仪彩蛋**：视「转卡导出 HTML 方案与兼容矩阵」的结论与拍板门态度，决定是否成票。
- **点选面的交互细节**（多选/容差/误点撤销）：若拍板门留下点选，在规格票细化。
- **导出 HTML 的交付分流**（微信 UA 下 blob 下载/长按 Lightbox 是否适用 HTML）：执行时按 downloadFlow 现状核对。
- **批量端对 holofoil 新参数的呈现**：registry 驱动自动复用预期成立，执行票核对即可。

## Out of scope

- **AI 语义分割**（「识别这是 logo/人物」级）：无基础设施、单会话不可交付（制图期裁决）。
- **SVG 动态导出**：转卡必须 JS 驱动，SVG 内嵌脚本体验劣于单文件 HTML；静态 shader 风格本就回退 PNG。
- **转卡通用化到全部风格**：仅 holofoil。
- **导出 HTML 查看者可调参数/换风格**：导出物＝参数冻结的闪卡。
- **免费用户水印版 HTML**：HTML 导出格式级封死，非会员只能导出图片。
- **批量动态导出**；**3D 侧效果**；**视频/GIF 时间轴动画导出**（本图动态以转卡交互 HTML 为界）。
- **手摆画笔蒙版**（手画区域类）：依旧出局；本图「点选检测出的面」是拍板门要正面裁决的对照项，不是复活手摆。
