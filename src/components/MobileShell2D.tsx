// src/components/MobileShell2D.tsx
// 移动端(≤767px)2D 外壳骨架(Task 4):顶栏(返回 + 风格名占位钮 + 对比钮)
// + 画布区(CompareSlider / 上传页)+ 图片条(ImageStrip)。布局与 safe-area/
// dvh 基建在 styles/mobile.css;props 全部由 App2D 分流透传,行状态/渲染管线
// 仍归 App2D,本组件纯视图。Task 5 加底部 dock 与会员圆标,Task 6 把风格名钮
// 换成 sheet 触发,届时再消费 styles/onStyleChange/licenseActive/onOpenLicense。
import { type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CompareSlider } from './CompareSlider'
import ImageStrip, { type ImageStripProps } from './ImageStrip'
import ImageUploader from './ImageUploader'
import type { StyleId } from '../types'

export interface MobileShell2DProps {
  // 画布区
  image: HTMLImageElement | null
  canvasRef: RefObject<HTMLCanvasElement | null>
  asciiCanvasRef: RefObject<HTMLCanvasElement | null>
  renderMode?: 'shader' | 'canvas2d'
  compareMode: boolean
  onToggleCompare: () => void
  onClose: () => void
  /** 上传页回调(ImageUploader):App2D handleImagesLoad 直通 */
  onImagesLoad: (images: HTMLImageElement[], names: string[]) => void
  // 图片条(类型直接取自 ImageStrip 的 Props)
  images: ImageStripProps['images']
  seedViews: ImageStripProps['seedViews']
  selectedIndex: number
  stripMode: ImageStripProps['mode']
  atLimit: boolean
  onSelect: ImageStripProps['onSelect']
  onRemove: ImageStripProps['onRemove']
  onAddFiles: ImageStripProps['onAddFiles']
  testImages: ImageStripProps['testImages']
  onTestImage: ImageStripProps['onTestImage']
  // 顶栏(骨架阶段仅展示;onStyleChange 等 Task 5/6 接入 sheet 后消费)
  styles: { id: string }[]
  activeStyle: StyleId
  onStyleChange: (id: StyleId) => void
  licenseActive: boolean
  onOpenLicense: () => void
}

function MobileShell2D(props: MobileShell2DProps) {
  const { t } = useTranslation()
  return (
    <div className="m-app">
      <div className="m-topbar">
        <Link to="/" aria-label={t('common.backToHome')}>←</Link>
        {/* 风格名按钮 Task 6 换成 sheet 触发;骨架阶段空 onClick 占位 */}
        <button type="button" className="m-style-btn" onClick={() => {}}>{props.activeStyle}</button>
        <div className="m-topbar-spacer" style={{ flex: 1 }} />
        <button type="button" onClick={props.onToggleCompare}>{t('compare.compare')}</button>
        {/* 会员小圆标 Task 5 加 */}
      </div>
      <div className="m-canvas-area">
        {props.image ? (
          <CompareSlider
            canvasRef={props.canvasRef}
            asciiCanvasRef={props.asciiCanvasRef}
            renderMode={props.renderMode}
            originalImage={props.image}
            compareMode={props.compareMode}
            onToggleCompare={props.onToggleCompare}
            onClose={props.onClose}
          />
        ) : (
          <ImageUploader onImagesLoad={props.onImagesLoad} />
        )}
        <ImageStrip
          images={props.images}
          seedViews={props.seedViews}
          selectedIndex={props.selectedIndex}
          mode={props.stripMode}
          atLimit={props.atLimit}
          onSelect={props.onSelect}
          onRemove={props.onRemove}
          onAddFiles={props.onAddFiles}
          testImages={props.testImages}
          onTestImage={props.onTestImage}
        />
      </div>
      {/* dock Task 5 */}
    </div>
  )
}

export default MobileShell2D
