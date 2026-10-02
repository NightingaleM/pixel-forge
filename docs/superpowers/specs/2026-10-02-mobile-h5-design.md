# 移动端 H5 适配设计(方案 A · 底部抽屉)

日期:2026-10-02
状态:已确认(布局形态、范围、微信策略、会员入口、3D 处置均经用户逐项确认)

## 背景

项目当前为纯桌面布局,移动端基本不可用:

- `global.css` 零 media query:260px 固定左栏 + 悬浮面板 + `100vh`,窄屏挤爆。
- 核心交互全绑鼠标事件:画布缩放平移(`useViewport.ts` 只有 wheel/mousedown/mousemove)、3D 相机(`App3D.tsx` mousedown/wheel)、面板拖拽(`useDraggable.ts` 无触摸)。
- 导出走 `a[download]`(`App2D.downloadBlob`),微信内置浏览器不支持文件下载。

利好:所有面板组件(ParamPanel/BatchPanel/PresetPanel 等)均为纯 props 视图,由 App2D 组合;业务逻辑与视图分离良好,可一套逻辑两套皮。

## 已确认决策

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 功能范围 | 2D 单图完整可用 + 批量跟跑;3D 零投入 |
| 2 | 目标环境 | 微信内置浏览器可用是硬指标(下载改长按保存) |
| 3 | 布局形态 | 方案 A:全屏画布 + 底部 dock + 参数 Bottom Sheet |
| 4 | 代码架构 | 单代码库断点分流,不建独立移动路由 |
| 5 | 断点 | `max-width: 767px`(iPad 竖屏及以上走桌面) |
| 6 | 会员入口 | 移动端顶栏右侧小圆形图标:无文字、低存在感,已激活时点亮 |
| 7 | 3D 处置 | 完全不管;仅 Home 的 3D 卡片移动端显示「请在电脑端访问」文案 |
| 8 | 导出分辨率 | 预览画布保持原图分辨率,导出链路零改动;仅 >4096 降采样保护内存 |

## 架构

- 新建 `src/lib/useMediaQuery.ts`:监听 `window.matchMedia('(max-width: 767px)')`,SSR 无关(纯 Vite SPA),含单测(mock matchMedia)。
- App2D 顶层分流:

```
App2D(全部状态与 handlers 留守,不动)
├─ isMobile=false → <DesktopShell2D {...原有 props 集合}/>  ← 现 JSX 原样抽出
└─ isMobile=true  → <MobileShell2D {...同套 props}/>        ← 新壳,纯 props 视图
```

- 照 BatchPanel 既有模式:壳只管布局与交互接驳,不含业务状态。需要时 App2D 以回调 props 下发(如 `onOpenStyleSheet`)。
- 样式:新建 `src/styles/mobile.css`,`main.tsx` 引入;global.css 仅做必要的小改动(如 `100vh`→`100dvh` 的渐进增强写法)。
- App3D 不动。

## 移动布局(MobileShell2D)

```
┌─────────────────────────┐
│ ←  万花筒 ▾   [对比][◎]  │ 顶栏 44px + 顶部安全区
├─────────────────────────┤
│                         │
│       画布(flex:1)       │ pinch 缩放 / 单指平移 / 双击复位
│                         │
├─────────────────────────┤
│ [图1][图2][图3][+]       │ ImageStrip 横滚(现有组件,样式适配)
├─────────────────────────┤
│  下载 | 参数 | 随机 | 批量 │ 底部 dock + env(safe-area-inset-bottom)
└─────────────────────────┘
```

- **顶栏**:返回首页、当前风格名(点击弹风格 sheet)、对比切换、会员小圆图标(内联 SVG 手绘;未激活灰、激活点亮,无文字)。
- **参数 sheet**:dock「参数」触发,从底部弹出;两档高度 60%/90%,把手可拖拽(带速度吸附),点画布收起;内容复用 ParamPanel 控件(SeedBar/BuiltInPresetBar/PresetBar/滑块/select 均为现组件,容器外壳新写)。
- **风格 sheet**:顶栏触发,半屏列表复用 StyleSelector,含返回首页入口。
- **批量**:全屏覆盖层(见「批量」节)。
- **弹窗**:PresetPanel/LicensePanel/ConfirmDialog 宽度适配(≤92vw 居中)。
- **图标规范**:新增图标(dock 四键、会员圆标、行操作图标)一律手绘内联 SVG,禁 emoji(项目既有约定)。

## 触摸交互

- `useViewport.ts` 重构为 Pointer Events 统一模型:
  - 单指/鼠标 = 平移;双指 = pinch 缩放(以两指中点为锚,复用 `zoomAtCursor` 数学);wheel 保留;双击复位保留。
  - pinch/pan 姿势识别抽纯函数(输入指针轨迹序列,输出 viewport 变更),vitest 单测。
  - 桌面鼠标行为回归不变(单指针即平移,wheel 缩放)。
