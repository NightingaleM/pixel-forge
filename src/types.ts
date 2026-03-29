export type StyleId = 'halftone' | 'diffusion' | 'popart' | 'lightshadow' | 'sketch' | 'pointillism' | 'kaleidoscope' | 'crosshatch' | 'animelight' | 'textraster'

export interface NumberParamDef {
  type?: 'number'
  name: string       // UI 显示名
  uniform: string    // GLSL uniform 名
  min: number
  max: number
  step: number
  default: number
  description?: string  // 参数详细描述
}

export interface TextParamDef {
  type: 'text'
  name: string
  uniform: string
  textDefault: string
  description?: string
}

export type ParamDef = NumberParamDef | TextParamDef

export interface ShaderPass {
  fragSource: string
  uniforms: Record<string, number>
}

export interface StyleDefinition {
  id: StyleId
  label: string       // UI 显示名
  description: string  // 风格详细描述
  shaderImports: (() => Promise<string>)[]  // 函数数组，每个返回一个 fragment shader 源码
  params: ParamDef[]
  isMultiPass?: boolean
}

// ---------------------------------------------------------------------------
// 3D Particle Animation Types
// ---------------------------------------------------------------------------

export type EffectId = 'surface' | 'explosion' | 'morph' | 'vortex' | 'density'

export type SamplingType = 'surface' | 'volumetric'

export interface EffectDef {
  id: EffectId
  label: string
  description: string
  samplingType: SamplingType
  requiresTargetModel?: boolean
  vertexChunk: () => Promise<string>
  fragmentChunk: () => Promise<string>
  params: ParamDef[]
}

export interface ModelInfo {
  vertices: number
  faces: number
}
