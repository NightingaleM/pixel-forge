---
title: 视频编码路径研究——万花筒动图导出
ticket: 01-video-codec-research
author: research-agent
date: 2026-10-15
data-freshness: 信源均为 2026-10-15 当日拉取的 live 数据或 2024-2026 发文
---

# 视频编码路径研究（纯前端 · WebGL 逐帧渲染 → 视频文件）

> 项目前提：vite + React + three.js 纯静态站，无后端；已有 offscreenExport 离屏全尺寸单帧导出链路（9bc9c02）；目标档位 720p/30fps/默认 2 循环（6s ≈ 180 帧）；构建链含 javascript-obfuscator（定向混淆 license chunk）。
> 本文所有结论标注【官方】（厂商文档/registry/规范原文）或【社区】（博客/问答/案例，日期给出），无法核实的说法一律不入结论。

## TL;DR（A/B 推荐排序）

| 排序 | 路线 | 一句话理由 |
|---|---|---|
| **A（主路径）** | **WebCodecs `VideoEncoder`（H.264/AVC）+ mediabunny 封 MP4（`fastStart:'in-memory'`）** | 帧时序确定性（显式 timestamp/duration）、码率/GOP/画质档全可控、产物 MP4+H.264 是微信/QQ/全平台最大公约数、库仅 ~17.3 kB gzip 且活跃维护 |
| **B（兜底）** | **检测失败 → 不出视频，提示改用 GIF**（GIF 本期同交付、优先保证）；如需二次兜底才考虑 mediabunny 换 VP9/WebM | 非WebCodecs 浏览器（老 Firefox<130 等）占比已极小；WebM 产物发微信打不开，宁可不出也不给用户一个「发出去对方打不开」的文件 |
| ✗（否决） | `MediaRecorder` + `canvas.captureStream` | 实时录制语义：帧率参数只是「上限建议值」，渲染掉帧直接写进成片（社区实测产出 0.9x 变速视频）；编码参数黑盒；产物矩阵混乱（Chrome 老版仅 WebM、Firefox 仅 WebM、Safari 仅 MP4）；Safari 18.4 才修过「编码帧乱序」bug（官方 release notes） |

**结论：桌面 Safari 不受限**——Safari 16.4（2023-03）起就有视频侧 `VideoEncoder`（H.264，走 VideoToolbox），map.md 里「若桌面 Safari 都受限则 GIF-only 还是 polyfill」的悬念解除：不需要 polyfill，极老浏览器直接 GIF-only 提示即可。

---

## 1. 候选路线对比

### 1.1 封装库选型事实（npm registry，2026-10-15 拉取）【官方】

| 库 | 最新版（发布日） | 许可证 | 状态 |
|---|---|---|---|
| **mediabunny** | **1.61.4（2026-10-12）** | **MPL-2.0** | 活跃维护（1.x 系列高频发版）；零依赖、纯 TypeScript、深度 tree-shakable |
| mp4-muxer | 5.2.2（2025-07-02） | MIT | **已弃用**，npm 弃用声明原文："This library is superseded by Mediabunny. Please migrate to it." |
| webm-muxer | 5.1.4（2025-07-02） | MIT | **已弃用**，同上 |

mediabunny 与 mp4-muxer/webm-muxer 同一作者（Vanilagy），是其官方后继者，MP4/WebM 读写 + WebCodecs 编解码封装一体化。

**体积（mediabunny 官网首页基准页，2025-06-22 测）【官方】：** min+gzip 后——写 .mp4 文件 **17.3 kB**、写 .webm 11.4 kB、全部功能 69.6 kB（对照：@remotion/webcodecs 108 kB、mp4box.js 37.3 kB）。对本站gzip 后增量约 17 kB 量级，可忽略。

### 1.2 逐项对比

