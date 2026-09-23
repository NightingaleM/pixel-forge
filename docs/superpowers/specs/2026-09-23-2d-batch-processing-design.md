# 2D 批量图片处理 设计文档

日期:2026-09-23
状态:已确认(交互形态、种子策略、结果画廊、打包方式、面板形态均经用户逐项确认)

## 背景与目标

2D 部分目前是单图工作流:上传一张图 → 选风格 → 调参(实时预览)→ 导出。本功能新增批量处理:把调好的效果(种子)应用到多张图,一次性打包下载。

商业背景:此功能后期计划做成付费点。交互设计已为此预留门槛位置。

核心概念澄清:本应用的"种子"是完整状态编码串(`seedCodec.ts`:风格 + 数值参数 + 颜色),不是随机数种子。"统一种子" = 同一套风格参数应用到所有图。种子不携带 text/font/toggle/select 参数。

## 交互设计(方案 C:调参后送批量)

两阶段模型:**单图界面调好效果 → 送入批量队列 → 批量面板处理 → 画廊 → 打包下载**。

选择理由(相对另两个候选):
- 独立工作台无调参预览,用户不会为盲处理付费;
- 单图工作流内嵌多图会让全部 state 产生歧义,且回归风险和付费墙位置都不理想;
- 方案 C 把调参(免费、体验完整)与量产(付费、规模化)切在价值链正确位置,且每行种子复用 seedCodec,批量面板完全不需要参数 UI。

### 入口与快照

- ActionBar 新增"批量应用"按钮(内联 SVG 图标,遵守项目"禁 emoji、手绘 SVG"规范)。
- 点击 = 快照当前完整状态 `{ styleId, params, textParams, fontParams }` + 当前图作为第一行(可移除),统一种子位预填当前种子码,打开 BatchPanel 落在配置 tab。
- 快照语义:送出后单图界面继续调参不影响已送出的任务,只影响下次点击。面板已开时再点"批量应用"→ 确认对话"用当前状态替换基线?"(保留行,替换风格/参数/字体基线与种子解析;已生成结果的行保持结果不动,重跑后才按新基线重生)。

### 种子策略

- 批量面板顶部全局开关:**统一种子 / 每图独立**。
- 统一模式:面板顶部一个种子位(可编辑 + 骰子 + 复制),行内不显示种子;所有行共用该值。
- 独立模式:每行一个可编辑种子输入框 + 骰子按钮(随机该行),另有"全部随机"一键重骰所有行。
- 画廊/结果中的"重骰重跑":该行切为独立种子(新随机码),不再跟随统一值——直觉上"这一张换个效果"。
- 骰子语义:以任务基线 params 为底随机 seedable 参数(toggle/select 保留现值;跳过 `SKIP_RANDOM_UNIFORMS`:uCenterX/uCenterY/uRotation/uAngle 随机会产生不可用结果;color 均匀随机 RGB),然后 `encodeSeed` 得到种子码。提炼为可复用纯函数,App2D 的"随机"按钮与批量骰子共用同一逻辑。
- 种子解析:每行最终渲染参数 = 基线 merge `decodeSeed(行种子)`(与 `handleApplySeed` 的 mergeWithDefaults 语义一致:seedable 项被种子覆盖,text/font/toggle/select 走基线)。字体是 FontFace 对象引用,同 document 直接可用。

### 结果呈现:完整画廊

- BatchPanel 为**双 tab** 结构(自由切换,不强制阶段):配置 tab + 结果 tab。
- 配置 tab:紧凑行列表(48px 缩略图 + 文件名 + 尺寸 + 移除 + 种子位)。顶部:添加图片、格式选择、种子策略开关、"开始处理 (n)"。独立模式显示"全部随机"。
- 结果 tab:大缩略图网格画廊。总进度条 + n/m + 失败计数。格子状态:processing=spinner、done=缩略图(渐入)、failed=重试按钮。处理开始后自动切到结果 tab,画廊实时生长。
- 每行/格子操作:done 的可"重骰重跑"(新种子重处理)与单张下载;failed 的可重试。
- 灯箱:点击画廊格子全屏遮罩,大图 + `←/→` 导航 + Esc 关闭,底部显示 `文件名 · 种子码 · 格式`,右上单张下载。

### 打包下载

- 引入 `fflate`(MIT,gzip 后约 8KB)客户端 `zipSync` 打包。
- 格式在送批量/配置 tab 选一次,整批统一:PNG(默认)/ JPG;ASCII 风格(canvas2d)额外支持 SVG。
- ZIP 名:`pixel-forge-batch.zip`;条目名:`{styleId}_{原文件名去扩展}_{种子码}.{ext}`;同名冲突自动加 `(2)` 后缀。
- ZIP 只含成功项。
- JPG 黑底合成:canvas2d 模式且 `uShowBg !== 1` 时先合成黑底再导出(提炼现有 App2D 逻辑共用)。
- SVG 导出走 `AsciiCanvasRenderer.exportSvg(family)`,family 取基线 fontParams 或 'monospace'。

### 面板形态

- BatchPanel 用项目现有可拖拽浮动面板体系(复用 useDraggable + panelPosStore,新 storageKey `pixel-forge.panelPos.batch.v1`),与 ParamPanel/PresetPanel 同语言。
- 可最小化([—],收成小条,任务后台继续跑);关闭([×])即终止:进度中关闭弹确认对话,确认后终止队列 + revoke 全部 objectURL + 丢弃结果。
- 处理中用户可关/最小化面板回单图界面继续调参,批量后台继续。

