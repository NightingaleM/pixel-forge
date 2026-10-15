---
title: 万花筒动图导出规格锁定
ticket: 04-spec-lock
labels: [wayfinder:grilling]
status: closed
assignee: main
blocked-by: [01-video-codec-research, 02-gif-encoder-research, 03-motion-panel-prototype]
date: 2026-10-15
---

## Question

汇总两份编码研究 + 原型 lab 用户判定，锁定完整可执行 spec。需要收口的决策：

1. **视频编码路径定案**（主路径 + 兜底 + 特性检测策略；桌面 Safari 受限时的兜底策略从雾区收口）。
2. **GIF 编码器 + 量化策略定案**（库、调色板策略、抖动、LOOP 元数据）。
3. **交互布局定稿**（以 lab v2 用户判定为准：每参数独立类型[静止/往返/漂移]、起点 A=左滑杆直改、终点 B/速度独立滑杆、导出面板信息架构）。需补定：漂移速度滑杆的范围与默认档（lab 用 ±0.6/s 步 0.01）、GIF 导出时速度 ceil 吸附的数值口径与 UI 表达（对齐提示文案）、时间轴内核须同时支持 per-param 往返(相位驱动)与漂移(积分驱动)两种驱动。
4. **通用时间轴内核 API**：「参数名→uniform」映射的形状（供未来其他风格接入零成本）、驱动循环与预览渲染循环的启停边界、按需渲染的保持。
5. **导出管线规格**：离屏逐帧渲染（复用 offscreenExport 地基）→ 编码器喂帧编排（主线程让出策略）→ blob 下载；水印逐帧绘制规则（同单图 T6-25 平铺水印，复用判定链路）。
6. **i18n 键清单**（zh/en 同步）与 UI 图标清单（内联 SVG）。
7. **验收标准**：测试基线（现 387）、lint 持平 11、tsc、浏览器实测（playbook：canvas.toDataURL 直出）、导出产物真文件抽验（GIF 循环元数据/视频可播）、性能门槛（编码期间 UI 可取消、预览不卡）。
8. **H5 本期带不带**（依研究票移动端矩阵裁决；不带则明确「H5 暂不支持」的 UI 表达，补齐方案留雾区）。

## Resolution

**规格锁定完成（2026-10-15，grilling 两轮 Q1–Q9，用户全按推荐通过、共识确认）。** 完整 spec 如下，执行票（05）照此全自动执行。

### 1. 视频编码路径（研究票定案 + 本轮成文）

- 主路径：WebCodecs `VideoEncoder`（H.264/avc）+ **mediabunny** `Mp4OutputFormat({ fastStart: 'in-memory' })` + `BufferTarget`；依赖 mediabunny 1.61.4（~17.3 kB gzip，MPL-2.0，走普通 vendor chunk 不混淆）。
- 特性检测：`canEncodeVideo('avc', { 1280×720, 30fps, Quality({bitrate: 8e6}) })`，**会话级记忆化**（同参数只问一次）；检测不过 → 导出面板视频档禁用 + `animExport.videoUnsupported` 文案，**不产 WebM**。
- 编码配置：不指定 `hardwareAcceleration`（no-preference）；码率 constant **8 Mbps**（封顶 20）；`keyFrameInterval` 2s（库默认）；每帧 `CanvasSource.add(ts, dur)` **await 背压**，渲一帧喂一帧，禁全帧缓存。
- 中途硬编失败：以 `prefer-software` 同配置重建 Output 重跑一次；再失败 → 报错并提示改用 GIF。
- **档位：视频仅预设 720p / 30fps / 2 循环**（时长 = 动效时长 × 2 自动推导）；「高级自定义」只作用于 GIF。

### 2. GIF 编码（研究票定案）

- **gifenc 1.0.3**（3.9 kB gzip、零依赖、MIT），**全局调色板两遍管线**：pass1 均匀渲 8 采样帧（**含水印后像素**）→ 联合 `quantize(rgba, 256, 'rgb565')`；pass2 首帧 `writeFrame` 传 palette 写 GCT、后续帧不传 palette 复用，`repeat: 0`（无限循环）。
- fps 档取 10ms 整除（12fps 实写 80ms = 12.5fps）。
- 抖动**默认关**；自研 FS 升级路径留档不实施（体积 ×1.9、耗时 ×3–5、「尺寸>512 且抖动开才 worker」阶梯本期用不上）。
- 档位：默认 **512px / 12fps / 1 循环**；自定义尺寸 256–1024、fps 8–24（10ms 整除档）、时长 = 动效时长。

### 3. 交互（原型 v2 定稿 + 本轮补定）

