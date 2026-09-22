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
      { name: 'style.halftone.cellSize',    uniform: 'uCellSize',  min: 2,   max: 50,  step: 1,    default: 11,  description: 'style.halftone.cellSizeDesc' },
      { name: 'style.halftone.dotScale',    uniform: 'uDotScale',  min: 0.1, max: 3.0, step: 0.01, default: 1.05, description: 'style.halftone.dotScaleDesc' },
      { name: 'style.halftone.colorMode', uniform: 'uColorMode', type: 'select' as const, options: [
        { label: 'style.halftone.modeGray', value: 0 },
        { label: 'style.halftone.modeColor', value: 1 },
        { label: 'style.halftone.modeDuotone', value: 2 },
      ], default: 1, description: 'style.halftone.colorModeDesc' },
      { name: 'style.halftone.angle', uniform: 'uAngle',     min: 0,   max: 360, step: 1,    default: 0,   description: 'style.halftone.angleDesc' },
      { name: 'style.halftone.shape', uniform: 'uShape', type: 'select' as const, options: [
        { label: 'style.halftone.shapeCircle', value: 0 },
        { label: 'style.halftone.shapeSquare', value: 1 },
        { label: 'style.halftone.shapeDiamond', value: 2 },
      ], default: 0, description: 'style.halftone.shapeDesc' },
      { name: 'style.halftone.hueShift',    uniform: 'uHueShift',  min: 0,   max: 360, step: 1,    default: 0,   description: 'style.halftone.hueShiftDesc' },
    ],
    presets: [
      { id: 'newsprint', label: 'style.halftone.presets.newsprint', params: {
        uCellSize: 9, uDotScale: 1.15, uColorMode: 0, uAngle: 45, uShape: 0, uHueShift: 0,
      } },
      { id: 'colorPrint', label: 'style.halftone.presets.colorPrint', params: {
        uCellSize: 11, uDotScale: 1.05, uColorMode: 1, uAngle: 0, uShape: 0, uHueShift: 0,
      } },
      { id: 'duotoneRiso', label: 'style.halftone.presets.duotoneRiso', params: {
        uCellSize: 14, uDotScale: 1.2, uColorMode: 2, uAngle: 15, uShape: 0, uHueShift: 0,
      } },
      { id: 'coarsePoster', label: 'style.halftone.presets.coarsePoster', params: {
        uCellSize: 24, uDotScale: 1.4, uColorMode: 1, uAngle: 30, uShape: 1, uHueShift: 15,
      } },
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
      { name: 'style.diffusion.noiseType', uniform: 'uNoiseType', type: 'select' as const, options: [
        { label: 'style.diffusion.noiseOrdered4', value: 0 },
        { label: 'style.diffusion.noiseOrdered8', value: 1 },
        { label: 'style.diffusion.noiseRandom', value: 2 },
      ], default: 1, description: 'style.diffusion.noiseTypeDesc' },
      { name: 'style.diffusion.ditherStrength', uniform: 'uDitherStrength', min: 0.0, max: 1.0, step: 0.01, default: 0.11, description: 'style.diffusion.ditherStrengthDesc' },
      { name: 'style.diffusion.grayscale', uniform: 'uGrayscale', type: 'toggle' as const, default: 0, description: 'style.diffusion.grayscaleDesc' },
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
      { name: 'style.popart.palette', uniform: 'uPalette', type: 'select' as const, options: [
        { label: 'style.popart.paletteOriginal', value: 0 },
        { label: 'style.popart.paletteWarm', value: 1 },
        { label: 'style.popart.paletteCool', value: 2 },
        { label: 'style.popart.paletteNeon', value: 3 },
        { label: 'style.popart.paletteVintage', value: 4 },
      ], default: 3, description: 'style.popart.paletteDesc' },
      { name: 'style.popart.benDay', uniform: 'uBenDay', type: 'toggle' as const, default: 1, description: 'style.popart.benDayDesc' },
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
      { name: 'style.lightshadow.contrast',   uniform: 'uContrast',    min: 0.5, max: 3.0, step: 0.01, default: 1.25, description: 'style.lightshadow.contrastDesc' },
      { name: 'style.lightshadow.threshold', uniform: 'uThreshold',    min: 0.1, max: 0.9, step: 0.01, default: 0.55, description: 'style.lightshadow.thresholdDesc' },
      { name: 'style.lightshadow.glowRadius',   uniform: 'uGlowRadius',  min: 0,   max: 50,  step: 0.1,  default: 18,  description: 'style.lightshadow.glowRadiusDesc' },
      { name: 'style.lightshadow.lightDir', uniform: 'uLightDir',    min: 0,   max: 360, step: 1,    default: 135, description: 'style.lightshadow.lightDirDesc' },
      { name: 'style.lightshadow.glowIntensity',   uniform: 'uGlowIntensity', min: 0.0, max: 2.0, step: 0.01, default: 0.35, description: 'style.lightshadow.glowIntensityDesc' },
      { name: 'style.lightshadow.glowColor', uniform: 'uGlowColor', type: 'color' as const, default: '#FFFFFF', description: 'style.lightshadow.glowColorDesc' },
      { name: 'style.lightshadow.shadowDepth',   uniform: 'uShadowDepth',   min: 0.0, max: 2.0, step: 0.01, default: 0.6, description: 'style.lightshadow.shadowDepthDesc' },
    ],
    presets: [
      { id: 'softWindow', label: 'style.lightshadow.presets.softWindow', params: {
        uContrast: 1.15, uThreshold: 0.62, uGlowRadius: 18, uLightDir: 135,
        uGlowIntensity: 0.22, uShadowDepth: 0.35,
      }, textParams: { uGlowColor: '#FFFFFF' } },
      { id: 'productHalo', label: 'style.lightshadow.presets.productHalo', params: {
        uContrast: 1.2, uThreshold: 0.72, uGlowRadius: 24, uLightDir: 270,
        uGlowIntensity: 0.55, uShadowDepth: 0.25,
      }, textParams: { uGlowColor: '#FFFFFF' } },
      { id: 'lowKey', label: 'style.lightshadow.presets.lowKey', params: {
        uContrast: 1.55, uThreshold: 0.58, uGlowRadius: 12, uLightDir: 35,
        uGlowIntensity: 0.12, uShadowDepth: 1.2,
      }, textParams: { uGlowColor: '#FFD0A0' } },
      { id: 'coolNeon', label: 'style.lightshadow.presets.coolNeon', params: {
        uContrast: 1.35, uThreshold: 0.5, uGlowRadius: 30, uLightDir: 220,
        uGlowIntensity: 0.65, uShadowDepth: 0.75,
      }, textParams: { uGlowColor: '#62C6FF' } },
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
      { name: 'style.sketch.detail',   uniform: 'uDetail',        min: 0.0, max: 1.0, step: 0.01, default: 1,  description: 'style.sketch.detailDesc' },
      { name: 'style.sketch.hatching', uniform: 'uHatching', type: 'toggle' as const, default: 0, description: 'style.sketch.hatchingDesc' },
      // 背景色：原白/深蓝二选一 select 改为色板（旧深蓝 #1A3A5C 可手动选回）
      { name: 'style.sketch.bgColor', uniform: 'uBgColor', type: 'color' as const, default: '#FFFFFF', description: 'style.sketch.bgColorDesc' },
      { name: 'style.sketch.lineColor', uniform: 'uLineColor', type: 'color' as const, default: '#FF7300', description: 'style.sketch.lineColorDesc' },
      { name: 'style.sketch.hatchDensity',  uniform: 'uHatchDensity',  min: 1,   max: 10,  step: 1,    default: 1,   description: 'style.sketch.hatchDensityDesc' },
      { name: 'style.sketch.edgeMethod', uniform: 'uEdgeMethod', type: 'select' as const, options: [
        { label: 'style.sketch.edgeSobel', value: 0 },
        { label: 'style.sketch.edgePrewitt', value: 1 },
      ], default: 1, description: 'style.sketch.edgeMethodDesc' },
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
      { name: 'style.pointillism.dotSize', uniform: 'uDotSize',        min: 2,   max: 60,  step: 1,    default: 10,  description: 'style.pointillism.dotSizeDesc' },
      { name: 'style.pointillism.density',     uniform: 'uDensity',        min: 0.1, max: 5.0, step: 0.01, default: 1.6, description: 'style.pointillism.densityDesc' },
      { name: 'style.pointillism.randomness', uniform: 'uRandomness',     min: 0.0, max: 1.0, step: 0.01, default: 0.65, description: 'style.pointillism.randomnessDesc' },
      { name: 'style.pointillism.sizeVariation', uniform: 'uSizeVariation', min: 0.0, max: 1.0, step: 0.01, default: 0.45, description: 'style.pointillism.sizeVariationDesc' },
      { name: 'style.pointillism.dotOpacity', uniform: 'uDotOpacity',   min: 0.1, max: 1.0, step: 0.01, default: 0.88, description: 'style.pointillism.dotOpacityDesc' },
      { name: 'style.pointillism.shape', uniform: 'uShape', type: 'select' as const, options: [
        { label: 'style.pointillism.shapeCircle', value: 0 },
        { label: 'style.pointillism.shapeSquare', value: 1 },
        { label: 'style.pointillism.shapeTriangle', value: 2 },
      ], default: 0, description: 'style.pointillism.shapeDesc' },
    ],
    presets: [
      { id: 'fineDots', label: 'style.pointillism.presets.fineDots', params: {
        uDotSize: 6, uDensity: 2.8, uRandomness: 0.45,
        uSizeVariation: 0.25, uDotOpacity: 0.9, uShape: 0,
      } },
      { id: 'seuratColor', label: 'style.pointillism.presets.seuratColor', params: {
        uDotSize: 10, uDensity: 1.8, uRandomness: 0.65,
        uSizeVariation: 0.45, uDotOpacity: 0.88, uShape: 0,
      } },
      { id: 'looseBrush', label: 'style.pointillism.presets.looseBrush', params: {
        uDotSize: 18, uDensity: 1.0, uRandomness: 0.9,
        uSizeVariation: 0.75, uDotOpacity: 0.82, uShape: 0,
      } },
      { id: 'confetti', label: 'style.pointillism.presets.confetti', params: {
        uDotSize: 13, uDensity: 1.45, uRandomness: 1.0,
        uSizeVariation: 1.0, uDotOpacity: 0.95, uShape: 2,
      } },
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
      { name: 'style.kaleidoscope.mirrorMode', uniform: 'uMirrorMode', type: 'select' as const, options: [
        { label: 'style.kaleidoscope.modeTube',     value: 0 },
        { label: 'style.kaleidoscope.modePosition', value: 1 },
        { label: 'style.kaleidoscope.modeMirror',   value: 2 },
      ], default: 0, description: 'style.kaleidoscope.mirrorModeDesc' },
      { name: 'style.kaleidoscope.segments',   uniform: 'uSegments', min: 2,   max: 24,  step: 1,    default: 6,   description: 'style.kaleidoscope.segmentsDesc' },
      { name: 'style.kaleidoscope.fracture',   uniform: 'uFracture', min: 1,   max: 6,   step: 1,    default: 1,   description: 'style.kaleidoscope.fractureDesc' },
      { name: 'style.kaleidoscope.cellSize',   uniform: 'uCellSize', min: 0.1, max: 0.6, step: 0.05, default: 0.25, description: 'style.kaleidoscope.cellSizeDesc' },
      { name: 'style.kaleidoscope.rotation', uniform: 'uRotation',  min: 0,   max: 360, step: 1,    default: 0,   description: 'style.kaleidoscope.rotationDesc' },
      { name: 'style.kaleidoscope.zoom',     uniform: 'uZoom',      min: 0.1, max: 5.0, step: 0.01, default: 1.0, description: 'style.kaleidoscope.zoomDesc' },
      { name: 'style.kaleidoscope.centerX', uniform: 'uCenterX',   min: -1.0, max: 1.0, step: 0.01, default: 0.0, description: 'style.kaleidoscope.centerXDesc' },
      { name: 'style.kaleidoscope.centerY', uniform: 'uCenterY',   min: -1.0, max: 1.0, step: 0.01, default: 0.0, description: 'style.kaleidoscope.centerYDesc' },
      { name: 'style.kaleidoscope.prism',    uniform: 'uPrism',    type: 'toggle' as const, default: 0,   description: 'style.kaleidoscope.prismDesc' },
      { name: 'style.kaleidoscope.viewMask', uniform: 'uViewMask', type: 'select' as const, options: [
        { label: 'style.kaleidoscope.viewFull',   value: 0 },
        { label: 'style.kaleidoscope.viewCircle', value: 1 },
      ], default: 0, description: 'style.kaleidoscope.viewMaskDesc' },
      { name: 'style.kaleidoscope.edgeGlow', uniform: 'uEdgeGlow',  min: 0.0, max: 2.0, step: 0.01, default: 0.45, description: 'style.kaleidoscope.edgeGlowDesc' },
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
      { name: 'style.crosshatch.invert', uniform: 'uInvert', type: 'toggle' as const, default: 0, description: 'style.crosshatch.invertDesc' },
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
      { name: 'style.animelight.godRayColor', uniform: 'uGodRayColor', type: 'color' as const, default: '#FF9166', description: 'style.animelight.godRayColorDesc' },
      { name: 'style.animelight.godRayAuto', uniform: 'uGodRayAuto', type: 'toggle' as const, default: 1, description: 'style.animelight.godRayAutoDesc' },
      { name: 'style.animelight.centerX', uniform: 'uCenterX', min: 0.0, max: 1.0, step: 0.01, default: 0.42, description: 'style.animelight.centerXDesc' },
      { name: 'style.animelight.centerY', uniform: 'uCenterY', min: 0.0, max: 1.0, step: 0.01, default: 0.3, description: 'style.animelight.centerYDesc' },
      { name: 'style.animelight.glowRadius', uniform: 'uGlowRadius',     min: 1,   max: 50,  step: 0.1,  default: 39.1, description: 'style.animelight.glowRadiusDesc' },
      { name: 'style.animelight.hueShift', uniform: 'uHueShift',       min: 0,   max: 360, step: 1,    default: 0,   description: 'style.animelight.hueShiftDesc' },
      { name: 'style.animelight.contrast',   uniform: 'uContrast',        min: 0.5, max: 3.0, step: 0.01, default: 0.96, description: 'style.animelight.contrastDesc' },
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
