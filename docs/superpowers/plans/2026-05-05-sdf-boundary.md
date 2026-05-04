# SDF Boundary Constraints for Density Simulation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SDF (Signed Distance Field) boundary constraints to the density simulation particle effect so particles bounce off model interior walls instead of flying out.

**Architecture:** Extend the volumetric sampler Worker to generate a 32³ SDF using Felzenszwalb-Huttenlocher EDT on the binary inside/outside grid. Upload the SDF as a `THREE.Data3DTexture`. In the vertex shader, sample the SDF at the displaced particle position; if the particle is near or past the boundary, compute the SDF gradient via central differences and reflect the displacement vector.

**Tech Stack:** Three.js `Data3DTexture`, GLSL `sampler3D`, Web Worker, Felzenszwalb-Huttenlocher O(n) EDT

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/volumetricSampler.worker.ts` | Modify | Build binary grid during raycasting; compute SDF via EDT; return `sdfData: Float32Array` |
| `src/lib/ParticleEngine.ts` | Modify | Receive SDF data; create `Data3DTexture`; pass SDF uniforms to shader |
| `src/shaders3d/density.vert.chunk` | Modify | Declare SDF uniforms; implement gradient reflection in `effectTransform()` |
| `src/lib/EffectRegistry.ts` | Modify | Add `uSDFMargin` and `uBounceStrength` user-facing params to density effect |

---

### Task 1: Add SDF Generation to Worker

**Files:**
- Modify: `src/lib/volumetricSampler.worker.ts`

**Context:** The worker already does 32³ raycasting to determine inside/outside. We build a binary grid during the same loop, then run EDT to compute signed distances.

- [ ] **Step 1: Add `sdfData` to the `CompleteMessage` interface and the binary grid + EDT functions**

Replace the entire file with:

```typescript
import * as THREE from 'three'

interface WorkerInput {
  positions: Float32Array
  indices: Uint32Array | null
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
  resolution: number
}

interface ProgressMessage {
  type: 'progress'
  progress: number
}

interface CompleteMessage {
  type: 'complete'
  insideVoxels: Int32Array
  sdfData: Float32Array
  timing: number
}

// ---------------------------------------------------------------------------
// Felzenszwalb-Huttenlocher 1D EDT with physical spacing
// Computes min squared Euclidean distance along one axis.
// `f` is modified in-place: f[offset + q * stride] holds the partial result.
// `spacing` is the world-space size of one voxel along this axis.
// ---------------------------------------------------------------------------
function edt1d(
  f: Float32Array,
  offset: number,
  stride: number,
  n: number,
  spacing: number,
): void {
  if (n === 0) return
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const sp2 = spacing * spacing

  let k = 0
  v[0] = 0
  z[0] = -1e20
  z[1] = 1e20

  for (let q = 1; q < n; q++) {
    const fq = f[offset + q * stride]
    const q2 = q * q
    let s: number
    for (;;) {
      const vk = v[k]
      const fvk = f[offset + vk * stride]
      s = (fq - fvk + sp2 * (q2 - vk * vk)) / (2 * sp2 * (q - vk))
      if (s > z[k]) break
      k--
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = 1e20
  }

  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dx = (q - v[k]) * spacing
    f[offset + q * stride] = dx * dx + f[offset + v[k] * stride]
  }
}

