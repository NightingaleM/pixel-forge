---
title: 全息箔闪卡——选择性加箔 + 3D 转卡交互与导出
labels: [wayfinder:map]
status: open
tracker: local-markdown
---

## Destination

把全息箔从「全图静态滤镜」升级为「闪卡」，两条线程经 研究→样张→拍板门→锁规格→全自动执行 交付本地 main（不 push）：**静态线程**＝边缘/自动分区选择性加箔（holofoil 新参数，三端+批量全量）；**转卡线程**＝holofoil 专属 3D 转卡预览（桌面鼠标+H5 触摸）+ 单文件转卡 HTML 导出（**会员专属格式**，非会员只能导出图片）。拍板门可砍整条线程，互不连坐。

## Notes

- **领域事实（2026-10-11 实测）**：
  - holofoil 现状：单 pass shader `src/shaders/holofoil.frag`，styles[12]，8 参数（质感三档/强度/密度/角度/底色/三条件密度，visibleWhen），亮度梯度伪法线→光谱色带映射；prism 紫边模式有 luma 梯度检测先例。
  - 会员体系完整可用：license/兑换码制 `src/lib/license/`，判定 `getLicenseStatus().active`（verify.ts:279），会员×额度唯一收口 `src/lib/license/gating.ts:10`（decideSingleExport/decideBatchExport）；语义＝会员导出无水印、免费每日 5 次无水印单图后右下角水印、免费批量恒平铺；购买入口已删（c807ee6）但激活/续费 UI 完整。localStorage 键 `pixel-forge.license.v2` 等。
  - 导出管线：一格式一按钮一 handler（ActionBar.tsx:23 / MobileShell2D.tsx:153 / App2D.tsx:1128 起），水印 watermark.ts（canvas corner/tiled + SVG 注入），交付 downloadFlow.ts（微信 UA 长按 Lightbox）。批量 BatchFormat 枚举共 4 处挂点（batchJob.ts:8 / BatchPanel.tsx:166 / runBatch.ts:168-188 / App2D.tsx 接线）。全库无 HTML 导出痕迹，无 card/转卡代码。
  - 测试基线 **341**；lint 基线 11（全在 3D，2D 期望 0）；渲染上限 2048；tsc 0 错；三端 18 项断言（桌面/批量/H5）。
- **制图期已定约束（grilling R1 Q1–Q8 + R2 Q1–Q7，票内不得重开）**：
  - 路径模式：研究→样张→拍板门→锁规格→全自动执行（沿用两次已验证模式）。
  - 一张图两线程：静态（想法1）与转卡（想法2+3）；拍板门可砍线程。
  - 想法1 分层：边缘加箔 + 自动分区进样张；**点选开关面＝样张后裁决**（粗 demo 进第一轮样张，直面旧「手摆蒙版」裁决）；**AI 语义分割出局**。
  - 想法1 载体：holofoil 追加「应用范围」select（参数表末位，保旧码兼容），范围子参数 visibleWhen 条件显隐；参数表 8→11–13 可接受；入码+随机照旧。
  - 想法2 落点：holofoil 专属「转卡模式」开关（预览区），**不通用化**；转卡设置**不入种子码**；手感三项（幅度 ±10–15° demo 可调 / idle 自摆 / 阴影高光微动）进 demo、拍板定稿。
  - 想法3 形态：**单文件 HTML**（图片 base64 内嵌）、**冻结参数**（查看者只能转卡）；静态 PNG 角度序列＝执行时低成本附赠；**SVG 动态导出放弃**。
  - 会员墙（用户改判，覆盖制图期原推荐）：**HTML 导出＝格式级会员专属**，非会员只能导出图片（点导出弹会员提示＝转化入口）；**会员导出 HTML 无水印**（与现有会员语义一致）；gating 首次出现「格式拒绝」型决策。
  - 陀螺仪：加分项非验收项——导出 HTML 内置 + iOS 权限按钮 + 触摸回退；验收只覆盖鼠标/触摸。
  - 三端分工：想法1 三端+批量全量；想法2 桌面鼠标+H5 触摸（陀螺仪 H5 彩蛋待评估）；想法3 导出入口桌面+H5；批量无动态导出。
