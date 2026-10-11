---
title: 研究票——转卡导出 HTML 方案与兼容矩阵（含陀螺仪）
labels: [wayfinder:research]
status: closed
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

## Resolution

**2026-10-11 研究完成**，全文见 [assets/research-export-html.md](../assets/research-export-html.md)（体积数字为本机实测，puppeteer+Edge headless，脚本留存 C:\tmp\size_test.mjs；出处 MDN/BCD/CanIUse 实取）。结论：

1. **推荐方案 (i) WebGL 实时**：导出 HTML 内嵌 holofoil.frag 全文 + 冻结参数 + 源图 JPEG q85 base64，倾角作 uniform 实时驱动——与编辑器预览**逐像素一致**、体积最小（**0.8–1.8 MB**）、工程量最低（shader 原样搬运 + ~300 行样板）。
2. **方案 (ii) K 帧否决**：K=24@2048 体积 4–26 MB、解码位图常驻 ≈400 MB 踩 iOS 内存红线；其兼容优势只覆盖「有 JS 无 WebGL」环境，2026 现实中不存在。**方案 (iii) CSS 近似否决**：hue-rotate 是全局色相旋转，复现不了逐像素梯度色相映射，保真仅 4–6 成且体积无优势。
3. **降级链**：WebGL 创建失败/上下文丢失 → 显示内置 1 张默认角度静态烘焙帧（导出时顺手渲染，1024 控体积 ≈+0.2–0.4 MB）+ 提示刷新。
4. **兼容矩阵**：WebGL1 在 iOS Safari/Android Chrome/微信 XWeb 全绿；**Android 本地 file:// 可行**（MDN：file:// 属 secure context）；**iOS 无本地打开路径**——「文件」App 预览不执行 JS（三方案同死，非 WebGL 劣势）、Safari 无 file://、微信禁 file://（微信只是传输通道）→ **iPhone 上动态卡的现实交付形态＝在线托管或电脑打开**（已挂拍板门裁决）。
5. **陀螺仪**：iOS 13+ 必须 requestPermission 且在用户手势内调用；Chrome 152 起也有权限提示（BCD）；现实只在 https 托管场景登场；微信 WebView 不稳（经验判断）——与「加分项非验收项」定位吻合。**触摸回退标准件**＝touch-action:none + Pointer Events 统一鼠标触摸 + rAF/lerp 回中 + gesturestart 兜底 + DPR 封顶 ≤2，为验收主路径。
6. **执行期待定**：源图编码 JPEG q85（默认兜底）vs WebP（更小，2026 iOS 全绿）；静态兜底帧分辨率。