| 维度 | A：WebCodecs + mediabunny（MP4/H.264） | A'：WebCodecs + mediabunny（WebM/VP9） | C：MediaRecorder + captureStream |
|---|---|---|---|
| 帧时序确定性 | **完全确定**：`CanvasSource.add(timestamp, duration)` 每帧显式时间戳（官方文档原话 "precisely control the timing of media data"）【官方】 | 同左 | **不确定**：MediaRecorder 无帧率概念，`captureStream(fps)` 的 fps 是每秒最大帧数而非定值；渲染掉帧→成片变速；Firefox 曾产出双倍帧数文件+超长首帧【社区，SO】 |
| 编码档位控制 | `Quality({bitrate, bitrateMode:'constant'|'variable', quantizer})`、`keyFrameInterval`（秒，默认 2s）、`latencyMode`、`hardwareAcceleration`、`fullCodecString`（可钉 avc1 profile）【官方】 | 同左 | 仅 `videoBitsPerSecond` 一个「建议值」，profile/GOP 全黑盒【社区，多篇 2025-2026】 |
| 产物兼容 | MP4+H.264：微信/QQ/iOS/安卓/剪辑软件全兼容（见 §3） | WebM：微信打不开（见 §3） | Chrome 老版仅 WebM、Firefox 仅 WebM、Safari 仅 MP4——同一份代码产物随浏览器漂移【官方 BCD+社区】 |
| 依赖体积 | ~17.3 kB gzip（tree-shake 后）【官方】 | ~11.4 kB gzip【官方】 | 0（原生 API） |
| 取消/进度 | `output.cancel()` 释放资源；`onEncodedPacket` 回调按包计进度【官方】 | 同左 | 只能 stop 丢弃，无帧级进度 |
| 内存 | 流式：原始帧在飞 1-3 帧（~4-10 MiB）+ 编码输出缓冲 | 同左 | 浏览器内部管理，不透明 |
| 已知坑 | 硬件编码器偶发拒编（过高码率）→ 解法：不指定 hardwareAcceleration + 失败自动降软编重试【社区，JIZURA 案例 2026-10】 | Firefox/老设备 VP9 编码慢 | Safari「编码帧乱序」2025 年才修（18.4 release notes）【官方】；WebM 产物时长元数据在文件尾部，下载后部分播放器显示 0 时长，需 re-mux【官方，Remotion 文档】 |

### 1.3 与本项目构建链的兼容

- **vite**：mediabunny 是标准 ESM npm 包（`"type":"module"`，exports 三态齐全），vite 直接静态导入即可；提供 UMD/cjs 发行版但不需要【官方，npm+installation 文档】。
- **javascript-obfuscator**：本仓为**定向混淆**（仅 license chunk），新依赖走正常 vendor chunk 不受影响；且混淆第三方库既无必要也有体积/性能风险——保持 mediabunny 在未混淆 vendor chunk 即可，无行动项。
- **许可证**：MPL-2.0 为文件级弱 copyleft，以独立 npm 依赖形式**原样分发**（vendor chunk 保留其版权头）对闭源/商业站无传染问题；比 MIT 严格一档，记录在案即可。若某天必须把库源码改进后混入自有代码，才触发 MPL 义务。

## 2. 浏览器支持矩阵（2026 现状）

### 2.1 WebCodecs `VideoEncoder`【官方，caniuse live 数据 2026-10-15 拉取 + WebKit/Apple 原文交叉验证】

| 浏览器 | VideoEncoder 可用版本 | 备注 |
|---|---|---|
| Chrome | **94+**（2021-09） | 全量 |
| Edge | 94+ | 全量 |
| Firefox | **130+**（2024-09） | 桌面启用 WebCodecs；**可编码的 codec 随平台后端而异**（Windows 走 Media Foundation、Linux 依赖系统 gstreamer/专有解码包，H.264 可能不可编）→ 必须 `isConfigSupported` 实测【社区：Linux H.264 依赖 ubuntu-restricted-extras 等，php.cn 2026-06；JIZURA 案例同结论】 |
| Safari（macOS） | **16.4+**（2023-03） | WebKit 官方 16.4 features 文原句："Safari 16.4 adds support for **the video portion** of Web Codecs API"——含 `VideoEncoder`（H.264 硬编，VideoToolbox）；17.4 追加 HEVC 编码并修 VideoEncoder latencyMode bug（Apple release notes）；**26.0（2025-09）补齐 AudioEncoder/AudioDecoder 转全量**（WebKit features 文，caniuse 同步转 y） |
| iOS Safari | **16.4+** | 与桌面同口径（caniuse 同脚注）；我们无音频轨，音频侧缺失不影响 |
| Android Chrome | 94+ | 全量 |
| 微信 iOS | 跟随 iOS WKWebView（≥16.4 可用） | 【社区】 |
| 微信 Android（XWeb） | 内核为 Chromium 系（近年 ≥107 量级），理论 ≥94 即有 WebCodecs | 【社区经验，未逐一实机核实——执行票验收时用 `canEncodeVideo` 实测真机】 |

**勘误记录（供规格票引用）**：社区文章（含 2026 年 CSDN 高赞文）普遍把 Safari 写成「16.4 只有解码」或「VideoEncoder 要等 Safari 26」——两种说法都不对。事实：16.4 起视频侧含编码，26 只是补音频侧。caniuse 16.4–18.7 的部分支持脚注「Video-only support」意思是**只有视频 API、没有音频 API**，不是只有解码。MDN BCD 顶层 VideoEncoder 行写 Safari 16.4 与此一致（其子特性无 Safari 特殊注记）。

