import { useState, useCallback, useRef, type ReactNode } from 'react'
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

interface RecordingControlsProps {
  engineRef: React.RefObject<ParticleEngine | null>
}

export default function RecordingControls({ engineRef }: RecordingControlsProps) {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const pulseRef = useRef<ReturnType<typeof setInterval>>()

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
      engine.startRecording()
      setIsRecording(true)
    } else {
      const blob = await engine.stopRecording()
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      downloadBlob(blob, `pixelforge_3d_${ts}.webm`)
      setIsRecording(false)
      if (pulseRef.current) clearInterval(pulseRef.current)
    }
  }, [engineRef, isRecording])

  return (
    <>
      <button className="action-btn" onClick={handleScreenshot}>
        {t('app3d.screenshot')}
      </button>
      <button
        className={`action-btn ${isRecording ? 'recording-active' : ''}`}
        onClick={toggleRecording}
      >
        {isRecording ? t('app3d.stopRecording') : t('app3d.startRecording')}
      </button>
    </>
  )
}
