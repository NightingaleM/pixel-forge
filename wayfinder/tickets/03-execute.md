---
title: 注册表接入与三端验收执行
id: 03
labels: [wayfinder:task]
status: closed
assignee: OY_runchi
blocked-by: [02]
parent: map
---

## Question

按「规格收口与设计确认」锁定的规格，全自动实施到本地合入。**此票为 AFK 执行票**：map Notes 的常设偏好生效——不中途请示、本地 commit 合入 main、不 push。

**改动面**（侦察报告第 7 点，照抄即可）：

1. `src/types.ts:1` StyleId 加 id
2. `src/lib/StyleRegistry.ts` **末位**追加 StyleDefinition（shaderImports → 新 frag；params 定义即面板与种子布局）
3. 新建 `src/shaders/<定稿名>.frag`（单 pass 起步；若规格升级了 pass 结构按规格走）
4. `src/i18n/zh.json` + `en.json` style 块加 label/desc/参数文案
5. presets（如规格定）+ `StyleRegistry.test.ts` 用例

**验收清单**：

- 全量测试通过（基线 324 用例，不回退）；lint 0 新增（基线 11 错全在 3D 文件）。
- 浏览器三端实测（按 browser-verification-playbook：vite dev + puppeteer-core + Edge headless，视觉复核须放大局部截图）：桌面 /2d、批量管线、移动 H5 断点。
- 种子码往返：随机抽中该风格 encode→decode 参数无损；旧码（含 v0/v1）不受影响。
- 确认无需改任何 UI 文件（注册表驱动自动出现于桌面 StyleSelector 与移动风格 sheet）。
- 完成后本地 commit 合入 main，附验证证据（截图/测试输出摘要）于 Resolution；不 push。

## Resolution

**已按票2 规格全自动实施至本地合入（2026-10-11，未 push）。改动 5 文件：**

1. `src/shaders/glassdistort.frag` 新建——lab 定稿逐行移植：三高度场常量内化（波浪 0.73/0.52/1.37、方格 20.5/0.52/0.32/0.16、橘皮 26/0.25/0.12/0.12），锚点矩阵 9 值（anchorStrength），K 频率折减铁律（波浪 0.11·s¹·⁵ / 橘皮 0.032·s²），gain×lac=0.68<1，mirrorWrap，缝亮脊固定开，差分步长 0.004；生产化差异：vUv 替代 gl_FragCoord aspect-fit（canvas aspect=图片 aspect）、删 uBypass/uSeam/uP0-3。
2. `src/types.ts` StyleId 加 `'glassdistort'`。
3. `src/lib/StyleRegistry.ts` **末位**追加（第 12 风格），两 select（uGlassType 默认 0 / uStrengthLevel 默认 1）。
4. `src/i18n/zh.json`+`en.json` style 块末位加 `style.glassdistort.*` 12 键，两文件对齐。
5. `src/lib/StyleRegistry.test.ts` +2 用例：末位守卫（styles[length-1].id，防未来插入毁旧码）、默认参数恰 `{uGlassType:0, uStrengthLevel:1}`。

**验收证据（全过）：**

- 测试 328/328（基线 324 → +2 本票用例 +2 seedCodec 遍历型自动增量）；lint 11 errors 持平基线（全在 3D 文件，新文件 0 错误）。
- 浏览器三端 18/18 断言（vite dev 5177 + puppeteer-core + Edge headless，i18nextLng 锁 zh，localStorage+IDB 每场景重置）：
  - **桌面**：风格列表 12 项末位玻璃扭曲；面板恰 2 select（类型/强度选项文案与默认值全对）；BuiltInPresetBar 不渲染（无 presets ✓）。
  - **种子码**：参数变化码变（1B7→1B）；贴码复原橘皮+标准且码稳定 1B7（encode↔decode 无损）；骰子 20 次全在合法档位、7-9 种组合（随机性 ✓）。
  - **批量**：file input 一次喂 2 张自动开批量面板（注意：单图态点测试图是**替换**非追加，App2D:1181 按模式分派）；done 2/failed 0。
  - **H5**：375 断点 m-app 壳、风格 sheet `.m-style-row` 第 12 行可选、渲染正常。
- **视觉复核（关键坑：合成器截图拿不到 WebGL 画布——element/page screenshot 得米白空图，必须 canvas.toDataURL 位图直出）**：
  - 大波浪 ✓ 连绵大尺度波浪+透镜放大缩小（wave/H5/批量三处确认）；
  - 方格压花 ✓ 数百格（~15-18 列 ≈ N=20.5）正交透镜阵、逐格错位/翻转、格缝亮线、无摩尔纹无碎屑；
  - 橘皮 ✓ 细碎圆润扭曲；"中轴黑点带"经 cake 原图对照定案为**源图蛋糕架黑色金属立杆**被高频场打散的固有成像（轻微档轮廓尚在→标准档碎化，强度递进正确），非渲染伪影。
- 截图证据存 `c:/tmp/glass-prod-shots/`（s1-wave/dump-wave/dump-grid/dump-peel/dump-peel-subtle/s3-batch-results/s4-mobile 等）；测试图与源图对照排除法完成。
- UI 文件零改动（注册表驱动，桌面 StyleSelector/移动 sheet/批量管线自动出现）✓。

**交接事实**：测试基线更新为 **328**；vite dev 本项目固定端口 5177；WebGL 画布的自动化视觉验证一律走 toDataURL 直出。
