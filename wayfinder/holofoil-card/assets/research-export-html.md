# 研究票 02——转卡导出单文件 HTML：方案对比与兼容矩阵（2026-10-11）

输入：`src/shaders/holofoil.frag`（只读）。已定约束不重开：单文件 HTML、图片 base64 内嵌、参数冻结、陀螺仪＝加分项非验收项、鼠标+触摸必须稳。

出处标注约定：MDN/BCD/CanIUse＝官方文档（本次实取）；「社区」＝CSDN/博客等间接佐证；「经验判断」＝无出处，凭既有工程常识。体积数字来自本机实测（puppeteer-core 25.10 + Edge headless，2048×2048 合成图，`canvas.toDataURL` 直读＝已含 base64 ×4/3 膨胀）。

---

## 1. 三方案对比

| 维度 | (i) WebGL 实时（内嵌 holofoil.frag + base64 原图，倾角作 uniform） | (ii) 预烘焙 K 档角度帧 | (iii) CSS 近似（CSS 3D + hue-rotate + 渐变叠层位移） |
|---|---|---|---|
| 保真 | **与编辑器预览逐像素一致**（同一支 shader 原样搬运） | 离散步进＋crossfade 重影；色带是位置相关的，两帧错位混合＝局部饱和度下降，快速拖动肉眼可见（经验判断） | 差：hue-rotate 是**全局**色相旋转，无法复现「亮度梯度→逐像素色相映射」；mask（亮部+边缘出箔）静态化，动态只剩色带平移。整体观感约还原 4–6 成（经验判断） |
| 体积（2048 源） | ≈ **0.8–1.8 MB**（JPEG q85 源图 base64）＋运行时 ~30 KB | K=24 时 **4–26 MB**（2048 帧）或 1–6 MB（降 1024 帧），见体积表 | ≈ 0.7–1.6 MB（1 张渲染帧 base64）＋ ~20 KB |
| 兼容 | 依赖 WebGL1＋JS。2026 主流内核 WebGL1 全绿（CanIUse：ios_saf / and_chr / chrome 最新全 y）；微信 XWeb WebGL1 可用（社区实测，低端 Android 性能分层）；**iOS「文件」App 预览不执行 JS，三方案在这条路径上同死** | 无 WebGL 依赖（img/canvas 即可），表面兼容最好；但 2048×K 帧解码位图常驻内存 ≈16.8 MB×K，K=24≈400 MB，iOS WKWebView 有被系统杀掉的风险（经验判断）；降到 1024（≈100 MB）才稳 | 无 WebGL 依赖，兼容最好；但见保真——兼容优势买的是最差的效果 |
| 工程量 | **最低**：shader 原样字符串内嵌＋~300 行 WebGL 样板（含静态帧兜底、context lost 处理） | 中高：导出时离屏渲染 K 次＋逐帧 toDataURL（导出耗时秒级）＋运行时 crossfade 引擎＋内存策略 | 高：等于重新设计一套视觉近似，零复用，且永远「不像」 |

### 方案 (ii) 细节：K 取值与插值

- 交互是一维摆动轴（±10–15°，制图期已定手感幅度）。色带相位 `fract(band*0.35)` 对倾角敏感，15° 内色带扫过多个周期；要 crossfade 无跳变感需 Δθ≤1°/帧 → **K≈24 是下限、K≈32–36 才顺滑**（经验判断）。K 直接线性放大体积，二轴倾斜则 K² 爆炸，不建议。
- 插值写法：两层 `<img>`/canvas drawImage 交叉淡化（globalAlpha），GPU 合成可 60fps，但解决不了「错位重影」本质。
- 额外成本：导出端要跑 K 次全尺寸离屏渲染＋编码，会员导出一次多等数秒～十几秒（经验判断，2048×24 次编码）。

### 方案 (iii) 细节

