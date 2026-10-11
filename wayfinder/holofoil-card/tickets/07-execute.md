---
title: 执行交付——三端验收本地合入
labels: [wayfinder:task]
status: open
assignee:
blocked-by: [06-spec-lock]
---

## Question

按常设偏好全自动执行至三端验收、本地合入 main（**不 push**），不中途请示：

- shader 改造（holofoil.frag 掩膜/角度 uniform，按票 01 方案）；参数/注册表/UI（visibleWhen）/i18n；转卡模式（编辑器+H5）；gating 格式拒绝接入 + 导出 HTML 模板（按票 02 方案+降级链，陀螺仪加分项+触摸回退）；静态 PNG 角度序列低成本附赠。
- 测试补齐（基线 341 只增不减）、lint 持平、tsc 0 错、三端断言、旧码往返无损、浏览器视觉复核（toDataURL 直出+局部放大）。
- H5 实测先清 pixel-forge-session IDB（上批教训）；交付后用户视觉复核可砍档（不影响种子码结构）。
- **执行期核对（自票 05 fog 毕业）**：微信 UA 下 HTML 交付分流——blob 下载/长按 Lightbox 是否适用 HTML，按 downloadFlow 现状核对；批量端对 holofoil 新参数的呈现——registry 驱动自动复用预期成立，核对即可。
