// src/components/BatchPanel.tsx
// 批量处理浮动面板:配置 tab(上传/种子策略/格式/开始处理)。
// 结果 tab 画廊与关闭确认是 Task 7、挂载进 App2D 是 Task 8 —— 当前均留占位。
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { getStyle } from '../lib/StyleRegistry'
import { randomSeed } from '../lib/randomSeed'
import { decodeSeed } from '../lib/seedCodec'
import { BATCH_MAX_ROWS, canRunBatch, type BatchJob, type BatchRow } from '../lib/batch/batchJob'
import { createBatchRunner, createCanvasRenderTask } from '../lib/batch/runBatch'

export interface BatchPanelProps {
  job: BatchJob
  setJob: React.Dispatch<React.SetStateAction<BatchJob | null>>
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

// 让出一帧给 React:run 结束时末尾的 setJob 尚未提交,直接复查 jobRef 会读到旧快照。
// 浏览器对齐渲染帧;jsdom(无 rAF)回落 setTimeout,与 runBatch 的 nextFrame 同策略。
const yieldFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0),
  )

/** 种子码内联编辑:非编辑态 <code> + 骰子;编辑态 input,Enter 提交 / Esc 取消。
 *  校验在组件内做(decodeSeed):非法显示错误且不回调 onApply,父层无需重复校验。
 *  骰子能力经 onRandom 注入(返回新种子码),拿到返回值直接走同一 apply 路径。 */
function SeedInput({ seed, onApply, onRandom }: {
  seed: string
  onApply: (s: string) => boolean
  onRandom?: () => string
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(seed)
  const [err, setErr] = useState(false)

  const startEdit = () => {
    setDraft(seed)
    setErr(false)
    setEditing(true)
  }

  const apply = (code: string) => {
    // 非法种子:亮错误、不回调,留在编辑态让用户改
    if (!decodeSeed(code)) {
      setErr(true)
      return
    }
    if (onApply(code)) {
      setEditing(false)
      setErr(false)
    } else {
      setErr(true)
    }
  }

  if (editing) {
    return (
      <span className="batch-seed">
        <input
          className={`batch-seed-input${err ? ' batch-seed-input--err' : ''}`}
          value={draft}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => { setDraft(e.target.value); setErr(false) }}
          onBlur={() => { setEditing(false); setErr(false) }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return  // 输入法组合中的 Enter 不提交
            if (e.key === 'Enter') apply(draft.trim())
            else if (e.key === 'Escape') { setEditing(false); setErr(false) }
          }}
        />
        {err && <span className="batch-seed-error">{t('batch.invalidSeed')}</span>}
      </span>
    )
  }

  return (
    <span className="batch-seed">
      <code className="batch-seed-code" title={t('seed.hint')} onClick={startEdit}>{seed}</code>
      {onRandom && (
        <button type="button" className="batch-icon-btn" onClick={() => apply(onRandom())}
          title={t('common.random')} aria-label={t('common.random')}>
          {dieIcon}
        </button>
      )}
    </span>
  )
}

