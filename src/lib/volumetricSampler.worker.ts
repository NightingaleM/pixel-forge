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
  timing: number
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
        if (raycaster.intersectObject(mesh).length % 2 === 1) {
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

  const timing = performance.now() - t0

  const msg: CompleteMessage = {
    type: 'complete',
    insideVoxels: new Int32Array(insideVoxels),
    timing,
  }
  ;(self as unknown as Worker).postMessage(msg, [msg.insideVoxels.buffer])

  material.dispose()
  geometry.dispose()
}
