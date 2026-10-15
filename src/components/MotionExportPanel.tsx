// src/components/MotionExportPanel.tsx
// 万花筒动效 + 动图导出面板(wayfinder kaleido-motion spec §3,原型 lab v2 用户判定布局)。
// 纯受控组件:状态与导出副作用全在 App2D,本组件只做展示与回调。
// 桌面挂 ParamPanel bottom 插槽,移动端挂参数 sheet(两壳同构,宽 100%)。
import { useTranslation } from 'react-i18next'
import type { ExportAction, ExportFormat, ExportPhase } from '../lib/motion/exportState'
import type { GifSettingsUi, MotionParamUiState, MotionUiState } from '../lib/motion/kaleidoMotion'
import { GIF_FPS_OPTIONS, GIF_SIZE_OPTIONS, MOTION_PARAM_KEYS } from '../lib/motion/kaleidoMotion'
import type { VideoTier } from '../lib/motion/videoTier'

/** 三参数范围(与 StyleRegistry kaleidoscope 定义一致)。 */
const PARAM_RANGE = {
  zoom: { min: 0.1, max: 5, step: 0.01 },
  centerX: { min: -1, max: 1, step: 0.01 },
  centerY: { min: -1, max: 1, step: 0.01 },
} as const

/** 漂移速度滑杆:±0.6/s 步 0.01(spec §3 定案)。 */
const SPEED_RANGE = { min: -0.6, max: 0.6, step: 0.01 }

type ParamKey = (typeof MOTION_PARAM_KEYS)[number]
const PARAM_KEYS = MOTION_PARAM_KEYS
const PARAM_LABEL_KEY: Record<ParamKey, string> = {
  zoom: 'style.kaleidoscope.zoom',
  centerX: 'style.kaleidoscope.centerX',
  centerY: 'style.kaleidoscope.centerY',
}

export interface MotionExportView {
  phase: ExportPhase
  format: ExportFormat
  framesDone: number
  framesTotal: number
  bytesSoFar: number
  estimatedBytes: number | null
  errorMessage: string | null
  gif: GifSettingsUi
  /** null = 检测中,'none' = 禁用视频档(两级探测均落空)。 */
  videoTier: VideoTier | null
  /** 导出前预估(格式相关);编码中由 estimatedBytes 接管。 */
  preEstimateBytes: number
  preEstimateFrames: number
  /** GIF 档吸附提示行数据(漂移参数的有效速度;空数组=无漂移)。 */
  gifAligned: Array<{ axis: 'X' | 'Y'; speed: number }>
  /** 可导出(动效开 + 任一非静止 + 有图 + 非导出中)。 */
  canExport: boolean
  /** 导出中禁用动效参数编辑。 */
  motionLocked: boolean
}

interface MotionExportPanelProps {
  motion: MotionUiState
  onMotionChange: (next: MotionUiState) => void
  view: MotionExportView
  onFormatChange: (f: ExportFormat) => void
  onGifChange: (patch: Partial<GifSettingsUi>) => void
  onStartExport: () => void
  onCancelExport: () => void
  onResetExport: (a: ExportAction) => void
  /** 三参数静态值(uZoom/uCenterX/uCenterY 当前值):面板迁移到独立浮窗后,
   *  静态滑条是浮窗开着时这些参数的唯一编辑入口(动效起点 A 同源)。 */
  staticValues: Record<ParamKey, number>
  onStaticChange: (key: ParamKey, v: number) => void
}