- CompareSlider:compare 态触摸已有(`touchmove/touchend`),不动;非 compare 态 pan 由 useViewport 接管。
- 面板自由拖拽(useDraggable)不进移动壳——sheet 不需要定位拖拽,`panelPosStore` 移动端不读写。
- 画布与 sheet 把手:`touch-action: none`,防页面跟滚。

## 导出与微信

- 新建 `src/lib/clientEnv.ts`:`isWeChat()`(UA 含 `MicroMessenger`)、`isMobileUA()` 等,纯函数 + 单测。
- 下载分流(单图 PNG/JPG):
  - 微信内:生成导出 blob → Lightbox 全屏展示导出图 + 「长按图片保存到相册」提示条(改造现有 Lightbox,加提示模式);**关闭浮层即弃 blob**。
  - 非微信移动端:维持 `a[download]`(移动 Chrome/Safari 支持)。
  - 桌面:现状零改动。
- **SVG**:移动端(含非微信)一律转 PNG 交付(Lightbox 长按保存)——系统相册不支持 SVG,长按保存必须位图;桌面照旧下载 .svg。
- 批量:
  - 微信内 ZIP → 弹「在浏览器中打开」引导(文案说明右上角菜单操作),不尝试下载。
  - 微信内单行下载 → 长按保存(同单图)。
  - 非微信照旧。
- 水印 gating 零改动:水印画在导出副本上(现有 `exportWatermarked`),长按保存的图天然带水印,无绕过。

## 批量(移动端)

- 入口:dock「批量」。
- 全屏覆盖层,复用 BatchPanel props 接口,容器与行样式重写:
  - 顶栏:标题 + 关闭。
  - 控制区:种子模式(独立/统一)与格式(PNG/JPG)改 segmented 控件 + 「随机全部」。
  - 免费用户水印横幅(batch-wm-banner)保留。
  - 行列表:桌面表格行 → 卡片流(缩略图 + 种子 badge + 状态 + 行操作图标:重试/Reroll/下载)。
  - 底部:开始处理(主按钮)+ 下载 ZIP。
- 运行中:ProgressDialog 居中卡片适配(进度 + 当前行)。
- 上传多图自动开批量浮窗的 v3 语义在移动端继承(≥2 张自动弹)。

## 会员(移动端)

- 入口:顶栏右侧小圆形内联 SVG 图标(无文字;未激活灰色、激活点亮),点开 LicensePanel。
- LicensePanel 移动端底部 sheet 化(统一交互语言):兑换码输入加大触控目标、支持粘贴,激活按钮 ≥44px。
- wmToast(水印降级提示):置于 dock 上方,sheet 打开时随之上移,不被遮挡。
- 额度/水印/设备绑定/license 链校验全在逻辑层,零改动。
- LicenseHelp(/license)信息页并入外围页单栏化。
- 购买渠道未定、入口已删:移动端无购买流程,无工作项。
- 微信内兑换码:复制粘贴即可,不特殊处理。

## 3D

- 零投入:不加触摸、不改布局、不隐藏任何功能。
- 唯一改动:Home 的 3D 卡片在移动端(同 767px 断点)显示「请在电脑端访问」角标文案(i18n 中英两份)。

## 性能

- 预览画布保持原图分辨率(与桌面一致)→ 导出零改动。
- 内存保护:加载时图片最长边 >4096 则降采样到 4096(`readImageFiles.ts` 处理,阈值常量 + 单测)。
- 画布 dpr cap 2。
- 「拖动参数时低分辨率渲染」不做,留作实测卡顿后的后续迭代。

## 外围页面与基建

- Home/About/Privacy/Terms/Help/License/NotFound:纯 media query 单栏化(卡片纵排、字号、padding)。
- `100dvh` 渐进增强(`100vh` 兜底)+ `env(safe-area-inset-*)`。
- 触控目标 ≥44px;LangSwitch 等小控件加大命中区。
- 移动端隐藏桌面 hover 专属提示(仅 2 处 hover 样式,影响小)。

## 测试与验收

- vitest:pinch/pan 纯函数、isWeChat/isMobileUA、useMediaQuery(mock)、降采样阈值、SVG→PNG 转换决策。
- puppeteer(既有 playbook):iPhone 尺寸 viewport + touch 模拟,视觉复核关键态(上传/调参/批量/会员 sheet),局部放大截图复核。
- lint:既有 11 错误基线不新增。
- 实机验收清单:微信内打开(上传→调参→长按保存;批量引导)、iOS Safari、Android Chrome。

## 风险

- 微信 X5/WKWebView 的 WebGL 兼容:ShaderRenderer 自写 WebGL,上线前须微信实机验证;不达标再议降级方案(不在本期)。
- iOS 键盘顶起 sheet:兑换码输入时视口变化,按 `visualViewport` 处理(如失败退化为 sheet 内滚动)。
- 超大图内存:>4096 降采样兜底,中端机实测确认。
