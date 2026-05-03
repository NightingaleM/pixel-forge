import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ParticleEngine } from '../lib/ParticleEngine'
import { getAllEffects, getEffect } from '../lib/EffectRegistry'
import type { EffectId, ModelInfo } from '../types'
import ModelUploader from './ModelUploader'
import EffectSelector from './EffectSelector'
import ActionBar3D from './ActionBar3D'
import ParamPanel from './ParamPanel'

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
    for (const param of effectDef.params) {
      if (param.type !== 'text') {
        newParams[param.uniform] = param.default
      }
    }
    setParams(newParams)
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

  // Handle random params
  const handleRandom = useCallback(() => {
    const effectDef = getEffect(activeEffect)
    if (!effectDef) return

    const randomParams: Record<string, number> = {}
    for (const param of effectDef.params) {
      if (param.type !== 'text') {
        const range = param.max - param.min
        const raw = param.min + Math.random() * range
        randomParams[param.uniform] = Math.round(raw / param.step) * param.step
      }
    }

    setParams(randomParams)

    for (const [name, value] of Object.entries(randomParams)) {
      engineRef.current?.setUniform(name, value)
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
            params={currentEffect.params.map(p => ({ ...p, name: t(p.name) }))}
            values={params}
            textValues={{}}
            onChange={handleParamChange}
            onTextChange={() => {}}
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
