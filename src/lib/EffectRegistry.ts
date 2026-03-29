import type { EffectDef, EffectId } from '../types'

const effects: EffectDef[] = [
  // ---------------------------------------------------------------------------
  // Surface Particles
  // ---------------------------------------------------------------------------
  {
    id: 'surface',
    label: '表面粒子',
    description: '粒子静止在模型表面，基础粒子可视化效果',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/surface.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: '粒子大小', uniform: 'uBaseSize', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Explosion/Aggregation
  // ---------------------------------------------------------------------------
  {
    id: 'explosion',
    label: '爆散聚合',
    description: '粒子从模型表面散射出去再回收',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/explosion.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: '爆炸力度', uniform: 'uExplosionForce', min: 0.0, max: 5.0, step: 0.01, default: 2.0 },
      { name: '动画速度', uniform: 'uAnimSpeed', min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
      { name: '粒子大小', uniform: 'uBaseSize', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Morph Transition
  // ---------------------------------------------------------------------------
  {
    id: 'morph',
    label: '形状变换',
    description: '两个模型之间的平滑形状过渡',
    samplingType: 'surface',
    requiresTargetModel: true,
    vertexChunk: () => import('../shaders3d/morph.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: '变换速度', uniform: 'uSpeed', min: 0.1, max: 2.0, step: 0.01, default: 0.5 },
      { name: '粒子大小', uniform: 'uBaseSize', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Rotation/Vortex
  // ---------------------------------------------------------------------------
  {
    id: 'vortex',
    label: '旋转涡流',
    description: '粒子围绕模型旋转并形成涡流',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/vortex.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: '旋转速度', uniform: 'uSpeed', min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
      { name: '旋转半径', uniform: 'uRadius', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
      { name: '粒子大小', uniform: 'uBaseSize', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Density Simulation
  // ---------------------------------------------------------------------------
  {
    id: 'density',
    label: '密度模拟',
    description: '粒子填充模型体积，呈现密度变化',
    samplingType: 'volumetric',
    vertexChunk: () => import('../shaders3d/density.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: '噪声缩放', uniform: 'uNoiseScale', min: 0.1, max: 5.0, step: 0.1, default: 1.0 },
      { name: '噪声速度', uniform: 'uNoiseSpeed', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
      { name: '密度强度', uniform: 'uDensityStrength', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
      { name: '粒子大小', uniform: 'uBaseSize', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
    ],
  },
]

export function getEffect(id: EffectId): EffectDef | undefined {
  return effects.find(e => e.id === id)
}

export function getAllEffects(): EffectDef[] {
  return effects
}

export { effects }