- 可动元素：`perspective`+`rotate3d` 做倾卡；渐变叠层（repeating-linear-gradient 近似光谱带）随倾角平移/缩放；`mix-blend-mode: color/overlay` 叠回底图；`filter: hue-rotate()` 做整体色相漂移。
- 死穴：holofoil 的灵魂是 `grad`（亮度梯度伪法线）驱动的**逐像素**色相——CSS 滤镜全为全局操作，只能用一张静态渐变贴图位移去演，轮廓响应、碎冰 grain、闪点 sparkle 全部失去动态。

---

## 2. 兼容矩阵

「打开路径」指手机上把这份单文件 HTML 弄到可运行状态的现实链路。

| 环境 | WebGL1 | data: 纹理 | 触摸/鼠标 | 陀螺仪 | 打开路径与备注 |
|---|---|---|---|---|---|
| iOS Safari（https 托管） | ✅（CanIUse） | ✅ | ✅ | ✅ 需 requestPermission＋用户手势（MDN/BCD：静态方法 iOS 14.5+ 记录；社区主流记载 iOS 13 起强制授权） | 无本地 file:// 路径，只能托管 |
| iOS 微信内置（WKWebView） | ✅（同 WebKit 内核） | ✅ | ✅ | ⚠️ https 下理论可用，微信 WebView 对 DeviceOrientation 历史上不稳（经验判断） | **file:// 被微信主动禁用**（社区：扫码/本地路径不识别，`ERR_UNKNOWN_URL_SCHEME`） |
| Android Chrome（https / 本地 file://） | ✅ | ✅ | ✅ | ✅；BCD：Chrome 152 起也有 `requestPermission`（新权限提示），旧版直接监听 | **file:// 属 secure context**（MDN Secure Contexts 明确列表：`file:///path` ✅ Secure），本地打开不被安全策略拦 |
| Android 微信 XWeb | ✅（社区实测：three.js H5 常态可跑，低端机掉帧；PC 版微信 WebGL2 不全是另一回事） | ✅ | ✅ | ⚠️ 不稳（经验判断） | 同上禁 file://；聊天文件→「用其他应用打开」→系统浏览器（content://），一般可行（经验判断） |
| iOS「文件」App（QuickLook） | ❌ | ❌ | ❌ | ❌ | **预览不执行 JavaScript**（社区多处一致：显示源码/静态预览）→ 动态 HTML 死路 |
| 桌面 Chrome/Edge | ✅ | ✅ | ✅ 鼠标 | —（无传感器） | **最稳路径**：双击即开，鼠标拖转 |

### 手机打开本地单文件 HTML 的现实结论

- **Android**：微信/QQ 传输 → 保存 → 文件管理器或「用其他应用打开」→ Chrome（file:// 或 content://）。**可行**（经验判断，Chrome 对 file:// 页面正常执行 JS/WebGL）。
- **iOS**：Safari 无法打开 file://，「文件」App QuickLook 不执行 JS（社区佐证）。现实只有两条：a) 托管到 https 再发链接；b) 接收方装 Documents by Readdle 这类带本地浏览器的文件 App（不现实）。**iOS 的可行交付形态＝在线托管**。
- **微信直发 .html**：接收方在微信内点开只有预览/下载，需主动跳出到系统浏览器；微信内置浏览器禁 file://（社区）。
- 对三方案公平性：iOS 本地死路死在「不执行 JS/无 file://」这一层，方案 (ii)(iii) 一起死——**WebGL 依赖没有造成任何额外失地**。

### file:// 安全策略小结

- WebGL：file:// 下正常创建上下文，无限制（经验判断，长期桌面行为）。
- data: 纹理：`texImage2D` 喂 data: URI 图片无 CORS 污染问题（同源即 data: 本身），canvas 可读（经验判断）。真正的坑是 file:// 下 `fetch/XHR` 本地文件被 CORS 拦——单文件方案不 fetch，天然免疫（社区佐证）。
- 陀螺仪：MDN 标注 DeviceOrientationEvent「仅 secure context（部分或全部浏览器）」；file:// 是 secure context（MDN）→ Android 本地 file:// 理论可用（经验判断收口）。

---

## 3. 陀螺仪小节

