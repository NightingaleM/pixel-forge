import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShaderRenderer } from '../lib/ShaderRenderer'
import { AsciiCanvasRenderer } from '../lib/AsciiCanvasRenderer'
import { styles, getStyle, defaultParams, defaultTextParams } from '../lib/StyleRegistry'
import { encodeSeed, decodeSeed } from '../lib/seedCodec'
import type { StyleId } from '../types'
import ImageUploader from './ImageUploader'
import StyleSelector from './StyleSelector'
import ParamPanel from './ParamPanel'
import { SeedBar } from './SeedBar'
import ActionBar from './ActionBar'
import { CompareSlider } from './CompareSlider'
import ConfirmDialog from './ConfirmDialog'

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
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ShaderRenderer | null>(null)
  const asciiCanvasRef = useRef<HTMLCanvasElement>(null)
  const asciiRendererRef = useRef<AsciiCanvasRenderer | null>(null)
  const [fontParams, setFontParams] = useState<Record<string, FontFace | null>>({})

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
    [image],
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
  // Style change handler
  // ---------------------------------------------------------------------------

  const handleStyleChange = useCallback(
    (id: StyleId) => {
      setActiveStyle(id)
      setTextParams(defaultTextParams(id))
      const styleDef = getStyle(id)
      if (!styleDef) { setParams(defaultParams(id)); return }
      const randomParams: Record<string, number> = {}
      for (const p of styleDef.params) {
        if (p.type === 'text' || p.type === 'color' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
        if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) {
          randomParams[p.uniform] = 0
          continue
        }
        const range = p.max - p.min
        const raw = p.min + Math.random() * range
        randomParams[p.uniform] = Math.round(raw / p.step) * p.step
      }
      setFontParams({})
      setParams(randomParams)
    },
    [],
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
    setParams((prev) => ({ ...prev, [uniform]: value }))
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
    const randomParams: Record<string, number> = {}
    for (const p of styleDef.params) {
      if (p.type === 'text' || p.type === 'color' || p.type === 'toggle' || p.type === 'select' || p.type === 'font') continue
      if (SKIP_RANDOM_UNIFORMS.includes(p.uniform)) continue
      const range = p.max - p.min
      const raw = p.min + Math.random() * range
      randomParams[p.uniform] = Math.round(raw / p.step) * p.step
    }
    setParams(randomParams)
  }, [activeStyle])

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
    setActiveStyle(decoded.styleId)
    setParams(decoded.params)
    setTextParams(defaultTextParams(decoded.styleId))
    setFontParams({})
    return true
  }, [image])

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
          values={params}
          textValues={textParams}
          onChange={handleParamChange}
          onTextChange={handleTextChange}
          fontValues={fontParams}
          onFontChange={handleFontChange}
          top={<SeedBar seed={seed} onApply={handleApplySeed} />}
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
