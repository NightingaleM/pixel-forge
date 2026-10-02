// src/components/MobileShell2D.tsx
// 移动端(≤767px)2D 外壳(Task 4 骨架 + Task 5 dock/会员圆标):顶栏(返回 +
// 风格名占位钮 + 对比钮 + 会员小圆标)+ 画布区(CompareSlider / 上传页)+
// 图片条(ImageStrip)+ 底部 dock(下载主键 + 参数/随机/批量图标键)。布局与
// safe-area/dvh 基建在 styles/mobile.css;props 全部由 App2D 分流透传,行状态/
// 渲染管线仍归 App2D,本组件纯视图。Task 6 把风格名钮换成 sheet 触发并把重置
// 收进参数 sheet,届时再消费 styles/onStyleChange/onReset。
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
  // 顶栏(风格名按钮 Task 6 换成 sheet 触发;onStyleChange 届时随 sheet 消费)
  styles: { id: string }[]
  activeStyle: StyleId
  onStyleChange: (id: StyleId) => void
  licenseActive: boolean
  onOpenLicense: () => void
  // dock(Task 5):下载三键接 App2D 既有导出 handlers;onReset Task 6 收进参数
  // sheet 时消费,onOpenParams/onOpenBatch 本任务由 App2D 传空实现占位
  onDownloadPng: () => void
  onDownloadJpg: () => void
  onDownloadSvg: () => void
  onReset: () => void
  onRandom: () => void
  onOpenParams: () => void
  onOpenBatch: () => void
  imageInfo: { width: number; height: number; size: string } | null
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
        {/* 顶栏会员小圆标:无文字,未激活灰环,激活点亮 */}
        <button
          className={`m-member-dot ${props.licenseActive ? 'm-member-dot--on' : ''}`}
          onClick={props.onOpenLicense}
          title={t('license.badge')}
          aria-label={t('license.badge')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 13l2.5 2 1.5-4 1.5 4 2.5-2" />
          </svg>
        </button>
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
      {/* dock:下载为主按钮 + 参数/随机/批量图标键;重置收进参数 sheet(Task 6) */}
      <div className="m-dock">
        {props.renderMode === 'canvas2d' ? (
          <>
            {/* canvas2d(ASCII)与桌面 ActionBar 同规则:JPG/PNG/SVG 三键替换渲染,SVG 主键 */}
            <button className="m-dock-btn" onClick={props.onDownloadJpg}>{t('export.jpg')}</button>
            <button className="m-dock-btn" onClick={props.onDownloadPng}>{t('export.png')}</button>
            <button className="m-dock-btn m-dock-btn--primary" onClick={props.onDownloadSvg}>{t('export.svg')}</button>
          </>
        ) : (
          <button className="m-dock-btn m-dock-btn--primary" onClick={props.onDownloadPng}>{t('common.download')}</button>
        )}
        <button className="m-dock-btn" onClick={props.onOpenParams}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {/* 滑杆图标:两根横线各带圆钮 */}
            <line x1="4" y1="7" x2="20" y2="7" /><circle cx="9" cy="7" r="2.4" fill="#FFF" />
            <line x1="4" y1="17" x2="20" y2="17" /><circle cx="15" cy="17" r="2.4" fill="#FFF" />
          </svg>
          <span>{t('mobile.params')}</span>
        </button>
        <button className="m-dock-btn" onClick={props.onRandom}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {/* 骰子:方框+点 */}
            <rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.3" fill="currentColor" /><circle cx="15" cy="15" r="1.3" fill="currentColor" /><circle cx="15" cy="9" r="1.3" fill="currentColor" />
          </svg>
          <span>{t('common.random')}</span>
        </button>
        <button className="m-dock-btn" onClick={props.onOpenBatch}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            {/* 双叠加方块(与桌面批量同语义) */}
            <rect x="3" y="3" width="10" height="10" rx="2" /><rect x="11" y="11" width="10" height="10" rx="2" />
          </svg>
          <span>{t('batch.apply')}</span>
        </button>
      </div>
    </div>
  )
}

export default MobileShell2D
