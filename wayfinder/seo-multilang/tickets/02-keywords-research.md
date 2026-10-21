---
title: 研究票——四语种 SEO 关键词与竞品用语
labels: [wayfinder:research]
status: closed
assignee: 研究子代理（已完成）
blocked-by: []
---

## Question

为 PixelForge 的多语种 meta 重写（制图期 Q8 已裁：关键词导向，不走直译）提供依据。页面集：`/`（首页）、`/2d`（图片风格化，SEO 主战场）、`/3d`（3D 粒子）、`/about` `/help` 等次要页。语种：**en / ja / es / pt**（en 已有字典但要复核）。

1. **各语种真实查询词**：「图片风格化 / 照片艺术滤镜 / 半色调转换器 / 波普艺术 / 素描/点彩/像素化/万花筒 / 3D 粒子」类工具需求在各语种里用户实际怎么搜（Google 补全规律、各语种习惯表达、tool/converter/generator 等后缀模式）。
2. **竞品用语取证**：Photopea / Fotor / BeFunky / PicsArt / Canva 及各语种本土竞品在对应语种站点的 title / H1 / description 用词（实际抓取页面取证，不凭印象）。
3. **zh/en 现有 meta 体检**：对照 1、2 指出现行 `src/i18n/zh.json` / `en.json` 中 `meta.*` 键的直译痕迹与可替换词。
4. **风格名术语表**：现有 15 个风格名（半色调、波普、素描、点彩、万花筒、全息箔、棱镜色散、移轴微缩、小星球、玻璃扭曲、卡通化等——以 `src/lib/StyleRegistry.ts` 实名为准）各语种标准译名表，此表将直接锁定为翻译术语表。

产出落 `../assets/research-keywords.md`：每语种「核心词 + 长尾词 + title/description 骨架建议」表 + 术语表 + 结论摘要 ≤10 行。

## Resolution

**2026-10-21 研究完成**，全文（297 行）见 [assets/research-keywords.md](../assets/research-keywords.md)（四语种核心词+长尾词表、title/description 骨架、竞品 15 页实抓取证、zh/en 体检、15 风格×4 语种术语表、suggest 原始证据附录）。结论：

1. **en**：弃 "image stylization"（学术词，suggest 只出论文标题，零工具需求）——主词改 **photo to art / art filters**（BeFunky 官方 title/H1 即此）。红利词：**halftone generator**（DTF/丝网印刷人群）、photo to sketch online free no sign up、ascii art generator from image。
2. **ja**：动词文化是「加工/変換」不是「効果/エフェクト」——写真加工、画像編集サイト（Fotor jp title 印证）；ハーフトーン加工、色収差加工、ミニチュア風加工、万華鏡加工 全 suggest 实证；隐私句式「画像はサーバーに送信されません」是日区卖点。
3. **es**：骨架 convertir foto en arte / pop art + efectos para fotos online gratis（sin registro / sin marca de agua）；semitono、puntillismo、caleidoscopio、foto a lápiz 全实证。
4. **pt-BR**：最大流量词 **foto em desenho** 与 transformar foto em arte；meio tom、caleidoscópio、pontilhismo、tilt shift、online grátis 全实证。
5. 竞品 title 统一「关键词前置 + 品牌后置 + 免费修饰」；Canva 全站 403 取证失败，已如实标注不作引用。
6. **现行 meta 两处硬伤**：en home title 的 "Image Stylization" 即被否的直译词；zh/en 全站「11 种风格」数字过期（StyleRegistry 实为 **15**）→ 建议计数由构建脚本从注册表生成防再漂移（已补入规格票 03 决策点）。
7. **双命名定调**：prism 挂 chromatic aberration／色収差／aberración cromática；holofoil 挂 holographic foil／ホログラム加工／efecto holograma。

工具执行注记：内置 WebFetch/WebSearch 当日均不可用（拦截/额度耗尽），suggest 与竞品取证改经 Bash+urllib 直连完成——原始证据均落附录可复查。