// ---------------------------------------------------------------------------
// Compute SDF from binary grid via separable 3-pass EDT.
// Grid layout: index = ix + iy*res + iz*res*res
// Returns Float32Array[res³] — positive inside, negative outside.
// ---------------------------------------------------------------------------
function computeSDF(
  grid: Uint8Array,
  res: number,
  cellX: number,
  cellY: number,
  cellZ: number,
): Float32Array {
  const total = res * res * res
  const INF = 1e10

  // Distance from each voxel to nearest OUTSIDE voxel (meaningful for inside voxels)
  const dOut = new Float32Array(total)
  // Distance from each voxel to nearest INSIDE voxel (meaningful for outside voxels)
  const dIn = new Float32Array(total)

  for (let i = 0; i < total; i++) {
    const inside = grid[i] === 1
    dOut[i] = inside ? INF : 0
    dIn[i] = inside ? 0 : INF
  }

  // Separable 3-pass EDT along each axis — X (stride=1)
  for (let iz = 0; iz < res; iz++)
    for (let iy = 0; iy < res; iy++)
      edt1d(dOut, iy * res + iz * res * res, 1, res, cellX)
  // Y (stride=res)
  for (let iz = 0; iz < res; iz++)
    for (let ix = 0; ix < res; ix++)
      edt1d(dOut, ix + iz * res * res, res, res, cellY)
  // Z (stride=res*res)
  for (let iy = 0; iy < res; iy++)
    for (let ix = 0; ix < res; ix++)
      edt1d(dOut, ix + iy * res, res * res, res, cellZ)

  // Same for dIn
  for (let iz = 0; iz < res; iz++)
    for (let iy = 0; iy < res; iy++)
      edt1d(dIn, iy * res + iz * res * res, 1, res, cellX)
  for (let iz = 0; iz < res; iz++)
    for (let ix = 0; ix < res; ix++)
      edt1d(dIn, ix + iz * res * res, res, res, cellY)
  for (let iy = 0; iy < res; iy++)
    for (let ix = 0; ix < res; ix++)
      edt1d(dIn, ix + iy * res, res * res, res, cellZ)

  // Combine into signed distance field (world-space units)
  const sdf = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    sdf[i] = grid[i] === 1 ? Math.sqrt(dOut[i]) : -Math.sqrt(dIn[i])
  }
  return sdf
}

self.onmessage = function (e: MessageEvent<WorkerInput>) {
  const { positions, indices, center: c, size: s, resolution: res } = e.data
  const t0 = performance.now()

  // Reconstruct geometry for raycasting
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (indices) {
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  }

  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)

  const raycaster = new THREE.Raycaster()
  const direction = new THREE.Vector3(1, 0, 0)

  const cellX = s.x / res
  const cellY = s.y / res
  const cellZ = s.z / res
  const halfRes = res * 0.5

  const insideVoxels: number[] = []
  const grid = new Uint8Array(res * res * res) // binary inside/outside
  const totalVoxels = res * res * res
  let processed = 0
  let lastReportedProgress = -5

  const testPoint = new THREE.Vector3()

  for (let iz = 0; iz < res; iz++) {
    for (let iy = 0; iy < res; iy++) {
      for (let ix = 0; ix < res; ix++) {
        testPoint.set(
          c.x + (ix - halfRes + 0.5) * cellX,
          c.y + (iy - halfRes + 0.5) * cellY,
          c.z + (iz - halfRes + 0.5) * cellZ,
        )
        raycaster.set(testPoint, direction)
        const inside = raycaster.intersectObject(mesh).length % 2 === 1
        if (inside) {
          grid[ix + iy * res + iz * res * res] = 1
          insideVoxels.push(ix, iy, iz)
        }

        processed++
        const progress = Math.floor((processed / totalVoxels) * 100)
        if (progress >= lastReportedProgress + 5) {
          lastReportedProgress = progress
          const msg: ProgressMessage = { type: 'progress', progress }
          ;(self as unknown as Worker).postMessage(msg)
        }
      }
    }
  }

  // Compute SDF from binary grid
  const sdfData = computeSDF(grid, res, cellX, cellY, cellZ)

  const timing = performance.now() - t0

  const msg: CompleteMessage = {
    type: 'complete',
    insideVoxels: new Int32Array(insideVoxels),
    sdfData,
    timing,
  }
  ;(self as unknown as Worker).postMessage(msg, [msg.insideVoxels.buffer, msg.sdfData.buffer])

  material.dispose()
  geometry.dispose()
}
```

- [ ] **Step 2: Verify worker builds**

Run: `npx tsc --noEmit src/lib/volumetricSampler.worker.ts` (or `npm run build`)
Expected: No type errors. The worker now returns `sdfData` alongside `insideVoxels`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/volumetricSampler.worker.ts
git commit -m "feat(sdf): add SDF generation via EDT to volumetric sampler worker"
```

---

### Task 2: Handle SDF Data and Create Texture in ParticleEngine

**Files:**
- Modify: `src/lib/ParticleEngine.ts`

