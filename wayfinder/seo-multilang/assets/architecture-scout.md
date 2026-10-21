# 全前缀多语言架构预研（规格票备料）

- 供票：wayfinder/seo-multilang「规格票——全前缀多语言 URL 架构收口」
- 日期：2026-10-21（主会话夜间备料，HITL 决策仍归用户）
- 性质：代码事实 + 可选方案 + 推荐。**本文件不做决定，只加速 grilling。**

---

## 0. 侦察中新发现的关键事实（部分改变票面假设）

1. **nginx.conf 与 Dockerfile 都在 repo**（根目录）。Dockerfile 第二阶段 `FROM nginx:alpine`，`COPY nginx.conf /etc/nginx/conf.d/default.conf`——**服务器侧配置就在本 repo，旧路径可以做服务端真 301**，票 03 早期「静态托管做不到 301」的假设作废。
2. **线上疑似旧镜像**：可达性研究实测线上 `nginx/1.20.2`（2022 年版本），而 Dockerfile 的 `nginx:alpine` 现行应为 1.27+；且 repo nginx.conf 已配 JS/CSS 30d immutable 长缓存，但研究实测响应「无 Cache-Control」——两者矛盾，最合理解释是**线上跑的是旧版镜像，repo 配置未部署**。重新 build+部署即自动生效，这直接影响票 08 的「白捡优化」范围。
3. **LangSwitch 组件已存在**（[src/components/LangSwitch.tsx](../../../src/components/LangSwitch.tsx)）：目前是 zh/en 二值文字按钮（`EN`/`中`），无图标（合规）。多语言化要重设计形态。
4. **prerender 已有语言固定机制**：[scripts/prerender.mjs](../../../scripts/prerender.mjs) 用 `Accept-Language` 头 + `evaluateOnNewDocument` 覆盖 navigator.language 双保险固定中文——多语言化只需外层再套语言循环，机制现成。
5. **字典体积**：zh 45KB / en 47.6KB。5 语种全量打包约 +150KB 未压缩（gzip 后约 +55~70KB）。
6. **applyPageMeta 已按语言重入**（[src/App.tsx:18-28](../../../src/App.tsx#L18-L28) PageMetaApplier 依赖 t 与 i18n.language），且已动态设 `document.documentElement.lang`（现仅 zh/en 二值）。多语言 meta 的管线大半现成，缺的是 URL 层。

## 1. 十一个决策点的方案与推荐

### D1 路由层挂法

- **方案 A（推荐）**：外层 `/:lang` 布局路由 + 内层沿用现有 8 条相对路由。`LANGS = ['zh','en','ja','es','pt']` 常量（新文件 src/i18n/langs.ts），lang 布局组件里校验 `:lang` 合法性。
- 方案 B：每条路由写死 `/zh/2d`… 40 条——重复且易漂移，弃。
- 非支持前缀（`/fr/2d`）：lang 校验不通过 → 渲染 NotFound（noindex），不猜语言不重定向。
- 语言切换：记住当前 pathname 去掉旧前缀换新前缀（react-router `useNavigate`），保页面位置。

### D2 根路径 `/` 行为

- **方案 A（推荐）**：`/` 预渲染为极简分发页——meta robots noindex + 客户端按 localStorage→navigator 分发（命中已支持语言跳 `/{lang}/`，否则 `/zh/`）。无 JS 环境给一个 5 语言链接列表。
- 方案 B：nginx 301 `/` → `/zh/`——服务端定死中文，海外首访体验差，弃。
- 方案 C：nginx 按 Accept-Language 协商 302——nginx.conf 能写（`Accept-Language` map），但 Google 明示不希望服务端按语言重定向爬虫见到的 URL（主动协商有风险），且配置复杂。作为可选增强留给票 08 之后，不进第一波。

### D3 存量无前缀路径（`/2d` `/3d` 等 8 条）

- **方案 A（推荐）**：**nginx 真 301**（nginx.conf 加 location 正则：`^/(2d|3d|about|privacy|terms|help|license)$` → `/zh/$1`；`/` 除外——它走 D2 分发页）。服务端信号最干净，Google 官方同域迁移姿势。SPA 客户端侧同步加 `<Navigate replace>` 兜底（防 nginx 配置未部署的窗口期）。
- 方案 B：旧路径预渲染 zh 版 + canonical→`/zh/*`——产物翻倍且信号弱于 301，仅作 nginx 不可控时的退路。
- 注意：301 后 sitemap 不再列旧路径；GSC 手册已写「保持 301 至少 6 个月」。

### D4 prerender 多语言矩阵

- ROUTES × LANGS 双循环，每语言用现有固定机制注入（navigator 覆盖 + **URL 前缀**——见 D8，路由本身驱动 i18n，脚本零魔法）。
- 产物：`dist/{lang}/{route}/index.html` 40 页 + `dist/index.html`（D2 分发页）。旧路径不再产出。
- 脚本校验同步加严：每页断言 `<html lang>` 与目标语言一致、title 非空。

### D5 hreflang 集群

- `applyPageMeta` 扩展：每页输出 5 条 `alternate` link（hreflang={lang} → SITE_URL/{lang}/{path}）+ **x-default → `/`（D2 分发页）**。Google 文档认可 x-default 指向语言选择页。
- 实现落点：pageMeta.ts 的 upsert 系列加 link[rel=alternate] 管理，防重复。

### D6 sitemap 生成

- **推荐**：删 public/sitemap.xml，构建脚本从 `LANGS × PAGE_METAS` 生成 `dist/sitemap.xml`（每 URL 带 5+1 条 `xhtml:link` alternate）。可并入 prerender.mjs 尾部（同一份 LANGS/PAGE_METAS 导入，天然一致）。
- 单测锁定：四清单一致性（见 D10）。

### D7 语言切换器

- 现状：右上角二值按钮（.lang-switch 样式已有）。
- **推荐**：升级为下拉（原生 select 或自绘菜单）+ **内联 SVG 地球图标**（禁 emoji 铁律）；语言名用各语原生写法：中文 / English / 日本語 / Español / Português。移动端 H5 顶栏空间紧张的话降级为图标点开菜单。
- 细节（自绘 vs select、展开形态）执行票按 UI 惯例定，无需规格级裁决。

### D8 i18n 语言初始化（URL 优先）

- **方案 A（推荐）**：main.tsx 在 i18n.init 前同步解析 `location.pathname` 前缀 → 初始语言（合法前缀用之；无前缀/不合法 → 走 D2 分发逻辑）。i18next 检测顺序改为 `['localStorage','navigator']` 仅作无前缀页面的参考——**有前缀 URL 时 URL 即语言事实来源，localStorage 只影响无前缀 `/` 的分发**（切换器改 URL 而非只 changeLanguage+localStorage，两者同步写）。
- 方案 B：languagedetector 原生 `order: ['path',...]`——库支持但 SPA 路由切换时不自动跟随，魔法多，弃。
- 这是**整个架构的正确性核心**：URL、`<html lang>`、meta、预渲染快照、用户所见语言五者必须同源。

### D9 i18n 资源打包

- **方案 A：全量打包**（5 语种进主 bundle）：简单可靠，代价 gzip 后约 +55~70KB（跨境高 RTT 下不小）。
- **方案 B（推荐）：按语言懒加载**：`resourcesToBackend`（或手写动态 import）——首屏只载当前语言字典；预渲染快照不受影响（#root 已是静态内容）；切换语言按需拉取。
- 取舍点：方案 B 复杂度略升（加载态、失败兜底），方案 A 体积定罪。**倾向 B，若用户求稳可选 A。**

### D10 单测锁定扩盘

- 新增一致性测试：`LANGS × PAGE_METAS` ↔ sitemap 生成器输出 ↔ prerender ROUTES ↔ hreflang 集群 URL 集——四清单任何漂移（如本次 /license 漏网）测试即红。
- 现有 pageMeta 单测扩展：resolvePageMeta 支持语言前缀路径。
- 字典键集一致性：ja/es/pt 与 zh 键集 diff 测试（内容票验收也用它）。

### D11 风格计数防漂移（票 02 毕业）

- **推荐**：单测断言各语言字典中风格计数文案含 StyleRegistry 风格总数（正则抽数字 vs `styles.length`）——比构建期模板注入简单，文案自由度不损。

## 2. 执行票影响预估（供票 04/05 排期参考）

- 改动面：App.tsx（路由）、main.tsx（语言初始化）、i18n/（+langs.ts、懒加载）、pageMeta.ts（hreflang/alternate/canonical 逻辑）、LangSwitch.tsx（重设计）、prerender.mjs（双循环+sitemap 生成）、nginx.conf（301+gzip 白捡项）、index.html（初始 meta 中性化）。
- 新测试：四清单一致性 + 字典键集 + 计数断言，预计 +10~15 用例。
- 风险位：D3 nginx 301 正则与 SPA fallback 的 location 匹配顺序；D8 预渲染时 i18n 初始化时序（puppeteer networkidle0 + waitForFunction 现有机制应覆盖）。
