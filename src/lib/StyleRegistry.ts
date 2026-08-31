import type { StyleDefinition, StyleId } from '../types'

export const styles: StyleDefinition[] = [
  // ---------------------------------------------------------------------------
  // Halftone
  // ---------------------------------------------------------------------------
  {
    id: 'halftone',
    label: 'style.halftone.label',
    description: 'style.halftone.desc',
    shaderImports: [() => import('../shaders/halftone.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.halftone.cellSize',    uniform: 'uCellSize',  min: 2,   max: 50,  step: 1,    default: 15,  description: 'style.halftone.cellSizeDesc' },
      { name: 'style.halftone.dotScale',    uniform: 'uDotScale',  min: 0.1, max: 3.0, step: 0.01, default: 1.45, description: 'style.halftone.dotScaleDesc' },
      { name: 'style.halftone.colorMode',    uniform: 'uColorMode', min: 0,   max: 2,   step: 1,    default: 2,   description: 'style.halftone.colorModeDesc' },
      { name: 'style.halftone.angle', uniform: 'uAngle',     min: 0,   max: 360, step: 1,    default: 0,   description: 'style.halftone.angleDesc' },
      { name: 'style.halftone.shape',    uniform: 'uShape',     min: 0,   max: 2,   step: 1,    default: 1,   description: 'style.halftone.shapeDesc' },
      { name: 'style.halftone.hueShift',    uniform: 'uHueShift',  min: 0,   max: 360, step: 1,    default: 0,   description: 'style.halftone.hueShiftDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Diffusion
  // ---------------------------------------------------------------------------
  {
    id: 'diffusion',
    label: 'style.diffusion.label',
    description: 'style.diffusion.desc',
    shaderImports: [() => import('../shaders/diffusion.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.diffusion.levels',   uniform: 'uLevels',    min: 2,   max: 64,  step: 1,    default: 3,   description: 'style.diffusion.levelsDesc' },
      { name: 'style.diffusion.spread', uniform: 'uSpread',     min: 0.0, max: 2.0, step: 0.01, default: 1.88, description: 'style.diffusion.spreadDesc' },
      { name: 'style.diffusion.pixelSize', uniform: 'uPixelSize', min: 1,   max: 16,  step: 1,    default: 7,   description: 'style.diffusion.pixelSizeDesc' },
      { name: 'style.diffusion.noiseType', uniform: 'uNoiseType',  min: 0,   max: 2,   step: 1,    default: 1,   description: 'style.diffusion.noiseTypeDesc' },
      { name: 'style.diffusion.ditherStrength', uniform: 'uDitherStrength', min: 0.0, max: 1.0, step: 0.01, default: 0.11, description: 'style.diffusion.ditherStrengthDesc' },
      { name: 'style.diffusion.grayscale', uniform: 'uGrayscale',  min: 0,   max: 1,   step: 1,    default: 0,   description: 'style.diffusion.grayscaleDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pop Art
  // ---------------------------------------------------------------------------
  {
    id: 'popart',
    label: 'style.popart.label',
    description: 'style.popart.desc',
    shaderImports: [() => import('../shaders/popart.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.popart.levels', uniform: 'uLevels',     min: 2,   max: 16,  step: 1,    default: 5,   description: 'style.popart.levelsDesc' },
      { name: 'style.popart.saturation',      uniform: 'uSaturation', min: 0.0, max: 5.0, step: 0.01, default: 2.0, description: 'style.popart.saturationDesc' },
      { name: 'style.popart.contrast',      uniform: 'uContrast',   min: 0.2, max: 5.0, step: 0.01, default: 1.32, description: 'style.popart.contrastDesc' },
      { name: 'style.popart.palette',    uniform: 'uPalette',    min: 0,   max: 4,   step: 1,    default: 3,   description: 'style.popart.paletteDesc' },
      { name: 'style.popart.benDay',    uniform: 'uBenDay',     min: 0,   max: 1,   step: 1,    default: 1,   description: 'style.popart.benDayDesc' },
      { name: 'style.popart.hueShift',    uniform: 'uHueShift',   min: 0,   max: 360, step: 1,    default: 88,  description: 'style.popart.hueShiftDesc' },
      { name: 'style.popart.dotSize',    uniform: 'uDotSize',    min: 2,   max: 20,  step: 1,    default: 10,  description: 'style.popart.dotSizeDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Light & Shadow (multi-pass: blur_h -> blur_v -> composite)
  // ---------------------------------------------------------------------------
  {
    id: 'lightshadow',
    label: 'style.lightshadow.label',
    description: 'style.lightshadow.desc',
    shaderImports: [
      () => import('../shaders/lightshadow_blur_h.frag?raw').then(m => m.default),
      () => import('../shaders/lightshadow_blur_v.frag?raw').then(m => m.default),
      () => import('../shaders/lightshadow_composite.frag?raw').then(m => m.default),
    ],
    isMultiPass: true,
    params: [
      { name: 'style.lightshadow.contrast',   uniform: 'uContrast',    min: 0.5, max: 3.0, step: 0.01, default: 3,    description: 'style.lightshadow.contrastDesc' },
      { name: 'style.lightshadow.threshold', uniform: 'uThreshold',    min: 0.1, max: 0.9, step: 0.01, default: 0.29, description: 'style.lightshadow.thresholdDesc' },
      { name: 'style.lightshadow.glowRadius',   uniform: 'uGlowRadius',  min: 0,   max: 50,  step: 0.1,  default: 50,  description: 'style.lightshadow.glowRadiusDesc' },
      { name: 'style.lightshadow.lightDir', uniform: 'uLightDir',    min: 0,   max: 360, step: 1,    default: 5,    description: 'style.lightshadow.lightDirDesc' },
      { name: 'style.lightshadow.glowIntensity',   uniform: 'uGlowIntensity', min: 0.0, max: 2.0, step: 0.01, default: 0.25, description: 'style.lightshadow.glowIntensityDesc' },
      { name: 'style.lightshadow.glowColor',   uniform: 'uGlowColor',    min: 0,   max: 360, step: 1,    default: 0,   description: 'style.lightshadow.glowColorDesc' },
      { name: 'style.lightshadow.shadowDepth',   uniform: 'uShadowDepth',   min: 0.0, max: 2.0, step: 0.01, default: 1.92, description: 'style.lightshadow.shadowDepthDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Sketch
  // ---------------------------------------------------------------------------
  {
    id: 'sketch',
    label: 'style.sketch.label',
    description: 'style.sketch.desc',
    shaderImports: [() => import('../shaders/sketch.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.sketch.edgeWidth',   uniform: 'uEdgeWidth',    min: 0.5, max: 10.0, step: 0.1,  default: 1.1, description: 'style.sketch.edgeWidthDesc' },
      { name: 'style.sketch.sensitivity', uniform: 'uSensitivity',   min: 0.01, max: 1.0, step: 0.01, default: 0.03, description: 'style.sketch.sensitivityDesc' },
      { name: 'style.sketch.detail',   uniform: 'uDetail',        min: 0.0, max: 1.0, step: 0.01, default: 0,  description: 'style.sketch.detailDesc' },
      { name: 'style.sketch.hatching',   uniform: 'uHatching',      min: 0,   max: 1,   step: 1,    default: 0,   description: 'style.sketch.hatchingDesc' },
      { name: 'style.sketch.bgColor',     uniform: 'uBgColor',       min: 0,   max: 1,   step: 1,    default: 0,   description: 'style.sketch.bgColorDesc' },
      { name: 'style.sketch.lineColor',     uniform: 'uLineColor',     min: 0,   max: 360, step: 1,    default: 27,  description: 'style.sketch.lineColorDesc' },
      { name: 'style.sketch.hatchDensity',  uniform: 'uHatchDensity',  min: 1,   max: 10,  step: 1,    default: 1,   description: 'style.sketch.hatchDensityDesc' },
      { name: 'style.sketch.edgeMethod', uniform: 'uEdgeMethod',   min: 0,   max: 1,   step: 1,    default: 1,   description: 'style.sketch.edgeMethodDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pointillism
  // ---------------------------------------------------------------------------
  {
    id: 'pointillism',
    label: 'style.pointillism.label',
    description: 'style.pointillism.desc',
    shaderImports: [() => import('../shaders/pointillism.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.pointillism.dotSize', uniform: 'uDotSize',        min: 2,   max: 60,  step: 1,    default: 12,  description: 'style.pointillism.dotSizeDesc' },
      { name: 'style.pointillism.density',     uniform: 'uDensity',        min: 0.1, max: 5.0, step: 0.01, default: 1.6, description: 'style.pointillism.densityDesc' },
      { name: 'style.pointillism.randomness', uniform: 'uRandomness',     min: 0.0, max: 1.0, step: 0.01, default: 0.39, description: 'style.pointillism.randomnessDesc' },
      { name: 'style.pointillism.sizeVariation', uniform: 'uSizeVariation', min: 0.0, max: 1.0, step: 0.01, default: 0.5, description: 'style.pointillism.sizeVariationDesc' },
      { name: 'style.pointillism.dotOpacity', uniform: 'uDotOpacity',   min: 0.1, max: 1.0, step: 0.01, default: 0.91, description: 'style.pointillism.dotOpacityDesc' },
      { name: 'style.pointillism.shape', uniform: 'uShape',          min: 0,   max: 2,   step: 1,    default: 0,   description: 'style.pointillism.shapeDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Kaleidoscope
  // ---------------------------------------------------------------------------
  {
    id: 'kaleidoscope',
    label: 'style.kaleidoscope.label',
    description: 'style.kaleidoscope.desc',
    shaderImports: [() => import('../shaders/kaleidoscope.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.kaleidoscope.segments',   uniform: 'uSegments', min: 2,   max: 24,  step: 1,    default: 4,   description: 'style.kaleidoscope.segmentsDesc' },
      { name: 'style.kaleidoscope.rotation', uniform: 'uRotation',  min: 0,   max: 360, step: 1,    default: 0,   description: 'style.kaleidoscope.rotationDesc' },
      { name: 'style.kaleidoscope.zoom',     uniform: 'uZoom',      min: 0.1, max: 5.0, step: 0.01, default: 0.85, description: 'style.kaleidoscope.zoomDesc' },
      { name: 'style.kaleidoscope.centerX', uniform: 'uCenterX',   min: -1.0, max: 1.0, step: 0.01, default: 0.0, description: 'style.kaleidoscope.centerXDesc' },
      { name: 'style.kaleidoscope.centerY', uniform: 'uCenterY',   min: -1.0, max: 1.0, step: 0.01, default: 0.0, description: 'style.kaleidoscope.centerYDesc' },
      { name: 'style.kaleidoscope.edgeGlow', uniform: 'uEdgeGlow',  min: 0.0, max: 2.0, step: 0.01, default: 0.29, description: 'style.kaleidoscope.edgeGlowDesc' },
      { name: 'style.kaleidoscope.hueShift', uniform: 'uHueShift',  min: 0,   max: 360, step: 1,    default: 0,   description: 'style.kaleidoscope.hueShiftDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Crosshatch (Screen-tone Draft)
  // ---------------------------------------------------------------------------
  {
    id: 'crosshatch',
    label: 'style.crosshatch.label',
    description: 'style.crosshatch.desc',
    shaderImports: [() => import('../shaders/crosshatch.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.crosshatch.dotSize',     uniform: 'uDotSize',          min: 2,    max: 30,  step: 1,    default: 8,    description: 'style.crosshatch.dotSizeDesc' },
      { name: 'style.crosshatch.screenAngle', uniform: 'uScreenAngle',      min: 0,    max: 360, step: 1,    default: 45,   description: 'style.crosshatch.screenAngleDesc' },
      { name: 'style.crosshatch.edgeSensitivity',   uniform: 'uEdgeSensitivity',  min: 0.01, max: 1.0, step: 0.01, default: 0.15, description: 'style.crosshatch.edgeSensitivityDesc' },
      { name: 'style.crosshatch.lineWidth',     uniform: 'uLineWidth',        min: 0.5,  max: 5.0, step: 0.1,  default: 1.5,  description: 'style.crosshatch.lineWidthDesc' },
      { name: 'style.crosshatch.paperNoise',     uniform: 'uPaperNoise',       min: 0.0,  max: 0.3, step: 0.01, default: 0.05, description: 'style.crosshatch.paperNoiseDesc' },
      { name: 'style.crosshatch.screenDensity',     uniform: 'uScreenDensity',    min: 0.1,  max: 3.0, step: 0.01, default: 1.0,  description: 'style.crosshatch.screenDensityDesc' },
      { name: 'style.crosshatch.invert',     uniform: 'uInvert',           min: 0,    max: 1,   step: 1,    default: 0,    description: 'style.crosshatch.invertDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Anime Light (multi-pass: edge_blur -> composite)
  // ---------------------------------------------------------------------------
  {
    id: 'animelight',
    label: 'style.animelight.label',
    description: 'style.animelight.desc',
    shaderImports: [
      () => import('../shaders/animelight_edge_blur.frag?raw').then(m => m.default),
      () => import('../shaders/animelight_composite.frag?raw').then(m => m.default),
    ],
    isMultiPass: true,
    params: [
      { name: 'style.animelight.saturation',   uniform: 'uSaturation',     min: 0.5, max: 4.0, step: 0.01, default: 1.69, description: 'style.animelight.saturationDesc' },
      { name: 'style.animelight.edgeWidth', uniform: 'uEdgeWidth',      min: 0.5, max: 5.0, step: 0.1,  default: 0.9, description: 'style.animelight.edgeWidthDesc' },
      { name: 'style.animelight.edgeThreshold', uniform: 'uEdgeThreshold',  min: 0.01, max: 0.5, step: 0.01, default: 0.5, description: 'style.animelight.edgeThresholdDesc' },
      { name: 'style.animelight.godRayStrength', uniform: 'uGodRayStrength', min: 0.0, max: 3.0, step: 0.01, default: 0.8, description: 'style.animelight.godRayStrengthDesc' },
      { name: 'style.animelight.godRayLength', uniform: 'uGodRayLength', min: 0.0, max: 1.0, step: 0.01, default: 0.5, description: 'style.animelight.godRayLengthDesc' },
      { name: 'style.animelight.godRayThreshold', uniform: 'uGodRayThreshold', min: 0.1, max: 1.0, step: 0.01, default: 0.6, description: 'style.animelight.godRayThresholdDesc' },
      { name: 'style.animelight.godRayColor', uniform: 'uGodRayColor', min: 0, max: 360, step: 1, default: 45, description: 'style.animelight.godRayColorDesc' },
      { name: 'style.animelight.godRayAuto', uniform: 'uGodRayAuto', type: 'toggle' as const, default: 1, description: 'style.animelight.godRayAutoDesc' },
      { name: 'style.animelight.centerX', uniform: 'uCenterX', min: 0.0, max: 1.0, step: 0.01, default: 0.5, description: 'style.animelight.centerXDesc' },
      { name: 'style.animelight.centerY', uniform: 'uCenterY', min: 0.0, max: 1.0, step: 0.01, default: 0.3, description: 'style.animelight.centerYDesc' },
      { name: 'style.animelight.glowRadius', uniform: 'uGlowRadius',     min: 1,   max: 50,  step: 0.1,  default: 46.1, description: 'style.animelight.glowRadiusDesc' },
      { name: 'style.animelight.hueShift', uniform: 'uHueShift',       min: 0,   max: 360, step: 1,    default: 0,   description: 'style.animelight.hueShiftDesc' },
      { name: 'style.animelight.contrast',   uniform: 'uContrast',        min: 0.5, max: 3.0, step: 0.01, default: 0.5, description: 'style.animelight.contrastDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Text Raster
  // ---------------------------------------------------------------------------
  {
    id: 'textraster',
    label: 'style.textraster.label',
    description: 'style.textraster.desc',
    shaderImports: [() => import('../shaders/textraster.frag?raw').then(m => m.default)],
    params: [
      { name: 'style.textraster.cellSize',     uniform: 'uCellSize',       min: 4,   max: 40,  step: 1,    default: 10,  description: 'style.textraster.cellSizeDesc' },
      { name: 'style.textraster.textContent',     uniform: 'uTextContent',    type: 'text' as const, textDefault: '01', description: 'style.textraster.textContentDesc' },
      { name: 'style.textraster.fontSize',     uniform: 'uFontSize',       min: 8,   max: 72,  step: 1,    default: 24,  description: 'style.textraster.fontSizeDesc' },
      { name: 'style.textraster.bgBrightness',     uniform: 'uBgBrightness',   min: 0.0, max: 1.0, step: 0.01, default: 0.17, description: 'style.textraster.bgBrightnessDesc' },
      { name: 'style.textraster.colorStrength',     uniform: 'uColorStrength',  min: 0.0, max: 2.0, step: 0.01, default: 1.39, description: 'style.textraster.colorStrengthDesc' },
      { name: 'style.textraster.angle', uniform: 'uAngle',          min: 0,   max: 360, step: 1,    default: 0,   description: 'style.textraster.angleDesc' },
    ],
  },

  // ---------------------------------------------------------------------------
  // ASCII Art (canvas2d)
  // ---------------------------------------------------------------------------
  {
    id: 'ascii',
    label: 'style.ascii.label',
    description: 'style.ascii.desc',
    shaderImports: [],
    renderMode: 'canvas2d',
    params: [
      { name: 'style.ascii.charset', uniform: 'uCharset', type: 'text' as const, textDefault: '天青色等烟雨，而我在等你~LoveU', description: 'style.ascii.charsetDesc' },
      { name: 'style.ascii.font', uniform: 'uFont', type: 'font' as const, description: 'style.ascii.fontDesc' },
      { name: 'style.ascii.caseMode', uniform: 'uCaseMode', type: 'select' as const, options: [
        { label: 'style.ascii.caseKeep', value: 0 },
        { label: 'style.ascii.caseUpper', value: 1 },
        { label: 'style.ascii.caseLower', value: 2 },
      ], default: 0, description: 'style.ascii.caseModeDesc' },
      { name: 'style.ascii.charColor', uniform: 'uCharColor', type: 'color' as const, default: '#0af5a7', description: 'style.ascii.charColorDesc' },
      { name: 'style.ascii.showBg', uniform: 'uShowBg', type: 'toggle' as const, default: 1, description: 'style.ascii.showBgDesc' },
      { name: 'style.ascii.charScale', uniform: 'uCharScale', min: 0.5, max: 1.5, step: 0.05, default: 0.85, description: 'style.ascii.charScaleDesc' },
      { name: 'style.ascii.cellSize', uniform: 'uCellSize', min: 6, max: 40, step: 1, default: 14, description: 'style.ascii.cellSizeDesc' },
      { name: 'style.ascii.randomScale', uniform: 'uRandomScale', min: 0, max: 1, step: 0.05, default: 0.55, description: 'style.ascii.randomScaleDesc' },
      { name: 'style.ascii.bgFilter', uniform: 'uBgFilter', min: 0, max: 0.5, step: 0.01, default: 0.07, description: 'style.ascii.bgFilterDesc' },
    ],
  },
]

/**
 * Look up a style definition by its id.
 */
export function getStyle(id: StyleId): StyleDefinition | undefined {
  return styles.find(s => s.id === id)
}

/** 风格的全部数值型参数（number/toggle/select）默认值；未知 styleId 返回 {}。 */
export function defaultParams(styleId: StyleId): Record<string, number> {
  const def = getStyle(styleId)
  if (!def) return {}
  const out: Record<string, number> = {}
  for (const p of def.params) {
    if (p.type === 'text' || p.type === 'color' || p.type === 'font') continue
    out[p.uniform] = p.default
  }
  return out
}

/** 风格的全部 text/color 参数默认值（color 的值按约定存放于 textParams）；未知 styleId 返回 {}。 */
export function defaultTextParams(styleId: StyleId): Record<string, string> {
  const def = getStyle(styleId)
  if (!def) return {}
  const out: Record<string, string> = {}
  for (const p of def.params) {
    if (p.type === 'text') out[p.uniform] = p.textDefault
    else if (p.type === 'color') out[p.uniform] = p.default
  }
  return out
}
