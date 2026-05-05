# 3D Production Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 production features to the PixelForge 3D particle tool: custom background color, background image with transform controls, lighting presets + fine-tuning, screenshot + video recording, and multi-color particle gradient system.

**Architecture:** Features are added to the existing `ParticleEngine.ts` (new public methods) and `App3D.tsx` (new state + UI components). New UI components follow the existing `ParamPanel` pattern. Shader changes use the existing chunk injection system. Each feature is self-contained and can be implemented independently.

**Tech Stack:** React 19, Three.js 0.183, TypeScript, GLSL shaders, Vite

**Spec:** `docs/superpowers/specs/2026-05-05-3d-production-features-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/BackgroundPanel.tsx` | Background color picker + image upload + image transform sliders |
| `src/components/LightingPanel.tsx` | Lighting presets cards + parameter sliders (intensity, color temp, direction) |
| `src/components/GradientEditor.tsx` | Color stop list, gradient preview bar, distribution mode selector |
| `src/components/RecordingControls.tsx` | Screenshot button + recording start/stop button |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/ParticleEngine.ts` | Store lights as class fields, add background image plane, add all new public methods |
| `src/components/App3D.tsx` | Add state for all features, wire new components, add mouse handlers for image drag |
| `src/shaders3d/core.vert` | Add gradient uniforms and varying |
| `src/shaders3d/particle_default.frag` | Add gradient texture sampling branch |
| `src/lib/EffectRegistry.ts` | Add gradient params to BASE_PARAMS |
| `src/types.ts` | Add new type definitions |
| `src/i18n/en.json` | Add English translation keys |
| `src/i18n/zh.json` | Add Chinese translation keys |
| `src/styles/global.css` | Add styles for new components |

---

## Task 1: Custom Background Color

**Files:**
- Modify: `src/lib/ParticleEngine.ts:67` (background color line)
- Modify: `src/components/App3D.tsx:31-52` (state section), `src/components/App3D.tsx:285-310` (sidebar)
- Modify: `src/i18n/en.json`, `src/i18n/zh.json` (add keys)

- [ ] **Step 1: Add `setBackgroundColor` method to ParticleEngine**

In `src/lib/ParticleEngine.ts`, add after the constructor (after the closing `}` of constructor):

```typescript
setBackgroundColor(color: string): void {
  this.scene.background = new THREE.Color(color)
}
```

- [ ] **Step 2: Add background color state and UI to App3D**

In `src/components/App3D.tsx`, add state in the state declaration area (after existing state declarations around line 44):

```typescript
const [backgroundColor, setBackgroundColor] = useState('#1a1a2e')
```

Add effect to sync color to engine, after the engine init useEffect:

```typescript
useEffect(() => {
  engineRef.current?.setBackgroundColor(backgroundColor)
}, [backgroundColor])
```

In the sidebar section (inside `app-3d-sidebar`, before the error message block), add:

```jsx
<div className="sidebar-section">
  <label className="sidebar-label">{t('app3d.backgroundColor')}</label>
  <input
    type="color"
    className="param-color-input"
    value={backgroundColor}
    onChange={(e) => setBackgroundColor(e.target.value)}
  />
</div>
```

- [ ] **Step 3: Add i18n keys**

Add to `src/i18n/en.json` and `src/i18n/zh.json` under the `app3d` key:

```json
// en.json
"backgroundColor": "Background Color"

// zh.json
"backgroundColor": "背景颜色"
```

- [ ] **Step 4: Verify and commit**

Open the app, confirm color picker changes the 3D scene background color. Default should be `#1a1a2e`.

```bash
git add -A && git commit -m "feat(3d): add custom background color picker"
```

---

## Task 2: Background Image Upload + Plane in Scene

**Depends on:** Task 1

**Files:**
- Modify: `src/lib/ParticleEngine.ts` (add image plane management)
- Modify: `src/components/App3D.tsx` (add upload UI)
- Create: `src/components/BackgroundPanel.tsx`

- [ ] **Step 1: Add image plane fields and methods to ParticleEngine**

In `src/lib/ParticleEngine.ts`, add class fields after line 58 (`sdfTexture`):

```typescript
// Background image
private backgroundImageMesh: THREE.Mesh | null = null
private backgroundImageTexture: THREE.Texture | null = null
```

