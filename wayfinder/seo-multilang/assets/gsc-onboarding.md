# Google Search Console 接入手册（部署后照单执行）

- 任务票：wayfinder/seo-multilang「GSC 接入手册」
- 日期：2026-10-21
- 前提：多语言版（全前缀 URL + 新 sitemap）**已部署上线**。此前做 GSC 只会录到旧结构，意义不大。
- 官方同域 URL 变更指南（本站场景的权威依据）：https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes

---

## 1. 所有权验证（一次性，10 分钟）

推荐 **Domain 级（DNS TXT 记录）**验证：一次覆盖所有子域名与 http/https 变体，后续不折腾。

1. 打开 https://search.google.com/search-console → 「添加资源」→ 选 **网域**（Domain）→ 输入 `oylz.site`。
2. Google 弹出 TXT 记录值，形如 `google-site-verification=xxxxxxxx`，复制。
3. 到你域名的 **DNS 服务商**添加记录（若域名 DNS 托管在阿里云：控制台 → **云解析 DNS** → 选 `oylz.site` → **添加记录**；若在其他注册商，对应面板同样加 TXT）：
   - 记录类型：`TXT`
   - 主机记录：`@`
   - 记录值：粘贴第 2 步的值
4. 回 GSC 点「验证」。DNS 生效有延迟，刚加完验证失败就等 5–10 分钟再点。

> 注：若不想动 DNS，备选「网址前缀」验证（HTML 标签法，把 meta 标签放进 index.html）——但它只验证单个前缀，换协议/子域要重来，不推荐。

## 2. 多语言版上线后的动作清单（按序）

**上线前置自检**（提交给 Google 前确保结构就绪，否则录到中间态）：

- [ ] `https://pixelforge.oylz.site/zh/`、`/en/`、`/ja/`、`/es/`、`/pt/` 各抽 1–2 个路由可打开，`<html lang>` 与页面语言一致
- [ ] 旧路径（`/2d`、`/3d` 等）按规格票锁定的方案正确响应（301 到 `/zh/*` 或预渲染 zh + canonical 指向 `/zh/*`）
- [ ] `/sitemap.xml` 返回新清单（5 语言 × 8 路由 + alternate 引用），浏览器直接打开肉眼可查
- [ ] 页面源码里 hreflang 集群完整（每语言一条 + x-default），可用 URL 检查工具或 view-source 抽查

**GSC 操作**：

1. **提交 sitemap**：左侧「站点地图（Sitemaps）」→ 输入 `sitemap.xml` → 提交。
2. **请求索引关键页**：「网址检查（URL Inspection）」逐个输入 `/zh/`、`/en/`、`/ja/`、`/es/`、`/pt/` 及各语种 `/2d` → 「请求编入索引」。40 页不必全请求，核心 10 页左右即可，其余靠 sitemap 自然抓取。
3. **观察过渡**（1–4 周）：「索引 → 页面（Pages）」报告看旧 URL 逐渐变为「重定向」状态、新 URL 进入收录。效果报告里新 URL 的展现开始出现即迁移生效。

## 3. 效果监控与第二波语种取数

- **效果（Performance）报告**是第二波语种决策的取数入口：维度选「国家/地区」，看日本→ja、巴西→pt、墨西哥/阿根廷/西班牙→es、美英→en 各自的展现/点击曲线；查询（Query）维度看各语种目标词是否带来展现。
- **建议观察窗口**：上线后 3–6 个月再定第二波（ko/de/fr/ru…）；展现量持续低迷的语种先查 hreflang/收录状态而非急于加语种。
- **hreflang 无专用报告**：GSC 的「国际定位」报告（含 hreflang 监控）已于 2022 年 9 月移除。hreflang 问题会在「页面」报告的失败原因与网址检查详情里露头；如需语言级报告可辅以 **Bing Webmaster Tools**（免费，有独立的语言/地区视图）。
- **注**：GSC 的「地址变更（Change of Address）」工具已有 2024 年退役的公开报道（同域内 URL 变化本也不适用该工具——它只管换域名）；若你的界面里仍见到该入口，以界面实际为准，本手册流程不依赖它。

## 4. 常见坑

- DNS TXT 验证失败 99% 是生效延迟，等几分钟重试，别反复改记录。
- sitemap 提交「无法获取」：先确认 `https://pixelforge.oylz.site/sitemap.xml` 浏览器裸开正常（Content-Type 是 XML），再查 robots.txt 没有误封。
- 旧 URL 301 后不要急着在 sitemap 里删旧地址之外的补救动作——保持 301 至少 6 个月（Google 官方建议），让信号充分转移。
