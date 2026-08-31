import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShaderRenderer } from '../lib/ShaderRenderer'
import { AsciiCanvasRenderer } from '../lib/AsciiCanvasRenderer'
import { styles, getStyle, defaultParams, defaultTextParams } from '../lib/StyleRegistry'
import { encodeSeed, decodeSeed } from '../lib/seedCodec'
import { findBrightestPoint } from '../lib/brightPoint'
import { loadPresets, savePreset, removePreset, mergeWithDefaults, type PresetEntry } from '../lib/presetStore'
import type { StyleId } from '../types'
import ImageUploader from './ImageUploader'
import StyleSelector from './StyleSelector'
import ParamPanel from './ParamPanel'
import PresetBar from './PresetBar'
import PresetPanel from './PresetPanel'
import { SeedBar } from './SeedBar'
import ActionBar from './ActionBar'
import { CompareSlider } from './CompareSlider'
import ConfirmDialog from './ConfirmDialog'

// 这些 uniform 随机会产生不可用结果（居中/旋转类），随机时保持不动
const SKIP_RANDOM_UNIFORMS = ['uCenterX', 'uCenterY', 'uRotation', 'uAngle']

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function App2D() {
  const { t } = useTranslation()
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [activeStyle, setActiveStyle] = useState<StyleId>('halftone')
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams('halftone'))
  const [textParams, setTextParams] = useState<Record<string, string>>(() => defaultTextParams('halftone'))
  const [compareMode, setCompareMode] = useState(false)
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number; size: string } | null>(null)
  // 体积光自动光源:图片最亮点的 UV 坐标(检测失败为 null)
  const [brightest, setBrightest] = useState<{ x: number; y: number } | null>(null)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  // 本地预设（localStorage 持久化，见 lib/presetStore）
  const [presets, setPresets] = useState<PresetEntry[]>(() => loadPresets())
  const [showPresetPanel, setShowPresetPanel] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ShaderRenderer | null>(null)
  const asciiCanvasRef = useRef<HTMLCanvasElement>(null)
  const asciiRendererRef = useRef<AsciiCanvasRenderer | null>(null)
  const [fontParams, setFontParams] = useState<Record<string, FontFace | null>>({})
  // 会话级风格记忆：每个风格最后一次离开时的参数状态（刷新即失，不持久化）
  const styleMemoryRef = useRef<Partial<Record<StyleId, {
    params: Record<string, number>
    textParams: Record<string, string>
  }>>>({})

  // ---------------------------------------------------------------------------
  // Render pipeline
  // ---------------------------------------------------------------------------

  const renderWithStyle = useCallback(
    async (styleId: StyleId, currentParams: Record<string, number>, currentTextParams: Record<string, string>, currentFontParams: Record<string, FontFace | null>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const renderer = rendererRef.current

      const styleDef = getStyle(styleId)
      if (!styleDef) return

      // ----- canvas2d branch (ASCII) — must return BEFORE the WebGL text-texture block -----
      // ASCII renders to a SEPARATE canvas (asciiCanvasRef). canvasRef is locked to a WebGL
      // context by ShaderRenderer, and a single canvas element cannot host both contexts.
      if (styleDef.renderMode === 'canvas2d') {
        const aCanvas = asciiCanvasRef.current
        if (!image) {
          console.warn('[ASCII] renderWithStyle skipped: no image')
          return
        }
        if (!aCanvas) {
          console.warn('[ASCII] renderWithStyle skipped: asciiCanvas not mounted')
          return
        }
        if (!asciiRendererRef.current) asciiRendererRef.current = new AsciiCanvasRenderer()
        const fp = currentFontParams['uFont'] ?? null
        asciiRendererRef.current.render(aCanvas, image, {
          charset: currentTextParams['uCharset'] ?? '',
          caseMode: currentParams['uCaseMode'] ?? 0,
          charColor: currentTextParams['uCharColor'] ?? '#00ff66',
          showBg: currentParams['uShowBg'] ?? 1,
          charScale: currentParams['uCharScale'] ?? 1.0,
          cellSize: currentParams['uCellSize'] ?? 14,
          randomScale: currentParams['uRandomScale'] ?? 0,
          bgFilter: currentParams['uBgFilter'] ?? 0.12,
        }, fp)
        return
      }
      // ----- end canvas2d branch -----

      // shader branch: ASCII already returned; renderer required here
      if (!renderer) return

      // Handle text params: generate text textures
      const textTextures: WebGLTexture[] = []
      const textParamDefs = styleDef.params.filter((p): p is typeof p & { type: 'text' } => p.type === 'text')
      let atlasCount = 0

      for (const tp of textParamDefs) {
        const text = currentTextParams[tp.uniform] || tp.textDefault
        const fontSize = currentParams['uFontSize'] || 24
        const texture = renderer.loadTextTexture(text, fontSize)
        textTextures.push(texture)
        atlasCount = text.length || 1
      }

      // Merge atlas count into params
      const mergedParams = { ...currentParams }
      if (textTextures.length > 0) {
        renderer.bindTexture(textTextures[0], 2)
        mergedParams['uAtlasCount'] = atlasCount
      }

      // 体积光自动光源:animelight 开启自动时用检测到的最亮点覆盖光源参数。
      // 守卫必须用 === 1 而非 !== 0:其他风格(如 kaleidoscope 也有 uCenterX/Y,
      // 范围 -1..1)的 params 里没有 uGodRayAuto,undefined !== 0 为 true 会跨风格
      // 污染它们的光源/中心参数。animelight 的 uGodRayAuto 由 defaultParams 与
      // mergeWithDefaults 保证始终存在,=== 1 判断足够。
      if (currentParams['uGodRayAuto'] === 1 && brightest) {
        mergedParams['uCenterX'] = brightest.x
        mergedParams['uCenterY'] = brightest.y
      }

      const shaderSources = await Promise.all(styleDef.shaderImports.map((fn) => fn()))

      if (styleDef.isMultiPass && shaderSources.length > 1) {
        const passes = shaderSources.map((src) => ({
          fragSource: src,
          uniforms: { ...mergedParams },
        }))
        renderer.renderMultiPass(passes)
      } else {
        renderer.useShader(shaderSources[0])
        renderer.setUniform('uResolution', [canvas.width, canvas.height])
        for (const [key, val] of Object.entries(mergedParams)) {
          renderer.setUniform(key, val)
        }
        renderer.render()
      }

      // Clean up text textures
      for (const tex of textTextures) {
        const gl = renderer.getGl()
        if (gl) gl.deleteTexture(tex)
      }
    },
    [image, brightest],
  )

  // ---------------------------------------------------------------------------
  // Image load handler
  // ---------------------------------------------------------------------------

  const handleImageLoad = useCallback(
    (img: HTMLImageElement) => {
      setImage(img)
      setImageInfo({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        size: formatFileSize(Math.round((img.naturalWidth || img.width) * (img.naturalHeight || img.height) * 4 / 1024) * 1024),
      })
    },
    [],
  )

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
  }, [image])

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
      const c = document.createElement('canvas')
      c.width = THUMB
      c.height = THUMB
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(image, 0, 0, THUMB, THUMB)
      setBrightest(findBrightestPoint(ctx.getImageData(0, 0, THUMB, THUMB).data, THUMB, THUMB))
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
      styleMemoryRef.current[activeStyle] = { params, textParams }
      // 目标风格：有记忆用记忆（用户最后一次离开时的样子），无记忆用默认值
      const memo = styleMemoryRef.current[id]
      setParams(memo?.params ?? defaultParams(id))
      setTextParams(memo?.textParams ?? defaultTextParams(id))
      setFontParams({})
      setActiveStyle(id)
    },
    [activeStyle, params, textParams],
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
  }, [image, activeStyle, params, textParams, fontParams, renderWithStyle])

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
  }, [activeStyle])

  const handleRandom = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    if (!styleDef) return
    // 以当前参数为底:toggle / skip 类参数保留现值,不再被整体替换丢弃
    // (此前全量替换会让 animelight 的 uGodRayAuto、kaleidoscope 的 uCenterX 等
    //  从 state 消失,自动光源静默失效)
    const randomParams: Record<string, number> = { ...params }
    for (const p of styleDef.params) {
      if (p.type === 'text' || p.type === 'color' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
      if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) continue
      const range = p.max - p.min
      const raw = p.min + Math.random() * range
      randomParams[p.uniform] = Math.round(raw / p.step) * p.step
    }
    setParams(randomParams)
  }, [activeStyle, params])

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

  const handleDownloadPng = useCallback(() => {
    getExportCanvas()?.toBlob((b) => downloadBlob(b, 'png'), 'image/png')
  }, [getExportCanvas, downloadBlob])

  const handleDownloadJpg = useCallback(() => {
    // JPG has no alpha: composite onto black if background is off.
    const styleDef = getStyle(activeStyle)
    const showBg = params['uShowBg'] ?? 1
    if (styleDef?.renderMode === 'canvas2d' && showBg !== 1) {
      const src = getExportCanvas()
      if (!src) return
      const tmp = document.createElement('canvas')
      tmp.width = src.width; tmp.height = src.height
      const ctx = tmp.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, tmp.width, tmp.height)
      ctx.drawImage(src, 0, 0)
      tmp.toBlob((b) => downloadBlob(b, 'jpg'), 'image/jpeg')
      return
    }
    getExportCanvas()?.toBlob((b) => downloadBlob(b, 'jpg'), 'image/jpeg')
  }, [activeStyle, params, getExportCanvas, downloadBlob])

  const handleDownloadSvg = useCallback(() => {
    const family = fontParams['uFont']?.family ?? 'monospace'
    const svg = asciiRendererRef.current?.exportSvg(family)
    if (!svg) return
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'svg')
  }, [fontParams, downloadBlob])

  const handleClose = useCallback(() => {
    setImage(null)
    setImageInfo(null)
    setCompareMode(false)
    setShowCloseDialog(false)
    if (rendererRef.current) {
      rendererRef.current.destroy()
      rendererRef.current = null
    }
  }, [])

  const handleTestImageClick = useCallback(
    (src: string) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        handleImageLoad(img)
      }
      img.src = src
    },
    [handleImageLoad],
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

  // 自动模式下 X/Y 滑块显示检测值(仅显示层,state 不动,避免渲染 effect 循环)
  const panelValues = useMemo(() => {
    if (activeStyle !== 'animelight' || params['uGodRayAuto'] !== 1 || !brightest) return params
    return { ...params, uCenterX: brightest.x, uCenterY: brightest.y }
  }, [activeStyle, params, brightest])

  const seed = useMemo(
    () => currentStyle ? encodeSeed(activeStyle, params, currentStyle) : '',
    [activeStyle, params, currentStyle],
  )

  const handleApplySeed = useCallback((code: string): boolean => {
    if (!image) return false
    const decoded = decodeSeed(code)
    if (!decoded) return false
    const def = getStyle(decoded.styleId)
    if (!def) return false
    // decodeSeed 只产出 numeric 参数(toggle 不参与编码),裸 setParams 会让
    // uGodRayAuto 等开关被替换掉;以风格默认值为底合并补齐
    const merged = mergeWithDefaults(def, decoded.params, defaultTextParams(decoded.styleId))
    setActiveStyle(decoded.styleId)
    setParams(merged.params)
    setTextParams(merged.textParams)
    setFontParams({})
    styleMemoryRef.current[decoded.styleId] = merged
    return true
  }, [image])

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
            onClose={() => setShowCloseDialog(true)}
          />
        ) : (
          <ImageUploader onImageLoad={handleImageLoad} />
        )}
        <div className="test-images-bar">
          {testImages.map((ti) => (
            <img
              key={ti.label}
              className="test-image-thumb"
              src={ti.src}
              alt={ti.label}
              onClick={() => handleTestImageClick(ti.src)}
            />
          ))}
        </div>
      </div>
      <ActionBar
        onDownloadPng={handleDownloadPng}
        onDownloadJpg={handleDownloadJpg}
        onDownloadSvg={handleDownloadSvg}
        renderMode={currentStyle?.renderMode}
        onReset={handleReset}
        onRandom={handleRandom}
        imageInfo={imageInfo}
      />
      {image && currentStyle && (
        <ParamPanel
          title={t(currentStyle.label)}
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
      {showCloseDialog && (
        <ConfirmDialog
          message={t('app2d.confirmExit')}
          onConfirm={handleClose}
          onCancel={() => setShowCloseDialog(false)}
        />
      )}
    </div>
  )
}

export default App2D
