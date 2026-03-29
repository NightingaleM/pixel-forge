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

Add `react-router-dom`. Current `App.tsx` becomes the router entry. Existing 2D code moves to `App2D.tsx` with no logic changes.

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
 │                             vertexChunk, fragmentChunk
 │                             params: ParamDef[]
 │                             uniforms
```

**ParticleEngine** responsibilities:
- Initialize Three.js scene (Scene, Camera, WebGLRenderer)
- OrbitControls for camera manipulation
- GLTFLoader for model loading
- Sample particles from loaded model geometry (surface + volumetric)
- Create `THREE.BufferGeometry` + `THREE.Points` particle system
- Run animation loop via requestAnimationFrame
- Apply mouse deformation (shared across all effects)

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

### Core Vertex Shader Framework

```glsl
// Common attributes (filled during sampling)
attribute vec3 aPosition;    // sampled position
attribute vec3 aColor;       // surface color from material
attribute vec3 aNormal;      // surface normal
attribute float aSize;       // base particle size
attribute float aRandom;     // per-particle random seed [0,1]

// Common uniforms
uniform float uTime;
uniform vec2 uMouse;         // mouse position (NDC)
uniform float uMouseRadius;
uniform float uDeltaTime;

// Effect-specific uniforms (injected from EffectDef)
// %%EFFECT_UNIFORMS%% placeholder

// Effect transform function (implemented by chunk)
// %%EFFECT_TRANSFORM%% placeholder

void main() {
  vec3 transformed = effectTransform(aPosition, aNormal, aRandom, uTime);
  transformed += mouseDeformation(transformed, uMouse, uMouseRadius);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = effectSize(aSize, aRandom, uTime) * (300.0 / -mvPosition.z);
}
```

### Chunk Interface Contract

Each effect chunk must implement:

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
  vertexChunk: () => import('../shaders3d/explosion.vert.chunk?raw'),
  fragmentChunk: () => import('../shaders3d/particle_default.frag?raw'),
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

Most effects share a default fragment shader (circular particle with soft edge + vertex color). Only effects with special visual needs provide custom fragment chunks.

## Particle Sampling

### Surface Sampling

Used by: Surface Particles, Explosion/Aggregation, Rotation/Vortex

- Uses Three.js `MeshSurfaceSampler` to uniformly sample points on triangle faces
- Captures: position, normal, color (from material/texture)

### Volumetric (Density) Sampling

Used by: Density Simulation

- Scatter points uniformly within the model bounding box
- Use Raycaster to test if each point is inside the model (multi-directional ray test)
- Discard exterior points
- Density variation achieved through particle size/opacity modulation (dense center, sparse edges)

### Morph Target Sampling

Used by: Morph effect

- Surface-sample both source and target models (equal particle count)
- Store as two attributes: `aPosition` (source) and `aTargetPosition` (target)
- Chunk interpolates via `mix(aPosition, aTargetPosition, uProgress)`
- Extra uniform `uProgress` controls transition

### Particle Count Management

- Default: 100,000 particles
- User-adjustable: 50k–500k via parameter
- Under-sampling: duplicate sample points with small random offsets
- Over-sampling: random subset selection

## BufferGeometry Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| aPosition | vec3 | Sampled position |
| aColor | vec3 | Surface color from material |
| aNormal | vec3 | Surface normal |
| aSize | float | Base particle size |
| aRandom | float | Random seed [0,1] |
| aTargetPosition | vec3 | Morph target position (morph effect only) |

## Component Structure

### Component Mapping (2D → 3D)

| 2D Component | 3D Equivalent | Notes |
|---|---|---|
| StyleSelector | EffectSelector | Same pattern, different data source |
| Canvas + ShaderRenderer | Canvas + ParticleEngine | Three.js scene |
| ParamPanel | ParamPanel (shared) | Identical interface |
| ActionBar | ActionBar (shared, simplified) | No download, add reset-view and particle count |
| ImageUploader | ModelUploader | GLTF/GLB drag-and-drop upload |

### New Components

- **App3D** — Main 3D page, manages state and orchestrates ParticleEngine + EffectRegistry
- **ModelUploader** — GLTF/GLB upload with drag-and-drop, shows model info (vertices, faces) after load
- **EffectSelector** — Effect list selector (mirrors StyleSelector interface)

### Morph Effect UI

When the Morph effect is selected, ParamPanel shows an additional field for uploading the target model. ParticleEngine re-samples both models and adds `aTargetPosition` attribute.

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
│   ├── App.tsx              → Modified: becomes router entry (Home page)
│   ├── App2D.tsx            → New file: current App.tsx content, no logic changes
│   ├── App3D.tsx            → New: 3D page main component
│   ├── ModelUploader.tsx    → New: model upload component
│   └── EffectSelector.tsx   → New: effect selector (mirrors StyleSelector)
├── lib/
│   ├── ParticleEngine.ts    → New: particle engine (Three.js scene, sampling, render loop)
│   └── EffectRegistry.ts    → New: effect registry (mirrors StyleRegistry)
├── shaders/                 → Unchanged (2D shaders)
├── shaders3d/               → New directory
│   ├── core.vert            → Core vertex shader framework
│   ├── particle_default.frag→ Default fragment shader (circle particle)
│   ├── surface.vert.chunk   → Surface particles effect
│   ├── explosion.vert.chunk → Explosion/aggregation effect
│   ├── morph.vert.chunk     → Morph transition effect
│   ├── vortex.vert.chunk    → Rotation/vortex effect
│   └── density.vert.chunk   → Density simulation effect
└── types.ts                 → Extended: add EffectDef, EffectId types
```

### Design Principle
- All existing 2D code remains untouched (only the entry point changes)
- ParamPanel and ActionBar are reused directly (same interface: `params: ParamDef[]`, `values`)
- 3D code is fully decoupled from 2D code

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
3. ParticleEngine assembles shader: core.vert + effect chunk
4. Compile new ShaderMaterial, apply to Points
5. Initialize params to effect defaults (with randomization, matching 2D behavior)

### Parameter Adjustment Flow
1. User moves slider in ParamPanel
2. React state update → uniform value updated on ShaderMaterial
3. Next frame: vertex shader reads new uniform, computes positions
4. No shader recompilation needed (uniforms are dynamic)

### Mouse Interaction
- Track mouse position in NDC coordinates
- Pass to shader as `uMouse` uniform
- Core vertex shader applies `mouseDeformation()` after effect transform
- Particles near mouse are pushed away or attracted based on `uMouseRadius`

## Performance Considerations

- Shader-based animation: all position computation on GPU, no CPU bottleneck
- Uniform updates are cheap (no recompilation)
- Particle count change requires BufferGeometry rebuild (infrequent operation)
- Surface sampling is one-time cost on model load / effect switch (surface vs volumetric)
- Volumetric sampling is more expensive than surface sampling; show loading indicator
