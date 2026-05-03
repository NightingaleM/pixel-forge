import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import type { EffectDef, ModelInfo, SamplingType } from '../types'
import coreVertSource from '../shaders3d/core.vert?raw'

/**
 * Type guard to check if material is a ShaderMaterial
 */
function isShaderMaterial(material: THREE.Material): material is THREE.ShaderMaterial {
  return material.type === 'ShaderMaterial'
}

/**
 * ParticleEngine - Core 3D particle animation engine with Three.js
 * Handles model loading, particle sampling, shader assembly, and animation loop
 */
export class ParticleEngine {
  // Three.js core objects
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls

  // Particle system
  particles: THREE.Points | null = null
  animationId: number | null = null
  canvas: HTMLCanvasElement
  clock: THREE.Clock

  // Mouse interaction
  mouseNDC: THREE.Vector2  // Normalized Device Coordinates [-1, 1]

  // Shader material management
  currentMaterial: THREE.Material | null = null
  previousMaterial: THREE.Material | null = null  // Fallback on error

  // Model handling
  modelGeometry: THREE.BufferGeometry | null = null
  modelInfo: ModelInfo | null = null
  targetGeometry: THREE.BufferGeometry | null = null  // For morph effects
  originalMesh: THREE.Object3D | null = null  // Raw model for "none" effect

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.clock = new THREE.Clock()
    this.mouseNDC = new THREE.Vector2(0, 0)

    // Initialize Three.js scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)

