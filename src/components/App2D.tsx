import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShaderRenderer } from '../lib/ShaderRenderer'
import { AsciiCanvasRenderer } from '../lib/AsciiCanvasRenderer'
import { styles, getStyle, defaultParams, defaultTextParams } from '../lib/StyleRegistry'
import { encodeSeed, decodeSeed } from '../lib/seedCodec'
import { findBrightestPoint } from '../lib/brightPoint'
import { randomizeParams } from '../lib/randomSeed'
import { renderImage, exportCanvasBlob, exportJpgWithBlackBg } from '../lib/renderImage'
import { loadPresets, savePreset, removePreset, mergeWithDefaults, type PresetEntry } from '../lib/presetStore'
import { randomId } from '../lib/randomId'
import { readImageFiles } from '../lib/readImageFiles'
import { findMatchingBuiltInPreset, resolveBuiltInPreset } from '../lib/builtInPreset'
import type { BuiltInPresetDefinition, StyleId } from '../types'
import type { BatchImage, BatchBase } from '../lib/batch/imageList'
import {
  rowEffectiveSeed, syncRowSeed, loadWorking, randomizeRowSeed, assembleProcessingTasks,
  isTaskSharedEdit, seedMatchesStyle, blobExt, displaySeed, truncateSeed, type RowSeedView,
  type BatchFormat,
} from '../lib/batch/imageList'
import { BATCH_MAX_ROWS, canRunBatch, dedupeName, zipEntryName } from '../lib/batch/batchJob'
import {
  buildBatchZip, createBatchRunner, createCanvasRenderTask,
  type ProcessingBaseline, type ProcessingJob, type RenderTaskFn,
} from '../lib/batch/runBatch'
import ImageUploader from './ImageUploader'
import ImageStrip from './ImageStrip'
import StyleSelector from './StyleSelector'
import ParamPanel from './ParamPanel'
import PresetBar from './PresetBar'
import PresetPanel from './PresetPanel'
import { SeedBar } from './SeedBar'
import BuiltInPresetBar from './BuiltInPresetBar'
import ActionBar from './ActionBar'
import { CompareSlider } from './CompareSlider'
import ConfirmDialog from './ConfirmDialog'
import BatchPanel, { type BatchSeedMode } from './BatchPanel'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 新建批量图片行(v2 状态从 v1 BatchJob 上移 App2D,上传即建行):
// seed=null 跟随整批基线;blob/objectUrl 等处理字段由队列写入
function makeRow(image: HTMLImageElement, fileName: string): BatchImage {
  return {
    id: randomId(),
    fileName,
    image,
    seed: null,
    status: 'pending',
    blob: null,
    objectUrl: null,
    error: null,
    renderedSeed: null,
    renderedStyleId: null,
  }
}

// 测试图行名:从 /local_test_pic/cake.jpg 一类路径取末段,批量输出命名可辨识
function testImageName(src: string): string {
  return src.split('/').pop() || 'test-image'
}

// 让出一帧给 React:setImages 提交与 ref 同步 effect 落定后再读,否则 drain 首轮
// 读到旧快照会误判"无待处理"而提前退出。浏览器对齐渲染帧;jsdom(无 rAF)回落
// setTimeout,与 runBatch 的 nextFrame 同策略
const yieldFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0),
  )

// 触发浏览器下载:临时 <a> 点击后立即回收 URL(同步生命周期,无需延时兜底)
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// createCanvasRenderTask 实际只消费 baseline.fontParams(行级风格/参数/种子经
// RenderTask 逐行传入),其余字段传空壳占位:任务重建只挂在字体变化上,避免无关
// 状态触发重建而弃掉闭包内行间复用的离屏 renderer(WebGL 上下文无人 destroy 会泄漏)
const RENDER_TASK_BASE_SHELL: Pick<ProcessingBaseline, 'params' | 'textParams'> = {
  params: {},
  textParams: {},
}

