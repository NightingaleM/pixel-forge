import type { StyleDefinition, StyleId } from '../types'

export const styles: StyleDefinition[] = [
  // ---------------------------------------------------------------------------
  // Halftone
  // ---------------------------------------------------------------------------
  {
    id: 'halftone',
    label: 'Halftone',
    shaderImports: [() => import('../shaders/halftone.frag?raw').then(m => m.default)],
    params: [
      { name: '网格大小',    uniform: 'uCellSize',  min: 2,   max: 20,  step: 1,    default: 6   },
      { name: '圆点缩放',    uniform: 'uDotScale',  min: 0.1, max: 2.0, step: 0.01, default: 1.0 },
      { name: '颜色模式',    uniform: 'uColorMode', min: 0,   max: 2,   step: 1,    default: 2   },
      { name: '网格旋转角度', uniform: 'uAngle',     min: 0,   max: 360, step: 1,    default: 45  },
    ],
  },

  // ---------------------------------------------------------------------------
  // Diffusion
  // ---------------------------------------------------------------------------
  {
    id: 'diffusion',
    label: 'Diffusion',
    shaderImports: [() => import('../shaders/diffusion.frag?raw').then(m => m.default)],
    params: [
      { name: '色阶数',   uniform: 'uLevels',    min: 2,   max: 32,  step: 1,    default: 8   },
      { name: '扩散强度', uniform: 'uSpread',     min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
      { name: '像素化粒度', uniform: 'uPixelSize', min: 1,   max: 8,   step: 1,    default: 1   },
      { name: '噪声类型', uniform: 'uNoiseType',  min: 0,   max: 2,   step: 1,    default: 0   },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pop Art
  // ---------------------------------------------------------------------------
  {
    id: 'popart',
    label: 'Pop Art',
    shaderImports: [() => import('../shaders/popart.frag?raw').then(m => m.default)],
    params: [
      { name: '色调分离级数', uniform: 'uLevels',     min: 2,   max: 8,   step: 1,    default: 4   },
      { name: '饱和度',      uniform: 'uSaturation', min: 0.5, max: 3.0, step: 0.01, default: 2.0 },
      { name: '对比度',      uniform: 'uContrast',   min: 0.5, max: 3.0, step: 0.01, default: 1.5 },
      { name: '色板预设',    uniform: 'uPalette',    min: 0,   max: 4,   step: 1,    default: 0   },
      { name: '叠加圆点',    uniform: 'uBenDay',     min: 0,   max: 1,   step: 1,    default: 0   },
    ],
  },

  // ---------------------------------------------------------------------------
  // Light & Shadow (multi-pass: blur_h -> blur_v -> composite)
  // ---------------------------------------------------------------------------
  {
    id: 'lightshadow',
    label: 'Light & Shadow',
    shaderImports: [
      () => import('../shaders/lightshadow_blur_h.frag?raw').then(m => m.default),
      () => import('../shaders/lightshadow_blur_v.frag?raw').then(m => m.default),
      () => import('../shaders/lightshadow_composite.frag?raw').then(m => m.default),
    ],
    isMultiPass: true,
    params: [
      { name: '明暗对比',   uniform: 'uContrast',    min: 0.5, max: 3.0, step: 0.01, default: 1.5 },
      { name: '阈值分割点', uniform: 'uThreshold',    min: 0.1, max: 0.9, step: 0.01, default: 0.5 },
      { name: '光晕半径',   uniform: 'uGlowRadius',  min: 0,   max: 20,  step: 0.1,  default: 5   },
      { name: '光照方向角度', uniform: 'uLightDir',    min: 0,   max: 360, step: 1,    default: 135 },
    ],
  },

  // ---------------------------------------------------------------------------
  // Sketch
  // ---------------------------------------------------------------------------
  {
    id: 'sketch',
    label: 'Sketch',
    shaderImports: [() => import('../shaders/sketch.frag?raw').then(m => m.default)],
    params: [
      { name: '边缘线宽',   uniform: 'uEdgeWidth',   min: 0.5, max: 5.0, step: 0.1,  default: 1.0 },
      { name: '边缘灵敏度', uniform: 'uSensitivity',  min: 0.01, max: 0.5, step: 0.01, default: 0.1 },
      { name: '细节保留',   uniform: 'uDetail',       min: 0.0, max: 1.0, step: 0.01, default: 0.5 },
      { name: '影线叠加',   uniform: 'uHatching',     min: 0,   max: 1,   step: 1,    default: 0   },
      { name: '背景色',     uniform: 'uBgColor',      min: 0,   max: 1,   step: 1,    default: 0   },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pointillism
  // ---------------------------------------------------------------------------
  {
    id: 'pointillism',
    label: 'Pointillism',
    shaderImports: [() => import('../shaders/pointillism.frag?raw').then(m => m.default)],
    params: [
      { name: '圆点大小', uniform: 'uDotSize',     min: 2,   max: 30,  step: 1,    default: 8   },
      { name: '密度',     uniform: 'uDensity',     min: 0.3, max: 3.0, step: 0.01, default: 1.0 },
      { name: '随机抖动', uniform: 'uRandomness',  min: 0.0, max: 1.0, step: 0.01, default: 0.3 },
    ],
  },
]

/**
 * Look up a style definition by its id.
 */
export function getStyle(id: StyleId): StyleDefinition | undefined {
  return styles.find(s => s.id === id)
}
