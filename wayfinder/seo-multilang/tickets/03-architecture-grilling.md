---
title: 规格票——全前缀多语言 URL 架构收口
labels: [wayfinder:grilling]
status: closed
assignee: 主会话（已完成）
blocked-by: []
---

## Question

锁定「全前缀多语言 URL」的技术规格（`/zh/` `/en/` `/ja/` `/es/` `/pt/` × 8 路由）。制图期 Q1–Q9 裁决（见 map Notes）不得重开。要收口的决策：

1. **路由层**：react-router 语言前缀的挂法（嵌套布局路由 vs 路径段）；非支持语言前缀（如 `/fr/2d`）走 404 还是兜底重定向；语言切换时保持当前页面路径。
2. **根路径 `/` 行为**：预渲染分发页（客户端按 navigator.language 分发、zh 兜底、防循环）vs 服务端 301（需 nginx/CDN 配置——结合票 01 可达性结论一起看）。
3. **存量无前缀路径**（`/2d` `/3d` 等）：全前缀后旧路径必须处理——预渲染 zh 版 + canonical 指向 `/zh/*`，还是能做 301 就 301（Docker nginx 可配）。存量 URL 资产与索引迁移的正确姿势。
4. **prerender 矩阵**：5 语言 × 8 路由 = 40 页的产出方式；语言如何在预渲染时注入（现脚本按 pageMeta 单语抓取，需扩展）。
5. **hreflang 集群**：alternate 链接生成位置（pageMeta 扩展）；`x-default` 归属（`/` 还是 `/en/`）。
6. **sitemap**：静态手写 vs 构建脚本从 `PAGE_METAS × LANGS` 生成（倾向脚本生成 + 单测锁定，根治本次发现的 sitemap 漂移——`/license` 已漏）。
7. **语言切换器**：位置（顶栏）+ 形态 + **内联 SVG 地球图标（禁 emoji 铁律）** + H5 适配。
8. **i18n 资源打包**：5 语种全量打包 vs 懒加载（体积账要算）。
9. **og:locale / JSON-LD 多语言化**规则。
10. **单测锁定清单扩盘**：路由 ↔ sitemap ↔ prerender ↔ hreflang 四清单一致性测试。
11. **风格计数防漂移**（票 02 研究毕业）：meta 文案里的「15 种风格」计数不得硬编码——构建脚本从 StyleRegistry 生成或单测断言字典数字与注册表长度一致，根治「11 种」漂移复发。

输入：`src/lib/pageMeta.ts`、`scripts/prerender.mjs`、`src/i18n/index.ts`、`src/App.tsx`、`public/sitemap.xml`。若票 01 结论影响架构（CDN 层能做协商/301），把影响摆进本票一起裁。

**备料已备（2026-10-21 夜）**：[assets/architecture-scout.md](../assets/architecture-scout.md) —— 上述 11 点的代码事实、可选方案与倾向已逐点摆好，含两项改变假设的新发现（nginx.conf 在 repo 可做真 301；线上疑似旧镜像）。grilling 时逐点过推荐即可。

## Resolution

**2026-10-21 用户裁决：「全按推荐」**——architecture-scout.md 的 D1–D11 方案 A/B 按各自推荐全部锁定：

1. **D1 路由**：`/:lang` 布局路由（LANGS 校验）+ 内层沿用 8 条相对路由；非法前缀 → NotFound（noindex）；切换器保当前页面路径。
2. **D2 根路径**：预渲染分发页——noindex + 客户端按 localStorage→navigator 分发（未命中 → `/zh/`），无 JS 环境 5 语言链接列表。
3. **D3 存量路径**：**nginx 真 301**（8 条无前缀路由 → `/zh/*`，nginx.conf 在 repo）+ SPA `<Navigate replace>` 客户端兜底；sitemap 不列旧路径。
4. **D4 prerender**：LANGS × ROUTES 双循环 40 页 + 根分发页 `dist/index.html`；每页断言 `<html lang>` 一致、title 非空；旧路径不再产出。
5. **D5 hreflang**：每页 5 条 alternate + **x-default → `/`**。
6. **D6 sitemap**：删 `public/sitemap.xml`，prerender.mjs 尾部从 LANGS × PAGE_METAS 生成（含 xhtml:link alternate）。
7. **D7 切换器**：下拉 + 内联 SVG 地球图标（禁 emoji），语言名原生写法（中文/English/日本語/Español/Português）；细节按 UI 惯例执行票定。
8. **D8 语言初始化**：**URL 前缀为语言事实来源**——main.tsx 在 i18n.init 前同步解析 pathname；localStorage 只影响根分发页；切换器改 URL 并同步 localStorage。
9. **D9 资源打包**：**按语言懒加载**（手写动态 import + addResourceBundle，不引新依赖）。
10. **D10 单测**：四清单一致性（LANGS×PAGE_METAS ↔ sitemap ↔ prerender ROUTES ↔ hreflang）+ 字典键集 diff + resolvePageMeta 前缀支持。
11. **D11 计数防漂移**：单测断言各语言字典风格计数数字 = StyleRegistry styles.length。

JSON-LD 本地化随 applyPageMeta 走（每页重写 description），og:locale 按语言（zh_CN/en_US/ja_JP/es_ES/pt_BR）+ og:locale:alternate。
