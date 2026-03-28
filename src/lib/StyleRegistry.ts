import type { StyleDefinition, StyleId } from '../types'

export const styles: StyleDefinition[] = [
  // ---------------------------------------------------------------------------
  // Halftone
  // ---------------------------------------------------------------------------
  {
    id: 'halftone',
    label: 'Halftone',
    description: '半色调网点效果，通过不同大小的圆点模拟明暗变化，模拟传统印刷工艺的视觉质感。',
    shaderImports: [() => import('../shaders/halftone.frag?raw').then(m => m.default)],
    params: [
      { name: '网格大小',    uniform: 'uCellSize',  min: 2,   max: 50,  step: 1,    default: 6,   description: '控制半色调网格的单元格大小，值越大圆点越稀疏' },
      { name: '圆点缩放',    uniform: 'uDotScale',  min: 0.1, max: 3.0, step: 0.01, default: 1.0, description: '圆点相对于单元格的大小比例' },
      { name: '颜色模式',    uniform: 'uColorMode', min: 0,   max: 2,   step: 1,    default: 2,   description: '0=彩色  1=灰度  2=CMYK' },
      { name: '网格旋转角度', uniform: 'uAngle',     min: 0,   max: 360, step: 1,    default: 45,  description: '网格整体旋转的角度' },
      { name: '形状模式',    uniform: 'uShape',     min: 0,   max: 2,   step: 1,    default: 0,   description: '0=圆形  1=方形  2=菱形' },
      { name: '色相偏移',    uniform: 'uHueShift',  min: 0,   max: 360, step: 1,    default: 0,   description: '整体色相的偏移量' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Diffusion
  // ---------------------------------------------------------------------------
  {
    id: 'diffusion',
    label: 'Diffusion',
    description: '误差扩散抖动效果，模拟传统印刷中色彩扩散与量化处理，产生独特的纹理质感。',
    shaderImports: [() => import('../shaders/diffusion.frag?raw').then(m => m.default)],
    params: [
      { name: '色阶数',   uniform: 'uLevels',    min: 2,   max: 64,  step: 1,    default: 8,   description: '色彩量化级别，值越小颜色越少、效果越强烈' },
      { name: '扩散强度', uniform: 'uSpread',     min: 0.0, max: 2.0, step: 0.01, default: 1.0, description: '误差扩散的强度系数' },
      { name: '像素化粒度', uniform: 'uPixelSize', min: 1,   max: 16,  step: 1,    default: 1,   description: '预处理阶段的像素化大小，1 为不像素化' },
      { name: '噪声类型', uniform: 'uNoiseType',  min: 0,   max: 2,   step: 1,    default: 0,   description: '0=Floyd-Steinberg  1=有序抖动  2=随机噪声' },
      { name: '抖动强度', uniform: 'uDitherStrength', min: 0.0, max: 1.0, step: 0.01, default: 1.0, description: '抖动处理的整体强度' },
      { name: '灰度模式', uniform: 'uGrayscale',  min: 0,   max: 1,   step: 1,    default: 0,   description: '0=彩色  1=灰度' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pop Art
  // ---------------------------------------------------------------------------
  {
    id: 'popart',
    label: 'Pop Art',
    description: '波普艺术风格，通过高饱和度、高对比度和色调分离呈现大胆鲜艳的视觉效果。',
    shaderImports: [() => import('../shaders/popart.frag?raw').then(m => m.default)],
    params: [
      { name: '色调分离级数', uniform: 'uLevels',     min: 2,   max: 16,  step: 1,    default: 4,   description: '色调分离的级数，值越小色阶越少、效果越平面化' },
      { name: '饱和度',      uniform: 'uSaturation', min: 0.0, max: 5.0, step: 0.01, default: 2.0, description: '色彩饱和度，1.0 为原始饱和度' },
      { name: '对比度',      uniform: 'uContrast',   min: 0.2, max: 5.0, step: 0.01, default: 1.5, description: '明暗对比的强度' },
      { name: '色板预设',    uniform: 'uPalette',    min: 0,   max: 4,   step: 1,    default: 0,   description: '0=原色  1=暖色  2=冷色  3=霓虹  4=复古' },
      { name: '叠加圆点',    uniform: 'uBenDay',     min: 0,   max: 1,   step: 1,    default: 0,   description: '是否叠加本戴点（Ben-Day Dots）效果' },
      { name: '色相旋转',    uniform: 'uHueShift',   min: 0,   max: 360, step: 1,    default: 0,   description: '色相旋转角度' },
      { name: '圆点大小',    uniform: 'uDotSize',    min: 2,   max: 20,  step: 1,    default: 6,   description: '本戴点的圆点大小' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Light & Shadow (multi-pass: blur_h -> blur_v -> composite)
  // ---------------------------------------------------------------------------
  {
    id: 'lightshadow',
    label: 'Light & Shadow',
    description: '光影效果，分离并增强图像的明暗区域，通过阈值分割和光晕叠加营造戏剧性光影氛围。',
    shaderImports: [
      () => import('../shaders/lightshadow_blur_h.frag?raw').then(m => m.default),
      () => import('../shaders/lightshadow_blur_v.frag?raw').then(m => m.default),
      () => import('../shaders/lightshadow_composite.frag?raw').then(m => m.default),
    ],
    isMultiPass: true,
    params: [
      { name: '明暗对比',   uniform: 'uContrast',    min: 0.5, max: 3.0, step: 0.01, default: 1.5, description: '明暗区域的对比强度' },
      { name: '阈值分割点', uniform: 'uThreshold',    min: 0.1, max: 0.9, step: 0.01, default: 0.5, description: '明暗分割的亮度阈值，低于此值为暗部' },
      { name: '光晕半径',   uniform: 'uGlowRadius',  min: 0,   max: 50,  step: 0.1,  default: 5,   description: '光晕效果的扩散半径' },
      { name: '光照方向角度', uniform: 'uLightDir',    min: 0,   max: 360, step: 1,    default: 135, description: '模拟光源的方向角度，0°=右，90°=下，180°=左，270°=上' },
      { name: '光晕强度',   uniform: 'uGlowIntensity', min: 0.0, max: 2.0, step: 0.01, default: 1.0, description: '光晕的亮度强度' },
      { name: '光晕颜色',   uniform: 'uGlowColor',    min: 0,   max: 360, step: 1,    default: 0,   description: '光晕的色相角度' },
      { name: '暗部浓度',   uniform: 'uShadowDepth',   min: 0.0, max: 2.0, step: 0.01, default: 1.0, description: '暗部区域的加深程度' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Sketch
  // ---------------------------------------------------------------------------
  {
    id: 'sketch',
    label: 'Sketch',
    description: '素描风格，通过多方向边缘检测提取轮廓线条，可选叠加影线效果，模拟手绘铅笔素描。',
    shaderImports: [() => import('../shaders/sketch.frag?raw').then(m => m.default)],
    params: [
      { name: '边缘线宽',   uniform: 'uEdgeWidth',    min: 0.5, max: 10.0, step: 0.1,  default: 1.0, description: '检测到的边缘线条宽度' },
      { name: '边缘灵敏度', uniform: 'uSensitivity',   min: 0.01, max: 1.0, step: 0.01, default: 0.1, description: '边缘检测的灵敏度，值越小检测到的边缘越多' },
      { name: '细节保留',   uniform: 'uDetail',        min: 0.0, max: 1.0, step: 0.01, default: 0.5, description: '保留原始细节的程度' },
      { name: '影线叠加',   uniform: 'uHatching',      min: 0,   max: 1,   step: 1,    default: 0,   description: '0=关闭  1=开启影线效果' },
      { name: '背景色',     uniform: 'uBgColor',       min: 0,   max: 1,   step: 1,    default: 0,   description: '0=白色  1=浅色纸纹' },
      { name: '线条颜色',   uniform: 'uLineColor',     min: 0,   max: 360, step: 1,    default: 0,   description: '线条的色相角度' },
      { name: '影线密度',   uniform: 'uHatchDensity',  min: 1,   max: 10,  step: 1,    default: 1,   description: '影线的疏密程度' },
      { name: '边缘检测方法', uniform: 'uEdgeMethod',   min: 0,   max: 1,   step: 1,    default: 0,   description: '0=Sobel  1=Prewitt' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pointillism
  // ---------------------------------------------------------------------------
  {
    id: 'pointillism',
    label: 'Pointillism',
    description: '点彩画派风格，用密集的彩色圆点重构图像，致敬修拉等印象派画家的独特技法。',
    shaderImports: [() => import('../shaders/pointillism.frag?raw').then(m => m.default)],
    params: [
      { name: '圆点大小', uniform: 'uDotSize',        min: 2,   max: 60,  step: 1,    default: 8,   description: '每个色点的基础大小' },
      { name: '密度',     uniform: 'uDensity',        min: 0.1, max: 5.0, step: 0.01, default: 1.0, description: '色点的分布密度' },
      { name: '随机抖动', uniform: 'uRandomness',     min: 0.0, max: 1.0, step: 0.01, default: 0.3, description: '色点位置的随机偏移量' },
      { name: '大小随机变化', uniform: 'uSizeVariation', min: 0.0, max: 1.0, step: 0.01, default: 0.0, description: '色点大小的随机变化幅度' },
      { name: '圆点透明度', uniform: 'uDotOpacity',   min: 0.1, max: 1.0, step: 0.01, default: 1.0, description: '色点的不透明度' },
      { name: '形状模式', uniform: 'uShape',          min: 0,   max: 2,   step: 1,    default: 0,   description: '0=圆形  1=方形  2=椭圆' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Kaleidoscope
  // ---------------------------------------------------------------------------
  {
    id: 'kaleidoscope',
    label: 'Kaleidoscope',
    description: '万花筒镜像效果，将画面以中心为原点分割为多个扇区并镜像翻转，产生对称图案。适合制作故障拼贴、错位人像和实验感画面。',
    shaderImports: [() => import('../shaders/kaleidoscope.frag?raw').then(m => m.default)],
    params: [
      { name: '扇区数',   uniform: 'uSegments', min: 2,   max: 24,  step: 1,    default: 6,   description: '万花筒的镜像分割数量' },
      { name: '旋转角度', uniform: 'uRotation',  min: 0,   max: 360, step: 1,    default: 0,   description: '整体旋转角度' },
      { name: '缩放',     uniform: 'uZoom',      min: 0.1, max: 5.0, step: 0.01, default: 1.0, description: '画面缩放倍率' },
      { name: '中心X偏移', uniform: 'uCenterX',   min: -1.0, max: 1.0, step: 0.01, default: 0.0, description: '中心点水平偏移' },
      { name: '中心Y偏移', uniform: 'uCenterY',   min: -1.0, max: 1.0, step: 0.01, default: 0.0, description: '中心点垂直偏移' },
      { name: '边缘发光', uniform: 'uEdgeGlow',  min: 0.0, max: 2.0, step: 0.01, default: 0.0, description: '扇区边缘的发光强度' },
      { name: '色相偏移', uniform: 'uHueShift',  min: 0,   max: 360, step: 1,    default: 0,   description: '整体色相偏移' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Crosshatch (Screen-tone Draft)
  // ---------------------------------------------------------------------------
  {
    id: 'crosshatch',
    label: 'Crosshatch',
    description: '网纹底稿风格，黑白线稿 + 可旋转纹理网点 + 纸张噪声，模拟漫画网纸/网点纸的印刷质感。',
    shaderImports: [() => import('../shaders/crosshatch.frag?raw').then(m => m.default)],
    params: [
      { name: '网点大小',     uniform: 'uDotSize',          min: 2,    max: 30,  step: 1,    default: 8,    description: '纹理网点的基础大小' },
      { name: '网点旋转角度', uniform: 'uScreenAngle',      min: 0,    max: 360, step: 1,    default: 45,   description: '网点纹理的旋转角度' },
      { name: '边缘灵敏度',   uniform: 'uEdgeSensitivity',  min: 0.01, max: 1.0, step: 0.01, default: 0.15, description: '边缘检测的灵敏度阈值' },
      { name: '线条粗细',     uniform: 'uLineWidth',        min: 0.5,  max: 5.0, step: 0.1,  default: 1.5,  description: '底稿轮廓线的粗细' },
      { name: '纸张噪声',     uniform: 'uPaperNoise',       min: 0.0,  max: 0.3, step: 0.01, default: 0.05, description: '纸张纹理噪声的强度' },
      { name: '网点浓度',     uniform: 'uScreenDensity',    min: 0.1,  max: 3.0, step: 0.01, default: 1.0,  description: '网点覆盖的浓度/对比度' },
      { name: '反转模式',     uniform: 'uInvert',           min: 0,    max: 1,   step: 1,    default: 0,    description: '0=白底黑线  1=黑底白线' },
    ],
  },
]

/**
 * Look up a style definition by its id.
 */
export function getStyle(id: StyleId): StyleDefinition | undefined {
  return styles.find(s => s.id === id)
}
