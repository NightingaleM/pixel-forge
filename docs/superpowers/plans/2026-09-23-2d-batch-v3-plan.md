# 2D 批量处理 v3 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 v3 五项改动:上传多图自动开浮窗、浮窗图片+种子只读列表、底部栏种子条、种子列表复用预设系统、done 行对角线对比缩略图。

**Architecture:** App2D 保持行状态唯一所有者,新增 `rowsSeedView` 派生值统一计算行种子展示(底部栏种子条与浮窗行列表共用,显示永不漂移);纯逻辑下沉 `lib/batch/imageList.ts`(`displaySeed`/`truncateSeed`/`RowSeedView`);新组件 `PresetMenu.tsx` 两处复用(SeedBar + BatchPanel 行列表头),数据源复用既有 presetStore,应用走既有 `handleApplyPreset`。

**Tech Stack:** React 19 + TS + Vite + vitest;i18n zh/en;样式 global.css(无 CSS 框架)。

**Spec:** `docs/superpowers/specs/2026-09-23-2d-batch-v3-design.md`

## Global Constraints

- 单图模式(≤1 张图)既有功能零回归。
- lint 基线 11 个既有错误不新增(均在 3D 文件;验收标准 = 数量不新增)。
- UI 图标一律内联 SVG,禁 emoji。
- i18n zh.json/en.json 双语 key 对齐(每个任务新增 key 两边同步加)。
- 测试只写 lib 层(vitest);组件层不建测试。
- 所有 commit 尾注:`Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 分支:`feature/2d-batch-v3`(已建,spec 已提交)。

---

### Task 1: lib 纯函数 displaySeed / truncateSeed / RowSeedView

**Files:**
- Modify: `src/lib/batch/imageList.ts`(文件末尾追加)
- Test: `src/lib/batch/imageList.test.ts`(追加 describe 块)

**Interfaces:**
- Consumes: 既有 `rowEffectiveSeed(img, base, def)`、`BatchImage`/`BatchBase`(本文件)。
- Produces(Task 3/4 依赖,签名精确如下):
  - `displaySeed(img: BatchImage, mode: 'unified' | 'perImage', base: BatchBase, def: StyleDefinition): string | null`
  - `truncateSeed(code: string, keep?: number): string`
  - `interface RowSeedView { id: string; full: string | null; short: string | null }`(full=null ⇔ 「跟随」)

- [ ] **Step 1: 写失败测试**

在 `src/lib/batch/imageList.test.ts` 顶部 import 中追加 `displaySeed, truncateSeed`,文件末尾追加:

```ts
describe('displaySeed', () => {
  it('统一模式:行 seed=null 返回基线编码码(与 rowEffectiveSeed 同值)', () => {
    expect(displaySeed(makeRow(), 'unified', base, def))
      .toBe(encodeSeed('halftone', base.params, def, base.textParams))
  })
  it('统一模式:忽略残留的行 seed(统一语义下行恒跟随,残留值容错一律基线码)', () => {
    expect(displaySeed(makeRow({ seed: '0A5' }), 'unified', base, def))
      .toBe(encodeSeed('halftone', base.params, def, base.textParams))
  })
  it('独立模式:seed 非 null 原样透传(不校验,校验职责在上游)', () => {
    expect(displaySeed(makeRow({ seed: '0A5' }), 'perImage', base, def)).toBe('0A5')
  })
  it('独立模式:seed=null 返回 null(视图层渲染「跟随」短标)', () => {
    expect(displaySeed(makeRow(), 'perImage', base, def)).toBeNull()
  })
})

