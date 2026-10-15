# GIF 编码器选型与 256 色量化质量(研究落盘)

- 票:02-gif-encoder-research · 执行:research-agent · 日期:2026-10-15
- 环境:纯前端静态站(vite 8 + React + three.js),无 GIF/视频编码依赖,构建链含 javascript-obfuscator **仅定向混淆 license chunk**(scripts/obfuscateLicense.ts:generateBundle 只改写 `assets/license-` 前缀的 chunk,asset 与其余 chunk 一字不动)
- 动图规格(map.md):GIF 默认档 512px/12fps/3s(=36 帧),自定义上限 1024px/24fps(72 帧量级);GIF 优先保证

## 0. 结论速览(A/B 推荐排序)

| 排序 | 方案 | 一句话 |
|---|---|---|
| **A(推荐)** | **gifenc 1.0.3 + 全局调色板(抽帧联合采样)+ 每帧复用 GCT** | 最小(3.9KB gzip)最快(实测 512×36 帧 274ms / 1024×72 帧 0.98s 主线程)、结构性防帧间闪烁、MIT、零依赖、与逐帧离屏渲染管线天然契合;代价=无内置抖动,banding 明显时需自研 ~40 行 Floyd–Steinberg 映射循环 |
| B(备选) | modern-gif 2.1.0(全帧联合采样 GCT + 内置 floyd-steinberg/atkinson/stucki 抖动 + 官方 vite worker 姿势) | 开箱质量最好、维护活跃(2026-04 发版);代价=慢(实测 512×36 帧 3.2s/带抖动 6.1s;1024×72 帧 14.6s/带抖动 38s)、整批缓存帧 RGBA(1024×72 帧 ≈288MB 峰值,H5 有 OOM 风险)、体积 2.3 倍于 gifenc |
| 排除 | gif.js 0.2.0 | npm 端 2016-12 后停更;NeuQuant 默认逐帧量化(闪烁风险敞口),虽可选 `globalPalette`+四款 dither,但速度慢于 gifenc 2 倍以上且 worker 文件需手动搬运 |
| 排除 | gifucts(npm 实名 gifuct-js) | **纯解码器/parser,无编码能力**;本研究已把它用作输出回读验证工具(可复用为验收测试断言) |
| 排除 | gifski-wasm 2.2.0 | 质量天花板但 **AGPL-3.0**(闭源商用前端不可用),unpacked 705KB |
| 排除 | omggif / gif-encoder-2 / 自研 | 2019 年停更;gif-encoder-2 license 标注 UNLICENSE(法律模糊);omggif 无内置量化器;gifenc 已仅 3.9KB gzip,自研 LZW+量化省不了体积反引正确性风险 |

**量化策略定案建议(A 案内)**:全局调色板 = 均匀抽取 8 帧拼接 RGBA 一次 `quantize(…, 256, 'rgb565')` → 首帧 `writeFrame` 传 palette 写入 GCT,**后续帧一律不传 palette**(源码保证复用全局色表,实测回读 localCT=0)。抖动默认关,原型目检 banding 不合格再开自研 FS(体积 +80~100%、耗时 ×3~5,见 §3)。

## 1. 候选库对比表

