---
title: 万花筒动图导出（三参数 A↔B 动效 → GIF/视频）
labels: [wayfinder:map]
status: closed
tracker: local-markdown
created: 2026-10-15
closed: 2026-10-16
---

## Destination

给万花筒风格交付「动图导出」：照片缩放/X偏移/Y偏移三参数的 A↔B 状态往返动效（平滑正弦缓动、无缝循环），实时循环预览，GIF + 视频双格式离屏逐帧导出（水印/会员与单图导出同规则）。编码选型研究（视频路径 + GIF 编码器）→ 交互原型 lab 用户过目 → 规格锁定 → 全自动执行入库（通用时间轴内核 + 万花筒动效面板 + 双格式导出 + i18n + 测试 + 验收）→ 本地 commit 合入 main 不 push。

## Notes

- **前图裁决重开声明**：「动态/时间维效果」曾在前几张图被判 out of scope；本图以新目的地对其**仅万花筒范围**重新打开——通用内核做成「参数名→uniform」映射不锁死风格，但本期 UI 只对万花筒开放。
- **制图期已定约束（grilling 2026-10-15，票内不得重开）**：
  - **动画模型 = 每参数独立动效类型（v2，用户判定覆盖制图期 v1 裁决）**：静止 / 往返（起点 A = 左侧滑杆直接编辑、终点 B 独立滑杆）/ 单向漂移（X/Y 专属，速度带方向；缩放无单向——无法无缝循环）。v1 的「A↔B 整体状态快照槽」交互被用户否决，详见 [动效面板原型票](tickets/03-motion-panel-prototype.md)。
  - **缓动 = 平滑正弦**（速度渐起渐停，循环点无顿挫）；默认整循环（去+回）**3 秒**，可调 1–10 秒。
  - **预览 = 实时循环**：开启动效即持续播放（预览渲染源已有 512 降采样，752f5ab），非动效模式保持按需渲染。
  - **格式 = GIF + 视频同交付，GIF 优先保证**；视频编码路径（WebCodecs+mp4 muxer vs MediaRecorder/WebM 等）由研究票定案。
  - **档位 = 预设 + 高级自定义**：GIF 默认 512px/12fps/1 循环；视频默认 720p/30fps/2 循环（视频无播放器自动循环，2 个循环让接收方感知循环）；自定义范围尺寸 256–1024、fps 8–24、时长 1–10s；导出前显示预估体积。
  - **首版不入种子码**（动效是编排层非风格参数；种子码 v1 布局铁律本期零风险）。
  - **导出面板**：进度条（按帧数）+ 预估体积 + 取消按钮；导出中禁用参数编辑；完成后自动下载并留在面板可换格式再导。
  - **水印/会员 = 与单图导出完全同规则**：免费用户逐帧绘制同款平铺水印（T6-25 定稿），会员无水印，判定逻辑复用现有链路。
  - **交互细节 = 原型先行**：HTML lab 给用户过目后才锁 spec（glass-lab 惯例）。
- **域事实**：万花筒 = three.js 片元着色器 [src/shaders/kaleidoscope.frag](../../../src/shaders/kaleidoscope.frag)，动效三参数即 uniforms `uZoom/uCenterX/uCenterY`（另有 uRotation/uSegments/uMirrorMode 等，均非本期动效范围）；2D 画布目前**按需渲染**（无常驻 rAF，App2D 仅一处 rAF 用作微任务 shim），动效预览需引入受控渲染循环；项目**无任何 GIF/视频编码依赖**，纯前端静态站无后端；离屏全尺寸单帧导出链路已存在（offscreenExport，9bc9c02），逐帧渲染有地基；现有 15 风格（tiltshift 末位），本期不加风格。
- **常设偏好（执行票必须遵守）**：设计确认后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增（基线 11 错全在 3D，2D 期望 0）；UI 图标手绘内联 SVG 禁 emoji；浏览器实测按 memory 中 browser-verification-playbook（WebGL 画布自动化验证必须 canvas.toDataURL 直出）。
- **技能说明**：本环境可用技能中无 research / prototype / domain-modeling——研究票以通用 web 搜索子代理代替；原型确认以 HTML lab 代替。
- **搜索工具降级规则**：内置 WebSearch/WebFetch 失败即改用智谱 MCP `zhipu_web_search`（技术调研 search_pro、中文生态 search_pro_sogou），单向降级不回切。
- **Tracker 约定（local-markdown）**：本图自带子目录（map.md + tickets/ + assets/）。票 frontmatter：`labels`（wayfinder:research/prototype/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（票 id 列表，用文件名 stem）。前沿 = open + 无 assignee + blocked-by 全 closed。关票：正文追加 `## Resolution` 记答案，status 改 closed，本图 Decisions so far 加一行指针。

## Decisions so far

- [万花筒动图导出执行入库](tickets/05-execute.md): **spec 8 节全量交付（2026-10-16，本地 main 六连提交未 push：fe89c2c→f1858b1）**——`src/lib/motion/` 内核/写入器/状态机/编排 + MotionExportPanel（lab v2 布局，两壳 bottom 插槽共用）+ App2D 接线（rAF 启停边界/导出中锁参数/水印 decideBatchExport 逐帧平铺）；验收 475/475 全绿、tsc 0 新增、lint 持平 11、build 冒烟 license chunk 不受扰、GIF 512 档 2.62s≤3s、MP4 duration=动效×2、H5 GIF 冒烟过、种子码零变更。执行中四项裁决（8fps→130ms 厘秒取整/GIF 实际时长=帧×delay 为对齐基准/水印走批量链路产出 tiled/headless 软编两门槛留真机取证）与真机取证清单见票 Resolution。