- **iOS 13+**：`deviceorientation` 不再自动触发，必须 `DeviceOrientationEvent.requestPermission()`，且**必须在用户手势 handler 内调用**（click/touchend），返回 Promise `'granted'/'denied'`（MDN）；denied 后只能去系统设置重置。社区记载权限闸在 iOS 12.2–13 之间引入。
- **Android**：历史行为是直接 `addEventListener` 即可；BCD 显示 Chrome 152 起也提供 `requestPermission`（会弹权限提示）。写法上做三分支：有 requestPermission→按钮触发；无→直接监听；事件 200ms 无数据→静默回触摸（陀螺仪是加分项，不进主 UI，不弹打扰性提示）。
- **file:// vs https**：见上——安全上下文层面 file:// 不拦；现实拦在「iOS 无 file:// 入口、微信禁 file://」。**陀螺仪真正能登场的是 https 托管场景**。
- **触摸回退标准写法要点**（验收主路径）：
  - 容器 `touch-action: none`（阻止浏览器接管滚动/缩放手势），`overscroll-behavior: contain` 防橡皮筋；
  - 用 **Pointer Events**（pointerdown/move/up）统一鼠标+触摸，不分别写 mouse/touch 两套；
  - 事件里只更新目标倾角，渲染走 rAF 循环＋lerp 平滑＋松手回中（不在事件回调里 draw）；
  - `touch-action:none` 生效后无需 `preventDefault`；iOS 双指缩放兜底：viewport `user-scalable=no`＋`gesturestart` preventDefault（经验判断）；
  - 渲染分辨率按 `devicePixelRatio` 封顶（≤2×CSS 尺寸），低端 Android 微信省帧省电（社区：微信 WebGL 低端机复杂场景 <20fps，本 shader 单 pass 很轻，但分辨率自律仍有必要）。
  - WebGL 侧健壮性：监听 `webglcontextlost`（微信后台切换常见）→ 显示静态帧并提示刷新（社区＋经验判断）。

---

## 4. 体积表（2048×2048，base64 后 KB，实测区间）

实测两档合成图：高噪（难压上界）/低噪（易压下界）；典型真实照片介于其间、偏易压端（经验判断）。base64 ×4/3 膨胀已含。

| 编码 | 源图（方案 i 内嵌物） | 渲染帧（方案 ii/iii 内嵌物） |
|---|---|---|
| PNG | 12,128–13,908 KB（不可行） | 11,324–13,096 KB（不可行） |
| JPEG q0.85 | **749–1,781 KB** | 719–1,495 KB |
| JPEG q0.92 | 1,367–2,408 KB | 1,246–2,154 KB |
| WebP q0.75 | 297–1,373 KB | 173–1,063 KB |
| WebP q0.85 | 791–1,867 KB | 520–1,593 KB |

**各方案导出总体积**（含运行时代码）：

| 方案 | 构成 | 估算总体积 |
|---|---|---|
| (i) WebGL 实时 | 源图 JPEG q85 base64 ＋ shader+JS+CSS ≈30 KB（经验判断） | **≈ 0.8–1.8 MB**（WebP 源图可再省，但 JPEG 兜 iOS 14 前老设备最稳；2026 年 iOS 14+ 已全覆盖，WebP 可作执行期选项，CanIUse：ios_saf 全绿） |
| (ii) K=24 帧 @2048 | 渲染帧 WebP q75 ×24 | **≈ 4.2–25.5 MB**；JPEG q85 ×24 ≈ 17–36 MB |
| (ii) K=24 帧 @1024 | 渲染帧 WebP q75 ×24（面积 1/4，体积约 1/4，经验判断） | ≈ 1–6 MB（画质降档） |
| (iii) CSS 近似 | 1 张渲染帧 JPEG q85 base64 ＋ ~20 KB | ≈ 0.7–1.5 MB |

附带成本对比：方案 (i) GPU 纹理 1×16.8 MB；方案 (ii) 解码位图 24×16.8≈400 MB（2048）或 ≈100 MB（1024）常驻——iOS 内存红线（经验判断）。

---

## 5. 推荐方案与降级链

