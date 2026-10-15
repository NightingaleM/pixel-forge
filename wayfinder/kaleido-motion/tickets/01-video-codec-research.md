---
title: 纯前端视频导出编码路径选型
ticket: 01-video-codec-research
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
date: 2026-10-15
---

## Question

纯前端（无后端、纯静态站）从 WebGL 画布导出视频的**最优路径**是什么？需兼顾逐帧确定性、浏览器矩阵、社交产物兼容、以及与现有构建链（vite + javascript-obfuscator 定向混淆）的兼容。

### 任务

1. **候选路线对比**：WebCodecs `VideoEncoder` + mp4/webm 封装库（mp4-muxer、mediabunny 等）vs `MediaRecorder`（`canvas.captureStream` 实时录制 WebM/VP9）vs 其他（如 WebCodecs→WebM）。每案：依赖体积与许可证、vite 接入方式、**帧时序确定性**（离屏逐帧渲染「渲一帧喂一帧」要求时序精确可控——MediaRecorder 实时录制的帧间隔抖动是重点隐患）、编码档位控制（码率/关键帧间隔）。
2. **浏览器支持矩阵**（2026 现状）：Chrome/Edge/Firefox/Safari 桌面 + iOS Safari/Android Chrome；重点：Safari 系的 `VideoEncoder` 与 H.264/VP9/AV1 编码支持现状；不可用时的特性检测写法。
3. **产物兼容性**：微信/QQ/主流社交平台对 MP4 vs WebM 的直接播放与转发兼容；给普通用户的默认格式建议（MP4 优先还是 WebM 优先）。
4. **性能量级**：720p/30fps/6s（180 帧）编码耗时与内存量级；与逐帧 WebGL 离屏渲染的编排方式（同步逐帧 vs 分批让出主线程）。
5. **移动端附带结论**：移动浏览器上视频路径与纯 JS GIF 路径的可行性/耗时量级对比，供规格锁定票决定本期 H5 带不带、带哪种。
6. 产出 **A/B 推荐排序**（主路径 + 兜底路径）与特性检测策略，供规格锁定票取用。

### 交付

落盘 [assets/research-video-codec.md](../assets/research-video-codec.md)，票内 Resolution 记结论摘要。

## Resolution

完整研究见 [assets/research-video-codec.md](../assets/research-video-codec.md)（路线对比表、支持矩阵、性能/内存量级、特性检测写法、信源列表，官方/社区口径分标，2026-10-15 live 数据）。结论摘要：

**A/B 推荐排序**

- **A（主路径）：WebCodecs `VideoEncoder`（H.264/AVC）+ mediabunny 封 MP4（`fastStart:'in-memory'`）**。帧时序确定性靠 `CanvasSource.add(timestamp, duration)` 显式时间戳 + add 返回 Promise 的官方背压（渲一帧喂一帧，天然限内存）；码率/CBR/GOP（`keyFrameInterval` 秒）/latencyMode/codec string 全可控；产物 MP4+H.264 是微信/QQ/全平台最大公约数（moov 前置避免时长元数据问题）。
- **B（兜底）：检测失败 → GIF-only 提示**（GIF 本期同交付、优先保证）。不默认产 WebM——微信/微博 WKWebView、QQ 内置浏览器拒播 WebM，宁可不出视频也不给用户发出去打不开的文件。
- **MediaRecorder/captureStream 否决**：fps 参数仅是上限建议值、掉帧写进成片（社区实测 0.9x 变速）、编码黑盒、产物随浏览器漂移、Safari 18.4 才修「编码帧乱序」（官方 release notes）、WebM 时长元数据在文件尾。

**关键事实（官方口径，勘误社区讹传）**

- Safari **16.4（2023-03）起视频侧含 `VideoEncoder`**（H.264 硬编，WebKit 16.4 features 文原句 "video portion of Web Codecs API"）；Safari 26（2025-09）补的是音频侧。caniuse 脚注 "Video-only" = 仅视频 API 无音频，不是只有解码。**桌面 Safari 不受限，无需 polyfill**（map.md 悬念解除）。
- Firefox 130+（2024-09）桌面有 WebCodecs，但可编码 codec 随平台后端而异（Linux H.264 可能不可编）→ 一律运行时检测。
- mp4-muxer/webm-muxer 已于 2025-07-02 官方弃用，后继 **mediabunny 1.61.4**（2026-10-12 仍发版，MPL-2.0，零依赖，写 MP4 仅 ~17.3 kB gzip，与本仓定向混淆构建链无冲突）。

**量级（720p/30fps/6s=180 帧）**：桌面硬编编码本体约 0.3–1.5 s、中端手机约 2–6 s（瓶颈在 WebGL 渲染）；流式喂帧在飞仅 1–3 帧原始数据（≈4–10 MiB）+ 产物 ~3–6 MB，`BufferTarget` 余量巨大，禁止攒 620 MiB 全帧缓存。

**移动端附带结论（供规格锁定票）**：H5 值得带视频导出（iOS≥16.4/Android Chrome≥94 均有 VideoEncoder，硬编不慢于纯 JS GIF 且产物更优）；GIF 天然兜底。风险项：微信 Android XWeb 内核需真机 `canEncodeVideo('avc')` 冒烟；硬编偶发拒编需码率封顶+prefer-software 自动重试（测试覆盖该分支）。
