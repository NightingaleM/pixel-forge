import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { readImageFiles } from '../lib/readImageFiles'

interface ImageUploaderProps {
  // 多选上传(v2):全部文件解码完成后一次性回调,顺序与文件选择一致。
  // 单图模式 = 数组长度 1,消费方(App2D)按张数分派三态,组件自身不感知模式。
  onImagesLoad: (images: HTMLImageElement[], names: string[]) => void
}

function ImageUploader({ onImagesLoad }: ImageUploaderProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList) => {
    void readImageFiles(files).then((loaded) => {
      // 全部失败(或非图片)时不回调:上传页保持原状,失败已在 lib 内逐个 warn
      if (loaded.length === 0) return
      onImagesLoad(loaded.map((l) => l.image), loaded.map((l) => l.name))
    })
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
    // 清空 value:同名文件再次选择也要触发 onChange
    e.target.value = ''
  }

  return (
    <div
      className="upload-zone"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      <div className="upload-zone-content">
        <span>{t('uploader.dragOrClick')}</span>
        <p className="upload-hint">{t('uploader.sizeHint')}</p>
      </div>
    </div>
  )
}

export default ImageUploader
