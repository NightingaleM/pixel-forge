# 2D 批量交互重构 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 批量入口重构:上传即多选批量,图片列表放主界面底部栏,主画布实时预览选中行,ParamPanel 编辑即所选所见。

**Architecture:** v1 的浮动面板行列表模型退役,行状态上移 App2D(`images[] + selectedIndex`);整批共享基线(`base*`)+ 选中行工作副本(`params/textParams`)双状态,独立模式行种子懒同步;ImageStrip 承载底部图片栏;BatchPanel 瘦身为纯视图(配置+画廊)。renderImage/runBatch/Lightbox/ZIP/seedCodec 全部复用。

**Tech Stack:** React 19 + TypeScript + vitest(无新依赖)。

**Spec:** `docs/superpowers/specs/2026-09-23-2d-batch-interaction-v2-design.md`(v1 spec:2026-09-23-2d-batch-processing-design.md,已实现部分以代码现状为准)

## Global Constraints

- UI 图标内联 SVG 手绘,禁 emoji。
- lint 基线 11 个预先存在错误(均在 3D 文件),不新增。
- i18n:zh.json 与 en.json key 对齐。
- 测试只写 lib 层(vitest);渲染调用不进单测。
- 注释中文,解释"为什么"。
- 每任务 `npm test` 全绿再提交;尾注 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- **单图模式(≤1 张图)零回归**:渲染、参数、种子、预设、导出、比较、关闭行为与现状一致。
- 行种子限定当前风格(SeedBar 粘贴异风格种子拒绝提示);`renderedStyleId` 字段保留但恒等于 activeStyle。
- 20 行上限、canRunBatch 付费预留、objectURL 生命周期沿用 v1。

---

### Task 1: 行状态纯逻辑 `lib/batch/imageList.ts`

**Files:**
- Create: `src/lib/batch/imageList.ts`
- Test: `src/lib/batch/imageList.test.ts`

**Interfaces:**
- Consumes: `encodeSeed/decodeSeed`(seedCodec)、`getStyle`(StyleRegistry)、`mergeWithDefaults`(presetStore)、`randomSeed/randomizeParams`(randomSeed)、v1 `batchJob.ts` 的 `BatchFormat`
- Produces:
  - `interface BatchImage { id: string; fileName: string; image: HTMLImageElement; seed: string | null; status: 'pending'|'processing'|'done'|'failed'; blob: Blob | null; objectUrl: string | null; error: string | null; renderedSeed: string | null; renderedStyleId: import('../../types').StyleId | null }`(顶部 `import type { StyleId }`)
  - `interface BatchBase { params: Record<string, number>; textParams: Record<string, string> }`
  - `rowEffectiveSeed(img: BatchImage, base: BatchBase, def: StyleDefinition): string` — null 时编码基线
  - `syncRowSeed(img: BatchImage, def: StyleDefinition, working: { params: Record<string, number>; textParams: Record<string, string> }): BatchImage` — 工作副本编回行种子(返回新对象,seed 恒非 null)
  - `loadWorking(img: BatchImage, base: BatchBase, def: StyleDefinition): { params: Record<string, number>; textParams: Record<string, string> }` — 行种子解析为工作副本(null/解析失败回基线;与 handleApplySeed 同 merge 语义,但 styleId 用 def——种子异风格时 decode 仍可用其数值,由调用方在上游拒绝异风格输入,这里只做容错解析)
  - `randomizeRowSeed(img: BatchImage, def: StyleDefinition, base: BatchBase, rand?: () => number): BatchImage`
  - `snapshotTaskSeeds(images: BatchImage[], base: BatchBase, def: StyleDefinition): { id: string; seed: string }[]` — 快照:每行 effective seed(开始处理/懒同步后调用)
  - `seedMatchesStyle(seed: string, styleId: StyleId): boolean` — SeedBar 粘贴校验用

- [ ] **Step 1: 写失败测试**(覆盖:null 行编码基线;sync 编回后 decode 往返一致;load 对 null 行回基线、对有 seed 行解析、对非法 seed 回基线;randomizeRowSeed 产出合法种子;snapshotTaskSeeds 顺序与 id 保留;seedMatchesStyle 本风格 true 异风格 false)

