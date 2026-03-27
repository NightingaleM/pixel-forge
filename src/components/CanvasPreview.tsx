import type { RefObject } from 'react'

interface CanvasPreviewProps {
  canvasRef: RefObject<HTMLCanvasElement>
}

function CanvasPreview({ canvasRef }: CanvasPreviewProps) {
  return (
    <div className="preview-area">
      <canvas ref={canvasRef} />
      <span className="placeholder-text">请先上传图片</span>
    </div>
  )
}

export default CanvasPreview
