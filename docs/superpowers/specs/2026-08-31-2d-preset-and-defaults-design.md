# 2D 配置记忆、随机按钮与本地预设 —— 设计文档

日期：2026-08-31
状态：已与用户确认设计，待实现

## 背景与目标

2D 图片风格化页面（`App2D`）当前点击左侧风格列表时会**随机生成**该风格的全部数值参数。本次改造：

1. **风格默认值与记忆**：点击左侧列表选项时不再随机——首次点击加载固定默认值；用户调整过参数后，后续点击恢复该风格**最后一次使用的配置**（仅会话内记忆，不持久化）。
2. **配置面板随机按钮**：由于随机入口从「点击列表」移除，在配置面板（ParamPanel）标题栏新增一个随机按钮；底部 ActionBar 的随机按钮保留。
3. **本地预设（localStorage）**：配置面板新增「保存配置」入口，用户可将当前完整参数快照命名保存到 localStorage；新增一个可拖动的浮动列表窗（PresetPanel）展示已保存配置，支持应用与删除。

### 用户确认的决策

| 决策点 | 结论 |
|---|---|
| 需求 1 记忆范围 | 仅本次会话（内存），刷新后回到默认值；跨会话由需求 3 的预设承担 |
| 随机按钮布局 | ParamPanel 标题栏新增 + ActionBar 保留，两处并存 |
| 预设保存内容 | 完整快照：styleId + 全部数值参数 + 文字/颜色参数（textParams）；FontFace 无法序列化，不保存 |
| 预设命名 | 保存时可编辑命名，默认名 = 风格显示名 + HH:mm |
| 按钮图标 | 禁止 emoji；一律内联 SVG（stroke currentColor 线条风格） |

## 总体方案（已选定方案 A：模块化）

- 风格记忆：App2D 内 `useRef` 会话级缓存
- 预设存取：新建 `src/lib/presetStore.ts` 纯逻辑模块（可注入 Storage，可单测）
- 拖动复用：ParamPanel 现有拖动逻辑抽成 `src/lib/useDraggable.ts` hook，ParamPanel 与新建 PresetPanel 共用
- ParamPanel 仅新增可选 prop `onRandom`，向后兼容（App3D 的 6 处调用不受影响）

被否决的备选：B（全部内联在 App2D，localStorage 不可测、拖动代码双份）、C（引入全局状态管理，远超需求，YAGNI）。

## 1. 风格参数记忆（需求 1）

### 数据结构

```ts
// App2D 内，会话级；ref 变更不触发渲染，仅在切换风格时读写
const styleMemoryRef = useRef<Partial<Record<StyleId, {
  params: Record<string, number>
  textParams: Record<string, string>
}>>>({})
```

### handleStyleChange 新逻辑

```ts
const handleStyleChange = (id: StyleId) => {
  // 1. 无条件快照当前风格状态（默认/随机/手动调整的最后状态一视同仁）
  styleMemoryRef.current[activeStyle] = { params, textParams }
  // 2. 目标风格：有记忆用记忆，无记忆用默认值
  const memo = styleMemoryRef.current[id]
  setParams(memo?.params ?? initParams(id))
  setTextParams(memo?.textParams ?? initTextParams(id))
  setFontParams({})   // 字体文件不记忆（现状行为不变）
  setActiveStyle(id)
}
```

要点：

- 删除现有 `handleStyleChange` 中的随机参数生成代码；`SKIP_RANDOM_UNIFORMS` 常量只剩 `handleRandom` 一个使用方，随代码整理就近放置。
- 「首次点击 = 默认值」复用现成的 `initParams` / `initTextParams`；toggle/select/color 回到各自 default（比旧随机逻辑覆盖更完整，属预期行为改进）。
- 采用「无条件快照最后状态」而非「检测用户是否手动修改过」：点过「随机」再切走，回来也保留随机结果。语义为「每个风格记住你最后离开时的样子」，实现无边界情况。
- 实现注意：快照读取当前 `params` / `textParams`，`handleStyleChange` 的 `useCallback` 依赖数组需相应加入这两项（现有实现依赖为 `[]`）。
- `handleApplySeed`（应用种子码）同样写入 `styleMemoryRef`：种子码应用后切换风格再回来，应保留种子状态（与 `handleApplyPreset` 行为一致）。

