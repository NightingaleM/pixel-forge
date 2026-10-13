---
title: 执行入库——全自动交付至三端验收、本地合入 main
ticket: 05-execute
labels: [wayfinder:task]
status: closed
assignee: claude
blocked-by: [04-spec-lock]
date: 2026-10-13
---

## Question

按锁定规格全自动执行（设计确认后不中途请示，常设偏好全遵守）：tiltshift 入库为正式 2D 风格并交付本地 main。

### 执行面（按锁定规格展开）

- `src/types.ts` StyleId + `src/lib/StyleRegistry.ts` styles **数组末位追加**（prism 之后，种子码兼容铁律）。
- frag / 多 pass 接 `renderMultiPass`；智能默认焦带分析接入渲染/批量管线（按 04 锁定口径）。
- 面板（含手绘内联 SVG 图标）/ 批量 / 移动 H5 注册表驱动接入；i18n zh+en 全键。
- 测试扩展至新基线、lint 不新增（2D 期望 0）、tsc 0 错。
- 三端浏览器实测按 browser-verification-playbook（WebGL canvas.toDataURL 直出；shader 测试源图教训见上图 05 票）；旧种子码回填回归。
- 本地 commit 合入 main，**不 push**。

### 交付

三端验收记录 + commit hash；图 Decisions so far 收尾，图关闭。

## Resolution（2026-10-13 执行完毕）

### 交付文件

- `src/types.ts` / `src/lib/StyleRegistry.ts`（+末位断言更新）：StyleId + tiltshift 注册块（13 slider）。
- `src/shaders/tiltshift_ds.frag` / `tiltshift_composite.frag`：tent 降采样 + 金字塔合成（形状高光层 32tap 圆核 + 色彩链，头注含全部约定）。
- `src/lib/ShaderRenderer.ts`：renderToFBO 可选输出尺寸 + getSourceTexture + renderToCanvas（多纹理上屏，uResolution 注入与 renderMultiPass 同约定）。
- `src/lib/renderImage.ts`：tiltshift 专属 pass 链（金字塔 4 层 + 深层上下两份独立加轮 + 合成；中间纹理 finally 统一删除防逐帧泄漏）。
- `src/lib/tiltshiftBand.ts` + 测试：智能焦带纯函数（64px 彩色度加权梯度能量投影，y/tilt 已翻转成 uv 约定，置信 0.55 守门）。
- `src/components/App2D.tsx`：智能焦带 effect（估计只赢默认位；旧图估计值换图允许被覆盖 bandEstImgRef；width 不采纳）。
- `src/lib/batch/runBatch.ts`：批量逐图估计（同「只赢默认位」口径，估计值随 encodeSeed 入水印码可复现）。
- `src/i18n/zh.json` / `en.json`：style.tiltshift 全键（label/desc + 13 参数 ×name/Desc）。
- `scripts/verify-tiltshift.mjs`：三端端到端验证（桌面 12 断言 + H5 4 断言，canvas.toDataURL 直出）。

### 验收记录

| 项 | 结果 |
|---|---|
| vitest | **387/387**（基线 341 → 387，+46：tiltshiftBand 6 + 全量回归） |
| tsc | 0 新增（预存 9：visibleWhen 类 8 + uTexSize 1，均 HEAD 既有） |
| eslint | 持平 11（全 3D 预存，2D 0 新增） |
| 桌面 E2E | 12/12：列表末位/画布直出 1.43MB/顶缘细节能量 17.08→2.17(-87%)/焦带加锐 23.99→35.50/13 滑杆/智能焦带值域/骰子重渲+值合法/风格往返/竖幅/无页面错误 |
| H5 E2E | 4/4：风格 sheet 点选（styleBtn=移轴微缩）/画布直出 226KB/无页面错误（IDB 先清） |
| lab 断言 | 57/57（解耦逐位/单调/边缘能量/焦带保留，export-static.mjs） |
| 视觉回归 | 生产直出（终判默认参数）目检 8-9/10：窄清晰带+渐进虚化+浓艳暖调全呈现、无伪影、微缩感成立；「带观感略宽于 2%」为清晰核心 vs 几何带宽口径差（pow1.5 近带小半径），非缺陷 |
| 旧种子码 | 追加末位不动旧序号，seedCodec 全风格 roundtrip 单测过 |

### 与票 04 规格的偏差（均为工程必要）

1. bandY 范围 0–1（原定 0.05–0.95）、feather 上限 0.72（原 0.70）：(max−min)/step 须浮点精确整档（0.95−0.05、0.70−0.03 的浮点差让 floor/round 各得 89/90，max 档差一档），注册表内有注释。
2. 智能估计 **width 不采纳**（票 04 §4 原文三参数）：定稿窄带 0.02 是用户口味，自动加宽反而打架——估计仅填 y/tilt。
3. 批量估计覆盖未做 UI 级 E2E（跑一次完整批量 UI 成本高）；其逻辑（默认位判定+估计+入码）由单测与代码审读覆盖。

### 新坑记录（后续项目借鉴）

1. **估计器量纲 bug（实验室遗留）**：剖面轴乘 1.4 而窗位不除回，窗位系统性偏移 0.4h——实验室 nyc「0.61 vs 预期 0.60」的吻合是巧合。生产版统一 h 单位 + 单测翻转语义覆盖。教训：**几何归一化系数必须在产生与消费两端同一空间**。
2. H5 触屏 sheet 上 puppeteer 真实坐标点击不触发 React onClick（偶发）——脚本兜底恒走 DOM click。
3. renderToFBO 返回纹理调用方持有，自定义 pass 链必须 finally deleteTexture（滑杆拖动逐帧重渲）。
