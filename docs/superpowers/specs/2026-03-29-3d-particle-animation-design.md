# 3D Model Particle Animation — Design Spec

## Overview

Add a 3D particle animation feature to PixelForge. Users upload a GLTF/GLB model, which is decomposed into particles (50k–500k). Particles animate through various effects controlled by real-time parameter adjustment.

A new home page provides two entry points: 2D image processing (existing) and 3D model processing (new). The 3D page layout mirrors the existing 2D page structure.

## Requirements

### Supported Formats
- GLTF / GLB only (web standard, best Three.js support)

### Particle Effects (5 total)

| Effect | Sampling | Description |
|--------|----------|-------------|
| Surface Particles | Surface | Particles sit on model surface; basic particle visualization |
| Explosion/Aggregation | Surface | Particles scatter from and converge back to model surface |
| Morph | Surface (two models) | Smooth transition between two model shapes |
| Rotation/Vortex | Surface | Particles rotate/swirl around the model |
| Density Simulation | Volumetric | Particles fill model volume with density variation |

### Rendering
- Three.js + custom GLSL ShaderMaterial
- Particle scale: 50k–500k (user-adjustable)
- Default target: 100k particles

### Interaction
- Orbit controls (rotate, zoom, pan)
- Mouse interaction deformation (particles react to mouse proximity)
- Real-time parameter adjustment (mirrors 2D ParamPanel pattern)

### Export
- Not included in this phase

## Architecture

### Routing

```
/    → Home page (two entry links: 2D and 3D)
/2d  → Existing 2D image processing (App2D.tsx)
/3d  → New 3D model particle animation (App3D.tsx)
```

**Routing migration strategy:**

1. Current `App.tsx` function body moves to `App2D.tsx` unchanged (the component is renamed to `App2D` and exported as default).
2. New `App.tsx` becomes a router wrapper:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'

