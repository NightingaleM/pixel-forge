// src/components/MobileShell2D.tsx
// 移动端(≤767px)2D 外壳(Task 4 骨架 + Task 5 dock/会员圆标 + Task 6 sheets +
// Task 8 批量层):顶栏(返回 + 风格名钮触发风格 sheet + 对比钮 + 会员小圆标)+
// 画布区(CompareSlider / 上传页)+ 图片条(ImageStrip)+ 底部 dock(下载主键 +
// 参数/随机/批量图标键)。
// Task 6:dock「参数」与顶栏风格名各自触发 BottomSheet——参数 sheet 内嵌
// ParamPanel(embedded)并把重置/随机收进 m-params-actions;风格 sheet 为
// m-style-row 列表(label/description 已由 App2D 做 i18n,本组件不 t() 内容文案,
// 仅 t() 界面固定文案)。批量面板经 batchPanel prop 挂入 BottomSheet(验收 #1)
// 全屏层。布局与 safe-area/dvh 基建在 styles/mobile.css;props
// 全部由 App2D 分流透传,行状态/渲染管线仍归 App2D,本组件纯视图 + sheet 开合状态。
import { useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CompareSlider } from './CompareSlider'
import ImageStrip, { type ImageStripProps } from './ImageStrip'
import ImageUploader from './ImageUploader'
import ParamPanel from './ParamPanel'
import BottomSheet from './BottomSheet'
import type { ParamDef, StyleId } from '../types'

/** 参数 sheet 数据:镜像 App2D 给桌面 ParamPanel 的全部实参(top 为
 *  SeedBar/BuiltInPresetBar/PresetBar 三件 JSX,由 App2D 组装传入)。 */
export interface MobileParamPanelProps {
  title: string
  description?: string
  params: ParamDef[]
  values: Record<string, number>
  textValues: Record<string, string>
  onChange: (uniform: string, value: number) => void
  onTextChange: (uniform: string, value: string) => void
  fontValues: Record<string, FontFace | null | undefined>
  onFontChange: (uniform: string, font: FontFace | null) => void
  onRandom: () => void
  onReset: () => void
  top: ReactNode
}

/** 风格 sheet 行:id/label/description 均由 App2D 组装(桌面 StyleSelector 同规则)。 */
export interface MobileStyleItem {
  id: StyleId
  label: string
  description?: string
}

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
  // 顶栏:风格名钮触发风格 sheet,行点击走 onStyleChange
  activeStyle: StyleId
  onStyleChange: (id: StyleId) => void
  styleLabel: string
  styleItems: MobileStyleItem[]
  licenseActive: boolean
  onOpenLicense: () => void
  // dock:下载三键接 App2D 既有导出 handlers;随机与参数 sheet 内按钮同源;
  // 重置收进参数 sheet(paramPanel.onReset);批量键走 App2D handleBatchOpen
  onDownloadPng: () => void
  onDownloadJpg: () => void
  onDownloadSvg: () => void
  onRandom: () => void
  onOpenBatch: () => void
  imageInfo: { width: number; height: number; size: string } | null
  // 参数 sheet 数据(无图时 null,dock「参数」无动作——与桌面 ParamPanel 只在
  // 有图时渲染同语义)
  paramPanel: MobileParamPanelProps | null
  // 批量全屏层(Task 8):App2D 组装的 <BatchPanel variant="mobile" />(全套
  // props 都是 App2D 状态,组装留在那边);null/false=不开,开时包进 BottomSheet
  // 从底部展开(用户验收反馈 #1);dismissible=false——关闭走面板内 x(运行中须确认)
  batchPanel: ReactNode | null
  /** BottomSheet 的 onClose 兜底(dismissible=false 时不触发,保留接线) */
  onBatchClose: () => void
}

function MobileShell2D(props: MobileShell2DProps) {
  const { t } = useTranslation()
  // sheet 状态机:params(参数)/style(风格)/null(关);开合归本组件,
  // 数据与回调全由 App2D 透传
  const [sheet, setSheet] = useState<'params' | 'style' | null>(null)
  const p = props.paramPanel
  return (
    <div className="m-app">
      <div className="m-topbar">
        <Link to="/" aria-label={t('common.backToHome')}>←</Link>
        {/* 风格名钮 = 风格 sheet 触发 */}
        <button type="button" className="m-style-btn" onClick={() => setSheet('style')}>{props.styleLabel}</button>
        <div className="m-topbar-spacer" style={{ flex: 1 }} />
        {/* 对比入口只留画布上 CompareSlider 的浮动按钮(用户反馈:顶栏与画布两处重复) */}
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
      {/* dock:下载为主按钮 + 参数/随机/批量图标键;参数键直接开参数 sheet */}
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
        {/* 无图时 paramPanel 为 null:sheet 不置位,否则传图后 p 变非空、参数 sheet 自己弹出 */}
        <button className="m-dock-btn" onClick={() => { if (p) setSheet('params') }}>
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
      {/* 参数 sheet:重置/随机收进顶部 m-params-actions(与种子/预设同区),
          top 三件套 + ParamPanel embedded 填满 sheet body */}
      {sheet === 'params' && p && (
        <BottomSheet open onClose={() => setSheet(null)} title={p.title}>
          <div className="m-params-actions">
            <button type="button" className="m-mini-btn" onClick={p.onReset}>{t('common.reset')}</button>
            <button type="button" className="m-mini-btn" onClick={p.onRandom}>{t('common.random')}</button>
          </div>
          {p.top}
          <ParamPanel
            embedded
            params={p.params}
            values={p.values}
            textValues={p.textValues}
            onChange={p.onChange}
            onTextChange={p.onTextChange}
            fontValues={p.fontValues}
            onFontChange={p.onFontChange}
          />
        </BottomSheet>
      )}
      {/* 风格 sheet:行点击 = 切风格 + 关 sheet;当前风格高亮 */}
      {sheet === 'style' && (
        <BottomSheet open onClose={() => setSheet(null)} title={t('app2d.style')}>
          {props.styleItems.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`m-style-row${s.id === props.activeStyle ? ' m-style-row--on' : ''}`}
              onClick={() => {
                props.onStyleChange(s.id)
                setSheet(null)
              }}
            >
              <span className="m-style-row-label">{s.label}</span>
              {s.description && <span className="m-style-row-desc">{s.description}</span>}
            </button>
          ))}
        </BottomSheet>
      )}
      {/* 批量 sheet:与参数/风格 sheet 完全同款交互(把手拖拽两档+遮罩关闭),
          peek 起步可拖 full;关闭经 onBatchClose(App2D 侧运行中先弹确认,验收 #1
          语义保留)。BatchPanel(variant=mobile)由 App2D 组装传入,面板内不再渲染
          桌面浮窗标题条 */}
      {props.batchPanel && (
        <BottomSheet open onClose={props.onBatchClose} title={t('batch.title')} sheetClassName="m-sheet--batch">
          {props.batchPanel}
        </BottomSheet>
      )}
    </div>
  )
}

export default MobileShell2D
