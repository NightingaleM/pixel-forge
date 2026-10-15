---
title: 万花筒动图导出执行入库
ticket: 05-execute
labels: [wayfinder:task]
status: closed
assignee: main
blocked-by: [04-spec-lock]
date: 2026-10-15
closed: 2026-10-16
---

## Question

按锁定的 spec 全自动执行入库（设计已确认，不中途请示）。**Spec 全文见 [04-spec-lock Resolution](04-spec-lock.md)（8 节：视频/GIF/交互/内核/管线/H5/i18n/验收），执行前先整读。**

- 通用时间轴内核（参数名→uniform 映射，不绑死万花筒）。
- 万花筒动效面板（A/B 槽、参数 toggle、时长、实时循环预览、受控渲染循环与按需渲染的边界）。
- GIF + 视频双格式导出（离屏逐帧渲染、编码器接入、进度/预估体积/取消、水印同规则）。
- 种子码**不动**（v1 布局零变更）。
- i18n zh/en、测试补齐、lint 持平 11、tsc 0 新增、浏览器实测 + 产物真文件抽验。
- H5 按规格锁定裁决执行。
- 本地 commit 合入 main、不主动 push。

## Resolution

**执行完毕（2026-10-16），spec 8 节全量交付，本地 main 六连提交未 push：**
fe89c2c（内核+依赖）→ 279ac5c（写入器+状态机）→ d466b22（面板+全链接入）→
23f9e41（产物抽验浏览器单测）→ a7a4d75（取消检查点+实测取证）→ f1858b1（并行 vite 缓存踩踏根治）。

### 交付物

- `src/lib/motion/`：kernel（三型 MotionSpec/sample 相位回卷严格闭合/吸附 ceil+ε 幂等）、
  gifWriter（两遍管线全局色板/10ms 延时档/GifStream 流式）、videoWriter（720p 预设/
  probeVideoSupport 会话记忆化/encodeMp4 背压+prefer-software 重跑）、exportState（纯 reducer
  状态机）、kaleidoMotion（UI 态胶水+animatedUniforms 映射）、exportAnimation（离屏编排：
  frame0 走 renderImage 统一语义,后续帧仅覆写动效 uniform,2D staging 逐帧水印,取消检查点
  覆盖 setup+两 pass 逐帧边界）。
- `src/components/MotionExportPanel.tsx`：lab v2 布局(动效卡+导出卡),3 新绘 SVG;
  ParamPanel/MobileShell2D 各加 bottom 插槽,两壳共用。
- App2D 接线：动效会话态(不入种子码)、预览 rAF 启停边界(任一非静止才起,实时态经 ref
  免重启相位)、导出中禁参数编辑、水印走 decideBatchExport(免费=逐帧 T6-25 平铺/会员无水印)。
- 依赖：gifenc@1.0.3 + mediabunny@1.61.4(runtime,并入 App2D chunk 不触混淆链) +
  gifuct-js(devDep 回读断言)。i18n zh/en 33 键(含 spec §7 全部 19 键)。

### 验收结果（对照 spec §8）

- **单测** 475/475 全绿(基线 407+新增 68,含内核数学闭合/吸附边界/记忆化/状态机/gifuct 回读)
- **产物真文件抽验** 浏览器单测 4/4:GIF gct=true/lct=0/NETSCAPE loop=0/帧数/delay 80ms;
  MP4 ftyp+页内 video duration=6.00s(动效×2);水印档体积>1.2×
- **浏览器实测**（vite dev+puppeteer+Edge headless+swiftshader,取证图在 assets/verify-*）:
  面板交互全过/预估 1.9MB·38 帧/GIF 512 默认档 **2.62s≤3s 门槛过**(免费档逐帧水印 3x 放大
  目检在场)/MP4 6.3MB duration 精确/取消回 UI+循环恢复/H5 sheet 内面板+GIF 导出成功/0 页面错误
- **工程** tsc 0 新增;eslint 持平基线 11(2D 0);npm run build 冒烟过,license 混淆 chunk 不受扰
- **种子码零变更** seedCodec 测试全过断言

### 执行中发现与裁决（未偏离 spec 口径）

1. **8fps 延时 125ms 非厘秒整数倍** → 取整 130ms(≈7.69fps);12fps→80ms(12.5fps) 与研究票一致——
   fps 档的"10ms 整除"指写出的 delay,非 fps 名义值。
2. **GIF 实际时长 = 帧数×delay ≠ 名义时长**(如 3s@12fps→3.04s):无缝对齐(漂移吸附/采样相位)
   一律以实际时长为准——alignTimelineForGif 在导出档统一修正。
3. **水印判定用 decideBatchExport**(免费 tiled/会员 none,不耗单图额度)——spec"与单图完全同规则"
   的平铺要求只有批量链路产出 tiled,corner 不适用于动图;裁决为语义即"免费平铺/会员无"。
4. **headless swiftshader 两门槛构造性无法满足,已记录留真机取证**:视频硬编 ≤5s(headless 软编
   实测 ~12s;研究票桌面硬编同档 0.3–1.5s);取消 ≤100ms(真机 GPU 一帧 5–15ms,机制为逐边界
   检查,headless 1024² 单帧软件光栅化即秒级)。机制正确性由取消检查点全覆盖保证。

### 待用户真机取证（不阻塞,按 spec §6 口径）

- 微信 Android XWeb 真机:开万花筒动效导出面板,看视频档是否被禁用(canEncodeVideo('avc')
  实测),GIF 档照常导出。
- 真机桌面浏览器(硬编):视频导出耗时体感(门槛 ≤5s)与取消跟手度(≤100ms)。
