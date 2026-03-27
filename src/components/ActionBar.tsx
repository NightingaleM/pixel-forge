interface ActionBarProps {
  onDownload: () => void
  onReset: () => void
  onRandom: () => void
  imageInfo: { width: number; height: number; size: string } | null
}

function ActionBar({ onDownload, onReset, onRandom, imageInfo }: ActionBarProps) {
  return (
    <div className="action-bar">
      <button className="action-btn" onClick={onDownload}>下载</button>
      <button className="action-btn action-btn--secondary" onClick={onReset}>重置</button>
      <button className="action-btn action-btn--secondary" onClick={onRandom}>随机</button>
      {imageInfo && (
        <div className="image-info">
          {imageInfo.width} x {imageInfo.height} | {imageInfo.size}
        </div>
      )}
    </div>
  )
}

export default ActionBar
