---
title: 注册表接入与三端验收执行
labels: [wayfinder:task]
status: closed
assignee: 主会话（已完成）
blocked-by: [04-spec-lock]
---

## Question

按票 04 锁定规格实施两风格并全量验收：StyleId + 2 frag + StyleRegistry 末位两条目 + i18n 34 键×2 + 测试用例；测试基线 329 只增不减、lint 2D 零新增；种子码新旧往返无损；三端（桌面/批量/H5）实测 + 浏览器视觉复核（toDataURL 直出、局部放大）；本地 commit 合入 main（不 push）。拉丝/珠光档浏览器实测定稿。

## Resolution

**2026-10-11 已交付本地 main（99ef607，未 push）。**

- **改动面**（9 代码文件 + 图归档）：`src/types.ts` StyleId +2；`StyleRegistry.ts` 末位两条目（holofoil 8 参数 → prism 4 参数，visibleWhen 三组）；新 `src/shaders/holofoil.frag`、`prism.frag`（均单 pass）；`zh.json`/`en.json` 各 +34 键；`StyleRegistry.test.ts` 末位断言更新 + 两风格 describe；新 `holofoilShader.test.ts`（4 用例）、`prismShader.test.ts`（4 用例，puppeteer WebGL 回归）。
- **验收**：341/341 测试（基线 329→341，+12）；lint 11 基线持平（全 3D）；`tsc --noEmit` 0 错；三端浏览器实测 **18/18 断言**——桌面（visibleWhen 三质感/三模式切换、骰子改码、旧码回填后渲染**逐字节一致**）、批量态主画布出图 2198KB、H5（风格 sheet 含新风格、选中渲染 383KB、参数 sheet 内 SeedBar 码非空）。种子码示例：holofoil 珠光态 16 字符（1C2NZHEnV8XGhA）。
- **拉丝/珠光实测定稿**：[assets/verify/](../assets/verify/) 8 图——拉丝=竖向彩虹丝带、珠光=柔彩细闪，三档气质互异成立，视觉复核通过（碎冰与样张基准一致、紫边镶边清晰）。**用户复核可砍档**的承诺仍有效，砍档只改 select options 不动码结构。
- **关键交接（写进 playbook 级教训）**：
  1. H5 实测页必须先清 `pixel-forge-session` IDB——桌面页批量会话会把 H5 恢复成批量态导致 sheet 断言全挂（playbook 2026-10-10 坑的又一实例）。
  2. shader 回归测试的程序化源图：阶跃边必须真高对比（亮线+暗带，反转公式在平坦区只给 7/255）；径向渐变幅度勿饱和（饱和区等值线消失，分离测不出）；统计排除带 `continue` 会连带跳过后续检测窗口（紫边 ratio=0 假阴性）。