describe('truncateSeed', () => {
  it('短码原样返回', () => {
    expect(truncateSeed('0A5', 7)).toBe('0A5')
  })
  it('超长截断保前缀加 …', () => {
    expect(truncateSeed('0A123456789', 7)).toBe('0A12345…')
  })
  it('长度恰等于 keep 原样(边界含等号)', () => {
    expect(truncateSeed('0123456', 7)).toBe('0123456')
  })
  it('空串安全', () => {
    expect(truncateSeed('', 7)).toBe('')
  })
  it('keep 缺省为 7', () => {
    expect(truncateSeed('0A123456789')).toBe('0A12345…')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/batch/imageList.test.ts`
Expected: FAIL,报 displaySeed/truncateSeed 未导出(import 报错)。

- [ ] **Step 3: 实现**

在 `src/lib/batch/imageList.ts` 文件末尾(blobExt 之后)追加:

```ts
/** 行种子展示语义(v3):统一模式一律返回基线编码码(统一语义下行 seed 恒为
 *  跟随,残留非 null 值容错忽略);独立模式非 null 行原样透传(不校验,校验在
 *  上游),null 返回 null 由视图层渲染「跟随」短标。与 rowEffectiveSeed 的
 *  区别:后者把 null 编码成基线码供处理任务消费,前者把「跟随」语义保留给 UI。 */
export function displaySeed(
  img: BatchImage,
  mode: 'unified' | 'perImage',
  base: BatchBase,
  def: StyleDefinition,
): string | null {
  if (mode === 'perImage') return img.seed
  return rowEffectiveSeed(img, base, def)
}

/** 种子码截断:保前缀(版本位+风格位在头部,保前缀即可辨),超出加省略号。 */
export function truncateSeed(code: string, keep = 7): string {
  return code.length <= keep ? code : code.slice(0, keep) + '…'
}

/** 行种子展示视图(v3):App2D 统一计算后下发,ImageStrip 种子条与 BatchPanel
 *  行列表共用同一份数据,两处显示永不漂移。full=null ⇔ 「跟随」短标。 */
export interface RowSeedView {
  id: string
  full: string | null
  short: string | null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/batch/imageList.test.ts`
Expected: PASS(全部,含既有用例)。

- [ ] **Step 5: Commit**

```bash
git add src/lib/batch/imageList.ts src/lib/batch/imageList.test.ts
git commit -m "feat: displaySeed/truncateSeed 行种子展示纯函数

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 上传页首载 ≥2 张自动打开批量浮窗

**Files:**
- Modify: `src/components/App2D.tsx`(`handleImagesLoad`,约 429-434 行)

**Interfaces:**
- Consumes: 既有 `showBatchPanel` state(仅 `setShowBatchPanel(true)`,无新状态)。
- Produces: 行为变更(无新接口)。

- [ ] **Step 1: 修改 handleImagesLoad**

将该回调改为(注释同步更新):

```ts
  // 首次上传(仅上传页挂载的 ImageUploader 触发,images 必为空):
  // 1 张走数组但单图行为不变;≥2 张即批量模式,选中第 0 行。
  // 首传同样受 20 行上限:multiple 一次选/拖超量时按序截断——[+] 与测试图
  // 追加路径各有守卫,此处不截会让 strip 计数击穿(如 25/20)且再无回落入口。
  // v3:首载 ≥2 张自动打开批量浮窗;追加路径([+]/测试图)不碰 showBatchPanel,
  // 手动关闭后本会话不再自动弹。删到 0 张回上传页再传会再弹(视为新会话)
  const handleImagesLoad = useCallback((imgs: HTMLImageElement[], names: string[]) => {
    if (imgs.length === 0) return
    const capped = imgs.slice(0, BATCH_MAX_ROWS)
    setImages(capped.map((img, i) => makeRow(img, names[i] ?? '')))
    setSelectedIndex(0)
    if (capped.length >= 2) setShowBatchPanel(true)
  }, [])
```

(实际只新增最后一行 `if (capped.length >= 2) setShowBatchPanel(true)`,注释按上面更新。)

- [ ] **Step 2: 类型与全量回归验证**

Run: `npx tsc -b && npm test`
Expected: tsc 0 error;测试全绿(组件无新测,确保未破坏既有)。

- [ ] **Step 3: Commit**

```bash
git add src/components/App2D.tsx
git commit -m "feat: 上传页首载多图自动打开批量浮窗

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 底部栏种子条 + done 行对角线对比(useCopyFeedback hook)

**Files:**
- Create: `src/lib/useCopyFeedback.ts`
- Modify: `src/components/ImageStrip.tsx`(格子改造)
- Modify: `src/components/App2D.tsx`(rowsSeedView 计算 + 下发)
- Modify: `src/styles/global.css`(image-strip 段后追加)
- Modify: `src/i18n/zh.json` + `src/i18n/en.json`(batch.followBase)

**Interfaces:**
- Consumes: Task 1 的 `displaySeed`/`truncateSeed`/`RowSeedView`。
- Produces:
  - `useCopyFeedback(): { feedback: { id: string; ok: boolean } | null; copy: (id: string, text: string) => Promise<void> }`(Task 4 复用)
  - `ImageStripProps` 新增 `seedViews: RowSeedView[]`(必传,与 images 等长同序 id 对齐)
  - App2D 新增派生 `rowsSeedView: RowSeedView[]`(Task 4 下发 BatchPanel 复用)

- [ ] **Step 1: 新建 useCopyFeedback hook**

`src/lib/useCopyFeedback.ts` 全文:

```ts
// src/lib/useCopyFeedback.ts
// 种子码「点击复制」短反馈(v3):feedback 标记最近一次复制项与成败,超时自动
// 清空;同刻只标记一项(连点以最后一次为准)。ImageStrip 种子条与 BatchPanel
// 行列表共用同款交互。
import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyFeedback() {
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean } | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const copy = useCallback(async (id: string, text: string) => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = false
    }
    setFeedback({ id, ok })
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFeedback(null), ok ? 1500 : 2500)
  }, [])

  // 卸载清计时器,避免 setState on unmounted
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return { feedback, copy }
}
```

- [ ] **Step 2: App2D 计算 rowsSeedView 并下发 ImageStrip**

在 `src/components/App2D.tsx`:

2a. import 追加(displaySeed, truncateSeed, RowSeedView 加进既有 imageList import 大括号):

```ts
import {
  rowEffectiveSeed, syncRowSeed, loadWorking, randomizeRowSeed, assembleProcessingTasks,
  isTaskSharedEdit, seedMatchesStyle, blobExt, displaySeed, truncateSeed, type RowSeedView,
  type BatchFormat,
} from '../lib/batch/imageList'
```

2b. 在 `const currentStyle = getStyle(activeStyle)`(约 798 行)之后追加:

```ts
  // 行种子展示视图(v3):displaySeed 统一计算,底部栏种子条与批量浮窗行列表
  // 共用同一份(TASK 共享消费),两处显示永不漂移。full=null ⇔ 「跟随」短标
  const rowsSeedView: RowSeedView[] = useMemo(() => images.map((row) => {
    if (!currentStyle) return { id: row.id, full: null, short: null }
    const full = displaySeed(row, seedMode, batchBase, currentStyle)
    return { id: row.id, full, short: full === null ? null : truncateSeed(full) }
  }), [images, seedMode, batchBase, currentStyle])
```

2c. `<ImageStrip ...>` 调用处加 `seedViews={rowsSeedView}`(放在 `images={images}` 之后)。

- [ ] **Step 3: ImageStrip 格子改造**

`src/components/ImageStrip.tsx` 改为:

3a. import 区:

```ts
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BatchImage, RowSeedView } from '../lib/batch/imageList'
import { BATCH_MAX_ROWS } from '../lib/batch/batchJob'
import { useCopyFeedback } from '../lib/useCopyFeedback'
```

3b. props 接口加一行(注释说明):

```ts
export interface ImageStripProps {
  images: BatchImage[]
  /** 行种子展示视图(App2D 统一计算,id 与 images 对齐):full=null 渲染「跟随」 */
  seedViews: RowSeedView[]
  selectedIndex: number
  mode: 'single' | 'batch'
  /** 已达 20 行上限:禁用 [+](测试图追加上限守卫在 App2D 回调内) */
  atLimit: boolean
  onSelect: (i: number) => void
  onRemove: (i: number) => void
  onAddFiles: (files: FileList | File[]) => void
  testImages: TestImage[]
  onTestImage: (src: string) => void
}
```

3c. 组件签名解构加 `seedViews`,函数体加 `const { feedback, copy } = useCopyFeedback()`,上传图 map 改为(缩略图包进 wrap,加对比层与种子条;remove 按钮/测试图/[+]/计数/input 全部不动):

```tsx
      {images.map((img, i) => {
        const sv = seedViews.find((v) => v.id === img.id)
        return (
          <div
            key={img.id}
            className={`image-strip-cell${i === selectedIndex ? ' image-strip-cell--selected' : ''}`}
          >
            <div className="image-strip-thumb-wrap">
              <img
                className="image-strip-thumb"
                src={img.image.src}
                alt={img.fileName}
                title={img.fileName}
                onClick={() => onSelect(i)}
              />
              {/* done 行对角线对比(v3):原图铺底,处理后图 clip 右上三角覆盖。
                  ╲ 左上→右下分割:右上=处理后,左下露出原图;结果与原图同尺寸,
                  cover 裁切一致;未完成/失败行维持原图 */}
              {img.status === 'done' && img.objectUrl && (
                <>
                  <img className="image-strip-result" src={img.objectUrl} alt="" aria-hidden="true" />
                  <svg className="image-strip-diagonal" viewBox="0 0 80 56" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="0" y1="0" x2="80" y2="56" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                </>
              )}
            </div>
            <button
              type="button"
              className="image-strip-remove"
              title={t('batch.remove')}
              aria-label={t('batch.remove')}
              onClick={() => onRemove(i)}
            >
              {removeIcon}
            </button>
            {/* 种子条:截断码 + title 全量 + 点击复制;独立模式未独立行显示「跟随」。
                stopPropagation 防触发选中 */}
            {sv && sv.full !== null ? (
              <button
                type="button"
                className="image-strip-seed"
                title={sv.full}
                onClick={(e) => { e.stopPropagation(); void copy(img.id, sv.full!) }}
              >
                {feedback?.id === img.id ? (feedback.ok ? t('seed.copied') : t('seed.copyFailed')) : sv.short}
              </button>
            ) : (
              <span className="image-strip-seed image-strip-seed--follow">{t('batch.followBase')}</span>
            )}
          </div>
        )
      })}
