import { useRef, useState } from 'react'
import * as THREE from 'three'
import type { ModelInfo } from '../types'

interface ModelUploaderProps {
  onModelLoad: (data: ArrayBuffer, info: ModelInfo) => void
  label?: string
}

export default function ModelUploader({ onModelLoad, label = '上传 GLTF/GLB 模型' }: ModelUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFile = async (file: File) => {
    setError(null)
    setIsLoading(true)

    if (!file.name.match(/\.(gltf|glb)$/i)) {
      setError('请上传 .gltf 或 .glb 格式的文件')
      setIsLoading(false)
      return
    }

    try {
      const data = await file.arrayBuffer()

      // Parse model to get info using same method as ParticleEngine
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const loader = new GLTFLoader()

      await new Promise<void>((resolve, reject) => {
        loader.parse(
          data,
          '',
          (gltf) => {
            let vertexCount = 0
            let faceCount = 0

            gltf.scene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh
                const posAttr = mesh.geometry.attributes.position
                const indexAttr = mesh.geometry.index
                vertexCount += posAttr.count
                faceCount += indexAttr ? indexAttr.count / 3 : posAttr.count / 3
              }
            })

            const info: ModelInfo = { vertices: vertexCount, faces: faceCount }
            setModelInfo(info)
            onModelLoad(data, info)
            resolve()
          },
          (error) => {
            setError('无法加载模型，请检查文件格式')
            reject(error)
          }
        )
      })
    } catch (err) {
      setError('无法加载模型，请检查文件格式')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  return (
    <div className="model-uploader">
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb"
          onChange={handleFileInput}
          disabled={isLoading}
          style={{ display: 'none' }}
        />
        <div className="upload-content">
          {isLoading ? (
            <>
              <div className="upload-icon">⏳</div>
              <div className="upload-label">加载中...</div>
            </>
          ) : (
            <>
              <div className="upload-icon">📁</div>
              <div className="upload-label">{label}</div>
              <div className="upload-hint">拖拽文件到此处或点击上传</div>
            </>
          )}
        </div>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {modelInfo && (
        <div className="model-info">
          <div className="model-info-item">
            <span className="model-info-label">顶点数:</span>
            <span className="model-info-value">{modelInfo.vertices.toLocaleString()}</span>
          </div>
          <div className="model-info-item">
            <span className="model-info-label">面数:</span>
            <span className="model-info-value">{modelInfo.faces.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
