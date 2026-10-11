# 2D 特效系统架构侦察报告

> 侦察时间：2026-10-11（制图会话，Explore 子代理产出，原文归档）
> 用途：「2D 玻璃扭曲特效」图的事实底座；执行前必读。

## 1. 2D 特效清单与注册位置

2D 特效在代码中称「风格 (style)」，单一注册表驱动，无散落定义：

- **注册表**：`src/lib/StyleRegistry.ts:3-319` 的 `styles: StyleDefinition[]` 数组，共 **11 个**：
  - halftone 半色调 (:7)、diffusion 扩散抖动 (:47)、popart 波普 (:69)、lightshadow 光影 (:94, 多 pass)、sketch 素描 (:136)、pointillism 点彩 (:160)、**kaleidoscope 万花筒 (:200)**、crosshatch 网纹 (:231)、animelight 动感光 (:250, 多 pass)、textraster 文字栅格 (:279)、**ascii 字符画 (:297, `renderMode:'canvas2d'`，唯一非 WebGL 项)**
  - 每项含 `shaderImports`(懒加载 frag)、`params`(uniform 定义，type: number/toggle/select/color/text/font)、可选 `presets` 与 `isMultiPass`
- **类型**：`src/types.ts:1` `StyleId` union（新增特效必须加 id）；`StyleDefinition` `src/types.ts:68-77`（`renderMode?: 'shader' | 'canvas2d'` :76）
- helper：`getStyle`/`defaultParams`/`defaultTextParams` `StyleRegistry.ts:324-350`
- 区分：**3D 特效**在 `src/lib/EffectRegistry.ts:21-114`（none/surface/explosion/morph/vortex/density）；**「水印」不是特效**，是会员导出水印 `src/lib/license/watermark.ts`（见第 6 点）。

## 2. 2D 渲染管线

主路径为 **WebGL 1.0 fragment shader 全屏 quad 逐像素**（非 Canvas 2D、非 SVG filter）：

- **渲染引擎** `src/lib/ShaderRenderer.ts`：全屏 quad 顶点着色器 (:9-28)；`loadImage` 纹理上传（texImage2D :120，钳制 2048 :18,79-84）；`useShader` (:133-171)；`render` (:217-236)；`renderMultiPass` FBO ping-pong (:294-395，末 pass 绑 uImage=unit0 + uOriginal=unit1 :335-346)；`loadTextTexture` 文字图集 (:411-442)
- **共享渲染核心** `src/lib/renderImage.ts:53-123`（文件头 :2-3 明示单图与批量共用同一渲染语义）：canvas2d 分支先 return (:59-73) → shader 分支按 isMultiPass 分流 (:101-116)；`buildRenderParams` (:15-34) color hex 拆 R/G/B、animelight 自动光源覆盖中心；uResolution 注入 :111
- **组件薄壳** `App2D.tsx:616-649` `renderWithStyle`；渲染 effect `App2D.tsx:950-956`
- **shader 作用方式**：每 frag `texture2D(uImage, uv)` 采样原图。**UV 重映射（扭曲）现成范式 = kaleidoscope**：`src/shaders/kaleidoscope.frag:57-119`（极坐标折叠得新 photoUv，:119 采样；`tileMirror` 镜像平铺 :53-55 防边缘拉丝）——玻璃扭曲可直接沿用"改采样坐标"模式
- **例外 canvas2d 路径**（ASCII）：`src/lib/AsciiCanvasRenderer.ts:61-134`，离屏 getImageData (:86) 后**逐 cell**（非逐像素）绘字符 (:109-129)

## 3. 参数面板与种子码

- **参数 UI 两种壳、同一控件体**：桌面浮动面板 `src/components/ParamPanel.tsx`（renderParam 按类型分发 text :123 / toggle :141 / color :156 / select :174 / font :193 / 数值滑条 :224，数值内联编辑 :52-112），挂载 `App2D.tsx:1653-1695`；移动端 BottomSheet（`src/components/BottomSheet.tsx:19`，peek60%/full90% 拖拽两档）内嵌 ParamPanel embedded（`MobileShell2D.tsx:186-204`），数据组装 `App2D.tsx:1502-1541`
- **种子码** `src/lib/seedCodec.ts`：SEED_VERSION=1 (:65)；入码 = 数值档+color+select/toggle，**text/font 不入码**（:79-81 seedableListOf；理由 :62-64 码长）；码格式 = 版本字符+风格序号字符+base62 (:132-135)；encodeSeed (:106-136) 混合进制（number=档位数 :38、select=options.length、toggle=2 档 :84-86、color=2^24 :122）；decodeSeed (:141-183) v0/v1 双布局兼容、余数非 0 判非法 (:181)；color 脏值回 default (:118-121)
- **与 memory 一致确认**：select 入码且随机（`src/lib/randomSeed.ts:20-23`）；toggle 入码但不随机（:19 跳过 toggle/text/font）；SKIP_RANDOM_UNIFORMS 居中/旋转类不随机（:6）
- 种子 UI：`SeedBar.tsx:15`；实时编码 `App2D.tsx:1050-1053`；应用 `handleApplySeed` `App2D.tsx:1256-1285`（decode 后 mergeWithDefaults 补缺省，`presetStore.ts:103-109`）

## 4. 位移/扭曲/逐像素既有基础设施