Add methods (after `setBackgroundColor`):

```typescript
addBackgroundImage(dataURL: string): void {
  this.removeBackgroundImage()
  const loader = new THREE.TextureLoader()
  this.backgroundImageTexture = loader.load(dataURL, (texture) => {
    const aspect = texture.image.width / texture.image.height
    const height = 4
    const width = height * aspect
    const geometry = new THREE.PlaneGeometry(width, height)
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    })
    this.backgroundImageMesh = new THREE.Mesh(geometry, material)
    this.backgroundImageMesh.position.set(0, 0, -2)
    this.backgroundImageMesh.userData.isBackgroundImage = true
    this.scene.add(this.backgroundImageMesh)
  })
}

removeBackgroundImage(): void {
  if (this.backgroundImageMesh) {
    this.scene.remove(this.backgroundImageMesh)
    this.backgroundImageMesh.geometry.dispose()
    ;(this.backgroundImageMesh.material as THREE.Material).dispose()
    this.backgroundImageMesh = null
  }
  if (this.backgroundImageTexture) {
    this.backgroundImageTexture.dispose()
    this.backgroundImageTexture = null
  }
}

transformImage(params: { z?: number; scale?: number; rotation?: number; opacity?: number }): void {
  if (!this.backgroundImageMesh) return
  if (params.z !== undefined) this.backgroundImageMesh.position.z = params.z
  if (params.scale !== undefined) this.backgroundImageMesh.scale.setScalar(params.scale)
  if (params.rotation !== undefined) this.backgroundImageMesh.rotation.z = params.rotation * Math.PI / 180
  if (params.opacity !== undefined) {
    (this.backgroundImageMesh.material as THREE.MeshStandardMaterial).opacity = params.opacity
  }
}

getBackgroundImageMesh(): THREE.Mesh | null {
  return this.backgroundImageMesh
}
```

- [ ] **Step 2: Create BackgroundPanel component**

Create `src/components/BackgroundPanel.tsx`:

```tsx
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
            onParamChange('_resetXY', 0)  // Special: resets mesh position x/y to 0
          }}>
            {t('app3d.resetTransform')}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire BackgroundPanel into App3D**

In `src/components/App3D.tsx`, add state after `backgroundColor`:

```typescript
const [hasBackgroundImage, setHasBackgroundImage] = useState(false)
const [imageParams, setImageParams] = useState({ z: -2, scale: 1, rotation: 0, opacity: 1 })
```

Add handlers:

```typescript
const handleImageUpload = useCallback((dataURL: string) => {
  engineRef.current?.addBackgroundImage(dataURL)
  setHasBackgroundImage(true)
  setImageParams({ z: -2, scale: 1, rotation: 0, opacity: 1 })
}, [])

const handleImageRemove = useCallback(() => {
  engineRef.current?.removeBackgroundImage()
  setHasBackgroundImage(false)
}, [])

