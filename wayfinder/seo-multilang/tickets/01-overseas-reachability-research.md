---
title: 研究票——海外可达性取证（阿里云深圳源站）
labels: [wayfinder:research]
status: closed
assignee: 研究子代理（已完成）
blocked-by: []
---

## Question

pixelforge.oylz.site 部署在阿里云华南（深圳）Docker 容器、HTTPS。海外用户（美/欧/日/西语拉美/葡语巴西——正好对应第一波目标语种）实际访问效果如何？SEO 大前提是「爬虫与用户能正常、不太慢地打开页面」。

1. **实测取证**：用公开全球探测服务（check-host.org API、globalsping、各地 PageSpeed Insights 等，选能用的）对 `https://pixelforge.oylz.site/` 做多点 HTTP 成功率 + TLS/首字节延迟，覆盖美东/美西/欧洲/日本/巴西至少各一个探测点；国内探测点作对照。
2. **文献取证**：阿里云国内节点的国际出口已知状况（跨境链路瓶颈、丢包、.site 域名海外解析无碍与否）——找近一两年经验数据，不采信陈年论坛帖。
3. **结论**：海外访问「能否正常打开 + 速度量级」的事实判断；**是否需要 CDN 前置**的明确建议（Cloudflare 免费档 vs 阿里云 CDN 国际版 vs 迁国际托管，只摆事实与建议，决策留给用户/后续票）。

产出落 `../assets/research-reachability.md`：实测数据表 + 文献摘录（附来源链接）+ 结论摘要 ≤10 行。

## Resolution

**2026-10-21 研究完成**，全文（153 行）见 [assets/research-reachability.md](../assets/research-reachability.md)（check-host 55 节点 + Globalping 9 点双系统实测、文献摘录、三方案对比）。结论：

1. **能正常访问**：目标区域成功率 98.1%（55 节点仅 1 超时），无阻断、备案不影响海外访问；Googlebot 视角（美东）抓取正常——**CDN 不是收录级阻塞，是体验级优化**。
2. **速度被拖累**：HTML 全链路东京 0.38s／美西 0.9s／欧洲 0.8-1.4s／巴西 1.4s／美东 1.7s；纯 RTT 美东 478-517ms（绕路）；香港/新加坡路径严重劣化（RTT 324-1324ms）。真实首屏估 **3-6s**（410KB 未压缩 + 高 RTT；实测窗口为跨境低谷期，晚高峰更差）。
3. **白捡优化（零成本，先于任何 CDN 决策）**：nginx 未开 gzip（410KB→~120KB）、无 Cache-Control、HTTP/1.1、权威 DNS 在境内（海外解析段 200-1750ms 全是白损）。
4. **三方案事实已摆、不决策**：CF 免费档（海外收益最大，大陆用户绕美西变差）vs 阿里云国际 CDN（大陆不受损 + 海外 GIA，年 ¥50-150）vs 迁国际托管（海外最优，大陆最差且备案可能注销）→ 已毕业决策票 08「CDN 与海外分发决策」。
5. 取证注记：PSI 两条路均不可达，以 check-host+Globalping 双系统替代覆盖美国视角；原始报告 ID 与 JSON 备份（/c/tmp/）在研究文档附录。