function BatchPanel({ job, setJob, onClose }: BatchPanelProps) {
  const { t } = useTranslation()
  const { ref: panelRef, pos, onHeaderMouseDown } = useDraggable(
    { x: 90, y: 130 }, 'pixel-forge.panelPos.batch.v1',
  )
  const [tab, setTab] = useState<'config' | 'results'>('config')
  // 处理中点关闭应走确认弹窗(Task 7 接 ConfirmDialog,当前仅保留状态占位)
  const [confirmClose, setConfirmClose] = useState(false)
  const runningRef = useRef(false)
  // 基线在面板创建时定格:批量结果不随主界面后续调参漂移(Task 8 的"替换基线"才更新)
  const runnerRef = useRef(createBatchRunner(createCanvasRenderTask(job.baseline)))
  const fileInputRef = useRef<HTMLInputElement>(null)

  const baselineDef = getStyle(job.baseline.styleId)
  // SVG 导出只对 canvas2d(ASCII)风格开放,与 effectiveFormat 的回退规则一致
  const isBaselineCanvas2d = baselineDef?.renderMode === 'canvas2d'
  const processingCount = job.rows.filter((r) => r.status === 'processing').length
  // runningRef 变化不触发重绘,用行状态兜底:跑首行前的空窗期也能禁用格式切换等操作
  const isRunning = processingCount > 0 || runningRef.current
  const atLimit = job.rows.length >= BATCH_MAX_ROWS

  // drain 的 while 循环要读最新 job(setJob 异步提交),用 ref 规避闭包旧值
  const jobRef = useRef(job)
  useEffect(() => { jobRef.current = job }, [job])

  const patchRow = useCallback((id: string, patch: Partial<BatchRow>) => {
    setJob((j) => {
      if (!j) return j
      return { ...j, rows: j.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
    })
  }, [setJob])

  // done 时建 objectUrl、移除/重跑时 revoke —— objectUrl 生命周期统一在此管理
  const updateRow = useCallback((id: string, patch: Partial<BatchRow>) => {
    if (patch.status === 'done' && patch.blob) {
      patch.objectUrl = URL.createObjectURL(patch.blob)
    }
    patchRow(id, patch)
  }, [patchRow])

  const drain = useCallback(async () => {
    // 串行守卫:runner 的 run 会重置共享 cancelled 标志,并发调用会互相取消,
    // 所有触发路径(开始处理/重试/重骰)都必须先过这道闸再进 while
    if (runningRef.current) return
    runningRef.current = true
    try {
      // run 只吃 pending/failed 行;循环直到没有 pending(处理中新追加的行自动续跑)
      while (true) {
        const j = jobRef.current
        if (!j) break
        // 只盯 pending:failed 行交给结果 tab 的显式"重试",
        // 否则持续失败的行会让本循环无限重跑
        if (!j.rows.some((r) => r.status === 'pending')) break
        await runnerRef.current.run(j, { onRowUpdate: updateRow })
        await yieldFrame()  // 等 React 提交 + jobRef 同步后再复查,避免整批重跑
      }
    } finally {
      runningRef.current = false
    }
  }, [updateRow])

  const startProcessing = useCallback(() => {
    if (!canRunBatch(job.rows.length)) return
    setTab('results')
    // 先查 runningRef 再调 drain(串行契约);已在跑时新行由 while 循环接走
    if (!runningRef.current) void drain()
  }, [job.rows.length, drain])

  const addFiles = useCallback((files: FileList | File[]) => {
    const room = BATCH_MAX_ROWS - jobRef.current.rows.length
    const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room))
    for (const file of list) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          setJob((j) => {
            if (!j) return j
            if (j.rows.length >= BATCH_MAX_ROWS) return j   // 并发读完可能超限,updater 里再守一次
            return { ...j, rows: [...j.rows, {
              id: crypto.randomUUID(), fileName: file.name, image: img,
              seedOverride: null, status: 'pending', blob: null, objectUrl: null, error: null,
            }] }
          })
        }
        img.onerror = () => console.warn(`[batch] ${t('batch.uploadFailed', { name: file.name })}`)
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }, [setJob, t])

  const removeRow = useCallback((id: string) => {
    setJob((j) => {
      if (!j) return j
      const row = j.rows.find((r) => r.id === id)
      if (row?.objectUrl) URL.revokeObjectURL(row.objectUrl)
      return { ...j, rows: j.rows.filter((r) => r.id !== id) }
    })
  }, [setJob])

  const randomizeAll = useCallback(() => {
    const j = jobRef.current
    if (!j || !baselineDef) return
    setJob((cur) => cur ? {
      ...cur,
      rows: cur.rows.map((r) => ({ ...r, seedOverride: randomSeed(baselineDef, cur.baseline.params, cur.baseline.textParams) })),
    } : cur)
  }, [baselineDef, setJob])

  // 供 SeedInput 骰子:以基线参数为底随机一个种子码;读 jobRef 保证拿到最新基线
  const randomBaselineSeed = useCallback((): string => {
    const j = jobRef.current
    const def = baselineDef ?? getStyle(j.baseline.styleId)
    if (!def) return j.unifiedSeed   // 风格缺失(理论不可达):退回现值,别让骰子崩面板
    return randomSeed(def, j.baseline.params, j.baseline.textParams)
  }, [baselineDef])

  return (
    <div
      className="param-panel batch-panel"
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // 面板全域拦掉默认行为:拖放脱靶时浏览器会直接打开图片、丢掉整个页面状态
        e.preventDefault()
        if (tab === 'config') addFiles(e.dataTransfer.files)
      }}
    >
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('batch.title')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-close" onClick={() => (isRunning ? setConfirmClose(true) : onClose())}>x</button>
          </div>
        </div>
      </div>
      <div className="param-panel-body">
        <div className="batch-tabs">
          <button className={`batch-tab ${tab === 'config' ? 'batch-tab--active' : ''}`} onClick={() => setTab('config')}>{t('batch.tabConfig')}</button>
          <button className={`batch-tab ${tab === 'results' ? 'batch-tab--active' : ''}`} onClick={() => setTab('results')}>{t('batch.tabResults')}</button>
        </div>
        {tab === 'config' ? (
          <div className="batch-config">
            <div className="batch-config-toolbar">
              <button className="batch-btn" onClick={() => fileInputRef.current?.click()} disabled={atLimit}>
                {t('batch.add')}
              </button>
              {atLimit && <span className="batch-limit-hint">{t('batch.limitReached', { n: BATCH_MAX_ROWS })}</span>}
              <label className="batch-format">
                {t('batch.format')}
                <select value={job.format} onChange={(e) => setJob((j) => j ? { ...j, format: e.target.value as BatchJob['format'] } : j)} disabled={isRunning}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  {isBaselineCanvas2d && <option value="svg">SVG</option>}
                </select>
              </label>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
            <div className="batch-seed-mode">
              <button className={`batch-tab ${job.seedMode === 'unified' ? 'batch-tab--active' : ''}`}
                onClick={() => setJob((j) => j ? { ...j, seedMode: 'unified' } : j)}>{t('batch.seedModeUnified')}</button>
              <button className={`batch-tab ${job.seedMode === 'perImage' ? 'batch-tab--active' : ''}`}
                onClick={() => setJob((j) => j ? { ...j, seedMode: 'perImage' } : j)}>{t('batch.seedModePerImage')}</button>
            </div>
            {job.seedMode === 'unified' ? (
              <div className="batch-unified-seed">
                <span>{t('batch.unifiedSeed')}</span>
                <SeedInput seed={job.unifiedSeed} onApply={(s) => {
                  setJob((j) => j ? { ...j, unifiedSeed: s } : j)
                  return true
                }} onRandom={randomBaselineSeed} />
              </div>
            ) : (
              <button className="batch-btn" onClick={randomizeAll}>{t('batch.randomizeAll')}</button>
            )}
            <div className="batch-rows">
              {job.rows.length === 0 && <div className="batch-empty">{t('batch.empty')}</div>}
              {job.rows.map((row) => (
                <div key={row.id} className="batch-row">
                  <img className="batch-row-thumb" src={row.image.src} alt={row.fileName} />
                  <span className="batch-row-name" title={row.fileName}>{row.fileName}</span>
                  {job.seedMode === 'perImage' && (
                    <SeedInput seed={row.seedOverride ?? job.unifiedSeed} onApply={(s) => { patchRow(row.id, { seedOverride: s }); return true }} onRandom={randomBaselineSeed} />
                  )}
                  <button className="batch-icon-btn" title={t('batch.remove')} aria-label={t('batch.remove')} onClick={() => removeRow(row.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button className="batch-btn batch-btn--primary" onClick={startProcessing} disabled={!canRunBatch(job.rows.length)}>
              {t('batch.start', { n: job.rows.length })}
            </button>
          </div>
        ) : (
          // 结果 tab(画廊/重试/重骰/ZIP 下载)—— Task 7 实现
          null
        )}
      </div>
      {/* 关闭确认弹窗 —— Task 7 接 ConfirmDialog */}
      {confirmClose && null}
    </div>
  )
}

export default BatchPanel
