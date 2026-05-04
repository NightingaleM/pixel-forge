import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ParticleEngine } from '../lib/ParticleEngine'
import { getAllEffects, getEffect, BASE_PARAMS } from '../lib/EffectRegistry'
import type { EffectId, ModelInfo, ParamDef } from '../types'
import ModelUploader from './ModelUploader'
import EffectSelector from './EffectSelector'
import ActionBar3D from './ActionBar3D'
import ParamPanel from './ParamPanel'

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

function initDefaults(params: ParamDef[]) {
  const nums: Record<string, number> = {}
  const texts: Record<string, string> = {}
  for (const p of params) {
    if (!p.type || p.type === 'number' || p.type === 'toggle' || p.type === 'select') {
      nums[p.uniform] = p.default as number
    } else if (p.type === 'color') {
      texts[p.uniform] = p.default as string
    }
  }
  return { nums, texts }
}

export default function App3D() {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticleEngine | null>(null)

  const [activeEffect, setActiveEffect] = useState<EffectId>('none')
  const [modelData, setModelData] = useState<ArrayBuffer | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [targetModelData, setTargetModelData] = useState<ArrayBuffer | null>(null)
  const [particleCount, setParticleCount] = useState(10000)

  // Shared base params (persist across effect switches)
  const [baseParams, setBaseParams] = useState<Record<string, number>>(() => initDefaults(BASE_PARAMS).nums)
  const [baseTextValues, setBaseTextValues] = useState<Record<string, string>>(() => initDefaults(BASE_PARAMS).texts)

  // Effect-specific params (reset on effect switch)
  const [params, setParams] = useState<Record<string, number>>({})
  const [textValues, setTextValues] = useState<Record<string, string>>({})

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new ParticleEngine(canvas)
    engineRef.current = engine
    engine.start()

    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  // Initialize effect-specific params when effect changes
  useEffect(() => {
    const effectDef = getEffect(activeEffect)
    if (!effectDef) return
    const { nums, texts } = initDefaults(effectDef.params)
    setParams(nums)
    setTextValues(texts)
  }, [activeEffect])

  // Handle model load
  const handleModelLoad = useCallback((data: ArrayBuffer, info: ModelInfo) => {
    setModelData(data)
    setModelInfo(info)
    setTargetModelData(null)
    engineRef.current?.resetCamera()
  }, [])

  // Handle target model load (for morph effect)
  const handleTargetModelLoad = useCallback((data: ArrayBuffer) => {
    setTargetModelData(data)
  }, [])

  // Helper: apply all color params from a param list
  const applyColorParams = useCallback((paramDefs: ParamDef[], textVals: Record<string, string>) => {
    for (const param of paramDefs) {
      if (param.type === 'color') {
        const hex = textVals[param.uniform] ?? (param.default as string)
        const [r, g, b] = hexToRgb(hex)
        engineRef.current?.setUniform(`${param.uniform}R`, r)
        engineRef.current?.setUniform(`${param.uniform}G`, g)
        engineRef.current?.setUniform(`${param.uniform}B`, b)
      }
    }
  }, [])

  // Apply model and sampling
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !modelData) return

    const initEffect = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const effectDef = getEffect(activeEffect)

        await engine.loadModel(modelData)

        if (activeEffect === 'none') {
          engine.showMesh()
        } else {
          engine.hideMesh()

          if (!effectDef?.requiresTargetModel) {
            engine.clearTargetModel()
          }

          if (effectDef?.requiresTargetModel && targetModelData) {
            await engine.loadTargetModel(targetModelData)
          }

          if (effectDef) {
            engine.sampleParticles(particleCount, effectDef.samplingType)
          }

          if (effectDef) {
            await engine.applyMaterial(effectDef)

            // Apply base params
            for (const [name, value] of Object.entries(baseParams)) {
              engine.setUniform(name, value)
            }
            applyColorParams(BASE_PARAMS, baseTextValues)

            // Apply effect-specific params
            for (const [name, value] of Object.entries(params)) {
              engine.setUniform(name, value)
            }
            applyColorParams(effectDef.params, textValues)
          }
        }
      } catch (err) {
        console.error('Failed to initialize model:', err)
        setError(t('app3d.loadFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    initEffect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params/baseParams intentionally excluded
  }, [modelData, targetModelData, activeEffect, particleCount, t])

  // Handle effect change
  const handleEffectChange = useCallback((id: EffectId) => {
    setActiveEffect(id)
  }, [])

  // Handle base param change
  const handleBaseParamChange = useCallback((uniform: string, value: number) => {
    setBaseParams((prev) => ({ ...prev, [uniform]: value }))
    engineRef.current?.setUniform(uniform, value)
  }, [])

  // Handle base text/color param change
  const handleBaseTextChange = useCallback((uniform: string, value: string) => {
    setBaseTextValues((prev) => ({ ...prev, [uniform]: value }))
    const param = BASE_PARAMS.find(p => p.type === 'color' && p.uniform === uniform)
    if (param?.type === 'color') {
      const [r, g, b] = hexToRgb(value)
      engineRef.current?.setUniform(`${uniform}R`, r)
      engineRef.current?.setUniform(`${uniform}G`, g)
      engineRef.current?.setUniform(`${uniform}B`, b)
    }
  }, [])

  // Handle effect-specific param change
  const handleParamChange = useCallback((uniform: string, value: number) => {
    setParams((prev) => ({ ...prev, [uniform]: value }))
    engineRef.current?.setUniform(uniform, value)
  }, [])

  // Handle effect-specific text/color param change
  const handleTextChange = useCallback((uniform: string, value: string) => {
    setTextValues((prev) => ({ ...prev, [uniform]: value }))
    const effectDef = getEffect(activeEffect)
    const param = effectDef?.params.find(p => p.type === 'color' && p.uniform === uniform)
    if (param?.type === 'color') {
      const [r, g, b] = hexToRgb(value)
      engineRef.current?.setUniform(`${uniform}R`, r)
      engineRef.current?.setUniform(`${uniform}G`, g)
      engineRef.current?.setUniform(`${uniform}B`, b)
    }
  }, [activeEffect])

  // Handle random params (both base + effect-specific)
  const handleRandom = useCallback(() => {
    const effectDef = getEffect(activeEffect)
    if (!effectDef) return

    const randomize = (paramDefs: ParamDef[]) => {
      const nums: Record<string, number> = {}
      const texts: Record<string, string> = {}
      for (const param of paramDefs) {
        if (!param.type || param.type === 'number') {
          const range = param.max - param.min
          const raw = param.min + Math.random() * range
          nums[param.uniform] = Math.round(raw / param.step) * param.step
        } else if (param.type === 'toggle') {
          nums[param.uniform] = Math.random() > 0.5 ? 1 : 0
        } else if (param.type === 'select') {
          const idx = Math.floor(Math.random() * param.options.length)
          nums[param.uniform] = param.options[idx].value
        } else if (param.type === 'color') {
          texts[param.uniform] = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        }
      }
      return { nums, texts }
    }

    // Randomize base params
    const base = randomize(BASE_PARAMS)
    setBaseParams(base.nums)
    setBaseTextValues(base.texts)
    for (const [name, value] of Object.entries(base.nums)) {
      engineRef.current?.setUniform(name, value)
    }
    applyColorParams(BASE_PARAMS, base.texts)

    // Randomize effect-specific params
    const fx = randomize(effectDef.params)
    setParams(fx.nums)
    setTextValues(fx.texts)
    for (const [name, value] of Object.entries(fx.nums)) {
      engineRef.current?.setUniform(name, value)
    }
    applyColorParams(effectDef.params, fx.texts)
  }, [activeEffect, applyColorParams])

  // Handle reset camera
  const handleResetView = useCallback(() => {
    engineRef.current?.resetCamera()
  }, [])

  // Handle particle count change
  const handleParticleCountChange = useCallback((count: number) => {
    setParticleCount(count)
  }, [])

  const effects = getAllEffects()
  const currentEffect = getEffect(activeEffect)
  const needsTargetModel = currentEffect?.requiresTargetModel
  const effectParams = currentEffect?.params ?? []

  // Translate param names for rendering
  const translatedBaseParams = BASE_PARAMS.map(p => {
    if (p.type === 'select') {
      return { ...p, name: t(p.name), options: p.options.map(o => ({ ...o, label: t(o.label) })) }
    }
    return { ...p, name: t(p.name) }
  })

  const translatedEffectParams = effectParams.map(p => {
    if (p.type === 'select') {
      return { ...p, name: t(p.name), options: p.options.map(o => ({ ...o, label: t(o.label) })) }
    }
    return { ...p, name: t(p.name) }
  })

  return (
    <div className="app-3d">
      <div className="app-3d-sidebar">
        <EffectSelector
          effects={effects}
          activeId={activeEffect}
          onSelect={handleEffectChange}
        />

        <ModelUploader
          onModelLoad={handleModelLoad}
          label={t('modelUploader.sourceLabel')}
        />

        {needsTargetModel && (
          <ModelUploader
            onModelLoad={handleTargetModelLoad}
            label={t('modelUploader.targetLabel')}
          />
        )}

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>{t('common.close')}</button>
          </div>
        )}
      </div>

      <div className="app-3d-main">
        <canvas ref={canvasRef} className="canvas-3d" />

        {/* Base params — always visible draggable panel */}
        {activeEffect !== 'none' && (
          <ParamPanel
            title={t('app3d.particleEffect')}
            description=""
            params={translatedBaseParams}
            values={baseParams}
            textValues={baseTextValues}
            onChange={handleBaseParamChange}
            onTextChange={handleBaseTextChange}
            defaultPos={{ x: 345, y: 35 }}
          />
        )}

        {/* Effect-specific params — floating panel */}
        {currentEffect && activeEffect !== 'none' && effectParams.length > 0 && (
          <ParamPanel
            title={t(currentEffect.label)}
            description={t(currentEffect.description)}
            params={translatedEffectParams}
            values={params}
            textValues={textValues}
            onChange={handleParamChange}
            onTextChange={handleTextChange}
            defaultPos={{ x: 632, y: 35 }}
          />
        )}

        <ActionBar3D
          onRandom={handleRandom}
          onResetView={handleResetView}
          particleCount={particleCount}
          onParticleCountChange={handleParticleCountChange}
          modelInfo={modelInfo}
          isLoading={isLoading}
          isParticleMode={activeEffect !== 'none'}
        />
      </div>
    </div>
  )
}
