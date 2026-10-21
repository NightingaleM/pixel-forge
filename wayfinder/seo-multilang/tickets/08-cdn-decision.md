---
title: 决策票——CDN 与海外分发（含白捡优化）
labels: [wayfinder:grilling]
status: closed
assignee: 主会话（已完成）
blocked-by: []
---

## Question

由研究票「海外可达性取证」毕业。事实底座：[assets/research-reachability.md](../assets/research-reachability.md)。三个递进的决策：

1. **白捡优化先不先做**（零成本、无争议候选，但要动服务器侧）：nginx 开 gzip（首屏 410KB→~120KB）+ 静态资源 Cache-Control + HTTP/2 + 权威 DNS 迁海外节点。**架构预研已确认：nginx.conf 与 Dockerfile 都在本 repo 根目录**——gzip/缓存项可直接进 repo 配置随镜像部署；且研究实测线上 nginx/1.20.2（2022 版）与 repo 配置行为矛盾（repo 已配 JS/CSS 长缓存但线上未见），**线上疑似跑旧镜像，重新 build+部署本身就能白捡一截**。HTTP/2 需容器 443/TLS 前置（当前容器只 EXPOSE 80，https 在宿主机或 SLB 终结——需你确认 TLS 终结点在哪）。权威 DNS 迁海外是阿里云控制台操作（hichina 换海外节点或迁 Cloudflare DNS）。
2. **CDN 三方案拍板**（核心权衡 = 海外提速 vs 大陆用户受害 vs 年开销）：
   - CF 免费档：海外收益最大、免费；**大陆用户绕美西变差**（现有大陆用户资产受损）
   - 阿里云国际 CDN：大陆不受损 + 海外 GIA 节点；年 ¥50-150
   - 迁国际托管：海外最优；大陆最差 + 备案可能被注销（基本排除）
3. **时机**：Googlebot 已能正常抓取，CDN 不阻塞多语言上线——是「先上线后优化」还是「上线前一并做」？

裁决倾向（供拍板参考，研究票结论）：白捡优化无论如何都该做；CDN 决策建议等多语言版上线后拿真实海外数据再定，避免现在为不确定的海外流量预付架构复杂度。

## Resolution

**2026-10-21 用户裁决：「全按推荐」**：

1. **白捡优化现在做、进 repo**：nginx.conf 显式加 gzip（`gzip on` + `gzip_types` 覆盖 js/css/json/svg 等，当前依赖镜像默认只压 text/html）+ HTML 缓存策略（`no-cache` 协商，保证部署即生效），随镜像重新 build 部署——重新部署本身即解决「线上 1.20.2 旧镜像」问题（repo 已配的 JS/CSS 长缓存随之生效）。
2. **CDN 缓议**：Googlebot 抓取正常，CDN 非收录级阻塞——等多语言版上线 + GSC 真实海外数据（3-6 个月窗口）再定；届时三方案（CF 免费/阿里云国际 CDN/迁托管）利弊事实直接取 [assets/research-reachability.md](../assets/research-reachability.md) §3。
3. **留给用户的部署侧动作**（非 repo，部署时顺手）：权威 DNS 迁海外节点（阿里云云解析控制台）；HTTP/2 需在 TLS 终结点开启（容器仅 EXPOSE 80，宿主机/SLB 终结 TLS——部署时确认该层配置）。
