---
title: 样张票——转卡交互 demo（手感三参数可调）
labels: [wayfinder:prototype]
status: closed
assignee: wayfinder 主会话（2026-10-12 认领）
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

## Resolution

**已交付 [assets/card-demo/](../assets/card-demo/)（2026-10-12，verify 13/13 + 视觉复核五项过）**，拍板门素材齐备。

- **产物**：`index.html`（单文件 demo，`file://` 双击即用）+ `images.js`（三素材 JPEG base64 内嵌共 ~478KB，`prep-images.mjs` 生成）+ `verify.mjs` + `verify/` 6 图归档。
- **手感实现（全部暴露给用户实操）**：幅度滑杆 5–20° 默认 12；三开关＝箔色随倾角流动 / 闲置自摆（静止 2.5s 接管，摆幅 0.42 满幅、双轴 Lissajous）/ 阴影高光微动（斜向光带滑移＋侧旋暗角＋投影偏移）；另附质感三档、素材三选（car/山景/卡通，默认卡通＝主场）、光谱强度、rx/ry/状态/帧率实时读数。指针统一走 Pointer Events（触摸顺手支持，stage `touch-action:none`）。
- **与导出 HTML 同构**：单文件＋图片 base64 内嵌＋WebGL 实时渲染 holofoil.frag＋倾角作 uniform——即研究票02 推荐方案 (i) 的落地雏形，手感结论可直接迁移想法3。
- **shader 注入**：`band += dot(vec2(uTiltX,uTiltY), dir) * 2.6`（倾角向量投影到色带方向，满幅约 0.4 个谱周期）；倾角 lerp 阻尼 0.10/帧。
- **实测修正（执行票必须带上）**：纹理上传**必须 `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)`**——漏设导致卡面上下颠倒（app 先例 `ShaderRenderer.ts:119`；导出 HTML 生成器同样要设）。`uResolution` 传**纹理分辨率**（步进按纹理走，票03 教训在 demo 已按正确语义实现）。视觉注意：vision 模型会把「拉丝高饱和观感」误判为渲染 bug——app 用户认可的同参定稿样张（2d-new-effects verify/holofoil-1-streak）被同样误判，属风格固有观感非缺陷。
- **验证**：Edge headless 13/13——页面无错误/WebGL 初始化/初始渲染非空/倾角响应（极位 rx=ry≈10°@12°档、≈16°@18°档）/倾角变化重渲、关流动后严格不变（tilt uniform 恒 0）/闲置 3.5s 进自摆且在动/光效开关显隐与投影变化/质感与素材切换重渲。视觉复核：倾角反向后各区域主导色相重排（色带相位平移成立）、倒图修复后主体正立、布局与手绘 SVG 图标合规无 emoji。
- **给拍板门的定稿问题**：① 幅度默认值（现 12°，5–20 可滑）；② 自摆默认开还是关；③ 阴影高光默认开还是关；④ 流动增益 2.6 的观感（转多快流多快）。

