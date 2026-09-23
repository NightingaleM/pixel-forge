# 2D 批量图片处理 v3 设计文档

日期:2026-09-23
状态:已确认(5 项交互逐项经用户确认,方向与细节均定稿)
前置:v2 见 `2026-09-23-2d-batch-interaction-v2-design.md`(已实现并本地合入 main)

## 背景

v2 交互重构后,用户在使用中提出 5 项改进:

1. 上传多张图后,批量浮窗需要手动点「批量处理」才出现——应该自动显示。
2. v2 把 v1 浮窗里的「图片+种子」行列表移除了,用户希望恢复(查看每张图对应的种子)。
3. 底部图片栏缩略图看不到各行种子——应在缩略图下方显示。
4. 种子位只有复制/粘贴——还应有「种子列表」,内容就是用户自己保存的配置(预设系统)。
5. 底部图片栏显示原图——希望 done 后以对角线分割,左原图右处理后对比显示。

## 逐项确认结果(用户已选定)

| # | 改动 | 确认结论 |
|---|---|---|
| 1 | 自动开浮窗 | 仅上传页首载 ≥2 张时自动弹;手动关闭后本会话不再自动弹(追加路径不触发) |
| 2 | 浮窗行列表 | 只读展示:缩略图+生效种子码;点击行=切换主画布选中;编辑仍集中在 SeedBar |
| 3 | 底部栏种子 | 截断码 + hover 全量 + 点击复制;独立模式 seed=null 行显示「跟随」短标 |
| 4 | 种子列表 | 复用预设系统(同一 localStorage 数据源);点击=应用配置(与 PresetPanel 同语义);不另造存储 |
| 5 | 对角线对比 | ╲ 分割(左上→右下):左下三角=原图,右上三角=处理后;done 行生效,未完成/失败行显示原图 |

## 设计细节

### 1. 上传多图自动开浮窗

- `App2D.handleImagesLoad`(仅上传页首载触发,images 必为空)在 `capped.length >= 2` 时追加 `setShowBatchPanel(true)`。
- 1 张不弹(单图模式零回归)。
- 追加路径(`handleAddFiles` / `handleTestImageClick`)不碰 `showBatchPanel`,天然满足「手动关闭后本会话不再自动弹」。
- 删到 0 张回上传页再传 ≥2 张会再弹(视为新会话,合理)。
- 无需新增状态。

### 2. 浮窗行列表(配置 tab,只读)

- 位置:BatchPanel 配置 tab,「开始处理」按钮下方,标题「图片与种子」。
- 每行:32px 小缩略图(原图)+ 截断种子码(等宽小字,title 全量,点击复制)+ 状态点(pending 灰 / processing 旋转蓝 / done 绿 / failed 红,同结果 tab 色系)。
- 点击行 = `onRowSelect(i)` → App2D `handleSelect`(与底部栏同语义;独立模式含懒同步:旧行工作副本编回、新行解析载入)。
- 当前选中行高亮。
- 独立模式 `seed=null` 行显示「跟随」短标;统一模式各行同显基线码。
- 20 行上限内滚动(max-height ~240px,overflow-y auto)。
- 种子编辑入口不在列表内(保持 v2 语义:SeedBar 唯一编辑点)。

### 3. 底部图片栏种子条

- 每个已上传缩略图格子底部加与图同宽(80px)的等宽小字条:
  - 截断码:`truncateSeed(code, 7)`(前 7 字 + …,保留版本位+风格位可辨)。
  - hover `title` 显示全量码。
  - 点击复制(`stopPropagation` 防触发选中),复制成功短暂显示「已复制」(复用 `seed.copied` 文案,1.5s 后还原)。
- 显示**当前生效种子**(`rowEffectiveSeed` 语义):统一模式改参 → 全行码实时同步;独立模式编辑选中行 → 仅该行码变。done 行旧结果图与新码的短暂错位沿用 v2「处理中调参影响下一次处理」心智,重跑即对齐(与主画布实时预览一致,而非 done 定格的 renderedSeed)。
- 独立模式 `seed=null` 行显示「跟随」(i18n `batch.followBase`)。
- 测试图缩略图无种子条。
- 格子改为纵向 flex(图 80×56 + 种子条 ~16px),底部栏整体增高约 16px,横向滚动行为不变。

### 4. 种子列表 = 预设系统

- 新组件 `src/components/PresetMenu.tsx`:下拉弹层(绝对定位锚定入口按钮,向上/向下自适应空间),纯 props:
  - `presets: PresetEntry[]`、`onApply: (entry: PresetEntry) => void`、`onClose: () => void`。
  - 每项:预设名 + 风格 label(同 PresetPanel 的 `t(getStyle(e.styleId)?.label ?? e.styleId)`)。
  - 点击项 = `onApply(entry)` → App2D `handleApplyPreset`(既有语义:mergeWithDefaults、styleMemory 写入、activeStyle 切换、**整批基线双写**、跨风格清行种子),应用后关闭菜单。
  - 空态:提示「暂无保存的配置」(i18n `preset.menuEmpty`)。
  - **不含删除/管理**——管理仍在 PresetPanel(单一职责)。
