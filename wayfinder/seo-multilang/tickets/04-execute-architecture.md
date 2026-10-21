---
title: 执行票——多语言架构实现
labels: [wayfinder:task]
status: closed
assignee: 主会话（已完成）
blocked-by: [03-architecture-grilling]
---

## Question

按票 03 锁定的规格实现架构层：i18n 路由、prerender 5×8 矩阵、hreflang、sitemap 生成、根路径与存量路径处理、语言切换器（内联 SVG）、i18n 资源打包、单测扩盘。设计确认后全自动执行、不中途请示。

验收：lint 基线不新增（现 11 错全在 3D 文件）、tsc 0 错、全量测试过、`build + prerender` 冒烟——40 页产物齐全且每语言每路由 title/description/hreflang/canonical 正确。

## Resolution

**2026-10-21 交付**（按票 03 锁定规格 D1–D11 全项落地）：

1. **i18n 管线**：新 [src/i18n/langs.ts](../../../src/i18n/langs.ts)（LANGS/元数据/parseLangPath/matchNavigatorLang）；[index.ts](../../../src/i18n/index.ts) 改懒加载（动态 import+addResourceBundle，零新依赖），移除 languagedetector（npm uninstall）；main.tsx 在渲染前按 URL 前缀载字典——首帧即目标语言。
2. **路由**：[App.tsx](../../../src/App.tsx) `/:lang` 布局路由（LangGate 校验非法前缀→404）+ 根分发（dev 组件/prod stub）+ 旧 8 路径 `<Navigate>` 客户端兜底；15 处内链全部换 LangLink（语言感知）。
3. **meta**：[pageMeta.ts](../../../src/lib/pageMeta.ts) 重构——canonical/og:url 带 /{lang} 前缀、hreflang 集群（每语言+x-default→/）、og:locale(+alternate)、JSON-LD 每页重写（priceCurrency 顺改 USD）、html lang 动态；根分发页 noindex。
4. **切换器**：下拉+内联 SVG 地球图标（无 emoji），URL 驱动切换+localStorage（键沿用 i18nextLng 保老用户选择）。
5. **构建**：prerender.mjs 双循环（当前 zh/en ×8=16 页）+ 内置断言（html lang/title/canonical 逐页校验）+ 根 stub（零依赖协商跳转）+ sitemap 生成（scripts/sitemap.mjs）；public/sitemap.xml 删除。
6. **nginx**：旧路径 301→/zh/*、显式 gzip、HTML no-cache（安全头在 location 内重复声明防继承丢失）。
7. **顺手修正**：zh/en meta 风格计数 11→15（漂移实锤）；字典加 meta.dispatch.title。

**验证**：tsc 0 错；lint 11 错=基线持平（全 3D）；**vitest 492/492 全绿**（含新增四清单一致性 21 用例：prerender 字面量↔src 常量、sitemap↔LANGS×PAGE_METAS、双 langUrlPath 同构、D11 计数锁）；build+prerender 冒烟过——16 页+stub+sitemap(16 URL) 产物抽验 canonical/hreflang/lang 正确。motion 时戳测试一次波动重跑即绿（与本次无关）。

教训：matchAll 需 /g 正则；en 计数正则须容纳「15 art styles」中缀词。票 05 扩五语言时：LANGS/loaders/prerender 三处各加一行（测试锁强制）。