- [万花筒动图导出规格锁定](tickets/04-spec-lock.md): **完整 spec 定稿（grilling 两轮 Q1–Q9 全过）**——视频仅预设 720p/30fps/2 循环 + `canEncodeVideo` 记忆化检测 + 硬编失败 prefer-software 重跑一次 + 兜底 GIF-only；GIF gifenc 两遍管线（8 采样帧全局色板）+ fps 10ms 整除档 + 抖动关；漂移滑杆 ±0.6/s 步 0.01 默认 +0.3/s + GIF ceil 吸附提示行（导出面板 GIF 档）；内核 = `src/lib/motion/` 纯函数 + `animatedUniforms` 映射 + `sample(t)`（余弦往返/线性漂移）；导出期间预览暂停、取消即释放；**H5 本期带双格式**（XWeb 真机冒烟仅取证不阻塞，雾区「H5 补齐」已删）；i18n 18 键 + 3 新绘 SVG；验收数字全锁（详见票内 8 节）。05 执行票解锁为前沿。

- [动效面板+导出面板交互原型——用户判定通过](tickets/03-motion-panel-prototype.md): **v2 交互定稿 = 每参数独立类型**（静止/往返[起点A=左滑杆直改+终点B滑杆]/单向漂移[X/Y 专属、速度±0.6/s 带方向]）；v1 A/B 整体槽被否（覆盖制图期裁决，Notes 已修正）；平滑正弦+默认 3s 观感合格；**漂移×GIF 取舍 = A 提速对齐**（导出时速度 ceil 吸附到整周期倍数 4 uCenter 单位，保证无缝；视频不受限）；256 色目检无异议 → 抖动默认关、FS 升级路径保留。产物 motion-lab.html（真 shader、照片内嵌、拖图替换）+ verify-lab.mjs 冒烟全过（headless 禁 swiftshader 参数）。

- [纯前端视频导出编码路径选型](tickets/01-video-codec-research.md): [research-video-codec.md](assets/research-video-codec.md) 落盘——**A 主路径 WebCodecs VideoEncoder(H.264)+mediabunny 封 MP4**（显式时间戳+Promise 背压，渲一帧喂一帧；mp4-muxer 已官方弃用，后继 mediabunny 1.61.4 零依赖 ~17.3kB）；**B 兜底 检测失败→GIF-only 提示，不产 WebM**（微信/QQ 拒播）；MediaRecorder 否决（帧时序不可控/0.9x 变速/黑盒）。勘误：Safari 16.4 起即有 VideoEncoder 视频侧，**桌面 Safari 不受限**。量级：720p/180 帧桌面硬编 0.3–1.5s、中端手机 2–6s，流式喂帧在飞仅 ~4–10MiB，禁全帧缓存。移动端：**H5 值得带视频**（iOS≥16.4/Android≥94），遗留微信 XWeb 真机冒烟 + 硬编拒编重试分支给规格票。
- [GIF 编码器选型与 256 色量化质量](tickets/02-gif-encoder-research.md): [research-gif-encoder.md](assets/research-gif-encoder.md) 落盘——**A 定案 gifenc 1.0.3 + 全局调色板**（均匀抽 8 帧联合采样 `quantize(256,rgb565)`，首帧写 GCT 后续帧不传 palette 复用，repeat:0）——帧间闪烁**结构性消除**（回读实测 localCT=0/loop=0）；实测 512×36 帧 274ms、1024×72 帧 983ms 主线程，3.9KB gzip 零依赖 MIT，流式逐帧与 offscreenExport 同构、内存<50MB；逐帧量化禁用（慢 ~5 倍+闪烁）。弱点无内置抖动→升级路径自研 ~40 行 Floyd–Steinberg（体积 +80~100%、耗时 ×3~5，1024 档届时走 vite worker）。B 备选 modern-gif（质量好但 1024 档 14.6–38s+288MB 缓存，仅 512 档可替）。gif.js 停更十年/gifucts 是解码器（转作回读断言）/gifski AGPL 排除。fps 档对齐 10ms 粒度（12fps 实写 80ms）、预估体积按每帧 LZW 字节实时累计、混淆链零交集均已核实。

## Not yet specified

（无——全部决策已闭，路线已清，仅剩执行。）

## Out of scope

- **动效入种子码 v2**：制图期裁定首版不入码；未来视真实使用诉求另立新图（届时须 bump 种子码版本并兼容旧码，动 v1 布局铁律）。
- **批量动图导出**：体积/耗时数倍于单图，等单图链路真实反馈再立新项（制图期裁定）。
- **其他风格的动效 UI**：通用时间轴内核预留映射行，但本期 UI 仅万花筒开放；其他风格接入（玻璃扭曲强度、棱镜色散等）另立新图。
- 沿用前图裁决：shader 风格 SVG 导出（现状回退 PNG）、3D 侧效果、per-style 会员收费（付费墙只在导出水印）。
