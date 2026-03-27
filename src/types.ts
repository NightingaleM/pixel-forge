export type StyleId = 'halftone' | 'diffusion' | 'popart' | 'lightshadow' | 'sketch' | 'pointillism'

export interface ParamDef {
  name: string       // UI 显示名
  uniform: string    // GLSL uniform 名
  min: number
  max: number
  step: number
  default: number
}

export interface ShaderPass {
  fragSource: string
  uniforms: Record<string, number>
}

export interface StyleDefinition {
  id: StyleId
  label: string       // UI 显示名
  shaderImports: (() => Promise<string>)[]  // 函数数组，每个返回一个 fragment shader 源码
  params: ParamDef[]
  isMultiPass?: boolean
}
