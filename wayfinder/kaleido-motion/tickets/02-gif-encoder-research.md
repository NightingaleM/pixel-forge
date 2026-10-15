---
title: GIF 编码器选型与 256 色量化质量
ticket: 02-gif-encoder-research
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
date: 2026-10-15
---

## Question

纯前端 GIF 编码选哪个库/路线，且万花筒的镜像渐变 + 棱镜彩色画面在 256 色量化下如何保住质量（**帧间调色板跳变 = 循环闪烁，是本票核心风险**）？

### 任务

1. **候选库对比**：gifenc、gif.js（worker）、gifucts、其他活跃维护库、自研最小实现。每案：依赖体积与许可证、vite 接入（gif.js 需要 worker 文件——与本项目 javascript-obfuscator 定向混淆链路的兼容性要查）、API 形态（逐帧喂 vs 整批喂）、量化器质量与可配置性。
2. **量化质量（核心）**：逐帧独立调色板 vs 全局调色板 vs 首帧调色板复用——对循环 GIF 的帧间闪烁影响；error-diffusion 抖动（Floyd–Steinberg 等）支持情况；万花筒渐变/高饱和画面的 banding 风险与缓解手段。
3. **性能/内存量级**：默认档 512×512×36 帧、上限档 1024×1024×72 帧（24fps×… 取 60–72 帧区间估）的编码耗时与内存；主线程阻塞程度与 worker 化必要性（项目现状无 worker 基建，确认该约束与 worker 化成本）。
4. **循环元数据**：无限循环（NETSCAPE LOOP=0）写入支持。
5. 产出 **A/B 推荐排序**（含量化策略定案建议），供规格锁定票取用。

### 交付

落盘 [assets/research-gif-encoder.md](../assets/research-gif-encoder.md)，票内 Resolution 记结论摘要。

## Resolution

完整对比表、量化策略分析、实测数据与信源见 [assets/research-gif-encoder.md](../assets/research-gif-encoder.md)。结论摘要：

**A(推荐)= gifenc 1.0.3 + 全局调色板(均匀抽 8 帧联合采样一次 quantize,256 色 rgb565)+ 首帧写 GCT 后续帧不传 palette 复用 + repeat:0。**
- 核心风险结构性消除:全部帧共享同一色板,帧间调色板跳变(循环闪烁)不存在自由度;实测回读 localCT=0、NETSCAPE loop=0。
- 实测(Node 22 V8 主线程,合成万花筒最难场景):512×512×36 帧 **274ms** / 1024×1024×72 帧 **983ms**;体积 3.9KB gzip、零依赖、MIT;流式逐帧 API 与 offscreenExport 地基同构,内存峰值与帧数解耦(<50MB,1024 档与 H5 安全)。
- 唯一弱点=无内置抖动:默认关,原型目检 banding 不合格再开自研 Floyd–Steinberg(≈40 行,用其 nearestColorIndex;代价实测口径:体积 +80~100%、耗时 ×3~5;1024 档届时建议按 ParticleEngine 先例走 vite 原生 worker)。

**B(备选)= modern-gif 2.1.0**(全帧联合采样 GCT + 内置 floyd-steinberg/atkinson/stucki + 官方 vite `?url` worker,MIT,2026-04 仍活跃):开箱质量最好,但实测 512×36 帧 3.2s(无抖动)/6.1s(FS),1024×72 帧 14.6s/38s,且整批缓存帧 RGBA(1024×72≈288MB,H5 有 OOM 风险)——只可作 512 档替代,不配当默认。

**排除**:gif.js(npm 2016-12 停更,NeuQuant 默认逐帧量化=闪烁敞口,速度慢于 gifenc 2 倍+,worker 文件需 ?url 手动搬运);gifucts(实名 gifuct-js,纯解码器无编码能力,已转用作回读验证工具);gifski-wasm(AGPL-3.0,闭源商用不可用);omggif/gif-encoder-2(2019 停更,后者 license 为 UNLICENSE);自研最小实现(gifenc 已 3.9KB gzip,自研无收益反引 LZW 正确性风险)。

**给规格锁定票的量化定案**:全局联合采样,禁逐帧量化(实测慢 ~5 倍且体积反大 ~10%,另有闪烁);fps 档位须对齐 GIF 10ms 延时粒度(默认 12fps 实写 80ms=12.5fps);预估体积 UI 按每帧 LZW 后字节实时累计,抖动开启时按 ×1.9 系数。验收可用 gifuct-js 断言 GCT/无 LCT/loop=0/帧数/延时(验证脚本已在 c:\tmp\gifbench 跑通)。混淆链零风险已核实:obfuscateLicense 只改写 `assets/license-` chunk,任何 GIF 库 JS/worker 均不触碰。