function App2D() {
  const { t } = useTranslation()
  // 多图地基(v2):行状态唯一所有者是 App2D。0 张=上传页,1 张=单图模式(零回归,
  // 既有 handler 语义不变),≥2 张=批量模式(主画布渲染选中行)。
  // 派生 image 替代 v1 的独立 image state:渲染 effect / brightest 检测 / CompareSlider
  // 均消费派生值,切行(统一模式只改 selectedIndex)即自然重绘与重检测。
  const [images, setImages] = useState<BatchImage[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const image = images[selectedIndex]?.image ?? null
  const isBatch = images.length > 1
  const [activeStyle, setActiveStyle] = useState<StyleId>('halftone')
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams('halftone'))
  const [textParams, setTextParams] = useState<Record<string, string>>(() => defaultTextParams('halftone'))
  const [compareMode, setCompareMode] = useState(false)
  // 体积光自动光源:图片最亮点的 UV 坐标(检测失败为 null)
  const [brightest, setBrightest] = useState<{ x: number; y: number } | null>(null)
  // 主画布 × 的关闭确认:单图=v1 退出确认;批量=批量会话关闭确认(清全部图片)
  const [closeDialog, setCloseDialog] = useState<'single' | 'batch' | null>(null)
  // 本地预设（localStorage 持久化，见 lib/presetStore）
  const [presets, setPresets] = useState<PresetEntry[]>(() => loadPresets())
  const [showPresetPanel, setShowPresetPanel] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ShaderRenderer | null>(null)
  const asciiCanvasRef = useRef<HTMLCanvasElement>(null)
  const asciiRendererRef = useRef<AsciiCanvasRenderer | null>(null)
  const [fontParams, setFontParams] = useState<Record<string, FontFace | null>>({})
  // 会话级风格记忆：每个风格最后一次离开时的参数/字体状态（刷新即失，不持久化）。
  // fontParams 可选——seed/预设写入的记忆不含字体，语义为"字体不随种子/预设携带"
  const styleMemoryRef = useRef<Partial<Record<StyleId, {
    params: Record<string, number>
    textParams: Record<string, string>
    fontParams?: Record<string, FontFace | null>
  }>>>({})

  // ---------------------------------------------------------------------------
  // Batch v2(模式语义 + 整批基线 + 队列调度,行状态唯一所有者)
  // ---------------------------------------------------------------------------

  // 种子模式:统一=全行共享活基线;独立=行各有种子(null=跟随基线)。
  // 整批基线 baseParams/baseTextParams:统一模式下由编辑 handler 双写维持与工作
  // 副本同值(单图模式写了不碍事);独立模式下是行 seed=null 的回退目标,切模式/
  // 换风格/应用预设时快照。独立存两份 state 而非派生,是为了让独立模式的选中行
  // 编辑/重骰只动工作副本、不溅射其他行的回退目标
  const [seedMode, setSeedMode] = useState<BatchSeedMode>('unified')
  const [baseParams, setBaseParams] = useState<Record<string, number>>(() => defaultParams('halftone'))
  const [baseTextParams, setBaseTextParams] = useState<Record<string, string>>(() => defaultTextParams('halftone'))
  const [format, setFormat] = useState<BatchFormat>('png')
  const [showBatchPanel, setShowBatchPanel] = useState(false)
  // 独立→统一切换的确认弹窗(丢弃全部行种子,以选中行为准)
  const [confirmUnifiedDialog, setConfirmUnifiedDialog] = useState(false)

  const batchBase: BatchBase = useMemo(
    () => ({ params: baseParams, textParams: baseTextParams }),
    [baseParams, baseTextParams],
  )

  // drain 的 while 循环要读最新状态(异步长循环闭包会 stale),经 ref 规避:
  // 基线/格式/字体在 drain 启动时定格快照,循环内只刷新行状态
  const jobInputsRef = useRef({ activeStyle, base: batchBase, format, fontParams })
  useEffect(() => {
    jobInputsRef.current = { activeStyle, base: batchBase, format, fontParams }
  }, [activeStyle, batchBase, format, fontParams])

  // 队列调度(v1 BatchPanel 上移,images 是行状态唯一所有者):
  // - batchRunningRef:串行守卫,run 会重置共享 cancelled 标志,并发 drain 互相取消
  // - batchAliveRef:终止闸,确认关闭/会话关闭后拦住 drain 复查与迟到的 done URL
  // - batchImagesRef:循环内读最新行状态(setImages 异步提交)
  const batchRunningRef = useRef(false)
  const batchAliveRef = useRef(true)
  const batchImagesRef = useRef(images)
  useEffect(() => { batchImagesRef.current = images }, [images])

  // 离屏渲染任务:仅字体参与任务闭包(行级状态走 RenderTask),字体变化时重建
  const renderTaskRef = useRef<RenderTaskFn | null>(null)
  useEffect(() => {
    renderTaskRef.current = createCanvasRenderTask({ ...RENDER_TASK_BASE_SHELL, fontParams })
  }, [fontParams])
  const runnerRef = useRef(createBatchRunner((t) => {
    const task = renderTaskRef.current
    return task ? task(t) : Promise.reject(new Error('render task not ready'))
  }))

  // done 时建 objectUrl —— objectUrl 生命周期统一在此管理。迟到的 done 更新两种
  // 来源都要拦:行已被移除(map 对未知 id 是 no-op),或批量已终止(alive=false 后
  // 不再产出无人 revoke 的 URL)—— 两种情况 objectUrl 建出来都会泄漏
  const updateRow = useCallback((id: string, patch: Partial<BatchImage>) => {
    if (patch.status === 'done' && patch.blob) {
      if (!batchAliveRef.current || !batchImagesRef.current.some((r) => r.id === id)) return
      patch.objectUrl = URL.createObjectURL(patch.blob)
    }
    setImages((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  const drain = useCallback(async () => {
    // 串行守卫:所有触发路径(开始处理/重试/重骰)都必须先过这道闸再进 while
    if (batchRunningRef.current) return
    batchRunningRef.current = true
    // 复活终止闸:能走到这里的一律是合法的队列触发(开始/重试/重骰)。若上次
    // 终止后直接点重试,不复活会让循环首轮即 break,行永远停在 pending
    batchAliveRef.current = true
    try {
      // 重试/重骰在同一点击里"先 patch 再 drain",ref 要等 effect 提交后才更新;
      // 不让出一帧,首轮就会读到旧快照误判"无待处理"而提前退出(行卡在 pending)
      await yieldFrame()
      // 快照即隔离边界:种子/基线/格式在 drain 启动时定格(ProcessingJob 的
      // tasks/baseline),处理中调参只影响下一次处理
      const { activeStyle: snapStyle, base, format: snapFormat, fontParams: snapFonts } = jobInputsRef.current
      const def = getStyle(snapStyle)
      if (!def) return
      // run 只吃 pending 行(重试/重骰都先 patch 回 pending);循环直到没有
      // pending(处理中新追加的行自动续跑)
      while (true) {
        const rows = batchImagesRef.current
        if (!batchAliveRef.current) break
        const queue = rows.filter((r) => r.status === 'pending')
        if (queue.length === 0) break
        const job: ProcessingJob = {
          // 行种子每轮组装时逐行现取(见 assembleProcessingTasks 的 why):drain
          // 期间被重骰/全部随机改写的行以新种子重跑,不再吃启动时的陈旧 Map;
          // base/def 仍是启动定格快照,未改写的行取值与快照确定性等价,快照外
          // 新追加行以定格基线编码,与 v1"追加行跟随冻结基线"同口径
          tasks: assembleProcessingTasks(queue, base, def),
          format: snapFormat,
          baseline: { params: { ...base.params }, textParams: { ...base.textParams }, fontParams: snapFonts },
        }
        await runnerRef.current.run(job, { onRowUpdate: updateRow })
        await yieldFrame()  // 等 React 提交 + ref 同步后再复查,避免整批重跑
      }
    } finally {
      batchRunningRef.current = false
    }
  }, [updateRow])

  // 终止队列并回收进行中行:面板确认关闭与会话关闭共用。cancel 单独拦不住 drain
  // 的 while 复查,alive=false 才关闸;processing 行回 pending(终止即丢弃,迟到
  // 的 done 被 updateRow 的 alive 守卫拦下),重开面板可再跑
  const stopBatch = useCallback(() => {
    runnerRef.current.cancel()
    batchAliveRef.current = false
    setImages((prev) => prev.map((r) => (r.status === 'processing' ? { ...r, status: 'pending', error: null } : r)))
  }, [])

  // 开始处理:独立模式先做懒同步(选中行工作副本编回行种子),再把全部行重置
  // pending 并清旧结果(revoke objectUrl)——全 done 行集(如"全部随机"后)由此
  // 也能重跑,不再是无 pending 可跑的死路;组队快照与调度统一在 drain 内
  // (batchAliveRef 的复活在 drain 内,重试/重骰路径同样受益)
  const startProcessing = useCallback(() => {
    if (!canRunBatch(images.length)) return
    const def = getStyle(activeStyle)
    const cur = images[selectedIndex]
    if (seedMode === 'perImage' && def && cur) {
      const synced = syncRowSeed(cur, def, { params, textParams })
      setImages((prev) => prev.map((r) => (r.id === synced.id ? synced : r)))
    }
    // 运行中不重置:进行中批次的快照已定格,重置只会让在跑的 drain 以旧快照
    // 重跑全部行;调参后想重跑,等本轮结束再点开始
    if (batchRunningRef.current) return
    images.forEach((r) => {
      if (r.objectUrl) URL.revokeObjectURL(r.objectUrl)
    })
    setImages((prev) => prev.map((r) => ({
      ...r, status: 'pending', blob: null, objectUrl: null, error: null, renderedSeed: null, renderedStyleId: null,
    })))
    void drain()
  }, [images, selectedIndex, seedMode, activeStyle, params, textParams, drain])

  // 面板关闭(确认后的确定性关闭):终止队列 + 收面板,不清图片与已完成结果
  const closeBatchPanel = useCallback(() => {
    stopBatch()
    setShowBatchPanel(false)
  }, [stopBatch])

  // 行种子限定当前风格:任何换风格路径(StyleSelector/种子/预设)都会让既有行
  // 种子失效(v2 不支持跨风格行),统一丢弃回"跟随基线"
  const clearRowSeeds = useCallback(() => {
    setImages((prev) => prev.map((r) => (r.seed === null ? r : { ...r, seed: null })))
  }, [])

  // ActionBar「批量处理」:有图即可开面板(1 张也开,底部栏 [+] 可继续追加)
  const handleBatchOpen = useCallback(() => {
    if (images.length === 0) return
    setShowBatchPanel(true)
  }, [images.length])

  // 模式切换:统一→独立无操作(双写已保证 base==工作副本,行 null 跟随,天然连续);
  // 独立→统一弹确认(丢弃各行独立设置)
  const handleSeedModeChange = useCallback((m: BatchSeedMode) => {
    if (m === seedMode) return
    if (m === 'perImage') {
      setSeedMode('perImage')
    } else {
      setConfirmUnifiedDialog(true)
    }
  }, [seedMode])

  // 独立→统一的确认回调:丢弃全部行种子 + base ← 当前工作副本(选中行状态
  // 成为整批基线),选中行工作副本原地保留
  const confirmUnifiedMode = useCallback(() => {
    setImages((prev) => prev.map((r) => (r.seed === null ? r : { ...r, seed: null })))
    setBaseParams(params)
    setBaseTextParams(textParams)
    setSeedMode('unified')
    setConfirmUnifiedDialog(false)
  }, [params, textParams])

  // 全部随机(面板回调):统一=randomizeParams 同步 base+工作副本;
  // 独立=每行以基线为底重骰,选中行同步载入工作副本(主画布/SeedBar 跟上)
  const handleRandomizeAll = useCallback(() => {
    const def = getStyle(activeStyle)
    if (!def || images.length === 0) return
    if (seedMode === 'unified') {
      const r = randomizeParams(def, params, textParams)
      setParams(r.params)
      setTextParams(r.textParams)
      setBaseParams(r.params)
      setBaseTextParams(r.textParams)
      return
    }
    const next = images.map((row) => randomizeRowSeed(row, def, batchBase))
    setImages(next)
    const cur = next[selectedIndex]
    if (cur) {
      const w = loadWorking(cur, batchBase, def)
      setParams(w.params)
      setTextParams(w.textParams)
    }
  }, [activeStyle, images, seedMode, params, textParams, batchBase, selectedIndex])

  // 重试:failed 行回 pending 再 drain(循环只认 pending,不 patch 永不再跑)
  const handleRetryRow = useCallback((id: string) => {
    setImages((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'pending', error: null } : r)))
    if (!batchRunningRef.current) void drain()
  }, [drain])

  // 重骰单行(画廊"换效果重跑"):以基线为底随机 → 行独立化 + 回 pending;
  // 旧 objectUrl 先 revoke 再置 null。该行是选中行时同步载入工作副本
  const handleRerollRow = useCallback((id: string) => {
    const def = getStyle(activeStyle)
    const row = images.find((r) => r.id === id)
    if (!def || !row) return
    if (row.objectUrl) URL.revokeObjectURL(row.objectUrl)
    const next = { ...randomizeRowSeed(row, def, batchBase), status: 'pending' as const, blob: null, objectUrl: null, error: null }
    setImages((prev) => prev.map((r) => (r.id === id ? next : r)))
    if (seedMode === 'perImage' && images[selectedIndex]?.id === id) {
      const w = loadWorking(next, batchBase, def)
      setParams(w.params)
      setTextParams(w.textParams)
    }
    if (!batchRunningRef.current) void drain()
  }, [activeStyle, images, batchBase, seedMode, selectedIndex, drain])

  // 单张下载:与 ZIP 内条目同命名({styleId}_{原名}_{种子}.{ext})。种子/风格读
  // done 快照:换基线或重骰后,旧结果仍按生成时刻的值标注
  const handleDownloadRow = useCallback((img: BatchImage) => {
    if (!img.blob) return
    const def = getStyle(activeStyle)
    const seed = img.renderedSeed ?? (def ? rowEffectiveSeed(img, batchBase, def) : '')
    saveBlob(img.blob, zipEntryName(img.renderedStyleId ?? activeStyle, img.fileName, seed, blobExt(img.blob)))
  }, [activeStyle, batchBase])

  // 打包下载:done 行集齐后 fflate 打包;同图同种子跑两次会撞名,逐条 dedupe
  const handleDownloadZip = useCallback(async () => {
    const done = images.filter((r) => r.status === 'done' && r.blob)
    if (done.length === 0) return
    const def = getStyle(activeStyle)
    const taken = new Set<string>()
    const entries = done.map((r) => {
      const seed = r.renderedSeed ?? (def ? rowEffectiveSeed(r, batchBase, def) : '')
      const name = dedupeName(zipEntryName(r.renderedStyleId ?? activeStyle, r.fileName, seed, blobExt(r.blob!)), taken)
      taken.add(name)
      return { name, blob: r.blob! }
    })
    saveBlob(await buildBatchZip(entries), 'pixel-forge-batch.zip')
  }, [images, activeStyle, batchBase])

  // runningRef 变化不触发重绘,用行状态兜底:跑首行前的空窗期也能禁用格式切换
  // 等操作(v1 同策;drain 收尾后若无后续渲染,禁用态多停留一帧,可接受)
  const isBatchRunning = images.some((r) => r.status === 'processing') || batchRunningRef.current

  // ---------------------------------------------------------------------------
  // Render pipeline
  // ---------------------------------------------------------------------------

  // 渲染薄壳:只做组件层守卫(画布挂载/图片/ASCII 挂载检查),渲染语义全部
  // 委托 lib/renderImage,供批量队列(Task 4)复用同一份逻辑
  const renderWithStyle = useCallback(
    async (styleId: StyleId, currentParams: Record<string, number>, currentTextParams: Record<string, string>, currentFontParams: Record<string, FontFace | null>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const styleDef = getStyle(styleId)
      if (!styleDef) return
      // ASCII 挂载守卫留在组件层:lib 收到 canvas 即渲染,组件负责确认它真的挂着
      // (canvasRef 被 ShaderRenderer 锁定 WebGL,ASCII 只能画到独立的 asciiCanvas)
      if (styleDef.renderMode === 'canvas2d') {
        if (!image) {
          console.warn('[ASCII] renderWithStyle skipped: no image')
          return
        }
        if (!asciiCanvasRef.current) {
          console.warn('[ASCII] renderWithStyle skipped: asciiCanvas not mounted')
          return
        }
      }
      if (!asciiRendererRef.current) asciiRendererRef.current = new AsciiCanvasRenderer()
      await renderImage({
        canvas,
        asciiCanvas: asciiCanvasRef.current ?? document.createElement('canvas'),
        renderer: rendererRef.current,
        asciiRenderer: asciiRendererRef.current,
        image,
        styleDef,
        params: currentParams,
        textParams: currentTextParams,
        fontParams: currentFontParams,
        brightest,
      })
    },
    [image, brightest],
  )

  // ---------------------------------------------------------------------------
  // Multi-image session handlers(v2 地基;≤1 张时语义与 v1 单图一致)
  // ---------------------------------------------------------------------------

  // 尺寸/体积信息改为派生值:天然跟随选中行,切行/换图自动刷新,不再随 load 手动同步
  const imageInfo = useMemo(() => {
    if (!image) return null
    const w = image.naturalWidth || image.width
    const h = image.naturalHeight || image.height
    return { width: w, height: h, size: formatFileSize(Math.round(w * h * 4 / 1024) * 1024) }
  }, [image])

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

  // ImageStrip [+] 追加:20 上限双重守卫——入口 slice 截断 + updater 内复查
  // (异步解码落定时会话可能已被关闭或填满)
  const handleAddFiles = useCallback((files: FileList | File[]) => {
    void readImageFiles(files).then((loaded) => {
      if (loaded.length === 0) return
      setImages((prev) => {
        const room = BATCH_MAX_ROWS - prev.length
        if (room <= 0) return prev
        return [...prev, ...loaded.slice(0, room).map((l) => makeRow(l.image, l.name))]
      })
    })
  }, [])

  // 切换选中行:统一模式参数全行共享,只改 selectedIndex,渲染 effect 依赖派生
  // image 自然重绘;独立模式走懒同步——旧行工作副本编回行种子,新行种子解析载入
  // (行 seed null → 工作副本=基线拷贝,不污染共享 base 对象)
  const handleSelect = useCallback((i: number) => {
    if (seedMode === 'perImage' && i !== selectedIndex) {
      const def = getStyle(activeStyle)
      const oldRow = images[selectedIndex]
      const newRow = images[i]
      if (def && oldRow && newRow) {
        const synced = syncRowSeed(oldRow, def, { params, textParams })
        setImages((prev) => prev.map((r) => (r.id === synced.id ? synced : r)))
        const w = loadWorking(newRow, batchBase, def)
        setParams(w.params)
        setTextParams(w.textParams)
      }
    }
    setSelectedIndex(i)
  }, [seedMode, selectedIndex, activeStyle, images, params, textParams, batchBase])

  // 清空会话回上传页:画布随 CompareSlider 卸载,renderer 绑定的 WebGL 上下文
  // 必须销毁,否则再上传时 loadImage 仍画向已脱离 DOM 的旧 canvas。
  // 批量队列一并终止(删到 0 张也走此清场,面板收起避免空画廊残留)
  const resetSession = useCallback(() => {
    stopBatch()
    setImages([])
    setSelectedIndex(0)
    setCompareMode(false)
    setShowBatchPanel(false)
    if (rendererRef.current) {
      rendererRef.current.destroy()
      rendererRef.current = null
    }
  }, [stopBatch])

  // 移除单行:revoke 该行结果 URL;删选中行 → 选中指向前一行(或 0),
  // 删选中行之前的行 → 索引左移一位保持指向原行;剩 1 张自然退化单图;
  // 删到 0 张走会话清空(销毁 renderer)
  const handleRemove = useCallback(
    (i: number) => {
      const row = images[i]
      if (!row) return
      if (row.objectUrl) URL.revokeObjectURL(row.objectUrl)
      const next = images.filter((_, idx) => idx !== i)
      if (next.length === 0) {
        resetSession()
        return
      }
      // 独立模式:删的是选中行时,选中会改指另一行(前一行/0),工作副本必须随之
      // 换装——否则 SeedBar/主画布仍显示已删行的参数,下一次开始处理还会拿陈旧
      // 工作副本 syncRowSeed 无声覆写新选中行的种子(用户没做任何编辑却丢数据)。
      // 删非选中行仅平移索引、指向行不变,无需重载;统一模式 base==工作副本同样无虞
      if (seedMode === 'perImage' && i === selectedIndex) {
        const def = getStyle(activeStyle)
        const newRow = next[Math.max(0, selectedIndex - 1)]
        if (def && newRow) {
          const w = loadWorking(newRow, batchBase, def)
          setParams(w.params)
          setTextParams(w.textParams)
        }
      }
      setImages(next)
      setSelectedIndex((s) => (i <= s ? Math.max(0, s - 1) : s))
    },
    [images, resetSession, seedMode, selectedIndex, activeStyle, batchBase],
  )

  // ---------------------------------------------------------------------------
  // Effect: re-fit canvas on window resize (debounced)
  // ---------------------------------------------------------------------------
  // loadImage 只在图片加载时按容器 fit 一次；窗口尺寸变化后不重排会导致画布
  // 溢出容器或留白。防抖后 bump epoch：触发下方 loadImage 重新适配，并让渲染
  // effect 重绘（重设画布尺寸会清屏，必须随后重绘）。ASCII 画布尺寸与容器
  // 无关，此重绘仅重掷字符随机抖动，可接受。

  const [relayoutEpoch, setRelayoutEpoch] = useState(0)
  useEffect(() => {
    if (!image) return
    let timer: number | undefined
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setRelayoutEpoch((e) => e + 1), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(timer)
    }
  }, [image])

  // ---------------------------------------------------------------------------
  // Effect: create renderer & load image when canvas becomes available
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!image) return
    const canvas = canvasRef.current
    if (!canvas) return

    if (!rendererRef.current) {
      rendererRef.current = new ShaderRenderer(canvas)
    }

    rendererRef.current.loadImage(image)
  }, [image, relayoutEpoch])

  // ---------------------------------------------------------------------------
  // Effect: detect brightest point (auto light source for volumetric god rays)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!image) {
      // 图片关闭/切换时清空,保证 brightest 始终属于当前 image
      setBrightest(null)
      return
    }
    const THUMB = 32
    try {
      // 缩略图保持纵横比：方形拉伸会把亮点坐标沿长轴方向挤压偏移
      const nw = image.naturalWidth || image.width
      const nh = image.naturalHeight || image.height
      const s = Math.min(1, THUMB / Math.max(nw, nh))
      const tw = Math.max(1, Math.round(nw * s))
      const th = Math.max(1, Math.round(nh * s))
      const c = document.createElement('canvas')
      c.width = tw
      c.height = th
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(image, 0, 0, tw, th)
      setBrightest(findBrightestPoint(ctx.getImageData(0, 0, tw, th).data, tw, th))
    } catch {
      // 跨域图片等导致 getImageData 失败:回落默认光源位置
      console.warn('[animelight] brightest point detection failed, using default light source')
      setBrightest(null)
    }
  }, [image])

  // ---------------------------------------------------------------------------
  // Style change handler
  // ---------------------------------------------------------------------------

  const handleStyleChange = useCallback(
    (id: StyleId) => {
      // 同风格再点早退:StyleSelector 对 active 项点击仍回调,放行会用当前工作
      // 副本(独立模式下可能与 base 有别)静默覆写 base,平白溅射其他行的回退目标
      if (id === activeStyle) return
      // 无条件快照当前风格状态：默认/随机/手动调整的最后状态一视同仁
      // （含字体——切回 ascii 时已上传字体不丢）
      styleMemoryRef.current[activeStyle] = { params, textParams, fontParams }
      // 目标风格：有记忆用记忆（用户最后一次离开时的样子），无记忆用默认值
      const memo = styleMemoryRef.current[id]
      const nextParams = memo?.params ?? defaultParams(id)
      const nextTextParams = memo?.textParams ?? defaultTextParams(id)
      setParams(nextParams)
      setTextParams(nextTextParams)
      setFontParams(memo?.fontParams ?? {})
      setActiveStyle(id)
      // 换风格即重置:基线同步为新风格状态(统一/独立两模式同——独立模式行
      // seed=null 跟随基线,不同步会拿旧风格参数喂新风格);行种子限定当前
      // 风格,既有行种子随之失效,统一丢弃回跟随基线
      setBaseParams(nextParams)
      setBaseTextParams(nextTextParams)
      if (id !== activeStyle) clearRowSeeds()
    },
    [activeStyle, params, textParams, fontParams, clearRowSeeds],
  )

  // ---------------------------------------------------------------------------
  // Effect: re-render when activeStyle or params change (image must be loaded)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!image) return
    const styleDef = getStyle(activeStyle)
    // ASCII uses a lazy AsciiCanvasRenderer; shader styles need rendererRef.
    if (styleDef?.renderMode !== 'canvas2d' && !rendererRef.current) return
    renderWithStyle(activeStyle, params, textParams, fontParams)
  }, [image, activeStyle, params, textParams, fontParams, renderWithStyle, relayoutEpoch])

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // runner 终生不变,拷局部供 cleanup 使用(refs 规约,与 v1 BatchPanel 同款)
    const runner = runnerRef.current
    return () => {
      // 组件卸载(路由离开)时终止批量队列,避免离屏渲染的"僵尸任务"
      batchAliveRef.current = false
      runner.cancel()
      if (rendererRef.current) {
        rendererRef.current.destroy()
        rendererRef.current = null
      }
      asciiRendererRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Param handlers
  // ---------------------------------------------------------------------------

  // 统一模式双写:工作副本即整批活基线,base 与 params 用同一个纯 updater 推导
  // (StrictMode 双调 updater 结果幂等);独立模式编辑默认只写工作副本,但类型
  // 感知双写例外——toggle/select 不参与种子编码,批量渲染只能从整批基线取值
  // (runBatch.resolveRowRenderState 基线打底),不双写 base 就是"预览变了、批量
  // 出图还是旧值"的 WYSIWYG 失守,故按任务级共享语义同步 base(spec"整批共享
  // 一份");数值参数由种子携带,仍只写工作副本(懒同步点编回行种子)
  const handleParamChange = useCallback((uniform: string, value: number) => {
    const apply = (prev: Record<string, number>) => {
      const next = { ...prev, [uniform]: value }
      // 拖动光源位置 = 用户接管,自动检测让位。判断用 === 1 而非 !== 0:
      // 其他风格(如 kaleidoscope)拖自己的 uCenterX/Y 时不写入无关的 uGodRayAuto 键
      if ((uniform === 'uCenterX' || uniform === 'uCenterY') && next['uGodRayAuto'] === 1) {
        next['uGodRayAuto'] = 0
      }
      return next
    }
    setParams(apply)
    if (seedMode === 'unified' || isTaskSharedEdit(getStyle(activeStyle), uniform, 'number')) setBaseParams(apply)
  }, [seedMode, activeStyle])

  // 同款类型感知双写:text 类(如 ascii 字符集)不参与种子编码须共享基线;
  // color 由种子携带,只写工作副本
  const handleTextChange = useCallback((uniform: string, value: string) => {
    const apply = (prev: Record<string, string>) => ({ ...prev, [uniform]: value })
    setTextParams(apply)
    if (seedMode === 'unified' || isTaskSharedEdit(getStyle(activeStyle), uniform, 'text')) setBaseTextParams(apply)
  }, [seedMode, activeStyle])

  const handleFontChange = useCallback((uniform: string, font: FontFace | null) => {
    setFontParams((prev) => ({ ...prev, [uniform]: font }))
  }, [])

  const handleReset = useCallback(() => {
    const nextParams = defaultParams(activeStyle)
    // color 参数走 textParams 数据流，重置时一并恢复默认色；
    // text 类型（如 ascii 字符集）保持既有豁免不被重置
    const colorDefaults: Record<string, string> = {}
    for (const p of getStyle(activeStyle)?.params ?? []) {
      if (p.type === 'color') colorDefaults[p.uniform] = p.default
    }
    const applyText = (prev: Record<string, string>) => ({ ...prev, ...colorDefaults })
    setParams(nextParams)
    setTextParams(applyText)
    if (seedMode === 'unified') {
      setBaseParams(nextParams)
      setBaseTextParams(applyText)
    }
  }, [activeStyle, seedMode])

  const handleRandom = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    if (!styleDef) return
    const r = randomizeParams(styleDef, params, textParams)
    setParams(r.params)
    setTextParams(r.textParams)
    // 独立模式骰子 = randomizeParams 写工作副本(切换选中行/开始处理时再同步回行)
    if (seedMode === 'unified') {
      setBaseParams(r.params)
      setBaseTextParams(r.textParams)
    }
  }, [activeStyle, params, textParams, seedMode])

  const downloadBlob = useCallback((blob: Blob | null, ext: string) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeStyle}_${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }, [activeStyle])

  // Pick the canvas the active style actually renders to:
  // shader styles -> canvasRef (WebGL), ASCII -> asciiCanvasRef (2D).
  const getExportCanvas = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    return styleDef?.renderMode === 'canvas2d' ? asciiCanvasRef.current : canvasRef.current
  }, [activeStyle])

  const handleDownloadPng = useCallback(async () => {
    const src = getExportCanvas()
    if (!src) return
    const b = await exportCanvasBlob(src, 'image/png')
    downloadBlob(b, 'png')
  }, [getExportCanvas, downloadBlob])

  const handleDownloadJpg = useCallback(async () => {
    // JPG has no alpha: composite onto black if background is off.
    const styleDef = getStyle(activeStyle)
    const showBg = params['uShowBg'] ?? 1
    if (styleDef?.renderMode === 'canvas2d' && showBg !== 1) {
      const src = getExportCanvas()
      if (!src) return
      const b = await exportJpgWithBlackBg(src)
      downloadBlob(b, 'jpg')
      return
    }
    const src = getExportCanvas()
    if (!src) return
    const b = await exportCanvasBlob(src, 'image/jpeg')
    downloadBlob(b, 'jpg')
  }, [activeStyle, params, getExportCanvas, downloadBlob])

  const handleDownloadSvg = useCallback(() => {
    const family = fontParams['uFont']?.family ?? 'monospace'
    const svg = asciiRendererRef.current?.exportSvg(family)
    if (!svg) return
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'svg')
  }, [fontParams, downloadBlob])

  // 测试图点击:ImageStrip 只透传 src,由 App2D 按模式分派——
  // 单图(含上传页)= v1 行为加载为唯一图;批量 = 追加为新行(受 20 上限)
  const handleTestImageClick = useCallback(
    (src: string) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (isBatch) {
          setImages((prev) =>
            prev.length >= BATCH_MAX_ROWS ? prev : [...prev, makeRow(img, testImageName(src))],
          )
        } else {
          // 替换唯一图前防御性回收旧结果的 objectUrl:单图也能开批量面板跑出 done
          // 结果,直接丢弃行引用会让该 URL 无人 revoke 而泄漏(批量分支是追加、
          // 不替换既有行,无需处理)。走 ref 读最新行,避免异步 onload 闭包 stale
          batchImagesRef.current.forEach((r) => {
            if (r.objectUrl) URL.revokeObjectURL(r.objectUrl)
          })
          setImages([makeRow(img, testImageName(src))])
          setSelectedIndex(0)
        }
      }
      img.src = src
    },
    [isBatch],
  )

  const testImages = [
    { src: '/local_test_pic/cake.jpg', label: 'cake' },
    { src: '/local_test_pic/car.jpg', label: 'car' },
    { src: '/local_test_pic/car2.jpg', label: 'car2' },
  ]

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const currentStyle = getStyle(activeStyle)

  // 行种子展示视图(v3):displaySeed 统一计算,底部栏种子条与批量浮窗行列表
  // 共用同一份(TASK 共享消费),两处显示永不漂移。full=null ⇔ 「跟随」短标
  const rowsSeedView: RowSeedView[] = useMemo(() => images.map((row) => {
    if (!currentStyle) return { id: row.id, full: null, short: null }
    const full = displaySeed(row, seedMode, batchBase, currentStyle)
    return { id: row.id, full, short: full === null ? null : truncateSeed(full) }
  }), [images, seedMode, batchBase, currentStyle])

  const activeBuiltInPresetId = useMemo(
    () => currentStyle ? findMatchingBuiltInPreset(currentStyle, params, textParams) : null,
    [currentStyle, params, textParams],
  )

  // 自动模式下 X/Y 滑块显示检测值(仅显示层,state 不动,避免渲染 effect 循环)
  const panelValues = useMemo(() => {
    if (activeStyle !== 'animelight' || params['uGodRayAuto'] !== 1 || !brightest) return params
    return { ...params, uCenterX: brightest.x, uCenterY: brightest.y }
  }, [activeStyle, params, brightest])

  const seed = useMemo(
    () => currentStyle ? encodeSeed(activeStyle, params, currentStyle, textParams) : '',
    [activeStyle, params, textParams, currentStyle],
  )

  const handleApplySeed = useCallback((code: string): boolean => {
    if (!image) return false
    // 批量(任何种子模式):行种子限定当前风格,异风格种子拒绝(批量行不随种子
    // 切风格,activeStyle 全局唯一;统一模式 base 同样不该被异风格种子切走。
    // SeedBar 自带 invalid 提示)。单图保持 v1 语义可跨风格
    if (isBatch && !seedMatchesStyle(code, activeStyle)) return false
    const decoded = decodeSeed(code)
    if (!decoded) return false
    const def = getStyle(decoded.styleId)
    if (!def) return false
    // decodeSeed 产出 numeric + color 参数(toggle/select 仍不参与编码),以风格默认值
    // 为底合并补齐;colorParams 覆盖默认色,text 类型(charset 等)仍回默认
    const merged = mergeWithDefaults(def, decoded.params, {
      ...defaultTextParams(decoded.styleId),
      ...decoded.colorParams,
    })
    setActiveStyle(decoded.styleId)
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
    styleMemoryRef.current[decoded.styleId] = merged
    // 统一模式 apply 改全部(双写基线);独立模式 apply 属编辑,只写工作副本,
    // 懒同步点(切行/开始处理)再编回行种子
    if (seedMode === 'unified') {
      setBaseParams(merged.params)
      setBaseTextParams(merged.textParams)
    }
    if (decoded.styleId !== activeStyle) clearRowSeeds()
    return true
  }, [image, isBatch, seedMode, activeStyle, clearRowSeeds])

  const handleApplyBuiltInPreset = useCallback((preset: BuiltInPresetDefinition) => {
    const def = getStyle(activeStyle)
    if (!def || !def.presets?.some((candidate) => candidate.id === preset.id)) return
    const merged = resolveBuiltInPreset(def, preset)
    styleMemoryRef.current[activeStyle] = merged
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
    // 预设应用 = 整批快照语义:基线同步(内置预设限定当前风格,行种子不受影响)
    setBaseParams(merged.params)
    setBaseTextParams(merged.textParams)
  }, [activeStyle])

  // ---------------------------------------------------------------------------
  // Preset handlers（localStorage 持久化预设）
  // ---------------------------------------------------------------------------

  const handleSavePreset = useCallback((name: string): boolean => {
    const entry = savePreset({ name, styleId: activeStyle, params, textParams })
    if (!entry) return false
    setPresets(loadPresets())
    return true
  }, [activeStyle, params, textParams])

  // 应用预设：以风格默认值为底合并（容忍风格定义后续增删参数的旧预设），
  // 并写入会话级风格记忆，避免切走再切回时丢掉预设状态。
  // 预设应用 = 整批快照语义:基线同步;预设可携带其他风格,行种子随之失效丢弃
  const handleApplyPreset = useCallback((entry: PresetEntry) => {
    const def = getStyle(entry.styleId)
    if (!def) return
    const merged = mergeWithDefaults(def, entry.params, entry.textParams)
    styleMemoryRef.current[entry.styleId] = merged
    setActiveStyle(entry.styleId)
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
    setBaseParams(merged.params)
    setBaseTextParams(merged.textParams)
    if (entry.styleId !== activeStyle) clearRowSeeds()
  }, [activeStyle, clearRowSeeds])

  const handleDeletePreset = useCallback((id: string) => {
    removePreset(id)
    setPresets(loadPresets())
  }, [])

  // 默认预设名：当前风格名 + 保存时刻（HH:mm）。
  // 返回函数在点击保存时才取当前时间，避免 useMemo 缓存把时间冻结在风格激活时刻
  const presetDefaultName = useCallback(() => {
    if (!currentStyle) return ''
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${t(currentStyle.label)} ${p(d.getHours())}:${p(d.getMinutes())}`
  }, [currentStyle, t])

  // ---------------------------------------------------------------------------
  // 主画布 × 的确认回调
  // ---------------------------------------------------------------------------

  // 单图=退出编辑(v1 语义);批量=关闭批量会话:revoke 全部行结果 URL + 终止队列
  // + 清空会话(resetSession 内含 stopBatch 与面板收起,v1 batchJob 双模型已退役)
  const handleClose = useCallback(() => {
    // 走 ref 读最新行(handleTestImageClick 同款模式):确认对话开着时行可能刚
    // 完成并建了 objectUrl,闭包里的 images 不含它,resetSession 清行后该 URL
    // 无人 revoke 而泄漏
    batchImagesRef.current.forEach((row) => {
      if (row.objectUrl) URL.revokeObjectURL(row.objectUrl)
    })
    resetSession()
    setCloseDialog(null)
  }, [resetSession])

  return (
    <div className="app-container">
      <div className="left-sidebar">
        <Link to="/" className="sidebar-home-btn">← {t('common.backToHome')}</Link>
        <StyleSelector styles={styles} activeId={activeStyle} onSelect={handleStyleChange} />
      </div>
      <div className="center-area">
        {image ? (
          <CompareSlider
            canvasRef={canvasRef}
            asciiCanvasRef={asciiCanvasRef}
            renderMode={currentStyle?.renderMode}
            originalImage={image}
            compareMode={compareMode}
            onToggleCompare={() => setCompareMode((prev) => !prev)}
            onClose={() => setCloseDialog(isBatch ? 'batch' : 'single')}
          />
        ) : (
          <ImageUploader onImagesLoad={handleImagesLoad} />
        )}
        {/* 底部多图栏(v2 替代 test-images-bar):0 张时仅测试图,1 张单图态,≥2 张批量态 */}
        <ImageStrip
          images={images}
          seedViews={rowsSeedView}
          selectedIndex={selectedIndex}
          mode={isBatch ? 'batch' : 'single'}
          atLimit={images.length >= BATCH_MAX_ROWS}
          onSelect={handleSelect}
          onRemove={handleRemove}
          onAddFiles={handleAddFiles}
          testImages={testImages}
          onTestImage={handleTestImageClick}
        />
      </div>
      <ActionBar
        onDownloadPng={handleDownloadPng}
        onDownloadJpg={handleDownloadJpg}
        onDownloadSvg={handleDownloadSvg}
        renderMode={currentStyle?.renderMode}
        onReset={handleReset}
        onRandom={handleRandom}
        onBatchApply={handleBatchOpen}
        imageInfo={imageInfo}
      />
      {image && currentStyle && (
        <ParamPanel
          title={t(currentStyle.label)}
          defaultPos={{ x: 282, y: 110 }}
          storageKey="pixel-forge.panelPos.2d.v1"
          description={t(currentStyle.description)}
          params={currentStyle.params.map(p => {
            if (p.type === 'select') {
              return {
                ...p,
                name: t(p.name),
                description: p.description ? t(p.description) : undefined,
                options: p.options.map(o => ({ ...o, label: t(o.label) })),
              }
            }
            return { ...p, name: t(p.name), description: p.description ? t(p.description) : undefined }
          })}
          values={panelValues}
          textValues={textParams}
          onChange={handleParamChange}
          onTextChange={handleTextChange}
          fontValues={fontParams}
          onFontChange={handleFontChange}
          onRandom={handleRandom}
          top={
            <>
              <SeedBar seed={seed} onApply={handleApplySeed} presets={presets} onApplyPreset={handleApplyPreset} />
              <BuiltInPresetBar
                presets={currentStyle.presets ?? []}
                activeId={activeBuiltInPresetId}
                onApply={handleApplyBuiltInPreset}
              />
              <PresetBar
                defaultName={presetDefaultName}
                onSave={handleSavePreset}
                onToggleList={() => setShowPresetPanel((v) => !v)}
                listOpen={showPresetPanel}
                count={presets.length}
              />
            </>
          }
        />
      )}
      {image && currentStyle && showPresetPanel && (
        <PresetPanel
          presets={presets}
          onApply={handleApplyPreset}
          onDelete={handleDeletePreset}
          onClose={() => setShowPresetPanel(false)}
        />
      )}
      {/* 批量面板:纯 props 视图,行状态/队列都在本组件;关闭只收面板不清图片 */}
      {showBatchPanel && images.length > 0 && (
        <BatchPanel
          images={images}
          selectedIndex={selectedIndex}
          seedViews={rowsSeedView}
          onRowSelect={handleSelect}
          presets={presets}
          onApplyPreset={handleApplyPreset}
          seedMode={seedMode}
          format={format}
          activeStyleId={activeStyle}
          isRunning={isBatchRunning}
          onSeedModeChange={handleSeedModeChange}
          onFormatChange={setFormat}
          onRandomizeAll={handleRandomizeAll}
          onStart={startProcessing}
          onRetryRow={handleRetryRow}
          onRerollRow={handleRerollRow}
          onDownloadRow={handleDownloadRow}
          onDownloadZip={handleDownloadZip}
          onClose={closeBatchPanel}
        />
      )}
      {/* 独立→统一切换确认:丢弃各行独立种子,以选中行状态为整批基线 */}
      {confirmUnifiedDialog && (
        <ConfirmDialog
          message={t('batch.confirmUnified')}
          confirmLabel={t('batch.confirmUnifiedBtn')}
          onConfirm={confirmUnifiedMode}
          onCancel={() => setConfirmUnifiedDialog(false)}
        />
      )}
      {/* 主画布 ×:单图=v1 退出确认(确认钮回落 confirmExitBtn);批量=会话关闭确认 */}
      {closeDialog && (
        <ConfirmDialog
          message={closeDialog === 'batch' ? t('batch.confirmCloseSession') : t('app2d.confirmExit')}
          confirmLabel={closeDialog === 'batch' ? t('batch.confirmCloseSessionBtn') : undefined}
          onConfirm={handleClose}
          onCancel={() => setCloseDialog(null)}
        />
      )}
    </div>
  )
}

export default App2D
