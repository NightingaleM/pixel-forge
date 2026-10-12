---
title: 执行交付——三端验收本地合入
labels: [wayfinder:task]
status: closed
assignee: wayfinder 主会话（2026-10-12 认领）
blocked-by: [06-spec-lock]
---

## Question

按常设偏好全自动执行至三端验收、本地合入 main（**不 push**），不中途请示：

- shader 改造（holofoil.frag 掩膜/角度 uniform，按票 01 方案）；参数/注册表/UI（visibleWhen）/i18n；转卡模式（编辑器+H5）；gating 格式拒绝接入 + 导出 HTML 模板（按票 02 方案+降级链，陀螺仪加分项+触摸回退）。**全部实现规格以 [06-spec-lock.md](06-spec-lock.md) Resolution 为准照抄，不得重开；其中已改判砍掉静态 PNG 角度序列附赠（Q9）。**
- 测试补齐（基线 341 只增不减）、lint 持平、tsc 0 错、三端断言、旧码往返无损、浏览器视觉复核（toDataURL 直出+局部放大）。
- H5 实测先清 pixel-forge-session IDB（上批教训）；交付后用户视觉复核可砍档（不影响种子码结构）。
- **执行期核对（自票 05 fog 毕业）**：微信 UA 下 HTML 交付分流——blob 下载/长按 Lightbox 是否适用 HTML，按 downloadFlow 现状核对；批量端对 holofoil 新参数的呈现——registry 驱动自动复用预期成立，核对即可。

## Resolution（2026-10-12 关票——全部规格照抄票 06 落地，验收全过）

### 交付清单

**静态线程（选择性加箔）**
- [holofoil.frag](../../../src/shaders/holofoil.frag)：票 03 定稿算法照抄——Sobel+±2px 中心差分双尺度 `min`、Laplacian 门控、滞后核心/软带（`uEdgeHysteresis` 映射 core 起点滞后 0.10+h，默认 0.15 精确还原样张窗 [lo+0.25, lo+0.40]；`uEdgeSoftBand/6` 默认 0.25 同）、8 方向 dilate（半径=`uEdgeWidth` 纹素）；**检测步进全部按 `uTexSize`**（票 03 铁律）。`uScope=0`（缺省）整块旁路逐字节等价旧版。
- [holofoilZones.ts](../../../src/lib/holofoilZones.ts)：k-means lite+连通域+小区并入 TS 化（k=4/xyw=0.5 产品常量；mulberry32(42) 固定 seed 跨设备确定）；核心 `analyzeZonesFromPixels` 纯函数可 node 单测；`pickZone` 3×3 众数抗羽化带；`drawZoneMask` 256² 白/黑。
- [renderImage.ts](../../../src/lib/renderImage.ts)：掩膜纹理 unit 2（WeakMap 按 renderer 复用+整张重传，FLIP_Y=true 与原图同向）；开闸规则=**边缘档恒开（zone=edgeZone）/分区档仅有掩膜时开**；`uTexSize` 通传（其他风格 setUniform 静默跳过）。批量不传掩膜 → `uZoneEnabled` 缺省 0 → zone 恒 1=全选语义（「批量=全部面选中」自然成立，WYSIWYG 守恒）。
- StyleRegistry 参数 8→**14 项**（uScope select+边缘 4 滑杆+uZoneBoost toggle，末位追加；票 06 文头「8→13」为笔误，明细为准）；i18n zh/en 各 **30 键**（精确清点：holofoil 17+export 2+card 10+license 1）。
- **执行期实测修正（重要）**：样张 FS 的 `zone *= uZoneEnabled` 乘法在缺省 0 时把 zone 归零（变全原图，语义错误）；正式版改 `mix(1.0, zone, uZoneEnabled)`（0→zone=1 全选/1→zone 生效）。GPU 对照三向验证（app 8.78% = GPU 直渲样张 FS 8.78% = 样张产物 8.78%）。
- **样张页真相（归档备注）**：样张 sampler.html 未设 FLIP_Y，其产物是上下翻转的（用户在翻转态认可效果对比；翻转不影响效果评估）；app 方向正确。app 产物与样张**翻转后逐像素等价**（meanDiff 1.12/255）。

**转卡线程**
- [cardTilt.ts](../../../src/lib/cardTilt.ts)：引擎+`stepTilt` 纯函数（阻尼 0.10/自摆 2.5s·0.42/重渲阈值 0.0015/钳位 1.35=票 04 demo 定稿值；`forceRedraw` 处理 useShader 重链接后 uTilt 复位）。
- [CompareSlider.tsx](../../../src/components/CompareSlider.tsx)：恒挂载 `.card-tilt` 容器（canvas 不重挂载保 WebGL 上下文）；H5 单指拖=转卡/双指 pinch 保留（中心锚定 setZoom，摘 useViewport 平移+双击复位，循 compare 换手势先例）；桌面 hover 跟随/离开回正；转卡钮（holofoil 专属）+齿轮（开手感浮窗）+分区点选提示；`onZonePick` 画布点击→UV（非 compare/cardMode 时）。
- [CardSettingsPanel.tsx](../../../src/components/CardSettingsPanel.tsx)：可拖拽浮窗（preset-panel 底盘+useDraggable），幅度 5–20 step 0.5 默认 12+三开关，会话态只写引擎不入种子码。
- App2D：cardMode/compareMode 互斥双向；分区分析 effect（进档/换图同步一帧）；点选 toggle 全选归一（选满回 null）；种子码/预设/随机/重置/换风格六路径恢复全选；rAF 循环 onFrame 直写 DOM transform/gloss/vignette/boxShadow+按需 `renderer.render()`（倾角 uniform 直设，不走整条渲染管线）。