```

- [ ] **Step 4: CSS**

`src/styles/global.css` 的 `.image-strip--batch .image-strip-thumb--test` 规则(约 904 行)之后追加:

```css
/* --- v3:缩略图种子条 + done 行对角线对比 --- */
/* 格子改纵向:图(80×56)在上,种子条在下 */
.image-strip-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

/* 对比层容器:包住缩略图,overflow 裁掉 clip 外溢出;边框/选中仍在 .image-strip-thumb 上(零改动) */
.image-strip-thumb-wrap {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

/* 处理后图覆盖右上三角:clip-path polygon(0 0, 100% 0, 100% 100%) = ╲ 分割 */
.image-strip-result {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  clip-path: polygon(0 0, 100% 0, 100% 100%);
  pointer-events: none;
}

/* 对角分割线(非方形缩略图,SVG 线适配) */
.image-strip-diagonal {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* 种子条:与缩略图同宽,等宽小字,ellipsis 兜底(复制失败文案较长时截断) */
.image-strip-seed {
  width: 80px;
  padding: 1px 2px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 9px;
  line-height: 1.2;
  color: #333;
  background: #F5F5F5;
  border: 1px solid #DDD;
  cursor: copy;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.image-strip-seed:hover {
  border-color: #000;
  color: #000;
}

/* 「跟随」短标:非交互,弱化显示 */
.image-strip-seed--follow {
  cursor: default;
  font-style: italic;
  color: #999;
  background: none;
  border-color: #EEE;
}
```

注意:`.image-strip-cell` 原有规则(`position: relative; flex-shrink: 0`)保留,新规则只是追加声明(同选择器合并亦可)。

- [ ] **Step 5: i18n**

`src/i18n/zh.json` batch 段(`"pending": "待处理"` 之后)加:

```json
    "followBase": "跟随"
```

`src/i18n/en.json` 对应位置(结构同 zh)加:

```json
    "followBase": "Follow"
```

- [ ] **Step 6: 验证**

Run: `npx tsc -b && npm test && npm run lint`
Expected: tsc 0 error;测试全绿;lint 错误数 = 11(基线,均在 3D 文件)。

- [ ] **Step 7: Commit**

```bash
git add src/lib/useCopyFeedback.ts src/components/ImageStrip.tsx src/components/App2D.tsx src/styles/global.css src/i18n/zh.json src/i18n/en.json
git commit -m "feat: 底部图片栏种子条与 done 行对角线对比

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 批量浮窗配置 tab「图片与种子」只读列表

**Files:**
- Modify: `src/components/BatchPanel.tsx`(配置 tab,开始处理按钮下方)
- Modify: `src/components/App2D.tsx`(BatchPanel 调用处加 props)
- Modify: `src/styles/global.css`(batch 段追加)
- Modify: `src/i18n/zh.json` + `src/i18n/en.json`(batch.rowListTitle)

**Interfaces:**
- Consumes: Task 1 `RowSeedView`;Task 3 `rowsSeedView`(App2D)、`useCopyFeedback`;App2D 既有 `handleSelect`。
- Produces: `BatchPanelProps` 新增 `selectedIndex: number`、`onRowSelect: (i: number) => void`、`seedViews: RowSeedView[]`(Task 5 再加 presets/onApplyPreset)。

- [ ] **Step 1: BatchPanelProps 扩展**

`src/components/BatchPanel.tsx`:

```ts
export interface BatchPanelProps {
  /** 行状态全集(含 done 结果),由 App2D 持有;结果 tab 直接按行渲染 */
  images: BatchImage[]
  /** 当前选中行(行列表高亮;点击行=切换主画布选中,与底部栏同语义) */
  selectedIndex: number
  /** 行种子展示视图(App2D 统一计算,id 与 images 对齐):full=null 渲染「跟随」 */
  seedViews: RowSeedView[]
  seedMode: BatchSeedMode
  ...(其余既有 props 不变)
  onSeedModeChange: (m: BatchSeedMode) => void
  onFormatChange: (f: BatchFormat) => void
  onRandomizeAll: () => void
  onStart: () => void
  /** 行列表点击行=切换选中(App2D handleSelect,含独立模式懒同步) */
  onRowSelect: (i: number) => void
  onRetryRow: (id: string) => void
  ...
}
```

import 区加:`import { blobExt, type BatchImage, type RowSeedView } from '../lib/batch/imageList'`(替换原 blobExt import 行)与 `import { useCopyFeedback } from '../lib/useCopyFeedback'`;组件内解构加 `selectedIndex, seedViews, onRowSelect`,加 `const { feedback, copy } = useCopyFeedback()`。

- [ ] **Step 2: 配置 tab 渲染行列表**

配置 tab(`tab === 'config'` 分支)「开始处理」按钮之后追加:

```tsx
            {/* v3 行列表(只读):缩略图+生效种子+状态点;点击行=切换主画布选中。
                种子编辑仍集中在主界面 SeedBar(v2 语义),本列表不提供编辑 */}
            <div className="batch-rowlist">
              <div className="batch-rowlist-head">
                <span>{t('batch.rowListTitle')}</span>
                {/* Task 5 在此加 PresetMenu 入口 */}
              </div>
              <div className="batch-rowlist-body">
                {images.map((row, i) => {
                  const sv = seedViews.find((v) => v.id === row.id)
                  return (
                    <div
                      key={row.id}
                      className={`batch-rowlist-row${i === selectedIndex ? ' batch-rowlist-row--selected' : ''}`}
                      onClick={() => onRowSelect(i)}
                    >
                      <img className="batch-rowlist-thumb" src={row.image.src} alt="" aria-hidden="true" />
                      <span className={`batch-rowlist-dot batch-rowlist-dot--${row.status}`} aria-hidden="true" />
                      {sv && sv.full !== null ? (
                        <button
                          type="button"
                          className="batch-rowlist-seed"
                          title={sv.full}
                          onClick={(e) => { e.stopPropagation(); void copy(row.id, sv.full!) }}
                        >
                          {feedback?.id === row.id ? (feedback.ok ? t('seed.copied') : t('seed.copyFailed')) : sv.short}
                        </button>
                      ) : (
                        <span className="batch-rowlist-seed batch-rowlist-seed--follow">{t('batch.followBase')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
```

- [ ] **Step 3: App2D 下发**

`<BatchPanel ...>` 调用处加:

```ts
          selectedIndex={selectedIndex}
          seedViews={rowsSeedView}
          onRowSelect={handleSelect}
```

- [ ] **Step 4: CSS**

global.css 文件末尾批量段(batch 相关样式附近)追加:

```css
/* --- v3:批量浮窗配置 tab 行列表(只读) --- */
.batch-rowlist {
  margin-top: 10px;
  border: 1px solid #DDD;
}

.batch-rowlist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #F5F5F5;
  border-bottom: 1px solid #DDD;
  font-size: 11px;
  color: #666;
}

.batch-rowlist-body {
  max-height: 240px;
  overflow-y: auto;
}

.batch-rowlist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-bottom: 1px solid #EEE;
}

.batch-rowlist-row:last-child {
  border-bottom: none;
}

.batch-rowlist-row:hover {
  background: #F9F9F9;
}

.batch-rowlist-row--selected {
  background: #F0F0F0;
  box-shadow: inset 2px 0 0 #000;
}

.batch-rowlist-thumb {
  width: 32px;
  height: 24px;
  object-fit: cover;
  border: 1px solid #CCC;
  flex-shrink: 0;
}

/* 状态点:与结果 tab 色系一致(灰/蓝/绿/红) */
.batch-rowlist-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #CCC;
}

.batch-rowlist-dot--processing {
  background: #2B7CDF;
  animation: batch-rowlist-blink 0.9s infinite alternate;
}

.batch-rowlist-dot--done {
  background: #2FA84F;
}

.batch-rowlist-dot--failed {
  background: #E5484D;
}

@keyframes batch-rowlist-blink {
  from { opacity: 1; }
  to { opacity: 0.35; }
}

.batch-rowlist-seed {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 10px;
  color: #333;
  background: none;
  border: none;
  padding: 0;
  cursor: copy;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.batch-rowlist-seed--follow {
  cursor: default;
  color: #999;
  font-style: italic;
  font-family: inherit;
}
```

- [ ] **Step 5: i18n**

zh.json batch 段加 `"rowListTitle": "图片与种子"`;en.json 对应加 `"rowListTitle": "Images & Seeds"`(均在 followBase 旁,按字母序或紧邻均可,两文件结构对齐即可)。

- [ ] **Step 6: 验证**

Run: `npx tsc -b && npm test && npm run lint`
Expected: tsc 0 error;测试全绿;lint = 11 基线。

- [ ] **Step 7: Commit**

```bash
git add src/components/BatchPanel.tsx src/components/App2D.tsx src/styles/global.css src/i18n/zh.json src/i18n/en.json
git commit -m "feat: 批量浮窗配置 tab 图片与种子只读列表

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: PresetMenu 种子列表(复用预设系统,两处入口)

**Files:**
- Create: `src/components/PresetMenu.tsx`
- Modify: `src/components/SeedBar.tsx`(列表入口)
- Modify: `src/components/BatchPanel.tsx`(行列表头入口)
- Modify: `src/components/App2D.tsx`(两处下发 presets/onApplyPreset)
- Modify: `src/styles/global.css`(preset-menu 段)
- Modify: `src/i18n/zh.json` + `src/i18n/en.json`(batch.seedList、preset.menuEmpty)

**Interfaces:**
- Consumes: 既有 `PresetEntry`(lib/presetStore)、`getStyle`(StyleRegistry)、App2D 既有 `presets` state 与 `handleApplyPreset`。
- Produces:
  - `export default function PresetMenu({ presets, onApply, onClose }: { presets: PresetEntry[]; onApply: (entry: PresetEntry) => void; onClose: () => void })`
  - `export const presetListIcon: JSX.Element`(入口图标,SeedBar/BatchPanel 共用)
  - `SeedBarProps` 新增 `presets: PresetEntry[]`、`onApplyPreset: (entry: PresetEntry) => void`
  - `BatchPanelProps` 新增同上两个

- [ ] **Step 1: 新建 PresetMenu.tsx**

`src/components/PresetMenu.tsx` 全文:

```tsx
// src/components/PresetMenu.tsx
// 种子/配置下拉菜单(v3):数据源复用 localStorage 预设系统(presetStore),
// 点击=应用该配置(与 PresetPanel 点条目完全同语义,含切风格/整批基线双写),
// 应用后关闭;不含删除——管理仍在 PresetPanel(单一职责)。锚定入口按钮绝对
// 定位,点击外部/Esc 关闭。SeedBar 与 BatchPanel 行列表头两处复用。
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getStyle } from '../lib/StyleRegistry'
import type { PresetEntry } from '../lib/presetStore'

interface PresetMenuProps {
  presets: PresetEntry[]
  onApply: (entry: PresetEntry) => void
  onClose: () => void
}

/** 菜单入口图标(三横线列表),SeedBar 与 BatchPanel 行列表头共用(禁 emoji) */
export const presetListIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
)

export default function PresetMenu({ presets, onApply, onClose }: PresetMenuProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="preset-menu" ref={ref}>
      {presets.length === 0 && <div className="preset-menu-empty">{t('preset.menuEmpty')}</div>}
      {presets.map((e) => (
        <button key={e.id} className="preset-menu-item" onClick={() => onApply(e)}>
          <span className="preset-menu-name">{e.name}</span>
          <span className="preset-menu-style">{t(getStyle(e.styleId)?.label ?? e.styleId)}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: SeedBar 加入口**

`src/components/SeedBar.tsx`:

2a. import 加:

```ts
import type { PresetEntry } from '../lib/presetStore'
import PresetMenu, { presetListIcon } from './PresetMenu'
```

2b. props 接口:

```ts
interface SeedBarProps {
  seed: string
  onApply: (code: string) => boolean
  /** 已保存配置(种子列表数据源,App2D presets) */
  presets: PresetEntry[]
  /** 应用配置(与 PresetPanel 同语义) */
  onApplyPreset: (entry: PresetEntry) => void
}
```

2c. 组件内加 `const [presetOpen, setPresetOpen] = useState(false)`。

2d. 非编辑态返回值(编辑态 seed-bar--edit 不加,保持输入流简洁)末尾追加:

```tsx
      <div className="seed-bar-preset-anchor">
        <button
          className="seed-bar-btn"
          title={t('batch.seedList')}
          aria-label={t('batch.seedList')}
          aria-expanded={presetOpen}
          onClick={() => setPresetOpen((v) => !v)}
        >
          {presetListIcon}
        </button>
        {presetOpen && (
          <PresetMenu
            presets={presets}
            onApply={(e) => { onApplyPreset(e); setPresetOpen(false) }}
            onClose={() => setPresetOpen(false)}
          />
        )}
      </div>
```

- [ ] **Step 3: BatchPanel 行列表头加入口**

`src/components/BatchPanel.tsx`:

3a. import 加 `import PresetMenu, { presetListIcon } from './PresetMenu'` 与 `import type { PresetEntry } from '../lib/presetStore'`。

3b. props 加(附注释):

```ts
  /** 已保存配置(种子列表数据源,App2D presets) */
  presets: PresetEntry[]
  /** 应用配置(与 PresetPanel 同语义;App2D handleApplyPreset) */
  onApplyPreset: (entry: PresetEntry) => void
```

3c. 组件内加 `const [presetMenuOpen, setPresetMenuOpen] = useState(false)`。

3d. Task 4 留的 `batch-rowlist-head` 注释位替换为:

```tsx
              <div className="batch-rowlist-head">
                <span>{t('batch.rowListTitle')}</span>
                <div className="batch-rowlist-preset-anchor">
                  <button
                    className="batch-icon-btn"
                    title={t('batch.seedList')}
                    aria-label={t('batch.seedList')}
                    aria-expanded={presetMenuOpen}
                    onClick={() => setPresetMenuOpen((v) => !v)}
                  >
                    {presetListIcon}
                  </button>
                  {presetMenuOpen && (
                    <PresetMenu
                      presets={presets}
                      onApply={(e) => { onApplyPreset(e); setPresetMenuOpen(false) }}
                      onClose={() => setPresetMenuOpen(false)}
                    />
                  )}
                </div>
              </div>
```

- [ ] **Step 4: App2D 两处下发**

`<SeedBar ...>` 调用处加:

```ts
          presets={presets}
          onApplyPreset={handleApplyPreset}
```

`<BatchPanel ...>` 调用处加(在 onRowSelect 旁):

```ts
          presets={presets}
          onApplyPreset={handleApplyPreset}
```

- [ ] **Step 5: CSS**

global.css 追加:

```css
/* --- v3:种子/配置下拉菜单(PresetMenu,SeedBar 与 BatchPanel 行列表头共用) --- */
.seed-bar-preset-anchor,
.batch-rowlist-preset-anchor {
  position: relative;
  display: inline-flex;
}

.preset-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 60;
  min-width: 180px;
  max-height: 260px;
  overflow-y: auto;
  background: #FFF;
  border: 1px solid #000;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
}

.preset-menu-empty {
  padding: 10px 12px;
  font-size: 11px;
  color: #999;
}

.preset-menu-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  border-bottom: 1px solid #EEE;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.preset-menu-item:last-child {
  border-bottom: none;
}

.preset-menu-item:hover {
  background: #F0F0F0;
}

.preset-menu-name {
  font-size: 12px;
  color: #000;
}

.preset-menu-style {
  font-size: 10px;
  color: #999;
}
```

- [ ] **Step 6: i18n**

zh.json:batch 段加 `"seedList": "配置列表"`;preset 段加 `"menuEmpty": "暂无保存的配置"`。
en.json:batch 段加 `"seedList": "Preset List"`;preset 段加 `"menuEmpty": "No saved presets yet"`。

- [ ] **Step 7: 验证**

Run: `npx tsc -b && npm test && npm run lint`
Expected: tsc 0 error;测试全绿;lint = 11 基线。

- [ ] **Step 8: Commit**

```bash
git add src/components/PresetMenu.tsx src/components/SeedBar.tsx src/components/BatchPanel.tsx src/components/App2D.tsx src/styles/global.css src/i18n/zh.json src/i18n/en.json
git commit -m "feat: 种子列表复用预设系统(SeedBar+批量浮窗入口)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: 全量验证 + 手测清单

**Files:**
- 无代码改动(验证任务;发现问题则修复并单独 commit)。

**Interfaces:**
- Consumes: 全部前序任务成果。

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿(既有 201 + Task 1 新增 9)。

- [ ] **Step 2: lint 基线比对**

Run: `npm run lint`
Expected: 恰 11 个错误且全部在 3D 相关文件(v2 基线;数量/位置不新增)。

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b`
Expected: 0 error。

- [ ] **Step 4: i18n 对齐检查**

Run(Git Bash):

```bash
node -e "const fs=require('fs');const z=JSON.parse(fs.readFileSync('src/i18n/zh.json','utf8'));const e=JSON.parse(fs.readFileSync('src/i18n/en.json','utf8'));const k=(o,p='')=>Object.entries(o).flatMap(([K,V])=>typeof V==='object'?k(V,p+K+'.'):[p+K]);const zk=k(z),ek=k(e);const zo=zk.filter(x=>!ek.includes(x)),eo=ek.filter(x=>!zk.includes(x));console.log('zh-only:',zo);console.log('en-only:',eo);if(zo.length||eo.length)process.exit(1)"
```

Expected: 两边均为 `[]`(退出码 0)。

- [ ] **Step 5: 手测清单(浏览器,交付后执行)**

1. 上传页选 1 张 → 单图模式,浮窗不自动弹(v1 行为不变)。
2. 上传页选 3 张 → 浮窗自动弹出;手动关掉,[+] 追加 2 张 → 不再自动弹。
3. 底部栏每张缩略图下有种子条:统一模式三行同码;调参 → 三行码实时变;点码 → 「已复制」,粘贴验证。
4. 切「每图独立」→ 各行码不变(种子未独立时显示「跟随」);SeedBar 编辑后切行 → 该行码更新。
5. 浮窗配置 tab 行列表:点行 → 主画布切到该行;选中行高亮;状态点随处理流转(pending→processing→done)。
6. SeedBar 与浮窗行列表头两处「配置列表」:先保存一个预设;两处点击入口 → 弹层列出预设(名+风格);点条目 → 参数/风格/主画布切换,批量基线同步(统一模式再处理出图一致);空预设时显示「暂无保存的配置」;Esc/点外部关闭。
7. 处理完成 → 底部栏 done 行变对角线对比(左下原图、右上处理后、白线分割);未完成行原图;主画布 CompareSlider 不受影响。
8. 单图模式全回归:上传/调参/种子复制粘贴/预设保存应用/导出 PNG-JPG-SVG/比较/关闭确认。

- [ ] **Step 6: 发现问题的修复(如有)**

任何一步不符 → 定位修复 → 重跑该步与全量测试 → commit `fix: ...(描述)`。全部通过则无需 commit。

---

## Self-Review 记录

- Spec 覆盖:5 项改动分别由 Task 2(自动浮窗)、Task 4(行列表)、Task 3(种子条+对角线,种子条与对比同在 ImageStrip)、Task 5(种子列表)、Task 1(纯函数地基)覆盖;i18n/CSS/验证由各任务与 Task 6 覆盖。
- 占位符扫描:无 TBD/TODO;Task 4 的 `{/* Task 5 在此加 PresetMenu 入口 */}` 是有意的结构预留,Task 5 有精确替换内容。
- 类型一致性:`RowSeedView`/`displaySeed`/`truncateSeed`/`useCopyFeedback`/`PresetMenu`/`presetListIcon` 在各任务间签名一致;`seedViews` 在 ImageStripProps 与 BatchPanelProps 均为 `RowSeedView[]`。
