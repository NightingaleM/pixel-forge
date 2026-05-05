import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelInfo } from '../types'
import type { ParticleEngine } from '../lib/ParticleEngine'
import RecordingControls from './RecordingControls'

interface ActionBar3DProps {
  onRandom: () => void
  onResetView: () => void
  particleCount: number
  onParticleCountChange: (count: number) => void
  modelInfo: ModelInfo | null
  isLoading?: boolean
  samplingProgress?: number
  isParticleMode?: boolean
  engineRef?: React.RefObject<ParticleEngine | null>
}

const PARTICLE_COUNTS = [
  1000, 10000, 50000, 100000, 200000, 300000, 500000,
  1000000, 5000000, 10000000,
]

const MIN_COUNT = 500
const MAX_COUNT = 50000000

function formatCount(count: number): string {
  if (count >= 1000000 && count % 1000000 === 0) return `${count / 1000000}M`
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(0)}k`
  return count.toString()
}

function clampCount(v: number): number {
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, v))
}

export default function ActionBar3D({
  onRandom,
  onResetView,
  particleCount,
  onParticleCountChange,
  modelInfo,
  isLoading = false,
  samplingProgress = -1,
  isParticleMode = true,
  engineRef,
}: ActionBar3DProps) {
  const { t } = useTranslation()
  const isPreset = PARTICLE_COUNTS.includes(particleCount)

  const [customMode, setCustomMode] = useState(!isPreset)
  const [inputValue, setInputValue] = useState(
    isPreset ? '' : String(particleCount),
  )

  const switchToPreset = useCallback(() => {
    setCustomMode(false)
    setInputValue('')
  }, [])

  const switchToCustom = useCallback(() => {
    setCustomMode(true)
  }, [])

  const applyCustom = useCallback(() => {
    const raw = parseInt(inputValue, 10)
    if (!isNaN(raw)) {
      const clamped = clampCount(raw)
      onParticleCountChange(clamped)
      setInputValue(String(clamped))
    }
  }, [inputValue, onParticleCountChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') applyCustom()
    },
    [applyCustom],
  )

  return (
    <div className="action-bar-3d">
      {isParticleMode && (
        <button className="action-btn" onClick={onRandom} disabled={isLoading}>
          {t('app3d.randomParams')}
        </button>
      )}
      <button className="action-btn" onClick={onResetView} disabled={isLoading}>
        {t('app3d.resetView')}
      </button>

      {engineRef && <RecordingControls engineRef={engineRef} />}

      {isParticleMode && (
        <div className="particle-count-control">
          <label className="particle-count-label">{t('app3d.particleCount')}</label>

          {customMode ? (
            <input
              className="particle-count-input"
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={applyCustom}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="500–50M"
            />
          ) : (
            <select
              className="particle-count-select"
              value={isPreset ? particleCount : ''}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  switchToCustom()
                } else {
                  onParticleCountChange(Number(e.target.value))
                }
              }}
              disabled={isLoading}
            >
              {PARTICLE_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {formatCount(count)}
                </option>
              ))}
              <option value="__custom__">{t('app3d.customCount')}</option>
            </select>
          )}

          {customMode && (
            <button
              className="particle-count-back-btn"
              onClick={switchToPreset}
              disabled={isLoading}
              title={t('app3d.backToPreset')}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="loading-indicator">
          {samplingProgress >= 0
            ? `${t('app3d.sampling')} ${samplingProgress}%`
            : t('app3d.processing')}
        </div>
      )}
    </div>
  )
}