const handleImageParamChange = useCallback((param: string, value: number) => {
  setImageParams(prev => {
    const next = { ...prev, [param]: value }
    engineRef.current?.transformImage(next)
    return next
  })
}, [])
```

Import and render `<BackgroundPanel>` in the sidebar, after the background color input.

- [ ] **Step 4: Add canvas drag interaction for image (XY move + scroll zoom + Shift+drag Z)**

In `src/components/App3D.tsx`, add a `useEffect` for canvas drag handling. Uses `Raycaster` to detect hit on background image mesh. On hit + mousedown: disable `OrbitControls`, set `uMouseEnabled = 0`, track drag delta for XY movement. On Shift+drag: map Y delta to Z axis. On wheel over image: adjust scale. On mouseup: re-enable controls.

This effect depends on `hasBackgroundImage` being true. Store drag state in refs.

```typescript
useEffect(() => {
  const canvas = canvasRef.current
  if (!canvas || !hasBackgroundImage) return

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let isDragging = false
  let isShiftDrag = false
  let startX = 0, startY = 0

  const getHit = (e: MouseEvent) => {
    const engine = engineRef.current
    if (!engine) return false
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, engine.camera)
    const mesh = engine.getBackgroundImageMesh()
    if (!mesh) return false
    return raycaster.intersectObject(mesh).length > 0
  }

  const onMouseDown = (e: MouseEvent) => {
    const engine = engineRef.current
    if (!engine) return
    if (!getHit(e)) return
    isDragging = true
    isShiftDrag = e.shiftKey
    startX = e.clientX
    startY = e.clientY
    engine.controls.enabled = false
    engine.setUniform('uMouseEnabled', 0)
    canvas.style.cursor = 'grabbing'
  }

  const onMouseMove = (e: MouseEvent) => {
    const engine = engineRef.current
    if (!engine) return
    if (!isDragging) {
      canvas.style.cursor = getHit(e) ? 'grab' : ''
      return
    }
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const mesh = engine.getBackgroundImageMesh()
    if (!mesh) return

    if (isShiftDrag) {
      const newZ = mesh.position.z - dy * 0.01
      setImageParams(prev => {
        const next = { ...prev, z: Math.max(-10, Math.min(5, newZ)) }
        engine.transformImage(next)
        return next
      })
    } else {
      mesh.position.x += dx * 0.005
      mesh.position.y -= dy * 0.005
    }
    startX = e.clientX
    startY = e.clientY
  }

  const onMouseUp = () => {
    const engine = engineRef.current
    if (!engine) return
    if (isDragging) {
      isDragging = false
      engine.controls.enabled = true
      engine.setUniform('uMouseEnabled', 1)
      canvas.style.cursor = ''
    }
  }

  const onWheel = (e: WheelEvent) => {
    const engine = engineRef.current
    if (!engine) return
    if (!getHit(e)) return
    e.preventDefault()
    setImageParams(prev => {
      const next = { ...prev, scale: Math.max(0.1, Math.min(5, prev.scale - e.deltaY * 0.001)) }
      engine.transformImage(next)
      return next
    })
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('wheel', onWheel)
  }
}, [hasBackgroundImage])
```

- [ ] **Step 5: Add i18n keys and styles**

Add translation keys for image upload, remove, replace, distance, scale, rotation, opacity, reset transform.

- [ ] **Step 6: Verify and commit**

Upload an image, verify it appears behind particles. Test drag to move, scroll to zoom, Shift+drag for Z depth, slider panel sync, remove button.

```bash
git add -A && git commit -m "feat(3d): add background image upload with transform controls"
```

---

## Task 3: Lighting Presets + Parameter Fine-Tuning

**Depends on:** Task 1 (both modify ParticleEngine constructor area — Task 3's light refactor should be applied after Task 1's setBackgroundColor method is added)

**Note:** The spec lists an `applyLightingPreset()` method on ParticleEngine, but this is simplified: presets are just parameter bundles handled in the LightingPanel component, which calls `updateLighting()` directly.

**Files:**
- Modify: `src/lib/ParticleEngine.ts:90-96` (refactor lights to class fields), add methods
- Create: `src/components/LightingPanel.tsx`

- [ ] **Step 1: Refactor lights to class fields in ParticleEngine**

In `src/lib/ParticleEngine.ts`, add class fields after line 58:

```typescript
// Lighting
private ambientLight: THREE.AmbientLight
private directionalLight: THREE.DirectionalLight
```

Replace lines 90-96 (local variables → class field assignment):

```typescript
this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
this.scene.add(this.ambientLight)