## 架构与数据流

```
App2D(现有)
  │ "批量应用"(快照状态 + 当前图)
  ▼
batchJob state(App2D 持有):{ 基线快照, 行[], 种子策略, 格式 }
  ▼
BatchPanel(浮动面板,双 tab)
  │ "开始处理" → 逐行生成任务(种子解析为最终参数)
  ▼
runBatch(lib/batch,纯 TS,不碰 React)
  │ 顺序处理:renderImage() 离屏渲染 → toBlob/exportSvg
  │ 逐行 await 下一帧让出主线程(处理时不卡单图调参)
  │ 进度回调 → BatchPanel 更新行状态
  ▼
结果画廊(objectURL)→ 灯箱 / 单张下载 / fflate ZIP
```

### 共享渲染核心(关键重构)

现"渲染一张图"的逻辑在 `App2D.renderWithStyle`(闭包捕获 image/brightest,依赖 App2D refs)。提炼:

- `lib/renderImage.ts`:`renderImage(renderer, asciiRenderer, canvas, image, styleDef, params, textParams, fontParams, brightest)` — 接收 renderer 实例,内含 canvas2d/ASCII 分支与 shader 分支。App2D 传自己的 rendererRef,批量传离屏实例。
- `buildRenderParams(styleDef, params, textParams, brightest)` 纯函数:参数合并、颜色 hex 拆 R/G/B、animelight 自动光源覆盖(`uGodRayAuto === 1` 且 brightest 时覆盖 uCenterX/Y)、文字图集计数——全部纯计算,单测覆盖。这是提炼等价性的主要保障。
- App2D 的 `renderWithStyle` 改为薄壳调用共享核心(唯一的现有逻辑改动)。
- JPG 黑底合成、导出 canvas 选择逻辑同样提炼共用。

### 渲染正确性

- 分辨率沿用现有策略:原图尺寸,上限 `min(MAX_TEXTURE_SIZE, 2048)`。批量输出与单图导出同质量。
- brightPoint 每图独立重检测(animelight 自动光源正确)。
- ASCII 字符随机抖动用 Math.random,重跑同种子会换抖动——与单图界面重渲染行为一致,接受。

### 内存与生命周期

- 每行持有:原图 HTMLImageElement 引用 + 结果 Blob + 一个 objectURL(缩略图/画廊/灯箱共用)。
- 行移除、面板关闭、job 重置时 revoke;统一走 `revokeRowResults` 辅助。
- 硬上限 20 行(超限禁用上传并提示)。Blob 有磁盘后备,峰值可接受。
- 取消:当前行跑完即停(渲染同步),剩余行回 pending,已完成保留。

## 状态机(行)

```
pending ──→ processing ──→ done
   ↑            │             │
   │            ▼             │ 重骰(新种子)或重跑(同种子)
   └────── failed ←──┘        └──→ processing
```

单行失败不阻塞其他行。

## 付费预留

门槛收敛在一个 `canRunBatch(count)` 检查(UI 位置:"开始处理"按钮),当前恒返回 true。后期接授权/配额只改此函数与提示文案。

## 错误处理

| 场景 | 行为 |
|---|---|
| 上传文件解码失败 | 该行不加入,toast 提示文件名 |
| 单行渲染失败(toBlob null 等) | 行标 failed,可重试,不阻塞 |
| WebGL context lost | 队列暂停,已有结果保留;"重试失败项"重建离屏 renderer |
| 巨图(> MAX_TEXTURE_SIZE) | 沿用现有等比缩放,无新代码 |
| ZIP 失败 | 提示重试,结果 blob 不丢 |
| 进度中关闭面板 | 确认对话 → 终止 + revoke + 丢弃 |

## 测试策略

项目现有测试全在 lib 层(vitest),保持一致;渲染调用依赖 WebGL 不进单测:

- `buildRenderParams` 纯函数:参数合并/颜色拆分/光源覆盖/图集计数断言。
- `batchJob` 纯逻辑:统一/独立模式行参数解析、骰子(注入伪随机)、ZIP 命名与冲突后缀。
- `runBatch` 可测部分:取消语义、失败不阻塞、逐行让出;ZIP 用 fflate `unzipSync` 解回验证。
- 12 个风格逐一手测单图渲染确认提炼无漂移。
- lint 基线 11 个既有错误,不新增。

## 文件清单

新增:
- `src/lib/renderImage.ts` — 共享渲染核心 + `buildRenderParams`
- `src/lib/batch/batchJob.ts` — 行/任务类型、种子策略应用、骰子、导出命名(纯逻辑)
- `src/lib/batch/runBatch.ts` — 队列执行器(离屏 renderer 生命周期、逐行处理、取消)
- `src/components/BatchPanel.tsx` — 双 tab 浮动面板
- `src/components/Lightbox.tsx` — 灯箱
- 对应 `*.test.ts`;i18n 双语 key;样式(index.css 现有体系)

修改:
- `src/components/App2D.tsx` — renderWithStyle 改调共享核心;batchJob state;挂 BatchPanel
- `src/components/ActionBar.tsx` — "批量应用"按钮
- `package.json` — fflate 依赖