- **GLSL 噪声（可复用）**：`crosshatch.frag:15-27` hash + 双线性 value noise（:67-69 纸纹，最接近玻璃扭曲需求）；`diffusion.frag:31,53-61` hash/Bayer；`pointillism.frag:14-38` hash 抖动
- **UV 扭曲先例**：kaleidoscope.frag 全套 + tileMirror 可直接搬
- **无 SVG filter**：全库 grep feTurbulence|feDisplacementMap 零命中
- **CPU 逐像素循环仅两处**：`brightPoint.ts:11-31`（32px 缩略图 luma 扫描，`App2D.tsx:894-914`、`runBatch.ts:136-148`）；`AsciiCanvasRenderer.ts:47,86` getImageData 逐格消费。无全分辨率逐像素写回——玻璃扭曲走 shader 即可
- 3D 参考：`shaders3d/density.vert.chunk:28-63` 噪声位移；`ParticleEngine.ts:43,668,1183-1271` CPU 逐粒子弹簧位移

## 5. 批量与移动端复用

- **批量与单图共用渲染核心**：`src/lib/batch/runBatch.ts:107-194` createCanvasRenderTask（离屏 canvas + 懒建 renderer，直接调 renderImage :151-162）；createBatchRunner (:79-104) 逐行 resolveRowRenderState（种子 decode+基线打底 :63-77）
- 行种子逻辑 `src/lib/batch/imageList.ts`：rowEffectiveSeed :48、randomizeRowSeed :79、assembleProcessingTasks :93、**isTaskSharedEdit :107-115（toggle/select/text 不随种子时靠基线双写保证批量 WYSIWYG——新增特效自动获得此行为）**
- **移动端 H5 完全共用**：`App2D.tsx:679` isMediaQuery('(max-width: 767px)')，:1497-1605 移动分支**只换 UI 壳**（MobileShell2D），状态/handler/渲染管线同组件（注释 :1360-1364）；预览队列 (:361-422) 同一 renderTask
- 格式：SVG 仅 canvas2d(ascii) 可导，shader 风格回退 png（`batchJob.ts:19-22`）——玻璃扭曲走 shader 则无 SVG 分支

## 6. 会员/付费墙

**没有按特效 gate——11 个风格对所有人开放；付费墙只在导出水印**：

- 唯一决策点 `src/lib/license/gating.ts`：decideSingleExport (:10-13) 会员 none / 免费日额度内(quota.ts:51 consumeOne) none / 超额 corner；decideBatchExport (:15-18) 会员 none / 免费恒 tiled（不耗额度）
- 水印实现 `watermark.ts`：applyCanvasWatermark :28-69、exportWatermarked（副本导出不污染预览）:72-83、injectSvgWatermark :101-127
- 调用点：单图 `App2D.tsx:1131,1149,1168`；批量 `runBatch.ts:166-186`
- 会员状态 `verify.ts:279`；批量上限付费预留 `batchJob.ts:14-16`
- 结论：玻璃扭曲默认全量可用，目前无 per-style gating 基础设施

## 7. 入口 UI / 图标 / 新增改动面

- **风格入口 registry 驱动，无需新按钮**：桌面 `StyleSelector.tsx:14-26` 遍历 styles（挂 `App2D.tsx:1611`）；移动风格 sheet `MobileShell2D.tsx:206-223` 遍历 styleItems（`App2D.tsx:1543-1547`）——**StyleRegistry 加条目，两端入口自动出现**
- **图标全部手绘内联 SVG，无图标库**（ActionBar :38 注释"手绘 SVG，禁 emoji"）：批量 `ActionBar.tsx:39-42`、皇冠 :51-53、骰子 `ParamPanel.tsx:291-298`、会员/滑杆/骰子/批量 `MobileShell2D.tsx:115-118,162-166,170-173,177-180`；首页 emoji `Home.tsx:17,25`；public/icons.svg 未被引用
- **新增玻璃扭曲最小改动清单**：
  1. `src/types.ts:1` StyleId 加 id
  2. `src/lib/StyleRegistry.ts` 加 StyleDefinition（shaderImports 指向新 frag；参数定义即决定面板与种子布局）
  3. 新建 `src/shaders/glassdistort.frag`（单 pass 起步；需法线/模糊分离可 isMultiPass + FBO）
  4. `src/i18n/zh.json:103` + `en.json:103` 的 "style" 块加 label/desc/参数名+Desc/select 选项文案（两文件各 680 行对齐）
  5. 可选：内置 presets（BuiltInPresetBar.tsx:17-27 自动渲染）、StyleRegistry.test.ts 用例
- **无需改**：App2D/ParamPanel/StyleSelector/MobileShell2D/BottomSheet/runBatch/imageList/seedCodec/randomSeed（全部 registry 驱动自动适配；旧码不受影响；注意码长随参数档位数增长，seedCodec.ts:62-64）

## 8. Lint 基线确认

`npx eslint .` 实测 **11 errors / 0 warnings，全部在 3D 侧**，与 progress.md:26 基线一致：

- `src/components/ActionBar3D.tsx:40`（_modelInfo unused）
- `src/components/App3D.tsx:119`（preset unused）
- `src/components/RecordingControls.tsx:69`（react-hooks/refs，App3D 录制控件）
- `src/lib/ParticleEngine.ts` 8 处 no-explicit-any：:392,:396,:438,:459,:462,:483,:1075,:1342

2D 路径 0 错误——新增玻璃扭曲文件 lint 期望为 0 基线。

补充：测试基线 324 用例（progress.md:26,40）；渲染上限 2048（ShaderRenderer.ts:18、AsciiCanvasRenderer.ts:19）；批量上限 20 行（batchJob.ts:11）；路由 /2d（App.tsx:56）。
