---
title: 规格收口与设计确认
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder 主会话（2026-10-12 认领）
blocked-by: [05-gate-grilling]
---

## Question

按拍板门裁决锁定全部实现规格并过设计确认门：

- **holofoil 新参数表**：「应用范围」select（全图/边缘/…，拍板门定档位集）+ 各范围子参数（阈值/宽度/分区方案等），末位追加保旧码，visibleWhen 条件显隐；入码+随机规则；i18n 键数（zh/en）。
- **种子码「选中区集合」编码方式**（票 01 风险项，必裁决）：特征整数化保跨设备复现，还是选择集仅设备本地不入码（后者的种子码更稳，与前「转卡设置不入码」同逻辑）。
- **转卡模式 UI**：预览区开关形态、桌面鼠标/H5 触摸行为、手感三参数去向（固定常量 or 隐藏设置）。
- **HTML 导出接入**：gating 新增「格式拒绝」型决策（非会员弹会员提示=转化入口，复用 `getLicenseStatus`/gating 收口）；会员无水印；单文件 base64；冻结参数；导出按钮桌面+H5 挂点（ActionBar/MobileShell2D）；导出 HTML 模板结构（按票 02 定稿方案）。
- **验收标准**：测试基线 341 只增不减；lint 持平（2D 期望 0）；三端 18 项断言+批量新参数核对；旧码往返；浏览器视觉复核按 playbook。

确认后毕业执行票；执行票照抄本票，不得重开。

## 上游裁决（票 05 已关，2026-10-12）

拍板门全部裁决见 [05-gate-grilling.md](05-gate-grilling.md) Resolution，锁规格时直接照抄不重议。要点：双线程保留；点选面**做**——**多选/容差/误点撤销等交互细节在本票细化**；掩码双语义选项、默认仅烫箔；分区 k=4/xyw=0.5；手感四值（幅度 12°/自摆默认开/阴影微动默认开/增益 2.6）为产品常量不入码；导出 HTML 陀螺仪内置；iPhone 三分法口径一句话进导出成功提示。

## Resolution（2026-10-12 关票，用户逐条裁决 Q1–Q13）

设计确认门已过。执行票 07 照抄本 Resolution，不得重开。两处对推荐的改判已并入：**边缘档开放 4 滑杆**（Q2）、**转卡手感开悬浮窗**（Q6）；其余照推荐锁定。

### 1. holofoil 新参数表（末位追加，保旧码；表 8→13）

- **`uScope` select「应用范围」**：0=全图（默认，旧码等价）/ 1=边缘 / 2=自动分区；入码+随机（select 惯例）。旧码缺参走 `mergeWithDefaults` 回默认 0（fa4afbb 三层兼容路径：双版本门→mergeWithDefaults→decode 失败 return false，均现成）。
- **边缘档（visibleWhen uScope===1）4 根滑杆**，全部入码+均匀随机（与 uStrength 同待遇，不进 `SKIP_RANDOM_UNIFORMS`）：
  - `uEdgeThreshold` 边缘阈值 0.1–0.9 step 0.05 默认 0.5（样张有效区间 0.35–0.65）
  - `uEdgeWidth` 边缘宽度 1–6 step 0.5 默认 2
  - `uEdgeSoftBand` 软带羽化 0.5–3 step 0.5 默认 1.5（自算法常数升格）
  - `uEdgeHysteresis` 滞后容差 0–0.4 step 0.05 默认 0.15（自算法常数升格，高纹理弥漫抑制）
  - Laplacian 门控、双尺度混合、A+B 算子组合＝内部常量封死不暴露。
  - i18n 提示一行：「边缘模式更适合卡通/插画」（照片观感差为票 03 实测）。
- **分区档（visibleWhen uScope===2）**：
  - `uZoneBoost` toggle「选中区效果增强」默认 0（=仅烫箔，拍板门默认）；入码不随机（toggle 惯例）。
  - k=4 / xyw=0.5 固定产品常量，不入码不暴露（保同码跨设备分区一致）。
  - 点选交互：点面 toggle 选中/取消（多选=逐面累加）；预览区提示文案「点击画面选择/取消加箔区域」；误点撤销=再点一次该面（无独立撤销栈）。恢复/随机/种子码态＝**全部面选中**（等同未做过取消）。
- visibleWhen 只影响显示不影响入码（[ParamPanel.tsx:259-260](../../../src/components/ParamPanel.tsx) filter 先例；prism uMode 同构）。
- **检测步进必须按纹理分辨率 uTexSize**（票 03 铁律，app 版 holofoil 同修）。
- 码长：追加后约 21→23 字符，`seedCodec` 码长上限断言同步更新。

### 2. 种子码「选中区集合」

**不入码**（票 01 风险项裁决）：设备本地会话态；种子码恢复、随机、批量＝全部面选中默认态。与「转卡设置不入码」同逻辑。种子码只管 uScope 与参数，面集合是即席编辑态。

### 3. 转卡模式 UI