## 2. 随机按钮（需求 2）

- ParamPanel 新增可选 prop `onRandom?: () => void`；有值时在标题栏 actions 区（▾ 折叠按钮左侧）渲染 SVG icon 按钮（骰子线条画法，16px，`stroke: currentColor`），title/aria-label 用 `common.random`。
- App2D 传入 `onRandom={handleRandom}`，随机算法不变（`SKIP_RANDOM_UNIFORMS` 语义保留）。
- ActionBar 底部随机按钮不动。

## 3. 预设存储 presetStore（需求 3）

新建 `src/lib/presetStore.ts`：

```ts
export interface PresetEntry {
  id: string        // crypto.randomUUID()
  name: string
  styleId: StyleId
  params: Record<string, number>
  textParams: Record<string, string>
  createdAt: number // epoch ms
}

const STORAGE_KEY = 'pixel-forge.presets.v1'

export function loadPresets(): PresetEntry[]
export function savePreset(input: Omit<PresetEntry, 'id' | 'createdAt'>): PresetEntry | null
export function removePreset(id: string): boolean
```

- 模块内通过可注入的 `Storage` 接口访问（默认 `window.localStorage`）；vitest 注入内存实现即可单测，无需 jsdom。
- 所有 `JSON.parse` / `setItem` / `getItem` 包 try/catch（隐私模式、配额满、坏数据）。
- 条目校验：`styleId` 必须在 StyleRegistry 中存在、`params`/`textParams` 必须是对象；坏条目丢弃，不影响其余条目。
- `loadPresets` 按 `createdAt` 降序（新的在前）。

## 4. useDraggable hook

新建 `src/lib/useDraggable.ts`，将 `ParamPanel.tsx` 现有拖动实现（pos state + dragging/offset ref + window mousemove/mouseup + 视口 clamp）抽出：

```ts
interface UseDraggableOptions { defaultPos?: { x: number; y: number } }
// 返回
{ ref: RefObject<HTMLDivElement | null>, pos: { x: number; y: number }, onHeaderMouseDown: (e: React.MouseEvent) => void }
```

ParamPanel 改为内部使用该 hook（对外行为不变）；PresetPanel 复用。

## 5. PresetPanel 浮动列表窗

新建 `src/components/PresetPanel.tsx`：

- Props：`presets: PresetEntry[]`、`onApply(entry: PresetEntry): void`、`onDelete(id: string): void`、`onClose(): void`。
- 视觉与 ParamPanel 一致：标题栏（拖动手柄）+ 折叠 ▾ + 关闭 ×；`useDraggable` 默认位置右下角（约 `window.innerWidth - 300, 200`，实施时取不遮挡 ParamPanel 的值）。
- 列表项：主行 = 配置名；次行 = 风格显示名（i18n）+ 保存时间 `MM-dd HH:mm`。**点击整行 = 应用**；行尾 SVG 垃圾桶 icon 按钮 = 删除（低风险，直接删，不加确认框）。
- 空状态文案见 i18n；应用配置后浮窗保持打开（便于连续对比）。

## 6. PresetBar 保存入口

新建 `src/components/PresetBar.tsx`，渲染在 App2D 传给 ParamPanel 的 `top` slot 中（SeedBar 下方），一行两个按钮（SVG icon + 文字）：