```ts
// src/lib/batch/imageList.test.ts —— 用 halftone 造基线与种子(encodeSeed),参考 batchJob.test.ts 的构造方式
// 断言示例:
//   rowEffectiveSeed(nullSeed 行) === encodeSeed('halftone', base.params, def, base.textParams)
//   loadWorking(syncRowSeed(row, def, working)) 的 params.textParams 与 working 深等(mergeWithDefaults 会补齐,断言 working 中的键值保留)
//   seedMatchesStyle(encodeSeed('popart',...), 'halftone') === false
```

(测试具体代码由实现者按上述断言清单编写,每条断言对应一个行为;TDD 先红后绿。)

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run src/lib/batch/imageList.test.ts` FAIL
- [ ] **Step 3: 实现 imageList.ts**(每函数 3-8 行,组合 encodeSeed/decodeSeed/mergeWithDefaults/randomSeed;seed 为 null 或非法的容错一律回基线,不抛错)
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: 提交** `feat: add batch image list state logic`

---

### Task 2: 多图地基(ImageUploader 多选 + ImageStrip + App2D 三态)

**Files:**
- Modify: `src/components/ImageUploader.tsx`(multiple + 回调改 `onImagesLoad(imgs: HTMLImageElement[], names: string[])`)
- Create: `src/components/ImageStrip.tsx`
- Modify: `src/components/App2D.tsx`、`src/styles/global.css`、i18n zh/en

**Interfaces:**
- Consumes: Task 1 `BatchImage`;v1 `randomId`(src/lib/randomId.ts)
- Produces:
  - `ImageStripProps { images: BatchImage[]; selectedIndex: number; mode: 'single'|'batch'; atLimit: boolean; onSelect: (i: number) => void; onRemove: (i: number) => void; onAddFiles: (files: FileList | File[]) => void; testImages: { src: string; label: string }[]; onTestImage: (src: string) => void }`
  - App2D 状态:`images: BatchImage[]`、`selectedIndex: number`;派生 `image = images[selectedIndex]?.image ?? null`;`isBatch = images.length > 1`

**行为规格(App2D):**
- 上传 1 张:现单图模式逐字保持(`handleImageLoad` 路径改走 images 数组,但所有既有 handler 语义不变;imageInfo 取选中行)。
- 上传 ≥2 张:批量模式;主画布渲染选中行(v1 渲染 effect 的 `image` 来源改为派生值,其余不动);CompareSlider 传选中行 image。
- ImageStrip:底部替代 `test-images-bar` 区域;缩略图 `image.src`(原图 dataURL,不建 objectURL);选中高亮;hover 移除按钮(内联 SVG ×);`[+]` 追加(multiple);`n/20`;超限禁用;测试图缩略图在 strip 内尾部展示,`mode==='single'` 时点击=加载单图(v1 行为),`mode==='batch'` 时点击=追加该图为新行(`onTestImage` 回调内部按模式分派)。
- `handleRemove(i)`:revoke 该行 objectUrl;删行;selectedIndex 夹取(删选中行则指向前一行或 0);剩 1 张自动单图模式(无额外清理);剩 0 张回上传页。
- `handleClose`(主画布 ×):单图模式=现状;批量模式=确认对话(新 i18n key `batch.confirmCloseSession`,确认钮用 `confirmLabel`)→ 终止 runner + revoke 全部 + 清 images。
- 切换选中 `handleSelect(i)`:**本任务只做统一模式语义**(selectedIndex 直改,渲染 effect 自然重绘——参数是共享的)。

**验收**:tsc 0 错;lint 基线;`npm test` 绿;i18n 新 key 双语(`batch.addMore`、`batch.confirmCloseSession`、`batch.remove` 沿用)。
- [ ] 实现 → 验证 → 提交 `feat: add multi-image foundation with bottom image strip`

---

### Task 3: 模式语义与懒同步(base* 双状态 + SeedBar + 面板瘦身 + ActionBar)

**Files:**
- Modify: `src/components/App2D.tsx`、`src/components/BatchPanel.tsx`、`src/components/ActionBar.tsx`、i18n、global.css

**Interfaces:**
- Consumes: Task 1 全部函数;v1 `randomSeed`
- Produces:
  - App2D 新状态:`baseParams/baseTextParams`(整批基线)、`seedMode: 'unified'|'perImage'`、`format: BatchFormat`、`showBatchPanel: boolean`
  - `BatchPanelProps`(瘦身后):`{ images: BatchImage[]; seedMode; format; isRunning: boolean; onSeedModeChange(m): void; onFormatChange(f): void; onRandomizeAll(): void; onStart(): void; onRetryRow(id): void; onRerollRow(id): void; onDownloadRow(img): void; onDownloadZip(): void; onClose(): void; tab 控制内部化 }`

**行为规格:**
- **统一模式**:`handleParamChange/handleTextChange/handleFontChange/handleReset/handleRandom/handleApplySeed` 同时写 base 与工作副本(单图模式 base 无意义但不碍事;实现:统一模式下 setBase 与 setParams 同值,或直接 `params` 即 base 的镜像——取"双写"最小实现)。`handleStyleChange`/预设/内置预设切换:快照写 base(风格切换本来就会重置参数)。
- **独立模式**:编辑只写工作副本;`handleSelect(i)` 前先 `syncRowSeed(images[selectedIndex], def, working)` 回写旧行,再 `loadWorking(新行, base, def)` 载入。SeedBar 显示 `encodeSeed(activeStyle, params, def, textParams)`(现状 useMemo 已如此);`handleApplySeed` 在批量+独立模式下校验 `seedMatchesStyle`,异风格返回 false(SeedBar 自带 invalid 提示);同风格则改工作副本。骰子(ParamPanel onRandom)在独立模式= `randomizeParams` 写工作副本(用户随后切换/处理时同步)。
- **模式切换**:统一→独立 无操作天然连续(行 seed null 跟随 base);独立→统一 弹确认(`batch.confirmUnified`,confirmLabel)→ 丢弃全部行 seed(同步点:先 syncRowSeed 选中行?不——统一化丢弃所有 seed,选中行工作副本保留,base ← 工作副本)。
- **全部随机**(面板):统一=对 base+工作副本 randomizeParams;独立=每行 `randomizeRowSeed`(选中行同步载入工作副本)。
- **BatchPanel 瘦身**:配置 tab 仅剩 格式 select(svg 仅 activeStyle 为 canvas2d)、模式开关、全部随机(独立模式)、开始处理(canRunBatch(images.length));结果 tab 从 props.images 渲染(四态/重试/重骰/单张下载/ZIP/灯箱——v1 逻辑搬移为回调);面板关闭=仅 `showBatchPanel=false`(不清图片);isRunning 时关闭走确认终止(runner.cancel + aliveRef 语义移到 App2D 或保留在面板,实现者取最小改动)。
- **ActionBar**:"批量应用"→"批量处理"(i18n `batch.apply` 文案改);有图即可点。
- **runner/drain 迁移**:队列调度(runner/drain/updateRow/aliveRef/renderTaskRef)整体从 BatchPanel 上移到 App2D(行状态的唯一所有者),BatchPanel 变纯 props;updateRow 改为按 images 行 id patch(含 done 时建 objectUrl + renderedSeed 快照,双守卫行存在+alive 沿用)。

**验收**:tsc/lint/test;i18n(`batch.seedModeUnified/PerImage` 沿用、`batch.confirmUnified`、`batch.styleMismatch` 新增双语)。
- [ ] 实现 → 验证 → 提交 `feat: per-image seed semantics with slimmed batch panel`

---

### Task 4: 处理链路适配(快照→任务,v1 BatchJob 退役)

**Files:**
- Modify: `src/lib/batch/batchJob.ts`、`src/lib/batch/runBatch.ts`、对应测试、`src/components/App2D.tsx`

**Interfaces:**
- Consumes: Task 1 `snapshotTaskSeeds`;v1 runBatch 队列语义
- Produces:
  - `runBatch.ts`:`createBatchRunner(renderTask)` 不变;`run` 的入参从 `BatchJob` 改为 `ProcessingJob { tasks: { id: string; image: HTMLImageElement; seed: string }[]; base: BatchBaseline(含 fontParams/format 语义由 renderTask 闭包持有) }`,cb 不变;`RenderTask` 不变
  - `batchJob.ts`:删 `BatchJob/BatchBaseline/BatchRow/rowSeed/resolveRowRenderState`(职责移交 imageList + App2D);保留 `BatchFormat/BATCH_MAX_ROWS/canRunBatch/effectiveFormat/zipEntryName/dedupeName`;`resolveRowRenderState` 的 merge 语义由 imageList.loadWorking 承接
  - App2D `startProcessing`:`syncRowSeed(选中行)` → `snapshotTaskSeeds(images, base, def)` → 组装 ProcessingJob → drain;行置 pending、清旧结果(revoke)

**行为规格:**
- 处理中可继续调参(进行中任务不受影响——快照已定格)。
- 重试(onRetryRow):行 patch pending → drain;重骰(onRerollRow):`randomizeRowSeed` + revoke 旧 objectUrl + pending → drain(若该行是选中行,同步载入工作副本)。
- ZIP/单张命名:`zipEntryName(activeStyle, fileName, renderedSeed ?? rowEffectiveSeed)` + `dedupeName`;扩展名 blob.type 推导(v1 行为)。
- runBatch.test.ts 适配新签名(测试语义保持:顺序/失败不阻塞/取消/快照隔离)。
- 验收:tsc/lint/test 全绿(runBatch/batchJob/imageList 三套测试)。
- [ ] 实现 → 验证 → 提交 `refactor: batch processing driven by per-row snapshot tasks`

---

### Task 5: 全量验证

**Files:** 无新文件(修复则改对应文件)

- [ ] `npm test` 全绿;`npm run lint` ≤ 11;`npm run build` 成功;i18n key 双向对齐(一次性脚本放 c:\tmp)。
- [ ] 静态走查:无 emoji 图标;单图模式代码路径未引入批量依赖(≤1 张时 BatchPanel 不挂载、ImageStrip 呈单图态)。
- [ ] 手测清单(人类执行,报告附上):
  1. 单图全流程零回归(上传/调参/种子/预设/导出/比较/关闭确认)
  2. 一次选 3 张 → 批量模式,底部栏 3 缩略图+选中高亮,主画布预览选中行
  3. 统一模式调参 → 切换缩略图 → 各图同效果;SeedBar 编辑作用于全部
  4. 切独立 → 编辑只改选中行;骰子/SeedBar 改选中行;切换行保存/加载正确
  5. 独立→统一确认提示;粘贴异风格种子被拒
  6. 测试图:单图模式点击加载;批量模式点击追加
  7. [+] 追加/移除/20 上限;移除选中行 selectedIndex 正确;移到剩 1 张退化单图
  8. 开始处理 → 画廊逐格完成 → ZIP 命名正确;重试/重骰;灯箱
  9. 处理中最小化面板回单图调参不卡;面板关闭再开画廊还在
  10. 批量会话关闭(主画布 ×)确认 → 全清
  11. ASCII/SVG、JPG 黑底、animelight 逐图光源
  12. 中英文切换
- [ ] 修复(若有)→ 提交 `fix: address v2 manual test findings`

---

## Self-Review 记录

- Spec 覆盖:入口多选/底部栏/主画布预览/参数语义(双状态+懒同步)/面板瘦身/处理快照/单图零回归/错误处理 → T2/T3/T4;纯逻辑 T1;验证 T5。
- 类型一致性:BatchImage 在 T1 定义,T2/T3/T4 消费;ProcessingJob 在 T4 定义并消费;BatchPanel 瘦身 props 在 T3 定义。
- 已知让步:loadWorking 对异风格种子容错解析(上游拒绝),renderedStyleId 恒 activeStyle(字段保留兼容命名);runner 上移 App2D 的具体形态由实现者取最小改动。