const App2D = lazy(() => import('./components/App2D'))
const App3D = lazy(() => import('./components/App3D'))
const Home  = lazy(() => import('./components/Home'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/"  element={<Home />} />
          <Route path="/2d" element={<App2D />} />
          <Route path="/3d" element={<App3D />} />
          <Route path="*"  element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
```

3. The `Home` component is a minimal placeholder with two links (no design work in this phase).
4. React Router ensures only one page component is mounted at a time — no overlap.
5. Each page has its own `<canvas>` element — no WebGL context sharing between 2D and 3D.

### Type Definitions (types.ts extension)

```typescript
export type EffectId = 'surface' | 'explosion' | 'morph' | 'vortex' | 'density'
export type SamplingType = 'surface' | 'volumetric'

export interface EffectDef {
  id: EffectId
  label: string
  description: string
  samplingType: SamplingType         // tells ParticleEngine which sampling algorithm to use
  requiresTargetModel?: boolean      // true only for morph effect
  vertexChunk: () => Promise<string> // single chunk (3D effects are single-pass, unlike 2D multi-pass)
  fragmentChunk: () => Promise<string>
  params: ParamDef[]                 // reuses existing ParamDef type (NumberParamDef | TextParamDef)
}
```

**Note on single vs. multi-pass:** 2D effects use an array of `shaderImports` because some require multi-pass rendering (e.g., lightshadow uses blur_h → blur_v → composite). 3D effects use a single `vertexChunk`/`fragmentChunk` pair because particle animation is inherently single-pass (one draw call for all points).

### Core Components

```
App3D (page component)
 ├── manages state: current model, active effect, params
 │
 ├── ParticleEngine        EffectRegistry
 │   Three.js scene mgmt    Effect definitions registry
 │   Orbit controls         (mirrors StyleRegistry pattern)
 │   Model loading (GLTF)
 │   Particle sampling      EffectDef:
 │   Render loop              id, label, description
 │                             samplingType, requiresTargetModel
 │                             vertexChunk, fragmentChunk
 │                             params: ParamDef[]
```

**ParticleEngine** responsibilities:
- Initialize Three.js scene (Scene, Camera, WebGLRenderer)
- OrbitControls for camera manipulation
- GLTFLoader for model loading
- Sample particles from loaded model geometry (surface + volumetric)
- Create `THREE.BufferGeometry` + `THREE.Points` particle system
- Run animation loop via requestAnimationFrame
- Apply mouse deformation (shared across all effects)
- Convert mouse pixel coordinates to NDC and pass as uniform

**EffectRegistry** responsibilities:
- Register all available particle effects
- Each effect defines its own vertex/fragment shader chunks and parameters
- On effect switch: assemble core shader + effect chunk → compile new ShaderMaterial

### Data Flow

```
1. User uploads GLTF → ParticleEngine loads model → sample N particle positions
2. Positions stored in BufferGeometry attributes (position, color, normal, size, random)
3. User selects effect → EffectRegistry returns EffectDef → assemble shader → create ShaderMaterial
4. User adjusts params → update uniforms → GPU computes positions in real-time
5. Render loop: vertex shader computes final position per frame based on time + uniforms
```

## Shader Chunk System

### Shader Assembly Strategy

The core vertex shader template contains two placeholder markers:
- `%%EFFECT_UNIFORMS%%` — replaced with effect-specific uniform declarations
- `%%EFFECT_TRANSFORM%%` — replaced with the effect chunk source (function implementations)

Assembly is done in TypeScript via string `replace()`:
1. Load `core.vert` as template string
2. Load effect `*.vert.chunk` as chunk string
3. Replace `%%EFFECT_UNIFORMS%%` with uniforms declared in the chunk
4. Replace `%%EFFECT_TRANSFORM%%` with the chunk function implementations
5. Pass assembled source to `THREE.ShaderMaterial`

For the fragment shader, the chunk is used whole (no assembly needed). Most effects reference `particle_default.frag`.

Three.js r150+ defaults to WebGL 2. The core shader uses `attribute` keyword, which Three.js ShaderMaterial internally converts to `in` via its GLSL3 preprocessing — no manual conversion needed.

### Core Vertex Shader (full source: `shaders3d/core.vert`)

```glsl
// Common attributes (filled during sampling)
attribute vec3 aPosition;
attribute vec3 aColor;
attribute vec3 aNormal;
attribute float aSize;
attribute float aRandom;

// Common uniforms
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseRadius;

// Varying
varying vec3 vColor;
varying float vAlpha;

// %%EFFECT_UNIFORMS%%

// Mouse deformation: push particles away from cursor in screen space
vec3 mouseDeformation(vec3 worldPos, vec2 mouseNDC, float radius) {
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  vec2 screenPos = clipPos.xy / clipPos.w;
  float dist = distance(screenPos, mouseNDC);
  if (dist < radius) {
    vec2 dir = normalize(screenPos - mouseNDC);
    float strength = (1.0 - dist / radius) * 0.5;
    clipPos.xy += dir * strength * clipPos.w;
    return (inverse(projectionMatrix * modelViewMatrix) * clipPos).xyz;
  }
  return worldPos;
}

// %%EFFECT_TRANSFORM%%

void main() {
  vColor = aColor;

  vec3 transformed = effectTransform(aPosition, aNormal, aRandom, uTime);
  transformed = mouseDeformation(transformed, uMouse, uMouseRadius);

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = effectSize(aSize, aRandom, uTime);
  gl_PointSize = size * (300.0 / -mvPosition.z);
}
```

### Default Fragment Shader (`shaders3d/particle_default.frag`)

```glsl
varying vec3 vColor;
varying float vAlpha;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
  gl_FragColor = vec4(vColor, alpha * vAlpha);
}
```

### Chunk Interface Contract

Each effect chunk must implement two functions. The chunk source is injected at the `%%EFFECT_TRANSFORM%%` placeholder:

```glsl
// Required: particle position transform
vec3 effectTransform(vec3 position, vec3 normal, float random, float time);

// Required: particle size (return baseSize to keep default)
float effectSize(float baseSize, float random, float time);
```

### Effect Registration Example

```typescript
// EffectRegistry entry
{
  id: 'explosion',
  label: '爆散聚合',
  description: '粒子从模型表面散射出去再回收',
  samplingType: 'surface',
  vertexChunk: () => import('../shaders3d/explosion.vert.chunk?raw').then(m => m.default),
  fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
  params: [
    { name: '爆炸力度', uniform: 'uExplosionForce', min: 0.0, max: 5.0, step: 0.01, default: 2.0 },
    { name: '动画速度', uniform: 'uAnimSpeed',      min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
    { name: '粒子大小', uniform: 'uBaseSize',        min: 0.5, max: 5.0, step: 0.1,  default: 2.0 },
  ],
}
```

Corresponding chunk (`explosion.vert.chunk`):

```glsl
uniform float uExplosionForce;
uniform float uAnimSpeed;

vec3 effectTransform(vec3 position, vec3 normal, float random, float time) {
  float cycle = sin(time * uAnimSpeed) * 0.5 + 0.5;
  vec3 dir = normalize(normal + vec3(random) * 0.5);
  return position + dir * uExplosionForce * cycle * (0.5 + random);
}

float effectSize(float baseSize, float random, float time) {
  float cycle = sin(time * uAnimSpeed) * 0.5 + 0.5;
  return baseSize * (1.0 + cycle * 0.5);
}
```

### Fragment Shader Strategy

Most effects share `particle_default.frag` (circular particle with soft edge + vertex color). Only effects with special visual needs provide custom fragment chunks.

## Particle Sampling

### Surface Sampling

Used by: Surface Particles, Explosion/Aggregation, Rotation/Vortex

- Uses Three.js `MeshSurfaceSampler` to uniformly sample points on triangle faces
- Captures: position, normal, color (from material/texture)

### Volumetric (Density) Sampling

Used by: Density Simulation

- Scatter points uniformly within the model bounding box
- For each point, cast a single ray in +Y direction against the mesh
- A point is inside if the ray intersects an odd number of triangles
- This is a simplification: single-ray is much faster than multi-directional and sufficient for most closed meshes
- For open/non-watertight meshes, some artifacts are acceptable (this is a creative tool, not CAD)
- Density variation achieved through particle size/opacity modulation (dense center, sparse edges)
- **Performance note:** for 100k particles on a 100k-face mesh, expect ~2-5 seconds. Show a loading indicator with progress.

### Morph Target Sampling

Used by: Morph effect (`requiresTargetModel: true`)

- Surface-sample both source and target models with equal particle count
- Both models are auto-normalized to unit bounding box before sampling (centered at origin, scaled to fit [-1,1])
- Store as two attributes: `aPosition` (source) and `aTargetPosition` (target)
- Chunk interpolates via `mix(aPosition, aTargetPosition, uProgress)`
- Extra uniform `uProgress` controls transition

### Particle Count Management

- **Particle count is a global control** in the ActionBar3D area, not per-effect
- Control: dropdown or slider with preset values (50k, 100k, 200k, 300k, 500k)
- Changing particle count triggers a full re-sample (BufferGeometry rebuild)
- Under-sampling: duplicate sample points with small random offsets
- Over-sampling: random subset selection
- Re-sampling is an infrequent operation (not a real-time slider)

## BufferGeometry Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| aPosition | vec3 | Sampled position |
| aColor | vec3 | Surface color from material |
| aNormal | vec3 | Surface normal |
| aSize | float | Base particle size |
| aRandom | float | Random seed [0,1] |
| aTargetPosition | vec3 | Morph target position (morph effect only, added dynamically) |

## Component Structure

### Component Mapping (2D → 3D)

| 2D Component | 3D Equivalent | Notes |
|---|---|---|
| StyleSelector | EffectSelector | New component, same structural pattern, typed with EffectDef/EffectId |
| Canvas + ShaderRenderer | Canvas + ParticleEngine | Three.js scene on separate canvas |
| ParamPanel | ParamPanel (refactored) | Props renamed to generic names (see below) |
| ActionBar | ActionBar3D | New component, different interface (see below) |
| ImageUploader | ModelUploader | New component for GLTF/GLB upload |

### ParamPanel Refactoring Strategy

ParamPanel props are renamed from style-specific to generic names. This is a minor refactor with no logic changes:

```
Before (style-specific):        After (generic):
  styleLabel      → title          string
  styleDescription → description   string
  params                           ParamDef[]       (unchanged)
  values                           Record<string, number>  (unchanged)
  textValues                       Record<string, string>  (unchanged)
  onChange                         (unchanged)
  onTextChange                     (unchanged)
```

Both App2D and App3D pass the same data shape. No 3D effect uses text params, so `textValues` will be an empty `{}` — this is harmless and keeps the interface uniform.

### ActionBar3D (new component)

Not shared with 2D ActionBar. Different interface entirely:

```typescript
interface ActionBar3DProps {
  onRandom: () => void        // randomize params
  onResetView: () => void     // reset camera to default position
  particleCount: number       // current particle count
  onParticleCountChange: (n: number) => void
  modelInfo: { vertices: number; faces: number } | null
}
```

### New Components

- **App3D** — Main 3D page, manages state and orchestrates ParticleEngine + EffectRegistry
- **ModelUploader** — GLTF/GLB upload with drag-and-drop, shows model info (vertices, faces) after load
- **EffectSelector** — New component following StyleSelector pattern, typed with EffectDef[] and EffectId
- **ActionBar3D** — 3D-specific action bar (see above)
- **Home** — Minimal placeholder with two links to /2d and /3d

### Morph Effect UI

When the Morph effect is selected, App3D renders a separate `ModelUploader` instance above ParamPanel specifically for the target model. This is not injected into ParamPanel (which only handles ParamDef[]). After the target model loads, ParticleEngine re-samples both models and adds the `aTargetPosition` attribute.

## File Structure

### New Dependencies
- `three` — Three.js core
- `@types/three` — TypeScript types
- `react-router-dom` — Client-side routing

Three.js includes `MeshSurfaceSampler` and `GLTFLoader` as built-in addons.

### File Changes

```
src/
├── components/
│   ├── App.tsx              → Modified: becomes router entry (Home + routes)
│   ├── App2D.tsx            → New file: current App.tsx content, rename component to App2D
│   ├── App3D.tsx            → New: 3D page main component
│   ├── Home.tsx             → New: minimal home page with two links
│   ├── ModelUploader.tsx    → New: model upload component
│   ├── EffectSelector.tsx   → New: effect selector (new component, mirrors StyleSelector pattern)
│   ├── ActionBar3D.tsx      → New: 3D-specific action bar
│   ├── ParamPanel.tsx       → Refactored: props renamed to generic names (styleLabel→title, etc.)
│   └── (all other 2D files) → Unchanged
├── lib/
│   ├── ShaderRenderer.ts    → Unchanged
│   ├── StyleRegistry.ts     → Unchanged
│   ├── ParticleEngine.ts    → New: particle engine
│   └── EffectRegistry.ts    → New: effect registry
├── shaders/                 → Unchanged (2D shaders)
├── shaders3d/               → New directory
│   ├── core.vert            → Core vertex shader framework (full template)
│   ├── particle_default.frag→ Default fragment shader (circle particle)
│   ├── surface.vert.chunk   → Surface particles effect
│   ├── explosion.vert.chunk → Explosion/aggregation effect
│   ├── morph.vert.chunk     → Morph transition effect
│   ├── vortex.vert.chunk    → Rotation/vortex effect
│   └── density.vert.chunk   → Density simulation effect
└── types.ts                 → Extended: add EffectDef, EffectId, SamplingType
```

### Design Principle
- All existing 2D code logic remains unchanged
- ParamPanel gets a minor prop rename (backward-compatible: just rename the prop names)
- 3D code is fully decoupled from 2D code
- Each page owns its own canvas element

## 3D Page Interaction Details

### Model Upload Flow
1. User drags/drops or clicks to select a .gltf/.glb file
2. ParticleEngine loads model via GLTFLoader
3. Display model info (vertex count, face count)
4. Auto-select first effect (Surface Particles)
5. Surface-sample default 100k particles
6. Begin render loop

### Effect Switch Flow
1. User clicks effect in EffectSelector
2. EffectRegistry returns new EffectDef
3. If `samplingType` differs from current, re-sample particles (show loading indicator for volumetric)
4. If `requiresTargetModel`, show target model uploader
5. ParticleEngine assembles shader: replace `%%EFFECT_UNIFORMS%%` and `%%EFFECT_TRANSFORM%%` in core.vert
6. Compile new ShaderMaterial, apply to Points
7. Initialize params to effect defaults (with randomization, matching 2D behavior)

### Parameter Adjustment Flow
1. User moves slider in ParamPanel
2. React state update → uniform value updated on ShaderMaterial
3. Next frame: vertex shader reads new uniform, computes positions
4. No shader recompilation needed (uniforms are dynamic)

### Mouse Interaction
- ParticleEngine listens for `mousemove` on the canvas
- Converts pixel coordinates to NDC: `x = (clientX / width) * 2 - 1`, `y = -(clientY / height) * 2 + 1`
- Passes NDC as `uMouse` vec2 uniform each frame
- Core vertex shader `mouseDeformation()` projects particle to clip space, measures screen-space distance to mouse, pushes nearby particles away
- `uMouseRadius` controls influence radius

## ParticleEngine Lifecycle

```typescript
class ParticleEngine {
  // Called once when App3D mounts
  init(canvas: HTMLCanvasElement): void

  // Load a GLTF/GLB model from ArrayBuffer
  loadModel(data: ArrayBuffer): Promise<ModelInfo>

  // Sample particles using the specified strategy
  sampleParticles(count: number, type: SamplingType): void

  // Apply a compiled ShaderMaterial to the particle Points
  applyMaterial(material: THREE.ShaderMaterial): void

  // Start the render loop
  start(): void

  // Stop the render loop
  stop(): void

  // Update a uniform value (called on every param change)
  setUniform(name: string, value: number | number[]): void

  // Reset camera to default position
  resetCamera(): void

  // Dispose all Three.js resources (geometry, materials, textures, renderer)
  // Must be called on App3D unmount (route change away from /3d)
  // Cancels animation loop, removes event listeners, releases WebGL context
  dispose(): void
}
```

React lifecycle in App3D:
```typescript
useEffect(() => {
  const engine = new ParticleEngine()
  engine.init(canvasRef.current!)
  engine.start()
  engineRef.current = engine

  return () => {
    engine.dispose()  // critical: releases WebGL context
  }
}, [])
```

## Error Handling

- **Invalid GLTF file:** GLTFLoader throws on parse failure. App3D catches the error and shows a message in ModelUploader: "无法加载模型，请检查文件格式"
- **Degenerate geometry (zero faces):** After loading, check `geometry.attributes.position.count`. If zero, show error message
- **Shader compilation failure:** Three.js logs GLSL errors to console. Wrap ShaderMaterial creation in try-catch; on failure, fall back to the previous working material and show a brief error toast
- **WebGL context loss:** Listen for `webglcontextlost` event on the canvas. Show a full-overlay message: "WebGL 上下文丢失，请刷新页面"
- **Memory limits at 500k particles:** 500k × (3+3+3+1+1) floats × 4 bytes ≈ 22 MB. Well within browser limits. No special handling needed

## Performance Considerations

- Shader-based animation: all position computation on GPU, no CPU bottleneck
- Uniform updates are cheap (no recompilation)
- Particle count change triggers full re-sample — infrequent operation via preset dropdown
- Surface sampling is one-time cost on model load / effect switch
- Volumetric sampling is more expensive (~2-5 seconds for 100k particles); show loading indicator
- Browser WebGL context limit is typically 8-16; disposing on route change is critical