**推荐：方案 (i) WebGL 实时**，导出物内嵌 holofoil.frag 全文＋冻结参数＋源图 JPEG q85 base64，倾角作 uniform 实时驱动；内置 1 张默认角度静态烘焙帧（导出时顺手渲染，≈+0.7–1.5 MB 可换成 1024 静态帧 ≈+0.2–0.4 MB 进一步省）。

**降级链**：WebGL 上下文创建失败或 `webglcontextlost` → 显示静态烘焙帧（无交互但完整出效果）；Pointer Events 不可用的古董环境不在目标内（2026 主流全支持，经验判断）。

**不推荐 (ii)**：体积 3–15 倍、导出多等十几秒、iOS 内存红线，换来的兼容优势只覆盖「有 JS 但没 WebGL」的环境——该环境在 2026 现实中接近不存在（iOS 本地路径死在 JS 层，连带 ii/iii 一起死）。静态 PNG 角度序列＝执行期低成本附赠（制图期已定），与本方案互不冲突。
**不推荐 (iii)**：工程量最高、保真最差，且体积并不比 (i) 小（都要带一张图）——没有赢面。

**执行期注意**（供规格票）：导出编码默认 JPEG q85；静态兜底帧建议 1024 WebP/JPEG 控体积；交付文案不承诺 iOS 微信内直接打开，引导「电脑打开 / Android 任意浏览器 / iOS 需在线托管」三分法（与 Not yet specified 的交付分流项衔接）。

---

## 研究结论摘要

1. 推荐方案 (i)：WebGL 实时＝保真逐像素一致、体积最小（0.8–1.8 MB）、工程量最低（shader 原样内嵌）。
2. 方案 (ii) K 帧被体积（4–26 MB）与 iOS 解码内存（K=24@2048≈400 MB）双杀；其兼容优势场景（有 JS 无 WebGL）现实中不存在。
3. 方案 (iii) CSS 近似保真 4–6 成、体积无优势、工程量最高，无赢面；两方案均建议放弃。
4. 兼容：WebGL1 在 iOS Safari/Android Chrome/微信 XWeb 全绿；唯一死路＝iOS「文件」App 预览不执行 JS——对三方案平等，不构成 (i) 的劣势。
5. 手机本地打开：Android Chrome file:// 可行（file:// 属 secure context，MDN）；iOS 无系统级路径，交付引导在线托管或电脑打开。
6. 微信内置浏览器禁 file://，动态卡无法在微信内直接查看；微信只是传输通道。
7. 陀螺仪：iOS 13+ 必须 requestPermission＋用户手势（denied 需系统设置重置）；Chrome 152 起也有权限提示（BCD）；file:// 不被安全上下文拦截（MDN），现实只在 https 托管场景生效。
8. 触摸回退标准件：touch-action:none＋Pointer Events 统一鼠标触摸＋rAF/lerp 回中＋gesturestart 兜底——为验收主路径。
9. 降级链：WebGL 失败/上下文丢失 → 内置 1 张默认角度静态帧（附赠品，控体积用 1024）。
10. 待执行期定夺：源图编码 JPEG q85（默认）vs WebP（更小）；静态兜底帧分辨率。

## 参考出处

- MDN《Secure Contexts》：`https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts`（file:/// ✅ Secure 表格）
- MDN《DeviceOrientationEvent》：`https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent`（secure context 标注；requestPermission 语义）
- MDN browser-compat-data `api/DeviceOrientationEvent.json`（requestPermission_static：safari_ios 14.5+ / chrome 152 / firefox false）
- CanIUse `webgl` / `webp`（ios_saf 27.x、and_chr 154、chrome 157 全 y）
- 社区：CSDN（微信 WebGL 性能分层、PC 微信 WebGL2 不全、iOS 陀螺仪权限实践）、北冥有鱼（微信禁 file://）、菜鸟编程网/open-the-file.com/CSDN 问答（iOS 文件 App 不执行 JS、Documents by Readdle）
- 本机实测：puppeteer-core 25.10.0 + Edge headless，2026-10-11，C:\tmp\size_test.mjs（2048² 合成图 PNG/JPEG/WebP base64 体积）