- 入口两处(同一组件复用):
  - SeedBar:「复制」「编辑」旁加列表图标钮(手绘 SVG:三横线列表),单图/批量模式均可用(应用预设本就是单图功能)。
  - BatchPanel 行列表标题右侧同款入口。
- 菜单开闭状态由入口组件持有;点击外部/Esc 关闭。
- 不新增存储,预设系统单一数据源;预设 → 种子码的推导不需要(点击即应用,不经过码)。

### 5. 对角线对比缩略图

- ImageStrip 格子:`status === 'done' && objectUrl` 时:
  - 原图 `<img src={img.image.src}>` 铺底(现有元素)。
  - 处理后 `<img src={objectUrl}>` 绝对定位覆盖,`clip-path: polygon(0 0, 100% 0, 100% 100%)` —— ╲ 左上→右下对角线,右上三角=处理后,左下三角露出原图。
  - 两图均 `object-fit: cover` 填满 80×56(处理结果与原图同尺寸,cover 裁切一致)。
  - 叠加 1px 半透明对角线(内联 SVG line x1=0 y1=0 x2=100% y2=100%,白色 50% 透明度,适配非方形)。
- 未完成(pending/processing)、failed 行:维持原图显示。
- 选中/移除/hover 交互不变;移除钮 z-index 高于对比层。
- 主画布 CompareSlider 不动。
- 单图模式 done 行同样生效(渲染逻辑不分模式;「零回归」指既有功能不坏,新增显示为增强)。

## 数据流与纯逻辑

```
App2D:
  displaySeed(row, base, def) → string | null   // 新纯函数,lib/batch/imageList.ts
    统一模式 / 独立非 null 行:rowEffectiveSeed(基线或行种子编码)
    独立 null 行:null(调用方渲染「跟随」)
  truncateSeed(code, 7) → string                // 新纯函数,同文件
  rowsSeedView: { id, full, short, follow }[]   // App2D useMemo,currentStyle 缺失时空数组
    下发 ImageStrip(种子条)与 BatchPanel(行列表)——两处显示永不漂移
```

- 组件树其余不变:BatchPanel/ImageStrip 仍是纯 props 视图;SeedBar 增 `presets`/`onApplyPreset` props;BatchPanel 增 `onRowSelect`/`rowsSeedView`/`presets`/`onApplyPreset` props。

## i18n(zh/en 对齐,新增 key)

| key | zh | en |
|---|---|---|
| `batch.rowListTitle` | 图片与种子 | Images & Seeds |
| `batch.followBase` | 跟随 | Follow |
| `batch.seedList` | 配置列表 | Preset List |
| `preset.menuEmpty` | 暂无保存的配置 | No saved presets yet |

- 不新增 toast(浮窗自动弹出本身就是可见反馈,`autoOpenHint` 不做)。
- 复制短反馈直接复用既有 `seed.copied`(“已复制”/"Copied"),不新增 key。

## 边界与错误处理(增量)

| 场景 | 行为 |
|---|---|
| 处理中调参后 done 行 | 缩略图对比仍显示旧结果(定格),种子条显示当前生效码;重跑后对齐 |
| 行列表/种子条点击复制失败 | 沿用 SeedBar 复制失败口径(短暂失败提示) |
| PresetMenu 打开时预设被外部删除 | props 重渲染自然收缩;不特殊处理 |
| 对角线图层在 objectUrl revoke 后 | 行移除/重跑时 React 卸载 img,无悬挂引用 |
| 批量会话关闭 | 既有 resetSession 全清,种子条/行列表/对比层随组件卸载 |

## 测试策略(增量)

- lib 层 vitest 新增(`src/lib/batch/imageList.test.ts`):
  - `displaySeed`:统一模式基线码;独立模式行种子原样返回;独立 null 行返回 null;def/base 变化跟随。
  - `truncateSeed`:≤n 原样;>n 截断加 …;空串/边界。
- 组件层不建测试;自动化门(test/lint/tsc/i18n 对齐)+ 手测清单(v2 十二项 + v3 六项:自动弹窗、行列表点击切换与复制、底部种子条复制与跟随标、两处 PresetMenu 应用、对角线 done 显示、单图回归)。
- 既有 201 测试保持绿;lint 基线 11 不新增。

## 文件清单

新增:
- `src/components/PresetMenu.tsx` — 种子/配置下拉菜单(两处复用)

修改:
- `src/App2D` 所在 `src/components/App2D.tsx` — 自动开面板、rowsSeedView 计算、新 props 下发(handleApplyPreset 复用既有)
- `src/components/ImageStrip.tsx` — 种子条 + 对角线对比格子
- `src/components/BatchPanel.tsx` — 配置 tab 行列表 + PresetMenu 入口
- `src/components/SeedBar.tsx` — PresetMenu 入口
- `src/lib/batch/imageList.ts` — displaySeed / truncateSeed 纯函数
- `src/lib/batch/imageList.test.ts` — 对应测试
- `src/styles/global.css` — 种子条/行列表/对比层/菜单样式
- `src/i18n` zh.json / en.json — 新 key 对齐

## 硬约束(沿用)

- 单图模式(≤1 张)既有功能零回归。
- lint 基线 11 个既有错误不新增。
- UI 图标一律内联 SVG,禁 emoji。
- i18n zh.json/en.json 双语对齐。
- 测试只写 lib 层(vitest)。