- 每参数独立动效类型：**静止 / 往返**（起点 A = 左侧滑杆直接编辑、终点 B 独立滑杆）/ **单向漂移**（X/Y 专属）。
- **漂移速度滑杆：范围 ±0.6/s、步 0.01、默认 +0.3/s**。
- **GIF 速度吸附**：导出时 ceil 到最近整周期倍数（周期 = 4 uCenter 单位，T = GIF 时长），保证非零且无缝；**UI 表达 = 导出面板 GIF 档下提示行** `animExport.gifAligned`（显示对齐后 ≈X.XX/s）；预览保持滑杆速度所见即所调；视频不受限。
- 平滑正弦缓动；默认整循环 3s、可调 1–10s。
- 实时循环预览（渲染源 512 降采样，752f5ab）；非动效模式保持按需渲染。
- 导出面板：进度（按帧数）+ 预估体积 + 取消；导出中禁用参数编辑；完成自动下载、留在面板可换格式再导。

### 4. 通用时间轴内核

- 新模块 `src/lib/motion/`：纯函数、零 React 依赖。
- 风格侧仅声明映射表 `animatedUniforms = { zoom:'uZoom', centerX:'uCenterX', centerY:'uCenterY' }`——未来其他风格接入 = 加一行映射，零成本。
- 每参数 `MotionSpec = {type:'static'} | {type:'pingpong', a, b} | {type:'drift', speed}`。
- 内核 `sample(t) → Record<参数名, 值>`：pingpong 余弦相位 `a + (b-a)·(1−cos 2πt/T)/2`（t=T 回 a，天然闭合）；drift 线性积分 `v₀ + speed·t`。
- 预览 rAF 由 App2D 持有：**任一参数非静止才启动**，全静止/切风格即停、回按需渲染。
- 导出用同一 `sample()`，t = 帧号/fps 确定性反推——预览与导出共享一条数学。

### 5. 导出管线编排

- 共用：offscreenExport 离屏逐帧渲 → 免费用户**逐帧绘制平铺水印**（T6-25 同款、复用现有会员判定链路）→ 喂编码器；会员无水印。
- GIF：pass1 采样量化 → pass2 逐帧 `writeFrame`，每帧 await 让出主线程；**预估体积 = pass2 首帧实际 LZW 字节 × 总帧数起步，随编码实时刷新为真实累计**。
- 视频：渲 → 水印 → `add()` await 背压 → `finalize()` → blob；预估体积 = 码率 × 时长直接算。
- 取消：视频 `output.cancel()`、GIF 中止循环并释放，回 UI 可重开；**导出期间预览循环暂停**。
- 文件命名沿用单图导出现有规则，后缀 `.gif` / `.mp4`。

### 6. H5

- **本期带**：GIF + 视频双格式同桌面；视频检测失败自动 GIF-only（即检测的天然行为）。
- 微信 Android XWeb 真机冒烟（`canEncodeVideo('avc')` 实测）列入执行票验收，**结果无论成败仅取证、不阻塞合入**。
- map 雾区「H5 动效导出补齐方案」项随之删除。

### 7. i18n 与图标

- 新增约 18 键（zh/en 同步），清单按 grilling Q7：`motion.title`、`motion.type.static/pingpong/drift`、`motion.endB`、`motion.speed`、`motion.duration`、`animExport.title`、`animExport.format.gif/video`、`animExport.custom`、`animExport.size`、`animExport.fps`、`animExport.estimated`、`animExport.exporting`、`animExport.cancel`、`animExport.reexport`、`animExport.videoUnsupported`、`animExport.gifAligned`；参数名复用现有万花筒键。
- 新绘 3 个内联 SVG：动效面板入口（正弦波+循环箭头）、GIF 格式标识、视频格式标识（播放三角）；下载/取消复用现有组件图标；禁 emoji。

### 8. 验收标准（执行票照此）

- **单测**（vitest，基线 387 + 新增全过）：`sample()` 数学闭合（pingpong t=0 与 t=T 严格相等、drift 积分线性）、GIF 速度吸附 ceil 公式（含恰好整周期不上跳的边界）、视频特性检测记忆化、导出状态机（进度/取消/换格式再导）。
- **产物真文件抽验**：gifuct-js 回读断言 `gct=true / lct=0 / loop=0 / 帧数 / delay`；MP4 用 headless `<video>` 断言 `loadedmetadata` 且 `duration ≈ 动效时长×2`。
- **浏览器实测**：按 browser-verification-playbook（vite dev + puppeteer-core + Edge headless + swiftshader 参数），canvas.toDataURL 直出截图复核。
- **工程门槛**：lint 持平 11（2D 期望 0）、tsc 0 新增、`npm run build` 冒烟（混淆链不碰新依赖 chunk）。
- **性能门槛**：桌面 512 GIF ≤3s、720p/6s 视频 ≤5s；取消点击后 ≤100ms 停止；导出中进度条持续走动（UI 不冻结）。
- **种子码零变更**：现有种子码测试全过即作断言。
- **执行纪律**：全自动不中途请示；本地 commit 合入 main、不主动 push。
