---
title: 样张票——转卡交互 demo（手感三参数可调）
labels: [wayfinder:prototype]
status: open
assignee:
blocked-by: []
---

## Question

制作可交互转卡 demo（独立 HTML，不入 app），供拍板门感受手感并定稿参数：

- 鼠标移动 → 卡片 CSS 3D 倾斜，**幅度 ±10–15° 区间可调**；
- holofoil 箔色随倾斜角流动（复用 `src/shaders/holofoil.frag` 或等效近似，倾斜角驱动色带 phase）；
- **idle 自摆**开关（无交互时卡片轻微自动摇摆，鼠标靠近即接管）；
- **阴影/高光随角度微动**开关（卡片立体感来源）；
- 桌面鼠标为主，触摸顺手支持（为 H5 预留判断依据）。

demo 页三个开关+幅度滑杆全部暴露给用户实操。产出落 `../assets/card-demo/`。注意：本 demo 同时是想法2（编辑器转卡预览）与想法3（导出 HTML）的共同手感基准，拍板门在此定稿幅度/自摆/阴影三值。