this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
this.directionalLight.position.set(5, 10, 7)
this.scene.add(this.directionalLight)
```

- [ ] **Step 2: Add lighting update methods**

```typescript
updateLighting(params: {
  mainIntensity?: number
  ambientIntensity?: number
  colorTemp?: number  // 0=warm, 0.5=neutral, 1=cool
  directionIndex?: number  // 0-8 for nine-grid
}): void {
  if (params.mainIntensity !== undefined) {
    this.directionalLight.intensity = params.mainIntensity
  }
  if (params.ambientIntensity !== undefined) {
    this.ambientLight.intensity = params.ambientIntensity
  }
  if (params.colorTemp !== undefined) {
    const warm = new THREE.Color(0xffaa66)
    const neutral = new THREE.Color(0xffffff)
    const cool = new THREE.Color(0xaaccff)
    const color = params.colorTemp <= 0.5
      ? warm.clone().lerp(neutral, params.colorTemp * 2)
      : neutral.clone().lerp(cool, (params.colorTemp - 0.5) * 2)
    this.directionalLight.color.copy(color)
  }
  if (params.directionIndex !== undefined) {
    const grid = [
      [-5, -5], [0, -5], [5, -5],
      [-5, 0],  [0, 0],  [5, 0],
      [-5, 5],  [0, 5],  [5, 5],
    ]
    const [x, z] = grid[params.directionIndex] ?? [5, -5]
    this.directionalLight.position.set(x, 10, z)
  }
}
```

- [ ] **Step 3: Create LightingPanel component**

Create `src/components/LightingPanel.tsx` with:
- 5 preset cards (日光/月光/聚光灯/均匀/自定义) with icons
- Sliders for main intensity, ambient intensity, color temperature
- 3x3 direction grid
- When a preset is selected, fill all params and call `updateLighting`
- When a slider is changed, switch to "custom" mode and update

Presets data:

```typescript
const PRESETS = {
  daylight:  { main: 0.8, ambient: 0.4, colorTemp: 0.3, dir: 2 },  // right-top
  moonlight: { main: 0.5, ambient: 0.3, colorTemp: 0.85, dir: 0 }, // left-top
  spotlight: { main: 1.2, ambient: 0.1, colorTemp: 0.5, dir: 1 },  // center-top
  even:      { main: 0, ambient: 0.8, colorTemp: 0.5, dir: 4 },    // center (direction irrelevant when main=0)
}
```

- [ ] **Step 4: Wire LightingPanel into App3D**

Add state: `lightingParams`, `lightingPreset`. Render in sidebar. On preset or param change, call `engine.updateLighting(params)`.

- [ ] **Step 5: Add i18n keys and styles**

Add keys for preset names, slider labels.

- [ ] **Step 6: Verify and commit**

Test each preset, adjust sliders, confirm light direction grid changes the light position.

```bash
git add -A && git commit -m "feat(3d): add lighting presets and parameter fine-tuning"
```

---

## Task 4: Screenshot + Video Recording

**Files:**
- Modify: `src/lib/ParticleEngine.ts` (add capture/recording methods)
- Modify: `src/components/ActionBar3D.tsx` (add capture buttons)
- Create: `src/components/RecordingControls.tsx`

- [ ] **Step 1: Add screenshot method to ParticleEngine**

```typescript
async captureScreenshot(): Promise<Blob> {
  this.renderer.render(this.scene, this.camera)
  return new Promise((resolve, reject) => {
    this.canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to capture screenshot'))
    }, 'image/png')
  })
}
```

- [ ] **Step 2: Add recording methods to ParticleEngine**

```typescript
private mediaRecorder: MediaRecorder | null = null
private recordedChunks: Blob[] = []
private _isRecording = false

get isRecording(): boolean {
  return this._isRecording
}

startRecording(): void {
  if (this._isRecording) return
  const stream = this.canvas.captureStream(30)
  this.mediaRecorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm',
  })
  this.recordedChunks = []
  this.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) this.recordedChunks.push(e.data)
  }
  this.mediaRecorder.start()
  this._isRecording = true
}

stopRecording(): Promise<Blob> {
  return new Promise((resolve) => {
    if (!this.mediaRecorder || !this._isRecording) {
      resolve(new Blob())
      return
    }
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' })
      this._isRecording = false
      this.mediaRecorder = null
      this.recordedChunks = []
      resolve(blob)
    }
    this.mediaRecorder.stop()
  })
}
```

- [ ] **Step 3: Add RecordingControls component**

Create `src/components/RecordingControls.tsx` with two buttons:
- Screenshot button: calls `engine.captureScreenshot()`, creates download link
- Record button: toggles between start/stop, visual feedback (red pulsing when recording)

```tsx
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Wire into ActionBar3D**

Add `RecordingControls` to the action bar, next to existing buttons. Pass `engineRef` as prop.

- [ ] **Step 5: Add i18n keys and styles**

Add keys: screenshot, startRecording, stopRecording. Add recording pulse animation CSS.

- [ ] **Step 6: Verify and commit**

Test screenshot download. Test video recording (start, wait a few seconds, stop, verify WebM downloads and plays).

```bash
git add -A && git commit -m "feat(3d): add screenshot and video recording"
```

---

## Task 5: Particle Multi-Color Gradient System

