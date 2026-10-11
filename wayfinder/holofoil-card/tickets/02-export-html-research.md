---
title: 研究票——转卡导出 HTML 方案与兼容矩阵（含陀螺仪）
labels: [wayfinder:research]
status: open
assignee: 研究子代理（建图时已发）
blocked-by: []
---

## Question

转卡导出**单文件 HTML** 的技术方案对比 + 运行环境兼容矩阵（2026-10 时点）。已定约束（不得重开）：单文件、图片 base64 内嵌、冻结参数、陀螺仪＝加分项非验收项、鼠标+触摸必须稳。

1. **三方案对比**：(i) 导出 HTML 内嵌 WebGL + holofoil.frag + base64 原图，倾斜角作 uniform 实时驱动；(ii) 导出时预烘焙 K 档角度帧（K 取值建议、每帧 2048 PNG/WebP/JPEG base64 体积估算、插值过渡质量）；(iii) CSS 近似（CSS 3D + 动态 hue-rotate/渐变叠层位移）。保真/体积/兼容/工程量四维评估。
2. **兼容矩阵**：微信内置浏览器（X5/XWeb）、iOS Safari、Android Chrome；手机上打开本地单文件 HTML 的现实路径（iOS 文件 App→Safari？微信传输？）；file:// 下 WebGL、data: 纹理、陀螺仪是否被安全策略拦截。
3. **陀螺仪**：DeviceOrientationEvent.requestPermission 的 iOS 13+ 手势触发要求、Android 权限流、file:// vs https 可用性；触摸拖动回退的标准写法要点（touch-action 等）。
4. **体积表**：2048 源图下三方案导出文件体积估算（含 base64 膨胀 4/3）。

输入：`src/shaders/holofoil.frag`（要被带进导出物的核心 shader，只读）。浏览器行为论断尽量给出处（MDN/CanIUse/微信官方文档），给不出处标「经验判断」。

产出落 `../assets/research-export-html.md`：方案对比表、兼容矩阵表、陀螺仪小节、体积表、推荐方案+降级链 + 结论摘要 ≤10 行。
