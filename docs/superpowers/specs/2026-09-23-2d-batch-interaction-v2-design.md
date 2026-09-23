# 2D 批量图片处理 交互重构 v2 设计文档

日期:2026-09-23
状态:已确认(方向与参数编辑语义经用户确认)
前置:v1 见 `2026-09-23-2d-batch-processing-design.md`(已实现并合入 main,778127e)

## 背景与问题

v1 交互反直觉:必须先上传一张图 → 单图调参 → 点"批量应用" → 再在面板里上传多张图。"调参预览"被当成了批量的前置门槛,入口太深。

用户方向:复用底部测试图那一行(test-images-bar)的位置承载批量图片列表,上传即批量。

## v2 核心交互

### 入口与图片管理

- ImageUploader 支持**一次多选**(input multiple + 拖放收多张)。
- 选 1 张 → 原单图模式,**零回归**;选 ≥2 张 → 批量模式。
- **底部图片栏 ImageStrip**(替代 test-images-bar 位置):
  - 缩略图横排列表(可横向滚动);当前"选中"行高亮边框;`n/20` 计数;超限禁用追加。
  - 点缩略图 = 切换选中(主画布切换预览对象);hover 显示移除按钮。
  - 栏尾 `[+]` 继续追加(多选)。
  - 测试图缩略图保留在同一行(或紧邻):单图模式下点击=加载为单图(v1 行为);批量模式下点击=**追加到列表**。
  - 移除到剩 1 张 → 自动退化单图模式;全移除 → 回上传页。
- ActionBar 按钮"批量应用"改名**"批量处理"**,有图即可点:打开批量面板(1 张时打开并提示可继续追加)。

### 主画布 = 选中行实时预览

- 批量模式下主画布渲染**选中行**的当前状态 + 当前参数,ParamPanel 照常可用——**调参所见即所得**,预览的就是批量真实效果(强于 v1 的事后画廊)。
- CompareSlider/关闭/缩放等单图交互作用于选中行(关闭=关闭整个批量会话,确认)。

### 参数编辑语义(用户确认:编辑即所选所见)

- **统一模式**:所有行共享一份状态(即 App2D 当前 params/textParams,活基线);ParamPanel 编辑即改全部行;SeedBar(ParamPanel 顶部)显示当前状态编码,编辑/粘贴种子 = 应用该状态到全部行。
- **独立模式**:每行有自己的种子码;**ParamPanel 编辑/SeedBar 编辑/骰子作用于选中行**(编辑后的 seedable 参数编回该行种子);主画布预览 = 该行种子解析结果。
- text/font/toggle/select(种子不携带项)**整批共享一份**(任务级)。
- 模式切换继承:统一→独立,各行继承当前状态为各自初始种子;独立→统一,以当前选中行的状态为准(其余行的独立种子丢弃,弹确认提示)。
- 切换选中行时,当前编辑状态先保存回行,再加载新行状态到 ParamPanel/画布。

### 批量面板瘦身(浮动面板保留)

- 配置 tab 只剩:格式选择(PNG/JPG/SVG 规则不变)、种子策略开关(统一/独立)、**全部随机**(独立模式:重骰所有行)、**开始处理**。
- v1 的行列表/行内种子位/统一种子位全部移除(图片在底部栏、种子编辑回归 SeedBar)。
- 结果 tab(画廊/进度/重试/重骰/单张与 ZIP 下载/灯箱)**不变**。
- 面板 = 纯视图 + 配置,可关可再开:关闭不清图片列表;"开始处理"后关闭面板有确认(终止进行中任务);已 done 的结果跟随图片行存活(行移除才丢弃),重开面板画廊仍在。

### 处理链路

- "开始处理" = **快照当时各行种子 + 任务级 text/font/格式** → 生成任务(复用 runBatch 队列,语义不变:顺序、逐行让出、失败不阻塞、可取消)。
- 处理中可继续调参(影响的是下一次处理/重跑,进行中任务不受影响)。
- 行的 done 元数据(renderedSeed/renderedStyleId 快照、命名、ZIP 去重)沿用 v1 修复后的行为。
- 20 行上限、canRunBatch 付费预留、objectURL 生命周期(行移除/会话关闭 revoke)沿用 v1。

## 状态模型(v2)

```
App2D:
  images: BatchImage[]          // { id, fileName, image, seed: string | null(独立模式种子),
                                //   status, blob, objectUrl, error, renderedSeed, renderedStyleId }
  selectedIndex: number
  seedMode: 'unified' | 'perImage'
  format: BatchFormat
  // 统一模式:params/textParams/fontParams 即共享状态(活基线)
  // 独立模式:选中行的 seed 为真;params/textParams 是"选中行解析后的工作副本"
  //           (切换行时:工作副本编回旧行种子 → 新行种子解析载入)
BatchPanel: 纯 props 组件(配置 + 画廊视图,无自有业务状态)
ImageStrip: 底部图片栏(纯展示 + 回调)
```

v1 的 `BatchJob`(baseline + rows)退役:行状态上移 App2D,处理时由行快照直接生成 RenderTask 列表。

## 兼容与约束

- 单图模式(≤1 张)行为与 v1 完全一致:渲染、参数、种子、预设、导出、比较、关闭。
- v1 保留资产全部复用:renderImage 共享渲染核心、runBatch 队列、Lightbox、fflate ZIP、种子编解码、randomId。
- UI 图标内联 SVG 禁 emoji;i18n zh/en 对齐;lint 基线 11 不新增;lib 层 vitest。
- 12 项手测清单重跑(v2 附录)。

## 错误处理(增量)

| 场景 | 行为 |
|---|---|
| 上传解码失败 | 该图不入列,console.warn(v1 降级口径不变) |
| 独立→统一切换 | 确认提示"各行独立种子将被丢弃,以选中行为准" |
| 处理中移除行 | 该行若 processing,等当前渲染完成后丢弃结果(updateRow 双守卫沿用) |
| 批量会话关闭(主画布 ×) | 确认 → 终止队列 + revoke 全部 + 清 images |

## 测试策略(增量)

- lib 层新增:模式切换继承逻辑(纯函数化)、行状态↔种子 编解码往返、快照生成任务列表。
- runBatch/batchJob 既有测试保持绿(接口尽量不动;BatchJob 退役部分迁移)。
- 组件层不建测试;自动化门(test/lint/tsc/i18n 对齐)+ 手测清单。

## 文件清单

新增:
- `src/components/ImageStrip.tsx` — 底部图片栏
- `src/lib/batch/imageList.ts` — 行状态纯逻辑(切换保存/加载、模式切换继承、快照生成任务)

修改:
- `src/components/App2D.tsx` — 多图状态模型、参数语义、底部栏接入(主要重构面)
- `src/components/ImageUploader.tsx` — multiple 多选
- `src/components/BatchPanel.tsx` — 配置 tab 瘦身为纯视图
- `src/components/ActionBar.tsx` — 按钮改名"批量处理"
- `src/lib/batch/batchJob.ts` — BatchJob 退役/迁移,行类型调整
- i18n zh/en、global.css