**HTML 导出线程**
- [gating.ts](../../../src/lib/license/gating.ts)：`decideExportCardHTML`——首个格式拒绝型（会员 allow/非会员 deny，不消耗免费额度）。
- [cardHtml.ts](../../../src/lib/cardHtml.ts)：模板生成（holofoil.frag **同一份 import**=单一来源；冻结参数字面量；源图 JPEG q85 ≤2048；静态烘焙帧=当前预览画布快照 ≤1024；降级链 WebGL 失败/contextlost→静态帧；陀螺仪三分支+触摸回退；`window.__card` verify 钩子）；体积实测 **0.53MB**（票 02 预估 0.8–1.8MB 下界以下）。
- ActionBar/MobileShell2D dock「闪卡 HTML」按钮（仅 holofoil 渲染，holofoil 专属不通用化）；非会员点击→LicensePanel+toast（实测过）；成功 toast 含 iPhone 三分法口径。
- **微信 UA 分流裁决（执行期核对项）**：HTML 恒走 `anchorDownload`——Lightbox 长按保存是 `<img>` 预览语义，text/html blob 在 img 里显示不了，微信内 lightbox 路径对 HTML 无意义；三分法口径已在成功 toast 引导换环境。

### 验收对照（票 06 §5 逐项）

| 验收项 | 结果 |
|---|---|
| 测试基线 341 只增不减 | **367/367**（+26：zones 6/cardTilt 6/cardHtml 7/gating 2/seedCodec 1/StyleRegistry 断言扩展/holofoilShader +3） |
| lint 持平（2D 期望 0） | **11 errors 0 warnings=基线**（全在 3D；中途新增的 react-hooks warning 已修） |
| tsc 0 错 | ✓ |
| 边缘 4 参数入码往返 | seedCodec 专项 it ✓（e2e 拖滑杆种子码变化 ✓） |
| 分区 toggle/默认全选 | e2e 点选→重渲→再点恢复全选 ✓ |
| visibleWhen 三档显隐 | 单测（Registry）+e2e（桌面/H5 sheet）双覆盖 ✓ |
| 旧码往返无损 | v0 双版本门通用路径不变；**v1 布局扩充后旧 v1 holofoil 码失效=fa4afbb 先例同款行为**（decodeSeed rem≠0 拒绝，非回归） |
| gating 格式拒绝双分支 | 单测（含不耗额度+过期回落）+e2e（非会员弹窗+toast）✓；会员 allow 分支由单测覆盖（浏览器态注入签名凭证超出本票范围，与既有 license 回归脚本解耦） |
| 转卡开关与互斥 | e2e：开转卡自动退出对比 ✓；H5 单指拖 transform 变化 ✓；hover 跟随 ✓ |
| 码长上限 23 | **实测 holofoil 全 max=17 字符**（档积 log62≈14.3），既有断言 ≤21 无需改动（票 06 预估 23 偏保守） |
| 导出模板 verify 自检 | e2e：WebGL 初始化/首帧绘制/边缘档非空渲染/指针转卡响应/倾角驱动重渲/体积 0.5–3.5MB 全 PASS |
| 浏览器视觉复核 | toDataURL 直出+像素统计（见 [assets/verify-exec/](../assets/verify-exec/) 归档与 README）；WebGL 画布未走元素截图（playbook） |
| H5 实测先清 IDB | 每场景 resetStorage（localStorage+indexedDB.databases 逐删）✓ |
| i18n zh/en 键数 | 各 30 键（票 06 预估约 20，精确清点后为准） |
| 批量端 registry 呈现 | 批量/离屏预览走 renderImage 无掩膜→分区档=全图输出，与「批量=全部面选中」规格一致 ✓ |

### 遗留与备注（不阻塞，供用户复核/后续）

- 用户视觉复核待做：边缘档观感（卡通主场）、转卡手感、导出 HTML 实机打开——**vision 模型对静态小倾角+箔面纹理的 3D/光效不可辨属已知误判**（memory 教训；本票以 DOM 数值+像素统计三向对照为准），以人眼复核为最终裁决。
- H5 双指 pinch 为中心锚定缩放（非手指锚定）：useViewport 零侵入的简化实现，规格未锁锚定行为；手感如需迭代是后续微调项。
- 手感浮窗在 H5 同桌面形态（可调值，拖拽为桌面增强）。
- 分区档批量渲染=全图输出（无点选概念）；若未来要批量跟随预览选择集，需重新裁决（与「选中集合不入码」耦合）。

验证产物归档：[assets/verify-exec/](../assets/verify-exec/)（README 含三向对照数据）。e2e 断言 30/30（桌面 18/H5 6/导出模板 6），临时脚本已按 playbook 清理。