### 2.2 MediaRecorder（对照）【官方，MDN BCD live】

Chrome 47+（2016）/ Firefox 25+ / Safari 14.1+（iOS 14+）。但**能录什么格式**各 家不同：Safari 仅 `video/mp4`（H.264+AAC）【社区+WebKit release notes 旁证】；Firefox 仅 WebM 系；Chrome 长期仅 WebM，2024 末起才逐步支持 MP4 录制且版本行为不一致，Chrome 133（2025-01）默认开启 HEVC 录制（字节跳动贡献）【社区，2024-12 新闻 + 2026 实践文】。即：MediaRecorder 的「支持」是 API 存在性，产物格式仍要看运气——这是否决它的第二个理由。

### 2.3 特性检测写法（给执行票）

```ts
import { canEncodeVideo, Quality } from 'mediabunny';

// 记忆化：同会话同参数只问一次（isConfigSupported 有上百 ms 开销，社区实测）
let cached: boolean | null = null;
export async function videoExportSupported(w = 1280, h = 720): Promise<boolean> {
  if (cached !== null) return cached;
  cached = typeof VideoEncoder !== 'undefined' && await canEncodeVideo('avc', {
    width: w, height: h, frameRate: 30,
    quality: new Quality({ bitrate: 8e6 }),
  });
  return cached;
}
```

要点（均有出处）：
- `canEncodeVideo` 内部走 `VideoEncoder.isConfigSupported`，带宽高/帧率/码率探测，比只查 `'VideoEncoder' in window` 可靠（ mediabunny 官方文档）【官方】。
- 探测参数用**真实导出档位**（720p/30fps/目标码率），不要用库默认探测（默认恰好也是 1280×720）。
- 导出中途硬件编码失败的重试策略：A 档配置不指定 `hardwareAcceleration`（no-preference），失败后以 `prefer-software` 重建 Output 再跑；码率给上限（社区经验 720p 不超过 ~20 Mbps，过高会被硬编拒绝）【社区，JIZURA 2026-10】。

## 3. 产物兼容性：MP4 vs WebM（微信/QQ/社交）

- **微信（聊天发送、小程序、内置浏览器）**：最稳妥格式是 **MP4 + H.264 + AAC**；WebM/MKV/MOV 常见「点开打不开/只有声音没有画面」【社区，多信源交叉：头条 2026-09、ahelpers 2026-05、CSDN 问答 2026-01】。
- **微信/微博 iOS 内置 WKWebView**：「至今只认 H.264 封装在 MP4 里的文件，对 WebM 容器里的 VP8/VP9/AV1 一律拒绝解码」【社区，bbccb 2026-06】。
- **QQ**：内置浏览器同样存在 WebM 拒播【社区，CSDN 问答 2026-01】。
- **总括（2026 年口径）**：「MP4 + H.264 是 2026 年兼容性的最大公约数」；WebM「出了浏览器就没人认识它」【社区，CutFast 2026-06】。

**给普通用户的默认格式：MP4 优先，无悬念。** 本项目无音频轨，即纯视频 MP4/H.264（微信对该组合同样全部支持）。技术上加一道保险：mediabunny 的 `Mp4OutputFormat({ fastStart: 'in-memory' })` 把 moov 元数据写到文件头（官方文档），避免「下载后播放器读不到时长」类问题——对聊天 App 内预览最友好。

## 4. 性能量级（720p / 30fps / 6s ≈ 180 帧）

### 4.1 编码耗时

- **官方锚点**【mediabunny 首页基准，2025-06-22，Ryzen 7600X + RTX 4070】：320×180 转码（解码+重编码+缩放）804 帧/s（对照 @remotion/webcodecs 324 帧/s、ffmpeg.wasm 12 帧/s）。桌面硬编 H.264 在 720p 通常数百 fps 量级。
- **推算（标注为量级估计，非实测）**：桌面 Chrome/Edge/Safari（硬编）180 帧 720p 编码本体 **约 0.3–1.5 s**；中端手机（硬编）**约 2–6 s**；瓶颈更可能在 WebGL 渲染而非编码。
- 社区旁证【社区】：WebCodecs 相比 MediaRecorder/Canvas 路线「编码效率提升 3-5 倍」（百度智能云 2025-09）；某平台导出 12s→3s（CSDN 2025-10）。ffmpeg.wasm 路线（12 帧/s）完全不可用，直接排除。

