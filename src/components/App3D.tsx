import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ParticleEngine } from '../lib/ParticleEngine'
import { getAllEffects, getEffect } from '../lib/EffectRegistry'
import type { EffectId, ModelInfo } from '../types'
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

export default function App3D() {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticleEngine | null>(null)

  const [activeEffect, setActiveEffect] = useState<EffectId>('none')
  const [modelData, setModelData] = useState<ArrayBuffer | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [targetModelData, setTargetModelData] = useState<ArrayBuffer | null>(null)
  const [particleCount, setParticleCount] = useState(10000)
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

  // Initialize params when effect changes
  useEffect(() => {
    const effectDef = getEffect(activeEffect)
    if (!effectDef) return

    const newParams: Record<string, number> = {}
    const newTextValues: Record<string, string> = {}
    for (const param of effectDef.params) {
      if (!param.type || param.type === 'number' || param.type === 'toggle' || param.type === 'select') {
        newParams[param.uniform] = param.default as number
      } else if (param.type === 'color') {
        newTextValues[param.uniform] = param.default as string
      }
    }
    setParams(newParams)
    setTextValues(newTextValues)
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

            for (const [name, value] of Object.entries(params)) {
              engine.setUniform(name, value)
            }

            // Apply color uniforms from textValues
            for (const param of effectDef.params) {
              if (param.type === 'color') {
                const hex = textValues[param.uniform] ?? (param.default as string)
                const [r, g, b] = hexToRgb(hex)
                engine.setUniform(`${param.uniform}R`, r)
                engine.setUniform(`${param.uniform}G`, g)
                engine.setUniform(`${param.uniform}B`, b)
              }
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params intentionally excluded: including it would re-init the model on every slider move
  }, [modelData, targetModelData, activeEffect, particleCount, t])

  // Handle effect change
  const handleEffectChange = useCallback((id: EffectId) => {
    setActiveEffect(id)
  }, [])

  // Handle param change
  const handleParamChange = useCallback((uniform: string, value: number) => {
    setParams((prev) => ({ ...prev, [uniform]: value }))
    engineRef.current?.setUniform(uniform, value)
  }, [])

  // Handle text/color param change
  const handleTextChange = useCallback((uniform: string, value: string) => {
    setTextValues((prev) => ({ ...prev, [uniform]: value }))

    // For color params, convert hex to RGB uniforms
    const effectDef = getEffect(activeEffect)
    const param = effectDef?.params.find(p => p.type === 'color' && p.uniform === uniform)
    if (param?.type === 'color') {
      const [r, g, b] = hexToRgb(value)
      engineRef.current?.setUniform(`${uniform}R`, r)
      engineRef.current?.setUniform(`${uniform}G`, g)
      engineRef.current?.setUniform(`${uniform}B`, b)
    }
  }, [activeEffect])

  // Handle random params
  const handleRandom = useCallback(() => {
    const effectDef = getEffect(activeEffect)
    if (!effectDef) return

    const randomParams: Record<string, number> = {}
    const randomTextValues: Record<string, string> = {}
    for (const param of effectDef.params) {
      if (!param.type || param.type === 'number') {
        const range = param.max - param.min
        const raw = param.min + Math.random() * range
        randomParams[param.uniform] = Math.round(raw / param.step) * param.step
      } else if (param.type === 'toggle') {
        randomParams[param.uniform] = Math.random() > 0.5 ? 1 : 0
      } else if (param.type === 'select') {
        const idx = Math.floor(Math.random() * param.options.length)
        randomParams[param.uniform] = param.options[idx].value
      } else if (param.type === 'color') {
        const hex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        randomTextValues[param.uniform] = hex
      }
    }

    setParams(randomParams)
    setTextValues(randomTextValues)

    for (const [name, value] of Object.entries(randomParams)) {
      engineRef.current?.setUniform(name, value)
    }

    // Apply random color uniforms
    for (const param of effectDef.params) {
      if (param.type === 'color' && randomTextValues[param.uniform]) {
        const [r, g, b] = hexToRgb(randomTextValues[param.uniform])
        engineRef.current?.setUniform(`${param.uniform}R`, r)
        engineRef.current?.setUniform(`${param.uniform}G`, g)
        engineRef.current?.setUniform(`${param.uniform}B`, b)
      }
    }
  }, [activeEffect])

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

        {currentEffect && activeEffect !== 'none' && (
          <ParamPanel
            title={t(currentEffect.label)}
            description={t(currentEffect.description)}
            params={currentEffect.params.map(p => {
              if (p.type === 'select') {
                return { ...p, name: t(p.name), options: p.options.map(o => ({ ...o, label: t(o.label) })) }
              }
              return { ...p, name: t(p.name) }
            })}
            values={params}
            textValues={textValues}
            onChange={handleParamChange}
            onTextChange={handleTextChange}
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
