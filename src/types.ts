export type StyleId = 'halftone' | 'diffusion' | 'popart' | 'lightshadow' | 'sketch' | 'pointillism' | 'kaleidoscope' | 'crosshatch' | 'animelight' | 'textraster' | 'ascii'

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

export interface ToggleParamDef {
  type: 'toggle'
  name: string
  uniform: string
  default: number  // 0 or 1
  description?: string
}

export interface ColorParamDef {
  type: 'color'
  name: string
  uniform: string  // base name, creates ${uniform}R/G/B in shader
  default: string  // hex color like '#ffffff'
  description?: string
}

export interface SelectParamDef {
  type: 'select'
  name: string
  uniform: string
  options: { label: string; value: number }[]
  default: number
  description?: string
}

export interface FontParamDef {
  type: 'font'
  name: string
  uniform: string
  description?: string
}

export type ParamDef = NumberParamDef | TextParamDef | ToggleParamDef | ColorParamDef | SelectParamDef | FontParamDef

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
  renderMode?: 'shader' | 'canvas2d'  // 默认 'shader'
}

// ---------------------------------------------------------------------------
// 3D Particle Animation Types
// ---------------------------------------------------------------------------

export type EffectId = 'none' | 'surface' | 'explosion' | 'morph' | 'vortex' | 'density'

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

export interface ColorStop {
  color: string
  position: number
}

export interface GradientConfig {
  stops: ColorStop[]
  mode: 'height' | 'radial' | 'random'
}
