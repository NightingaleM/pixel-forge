import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParticleEngine } from '../lib/ParticleEngine'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const BITRATE_PRESETS = [
  { label: 'low', value: 5 },
  { label: 'medium', value: 10 },
  { label: 'high', value: 20 },
  { label: 'ultra', value: 40 },
] as const

const FPS_OPTIONS = [30, 60] as const

interface RecordingControlsProps {
  engineRef: React.RefObject<ParticleEngine | null>
}

export default function RecordingControls({ engineRef }: RecordingControlsProps) {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [fps, setFps] = useState(60)
  const [bitratePreset, setBitratePreset] = useState('high')
  const [customBitrate, setCustomBitrate] = useState('20')
  const [customMode, setCustomMode] = useState(false)

  const getBitrate = useCallback(() => {
    if (customMode) {
      const val = parseFloat(customBitrate)
      return (isNaN(val) || val <= 0 ? 20 : val) * 1_000_000
    }
    const preset = BITRATE_PRESETS.find(p => p.label === bitratePreset)
    return (preset?.value ?? 20) * 1_000_000
  }, [customMode, customBitrate, bitratePreset])

  const handleScreenshot = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    const blob = await engine.captureScreenshot()
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    downloadBlob(blob, `pixelforge_3d_${ts}.png`)
  }, [engineRef])

  const toggleRecording = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return

    if (!isRecording) {
      engine.startRecording(fps, getBitrate())
      setIsRecording(true)
    } else {
      const blob = await engine.stopRecording()
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      downloadBlob(blob, `pixelforge_3d_${ts}.webm`)
      setIsRecording(false)
    }
  }, [engineRef, isRecording, fps, getBitrate])

  // Listen for keyboard shortcut event from App3D
  const toggleRef = useRef(toggleRecording)
  toggleRef.current = toggleRecording
  useEffect(() => {
    const handler = () => toggleRef.current()
    window.addEventListener('pixelforge-toggle-recording', handler)
    return () => window.removeEventListener('pixelforge-toggle-recording', handler)
  }, [])

  return (
    <>
      {/* Screenshot */}
      <button className="action-btn" style={{ width: '100%' }} onClick={handleScreenshot}>
        {t('app3d.screenshot')} <span className="shortcut-hint">Ctrl+Shift+S</span>
      </button>

      {/* Record */}
      <button
        className={`action-btn ${isRecording ? 'recording-active' : ''}`}
        style={{ width: '100%', marginTop: 4 }}
        onClick={toggleRecording}
      >
        {isRecording ? t('app3d.stopRecording') : t('app3d.startRecording')}
        {!isRecording && <span className="shortcut-hint">Ctrl+Shift+R</span>}
      </button>

      {/* FPS */}
      <div className="param-row" style={{ marginTop: 8 }}>
        <div className="param-header">
          <span className="param-label">{t('app3d.recordFps')}</span>
        </div>
        <div className="lighting-presets">
          {FPS_OPTIONS.map(f => (
            <button
              key={f}
              className={`preset-btn ${fps === f ? 'active' : ''}`}
              onClick={() => setFps(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Bitrate */}
      <div className="param-row">
        <div className="param-header">
          <span className="param-label">{t('app3d.videoBitrate')}</span>
        </div>
        <div className="lighting-presets">
          {BITRATE_PRESETS.map(p => (
            <button
              key={p.label}
              className={`preset-btn ${!customMode && bitratePreset === p.label ? 'active' : ''}`}
              onClick={() => { setCustomMode(false); setBitratePreset(p.label) }}
            >
              {t(`app3d.bitrate.${p.label}`)}
            </button>
          ))}
          <button
            className={`preset-btn ${customMode ? 'active' : ''}`}
            onClick={() => setCustomMode(true)}
          >
            {t('app3d.bitrate.custom')}
          </button>
        </div>
      </div>

      {customMode && (
        <div className="param-row">
          <div className="param-header">
            <span className="param-label">Mbps</span>
            <span className="param-value">{customBitrate}</span>
          </div>
          <input
            type="range" className="param-slider"
            min={1} max={100} step={1}
            value={customBitrate}
            onInput={(e) => setCustomBitrate((e.target as HTMLInputElement).value)}
          />
        </div>
      )}
    </>
  )
}