- **开关**：预览工具条「转卡」toggle 按钮（手绘内联 SVG 图标+文字，选中态高亮）；**与 compare 对比模式互斥**（开转卡自动退出 compare，反之亦然）。
- **桌面**：鼠标移动即跟随（无需按住，照 demo：pointermove 归一化钳位），离开/抬手目标倾角归 0 缓回正，idle 2.5s 后 Lissajous 自摆。
- **H5**：单指拖＝转卡（`touch-action` 约定照 demo）；**双指缩放保留**（循 compare「按模式换手势」先例：转卡模式摘 useViewport 单指平移/双击复位，保留 pinch；[CompareSlider.tsx:121-122](../../../src/components/CompareSlider.tsx) 形态）。
- **手感悬浮窗**：转卡开启后预览角落出现齿轮按钮（SVG）→ 打开可拖拽浮窗（复用 LicensePanel/preset-panel 浮窗底盘先例），内含：
  - 幅度滑杆 5–20° step 0.5 默认 12
  - 三开关「箔色流动 / 闲置自摆 / 阴影微动」默认全开
  - 流动增益 2.6、阻尼 0.10、重渲阈值 0.0015、自摆比例 0.42 等其余手感值＝产品常量封死。
  - **浮窗调值不入种子码**（会话态，刷新回默认——拍板门「转卡设置不入码」一致）。
- **执行必带（demo 04 实测修正）**：纹理上传 `UNPACK_FLIP_Y_WEBGL=true`（漏设=卡面倒置，先例 [ShaderRenderer.ts:119](../../../src/lib/ShaderRenderer.ts)）。

### 4. HTML 导出接入

- **按钮**：桌面 ActionBar + H5 MobileShell2D dock 各加「闪卡 HTML」按钮与现有格式并列（shader 模式排布＝下载(PNG)+JPG+闪卡HTML）；一格式一按钮一 handler 惯例。
- **gating 首个「格式拒绝」型**：新增决策（如 `decideExportCardHTML(now)`）——非会员＝拒绝：**直接打开 LicensePanel**（转化入口；桌面浮窗/H5 全屏遮罩双形态现成）+ toast「HTML 导出为会员专属」（zh/en）；会员＝放行且无水印。不消耗免费每日额度（格式拒绝先于额度判定）。
- **模板**照票 02 定稿方案：WebGL 实时 + holofoil.frag 冻结参数 + 源图 JPEG q85 base64 内嵌 + 降级链（WebGL 失败→内置静态烘焙帧）+ 陀螺仪内置（iOS 权限按钮+触摸回退）；单文件 file:// 双击即用（card-demo 即雏形）。
- 内嵌源图分辨率照现有单图导出逻辑（上限 2048）；文件名沿用现有导出命名惯例 + `.html`。
- 导出成功提示含 iPhone 三分法口径一句话（照票 05 定稿口径）。
- **静态 PNG 角度序列附赠：砍掉**（对票 02「低成本附赠」的改判，用户 Q9 确认——HTML 降级链已覆盖无 WebGL 场景，无独立使用场景）。

### 5. 验收标准

- 测试基线 **341 只增不减**；lint 持平（2D 期望 0，基线 11 全在 3D）；tsc 0 错。
- 三端断言在现有 18 项上新增：边缘 4 参数入码往返、分区 toggle/默认全选、visibleWhen 三档显隐、旧码（v0/v1 缺参）往返无损、gating 格式拒绝双分支（会员/非会员）、转卡模式开关与互斥、码长上限 23。
- **导出 HTML 模板自带 verify 自检断言**（照 card-demo verify 13/13 先例，浏览器实测直出）。
- 浏览器视觉复核按 playbook（WebGL 画布 canvas.toDataURL 直出+局部放大复核）；H5 实测先清 pixel-forge-session IDB。
- i18n zh/en 各约 20 键（应用范围 4+边缘 4+提示 1+分区 toggle 1+点选提示 1+转卡按钮 1+悬浮窗 5+导出按钮/toast/成功提示 3；执行票精确清点）。
- 执行期核对项不变：微信 UA 下 HTML 交付分流（blob/长按 Lightbox 是否适用 HTML）、批量端 registry 驱动呈现——见票 07。

### 关键事实依据（本票核查，2026-10-12）

种子码：[seedCodec.ts](../../../src/lib/seedCodec.ts)（混合进制载荷/双版本门）、[randomSeed.ts](../../../src/lib/randomSeed.ts)（均匀随机+snap、SKIP 名单含 uAngle 不含 uBandAngle）。holofoil 8 参数：[StyleRegistry.ts:360-379](../../../src/lib/StyleRegistry.ts)。gating 现形态：[gating.ts:10-18](../../../src/lib/license/gating.ts)（仅水印二元组，无格式拒绝先例）。LicensePanel 双形态：[LicensePanel.tsx](../../../src/components/LicensePanel.tsx)。demo 交互与 UNPACK_FLIP_Y：[card-demo/index.html](../assets/card-demo/index.html)。
