import type { ModelInfo } from '../types'

interface ActionBar3DProps {
  onRandom: () => void
  onResetView: () => void
  particleCount: number
  onParticleCountChange: (count: number) => void
  modelInfo: ModelInfo | null
  isLoading?: boolean
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
}: ActionBar3DProps) {
  return (
    <div className="action-bar-3d">
      <button className="action-btn" onClick={onRandom} disabled={isLoading}>
        随机参数
      </button>
      <button className="action-btn" onClick={onResetView} disabled={isLoading}>
        重置视角
      </button>

      <div className="particle-count-control">
        <label className="particle-count-label">粒子数量:</label>
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

      {modelInfo && (
        <div className="model-info-display">
          <div className="model-info-line">顶点: {modelInfo.vertices.toLocaleString()}</div>
          <div className="model-info-line">面: {modelInfo.faces.toLocaleString()}</div>
        </div>
      )}

      {isLoading && <div className="loading-indicator">处理中...</div>}
    </div>
  )
}
