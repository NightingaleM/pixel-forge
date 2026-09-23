// src/components/BatchPanel.tsx
// v2 批量面板:纯 props 视图。配置 tab(格式/种子模式/全部随机/开始处理)+
// 结果 tab(进度/画廊/重试/重骰/单张与 ZIP 下载/灯箱)。行状态(images)与队列
// 调度(runner/drain)的唯一所有者是 App2D,本组件不持业务状态,全部经回调上交。
// 种子编辑回归主界面 SeedBar(ParamPanel 顶部),面板内不再有种子位与行列表。
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { getStyle } from '../lib/StyleRegistry'
import { canRunBatch, type BatchFormat } from '../lib/batch/batchJob'
import { blobExt, type BatchImage } from '../lib/batch/imageList'
import type { StyleId } from '../types'
import Lightbox, { type LightboxItem } from './Lightbox'
import ConfirmDialog from './ConfirmDialog'

export type BatchSeedMode = 'unified' | 'perImage'

export interface BatchPanelProps {
  /** 行状态全集(含 done 结果),由 App2D 持有;结果 tab 直接按行渲染 */
  images: BatchImage[]
  seedMode: BatchSeedMode
  format: BatchFormat
  /** svg 选项只对 canvas2d(ASCII)风格开放,与 effectiveFormat 回退规则一致 */
  activeStyleId: StyleId
  isRunning: boolean
  onSeedModeChange: (m: BatchSeedMode) => void
  onFormatChange: (f: BatchFormat) => void
  onRandomizeAll: () => void
  onStart: () => void
  onRetryRow: (id: string) => void
  onRerollRow: (id: string) => void
  onDownloadRow: (img: BatchImage) => void
  onDownloadZip: () => void
  /** 确定性关闭:运行中须先经确认弹窗再调;App2D 侧终止队列并收面板(不清图片) */
  onClose: () => void
}

// 骰子图标(圆角方 + 对角三点),与 ParamPanel/SeedBar 的手绘 SVG 风格一致(禁 emoji)
const dieIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