### 4.2 内存（算术，确定值）

- 单帧 720p RGBA = 1280×720×4 ≈ **3.5 MiB**；180 帧全量缓存 ≈ **620 MiB**——**绝不可先攒帧后编码**。
- mediabunny `CanvasSource` 流式喂帧：原始帧在飞仅 1–3 帧（≈4–10 MiB）；产物缓冲 6s@8 Mbps ≈ 6 MB。`BufferTarget` 官方指引适合 <100 MB 文件【官方】，本场景余量巨大。
- 结论：**同步逐帧「渲一帧 await add() 一帧」即可**，add 返回的 Promise 即官方背压通道（编码器忙时挂起，天然限内存）；无需分批让出。为保进度条流畅，渲染循环里每帧 await（即已让出主线程），UI 不冻结。

### 4.3 与现有渲染地基的编排

```
for (i = 0; i < totalFrames; i++) {
  setKaleidoUniforms(t = i / fps);      // A↔B 正弦缓动，时间由帧号反推——确定性时间源
  renderOffscreenCanvas();               // 复用 offscreenExport 的离屏渲染
  drawWatermarkIfFree();                 // 与单图导出同规则
  await canvasSource.add(i / fps, 1 / fps);  // 显式时间戳+背压
  reportProgress(i);
}
await output.finalize();
```

## 5. 移动端附带结论：视频路径 vs 纯 JS GIF（供规格锁定票定 H5 范围）

| 维度 | 视频路径（WebCodecs H.264 硬编） | 纯 JS GIF（量化+LZW，全 CPU） |
|---|---|---|
| 可用性 | iOS≥16.4、Android Chrome≥94、微信 iOS 跟随系统；微信 Android XWeb 需实机验证 | 所有浏览器（无 API 门槛） |
| 耗时（中端手机，量级估计） | 720p/180 帧 ≈ **2–6 s**（硬编，瓶颈在渲染） | 512px/36 帧 ≈ **1.5–6 s**（每帧 30–150 ms，无硬加速） |
| 产物 | ~3–6 MB @6s，全平台可播、可转发 | 数 MB 且 512px/12fps 画质显著劣于 720p/30fps 视频 |
| 循环播放语义 | 聊天 App 内视频不自动循环（规格已用「2 循环」化解） | GIF 天然循环 |

结论：**H5 值得带视频导出**——能力门槛（VideoEncoder ≥ iOS16.4/Chrome94）与本项目 H5 已有的其它能力假设同量级，硬编速度不劣于 GIF 甚至更快、产物更优。GIF 是天然兜底（本来就同交付）。建议规格票裁定：H5 双格式都出，视频检测失败静默降级 GIF-only（提示文案），不引入 MediaRecorder。GIF 编码器选型细节归票 02。

## 6. 风险与开放项（移交规格锁定票）

1. **微信 Android XWeb 的 VideoEncoder**：社区口径内核已 ≥Chromium 107，但未实机核实——执行票需真机 `canEncodeVideo('avc')` 冒烟（可并入 browser-verification-playbook 流程）。
2. **硬编偶发拒编**：码率封顶 + prefer-software 自动重试已覆盖（§2.3），测试用例须包含「硬编失败」分支。
3. **Safari 老版本（16.4–17.3）H.264 编码 profile**：mediabunny 自动生成 codec string，如遇 Safari 挑 profile（社区有零星报告），用 `fullCodecString: 'avc1.640028'`（High@L4.0）或 `'avc1.42E01E'`（Baseline）钉死；属实现期调参项，不影响选型。
4. **avc 编码不可用的 Firefox/Linux**：走 B 兜底（GIF-only 提示）。若产品坚持要出视频，才加 VP9/WebM 二档——但 WebM 在微信生态不可播，默认不做。

## 7. 信源列表

**官方（厂商文档 / registry / 官方基准，均为 2026-10-15 直接拉取原文或 live 数据）**

