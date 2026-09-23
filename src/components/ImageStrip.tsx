// src/components/ImageStrip.tsx
// 底部多图栏(v2,替代 v1 test-images-bar):已上传缩略图(选中高亮 + hover 移除)、
// [+] 追加(multiple)、n/20 计数,尾部用分隔线隔开陈列测试图。纯展示 + 回调,
// 不持有状态;测试图的点击语义(单图=加载 / 批量=追加)由 App2D 在 onTestImage
// 回调里按模式分派,组件只透传 src。
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BatchImage } from '../lib/batch/imageList'
import { BATCH_MAX_ROWS } from '../lib/batch/batchJob'

export interface TestImage {
  src: string
  label: string
}

export interface ImageStripProps {
  images: BatchImage[]
  selectedIndex: number
  mode: 'single' | 'batch'
  /** 已达 20 行上限:禁用 [+](测试图追加上限守卫在 App2D 回调内) */
  atLimit: boolean
  onSelect: (i: number) => void
  onRemove: (i: number) => void
  onAddFiles: (files: FileList | File[]) => void
  testImages: TestImage[]
  onTestImage: (src: string) => void
}

// 移除钮内联 ×(与 BatchPanel 行移除同款手绘 SVG,禁 emoji)
const removeIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// [+] 追加钮内联加号
const addIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

function ImageStrip({
  images,
  selectedIndex,
  mode,
  atLimit,
  onSelect,
  onRemove,
  onAddFiles,
  testImages,
  onTestImage,
}: ImageStripProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={`image-strip${mode === 'batch' ? ' image-strip--batch' : ''}`}>
      {images.map((img, i) => (
        <div
          key={img.id}
          className={`image-strip-cell${i === selectedIndex ? ' image-strip-cell--selected' : ''}`}
        >
          <img
            className="image-strip-thumb"
            src={img.image.src}
            alt={img.fileName}
            title={img.fileName}
            onClick={() => onSelect(i)}
          />
          <button
            type="button"
            className="image-strip-remove"
            title={t('batch.remove')}
            aria-label={t('batch.remove')}
            onClick={() => onRemove(i)}
          >
            {removeIcon}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="image-strip-add"
        title={atLimit ? t('batch.limitReached', { n: BATCH_MAX_ROWS }) : t('batch.addMore')}
        aria-label={t('batch.addMore')}
        disabled={atLimit}
        onClick={() => inputRef.current?.click()}
      >
        {addIcon}
      </button>
      <span className="image-strip-count">
        {images.length}/{BATCH_MAX_ROWS}
      </span>
      {testImages.length > 0 && <div className="image-strip-divider" aria-hidden="true" />}
      {testImages.map((ti) => (
        <img
          key={ti.label}
          className="image-strip-thumb image-strip-thumb--test"
          src={ti.src}
          alt={ti.label}
          title={ti.label}
          onClick={() => onTestImage(ti.src)}
        />
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onAddFiles(e.target.files)
          // 清空 value:同一文件再次选择也要触发 onChange
          e.target.value = ''
        }}
      />
    </div>
  )
}

export default ImageStrip
