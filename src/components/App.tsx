import { useState, useRef, useEffect, useCallback } from 'react'
import { ShaderRenderer } from '../lib/ShaderRenderer'
import { styles, getStyle } from '../lib/StyleRegistry'
import type { StyleId } from '../types'
import ImageUploader from './ImageUploader'
import StyleSelector from './StyleSelector'
import ParamPanel from './ParamPanel'
import ActionBar from './ActionBar'
import { CompareSlider } from './CompareSlider'

function initParams(styleId: StyleId): Record<string, number> {
  const styleDef = getStyle(styleId)
  if (!styleDef) return {}
  const result: Record<string, number> = {}
  for (const p of styleDef.params) {
    result[p.uniform] = p.default
  }
  return result
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [activeStyle, setActiveStyle] = useState<StyleId>('halftone')
  const [params, setParams] = useState<Record<string, number>>(() => initParams('halftone'))
  const [compareMode, setCompareMode] = useState(false)
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number; size: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ShaderRenderer | null>(null)

  // Keep a ref to latest params so the render pipeline can read current values
  // without stale closures.
  const paramsRef = useRef<Record<string, number>>(params)
  paramsRef.current = params
  const activeStyleRef = useRef<StyleId>(activeStyle)
  activeStyleRef.current = activeStyle

  // ---------------------------------------------------------------------------
  // Render pipeline
  // ---------------------------------------------------------------------------

  const renderWithStyle = useCallback(
    async (styleId: StyleId, currentParams: Record<string, number>) => {
      const canvas = canvasRef.current
      const renderer = rendererRef.current
      if (!canvas || !renderer) return

      const styleDef = getStyle(styleId)
      if (!styleDef) return

      const shaderSources = await Promise.all(styleDef.shaderImports.map((fn) => fn()))

      if (styleDef.isMultiPass && shaderSources.length > 1) {
        // Multi-pass: each pass gets its own shader + params
        const passes = shaderSources.map((src) => ({
          fragSource: src,
          uniforms: { ...currentParams },
        }))
        renderer.renderMultiPass(passes)
      } else {
        // Single pass
        renderer.useShader(shaderSources[0])
        renderer.setUniform('uResolution', [canvas.width, canvas.height])
        for (const [key, val] of Object.entries(currentParams)) {
          renderer.setUniform(key, val)
        }
        renderer.render()
      }
    },
    [],
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
      const newParams = initParams(id)
      setParams(newParams)
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Effect: re-render when activeStyle or params change (image must be loaded)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!image || !rendererRef.current) return
    renderWithStyle(activeStyle, params)
  }, [image, activeStyle, params, renderWithStyle])

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy()
        rendererRef.current = null
      }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Param handlers
  // ---------------------------------------------------------------------------

  const handleParamChange = useCallback((uniform: string, value: number) => {
    setParams((prev) => ({ ...prev, [uniform]: value }))
  }, [])

  const handleReset = useCallback(() => {
    setParams(initParams(activeStyle))
  }, [activeStyle])

  const handleRandom = useCallback(() => {
    const styleDef = getStyle(activeStyle)
    if (!styleDef) return
    const randomParams: Record<string, number> = {}
    for (const p of styleDef.params) {
      const range = p.max - p.min
      // Snap to step
      const raw = p.min + Math.random() * range
      randomParams[p.uniform] = Math.round(raw / p.step) * p.step
    }
    setParams(randomParams)
  }, [activeStyle])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeStyle}_${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [activeStyle])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const currentStyle = getStyle(activeStyle)

  return (
    <div className="app-container">
      <div className="left-sidebar">
        <StyleSelector styles={styles} activeId={activeStyle} onSelect={handleStyleChange} />
        {image && currentStyle && (
          <ParamPanel
            styleLabel={currentStyle.label}
            styleDescription={currentStyle.description}
            params={currentStyle.params}
            values={params}
            onChange={handleParamChange}
          />
        )}
      </div>
      <div className="center-area">
        {image ? (
          <CompareSlider
            canvasRef={canvasRef}
            originalImage={image}
            compareMode={compareMode}
            onToggleCompare={() => setCompareMode((prev) => !prev)}
          />
        ) : (
          <ImageUploader onImageLoad={handleImageLoad} />
        )}
      </div>
      <ActionBar
        onDownload={handleDownload}
        onReset={handleReset}
        onRandom={handleRandom}
        imageInfo={imageInfo}
      />
    </div>
  )
}

export default App
