import type { EffectDef, EffectId } from '../types'

const effects: EffectDef[] = [
  // ---------------------------------------------------------------------------
  // None (Raw Model Display)
  // ---------------------------------------------------------------------------
  {
    id: 'none',
    label: 'effect.none.label',
    description: 'effect.none.desc',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/surface.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [],
  },

  // ---------------------------------------------------------------------------
  // Surface Particles
  // ---------------------------------------------------------------------------
  {
    id: 'surface',
    label: 'effect.surface.label',
    description: 'effect.surface.desc',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/surface.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: 'effect.surface.baseSize', uniform: 'uBaseSize', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Explosion/Aggregation
  // ---------------------------------------------------------------------------
  {
    id: 'explosion',
    label: 'effect.explosion.label',
    description: 'effect.explosion.desc',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/explosion.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: 'effect.explosion.explosionForce', uniform: 'uExplosionForce', min: 0.0, max: 5.0, step: 0.01, default: 2.0 },
      { name: 'effect.explosion.animSpeed', uniform: 'uAnimSpeed', min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
      { name: 'effect.explosion.baseSize', uniform: 'uBaseSize', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Morph Transition
  // ---------------------------------------------------------------------------
  {
    id: 'morph',
    label: 'effect.morph.label',
    description: 'effect.morph.desc',
    samplingType: 'surface',
    requiresTargetModel: true,
    vertexChunk: () => import('../shaders3d/morph.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: 'effect.morph.speed', uniform: 'uSpeed', min: 0.1, max: 2.0, step: 0.01, default: 0.5 },
      { name: 'effect.morph.baseSize', uniform: 'uBaseSize', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Rotation/Vortex
  // ---------------------------------------------------------------------------
  {
    id: 'vortex',
    label: 'effect.vortex.label',
    description: 'effect.vortex.desc',
    samplingType: 'surface',
    vertexChunk: () => import('../shaders3d/vortex.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: 'effect.vortex.speed', uniform: 'uSpeed', min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
      { name: 'effect.vortex.radius', uniform: 'uRadius', min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
      { name: 'effect.vortex.baseSize', uniform: 'uBaseSize', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Density Simulation
  // ---------------------------------------------------------------------------
  {
    id: 'density',
    label: 'effect.density.label',
    description: 'effect.density.desc',
    samplingType: 'volumetric',
    vertexChunk: () => import('../shaders3d/density.vert.chunk?raw').then(m => m.default),
    fragmentChunk: () => import('../shaders3d/particle_default.frag?raw').then(m => m.default),
    params: [
      { name: 'effect.density.noiseScale', uniform: 'uNoiseScale', min: 0.1, max: 5.0, step: 0.1, default: 1.0 },
      { name: 'effect.density.noiseSpeed', uniform: 'uNoiseSpeed', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
      { name: 'effect.density.densityStrength', uniform: 'uDensityStrength', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
      { name: 'effect.density.baseSize', uniform: 'uBaseSize', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
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
