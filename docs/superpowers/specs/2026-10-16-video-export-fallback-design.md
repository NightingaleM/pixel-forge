# 视频导出兜底层设计（MediaRecorder 兼容路径）

日期：2026-10-16 · 状态：已与用户对齐（方案 A，含降级预案）

## 背景

万花筒动图导出的视频档目前只有 WebCodecs/mediabunny MP4 一条路，探测不过即灰字
「此浏览器不支持视频导出」。真机/环境取证（scripts/verify-video-support.mjs）确认：

- **根因**：`VideoEncoder` 是 SecureContext 专属 API。`http://192.168.x.x`（局域网 IP）
  等非安全上下文里 Chrome 直接不暴露该接口，与浏览器版本无关；
  localhost/file:// 同机同浏览器全绿（含 High Profile + 纯软编偏好）。
- 同一非安全上下文里 `MediaRecorder` + `canvas.captureStream` +
  `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')` 全部可用（Chrome 155 实测）。

## 目标 / 非目标

| | 内容 |
|---|---|
| 目标 | H5+（微信内置浏览器为主）内能导出视频：WebCodecs 不可用时自动降级 MediaRecorder 实时录制，MP4 优先、WebM 兜底 |
| 非目标 | 不改 WebCodecs 主路径行为；不引入 WASM 编码器（除非触发降级预案）；视频仍仅 720p/30fps/2 循环预设档 |

## 用户裁决记录

1. 兜底覆盖环境：**H5+ App（移动端 WebView/微信）** 为验收目标（技术上同时覆盖局域网 IP 访问）。
2. WebView 上若 MediaRecorder 只能产 WebM：**放开 WebM 兜底**（04-spec-lock「不产 WebM」铁律放宽为「仅兜底层允许，主路径仍不产」）。
3. 方案 A 优先；真机取证失败则降级方案 C（WASM，**仅桌面**），届时移动端放弃视频导出（改 GIF 引导文案）。

## 设计

### 1. 探测层级

新文件 `src/lib/motion/videoTier.ts`：

```ts
export type VideoTier = 'webcodecs-mp4' | 'mediarecorder-mp4' | 'mediarecorder-webm' | 'none'
export async function probeVideoTier(opts?: { probeWebCodecs?, probeRecorder? }): Promise<VideoTier>
```

- 优先级：现有 `probeVideoSupport`（mediabunny `canEncodeVideo('avc', 1280×720@30/8Mbps)`）
  → `'webcodecs-mp4'`；否则 `typeof MediaRecorder !== 'undefined'` 且
  `HTMLCanvasElement.prototype.captureStream` 存在时按
  `isTypeSupported('video/mp4;codecs=avc1')` → `'mediarecorder-mp4'`，
  退 `'video/webm;codecs=vp9'` → `'video/webm;codecs=vp8'` → `'mediarecorder-webm'`；
  全落空 → `'none'`。
- 会话级记忆化（沿用 videoWriter 现有模式，同参数只问一次）。
- 探测函数可注入（单测 mock），默认真链路。
- App2D：`videoSupported: boolean | null` 状态替换为 `videoTier: VideoTier | null`
  （null=检测中）；触发时机不变（万花筒 + 有图 + 面板可见）。
- 面板视频档禁用条件：`videoTier === 'none'`。

### 2. MediaRecorder writer

新文件 `src/lib/motion/videoRecorder.ts`：

```ts
export async function encodeViaMediaRecorder(opts: {
  canvas: HTMLCanvasElement            // 导出编排现有 staging 画布（含水印）
  mimeType: string                     // 'video/mp4;codecs=avc1' | 'video/webm;codecs=vp9|vp8'
  fps: number; durationSec: number; frameCount: number
  drawFrame: (t: number, index: number) => Promise<void> | void
  onProgress?: (framesDone: number) => void
  isCancelled?: () => boolean
}): Promise<Blob>
```

- `canvas.captureStream(fps)` + `new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8e6 })`。
- **墙钟 rAF 驱动**：`start = performance.now()`，每 rAF 计算 `t=(now-start)/1000`，
  `t >= durationSec` 前逐帧 `drawFrame(t, round(t*fps))`（index 0 走 renderImage 全参数
  语义，由编排层 drawAt 保证）；结束后补画末帧再 `stop()`。
- 进度：`onProgress(min(frameCount, round(t*fps)))`，framesDone/framesTotal 语义沿用。
- 取消：每 rAF 查 `isCancelled()` → `stop()` 丢弃 chunks → 抛 `ExportCancelledError`。
- 页面切走 rAF 停转 → 画面冻结段（墙钟继续），用面板提示文案缓解，不做机械补偿。