function BatchPanel({
  images,
  seedMode,
  format,
  activeStyleId,
  isRunning,
  onSeedModeChange,
  onFormatChange,
  onRandomizeAll,
  onStart,
  onRetryRow,
  onRerollRow,
  onDownloadRow,
  onDownloadZip,
  onClose,
}: BatchPanelProps) {
  const { t } = useTranslation()
  const { ref: panelRef, pos, onHeaderMouseDown } = useDraggable(
    { x: 90, y: 130 }, 'pixel-forge.panelPos.batch.v1',
  )
  const [tab, setTab] = useState<'config' | 'results'>('config')
  // 最小化:收成标题条只留头部,批量任务后台继续跑;与 ParamPanel/PresetPanel 的折叠 affordance 一致
  const [collapsed, setCollapsed] = useState(false)
  // 处理中点关闭应走确认弹窗(终止在 App2D 侧执行);灯箱记录的是"已完成行列表"的序号
  const [confirmClose, setConfirmClose] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // SVG 导出只对 canvas2d(ASCII)风格开放,与 effectiveFormat 的回退规则一致
  const isStyleCanvas2d = getStyle(activeStyleId)?.renderMode === 'canvas2d'
  const doneCount = images.filter((r) => r.status === 'done').length
  const failedCount = images.filter((r) => r.status === 'failed').length

  // 灯箱只陈列"已完成且有 objectUrl"的行:index 用该列表内的序号(Lightbox 只夹上界,
  // 负数/越界会取错项);行被重骰/移除时列表收缩,渲染处的 Math.min 再兜一次底
  const doneRows = useMemo(() => images.filter((r) => r.status === 'done' && r.objectUrl), [images])
  const lightboxItems: LightboxItem[] = useMemo(() => doneRows.map((r) => ({
    objectUrl: r.objectUrl!,
    fileName: r.fileName,
    // done 行必有 renderedSeed(run 的 done patch 定格快照),按生成时刻标注
    seed: r.renderedSeed ?? '',
    ext: r.blob ? blobExt(r.blob) : '',
  })), [doneRows])
  const doneIdxById = useMemo(() => new Map(doneRows.map((r, i) => [r.id, i])), [doneRows])

  return (
    <div
      className="param-panel batch-panel"
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // 面板全域拦掉默认行为:拖放脱靶时浏览器会直接打开图片、丢掉整个页面状态。
        // v2 图片入口统一在底部栏 [+]/上传页,面板自身不再接收文件
        e.preventDefault()
      }}
    >
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('batch.title')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-collapse" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? '▸' : '▾'}
            </button>
            <button className="param-panel-close" onClick={() => (isRunning ? setConfirmClose(true) : onClose())}>x</button>
          </div>
        </div>
      </div>
      {/* 折叠时隐藏面板主体(队列在 App2D,面板显示与否不影响处理) */}
      {!collapsed && (
      <div className="param-panel-body">
        <div className="batch-tabs">
          <button className={`batch-tab ${tab === 'config' ? 'batch-tab--active' : ''}`} onClick={() => setTab('config')}>{t('batch.tabConfig')}</button>
          <button className={`batch-tab ${tab === 'results' ? 'batch-tab--active' : ''}`} onClick={() => setTab('results')}>{t('batch.tabResults')}</button>
        </div>
        {tab === 'config' ? (
          <div className="batch-config">
            {/* 单图开面板(spec 字面:打开并提示可继续追加)——底部栏 [+] 可加图进批量 */}
            {images.length === 1 && <div className="batch-hint">{t('batch.addMoreHint')}</div>}
            <label className="batch-format">
              {t('batch.format')}
              <select value={format} onChange={(e) => onFormatChange(e.target.value as BatchFormat)} disabled={isRunning}>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                {isStyleCanvas2d && <option value="svg">SVG</option>}
              </select>
            </label>
            <div className="batch-seed-mode">
              <button className={`batch-tab ${seedMode === 'unified' ? 'batch-tab--active' : ''}`}
                onClick={() => onSeedModeChange('unified')}>{t('batch.seedModeUnified')}</button>
              <button className={`batch-tab ${seedMode === 'perImage' ? 'batch-tab--active' : ''}`}
                onClick={() => onSeedModeChange('perImage')}>{t('batch.seedModePerImage')}</button>
            </div>
            <button className="batch-btn" onClick={onRandomizeAll}>{t('batch.randomizeAll')}</button>
            {/* 运行中禁用:再点开始会以新快照整批重跑,与"等本轮结束再重跑"的既有语义冲突 */}
            <button className="batch-btn batch-btn--primary" onClick={() => { setTab('results'); onStart() }} disabled={isRunning || !canRunBatch(images.length)}>
              {t('batch.start', { n: images.length })}
            </button>
          </div>
        ) : (
          <div className="batch-results">
            <div className="batch-progress-row">
              <div className="batch-progress">
                <div className="batch-progress-fill" style={{ width: `${images.length ? ((doneCount + failedCount) / images.length) * 100 : 0}%` }} />
              </div>
              <span className="batch-progress-label">
                {t('batch.processing', { done: doneCount + failedCount, total: images.length })}
                {failedCount > 0 && ` · ${t('batch.failedCount', { n: failedCount })}`}
              </span>
            </div>
            <div className="batch-gallery">
              {images.map((row) => (
                <div key={row.id} className={`batch-cell batch-cell--${row.status}`}>
                  {row.status === 'done' && row.objectUrl ? (
                    <img src={row.objectUrl} alt={row.fileName} onClick={() => setLightboxIdx(doneIdxById.get(row.id)!)} />
                  ) : row.status === 'processing' ? (
                    <div className="batch-spinner" />
                  ) : row.status === 'failed' ? (
                    <div className="batch-cell-msg">
                      <span className="batch-cell-err" title={row.error ?? ''}>{t('batch.retry')}</span>
                      <button className="batch-icon-btn" title={t('batch.retry')} aria-label={t('batch.retry')}
                        onClick={() => onRetryRow(row.id)}>
                        {/* 环形重试箭头 */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 3-6.7" />
                          <path d="M3 4v5h5" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="batch-cell-msg"><span>{t('batch.pending')}</span></div>
                  )}
                  {row.status === 'done' && (
                    <div className="batch-cell-actions">
                      <button className="batch-icon-btn" title={t('batch.reroll')} aria-label={t('batch.reroll')} onClick={() => onRerollRow(row.id)}>{dieIcon}</button>
                      <button className="batch-icon-btn" title={t('batch.downloadOne')} aria-label={t('batch.downloadOne')} onClick={() => onDownloadRow(row)}>
                        {/* 下载箭头 */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className="batch-btn batch-btn--primary" onClick={onDownloadZip} disabled={doneCount === 0}>
              {t('batch.downloadZip', { n: doneCount })}
            </button>
          </div>
        )}
      </div>
      )}
      {/* 灯箱按"已完成行"打开:格子点击传 done 序号,列表收缩时 clamp 上界 */}
      {lightboxIdx !== null && lightboxItems.length > 0 && (
        <Lightbox
          items={lightboxItems}
          index={Math.min(lightboxIdx, lightboxItems.length - 1)}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}
      {/* 处理中关闭:确认后走 onClose(App2D 终止队列 + 收面板,不清图片列表) */}
      {confirmClose && (
        <ConfirmDialog
          message={t('batch.closeConfirm')}
          confirmLabel={t('batch.confirmClose')}
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </div>
  )
}

export default BatchPanel
