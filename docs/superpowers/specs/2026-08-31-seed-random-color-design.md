# 种子与随机支持色板颜色 —— 设计文档

日期：2026-08-31
状态：用户报障驱动的修复（色板特性遗留权衡不成立），待实现

## 背景与问题

色板特性（2026-08-31-2d-color-picker）把 3 个颜色参数移入 color 类型（textParams 数据流）后，用户实际使用发现两处体验断裂：

1. **随机按钮跳过 color**——handleRandom 沿用 select/toggle 的「保留现值」策略，颜色不参与随机（3D 侧的随机是会随机颜色的，App3D.tsx:425-426）。
2. **种子不编码 color**——seedCodec 的 `isNumeric` 只认 undefined/number，颜色完全退出种子码：生成种子丢颜色、应用种子颜色回默认（App2D.tsx:424 以 defaultTextParams 为底合并）。

## 方案

### 1. seedCodec 编码 color（mixed-radix 扩展）

- 编码序列：`def.params` 中 `isNumeric(p) || p.type === 'color'` 按原顺序（toggle/select/text/font 仍不参与）。
- color 档位：radix 固定 `16777216`（2^24），index = `parseInt(hex.slice(1), 16)`；解码还原为 `'#' + n.toString(16).padStart(6, '0')`。
- **签名**：`encodeSeed(styleId, params, textParams, def)`（textParams 新增第 3 参；color 取 `textParams[p.uniform] ?? p.default`）。
- **decodeSeed 返回**：`{ styleId, params, colorParams: Record<string, string> }`（新增 colorParams，仅含该风格的 color 参数）。
- **兼容性**：7 个无 color 参数的风格编码序列不变 → 旧种子**完全兼容**；**4 个** color 风格（sketch/lightshadow/animelight/**ascii**，后者的 uCharColor 本就是 color 类型——先前分析漏计）序列 +1 档 → 色板特性后生成的种子失效（本就是本次修复对象，无额外损失）。不 bump SEED_VERSION（那会让全部 7 个无辜风格种子陪葬）。ascii 的字符颜色参与随机/种子属预期行为（渲染链路对全部 color 参数统一拆 R/G/B，已验证无碍）。

### 2. App2D 接线

- 种子生成（412 行）：`encodeSeed(activeStyle, params, textParams, currentStyle)`，useMemo 依赖加 textParams。
- 种子应用（424 行）：merge 底改为 `{ ...defaultTextParams(decoded.styleId), ...decoded.colorParams }`——种子里的颜色覆盖默认色，text 类型仍回默认。
- handleRandom 加 color 分支：`'#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0')`（均匀随机 RGB，与 3D 行为一致；16777216 覆盖含 0xFFFFFF 的全值域），经 `setTextParams` 合并写入。text 类型（charset 等）仍不随机。

### 3. 测试（seedCodec.test.ts）

- color 编码往返：encode → decode 后 colorParams 与输入 hex 逐字一致（含大小写归一：input type=color 产出小写，解码 padStart 也小写）。
- 快照追平：animelight 全 max 码长 16 → **20**（实际档积 1.0136e24 × 2^24 ≈ 1.70e31 < 62^18 → 18 字符载荷 + 2 前缀）；ascii 6 → **10**（档积 787,185 × 2^24 ≈ 1.32e13 → 8 + 2）。
- 全 min 往返：color 风格需传 `'#000000'` 色表保持「空载荷、码长 2」语义（color 默认色非黑会破坏空载荷假设）。
- 无 color 风格兼容：halftone 旧格式种子（现 HEAD 生成的）在新代码下解码结果不变。
- 边界：`#000000`（index 0）与 `#FFFFFF`（index 16777215）两端往返。

## 验收

1. 任意 color 风格调色 → 种子码变化 → 应用种子 → 颜色完整还原
2. 随机按钮：颜色参数随机变化（每次点不同色）
3. 8 个无 color 风格的旧种子照常可用
4. vitest 全绿、tsc/lint 基线不变