| 维度 | gifenc 1.0.3 | gif.js 0.2.0 | modern-gif 2.1.0 | gifuct-js 2.1.2(参照) |
|---|---|---|---|---|
| 定位 | 编码器(纯函数式) | 编码器(事件式+内置 worker) | 编码+解码 | 仅解码/解析 |
| 许可证 | MIT(npm registry) | MIT(npm registry) | MIT(npm registry) | MIT |
| npm 最近发版 | 2021-03-07(repo 活跃至 2024-09-19) | **2016-12-06(停更近十年)** | **2026-04-16(活跃)** | 2021-11-04 |
| 体积(实测 gzip) | **3,911 B**(esm raw 9.1KB) | 4,202 B + worker 5,297 B ≈ 9.5KB | 主包 9,074 B + worker asset 11,678 B ≈ 20.8KB | — |
| 运行时依赖 | 零 | 零 | modern-palette ^2.0.0(ffmpeg palettegen 同思路,MIT) | — |
| API 形态 | **逐帧喂**(writeFrame 流式,渲染一帧编码一帧) | 整批喂(addFrame×N → render) | 整批喂(encode)或 Encoder 实例逐帧 addSample→flush | — |
| 量化器 | PnnQuant(Pairwise Nearest Neighbor,port) | NeuQuant 神经网络(逐帧,quality=采样步长) | modern-palette(全帧联合采样→单次生成 GCT) | — |
| 调色板策略 | **三态任选**:逐帧 local / 全局 GCT 复用 / 任意自定色板 | 默认逐帧;`globalPalette:true` 切首帧复用(首帧串行瓶颈) | 仅全局(全帧联合采样),不可逐帧 | — |
| 抖动 | **无**(README 明示 future 项;但导出 nearestColorIndex 可自研 FS) | FloydSteinberg/FalseFloydSteinberg/Stucki/Atkinson(+`-serpentine`) | **floyd-steinberg / atkinson / stucki**(含 ditherTransparency) | — |
| worker | 无内置 API,可整包进 worker(README+looom-tools 先例) | 内置(workers:2,workerScript URL) | workerUrl 可选,README 官方给 `import w from 'modern-gif/worker?url'` | — |
| NETSCAPE 循环 | `repeat` 默认 0=forever;≥0 时首帧写 NETSCAPE2.0(源码 L95-97/L203-212;实测回读 loop=0) | `repeat` 默认 0=forever(worker 内写 NETSCAPE;实测 gif.worker.js 含 NETSCAPE2.0 字样) | 默认 `looped:true, loopCount:0`(EncodeGif.ts L44-50/L98-108;实测回读 loop=0) | 可回读断言 |
| vite 接入 | npm 即用,esm | 需 `gif.js/dist/gif.worker.js?url` 显式引入 workerScript(否则运行时 404) | 官方 `?url` 姿势 | npm 即用 |
| 与本项目混淆链 | 零交集(混淆只碰 `assets/license-` chunk;见 §5) | 零交集(worker 走 asset) | 零交集 | 零交集 |

体积/日期来源:npm registry API(`registry.npmjs.org/<pkg>`)与 unpkg dist 文件实测 `gzip -c` 计数(2026-10-15 抓取);许可证与发版时间同源。gifenc repo 活跃度:GitHub API `pushed_at` 2024-09-19。

## 2. 量化策略分析(核心风险:帧间调色板跳变 = 循环闪烁)

### 2.1 三种策略的机制与后果

| 策略 | 机制 | 帧间闪烁 | 速度(实测) | 体积(实测,512×36) | 备注 |
|---|---|---|---|---|---|
| **逐帧独立调色板**(每帧 local color table) | 每帧独立聚类,量化器对相邻帧的渐变差异敏感,聚类中心逐帧漂移;GIF 里表现为每帧携带不同 LCT,同一名义颜色逐帧映射到不同 RGB → **循环播放时周期性色值抖动=闪烁** | **高风险(核心风险本体)** | 慢:quantize 逐帧跑,实测 512×36 帧 quantize 合计 1,216ms(全局路线仅 51ms,**~24 倍**);整链 1,429ms vs 274ms | 2,006KB(比全局大 ~10%,LCT 重复携带) | gif.js 默认、gifenc 默认用法之一;ffmpeg 同类模式 `stats_mode=single` 也仅作特殊选项 |
| **首帧调色板复用** | 首帧量化→GCT,后续帧全部映射到首帧色板 | 免疫(色板恒定) | 快 | 小 | 风险在**覆盖度**:动画后半段出现首帧没有的色相时误差累积;万花筒 A↔B 往返动效三参数连续变化,色域会漂移,首帧单帧样本不足 |
| **全局调色板=全片段联合采样**(ffmpeg palettegen 同思路) | 对全部/抽样帧的颜色做联合直方图/聚类 → 唯一 GCT;每帧只做最近邻映射 | **结构性免疫**(所有帧共享同一色板,零跳变) | 最快(量化只跑一次) | 最小(实测 1,829KB) | ffmpeg 官方高质量 GIF 管线即此:第一遍 palettegen 对全部帧做直方图生成单一全局调色板,第二遍 paletteuse 映射+抖动(信源见 §7) |