- **常设偏好（执行票必须遵守）**：设计确认后全自动执行、不中途请示；本地 commit 合入 main、**不主动 push**；lint 不新增；测试基线 341 只增不减；UI 图标手绘内联 SVG 禁 emoji；浏览器实测按 memory 中 browser-verification-playbook（WebGL 画布必须 canvas.toDataURL 直出、局部放大复核）。
- **种子码铁律**：不新增风格、不动 styles 位置（holofoil=styles[12]）；新参数**末位追加**，旧码缺参走默认（fa4afbb 先例）；风格序号入码不变。
- **技能说明**：本环境无 research / prototype / domain-modeling 技能——研究票以通用 web 搜索子代理代替（WebSearch 优先，报额度/限流即降级 zhipu_web_search，见全局 CLAUDE.md）；原型票以轻量 demo 页/样张页代替。
- **Tracker 约定（local-markdown）**：本图自带子目录（map.md + tickets/ + assets/）。票 frontmatter：`labels`（wayfinder:research/prototype/grilling/task）、`status`（open/closed）、`assignee`（认领即填）、`blocked-by`（文件名 stem 列表）。前沿 = open + 无 assignee + blocked-by 全 closed。关票：正文追加 `## Resolution` 记答案，status 改 closed，本图 Decisions so far 加一行指针。

## Decisions so far

- [研究票——边缘检测与自动分区选型（选择性加箔）](tickets/01-partition-research.md): 三层全可行——边缘＝单 pass Sobel+多基线 max+smoothstep（prism idiom 照搬，全图模式零改动保旧码等价）；分区＝自研 k-means lite 256² 低清格+连通域（<50ms 桌面/<150ms 移动；ml-kmeans 备选，SLIC/opencv.js/image-q 出局）；点选＝label grid O(1) 查表；掩膜走 textraster 图集管线 + uZoneMask/uZoneEnabled 默认 0。风险：分区跨设备复现性→种子码选中集合编码方式已并入票 06 裁决。全文见 [assets/research-partition.md](assets/research-partition.md)。
- [样张票——静态线程样张（边缘/分区/点选粗 demo）](tickets/03-static-samples.md): [assets/sampler-static/](assets/sampler-static/) 交付（三素材 car/scene2/cartoon 各 13 渲染+debug 场+verify 25/25 断言+视觉复核五项过），边缘/分区/点选成立。**实测修正**：边缘方案升级 A+B+Laplacian 门控+滞后阈值近似+双尺度一致（纯阈值在高纹理照片弥漫 31%→收敛 1.3%；demo ~150 fetch/px 执行票须优化）；**检测步进必须按纹理分辨率 uTexSize**（350px 卡通放大渲染时 canvas 步进摊薄梯度 2.7× 全漏检；app 版 holofoil 同有此解耦，正式版必须修）；分区默认 k=4/xyw=0.5；小区并入须批量收敛+Uint16；两种掩码语义入拍板门。**2026-10-12 用户反馈定案**：照片素材边缘观感差、卡通/插画为主场（cartoon 轮廓镭射描边成立）；边缘检测阈值/宽度**对用户开放自调**（用户已定方向）——均入拍板门票 05 第 3 条。
- [研究票——转卡导出 HTML 方案与兼容矩阵](tickets/02-export-html-research.md): **推荐方案 (i) WebGL 实时**——内嵌 holofoil.frag+冻结参数+源图 JPEG q85 base64，倾角作 uniform，逐像素保真、0.8–1.8 MB、工程量最低；K 帧被体积+iOS 内存双杀、CSS 近似保真仅 4–6 成，均否决；降级链＝WebGL 失败→内置静态烘焙帧。兼容：WebGL1 全绿（含微信 XWeb）、Android file:// 可行（MDN secure context）；**iPhone 无本地打开动态 HTML 的路径→交付形态＝托管或电脑打开**（已挂拍板门）；陀螺仪现实只在 https 托管场景生效，触摸回退标准件已定。体积为本机实测。全文见 [assets/research-export-html.md](assets/research-export-html.md)。
- [样张票——转卡交互 demo（手感三参数可调）](tickets/04-card-tilt-demo.md): [assets/card-demo/](assets/card-demo/) 交付（单文件 base64 内嵌，file:// 双击即用，即导出 HTML 方案雏形）——幅度滑杆 5–20° 默认 12、三开关（箔色流动 band+=dot(tilt,dir)*2.6 / 闲置自摆 2.5s / 阴影高光微动）、质感三档+素材三选+实时读数；verify 13/13＋视觉复核五项过。**实测修正（执行票必带）**：纹理上传必须 `UNPACK_FLIP_Y_WEBGL=true`（漏设=卡面倒置，app 先例 ShaderRenderer.ts:119）；拉丝高饱和观感会被 vision 模型误判为 bug（与 app 用户认可定稿同观感）。拍板门定稿四问：幅度默认值/自摆默认/阴影默认/流动增益 2.6。
- [拍板门——线程砍留与手感定稿](tickets/05-gate-grilling.md): **双线程全保留**；iPhone 现实接受+三分法文案口径；点选面**做**；掩码**双语义选项、默认仅烫箔**；分区 k=4/xyw=0.5 照准；**手感四值定稿**（幅度 12°/自摆做且默认开/阴影微动做且默认开/流动增益 2.6，产品常量不入码）；分区算法+导出 HTML 方案（WebGL 实时+降级链+陀螺仪内置）照准；**H5 预览陀螺仪彩蛋裁决不做**。
- [规格收口与设计确认](tickets/06-spec-lock.md): **全规格锁定，设计确认门过（Q1–Q13）**——参数表 8→13：uScope 三档 select（默认全图保旧码）+边缘 4 滑杆（阈值/宽度/软带羽化/滞后容差，均入码+随机，改判开放）+分区 uZoneBoost toggle（默认仅烫箔）；k/xyw 固定常量；**选中集合不入码**（恢复=全选）；转卡=工具条按钮+compare 互斥+桌面 hover 跟随/H5 单指转卡双指缩放+手感悬浮窗（幅度+三开关，不入码，改判开窗）；HTML 导出= ActionBar/H5 并列按钮+gating 首个格式拒绝型（非会员开 LicensePanel+toast，会员无水印）+票 02 模板照抄；**静态 PNG 角度序列砍掉**（改判）；验收=341 只增+模板 verify 自检+码长上限 23。全文见票内 Resolution，执行票 07 照抄。

