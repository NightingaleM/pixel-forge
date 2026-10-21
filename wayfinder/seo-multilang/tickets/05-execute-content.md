---
title: 执行票——翻译与关键词导向 meta
labels: [wayfinder:task]
status: closed
assignee: 主会话（已完成）
blocked-by: [02-keywords-research, 03-architecture-grilling]
---

## Question

内容层落地：

1. **ja / es / pt 字典翻译**（`src/i18n/ja.json` 等）：与 zh/en 键集对齐；风格名等专有词按票 02 术语表锁定；UI 文案语感按各语种习惯（不逐键硬译）。
2. **各语种 meta 重写**：按票 02 关键词表写 `meta.*` 各语种版本（title/description，含 en/zh 现行版复核修正）；noscript、JSON-LD description、og:locale 等随之本地化。
3. 语言切换器与页面上的语言名（日本語 / Español / Português / 中文 / English）原生写法核对。

验收：5 语言字典键集与 zh 严格一致（单测锁定）、全路由 meta 非空且含目标关键词、全量测试过、lint 不新增。

## Resolution

**2026-10-21 交付**（三语种翻译由三个并行子代理完成，主会话统筹验收）：

1. **ja/es/pt 字典**：各 **746 键与 zh 逐键一致**（miss=0/extra=0/empty=0，{{xxx}} 插值逐键匹配）；15 风格名按票 02 术语表逐字锁定（子代理脚本核对 15/15）；ja 动词文化「加工/変換」全段扫描 0 处違反；meta home/p2d/p3d/dispatch 按研究骨架逐字采用。
2. **语言常量扩五语言**：langs.ts / i18n loaders / prerender.mjs LANGS+LANG_LABELS 三处同步（四清单测试锁过）。
3. **zh/en meta 重写**（按票 02 体检）：en home title 弃 "Image Stylization" 改 `Photo to Art — Free Online Art Filters & Effects`；p2d 关键词前置 `Halftone, Pop Art, Sketch & 15 Art Filters Online Free`；p3d 改 particle effects 句式；zh home title 加「艺术滤镜/粒子特效」词。
4. **新揪出的第三处计数漂移**：about.feature2d「10 种」（三个翻译子代理独立发现）——ja/es/pt 按 15 译，zh/en 已同步修正，四语对齐。

**验证**：tsc 0 错；lint 11 错=基线；**vitest 497/498**——唯一 fail 为既有 motion MediaRecorder 时戳抖动（1.5977 vs 下限 1.6，差 0.002s；单跑 6/6 绿，与本次改动零交集，不越权改上游测试容差）；build+prerender **40 页全产出**，抽查 ja/2d、es/、pt/3d、en/2d：title 关键词前置、lang/hreflang×6/og:locale/canonical 全正确，根 stub 五语言链接齐，sitemap 40 URL。

留给用户复核的译文裁量点（子代理报告原文见会话，均合理无需返工）：es 保留 TCG 借词 "foil"、holofoil 三质感 craquelado/vetas/perla；ja 兑换码=引き換えコード、ascii 字符集说明按日区语境改写；pt 会员=assinatura、小数逗号（叙述）vs 句点（参数值）分治、微信文案保留 WeChat。

教训：带 /g 正则的 .test() 有 lastIndex 状态残留（连续调用误判）——断言用 matchAll 计数；计数断言的量词表须覆盖 種/efectos/efeitos 且允许计数出现在 home 或 p2d 任一处（各语种骨架放置不同）。