**Files:**
- Modify: `src/types.ts` (add gradient types)
- Modify: `src/lib/EffectRegistry.ts` (add gradient params to BASE_PARAMS)
- Modify: `src/shaders3d/core.vert` (add gradient uniforms, varying, UV computation)
- Modify: `src/shaders3d/particle_default.frag` (add gradient texture sampling)
- Modify: `src/lib/ParticleEngine.ts` (gradient texture generation, uniform injection)
- Create: `src/components/GradientEditor.tsx`
- Modify: `src/components/App3D.tsx` (wire gradient editor)

- [ ] **Step 1: Add gradient types to types.ts**

```typescript
export interface ColorStop {
  color: string    // hex color
  position: number // 0-1
}

export interface GradientConfig {
  stops: ColorStop[]
  mode: 'height' | 'radial' | 'random'
}
```

- [ ] **Step 2: Modify core.vert — add gradient uniforms and varying**

Add after line 19 (after `uColorB`):

```glsl
// Gradient color uniforms
uniform float uGradientMode;  // 0=height, 1=radial, 2=random
uniform float uNumColorStops;
uniform sampler2D uGradientMap;
uniform float uGradientMinY;
uniform float uGradientMaxY;
uniform vec3 uGradientCenter;
uniform float uGradientMaxRadius;

varying float vGradientUV;
```

In `main()`, add `vGradientUV = 0.0;` initialization before the existing `vColor` block, then add gradient UV computation after the `vColor` assignment block:

```glsl
if (uUseCustomColor > 0.5 && uGradientMode >= 0.0) {
  vec3 pos = aPosition;
  if (uGradientMode < 0.5) {
    // Height gradient
    vGradientUV = clamp((pos.y - uGradientMinY) / max(uGradientMaxY - uGradientMinY, 0.001), 0.0, 1.0);
  } else if (uGradientMode < 1.5) {
    // Radial gradient
    float dist = distance(pos, uGradientCenter);
    vGradientUV = clamp(dist / max(uGradientMaxRadius, 0.001), 0.0, 1.0);
  } else {
    // Random — use aRandom to pick discrete color
    float bucket = floor(aRandom * max(uNumColorStops, 1.0)) / max(uNumColorStops, 1.0);
    vGradientUV = clamp(bucket, 0.0, 1.0);
  }
}
```

- [ ] **Step 3: Modify particle_default.frag — add gradient sampling**

Add after existing uniform declarations (after line 4):

```glsl
uniform float uUseCustomColor;
uniform float uGradientMode;
uniform sampler2D uGradientMap;
varying float vGradientUV;
```

Replace the existing `gl_FragColor` line (line 32) with:

```glsl
vec3 finalColor = vColor;
if (uUseCustomColor > 0.5 && uGradientMode >= 0.0) {
  finalColor = texture2D(uGradientMap, vec2(vGradientUV, 0.5)).rgb;
}
gl_FragColor = vec4(finalColor, alpha * vAlpha);
```

- [ ] **Step 4: Add gradient texture generation to ParticleEngine**

Add method:

```typescript
private gradientTexture: THREE.DataTexture | null = null

updateGradient(config: { stops: { color: string; position: number }[]; mode: string }): void {
  // Generate 256x1 gradient texture
  const size = 256
  const data = new Uint8Array(size * 4)
  const stops = config.stops.sort((a, b) => a.position - b.position)

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1)
    // Find surrounding stops
    let lower = stops[0], upper = stops[stops.length - 1]
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].position && t <= stops[s + 1].position) {
        lower = stops[s]
        upper = stops[s + 1]
        break
      }
    }
    const range = upper.position - lower.position
    const localT = range > 0 ? (t - lower.position) / range : 0
    const cLower = new THREE.Color(lower.color)
    const cUpper = new THREE.Color(upper.color)
    const c = cLower.lerp(cUpper, localT)
    data[i * 4] = Math.round(c.r * 255)
    data[i * 4 + 1] = Math.round(c.g * 255)
    data[i * 4 + 2] = Math.round(c.b * 255)
    data[i * 4 + 3] = 255
  }

  if (this.gradientTexture) this.gradientTexture.dispose()
  this.gradientTexture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat)
  this.gradientTexture.minFilter = THREE.LinearFilter
  this.gradientTexture.magFilter = THREE.LinearFilter
  this.gradientTexture.needsUpdate = true

  // Update uniforms
  if (this.currentMaterial && isShaderMaterial(this.currentMaterial)) {
    const u = this.currentMaterial.uniforms
    u.uGradientMap.value = this.gradientTexture
    u.uGradientMode.value = config.mode === 'height' ? 0 : config.mode === 'radial' ? 1 : 2
    u.uNumColorStops.value = config.stops.length
  }

  // Compute and update bounding info for height/radial modes
  this.updateGradientBounds()
}

private updateGradientBounds(): void {
  if (!this.currentMaterial || !isShaderMaterial(this.currentMaterial)) return
  if (!this.originalPositions) return
  const positions = this.originalPositions
  let minY = Infinity, maxY = -Infinity
  let cx = 0, cy = 0, cz = 0
  const count = positions.length / 3
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    cx += x; cy += y; cz += z
  }
  cx /= count; cy /= count; cz /= count
  let maxR = 0
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - cx, dy = positions[i + 1] - cy, dz = positions[i + 2] - cz
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d > maxR) maxR = d
  }
  const u = this.currentMaterial.uniforms
  u.uGradientMinY.value = minY
  u.uGradientMaxY.value = maxY
  u.uGradientCenter.value.set(cx, cy, cz)
  u.uGradientMaxRadius.value = maxR
}
```

