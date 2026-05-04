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
// Returns Float32Array[res^3] — positive inside, negative outside.
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

  const dOut = new Float32Array(total)
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
