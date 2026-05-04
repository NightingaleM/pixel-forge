# SDF Boundary Constraints for Density Simulation

## Problem

Particles in the density simulation effect have no boundary constraint — noise-based displacement causes them to drift outside the model mesh, breaking the visual effect.

## Approach

Extend the existing `volumetricSampler.worker.ts` to generate a 3D SDF (Signed Distance Field) texture alongside the interior voxel data. The SDF is uploaded as a `Data3DTexture` and sampled in the vertex shader to detect and reflect particles at model boundaries.

## SDF Generation

**Location:** `volumetricSampler.worker.ts` (extend, not replace)

**Algorithm:**
1. Existing raycasting logic produces a binary inside/outside grid (32³ voxels)
2. Apply Felzenszwalb-Huttenlocher EDT (Euclidean Distance Transform) to compute exact distances
3. Sign convention: positive inside, negative outside
4. Convert voxel-space distances to world-space: `worldDist = voxelDist × modelSize / resolution`
5. Return both `insideVoxels` (Int32Array, for particle sampling) and `sdfData` (Float32Array, for texture)

**Performance:** EDT runs in O(n) per dimension. For 32³ = 32K voxels, this is effectively instant (< 1ms).

**Memory:** 32³ × float32 = 32 KB.

## Texture Upload

In `ParticleEngine.ts`, create `THREE.Data3DTexture`:
- Resolution: 32 × 32 × 32
- Format: `THREE.RedFormat`, Type: `THREE.FloatType`
- Min/Mag filter: `LinearFilter` (trilinear interpolation)
- Wrap: `ClampToEdgeWrapping`

## Coordinate Mapping

Model is normalized to unit bounding box centered at origin. Grid covers `[-0.5, 0.5]` cube.

```glsl
vec3 sdfCoord = (position - uSDFOrigin) * uSDFScale;
// uSDFOrigin ≈ vec3(-0.5), uSDFScale ≈ vec3(2.0)
```

## Shader Changes — `density.vert.chunk`

**New uniforms:**
- `uniform sampler3D uSDFTexture` — the 3D SDF texture
- `uniform vec3 uSDFOrigin` — grid origin (bbox min)
- `uniform vec3 uSDFScale` — 1 / grid extent
- `uniform float uSDFMargin` — boundary trigger threshold (default 0.01)
- `uniform float uBounceStrength` — reflection intensity (default 0.8)

**Reflection algorithm in `effectTransform()`:**
1. Compute noise-displaced position `tempPos`
2. Sample SDF: `float d = texture(uSDFTexture, sdfCoord).r`
3. If `d < uSDFMargin` (near or past boundary):
   a. Compute SDF gradient via 6-tap central differences → surface normal
   b. Reflect displacement vector off gradient: `reflected = reflect(displacement, normalize(gradient))`
   c. Apply reflected displacement scaled by `uBounceStrength`
   d. If still outside after reflection, clamp to surface inner side

## EffectRegistry.ts

Add to density effect params:
- `uSDFMargin`: range [0.0, 0.05], step 0.005, default 0.01
- `uBounceStrength`: range [0.0, 1.0], step 0.05, default 0.8

SDF texture and coordinate uniforms are set programmatically (not user-facing).

## Data Flow

```
Worker:
  raycasting → binary grid → EDT → SDF Float32Array
       ↓                              ↓
Main thread:
  particle sampling          Data3DTexture → shader uniform
                                            ↓
Shader:
  effectTransform() → SDF boundary check → gradient reflection
```

## Files to Modify

1. `src/lib/volumetricSampler.worker.ts` — add EDT + SDF output
2. `src/lib/ParticleEngine.ts` — create Data3DTexture, add uniforms
3. `src/shaders3d/density.vert.chunk` — SDF sampling + reflection logic
4. `src/lib/EffectRegistry.ts` — add margin/bounce params to density effect