结论:**全局调色板(联合采样)是唯一同时满足"防闪烁+快+小"的策略**,也是 ffmpeg palettegen/paletteuse 十年验证的行业标准路线。首帧复用是它的廉价退化版,对万花筒三参数连续动效不推荐(覆盖度风险)。

### 2.2 抖动(error diffusion)与 banding

- 万花筒画面 = 镜像渐变 + 棱镜高饱和彩色,是 256 色量化的最难场景之一:平滑渐变会被切成色阶(banding),高饱和区色相跨度大易量化坍缩。
- **抖动的收益**:Floyd–Steinberg 等误差扩散把量化误差摊到邻域像素,视觉上消除色阶边界——对渐变画面收益显著(ffmpeg paletteuse 默认 sierra2-4a 误差扩散,信源 §7)。
- **抖动的代价(实测,modern-gif,512×36 帧,合成万花筒画面)**:
  - 耗时:3,244ms(无抖动)→ 6,051ms(FS)≈ **×1.9**;1024×72 帧 14.6s→38s ≈ ×2.6
  - 体积:2,180KB → 4,133KB(**+89%**);1024×72 帧 11.5MB → 31.4MB(**+173%**)。误差扩散破坏像素空间相关性,LZW 压缩率骤降,这是格式固有代价(ffmpeg 社区同样结论:关 dither 体积明显更小,信源 §7)
- **gifenc 无内置抖动**,但导出 `nearestColorIndex`,自研 FS/serpentine 映射循环约 40 行:逐像素 `err` 累加 → 查最近色 → 误差按 7/16/3/16/5/16/1/16 扩散。耗时预估为 map 阶段的 ×3~5(每像素一次额外查表),512×36 帧全局路线预计 0.5~1.2s 量级(主线程,未实测——A 案实施时以实测校准)。
- **缓解优先序建议**:①256 色 + rgb565 + 全局联合采样(色板质量先拉满,免费);②原型/实测目检 banding;③不合格再开 FS 抖动,同时接受体积近翻倍(预估体积 UI 必须计入);④抖动开 serpentine(蛇形扫描)可减低蠕动感。

### 2.3 帧率粒度提示(规格票需知)

GIF 帧延时粒度 = 10ms。12fps 目标 83.3ms → 取整 80ms(实际 12.5fps);24fps 目标 41.7ms → 40ms(25fps)。实测回读 delay=8(=80ms)确认。对 A↔B 正弦循环观感影响可忽略,但规格票写死档位时应选对 10ms 整除的 fps 档(8/10/12.5/20/25fps)或在 UI 上如实显示"≈"值。

## 3. 性能/内存量级(实测,Node 22.17 V8 主线程,20 核桌面)

> 浏览器同为 V8,主线程量级同阶(实际受渲染竞争略慢);帧生成耗时已剔除。画面=镜像+棱镜高饱和渐变合成帧(比真实照片更难压缩,体积数字偏保守/偏大)。

| 路线 | 512×512×36 帧 | 1024×1024×72 帧 | 输出体积(512 / 1024) |
|---|---|---|---|
| gifenc 全局色板(抽 8 帧采样) | **274ms**(quantize 51 + map 122 + lzw 101) | **983ms**(67 + 420 + 496) | 1.8MB / 9.0MB |
| gifenc 逐帧色板 | 1,429ms | 3,672ms | 2.0MB / 9.9MB |
| modern-gif 无抖动 | 3,244ms | 14,628ms | 2.2MB / 11.5MB |
| modern-gif floyd-steinberg | 6,051ms | 38,006ms | 4.1MB / 31.4MB |
| gif.js(NeuQuant+worker:2) | 未实测;gifenc README 自述比 gif.js "often more than twice as fast",以 gifenc 逐帧路线 1.4s/3.7s 推算 gif.js 单帧编码量级 ~3-8s(512×36)——供量级参考 | 同左 | — |

对照官方口径:gifenc README 称 Chrome 主线程 150 帧 1024×1024 ≈5s(33ms/帧),4 worker ≈2s。本实测合成画面镜像重复度高、LZW 友好,故更快(13.7ms/帧),两者同量级互证。

### 内存峰值(公式 + 实测观察)