function fmtBytes(b: number): string {
  return b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`
}

export default function MotionExportPanel(props: MotionExportPanelProps) {
  const { t } = useTranslation()
  const { motion, view, onMotionChange, staticValues, onStaticChange } = props
  const locked = view.motionLocked

  const setParam = (key: ParamKey, patch: Partial<MotionParamUiState>) => {
    if (locked) return
    onMotionChange({ ...motion, params: { ...motion.params, [key]: { ...motion.params[key], ...patch } } })
  }

  const animating = view.canExport || motion.on
  const exporting = view.phase === 'encoding' || view.phase === 'canceling'

  return (
    <div className="motion-panel">
      {/* ===== 动效卡 ===== */}
      <section className="motion-card" aria-label={t('motion.title')}>
        <div className="motion-enable">
          <div className="motion-enable-text">
            <span className="motion-title">
              {/* 手绘 SVG:正弦波+循环箭头(动效入口标识) */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 15c2.7-6.5 5.3-6.5 8 0s5.3 6.5 8 0" />
                <path d="M17.5 3.2a8.2 8.2 0 0 1 4.2 4.3" />
                <path d="M21.7 3.4v4.1h-4.1" />
              </svg>
              {t('motion.title')}
            </span>
            <span className="motion-sub">{t('motion.enableHint')}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={motion.on}
            className={`motion-switch${motion.on ? ' on' : ''}${locked ? ' locked' : ''}`}
            disabled={locked}
            onClick={() => !locked && onMotionChange({ ...motion, on: !motion.on })}
          >
            <span className="motion-switch-knob" />
          </button>
        </div>

        {/* 三参数静态值滑条常驻(开关关时也在此编辑——浮窗开着时这里是唯一入口);
         *  类型 select/B 值/速度/时长只在与预览联动时有意义,随开关显隐 */}
        <div className="motion-body">
          {PARAM_KEYS.map((key) => {
            const p = motion.params[key]
            const range = PARAM_RANGE[key]
            return (
              <div key={key} className="motion-pblock">
                <div className="motion-prow">
                  <span className="motion-pname">{t(PARAM_LABEL_KEY[key])}</span>
                  <b className="motion-mini-val">{staticValues[key].toFixed(2)}</b>
                </div>
                <input
                  type="range"
                  className="param-slider motion-slider motion-static-slider"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={staticValues[key]}
                  onInput={(e) => onStaticChange(key, parseFloat((e.target as HTMLInputElement).value))}
                />
                {motion.on && (
                  <div className="motion-pline">
                    <div className="motion-mini">
                      <span className="motion-mini-label">{t('motion.typeLabel')}</span>
                      <select
                        className="motion-select"
                        value={p.type}
                        disabled={locked}
                        onChange={(e) => {
                          const type = e.target.value as MotionParamUiState['type']
                          // 缩放无单向漂移(无法无缝循环),select 不提供该项
                          setParam(key, { type })
                        }}
                      >
                        <option value="static">{t('motion.type.static')}</option>
                        <option value="pingpong">{key === 'zoom' ? t('motion.type.pingpongZoom') : t('motion.type.pingpong')}</option>
                        {key !== 'zoom' && <option value="drift">{t('motion.type.drift')}</option>}
                      </select>
                    </div>
                  </div>
                )}
                {motion.on && p.type === 'pingpong' && (
                  <div className="motion-pline">
                    <div className="motion-mini">
                      <span className="motion-mini-label">{t('motion.endB')}</span>
                      <input
                        type="range"
                        className="param-slider motion-slider"
                        min={range.min}
                        max={range.max}
                        step={range.step}
                        value={p.b}
                        disabled={locked}
                        onInput={(e) => setParam(key, { b: parseFloat((e.target as HTMLInputElement).value) })}
                      />
                      <b className="motion-mini-val">{p.b.toFixed(2)}</b>
                    </div>
                    <div className="motion-mini-hint">{t('motion.startAHint')}</div>
                  </div>
                )}
                {motion.on && p.type === 'drift' && (
                  <div className="motion-pline">
                    <div className="motion-mini">
                      <span className="motion-mini-label">{t('motion.speed')}</span>
                      <input
                        type="range"
                        className="param-slider motion-slider"
                        min={SPEED_RANGE.min}
                        max={SPEED_RANGE.max}
                        step={SPEED_RANGE.step}
                        value={p.speed}
                        disabled={locked}
                        onInput={(e) => setParam(key, { speed: parseFloat((e.target as HTMLInputElement).value) })}
                      />
                      <b className="motion-mini-val">{p.speed >= 0 ? '+' : ''}{p.speed.toFixed(2)}</b>
                    </div>
                    <div className="motion-mini-hint">{t('motion.driftHint')}</div>
                  </div>
                )}
              </div>
            )
          })}
          {motion.on && (
            <div className="motion-pblock">
              <div className="motion-mini">
                <span className="motion-mini-label">{t('motion.duration')}</span>
                <input
                  type="range"
                  className="param-slider motion-slider"
                  min={1}
                  max={10}
                  step={0.5}
                  value={motion.duration}
                  disabled={locked}
                  onInput={(e) => !locked && onMotionChange({ ...motion, duration: parseFloat((e.target as HTMLInputElement).value) })}
                />
                <b className="motion-mini-val">{motion.duration.toFixed(1)} s</b>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== 导出卡 ===== */}
      <section className="motion-card motion-export" aria-label={t('animExport.title')}>
        <div className="motion-export-title">{t('animExport.title')}</div>
        {!animating && <div className="motion-offhint">{t('animExport.offHint')}</div>}
        <fieldset className="motion-fieldset" disabled={!view.canExport}>
          <div className="motion-fmt">
            <label className={`motion-fmt-opt${view.format === 'gif' ? ' cur' : ''}`}>
              <input
                type="radio"
                name="anim-format"
                checked={view.format === 'gif'}
                disabled={exporting}
                onChange={() => props.onFormatChange('gif')}
              />
              <span className="motion-fmt-name">
                {/* 手绘 SVG:GIF 标识(相框+折线波形) */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M6.5 14.5l3-3.5 2.5 2.5 3-4 2.5 3.5" />
                </svg>
                {t('animExport.format.gif')}
              </span>
              <span className="motion-fmt-desc">
                {view.gif.size}px · {view.gif.fps}fps · {t('animExport.oneLoop')}({motion.duration.toFixed(1)}s)
              </span>
            </label>
            <label className={`motion-fmt-opt${view.format === 'video' ? ' cur' : ''}${view.videoTier === 'none' ? ' na' : ''}`}>
              <input
                type="radio"
                name="anim-format"
                checked={view.format === 'video'}
                disabled={exporting || view.videoTier === 'none'}
                onChange={() => props.onFormatChange('video')}
              />
              <span className="motion-fmt-name">
                {/* 手绘 SVG:视频标识(播放三角) */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="12.5" height="14" rx="2.5" />
                  <path d="M15.5 9.5l5.5-3v11l-5.5-3z" />
                </svg>
                {t('animExport.format.video')}
              </span>
              <span className="motion-fmt-desc">
                {view.videoTier === 'none'
                  ? t('animExport.videoUnsupported')
                  : `720p · 30fps · ${t('animExport.twoLoops')}(${(motion.duration * 2).toFixed(1)}s)` +
                    (view.videoTier === 'mediarecorder-mp4' ? ' · MP4' : view.videoTier === 'mediarecorder-webm' ? ' · WebM' : '')}
              </span>
            </label>
          </div>

          {/* 高级自定义:仅 GIF(视频仅预设档,spec §1) */}
          {view.format === 'gif' && !exporting && (
            <details className="motion-adv">
              <summary>{t('animExport.custom')}</summary>
              <div className="motion-adv-grid">
                <label className="motion-adv-cell">
                  <span>{t('animExport.size')}</span>
                  <select value={view.gif.size} disabled={exporting} onChange={(e) => props.onGifChange({ size: parseInt(e.target.value, 10) })}>
                    {GIF_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}px</option>)}
                  </select>
                </label>
                <label className="motion-adv-cell">
                  <span>{t('animExport.fps')}</span>
                  <select value={view.gif.fps} disabled={exporting} onChange={(e) => props.onGifChange({ fps: parseInt(e.target.value, 10) })}>
                    {GIF_FPS_OPTIONS.map((f) => <option key={f} value={f}>{f} fps</option>)}
                  </select>
                </label>
              </div>
            </details>
          )}

          {/* GIF 档吸附提示行(仅 GIF + 有漂移参数,spec §3) */}
          {view.format === 'gif' && view.gifAligned.length > 0 && (
            <div className="motion-align-note">
              {t('animExport.gifAligned')}:{' '}
              {view.gifAligned.map((d) => ` ${d.axis} ≈${Math.abs(d.speed).toFixed(2)}/s`).join(';')}
            </div>
          )}

          {!exporting && (
            <>
              <div className="motion-est">
                <span>{t('animExport.estimated')}</span>
                <b>
                  {fmtBytes(view.estimatedBytes ?? view.preEstimateBytes)} · {view.preEstimateFrames} {t('animExport.framesUnit')}
                </b>
              </div>
              {view.phase === 'error' && view.errorMessage && (
                <div className="motion-error" role="alert">{view.errorMessage}</div>
              )}
              <button type="button" className="motion-go" disabled={!view.canExport} onClick={props.onStartExport}>
                {/* 下载箭头(复用单图导出同语义图形) */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v9" />
                  <path d="M7.5 9.5L12 14l4.5-4.5" />
                  <path d="M4.5 19.5h15" />
                </svg>
                {view.phase === 'done' ? t('animExport.reexport') : t('animExport.start')}
              </button>
            </>
          )}

          {exporting && (
            <div className="motion-prog">
              <div className="motion-prog-bar">
                <i
                  style={{
                    width: view.framesTotal > 0 ? `${Math.min(100, (view.framesDone / view.framesTotal) * 100)}%` : '0%',
                  }}
                />
              </div>
              <div className="motion-prog-meta">
                <span>
                  {view.phase === 'canceling' ? t('animExport.canceling') : t('animExport.exporting')}
                  {' '}{view.framesDone}/{view.framesTotal} · {fmtBytes(view.estimatedBytes ?? view.bytesSoFar)}
                  {view.videoTier !== null && view.videoTier !== 'webcodecs-mp4' && (
                    <>{' · '}{t('animExport.videoRecordHint')}</>
                  )}
                </span>
                {view.phase === 'encoding' && (
                  <button type="button" className="motion-cancel" onClick={props.onCancelExport}>
                    {/* 取消 X(复用通用取消图形) */}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 5l14 14M19 5L5 19" />
                    </svg>
                    {t('animExport.cancel')}
                  </button>
                )}
              </div>
            </div>
          )}

          {(view.phase === 'done' || view.phase === 'canceled') && !exporting && (
            <button type="button" className="motion-reset" onClick={() => props.onResetExport({ type: 'reset' })}>
              {view.phase === 'done' ? t('animExport.doneHint') : t('animExport.canceledHint')}
            </button>
          )}
        </fieldset>
      </section>
    </div>
  )
}
