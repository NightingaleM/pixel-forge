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
import type { BatchImage } from '../lib/batch/imageList'
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
import BatchPanel from './BatchPanel'
import { BATCH_MAX_ROWS, type BatchJob, type BatchBaseline } from '../lib/batch/batchJob'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 新建批量图片行(v2 状态从 BatchJob 上移 App2D,上传即建行):
// seed=null 跟随整批基线;blob/objectUrl 等处理字段留空(T2 尚无处理能力,T3/T4 写入)
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
  // 1 张走数组但单图行为不变;≥2 张即批量模式,选中第 0 行
  const handleImagesLoad = useCallback((imgs: HTMLImageElement[], names: string[]) => {
    if (imgs.length === 0) return
    setImages(imgs.map((img, i) => makeRow(img, names[i] ?? '')))
    setSelectedIndex(0)
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

  // 切换选中行(T2 统一模式语义):参数全行共享,只改 selectedIndex,
  // 渲染 effect 依赖派生 image 自然重绘;独立模式的懒同步回写在 T3
  const handleSelect = useCallback((i: number) => {
    setSelectedIndex(i)
  }, [])

  // 清空会话回上传页:画布随 CompareSlider 卸载,renderer 绑定的 WebGL 上下文
  // 必须销毁,否则再上传时 loadImage 仍画向已脱离 DOM 的旧 canvas
  const resetSession = useCallback(() => {
    setImages([])
    setSelectedIndex(0)
    setCompareMode(false)
    if (rendererRef.current) {
      rendererRef.current.destroy()
      rendererRef.current = null
    }
  }, [])

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
      setImages(next)
      setSelectedIndex((s) => (i <= s ? Math.max(0, s - 1) : s))
    },
    [images, resetSession],
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
      // 无条件快照当前风格状态：默认/随机/手动调整的最后状态一视同仁
      // （含字体——切回 ascii 时已上传字体不丢）
      styleMemoryRef.current[activeStyle] = { params, textParams, fontParams }
      // 目标风格：有记忆用记忆（用户最后一次离开时的样子），无记忆用默认值
      const memo = styleMemoryRef.current[id]
      setParams(memo?.params ?? defaultParams(id))
      setTextParams(memo?.textParams ?? defaultTextParams(id))
      setFontParams(memo?.fontParams ?? {})
      setActiveStyle(id)
    },
    [activeStyle, params, textParams, fontParams],
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
    return () => {
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

  const handleParamChange = useCallback((uniform: string, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [uniform]: value }
      // 拖动光源位置 = 用户接管,自动检测让位。判断用 === 1 而非 !== 0:
      // 其他风格(如 kaleidoscope)拖自己的 uCenterX/Y 时不写入无关的 uGodRayAuto 键
      if ((uniform === 'uCenterX' || uniform === 'uCenterY') && next['uGodRayAuto'] === 1) {
        next['uGodRayAuto'] = 0
      }
      return next
    })
  }, [])

  const handleTextChange = useCallback((uniform: string, value: string) => {
    setTextParams((prev) => ({ ...prev, [uniform]: value }))
  }, [])

  const handleFontChange = useCallback((uniform: string, font: FontFace | null) => {
    setFontParams((prev) => ({ ...prev, [uniform]: font }))
  }, [])

  const handleReset = useCallback(() => {
    setParams(defaultParams(activeStyle))
    // color 参数走 textParams 数据流，重置时一并恢复默认色；
    // text 类型（如 ascii 字符集）保持既有豁免不被重置
    const colorDefaults: Record<string, string> = {}
    for (const p of getStyle(activeStyle)?.params ?? []) {
      if (p.type === 'color') colorDefaults[p.uniform] = p.default
    }
    setTextParams((prev) => ({ ...prev, ...colorDefaults }))
  }, [activeStyle])

  const handleRandom = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    if (!styleDef) return
    const r = randomizeParams(styleDef, params, textParams)
    setParams(r.params)
    setTextParams(r.textParams)
  }, [activeStyle, params, textParams])

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

  // 主画布 × 的确认回调:单图=退出编辑(v1 语义);批量=关闭批量会话。
  // 批量下 revoke 全部行的结果 URL 再清数据(T2 尚无处理能力,runner 终止在 T3 上移)
  const handleClose = useCallback(() => {
    images.forEach((row) => {
      if (row.objectUrl) URL.revokeObjectURL(row.objectUrl)
    })
    resetSession()
    setCloseDialog(null)
  }, [images, resetSession])

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
    return true
  }, [image])

  const handleApplyBuiltInPreset = useCallback((preset: BuiltInPresetDefinition) => {
    const def = getStyle(activeStyle)
    if (!def || !def.presets?.some((candidate) => candidate.id === preset.id)) return
    const merged = resolveBuiltInPreset(def, preset)
    styleMemoryRef.current[activeStyle] = merged
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
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
  // 并写入会话级风格记忆，避免切走再切回时丢掉预设状态
  const handleApplyPreset = useCallback((entry: PresetEntry) => {
    const def = getStyle(entry.styleId)
    if (!def) return
    const merged = mergeWithDefaults(def, entry.params, entry.textParams)
    styleMemoryRef.current[entry.styleId] = merged
    setActiveStyle(entry.styleId)
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
  }, [])

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
  // Batch（批量处理面板）
  // ---------------------------------------------------------------------------

  const [batchJob, setBatchJob] = useState<BatchJob | null>(null)
  const [showBatchReplaceDialog, setShowBatchReplaceDialog] = useState(false)

  // 快照当前完整状态（含 textParams/fontParams——种子不携带这些，批量基线必须补齐）
  const makeBaseline = useCallback((): BatchBaseline => ({
    styleId: activeStyle,
    params: { ...params },
    textParams: { ...textParams },
    fontParams: { ...fontParams },
  }), [activeStyle, params, textParams, fontParams])

  // 批量应用：无图不动作；面板已开走替换确认，未开则以当前图 + 当前状态建新任务。
  // 「已开」用闭包判断而非 setBatchJob updater 内副作用——StrictMode 会双调 updater，
  // updater 里 setShowBatchReplaceDialog 会把弹窗状态打两次
  const handleBatchApply = useCallback(() => {
    if (!image) return
    if (batchJob) {
      setShowBatchReplaceDialog(true)
      return
    }
    const baseline = makeBaseline()
    const seedCode = encodeSeed(activeStyle, params, currentStyle!, textParams)
    // v2 起上传回传文件名,批量占位行用选中行真名(测试图/异常回落占位名)
    setBatchJob({
      baseline,
      unifiedSeed: seedCode,
      seedMode: 'unified',
      format: 'png',
      rows: [{
        id: randomId(),
        fileName: images[selectedIndex]?.fileName ?? 'current.png',
        image,
        seedOverride: null,
        status: 'pending',
        blob: null,
        objectUrl: null,
        error: null,
        renderedSeed: null,
        renderedStyleId: null,
      }],
    })
  }, [image, images, selectedIndex, batchJob, activeStyle, params, textParams, currentStyle, makeBaseline])

  // 替换基线：面板保留（已生成结果不动），仅换基线与统一种子，重跑后生效
  const replaceBaseline = useCallback(() => {
    const baseline = makeBaseline()
    const seedCode = encodeSeed(activeStyle, params, currentStyle!, textParams)
    setBatchJob((j) => (j ? { ...j, baseline, unifiedSeed: seedCode } : j))
    setShowBatchReplaceDialog(false)
  }, [activeStyle, params, textParams, currentStyle, makeBaseline])

  // 关闭批量：终止 + revoke 全部结果 URL（App2D 是 job 生命周期唯一所有者）
  const closeBatch = useCallback(() => {
    setBatchJob((j) => {
      j?.rows.forEach((r) => {
        if (r.objectUrl) URL.revokeObjectURL(r.objectUrl)
      })
      return null
    })
  }, [])

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
        onBatchApply={handleBatchApply}
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
              <SeedBar seed={seed} onApply={handleApplySeed} />
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
      {batchJob && (
        <BatchPanel job={batchJob} setJob={setBatchJob} onClose={closeBatch} />
      )}
      {showBatchReplaceDialog && (
        <ConfirmDialog
          message={t('batch.replaceBaseline')}
          confirmLabel={t('batch.confirmReplace')}
          onConfirm={replaceBaseline}
          onCancel={() => setShowBatchReplaceDialog(false)}
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