- 每帧 RGBA:512²=1MB,1024²=4MB
- **整批缓存帧(modern-gif / gif.js addFrame copy 模式固有)**:512×36=36MB;**1024×72=288MB**——桌面可活,H5 移动端高风险(OOM/页面回收)。实测 modern-gif 1024 档在 node `--max-old-space-size=4096` 下正常完成,但浏览器 H5 无此兜底。
- **gifenc 流式管线**:渲染一帧(1/4MB)→映射→writeFrame→可丢弃,峰值 ≈ 单帧 RGBA + 输出 buffer(≈输出体积 2-9MB)+ 全局量化临时采样(8 帧=8/34MB,可 transfer 后释放)≈ **<50MB**,与帧数无关。这是 A 案对上限档与 H5 的结构性优势。

### worker 化必要性判断

- 512 默认档 gifenc 全局路线 ≈0.3s:一次性导出动作,**主线程可接受,无需 worker**(map.md 已定导出中禁用参数编辑,阻塞窗口有 UI 兜底)。
- 1024 上限档 ≈1s(无抖动):边缘可接受;若开自研 FS(×3~5 → 3~5s)则**建议 worker 化**。
- worker 化成本:项目已有 vite 原生 worker 先例(src/lib/ParticleEngine.ts `new Worker(new URL('./volumetricSampler.worker.ts', import.meta.url), {type:'module'})`),gifenc 明确可在 worker 内跑(README+looom-tools exporter 先例):帧 RGBA 以 transferable 传入,worker 内 map+writeFrame(auto:false 分片)或整包编码后回传 Uint8Array。估计 ~50-80 行,无新依赖。规格票可留"1024+抖动才启用 worker"的阶梯开关。

## 4. 循环元数据(NETSCAPE LOOP=0)实测

用 gifuct-js 回读三家输出(本报告 §1 行内已注源码位置):

- gifenc:`repeat:0`(默认)→ 首帧后写 NETSCAPE2.0 loop=0 ✓;`repeat:-1` 不写(播放一次)
- gif.js:`repeat:0`(默认)✓
- modern-gif:默认 `looped:true, loopCount:0` ✓
- 三家均开箱即得无限循环,**无适配工作量**;A↔B 无缝循环只需画面相位闭合(时间轴内核的事),与编码器无关。

## 5. vite / 混淆链兼容性

- 混淆插件边界(scripts/obfuscateLicense.ts L64-76):`generateBundle` 只处理 `file.type === 'chunk'` 且 `fileName.startsWith('assets/license-')` 的产物。**任何 GIF 库的 JS(进普通 chunk,走 esbuild 压缩一字不动)与 worker 文件(?url → asset 类型;?worker → 非 license 前缀 chunk)都不会被混淆触碰**。兼容性风险实际为零,前提仅一条:GIF 代码不得 import `src/lib/license/**`(自然不会)。
- gif.js 的真实接入成本不在混淆,而在 worker 引载:默认 `workerScript:'gif.worker.js'` 相对路径在打包产物里 404,须 `import workerUrl from 'gif.js/dist/gif.worker.js?url'` 显式传入(社区通行做法);modern-gif 官方 README 直接给 vite ?url 姿势;gifenc 无此问题。
- JS 均无 eval/new Function 依赖(gifenc 纯 TypedArray 计算),不触发自防护类混淆的冲突面(且反正不同 chunk)。

## 6. 推荐与理由(供规格锁定票取用)

**定 A 案:gifenc + 全局调色板(抽 8 帧联合采样,rgb565,256 色)+ 首帧 GCT 后续帧复用 + repeat:0。**

理由:①核心风险(帧间闪烁)结构性消除——所有帧共享一张色板,不存在跳变自由度;②实测最快最小(274ms/983ms 主线程、3.9KB gzip、零依赖);③流式逐帧 API 与现有 offscreenExport 逐帧渲染地基同构,内存峰值与帧数解耦(<50MB,1024 档与 H5 都安全);④NETSCAPE loop=0 默认即得;⑤MIT+零依赖,混淆链零交集。唯一弱点(无抖动)有清晰升级路径:自研 FS 循环(≈40 行,用其导出的 nearestColorIndex),触发条件=原型目检 banding 不合格,同时按"体积 +80~100%、耗时 ×3~5、1024 档建议配 worker"写进规格。