- **保存配置**：点击后按钮区切换为内联输入框（交互与视觉沿用 SeedBar 的 editing 模式），默认名 = `t(currentStyle.label) + ' ' + HH:mm`；回车/确定 → 保存；Esc/取消收起。保存成功短暂显示已保存反馈；失败显示 `preset.saveFailed`。
- **我的配置 (n)**：切换 PresetPanel 显隐；n = 当前列表长度。

## 7. App2D 状态与数据流

- 新增 state：`presets: PresetEntry[]`（初始 `loadPresets()`）、`showPresetPanel: boolean`。
- `handleSavePreset(name)`：`savePreset({ name, styleId: activeStyle, params, textParams })` → 成功 `setPresets(loadPresets())`；失败返回 false 供 PresetBar 提示。
- `handleApplyPreset(entry)`：
  ```ts
  setActiveStyle(entry.styleId)
  setParams(以 initParams(entry.styleId) 为底，entry.params 覆盖风格定义中存在的 uniform)
  setTextParams(以 initTextParams 为底，entry.textParams 覆盖风格定义中存在的 uniform)
  setFontParams({})
  styleMemoryRef.current[entry.styleId] = { params: 新params, textParams: 新textParams }  // 与需求 1 记忆一致
  ```
- `handleDeletePreset(id)`：`removePreset(id)` → `setPresets(loadPresets())`。
- PresetBar / PresetPanel 仅在有图时渲染（与 ParamPanel 同条件）。

## 8. i18n

`zh.json` / `en.json` 新增（两种语言同步）：

```json
"preset": {
  "save": "保存配置",
  "confirm": "保存",
  "namePlaceholder": "配置名称…",
  "saveFailed": "保存失败（存储不可用）",
  "saved": "已保存",
  "list": "我的配置",
  "empty": "暂无保存的配置，调整参数后点「保存配置」",
  "apply": "应用",
  "delete": "删除"
}
```

随机按钮复用 `common.random`。

## 9. CSS（追加 global.css）

- `.param-panel-random`：标题栏 SVG icon 按钮。
- `.preset-bar` / `.preset-bar--edit`：保存入口行，沿用 seed-bar 布局与配色变量。
- `.preset-panel` 系列：浮窗与列表项，复用 param-panel 视觉变量（边框、底色、圆角），保持同一外观语言。

## 10. 错误处理

| 场景 | 行为 |
|---|---|
| localStorage 不可用（隐私模式/配额满） | 保存显示失败提示；列表读空；不崩溃 |
| 数据被手改坏（非法 JSON/坏条目） | 丢弃坏条目，其余正常显示 |
| 旧预设遇风格定义增删参数 | 以默认值 merge，新增参数取默认值 |
| 无图片时 | PresetBar/PresetPanel 不渲染（与 ParamPanel 同条件） |

## 11. 测试

- 新增 `src/lib/presetStore.test.ts`（vitest + 注入内存 Storage）：
  - 空库返回 `[]`
  - save → load 往返一致；按 createdAt 降序
  - remove 成功 / id 不存在返回 false
  - 坏 JSON 容错返回 `[]`
  - 坏条目（非法 styleId / params 非对象）被丢弃，不伤全库
  - storage 抛异常（配额满模拟）时 savePreset 返回 null、loadPresets 返回 `[]`
- 回归：`npm test` 全绿；`npm run lint`、`npm run build` 通过。

## 12. 手动验收标准

1. 首次点击某风格 → 全默认；调滑块/文字 → 切走再切回 → 恢复调整值
2. ParamPanel 标题栏随机按钮可用；ActionBar 随机按钮仍在
3. 保存配置 → 刷新页面 → 列表还在；点击条目完整还原（含文字/颜色）；删除生效
4. 浮窗可拖动、可折叠、可关闭
5. 3D 页面无任何变化

## 13. 后续任务（本次不做）

- 用户实测用预设功能为每个风格保存一组推荐值，将 localStorage 数据回填 StyleRegistry 各参数的 `default` 字段（同时完成对 localStorage 功能的端到端实测）。