1. caniuse WebCodecs live 数据（经 jsdelivr 同步 GitHub master）：Chrome 94+ / Edge 94+ / Firefox 130+ / Safari 16.4 部分支持（脚注 Video-only）→ 26.0 全量；iOS Safari 同 —— https://caniuse.com/webcodecs
2. WebKit 官方博客《WebKit Features in Safari 16.4》（2023-03）："Safari 16.4 adds support for the video portion of Web Codecs API" —— https://webkit.org/blog/13966/
3. WebKit 官方博客《WebKit Features in Safari 26》（2025，WWDC25）：AudioEncoder/AudioDecoder 加入；MediaRecorder 增 ALAC/PCM —— https://webkit.org/blog/16684/
4. Apple Safari 17.4 Release Notes："Added WebCodecs HEVC support"；VideoEncoder latencyMode 修复 —— https://developer.apple.com/documentation/safari-release-notes/safari-17_4-release-notes
5. Apple Safari 18.4 Release Notes："Fixed MediaRecorderPrivateEncoder writing frames out of order" —— https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes
6. MDN browser-compat-data（live）：api/VideoEncoder（Chrome 94/FF 130/Safari 16.4）、api/MediaRecorder（Chrome 47/FF 25/Safari 14.1、iOS 14）—— https://github.com/mdn/browser-compat-data
7. npm registry（live 2026-10-15）：mediabunny 1.61.4（2026-10-12，MPL-2.0，零依赖）；mp4-muxer 5.2.2 / webm-muxer 5.1.4（2025-07-02 弃用，声明指向 mediabunny）—— https://registry.npmjs.org/mediabunny
8. mediabunny 官方文档（live）：Writing media files（Output/BufferTarget/finalize/cancel、<100MB 指引）、Media sources（CanvasSource.add(ts,dur)、背压、VideoEncodingConfig、Quality、keyFrameInterval）、Output formats（fastStart:'in-memory'）、Supported formats & codecs（canEncode/canEncodeVideo/getEncodableVideoCodecs、MP4 支持 avc/hevc/vp8/vp9/av1）、首页体积与性能基准（2025-06-22 测）—— https://mediabunny.dev/ （含 /llms.txt 全文档索引）

**社区（经验/案例/问答，日期标注，仅作旁证或量级参考）**

9. Remotion 官方文档（中文镜像）：MediaRecorder 产出的 WebM 时长/索引元数据在文件尾，需 re-mux 或重编码修复 —— https://remotion.nodejs.cn/docs/webcodecs/fix-mediarecorder-video/
10. Stack Overflow（1r1g 镜像）：MediaRecorder 无帧率概念、captureStream(fps) 仅为上限、pause/resume+requestFrame hack 仅 Chrome 可用、Firefox 产出双倍帧数+超长首帧 —— https://qa.1r1g.com/sf/ask/4123508931/
11. Stack Overflow（dev59 镜像）：渲染掉帧导致成片 0.9x 变速 —— https://dev59.com/HJ3ha4cB1Zd3GeqPRkX1
12. JIZURA 案例（WebCodecs 浏览器直出 MP4 生产应用，2026-10-10）：候选 codec 逐个 isConfigSupported 协商+记忆化；硬件编码器是失败惯犯，硬编失败自动降软编；码率上限防拒编 —— https://blog.gitcode.com/b40a4c52f515306fb2a5d0b749e09476.html
13. CSDN《如何用 WebCodecs 在浏览器里实现高清录屏》（2026-09-02）+《WebCodecs录屏实践》（2026-09-15）：MediaRecorder 格式看运气/码率黑盒/无帧级控制，WebCodecs+mp4-muxer 生产替代方案
14. Chrome 133 默认开启 MediaRecorder HEVC（字节贡献，2024-12 新闻）：Chrome 的 MP4 录制能力 2024 末才逐步落地 —— https://www.herecours.com/news/186443.html
15. 微信格式兼容（多信源交叉）：头条 2026-09-08（微信打不开 WebM/MKV/MOV 实例+解法）；ahelpers 2026-05-27（微信最稳 MP4+H.264+AAC）；bbccb 2026-06-03（微信/微博 WKWebView 拒 WebM/VP8/VP9/AV1）；CSDN 问答 2026-01-13（微信/QQ 内置浏览器 WebM 拒播）；CutFast 2026-06-11（「MP4+H.264 是 2026 年兼容性最大公约数」）
16. Firefox 130 桌面启用 WebCodecs（2024-09 新闻）；Linux Firefox H.264 依赖系统专有解码包（php.cn 2026-06-29）
17. CSDN 2026-09-12（WebGPU/WebTransport/WebCodecs 2026 基线盘点：WebCodecs 接近 Baseline，Safari 26 全支持）——佐证「2026 年 WebCodecs 已是主流可用 API」

*研究方法备注：内置 WebSearch 当日额度耗尽（错误 -429），按降级规则全程改用 zhipu_web_search（search_pro / 微信生态用 search_pro_sogou）+ curl 直拉官方原文（caniuse/MDN BCD/npm registry/WebKit/Apple/mediabunny.dev），关键结论均有官方原文锚点。*