- [ ] **Step 5: Add gradient uniforms to applyMaterial**

In `src/lib/ParticleEngine.ts`, in the `applyMaterial` method (lines 683-694 common uniforms block), add:

```typescript
uGradientMode: { value: -1.0 },  // -1 = disabled (backward compatible)
uNumColorStops: { value: 2.0 },
uGradientMap: { value: null },
uGradientMinY: { value: 0.0 },
uGradientMaxY: { value: 1.0 },
uGradientCenter: { value: new THREE.Vector3() },
uGradientMaxRadius: { value: 1.0 },
```

- [ ] **Step 6: Create GradientEditor component**

Create `src/components/GradientEditor.tsx` with:
- Gradient preview bar (CSS linear-gradient)
- Color stop list (each stop: color picker + position slider + delete button)
- "Add stop" button (max 8 stops, min 2)
- Distribution mode selector (3 buttons: height/radial/random)
- Integrated into the existing base params panel via `BASE_PARAMS`

- [ ] **Step 7: Add gradient params to BASE_PARAMS in EffectRegistry**

Add a new toggle `uUseGradient` (reusing `uUseCustomColor` logic) — when enabled, show the gradient editor.

- [ ] **Step 8: Wire into App3D**

Add `gradientConfig` state. When gradient config changes, call `engine.updateGradient(config)`. Render `<GradientEditor>` in the base params panel when `uUseCustomColor` is enabled.

- [ ] **Step 9: Add i18n keys and styles**

Add keys for gradient editor labels, distribution modes.

- [ ] **Step 10: Verify and commit**

Test: enable custom color → gradient editor appears → add stops → change colors → switch between height/radial/random modes → verify particle colors update in real-time.

```bash
git add -A && git commit -m "feat(3d): add multi-color gradient particle system"
```

---

## Task 6: Integration Testing + Polish

**Files:**
- All modified files

- [ ] **Step 1: Test all features together**

Verify all 6 features work simultaneously:
1. Change background color
2. Upload background image, adjust with drag + sliders
3. Switch lighting presets, adjust params
4. Take screenshot
5. Record video
6. Enable gradient colors, add stops, switch modes

- [ ] **Step 2: Test edge cases**

- No model loaded → all controls should still be functional (background, lighting)
- Remove background image → scene returns to color-only
- Recording while switching effects → recording continues
- Gradient with different particle counts (small and large)
- Image drag when no image loaded → no errors

- [ ] **Step 3: Add i18n for all new labels (zh + en)**

Ensure all new UI text has both English and Chinese translations.

- [ ] **Step 4: Update `ParticleEngine.dispose()` for new resources**

In `src/lib/ParticleEngine.ts`, update the `dispose()` method to clean up all new resources:

```typescript
// Add to dispose() method, before the existing cleanup:
this.removeBackgroundImage()
if (this.gradientTexture) {
  this.gradientTexture.dispose()
  this.gradientTexture = null
}
if (this._isRecording) {
  this.stopRecording()
}
```

- [ ] **Step 5: Final commit**