B 案 modern-gif 留作"A 案自研 FS 效果不达标时的整包替代":它是唯一同时内置"全局联合采样 + 三款误差扩散抖动 + vite worker 姿势"的活跃库,但 1024 档 14.6s(无抖动)/38s(FS)与 288MB 整批缓存使它只能服务 512 档或桌面端,不适合当默认。

给规格票的具体锚点:
1. 量化:`quantize(sampledRgba, 256, {format:'rgb565'})`,采样=均匀 8 帧(覆盖 A→B→A 全相位);首帧 `writeFrame(idx, w, h, {palette, delay, repeat:0})`,后续帧 `writeFrame(idx, w, h, {delay, repeat:0})`(不传 palette)。
2. 帧延时:按 10ms 整除档位设 fps(默认 12fps 实际写 80ms);导出预估体积 UI 用"每帧 LZW 后字节"实时累计(与真实输出一致)。
3. 抖动:默认关;预留 `dither: 'floyd-steinberg-serpentine'` 自研开关,开启时预估体积按 ×1.9 系数展示。
4. worker:默认主线程;当(尺寸>512 且抖动开)时走 vite 原生 worker(参照 ParticleEngine 模式)。
5. 验收测试:gifuct-js 回读断言 `lsd.gct.exists===true`、全部帧 `lct.exists===false`、NETSCAPE loop=0、frames=N、delay 合法(本研究 verify 脚本已验证全部断言可行,可在 c:\tmp\gifbench 复现)。

## 7. 信源

- gifenc:README + src/index.js(main 分支,raw.githubusercontent.com/mattdesl/gifenc)— 体积 9KB/无 dithering/worker 架构/PnnQuant/repeat 语义;GitHub API(stars/license/pushed_at 2024-09-19);npm registry(1.0.3,2021-03-07,MIT);dist/gifenc.esm.js 实测 raw 9,098B / gzip 3,911B
- gif.js:README(raw.githubusercontent.com/jnordberg/gif.js)— dither 四款+serpentine、repeat 默认 0、quality 语义、workerScript;src/gif.coffee — globalPalette 机制(L84-124,默认逐帧 NeuQuant);npm registry(0.2.0,2016-12-06,MIT);dist 实测 gif.js 4,202B gz + gif.worker.js 5,297B gz(含 NETSCAPE2.0 字样)
- modern-gif:README + src/Encoder.ts + src/transformers/EncodeGif.ts + src/options.ts + src/types.ts(github.com/qq15725/modern-gif)— 全帧 addSample→flush 单次 generate GCT、looped:true/loopCount:0 默认、DitherMethod 三款、workerUrl;npm registry(2.1.0,2026-04-16,MIT,依赖 modern-palette ^2.0.0);tarball dist 实测 index.mjs 9,074B gz / worker.js 11,678B gz
- modern-palette:npm registry(2.0.0,2024-01-10,MIT,"consistent with ffmpeg")
- gifuct-js:npm registry(2.1.2,2021-11-04,MIT);回读验证字段:lsd.gct.exists / image.descriptor.lct.exists / application.id='NETSCAPE2.0' + blocks(loop)
- gifski-wasm:npm registry(2.2.0,2025-02-05,**AGPL-3.0-or-later**,unpacked 704,670B)
- omggif / gif-encoder-2:npm registry(1.0.10 2019-07 MIT;1.0.5 2019-08 **UNLICENSE**)
- ffmpeg palettegen/paletteuse 设计(全局调色板+抖动为高质量 GIF 标准管线、stats_mode=single 即逐帧调色板仅特殊场景、关 dither 体积更小):superuser 高赞译文与多个中文实践文(2023-11/2024-05)
- 本地实测:Node v22.17.0,win32,20 核;脚本 c:\tmp\gifbench\bench.mjs + verify2.mjs(gifenc/modern-gif/gifuct-js,合成镜像棱镜渐变帧);2026-10-15 执行
- 项目侧:scripts/obfuscateLicense.ts(混淆边界)、vite.config.ts(manualChunks)、src/lib/ParticleEngine.ts(vite 原生 worker 先例)、wayfinder/kaleido-motion/map.md(档位与约束)
