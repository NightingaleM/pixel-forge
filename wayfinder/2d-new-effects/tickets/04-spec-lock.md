---
title: 规格收口与设计确认——全息箔 + 棱镜彩虹色散
labels: [wayfinder:grilling]
status: closed
assignee: 主会话（已完成）
blocked-by: []
---

## Question

锁定两个新风格的全部实现规格并过设计确认门；确认后毕业执行票，按常设偏好全自动执行至本地合入 main（不 push）。

## 规格草案（对齐 glassdistort 注册惯例，样张定稿值即 default）

### 1. 全息箔 `holofoil`（单 pass，追加 styles[12]，StyleId union 加 id）

实现基线 = 样张页碎冰模式粗 shader（亮度梯度伪法线 → 光谱色相映射 + value noise 碎纹 + 深色金属底 + 细碎闪点）。

| # | 参数 | uniform | 类型 | 值域/默认 | 入码 |
|---|------|---------|------|-----------|------|
| 1 | 质感 texture | uTexture | select | 碎冰镭射(0,**默认**)/拉丝光柱(1)/珠光细闪(2) | 随机 |
| 2 | 效果强度 strength | uStrength | number | 0–2, step 0.01, 默认 1 | 量化入码 |
| 3 | 色带密度 bandDensity | uBandDensity | number | 0.5–3, step 0.01, 默认 1 | 量化入码 |
| 4 | 色带角度 bandAngle | uBandAngle | number | 0–180°, step 1, 默认 22°（=样张 4.0:1.6 比） | 量化入码 |
| 5 | 箔面底色 foilColor | uFoilColor | color | 默认 #1A1A22（近黑金属蓝） | 随机 |
| 6 | 碎纹密度 crackleDensity | uCrackleDensity | number | 15–60, step 0.5, 默认 38 | visibleWhen: 碎冰 |
| 7 | 拉丝密度 streakDensity | uStreakDensity | number | 5–40, step 0.5, 默认 14 | visibleWhen: 拉丝 |
| 8 | 闪点密度 sparkleDensity | uSparkleDensity | number | 0.5–3, step 0.01, 默认 1 | visibleWhen: 珠光 |

- **拉丝/珠光两档说明**：样张只渲染了碎冰模式（用户认可的气质基准）；拉丝=各向异性拉伸噪声光柱、珠光=高频闪点+柔化彩虹，执行票实现并浏览器实测局部放大核验，交付时用户视觉复核三档，不满意可砍档（不影响种子码结构）。
- desc 文案须提示「深色/简洁照片效果最佳，浅色杂图会糊」。
- i18n：zh/en 各 21 键（label、desc、5 参数名+Desc、3 select 选项、3 条件参数名+Desc）。

### 2. 棱镜彩虹色散 `prism`（单 pass，追加 styles[13]，StyleId union 加 id）

实现基线 = 样张粗 shader（RGB 三通道沿径向分离采样，边缘彩虹镶边随距中心增强）。

| # | 参数 | uniform | 类型 | 值域/默认 | 入码 |
|---|------|---------|------|-----------|------|
| 1 | 模式 mode | uMode | select | 径向色差(0,**默认**)/对角色散(1)/紫边增强(2) | 随机 |
| 2 | 色散量 amount | uAmount | number | 0–1, step 0.01, 默认 0.5 | 量化入码 |
| 3 | 方向角 angle | uAngle | number | 0–180°, step 1, 默认 45° | visibleWhen: 对角 |
| 4 | 边缘阈值 edgeThreshold | uEdgeThreshold | number | 0–1, step 0.01, 默认 0.5 | visibleWhen: 紫边 |

- 紫边增强模式 = luma 梯度检测高对比缘叠紫（对角/紫边模式执行票实测核验，同上可砍档）。
- i18n：zh/en 各 13 键。

### 共同铁律（执行票照抄）

- styles 数组**末位追加**：holofoil → prism（风格序号入码，此顺序即注册顺序）；不插队、不动现有条目。
- 新建 `src/shaders/holofoil.frag`、`src/shaders/prism.frag`；shader 风格无 SVG 导出（回退 PNG），勿加分支。
- 不做 presets（与 glassdistort 决议一致）。
- 改动面：`src/types.ts`（StyleId）+ `StyleRegistry.ts`（两条目）+ 2 frag + `zh.json`/`en.json`（34 键×2 文件）+ 测试用例。
- 验收：测试基线 329 只增不减；lint 2D 期望 0（全局基线 11 全在 3D）；三端 18 项断言同款（桌面/批量/H5）；种子码新旧往返无损（旧码不受影响）；浏览器视觉复核按 playbook（toDataURL 直出、局部放大）。

## Resolution

**2026-10-11 用户确认「认可」，设计确认门通过，规格锁定。**

- 两风格 schema、值域、i18n 键数、铁律以本票正文为准，执行票照抄，不得重开。
- 用户知情并接受：全息箔拉丝/珠光两档未出样张，执行票浏览器实测定稿，交付视觉复核可砍档（不影响种子码结构）。
- 毕业票 05「注册表接入与三端验收执行」。
