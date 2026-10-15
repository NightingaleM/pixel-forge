/**
 * 动图导出状态机(wayfinder kaleido-motion spec §8 测试目标:
 * 进度/取消/换格式再导)。纯 reducer,面板层零逻辑。
 */
export type ExportFormat = 'gif' | 'video'

export type ExportPhase = 'idle' | 'encoding' | 'canceling' | 'canceled' | 'done' | 'error'

export interface ExportState {
  phase: ExportPhase
  format: ExportFormat
  framesDone: number
  framesTotal: number
  /** 真实累计字节(GIF 随编码刷新;视频按码率×时长一次给定)。 */
  bytesSoFar: number
  /** 预估体积:单调不减,避免首帧外推值与真实累计互相拉扯。 */
  estimatedBytes: number | null
  errorMessage: string | null
}

export type ExportAction =
  | { type: 'start'; format: ExportFormat; framesTotal: number }
  | { type: 'progress'; framesDone: number; bytesSoFar?: number; estimatedBytes?: number }
  | { type: 'requestCancel' }
  | { type: 'canceled' }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'reset' }
  | { type: 'setFormat'; format: ExportFormat }

export function initialExportState(): ExportState {
  return {
    phase: 'idle',
    format: 'gif',
    framesDone: 0,
    framesTotal: 0,
    bytesSoFar: 0,
    estimatedBytes: null,
    errorMessage: null,
  }
}

export function exportReducer(state: ExportState, action: ExportAction): ExportState {
  switch (action.type) {
    case 'start':
      // idle/done/canceled/error 均可直接开新导出(等效 reset 后启动)
      if (state.phase === 'encoding' || state.phase === 'canceling') return state
      return {
        ...state,
        phase: 'encoding',
        format: action.format,
        framesTotal: action.framesTotal,
        framesDone: 0,
        bytesSoFar: 0,
        estimatedBytes: null,
        errorMessage: null,
      }
    case 'progress':
      if (state.phase !== 'encoding') return state
      return {
        ...state,
        framesDone: Math.max(state.framesDone, action.framesDone),
        bytesSoFar: Math.max(state.bytesSoFar, action.bytesSoFar ?? 0),
        estimatedBytes:
          action.estimatedBytes !== undefined
            ? Math.max(action.estimatedBytes, state.estimatedBytes ?? 0)
            : state.estimatedBytes,
      }
    case 'requestCancel':
      if (state.phase !== 'encoding') return state
      return { ...state, phase: 'canceling' }
    case 'canceled':
      if (state.phase !== 'canceling') return state
      return { ...state, phase: 'canceled' }
    case 'done':
      if (state.phase !== 'encoding') return state
      return { ...state, phase: 'done' }
    case 'error':
      if (state.phase !== 'encoding' && state.phase !== 'canceling') return state
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'reset':
      return { ...initialExportState(), format: state.format }
    case 'setFormat':
      // 导出中禁止换格式(防状态串档)
      if (state.phase === 'encoding' || state.phase === 'canceling') return state
      return { ...state, format: action.format }
  }
}
