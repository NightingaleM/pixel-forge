---
title: 海外 SEO 与多语种扩展
labels: [wayfinder:map]
status: closed
tracker: local-markdown
---

## Destination

海外 SEO 优化 + 多语种扩展**落地本地 main**：全前缀多语言 URL（`/zh/` `/en/` `/ja/` `/es/` `/pt/` × 8 路由，prerender 40 页）+ hreflang/sitemap alternate + 关键词导向 meta 重写 + ja/es/pt 字典翻译 + 语言切换器，统一验收后本地 commit 合入（不 push）。

## Notes

- **现状底账（制图期侦察）**：中文 SEO 基本盘已好——index.html 全套 meta、每路由 pageMeta（含 noindex + 单测锁定）、构建后 prerender、robots/og-image 均在。缺口：URL 无语言结构（纯客户端切换，Google 只会索引一种语言）、无 hreflang、prerender 产物单语、**sitemap 已漂移（漏 `/license`）**、lang/og:locale 硬编码 zh、海外关键词研究空白。
- **部署事实（Q5/Q9）**：阿里云华南（深圳）Docker 容器 + HTTPS；海外访问效果未知 → 票 01 取证。
- **制图期已定约束（grilling Q1–Q9，票内不得重开）**：
  - 终点 = 落地变更本地 main（Q1）；范围 = SEO + 多语种本体，GSC 留任务票（Q2）。
  - 第一波语种 = **ja + es + pt**（en 已有字典）（Q3）。
  - 翻译 = Claude 译 + 术语表锁风格名 + 用户抽查关键页（Q4）。
  - URL = **全前缀，zh 也带 `/zh/`**，趁用户量少尽早改；根 `/` 成分发位（Q6）。
  - 首访协商 = 客户端自动跳转（无 localStorage + navigator 命中 → 跳对应子路径，先写 localStorage 防循环）（Q7）。
  - meta 策略 = **关键词导向重写**（研究先行），UI 文案走字典翻译，两层分开（Q8）。
- **常设偏好（执行票必须遵守）**：设计确认后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增（基线 11 错全在 3D 文件）；测试以当前 main 全量绿为基线只增不减；UI 图标手绘内联 SVG 禁 emoji；浏览器实测按 memory 中 browser-verification-playbook。
- **技能说明**：本环境无 research / prototype / domain-modeling 技能——研究票以通用 web 搜索子代理代替。
- **Tracker 约定（local-markdown）**：本图自带子目录（map.md + tickets/ + assets/）。票 frontmatter：`labels`（wayfinder:research/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（文件名 stem 列表）。前沿 = open + 无 assignee + blocked-by 全 closed。关票：正文追加 `## Resolution`，status 改 closed，Decisions so far 加一行指针。

## Decisions so far

- [研究票——四语种 SEO 关键词与竞品用语](tickets/02-keywords-research.md): 全文 297 行落 [assets/research-keywords.md](assets/research-keywords.md)。en 弃 "image stylization" 主词改 photo to art / art filters（halftone generator 是 DTF/丝印红利词）；ja 动词文化「加工/変換」；es/pt 主词 convertir foto en arte / foto em desenho。竞品 15 页实抓，title 统一关键词前置。现行 meta 硬伤：en home 直译词 + 「11 种风格」计数过期（实为 15）→ 计数防漂移已补入规格票决策点。15 风格 × 4 语种术语表待内容票直接取用。
- [研究票——海外可达性取证](tickets/01-overseas-reachability-research.md): 全文 153 行落 [assets/research-reachability.md](assets/research-reachability.md)。海外**能正常访问**（98.1% 成功、Googlebot 抓取正常，CDN 非收录级阻塞）；但速度被拖累（欧美 HTML 0.8-1.7s、真实首屏估 3-6s）。白捡优化：nginx gzip（410KB→120KB）/Cache-Control/HTTP2/权威 DNS 迁海外。CDN 三方案已摆事实 → 毕业决策票「CDN 与海外分发（含白捡优化）」。
- [任务票——GSC 接入手册](tickets/06-gsc-onboarding.md): 手册落 [assets/gsc-onboarding.md](assets/gsc-onboarding.md)——Domain 级 DNS TXT 验证路径（阿里云云解析操作步骤）、多语言版上线后动作清单（前置自检 → 提交 sitemap → 核心页请求索引 → 1-4 周观察过渡）、第二波语种取数入口（效果报告按国家过滤，3-6 个月窗口）。注：hreflang 专用报告 2022 已移除；地址变更工具 2024 退役传闻已注记（同域 URL 变化本不适用）。
- [规格票——全前缀多语言 URL 架构收口](tickets/03-architecture-grilling.md): **用户裁决「全按推荐」**，D1–D11 全锁（详单见票内 Resolution）：/:lang 布局路由、根路径预渲染分发页、存量路径 nginx 真 301、prerender 5×8 矩阵、hreflang+x-default→/、sitemap 脚本生成、切换器下拉+SVG、URL 前缀为语言事实源、字典懒加载（不引新依赖）、四清单单测、计数防漂移断言。备料 [assets/architecture-scout.md](assets/architecture-scout.md)。
- [决策票——CDN 与海外分发（含白捡优化）](tickets/08-cdn-decision.md): **白捡优化现在做进 repo**（nginx gzip 显式化 + HTML no-cache，随镜像重部署一并修复线上旧镜像）；**CDN 缓议**——等多语言上线 + GSC 数据再定。DNS 迁海外与 HTTP/2 为用户部署侧动作（票内注记）。
- [执行票——多语言架构实现](tickets/04-execute-architecture.md): **已交付**——langs.ts/i18n 懒加载/​:lang 路由+15 处内链 LangLink/hreflang+og:locale+JSON-LD/切换器下拉+SVG/prerender 双循环+根 stub+sitemap 脚本生成/nginx 301+gzip。tsc 0 错、lint 基线、测试全绿、16 页冒烟过（详单见票内）。
- [执行票——翻译与关键词导向 meta](tickets/05-execute-content.md): **已交付**——ja/es/pt 各 746 键逐键对齐+术语表 15/15 锁定+研究骨架 meta 逐字采用；zh/en meta 按体检重写（弃 Image Stylization）；第三处计数漂移（about「10 种」）一并修正。497/498（唯一 fail 为既有 motion 时戳抖动，单跑绿）、prerender **40 页**产物抽查全对。
- [执行票——统一验收与本地合入](tickets/07-final-acceptance.md): **全关通过，已合入本地 main（67cbcf0，未 push）**——tsc 0 错/lint 基线/497 单测、prerender 40 页深链抽查全对、浏览器实测 13/13（协商/切换/旧路径/noindex/H5）。**图目的地达成。**

## Not yet specified

- **第二波语种**（ko/de/fr/ru…）：按第一波上线后 GSC 效果报告（按国家/地区过滤）的展现/点击数据再定，取数入口见 GSC 手册。
- **og-image 每语言差异化出图**：第一波共用一张 + og:locale 变体即可，留待有数据再说。

## Out of scope

- **海外营销/分发渠道**（Product Hunt、Reddit、SNS 推广）：营销不在本图，SEO 交付为界。
- **性能优化专项**（资源体积、懒加载等）：除非票 01 揭示可达性硬伤，否则另立图。
- **服务器整体迁移国际托管**：若票 01 结论要求干预，也仅毕业「CDN 前置」决策票；整体迁移另立图。
- **商业化与 SEO 的耦合**：SEO 层只涉及免费能力，会员/水印体系不在本图（见 monetization-status 记忆）。