- [ ] **Step 1: Add SDF texture storage field**

At `src/lib/ParticleEngine.ts:53` (after `modelInfo` field), add:

```typescript
  // SDF texture for density boundary constraint
  sdfTexture: THREE.Data3DTexture | null = null
```

- [ ] **Step 2: Receive SDF data in `volumetricSampleAsync` and create texture**

In `volumetricSampleAsync()` at the `data.type === 'complete'` handler (around line 579), after extracting `insideVoxels` and before `worker.terminate()`, add SDF texture creation. The existing code structure at lines 579–621 should be updated.

Replace the entire `if (data.type === 'complete')` block (lines 579–622) with:

```typescript
        if (data.type === 'complete') {
          console.log(`[ParticleEngine] volumetric voxel grid (worker): ${data.timing.toFixed(1)}ms`)
          const insideVoxels = data.insideVoxels as Int32Array
          const sdfData = data.sdfData as Float32Array | undefined
          worker.terminate()

          if (insideVoxels.length === 0) {
            console.warn('No inside voxels found in volumetric mode')
            resolve()
            return
          }

          // Create SDF 3D texture (guard against missing data from older worker)
          if (this.sdfTexture) this.sdfTexture.dispose()
          if (sdfData && sdfData.length > 0) {
            this.sdfTexture = new THREE.Data3DTexture(sdfData, 32, 32, 32)
          this.sdfTexture.format = THREE.RedFormat
          this.sdfTexture.type = THREE.FloatType
          this.sdfTexture.minFilter = THREE.LinearFilter
          this.sdfTexture.magFilter = THREE.LinearFilter
          this.sdfTexture.wrapS = THREE.ClampToEdgeWrapping
          this.sdfTexture.wrapT = THREE.ClampToEdgeWrapping
          this.sdfTexture.wrapR = THREE.ClampToEdgeWrapping
          this.sdfTexture.needsUpdate = true
          }

          // Store SDF coordinate mapping (bbox min + 1/size)
          const res = 32
          const cellX = size.x / res
          const cellY = size.y / res
          const cellZ = size.z / res
          const halfRes = res * 0.5

          this._sdfOrigin = new THREE.Vector3(
            center.x - halfRes * cellX,
            center.y - halfRes * cellY,
            center.z - halfRes * cellZ,
          )
          this._sdfScale = new THREE.Vector3(1 / size.x, 1 / size.y, 1 / size.z)

          const voxelCount = insideVoxels.length / 3
          const color = new THREE.Color()

          for (let i = 0; i < count; i++) {
            const idx = Math.floor(Math.random() * voxelCount) * 3
            const ix = insideVoxels[idx]
            const iy = insideVoxels[idx + 1]
            const iz = insideVoxels[idx + 2]

            const px = center.x + (ix - halfRes + Math.random()) * cellX
            const py = center.y + (iy - halfRes + Math.random()) * cellY
            const pz = center.z + (iz - halfRes + Math.random()) * cellZ

            positions.push(px, py, pz)
            normals.push(0, 0, 1)

            const hue = (px + py + pz) * 0.3 + Math.random() * 0.15
            const saturation = 0.5 + Math.random() * 0.3
            const lightness = 0.4 + Math.random() * 0.4
            color.setHSL(hue % 1.0, saturation, lightness)
            colors.push(color.r, color.g, color.b)

            sizes.push(0.7 + Math.random() * 0.6)
            randoms.push(Math.random())
          }

          resolve()
        }
```

- [ ] **Step 3: Add private fields for SDF coordinate mapping**

At `src/lib/ParticleEngine.ts:43` (after `tempInvMVP` field), add:

```typescript
  private _sdfOrigin = new THREE.Vector3(-0.5, -0.5, -0.5)
  private _sdfScale = new THREE.Vector3(2, 2, 2)
```

- [ ] **Step 4: Add SDF uniforms in `applyMaterial()` for density effect**

In `applyMaterial()`, after the uniform-building loop (line 680, after the `forEach`), and before the morph check (line 685), insert:

```typescript
      // Add SDF texture + coordinate uniforms for density effect
      // (dispose on non-density to prevent GPU memory leak)
      if (effectDef.id === 'density' && this.sdfTexture) {
        uniforms.uSDFTexture = { value: this.sdfTexture }
        uniforms.uSDFOrigin = { value: this._sdfOrigin }
        uniforms.uSDFScale = { value: this._sdfScale }
      } else if (effectDef.id !== 'density' && this.sdfTexture) {
        this.sdfTexture.dispose()
        this.sdfTexture = null
      }
```

- [ ] **Step 5: Dispose SDF texture in `dispose()`**

In `dispose()`, after disposing `currentMaterial` (around line 1073), add:

```typescript
    // Dispose SDF texture
    if (this.sdfTexture) {
      this.sdfTexture.dispose()
      this.sdfTexture = null
    }
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: No errors. ParticleEngine now creates SDF texture and passes it as uniform.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ParticleEngine.ts
git commit -m "feat(sdf): create Data3DTexture from worker SDF and pass to shader"
```

---

### Task 3: Update Density Vertex Shader with SDF Boundary Logic

**Files:**
- Modify: `src/shaders3d/density.vert.chunk`

- [ ] **Step 1: Replace the entire chunk with SDF-aware version**

Replace the entire content of `src/shaders3d/density.vert.chunk` with:

```glsl
// SDF boundary uniforms (declared here — not float, so not in EFFECT_UNIFORMS)
uniform sampler3D uSDFTexture;
uniform vec3 uSDFOrigin;
uniform vec3 uSDFScale;

// Simple noise function
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 effectTransform(vec3 position, vec3 normal, float random, float time) {
  float n = noise(position * uNoiseScale + time * uNoiseSpeed);
  float displacement = (n - 0.5) * uDensityStrength;

  // Deterministic pseudo-random direction based on particle's random seed
  float angle1 = random * 6.2831853;
  float angle2 = fract(random * 7.31 + 0.5) * 6.2831853;
  vec3 dir = vec3(
    cos(angle1) * sin(angle2),
    sin(angle1) * sin(angle2),
    cos(angle2)
  );

  vec3 tempPos = position + dir * displacement;

  // --- SDF boundary constraint ---
  vec3 sdfCoord = (tempPos - uSDFOrigin) * uSDFScale;
  float d = texture(uSDFTexture, sdfCoord).r;

  if (d < uSDFMargin) {
    // Compute gradient (surface normal) via 6-tap central differences
    float eps = 0.5 / 32.0; // half voxel in texture space
    vec3 gradRaw = vec3(
      texture(uSDFTexture, sdfCoord + vec3(eps, 0.0, 0.0)).r
        - texture(uSDFTexture, sdfCoord - vec3(eps, 0.0, 0.0)).r,
      texture(uSDFTexture, sdfCoord + vec3(0.0, eps, 0.0)).r
        - texture(uSDFTexture, sdfCoord - vec3(0.0, eps, 0.0)).r,
      texture(uSDFTexture, sdfCoord + vec3(0.0, 0.0, eps)).r
        - texture(uSDFTexture, sdfCoord - vec3(0.0, 0.0, eps)).r
    );
    float gradLen = length(gradRaw);
    if (gradLen > 1e-6) {
      vec3 grad = gradRaw / gradLen;

      // Reflect displacement off gradient normal
      vec3 reflDir = reflect(dir, grad);
      tempPos = position + reflDir * abs(displacement) * uBounceStrength;

      // If still outside after reflection, clamp to surface inner side
      vec3 clampCoord = (tempPos - uSDFOrigin) * uSDFScale;
      float clampD = texture(uSDFTexture, clampCoord).r;
      if (clampD < uSDFMargin) {
        tempPos += grad * (uSDFMargin - clampD + 0.001);
      }
    } else {
      // Zero gradient — just push particle inward by the violation amount
      tempPos += normalize(position) * (uSDFMargin - d + 0.001);
    }
  }

  return tempPos;
}

float effectSize(float baseSize, float random, float time) {
  return uBaseSize * (0.5 + random * 0.5);
}
```

