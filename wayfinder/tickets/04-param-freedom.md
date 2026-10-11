---
title: 参数开放——试验台自由度移植
id: 04
labels: [wayfinder:task]
status: closed
assignee: OY_runchi
blocked-by: []
parent: map
---

## Question

用户交付后决议（2026-10-11）：「如试验台那样，强度 + 不同类型各自不同的参数」——把 glass-lab 的调参自由度移植进生产，推翻票2 的"仅两个 select"约束。

## Resolution

**已实施至本地 main（2026-10-11，未 push）。试验台自由度全量移植：**

### 设计（用户拍板「如试验台那样」）

- **强度**：删三档 select，换连续滑杆 `uStrengthScale`（0–200%，默认 100%，step 0.01）；shader 内 `strength = BASE[type] × scale`（BASE=0.78/0.51/0.34 保留），clamp 0.95 上限。100% 恒等于当前类型定稿基准——切类型无需重置，天然还原 lab「切模式带基准」行为。
- **气质参数全开放**（值域与默认=试验台定稿）：大波浪 3 项（波长尺度/倍频粗糙度/方向拉伸）、方格 4 项（格数/逐格错位/透镜鼓包/翻转概率）+ 缝亮脊 toggle（默认开）、橘皮 4 项（鼓包密度/低频流动/边界破碎/疏密包络）。
- **visibleWhen 条件显隐**（新框架能力）：`ParamDef.visibleWhen?: (values) => boolean`（number/toggle/select 三类型），ParamPanel 渲染前 filter；隐藏参数值仍保留在 state/种子码中（切走再切回不丢）。零 App2D 侵入，桌面/嵌入（H5/批量）两壳同块 JSX 自动生效。

### 改动面（6 文件）

1. `src/types.ts`：三个 ParamDef 加 `visibleWhen?`。
2. `src/shaders/glassdistort.frag`：气质参数 uniform 化（uWave*/uGrid*/uPeel*）、比例强度、uGridSeam toggle。
3. `src/lib/StyleRegistry.ts`：glassdistort 13 参数（类型+强度+11 细调+toggle，各带 visibleWhen）。
4. `src/components/ParamPanel.tsx`：controls 计算 +filter 一处。
5. `src/i18n/zh.json`+`en.json`：删 3 档位键，+24 参数键，strengthDesc 改比例语义。
6. `src/lib/StyleRegistry.test.ts`：默认参数新集合（14 值）+ visibleWhen 分组守卫（5/7/6 控件）。

### 验收证据（全过）

- 测试 **329/329**（328→329：-1 旧用例 +2 新）；lint 持平 11（全 3D）。
- 浏览器实测（5177 + Edge headless）：显隐分组三态 5/7/6 控件 ✓；隐藏值保留（橘皮密度设 15→切方格→切回仍 15，直证 `["1","15","0.25",...]`）✓；强度滑杆连续生效（0.3 vs 2.0 渲染不同）✓；骰子含新参数且合法多样 ✓。
- **种子码**：新码 16 字符（`1B…`，11 number+1 toggle 入码）往返无损 ✓；**旧三档码（如 1B7）实测被优雅解为新参数组合**（类型 0/强度 0），不崩溃不报错——混合进制下短码碰巧整除，pre-release「临时分享串」既有权衡覆盖，不做特殊处理。
- **渲染等价性铁证**：默认参数（=各类型 100%）三类型 dump 与上一版三档"标准"档 dump 近逐字节一致（peel 完全同字节）——uniform 化移植零回归。
- 途中排除一个假警报：脚本在骰子随机后 dump 导致强度≈0、三图相同，属脚本时序非产品缺陷。

### 交接事实

- 面板控件数：大波浪 5 / 方格 7（含 toggle）/ 橘皮 6。
- `visibleWhen` 为通用能力，后续风格可复用（如 lightshadow 的 pass 相关参数）。
- waveGain 值域上限 0.8 允许用户调出采样折叠碎屑（试验台同域自由度），desc 已注明。
