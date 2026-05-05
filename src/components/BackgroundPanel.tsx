import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface BackgroundPanelProps {
  onImageUpload: (dataURL: string) => void
  onImageRemove: () => void
  hasImage: boolean
  imageParams: { z: number; scale: number; rotation: number; opacity: number }
  onParamChange: (param: string, value: number) => void
}

export default function BackgroundPanel({
  onImageUpload, onImageRemove, hasImage,
  imageParams, onParamChange,
}: BackgroundPanelProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImageUpload(reader.result)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [onImageUpload])

  const sliders = hasImage ? [
    { key: 'z', label: t('app3d.imageDistance'), min: -10, max: 5, step: 0.1, value: imageParams.z },
    { key: 'scale', label: t('app3d.imageScale'), min: 0.1, max: 5, step: 0.1, value: imageParams.scale },
    { key: 'rotation', label: t('app3d.imageRotation'), min: -180, max: 180, step: 1, value: imageParams.rotation },
    { key: 'opacity', label: t('app3d.imageOpacity'), min: 0, max: 1, step: 0.01, value: imageParams.opacity },
  ] : []

  return (
    <div className="sidebar-section">
      <label className="sidebar-label">{t('app3d.backgroundImage')}</label>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      {!hasImage ? (
        <button className="action-btn" onClick={() => fileRef.current?.click()}>
          {t('app3d.uploadImage')}
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button className="action-btn" onClick={() => fileRef.current?.click()} style={{ flex: 1 }}>
              {t('app3d.replaceImage')}
            </button>
            <button className="action-btn" onClick={onImageRemove}>
              {t('app3d.removeImage')}
            </button>
          </div>
          {sliders.map(s => (
            <div key={s.key} className="param-row">
              <div className="param-header">
                <span className="param-label">{s.label}</span>
                <span className="param-value">{Number.isInteger(s.value) ? s.value : s.value.toFixed(2)}</span>
              </div>
              <input
                type="range" className="param-slider"
                min={s.min} max={s.max} step={s.step}
                value={s.value}
                onInput={(e) => onParamChange(s.key, parseFloat((e.target as HTMLInputElement).value))}
              />
            </div>
          ))}
          <button className="action-btn" style={{ marginTop: 4 }} onClick={() => {
            onParamChange('z', -2); onParamChange('scale', 1)
            onParamChange('rotation', 0); onParamChange('opacity', 1)
            onParamChange('_resetXY', 0)
          }}>
            {t('app3d.resetTransform')}
          </button>
        </>
      )}
    </div>
  )
}
