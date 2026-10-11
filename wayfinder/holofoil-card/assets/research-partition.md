# 研究票 01——边缘检测与自动分区选型（选择性加箔）

> 对应票：`../tickets/01-partition-research.md`。代码事实基于 2026-10-11 仓库现状；
> npm 库状态经外部检索查证（来源见文末）。不重开 map Notes 制图期裁决。

## 0. 架构事实（代码侧输入核实）

- `src/shaders/holofoil.frag`：单 pass，已有 **±2px 中心差分 luma 梯度**（4 tap，
  holofoil.frag:54-57），`edge = length(grad) * 4.0` 已参与 mask（:91-92）。
  即「梯度→掩膜」的骨架已在，缺的是**独立可控的边缘模式**（阈值/宽度/只贴边）。
- `src/shaders/prism.frag` 紫边模式：2 tap 前向差分 + `uEdgeThreshold` +
  `smoothstep(t*0.5, t*0.5+0.15, edgeMag)`（prism.frag:40-45）——
  「阈值化边缘→按比例混入效果」的完整先例，idiom 可 100% 照搬。
- `src/lib/ShaderRenderer.ts`：WebGL 1；`renderMultiPass` FBO ping-pong（lightshadow/
  animelight 先例）；`bindTexture(unit)` + `setSampler(name, unit)` 是现成 API
  （ShaderRenderer.ts:205-212, 447-451）。**multi-pass 只自动接 uImage(0)/uOriginal(1)**，
  额外 sampler 需补一行 setSampler 扩展（小改，执行票量级）。
- `src/lib/renderImage.ts`：textraster 文字图集路径 = **CPU canvas → texImage2D →
  bindTexture(unit 2) → setSampler**（renderImage.ts:88-110）——CPU 生成纹理作为
  附加采样输入的完整先例，分区掩膜照抄即可。单图/批量共用 renderImage =
  掩膜挂进此路径后三端+批量自动同语义。
- 参数表只传 `Record<string, number>`（types.ts）；textParams 走旁路 state 的先例
  说明「掩膜选择集」这类非数值状态也可以走旁路，不必塞参数表。
- 原图由 `loadImage` 以 HTMLImageElement 上传 GPU（clamp 2048）；CPU 侧可把同一
  image 画到低分辨率 2D canvas 取 ImageData——**无需 GPU readPixels 回读**。

---

## 1. 边缘加箔（shader 内边缘检测）

### 方案对比

| 方案 | pass 数 | 每 px fetch | 边宽可控 | 抗噪 | 架构改动 | 判定 |
|---|---|---|---|---|---|---|
| A. 单 pass Sobel(3×3)+smoothstep 软阈值 | 1 | ~9-12 | 强度域带宽（视觉宽度） | 中（阈值天然滤弱响应） | 零 | **推荐基座** |
| B. 单 pass 多基线/邻域 max（宽核） | 1 | (2w+1)²×~8 ≈ 24-120（w≤3） | 真像素宽度（dilate） | 中-高（大基线=低通） | 零 | **推荐作边宽实现**（与 A 合并） |
| C. 两 pass：pass1 Sobel 幅度→FBO，pass2 主逻辑读幅度纹理 | 2 | pass1 ~9 / pass2 ~5+N | 滤波带宽+核 | 高（幅度纹理先平滑） | holofoil 转 isMultiPass，**全模式都走 2 pass** | 备选（架构已备但动全图模式回归面） |
| D. 真 Canny（NMS+双阈值滞后） | 3-5 pass | — | 精细但过kill | 最高 | WebGL1 无原子操作，滞后阈值需 JFA/迭代膨胀 | 出局（收益/复杂度比极差） |

### 推荐：A+B 合并——**单 pass 内 Sobel 基座 + 多基线/邻域 max 做边宽**

- **成立性**：单 pass Sobel 完全成立。holofoil 现有 ±2px 中心差分本身就是抗噪梯度
  （大基线=天然低通，JPEG 高频噪声被滤掉大半），比 Sobel 3×3 更抗噪；Sobel 幅度
  归一化后与它取 max，兼顾细边与抗噪。边宽 w 通过在 (2w+1)² 邻域对「过阈值幅度」
  取 max（dilate），或对幅度做小核线性滤波后 smoothstep——都在同一 pass 内完成，
  总 fetch 预算 30-60，2048×2048 无压力。
- **prism 先例可复用程度**：`luma()`、`uEdgeThreshold`+`smoothstep` 语义、按 mode
  分支的组织方式直接照搬；holofoil 现有梯度代码保留为主基线。复用度约 80%——
  唯一新增概念是「边宽」（prism 没有）。
- **为什么不选 C 做基座**：C 要把 holofoil 转 multi-pass，全图模式（旧码默认）也被
  迫走 2 pass，回归面大；而种子码铁律要求旧码缺参走默认=渲染结果不变。单 pass
  方案让「范围=全图」路径逐字节等价。若样张阶段发现宽边毛刺/断裂再升级 C，
  架构零障碍（renderMultiPass 现成）。