    // Initialize camera
    const aspect = canvas.clientWidth / canvas.clientHeight
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000)
    this.camera.position.set(0, 0, 3)

    // Initialize renderer with context loss handling
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    })
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Initialize controls
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.enableZoom = true
    this.controls.autoRotate = false

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 7)
    this.scene.add(directionalLight)

    // Setup mouse interaction
    this.setupMouseInteraction()

    // Setup WebGL context loss handler
    this.setupContextLossHandler()

    // Setup resize handler
    window.addEventListener('resize', this.onResize.bind(this))
  }

  /**
   * Convert mouse screen coordinates to Normalized Device Coordinates (NDC)
   * NDC range: [-1, 1] for both x and y
   */
  private setupMouseInteraction(): void {
    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.mouseNDC.set(x, y)

      // Update shader uniform if material exists
      if (this.currentMaterial && isShaderMaterial(this.currentMaterial)) {
        this.currentMaterial.uniforms.uMouse.value.set(x, y)
      }
    })

    // Keep last mouse position when cursor leaves canvas (don't reset to center)
  }

  /**
   * Handle WebGL context loss (e.g., due to GPU switching or crashes)
   */
  private setupContextLossHandler(): void {
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      this.stop()
      console.warn('WebGL context lost - attempting to restore...')
    })

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored - reinitializing renderer')
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight)
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      // Re-apply current material if exists
      if (this.currentMaterial && this.modelGeometry) {
        // Recreate particle system with current material
        this.particles = new THREE.Points(this.modelGeometry, this.currentMaterial)
        this.scene.add(this.particles)
      }

      this.start()
    })
  }

  /**
   * Handle window resize
   */
  private onResize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(width, height)
  }

  /**
   * Load a GLTF model and extract geometry information
   * @param data - GLTF model data (ArrayBuffer or string URL)
   * @returns ModelInfo with vertex and face counts
   */
  async loadModel(data: ArrayBuffer | string): Promise<ModelInfo> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader()

      const onLoad = (gltf: any) => {
        // Collect all meshes from the GLTF scene
        gltf.scene.updateMatrixWorld(true)
        const meshes: THREE.Mesh[] = []
        gltf.scene.traverse((child: any) => {
          if (child.isMesh) meshes.push(child)
        })

        if (meshes.length === 0) {
          reject(new Error('No mesh found in GLTF model'))
          return
        }

        // Merge all mesh geometries (apply each mesh's world transform)
        let geometry: THREE.BufferGeometry
        if (meshes.length === 1) {
          geometry = meshes[0].geometry.clone()
          geometry.applyMatrix4(meshes[0].matrixWorld)
        } else {
          geometry = this.mergeMeshGeometries(meshes)
        }

        // Normalize geometry to unit bounding box
        this.modelGeometry = this.normalizeGeometry(geometry)

        // Save original mesh for "none" (raw display) mode
        this.removeOriginalMesh()
        const gltfScene = gltf.scene.clone()
        // Normalize the cloned GLTF scene to match particle geometry scale
        this.normalizeScene(gltfScene)
        this.originalMesh = gltfScene
        this.originalMesh.visible = false
        this.scene.add(this.originalMesh)

        // Extract model info
        const positionAttribute = this.modelGeometry.getAttribute('position')
        const indexAttribute = this.modelGeometry.getIndex()

        this.modelInfo = {
          vertices: positionAttribute.count,
          faces: indexAttribute ? indexAttribute.count / 3 : positionAttribute.count / 3,
        }

        resolve(this.modelInfo)
      }

      const onError = (error: any) => {
        reject(new Error(`Failed to load GLTF model: ${error.message}`))
      }

      // Load based on data type
      if (typeof data === 'string') {
        loader.load(data, onLoad, undefined, onError)
      } else {
        loader.parse(data, '', onLoad, onError)
      }
    })
  }

  /**
   * Load target model for morph transition effects
   * @param data - GLTF model data
   */
  async loadTargetModel(data: ArrayBuffer | string): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader()

      const onLoad = (gltf: any) => {
        gltf.scene.updateMatrixWorld(true)
        const meshes: THREE.Mesh[] = []
        gltf.scene.traverse((child: any) => {
          if (child.isMesh) meshes.push(child)
        })

        if (meshes.length === 0) {
          reject(new Error('No mesh found in target GLTF model'))
          return
        }

        let geometry: THREE.BufferGeometry
        if (meshes.length === 1) {
          geometry = meshes[0].geometry.clone()
          geometry.applyMatrix4(meshes[0].matrixWorld)
        } else {
          geometry = this.mergeMeshGeometries(meshes)
        }

        this.targetGeometry = this.normalizeGeometry(geometry)
        resolve()
      }

      const onError = (error: any) => {
        reject(new Error(`Failed to load target GLTF model: ${error.message}`))
      }

      if (typeof data === 'string') {
        loader.load(data, onLoad, undefined, onError)
      } else {
        loader.parse(data, '', onLoad, onError)
      }
    })
  }

  /**
   * Merge multiple mesh geometries into one, applying each mesh's world transform
   */
  private mergeMeshGeometries(meshes: THREE.Mesh[]): THREE.BufferGeometry {
    const allPositions: number[] = []
    const allNormals: number[] = []
    const allIndices: number[] = []
    let vertexOffset = 0

    for (const mesh of meshes) {
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)

      const pos = g.getAttribute('position')
      const norm = g.hasAttribute('normal') ? g.getAttribute('normal') : null
      const idx = g.index

      for (let i = 0; i < pos.count; i++) {
        allPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
        if (norm) {
          allNormals.push(norm.getX(i), norm.getY(i), norm.getZ(i))
        } else {
          allNormals.push(0, 1, 0)
        }
      }

      if (idx) {
        for (let i = 0; i < idx.count; i++) {
          allIndices.push(idx.getX(i) + vertexOffset)
        }
      }

      vertexOffset += pos.count
    }

    const merged = new THREE.BufferGeometry()
    merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3))
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3))
    if (allIndices.length > 0) {
      merged.setIndex(allIndices)
    }
    return merged
  }

  /**
   * Normalize geometry to fit within a unit bounding box centered at origin
   * Ensures consistent particle distribution regardless of model scale
   */
  private normalizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    geometry.computeBoundingBox()
    const boundingBox = geometry.boundingBox!

    const center = new THREE.Vector3()
    boundingBox.getCenter(center)

    const size = new THREE.Vector3()
    boundingBox.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 1.0 / maxDim

    // Create transformation matrix
    const matrix = new THREE.Matrix4()
    matrix.makeTranslation(-center.x, -center.y, -center.z)
    matrix.scale(new THREE.Vector3(scale, scale, scale))

    // Apply transformation to position attribute
    const positions = geometry.getAttribute('position')
    const vertex = new THREE.Vector3()

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i)
      vertex.applyMatrix4(matrix)
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z)
    }

    // Also transform normals if present
    if (geometry.hasAttribute('normal')) {
      const normals = geometry.getAttribute('normal')
      const normal = new THREE.Vector3()

      for (let i = 0; i < normals.count; i++) {
        normal.fromBufferAttribute(normals, i)
        normal.transformDirection(matrix)
        normals.setXYZ(i, normal.x, normal.y, normal.z)
      }
    }

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    return geometry
  }

  /**
   * Normalize a GLTF scene to match the same centering/scaling as normalizeGeometry
   */
  private normalizeScene(scene: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)

    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 1.0 / maxDim

    scene.position.sub(center).multiplyScalar(scale)
    scene.scale.setScalar(scale)
  }

  /**
   * @param type - Sampling type: 'surface' or 'volumetric'
   */
  sampleParticles(count: number, type: SamplingType): void {
    if (!this.modelGeometry) {
      throw new Error('No model loaded. Call loadModel() first.')
    }

    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const colors: number[] = []
    const normals: number[] = []
    const sizes: number[] = []
    const randoms: number[] = []

    // Pre-compute target positions for morph effect
    const targetPositions: number[] = []

    if (type === 'surface') {
      this.surfaceSample(count, positions, colors, normals, sizes, randoms, targetPositions)
    } else {
      this.volumetricSample(count, positions, colors, normals, sizes, randoms)
    }

    // Set geometry attributes
    const posBuffer = new THREE.Float32BufferAttribute(positions, 3)
    geometry.setAttribute('position', posBuffer)    // Three.js needs this for vertex count
    geometry.setAttribute('aPosition', posBuffer)    // Shader reads from this
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
    geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 1))

    // Add target positions attribute for morph effect
    if (targetPositions.length > 0) {
      geometry.setAttribute('aTargetPosition', new THREE.Float32BufferAttribute(targetPositions, 3))
    }

    // Store geometry for later use
    this.modelGeometry = geometry

    // Remove old particles
    if (this.particles) {
      this.scene.remove(this.particles)
      this.particles.geometry.dispose()
    }

    // Create new particle system with temporary visible material
    // (will be replaced with shader material in applyMaterial)
    const tempMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.0,
      sizeAttenuation: true,
    })
    this.particles = new THREE.Points(geometry, tempMaterial)
    this.particles.frustumCulled = false
    this.scene.add(this.particles) // Add to scene immediately

    // Sync orbit controls target to particle system center
    geometry.computeBoundingSphere()
    if (geometry.boundingSphere) {
      this.controls.target.copy(geometry.boundingSphere.center)
    }
  }

  /**
   * Surface sampling using MeshSurfaceSampler
   * Samples particles on the mesh surface with proper distribution
   */
  private surfaceSample(
    count: number,
    positions: number[],
    colors: number[],
    normals: number[],
    sizes: number[],
    randoms: number[],
    targetPositions: number[]
  ): void {
    if (!this.modelGeometry) return

    // Create temporary mesh for sampling
    const tempGeometry = this.modelGeometry.clone()
    const tempMaterial = new THREE.MeshBasicMaterial()
    const tempMesh = new THREE.Mesh(tempGeometry, tempMaterial)

    const sampler = new MeshSurfaceSampler(tempMesh)
    sampler.build()

    const tempPosition = new THREE.Vector3()
    const tempNormal = new THREE.Vector3()
    const color = new THREE.Color()

    // If target geometry exists, sample from it too
    let targetSampler: MeshSurfaceSampler | null = null
    let tempTargetMesh: THREE.Mesh | null = null
    const tempTargetPosition = new THREE.Vector3()

    if (this.targetGeometry) {
      const tempTargetGeometry = this.targetGeometry.clone()
      const tempTargetMaterial = new THREE.MeshBasicMaterial()
      tempTargetMesh = new THREE.Mesh(tempTargetGeometry, tempTargetMaterial)
      targetSampler = new MeshSurfaceSampler(tempTargetMesh)
      targetSampler.build()
    }

    for (let i = 0; i < count; i++) {
      // Sample from source geometry
      sampler.sample(tempPosition, tempNormal)
      positions.push(tempPosition.x, tempPosition.y, tempPosition.z)
      normals.push(tempNormal.x, tempNormal.y, tempNormal.z)

      // Generate color based on position with variation
      const hue = (tempPosition.x + 1) * 0.5 + Math.random() * 0.1
      const saturation = 0.6 + Math.random() * 0.2
      const lightness = 0.5 + Math.random() * 0.3
      color.setHSL(hue % 1.0, saturation, lightness)
      colors.push(color.r, color.g, color.b)

      // Random size and random value
      sizes.push(0.8 + Math.random() * 0.4)
      randoms.push(Math.random())

      // Sample from target geometry if available
      if (targetSampler && tempTargetMesh) {
        targetSampler.sample(tempTargetPosition)
        targetPositions.push(tempTargetPosition.x, tempTargetPosition.y, tempTargetPosition.z)
      }
    }

    // Cleanup
    tempGeometry.dispose()
    tempMaterial.dispose()
    if (tempTargetMesh) {
      tempTargetMesh.geometry.dispose()
      const material = tempTargetMesh.material
      if (Array.isArray(material)) {
        material.forEach(m => m.dispose())
      } else {
        material.dispose()
      }
    }
  }

  /**
   * Volumetric sampling using ray-casting for inside/outside testing
   * Fills the volume with particles using Monte Carlo sampling
   */
  private volumetricSample(
    count: number,
    positions: number[],
    colors: number[],
    normals: number[],
    sizes: number[],
    randoms: number[]
  ): void {
    if (!this.modelGeometry) return

    const boundingBox = this.modelGeometry.boundingBox!
    const size = new THREE.Vector3()
    boundingBox.getSize(size)

    const center = new THREE.Vector3()
    boundingBox.getCenter(center)

    const position = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const color = new THREE.Color()
    const raycaster = new THREE.Raycaster()
    const direction = new THREE.Vector3(1, 0, 0)

    // Create temporary mesh for raycasting
    const tempGeometry = this.modelGeometry.clone()
    const tempMaterial = new THREE.MeshBasicMaterial()
    const tempMesh = new THREE.Mesh(tempGeometry, tempMaterial)

    let sampled = 0
    let attempts = 0
    const maxAttempts = count * 10  // Prevent infinite loop

    while (sampled < count && attempts < maxAttempts) {
      attempts++

      // Random point in bounding box
      position.set(
        center.x + (Math.random() - 0.5) * size.x,
        center.y + (Math.random() - 0.5) * size.y,
        center.z + (Math.random() - 0.5) * size.z
      )

      // Use raycasting to test if point is inside mesh
      raycaster.set(position, direction)
      const intersects = raycaster.intersectObject(tempMesh)

      // Count intersections - odd means inside, even means outside
      const intersectionCount = intersects.length

      if (intersectionCount % 2 === 1) {
        // Point is inside mesh
        positions.push(position.x, position.y, position.z)

        // Estimate normal by sampling nearby points
        const epsilon = 0.01
        normal.set(0, 0, 0)
        for (let i = 0; i < 6; i++) {
          const offset = new THREE.Vector3(
            i % 2 === 0 ? epsilon : 0,
            i % 4 < 2 ? epsilon : 0,
            i < 4 ? epsilon : 0
          )
          const testPoint = position.clone().add(offset)
          raycaster.set(testPoint, direction)
          const testIntersects = raycaster.intersectObject(tempMesh)
          const testCount = testIntersects.length

          if (testCount % 2 === 0) {
            // Outside, add to normal
            normal.add(offset.normalize())
          }
        }
        normal.normalize()
        normals.push(normal.x, normal.y, normal.z)

        // Color based on position with more variation for volume
        const hue = (position.x + position.y + position.z) * 0.3 + Math.random() * 0.15
        const saturation = 0.5 + Math.random() * 0.3
        const lightness = 0.4 + Math.random() * 0.4
        color.setHSL(hue % 1.0, saturation, lightness)
        colors.push(color.r, color.g, color.b)

        sizes.push(0.7 + Math.random() * 0.6)
        randoms.push(Math.random())

        sampled++
      }
    }

    // Warning if we couldn't sample enough particles
    if (sampled < count) {
      console.warn(`Only sampled ${sampled}/${count} particles in volumetric mode`)
    }

    // Cleanup
    tempGeometry.dispose()
    tempMaterial.dispose()
  }

  /**
   * Apply material effect by assembling shader from chunks
   * @param effectDef - Effect definition with vertex/fragment chunks
   */
  async applyMaterial(effectDef: EffectDef): Promise<void> {
    try {
      // Load shader chunks
      const [vertexChunk, fragmentChunk] = await Promise.all([
        effectDef.vertexChunk(),
        effectDef.fragmentChunk(),
      ])

      // Build uniforms object with common uniforms
      const uniforms: THREE.ShaderMaterial['uniforms'] = {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uMouseRadius: { value: 0.15 },
        uMouseEnabled: { value: 1.0 },
        uMouseStrength: { value: 0.5 },
        uUseCustomColor: { value: 0.0 },
        uColorR: { value: 1.0 },
        uColorG: { value: 1.0 },
        uColorB: { value: 1.0 },
        uShapeType: { value: 0.0 },
      }

      // Add effect-specific uniforms with default values
      effectDef.params.forEach((param) => {
        if (!param.type || param.type === 'number' || param.type === 'toggle' || param.type === 'select') {
          uniforms[param.uniform] = { value: param.default }
        } else if (param.type === 'color') {
          const hex = param.default as string
          const r = parseInt(hex.slice(1, 3), 16) / 255
          const g = parseInt(hex.slice(3, 5), 16) / 255
          const b = parseInt(hex.slice(5, 7), 16) / 255
          uniforms[`${param.uniform}R`] = { value: r }
          uniforms[`${param.uniform}G`] = { value: g }
          uniforms[`${param.uniform}B`] = { value: b }
        }
      })

      console.log('Built uniforms:', uniforms)

      // Add target position uniform for morph effect
      if (effectDef.id === 'morph' && this.particles?.geometry.hasAttribute('aTargetPosition')) {
        // Target positions are stored as attribute, no uniform needed
      }

      // Assemble vertex shader by replacing placeholders
      const vertexShader = this.assembleVertexShader(vertexChunk, effectDef.params)

      // Debug: log assembled shader
      console.log('=== Assembled Vertex Shader ===')
      console.log(vertexShader)
      console.log('=== End Shader ===')

      // Assemble fragment shader
      const fragmentShader = fragmentChunk

      // Create shader material
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })

      // Store previous material for fallback
      this.previousMaterial = this.currentMaterial

      // Apply new material
      this.currentMaterial = material

      if (this.particles) {
        this.particles.material = material
      }

    } catch (error) {
      console.error('Failed to apply material:', error)

      // Fallback to previous material if available
      if (this.previousMaterial && this.particles) {
        console.warn('Falling back to previous material')
        this.currentMaterial = this.previousMaterial
        this.particles.material = this.previousMaterial
      } else {
        // Use default point material as last resort
        console.error('No previous material available, using default')
        const defaultMaterial = new THREE.PointsMaterial({
          size: 2.0,
          color: 0xffffff,
          transparent: true,
          opacity: 0.8,
          sizeAttenuation: true,
        })
        this.currentMaterial = defaultMaterial
        if (this.particles) {
          this.particles.material = defaultMaterial
        }
      }

      throw error
    }
  }

  /**
   * Assemble vertex shader by inserting chunks into template
   */
  private assembleVertexShader(effectChunk: string, params: any[]): string {
    let shader = coreVertSource

    // Uniforms already declared in core.vert - skip these in template
    const commonUniforms = new Set([
      'uMouseRadius', 'uMouseEnabled', 'uMouseStrength',
      'uUseCustomColor', 'uColorR', 'uColorG', 'uColorB',
    ])

    // Build effect uniforms string
    const uniformsStrings: string[] = []
    params.forEach((param) => {
      if (!param.type || param.type === 'number' || param.type === 'toggle' || param.type === 'select') {
        if (!commonUniforms.has(param.uniform)) {
          uniformsStrings.push(`uniform float ${param.uniform};`)
        }
      } else if (param.type === 'color') {
        ['R', 'G', 'B'].forEach((s) => {
          if (!commonUniforms.has(`${param.uniform}${s}`)) {
            uniformsStrings.push(`uniform float ${param.uniform}${s};`)
          }
        })
      }
    })

    // Replace EFFECT_UNIFORMS placeholder (include comment prefix)
    shader = shader.replace('// %%EFFECT_UNIFORMS%%', uniformsStrings.join('\n  '))

    // Replace EFFECT_TRANSFORM placeholder (include comment prefix)
    shader = shader.replace('// %%EFFECT_TRANSFORM%%', effectChunk)

    return shader
  }

  /**
   * Update shader uniform value
   * @param name - Uniform name
   * @param value - New value
   */
  setUniform(name: string, value: number | THREE.Vector2 | THREE.Vector3): void {
    if (!this.currentMaterial) {
      console.warn('No material applied yet')
      return
    }

    if (isShaderMaterial(this.currentMaterial) && name in this.currentMaterial.uniforms) {
      this.currentMaterial.uniforms[name].value = value
    } else {
      console.warn(`Uniform ${name} not found in current material`)
    }
  }

  /**
   * Reset camera to default position
   */
  resetCamera(): void {
    this.camera.position.set(0, 0, 3)
    this.camera.lookAt(0, 0, 0)
    this.controls.reset()
  }

  /**
   * Start animation loop
   */
  start(): void {
    if (this.animationId !== null) {
      return  // Already running
    }

    const animate = () => {
      this.animationId = requestAnimationFrame(animate)

      const elapsedTime = this.clock.getElapsedTime()

      // Update uniforms
      if (this.currentMaterial && isShaderMaterial(this.currentMaterial)) {
        this.currentMaterial.uniforms.uTime.value = elapsedTime
        this.currentMaterial.uniforms.uMouse.value = this.mouseNDC
      }

      // Update controls
      this.controls.update()

      // Render
      this.renderer.render(this.scene, this.camera)
    }

    animate()
  }

  /**
   * Stop animation loop
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): ModelInfo | null {
    return this.modelInfo
  }

  /**
   * Clear target geometry (e.g., when switching away from morph effect)
   */
  clearTargetModel(): void {
    if (this.targetGeometry) {
      this.targetGeometry.dispose()
      this.targetGeometry = null
    }

    // Remove target position attribute from current geometry
    if (this.particles?.geometry.hasAttribute('aTargetPosition')) {
      this.particles.geometry.deleteAttribute('aTargetPosition')
    }
  }

  /**
   * Show original mesh (for "none" effect - raw model display)
   */
  showMesh(): void {
    if (this.particles) {
      this.particles.visible = false
    }
    if (this.originalMesh) {
      this.originalMesh.visible = true
    }
  }

  /**
   * Hide original mesh and show particle system
   */
  hideMesh(): void {
    if (this.originalMesh) {
      this.originalMesh.visible = false
    }
    if (this.particles) {
      this.particles.visible = true
    }
  }

  /**
   * Remove original mesh from scene and dispose resources
   */
  private removeOriginalMesh(): void {
    if (this.originalMesh) {
      this.scene.remove(this.originalMesh)
      this.originalMesh.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose()
          const mat = child.material
          if (Array.isArray(mat)) {
            mat.forEach((m: THREE.Material) => m.dispose())
          } else if (mat) {
            mat.dispose()
          }
        }
      })
      this.originalMesh = null
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stop()

    // Dispose particles
    if (this.particles) {
      this.scene.remove(this.particles)
      this.particles.geometry.dispose()
      if (this.particles.material instanceof THREE.Material) {
        this.particles.material.dispose()
      }
      this.particles = null
    }

    // Dispose original mesh
    this.removeOriginalMesh()

    // Dispose geometries
    if (this.modelGeometry) {
      this.modelGeometry.dispose()
      this.modelGeometry = null
    }

    if (this.targetGeometry) {
      this.targetGeometry.dispose()
      this.targetGeometry = null
    }

    // Dispose materials
    if (this.currentMaterial) {
      this.currentMaterial.dispose()
      this.currentMaterial = null
    }

    if (this.previousMaterial) {
      this.previousMaterial.dispose()
      this.previousMaterial = null
    }

    // Dispose controls
    this.controls.dispose()

    // Dispose renderer
    this.renderer.dispose()

    // Remove event listeners
    window.removeEventListener('resize', this.onResize.bind(this))
  }
}