**Key design decisions:**
- `sampler3D` and `vec3` uniforms are declared in the chunk (not via `%%EFFECT_UNIFORMS%%` which only handles `float`)
- `uSDFMargin` and `uBounceStrength` are `float` uniforms declared via `%%EFFECT_UNIFORMS%%` from EffectRegistry
- Gradient eps = half voxel in tex coord space ≈ 0.0156
- If reflection still leaves particle outside, a hard clamp pushes it to `margin` inside the surface

- [ ] **Step 2: Verify shader compiles (at runtime)**

This is verified in Task 5 integration testing. No static GLSL check needed — Three.js will log compile errors to console.

- [ ] **Step 3: Commit**

```bash
git add src/shaders3d/density.vert.chunk
git commit -m "feat(sdf): add SDF gradient reflection boundary constraint to density shader"
```

---

### Task 4: Add SDF User-Facing Parameters to EffectRegistry

**Files:**
- Modify: `src/lib/EffectRegistry.ts`

- [ ] **Step 1: Add `uSDFMargin` and `uBounceStrength` params to density effect**

In `src/lib/EffectRegistry.ts:106-111`, the density params array currently has three params. Add two more.

Change lines 106–111 from:

```typescript
      params: [
        { name: 'effect.density.noiseScale', uniform: 'uNoiseScale', min: 0.1, max: 5.0, step: 0.1, default: 1.0 },
        { name: 'effect.density.noiseSpeed', uniform: 'uNoiseSpeed', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
        { name: 'effect.density.densityStrength', uniform: 'uDensityStrength', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
      ],
```

to:

```typescript
      params: [
        { name: 'effect.density.noiseScale', uniform: 'uNoiseScale', min: 0.1, max: 5.0, step: 0.1, default: 1.0 },
        { name: 'effect.density.noiseSpeed', uniform: 'uNoiseSpeed', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
        { name: 'effect.density.densityStrength', uniform: 'uDensityStrength', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
        { name: 'effect.density.sdfMargin', uniform: 'uSDFMargin', min: 0.0, max: 0.05, step: 0.005, default: 0.01 },
        { name: 'effect.density.bounceStrength', uniform: 'uBounceStrength', min: 0.0, max: 1.0, step: 0.05, default: 0.8 },
      ],
```

- [ ] **Step 2: Add i18n translation keys**

You will also need to add translation keys for the two new params. Check where the existing `effect.density.*` keys are defined and add:
- `effect.density.sdfMargin` — "SDF Margin" / "边界距离"
- `effect.density.bounceStrength` — "Bounce Strength" / "反弹强度"

This is a minor change — find the locale JSON files and add the entries. If the project uses auto-fallback for unknown keys, this step is optional (the key itself will display).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/EffectRegistry.ts
git commit -m "feat(sdf): add SDF margin and bounce strength params to density effect"
```

---

### Task 5: Integration Testing and Verification

**Files:** No changes — manual testing only.

- [ ] **Step 1: Build and start dev server**

Run: `npm run dev`
Open the app in a browser.

- [ ] **Step 2: Test SDF generation**

1. Load a 3D model (any GLTF/GLB)
2. Select the "Density" effect
3. Open browser DevTools console — check for:
   - `[ParticleEngine] volumetric voxel grid (worker): Xms` — worker completed
   - No WebGL shader compile errors
   - `Built uniforms:` log should include `uSDFTexture`, `uSDFOrigin`, `uSDFScale`, `uSDFMargin`, `uBounceStrength`

- [ ] **Step 3: Verify boundary constraint visually**

1. With `uDensityStrength` at 0.5 or higher, particles should move inside the model
2. No particles should visibly escape outside the model boundary
3. Particles near the surface should appear to "bounce" back

- [ ] **Step 4: Test param controls**

1. Adjust `uSDFMargin` slider — higher values should keep particles further from walls
2. Adjust `uBounceStrength` slider — 0 should let particles pass through, 1 should give strong reflection
3. Verify no console errors during slider adjustment

- [ ] **Step 5: Test edge cases**

1. Load a very thin model (flat plane) — particles should still stay inside
2. Load a model with thin protrusions — check that SDF boundary works in narrow regions
3. Switch between effects (density → surface → density) — SDF should regenerate without errors

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix(sdf): address integration testing findings"
```