- **参数形态**（末位追加，visibleWhen 条件显隐，与制图期约束一致）：
  `uScope`（应用范围 select：全图/边缘/分区）、`uEdgeWidth`（1-4）、
  `uEdgeThreshold`（0-1，默认照 prism 0.5 量级调）。
- **性能量级**（2048×2048，估算）：现 holofoil 5 fetch；加 Sobel+边宽核 30-60 fetch →
  桌面独显 1-4 ms、核显 3-8 ms、中端移动 GPU 5-15 ms——拖参数交互可用，无 FBO 分配。
- **掩膜整合**：不产生外部纹理；`edgeMask` 在 shader 内生成后乘进现有 `mask`
  变量（holofoil.frag:92 一行改动量级）。

---

## 2. 自动分区

### 候选对比（npm 状态均经查证，来源见文末）

| 路线 | 依赖 | 大区语义质量 | 2048² CPU 成本（低清格） | 库风险 | 判定 |
|---|---|---|---|---|---|
| 颜色量化 k-means lite（RGB+xy）+ 连通域合并 | 自研 ~150 行，或 [ml-kmeans](https://www.npmjs.com/package/ml-kmeans) 7.0.0（2025-11 发布，活跃，MIT，TS 类型，安装体积 ~63 kB，4 依赖） | 好：直接对应「天空/主体/地面」色块 | 256² 格 10-40 ms | ml-kmeans 可信；自研零依赖 | **推荐** |
| Flood fill 区域生长（网格种子） | 自研 | 好（连通性天然） | 同量级 | 种子策略与容差参数敏感 | 备选（可作 k-means 打标后的精化 pass） |
| SLIC 超像素 | npm [superpixel](https://www.npmjs.com/package/superpixel) v0.0.0（[repo](https://github.com/ysjk2003/superpixel) 2 stars；require.js 时代打包；README 自认跨浏览器浮点结果不一致；TODO es6/ts 转换） | 最好 | 自研 ~300 行 | **库不可靠**；自研工程量最大且过度分割后仍需合并 pass | 出局（库）/ 高成本备选（自研） |
| opencv.js | 官方 wasm 构建 **~8 MB** | 最好 | 快 | 体积不成比例 | 出局 |
| image-q 量化 | [image-q](https://www.npmjs.com/package/image-q) 4.0.0（2022-06 后未更新，功能完备） | 中：调色板索引无空间连通性，仍需连通域 pass | 同量级 | 停更但稳定；相比自研无增量优势 | 出局 |

### 推荐：自研 k-means lite + 连通域，**在 ≤256×256 低清格上计算**

- **算法链**：原图 `drawImage` 到 256×256 canvas → `getImageData` →
  k-means（k≈5-8，特征=R,G,B,x·w,y·w，**固定 seed**）→ 逐像素最近中心打标 →
  两遍 union-find 连通域 → 面积 <0.5% 的小区并入最大邻接区 → 产出
  `Uint8Array` label grid（256²）+ 区块元信息（均值色/面积/质心，预览高亮用）。
- **为什么不做 GPU 分区**：GPU k-means 无法单 pass；jump-flooding 分割复杂度与
  「分成几个大区」的目标完全不成比例。CPU 低清计算 + GPU 上采样是业界常规分工。
- **为什么 256 够**：分区美学目标是「几个大区、边界柔」，不是精确轮廓——低清
  label 上采样后靠 LINEAR 采样+shader 内 smoothstep 正好得到羽化边界。
- **性能量级**（估算，一次性分析非逐帧）：
  - 降采样+getImageData：1-3 ms；
  - k-means k=6、65K 样本、~8 轮 ≈ 3M 次距离计算 ≈ **10-30 ms 桌面 / 40-80 ms 中端手机**；
  - 连通域 5-10 ms。总计 **<50 ms 桌面 / <150 ms 移动**，UI 上是「分析中」一瞬。
  - 反面教材：全图 2048² CPU k-means ≈ 250M+ 距离计算 ≈ 1-3 s+（否）；
    GPU readPixels 回读 2048² ≈ 16.8 MB 同步拷贝 30-100 ms 且 stall 管线（否，
    且完全不必要——CPU 从 HTMLImageElement 直接画小格）。
- **掩膜纹理整合**（关键设计）：
  - CPU 持有 label grid；用户勾选的 label 集合 → 每次变化重绘一张 RGBA canvas
    （选中=白/未选=黑，可选 1px 羽化）→ `texImage2D` 上传 → `bindTexture(3)` +
    `setSampler('uZoneMask', 3)`——**逐行照抄 textraster 文字图集管线**。
  - holofoil.frag 末尾追加（`uZoneEnabled` 由 `uScope` 派生，旧码缺 uniform 走 GLSL
    默认 0 的守卫写法）：
    ```glsl
    uniform sampler2D uZoneMask;
    uniform float uZoneEnabled; // 0 默认=全图,旧码安全
    // mask *= mix(1.0, smoothstep(0.35, 0.65, texture2D(uZoneMask, vUv).r), uZoneEnabled);
    ```
  - 上传挂点在 renderImage 渲染路径内（或其调用的 per-style 钩子）→ 单图/H5/批量
    自动同语义。单 pass 路径管线现成；若他日 holofoil 转 multi-pass，需给
    renderMultiPass 补一行任意 unit 的 setSampler（小改）。
  - 选择集不走参数表（数值 only）：走组件旁路 state（textParams 先例）；
    入种子码方式属规格票议题（见风险）。

---

## 3. 点选开关面

- **可行性：成立且便宜**。分区产物 label grid 在 CPU 手里，点击拾取 =
  `client 坐标 → canvas 坐标（rect 换算）→ 图像坐标 → 256 格坐标 → O(1) 查表`。
  不涉及 GPU readback。每次点击成本：查表 <0.1 ms + 掩膜重绘上传 1-2 ms + 重渲一帧
  （现有帧成本）。多选/反选/撤销 = 纯 UI 状态机。
- **H5**：pointer 事件 + 同一套坐标换算，无任何特化；`canvas.width/rect.width` 缩放
  换算是成熟做法。移动端性能同层 2 结论（<150 ms 一次性分析 + 点击毫秒级）——可用。
- **边界与容差**：点在羽化带取 3×3 众数 label；分区粒度不够时可选 512×512 格
  （成本×4，移动端仍 <300 ms）。数值上限 2048 渲染不变——掩膜分辨率与渲染分辨率解耦。
- **备选**：点击处 on-the-fly flood fill（容差可调、不依赖预分区）——大图每次点击
  10-50 ms 且与预览所见分区可能不一致；只宜作点选模式的「容差」增强项，不作基座。
- **注意**：点选是否进正式版=样张后裁决（map 制图期约束），本节只回答可行性与成本。

---

## 风险与遗留（供规格票/拍板门）

1. **分区跨设备复现性**：浮点 k-means 在不同浏览器/设备可能分出略不同的区
   （superpixel 库 README 明确踩过此坑）→ 种子码若编码「选中区集合」，跨设备打开
   可能选错区。缓解：特征整数化/量化取整、固定迭代轮数、或选择集仅设备本地不入码。
   **这是规格票必须裁决的点**。
2. 边宽核 fetch 上限在低端移动 GPU 需实测（Browser Verification Playbook 走查）；
   超预算则降档为方案 A 纯 smoothstep 带宽。
3. k-means 的 k 与 xy 权重是「分区品味」参数，样张阶段需 2-3 张典型图定默认值。

---

## 研究结论摘要

1. 边缘加箔：**单 pass 内 Sobel+现有多基线梯度取 max，smoothstep 软阈值（prism idiom 照搬），邻域 max 做边宽**；全图模式路径零改动，保旧码等价。
2. 自动分区：**自研 k-means lite（RGB+xy，k≈6，固定 seed）在 256² 低清格 + 连通域合并**；ml-kmeans（活跃、~63 kB）为可信备选；SLIC/opencv.js/image-q 出局（库不可靠或杀鸡牛刀）。
3. 性能：分区一次性 <50 ms 桌面 / <150 ms 移动；边缘 shader 5→30-60 fetch，2048² 桌面 1-4 ms；无需 GPU 回读（CPU 从 image 元素画小格）。
4. 掩膜整合：分区→0/1 掩膜 canvas → texImage2D → bindTexture(3)+setSampler，逐行照抄 textraster 文字图集管线；holofoil 加 `uZoneMask/uZoneEnabled` 两 uniform，`uZoneEnabled` 默认 0 保旧码安全。
5. 点选开关面：label grid O(1) 查表拾取，点击毫秒级，H5 同一套 pointer+坐标换算；on-the-fly flood fill 仅作容差增强备选。
6. 最大风险：分区跨设备浮点复现性 → 种子码「选中集合」的编码方式须在规格票裁决（整数化或本地不入码）。

## 来源

- [npm: ml-kmeans](https://www.npmjs.com/package/ml-kmeans)（7.0.0，2025-11-14，Zakodium/mljs 维护，安装体积 62.9 kB）
- [npm: superpixel](https://www.npmjs.com/package/superpixel) ／ [GitHub: ysjk2003/superpixel](https://github.com/ysjk2003/superpixel)（v0.0.0，require.js 时代，自认跨浏览器数值差异）
- [npm: jsfeat](https://www.npmjs.com/package/jsfeat)（0.0.8，末次发布约 10 年前，socket.dev 维护评级 Inactive）
- [npm: image-q](https://www.npmjs.com/package/image-q)（4.0.0，2022-06-19 后未更新）
- opencv.js 完整构建约 8 MB（[OpenCV.js 官方文档](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)；多篇构建精简指引佐证体积量级）