### 3. 导出编排接线

`src/lib/motion/exportAnimation.ts`：

- `RunAnimationExportOptions` 加可选 `videoTier?: VideoTier`，默认 `'webcodecs-mp4'`
  （旧调用与现有测试零破坏）。
- video 分支按 tier 分发：`webcodecs-mp4` → 现有 `encodeMp4`；其余 → `encodeViaMediaRecorder`。
- `AnimationExportResult.ext` 扩为 `'gif' | 'mp4' | 'webm'`；blob MIME 与 tier 匹配。
- 体积预估复用 `estimateVideoBytesPre`（码率×时长）。

### 4. 面板与文案

`MotionExportPanel.tsx` + i18n（zh/en 同步）：

- `MotionExportView.videoSupported: boolean | null` → `videoTier: VideoTier | null`。
- 非 webcodecs tier 时格式描述行追加徽标 `· MP4` / `· WebM`。
- mediarecorder tier 导出中的 meta 行追加提示：实时录制，请保持页面可见。
- `animExport.videoUnsupported` 文案改为「当前环境无法导出视频，请改用 GIF」
  （去掉「浏览器不支持」的错误归因；仅两层探测全落空才出现）。
- 新增 i18n 键约 2 个（录制提示、徽标若需），遵循现有 animExport 命名段。

### 5. 微信/移动交付

- `App2D.downloadBlob`：视频（ext mp4/webm）在移动端一律 `forceLightbox`（对齐 svg 惯例，
  `downloadFlow.planDownload` 签名不变）；桌面维持 a[download]。
- `Lightbox.tsx`：`LightboxItem` 加 `kind?: 'image' | 'video'`（默认 image）；
  video 渲染 `<video controls playsInline loop>`，长按保存提示条沿用。
- 自洽性：iOS 只会落 `mediarecorder-mp4`（Safari 无 WebM 录制能力），
  WebM 产物只出现在能播 WebM 的环境（Android/桌面）。

## 测试计划

| 层 | 内容 |
|---|---|
| 单测（vitest，mock 探测/MediaRecorder + fake timers） | probeVideoTier 层级判定全分支 + 记忆化；encodeViaMediaRecorder 状态机（chunks 聚合/墙钟结束/取消抛错）；exportAnimation tier 分发；GIF 用例零回归；面板禁用条件随 tier |
| 浏览器测试 | vite `--host` 经 http://局域网IP 打开（非安全上下文，基建已在 scripts/verify-video-support.mjs 验证）→ 断言 probeVideoTier 落 `mediarecorder-mp4`、导出真产物 ftyp 魔数、页内 duration ≈ 目标 ±0.5s（MediaRecorder 时戳精度放宽）；现有 localhost 安全上下文用例断言 tier=`webcodecs-mp4` |
| 真机取证（交付门槛） | 见下节清单 |

## 真机取证清单（H5+）

1. 微信 Android：tier 探测结果（预期 mr-mp4 或 webm）、导出成功率、产物可播。
2. **长按 `<video>` 保存菜单可用性**——不可用则 hint 降级为「在浏览器中打开」引导（同 ZIP 惯例），此项必须在交付前定案。
3. 微信 iOS：预期 `mediarecorder-mp4`；长按保存、相册导入。
4. 移动 Chrome Android：灯箱长按 / 下载路径。
5. WebM 产物 duration 元数据缺失（Chrome MediaRecorder 已知坑）：lightbox 播放与 loop 是否正常。
6. 真机 720p30 实时渲染 + 录制的掉帧观察（产物 fps 抽验）。

## 风险与预案

| 风险 | 缓解 |
|---|---|
| 长按保存视频在微信不可用 | hint 改引导外部浏览器（预案已备） |
| 真机掉帧严重 / 导出失败 | 触发降级预案：方案 C（WASM）仅桌面，移动端移除视频档改「请改用 GIF」 |
| WebM duration 元数据缺失 | loop 播放场景无感；真机取证确认，必要时前端补 mux 修 duration（另立票） |
| 导出用时=片长（≤20s 墙钟） | 提示文案明示「实时录制」 |

## 涉及文件

`src/lib/motion/videoTier.ts`（新）、`src/lib/motion/videoRecorder.ts`（新）、
`src/lib/motion/exportAnimation.ts`、`src/components/App2D.tsx`、
`src/components/MotionExportPanel.tsx`、`src/components/Lightbox.tsx`、
`src/i18n/zh.json`、`src/i18n/en.json`、
`src/lib/motion/videoTier.test.ts`（新）、`src/lib/motion/videoRecorder.test.ts`（新）、
`src/lib/motion/exportAnimation.browser.test.ts`（扩展）。