## Not yet specified

（无——规格已锁，全部雾项毕业或裁决；前沿＝票 07 执行交付。）

## Out of scope

- **AI 语义分割**（「识别这是 logo/人物」级）：无基础设施、单会话不可交付（制图期裁决）。**2026-10-12 用户裁决升级明确**：AI 主体提取/语义描边（浏览器端分割模型或云 API）为架构级变化（模型体积/加载延迟/成本/隐私），超出本图「脚本方案」目的地，重启时**另立新图**（移轴微缩同先例）；届时「应用范围」select 直接追加「主体」选项即可，与本图降级保留的边缘模式不冲突。
- **SVG 动态导出**：转卡必须 JS 驱动，SVG 内嵌脚本体验劣于单文件 HTML；静态 shader 风格本就回退 PNG。
- **转卡通用化到全部风格**：仅 holofoil。
- **导出 HTML 查看者可调参数/换风格**：导出物＝参数冻结的闪卡。
- **免费用户水印版 HTML**：HTML 导出格式级封死，非会员只能导出图片。
- **批量动态导出**；**3D 侧效果**；**视频/GIF 时间轴动画导出**（本图动态以转卡交互 HTML 为界）。
- **手摆画笔蒙版**（手画区域类）：依旧出局；本图「点选检测出的面」是拍板门要正面裁决的对照项，不是复活手摆。
- **H5 预览端陀螺仪彩蛋**（编辑器预览甩手机转卡）：拍板门裁决不做（票 05）——微信 WebView 陀螺仪不稳是主战场现实、验收不覆盖；导出 HTML 内置陀螺仪不受影响。
