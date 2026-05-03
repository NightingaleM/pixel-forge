import { useTranslation } from 'react-i18next'
import type { ModelInfo } from '../types'

interface ActionBar3DProps {
  onRandom: () => void
  onResetView: () => void
  particleCount: number
  onParticleCountChange: (count: number) => void
  modelInfo: ModelInfo | null
  isLoading?: boolean
  isParticleMode?: boolean
}

const PARTICLE_COUNTS = [1000, 10000, 50000, 100000, 200000, 300000, 500000]

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}k`
  }
  return count.toString()
}

export default function ActionBar3D({
  onRandom,
  onResetView,
  particleCount,
  onParticleCountChange,
  modelInfo,
  isLoading = false,
  isParticleMode = true,
}: ActionBar3DProps) {
  const { t } = useTranslation()

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

      {isParticleMode && (
        <div className="particle-count-control">
          <label className="particle-count-label">{t('app3d.particleCount')}</label>
          <select
            className="particle-count-select"
            value={particleCount}
            onChange={(e) => onParticleCountChange(Number(e.target.value))}
            disabled={isLoading}
          >
            {PARTICLE_COUNTS.map((count) => (
              <option key={count} value={count}>
                {formatCount(count)}
              </option>
            ))}
          </select>
        </div>
      )}

      {modelInfo && (
        <div className="model-info-display">
          <div className="model-info-line">{t('app3d.vertices')} {modelInfo.vertices.toLocaleString()}</div>
          <div className="model-info-line">{t('app3d.faces')} {modelInfo.faces.toLocaleString()}</div>
        </div>
      )}

      {isLoading && <div className="loading-indicator">{t('app3d.processing')}</div>}
    </div>
  )
}
