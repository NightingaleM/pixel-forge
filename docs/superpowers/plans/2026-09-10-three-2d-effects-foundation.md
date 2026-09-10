# Three 2D Effects Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct halftone, Light & Shadow, and pointillism and add four built-in presets per effect without changing the seed schema.

**Architecture:** Add static built-in preset metadata to `StyleDefinition`, centralize normalization and matching in a pure library, and show presets in the existing parameter panel. Keep halftone and pointillism single-pass and Light & Shadow on its current three-pass renderer path.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, WebGL 1.0 / GLSL ES 1.00, i18next.

**Spec:** `docs/superpowers/specs/2026-09-10-three-2d-effects-foundation-design.md`

## Global Constraints

- Keep Style IDs, registry order, parameter count/order/type, numeric min/max/step, and `SEED_VERSION = 0` unchanged.
- Add no dependencies, textures, FBO conventions, render modes, or machine-learning models.
- Built-in presets never enter `pixel-forge.presets.v1` or its displayed count.
- Preserve exports, randomization, compare mode, seed application, session memory, and user presets.
- Use WebGL 1.0-compatible constant loop bounds.
- Halftone must not duplicate Crosshatch edge detection, hatching, or paper noise.
- Light & Shadow remains a screen-space dramatic grade, not physical relighting.

## File Map

| File | Responsibility |
|------|----------------|
| `src/types.ts` | Built-in preset type and optional style metadata. |
| `src/lib/builtInPreset.ts` | Pure preset validation, resolution, and matching. |
| `src/lib/builtInPreset.test.ts` | Preset-domain and registry metadata tests. |
| `src/components/BuiltInPresetBar.tsx` | Translated quick-style buttons. |
| `src/components/App2D.tsx` | Apply and match built-in presets. |
| `src/styles/global.css` | Preset button layout. |
| `src/lib/StyleRegistry.ts` | New defaults and 12 preset definitions. |
| `src/shaders/halftone.frag` | CMY/two-ink screening and coordinate correction. |
| `src/shaders/lightshadow_blur_h.frag` | Soft-threshold bright-pass blur. |
| `src/shaders/lightshadow_composite.frag` | Detail-preserving dramatic grade. |
| `src/shaders/pointillism.frag` | Stable content-driven organic dots. |
| `src/i18n/zh.json`, `src/i18n/en.json` | Preset labels and revised copy. |
| `src/lib/seedCodec.test.ts` | Literal legacy seed compatibility tests. |
| `artifacts/2d-effects-foundation-qa/` | Ignored visual QA images. |

---

### Task 1: Built-in preset domain model

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/builtInPreset.ts`
- Create: `src/lib/builtInPreset.test.ts`
- Modify: `src/lib/presetStore.ts`
- Modify: `src/lib/presetStore.test.ts`

**Interfaces:**
- Produces `BuiltInPresetDefinition` and `StyleDefinition.presets`.
- Produces `resolvePresetValues(def, params, textParams)` and `findMatchingBuiltInPreset(def, params, textParams)`.
- Preserves `mergeWithDefaults(...)` as the saved-preset and seed compatibility entry point.

- [ ] **Step 1: Write failing normalization and matching tests**

Create `src/lib/builtInPreset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { BuiltInPresetDefinition, StyleDefinition } from '../types'
import { findMatchingBuiltInPreset, resolvePresetValues } from './builtInPreset'

const def: StyleDefinition = {
  id: 'halftone', label: 'x', description: 'x', shaderImports: [],
  params: [
    { name: 'size', uniform: 'uSize', min: 2, max: 10, step: 2, default: 4 },
    { name: 'mode', uniform: 'uMode', type: 'select', options: [
      { label: 'a', value: 0 }, { label: 'b', value: 1 },
    ], default: 0 },
    { name: 'color', uniform: 'uColor', type: 'color', default: '#FFFFFF' },
  ],
}

const preset: BuiltInPresetDefinition = {
  id: 'demo', label: 'preset.demo',
  params: { uSize: 99, uMode: 1, uUnknown: 7 },
  textParams: { uColor: '#00FF7F', uUnknownText: 'bad' },
}

describe('resolvePresetValues', () => {
  it('fills defaults, filters unknown keys, snaps numbers, and normalizes colors', () => {
    expect(resolvePresetValues(def, preset.params, preset.textParams ?? {})).toEqual({
      params: { uSize: 10, uMode: 1 },
      textParams: { uColor: '#00ff7f' },
    })
  })

  it('falls back for non-finite numbers, invalid selects, and invalid colors', () => {
    expect(resolvePresetValues(def, { uSize: Infinity, uMode: 8 }, { uColor: 'red' })).toEqual({
      params: { uSize: 4, uMode: 0 },
      textParams: { uColor: '#ffffff' },
    })
  })
})

describe('findMatchingBuiltInPreset', () => {
  const withPreset = { ...def, presets: [preset] }
  it('matches only complete resolved values', () => {
    const values = resolvePresetValues(withPreset, preset.params, preset.textParams ?? {})
    expect(findMatchingBuiltInPreset(withPreset, values.params, values.textParams)).toBe('demo')
    expect(findMatchingBuiltInPreset(withPreset, { ...values.params, uSize: 8 }, values.textParams)).toBeNull()
  })
  it('returns null when no presets exist', () => {
    expect(findMatchingBuiltInPreset(def, { uSize: 4, uMode: 0 }, { uColor: '#ffffff' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/lib/builtInPreset.test.ts`

Expected: FAIL because the new type and module do not exist.

- [ ] **Step 3: Add the metadata types**

Add to `src/types.ts` before `StyleDefinition`:

```ts
export interface BuiltInPresetDefinition {
  id: string
  label: string
  params: Record<string, number>
  textParams?: Record<string, string>
}
```

Add `presets?: BuiltInPresetDefinition[]` to `StyleDefinition`.

- [ ] **Step 4: Implement strict preset resolution**

Create `src/lib/builtInPreset.ts`. Iterate over `def.params`, ignoring unknown input keys. Use this branch logic inside the loop:

```ts
if (p.type === 'font') continue
if (p.type === 'text') {
  textParams[p.uniform] = typeof inputTextParams[p.uniform] === 'string'
    ? inputTextParams[p.uniform]
    : p.textDefault
} else if (p.type === 'color') {
  const raw = inputTextParams[p.uniform]
  textParams[p.uniform] = (isValidHexColor(raw ?? '') ? raw : p.default).toLowerCase()
} else if (p.type === 'select') {
  const raw = inputParams[p.uniform]
  params[p.uniform] = Number.isFinite(raw) && p.options.some((o) => o.value === raw)
    ? raw : p.default
} else if (p.type === 'toggle') {
  const raw = inputParams[p.uniform]
  params[p.uniform] = raw === 0 || raw === 1 ? raw : p.default
} else {
  params[p.uniform] = snapToStep(
    inputParams[p.uniform] ?? p.default,
    p.min, p.max, p.step, p.default,
  )
}
```

Use these exact exports:

```ts
export interface ResolvedPresetValues {
  params: Record<string, number>
  textParams: Record<string, string>
}

export function resolvePresetValues(
  def: StyleDefinition,
  inputParams: Record<string, number>,
  inputTextParams: Record<string, string>,
): ResolvedPresetValues

export function resolveBuiltInPreset(
  def: StyleDefinition,
  preset: BuiltInPresetDefinition,
): ResolvedPresetValues

export function findMatchingBuiltInPreset(
  def: StyleDefinition,
  params: Record<string, number>,
  textParams: Record<string, string>,
): string | null
```

`findMatchingBuiltInPreset` must resolve current values and each preset to complete maps, then compare exact key sets and values. It must not store active state.

- [ ] **Step 5: Reuse validation for saved presets**

Import `resolvePresetValues` in `src/lib/presetStore.ts` and replace the current `mergeWithDefaults` body with:

```ts
return resolvePresetValues(def, params, textParams)
```

Add saved-preset tests for `Infinity`, an out-of-range number, invalid select/toggle, and existing invalid color fallback.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/presetStore.test.ts`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/types.ts src/lib/builtInPreset.ts src/lib/builtInPreset.test.ts src/lib/presetStore.ts src/lib/presetStore.test.ts
git commit -m "feat: add validated built-in effect presets"
```

---

### Task 2: Quick-style UI and App2D integration

**Files:**
- Create: `src/components/BuiltInPresetBar.tsx`
- Modify: `src/components/App2D.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`
- Modify: `src/lib/builtInPreset.test.ts`

**Interfaces:**
- Consumes all Task 1 exports.
- Produces `BuiltInPresetBar({ presets, activeId, onApply })`.
- Preserves existing `PresetBar`/`PresetPanel` storage and UI.

- [ ] **Step 1: Add a failing locale assertion**

Import both locale JSON files in `builtInPreset.test.ts` and assert `zh.preset.quickStyles` and `en.preset.quickStyles` are non-empty. Add this exact dotted-key helper for later registry assertions:

```ts
function readI18n(root: unknown, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) return undefined
    return (value as Record<string, unknown>)[key]
  }, root)
}
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/lib/builtInPreset.test.ts`

Expected: FAIL because both locale keys are missing.

- [ ] **Step 3: Add locale keys**

Add `"quickStyles": "快速风格"` and `"quickStyles": "Quick Styles"` to the existing `preset` objects.

- [ ] **Step 4: Create the preset bar**

Create `BuiltInPresetBar.tsx` with this implementation:

```tsx
interface BuiltInPresetBarProps {
  presets: BuiltInPresetDefinition[]
  activeId: string | null
  onApply: (preset: BuiltInPresetDefinition) => void
}

export default function BuiltInPresetBar({ presets, activeId, onApply }: BuiltInPresetBarProps) {
  const { t } = useTranslation()
  if (presets.length === 0) return null
  return (
    <div className="built-in-presets">
      <div className="built-in-presets-label">{t('preset.quickStyles')}</div>
      <div className="built-in-presets-grid">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`built-in-preset-btn${activeId === preset.id ? ' active' : ''}`}
            aria-pressed={activeId === preset.id}
            onClick={() => onApply(preset)}
          >
            {t(preset.label)}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Integrate App2D without new active state**

Compute and apply presets without a second source of truth:

```tsx
const activeBuiltInPresetId = useMemo(
  () => currentStyle ? findMatchingBuiltInPreset(currentStyle, params, textParams) : null,
  [currentStyle, params, textParams],
)

const handleApplyBuiltInPreset = useCallback((preset: BuiltInPresetDefinition) => {
  const def = getStyle(activeStyle)
  if (!def || !def.presets?.some((candidate) => candidate.id === preset.id)) return
  const merged = resolveBuiltInPreset(def, preset)
  styleMemoryRef.current[activeStyle] = merged
  setParams(merged.params)
  setTextParams(merged.textParams)
  setFontParams({})
}, [activeStyle])
```

Render in this exact order inside `ParamPanel.top`:

```tsx
<SeedBar seed={seed} onApply={handleApplySeed} />
<BuiltInPresetBar
  presets={currentStyle.presets ?? []}
  activeId={activeBuiltInPresetId}
  onApply={handleApplyBuiltInPreset}
/>
<PresetBar
  defaultName={presetDefaultName}
  onSave={handleSavePreset}
  onToggleList={() => setShowPresetPanel((value) => !value)}
  listOpen={showPresetPanel}
  count={presets.length}
/>
```

- [ ] **Step 6: Add compact styles**

Add near the existing preset rules:

```css
.built-in-presets { border-top: 1px solid #ddd; padding: 10px 0; }
.built-in-presets-label { margin-bottom: 7px; color: #666; font-size: 11px; }
.built-in-presets-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.built-in-preset-btn { min-height: 30px; border: 1px solid #999; border-radius: 0; background: #fff; color: #111; font: inherit; font-size: 11px; cursor: pointer; }
.built-in-preset-btn:hover { background: #eaeaea; }
.built-in-preset-btn.active { border-color: #000; background: #000; color: #fff; }
```

Do not add gradients, shadows, or rounded corners.

- [ ] **Step 7: Verify**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/presetStore.test.ts`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```powershell
git add src/components/BuiltInPresetBar.tsx src/components/App2D.tsx src/styles/global.css src/i18n/zh.json src/i18n/en.json src/lib/builtInPreset.test.ts
git commit -m "feat: add quick styles to 2d effect controls"
```

---

### Task 3: Halftone color-separation rewrite

**Files:**
- Modify: `src/shaders/halftone.frag`
- Modify: `src/lib/StyleRegistry.ts`
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`
- Modify: `src/lib/builtInPreset.test.ts`
- Modify: `src/lib/seedCodec.test.ts`

**Interfaces:**
- Produces preset IDs `newsprint`, `colorPrint`, `duotoneRiso`, `coarsePoster`.
- Preserves the six existing halftone parameters and their schema.

- [ ] **Step 1: Add literal legacy-seed and failing metadata tests**

Add this compatibility assertion to `seedCodec.test.ts`:

```ts
it('decodes the pre-upgrade halftone seed unchanged', () => {
  expect(decodeSeed('00njY7e')).toEqual({
    styleId: 'halftone',
    params: { uCellSize: 21, uDotScale: 1.2, uAngle: 45, uHueShift: 30 },
    colorParams: {},
  })
})
```

In `builtInPreset.test.ts`, assert halftone preset IDs equal the four IDs above, each resolves successfully, and both locale files contain every dotted label key. Add a `readI18n(object, dottedKey)` test helper that walks `key.split('.')`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts`

Expected: the legacy seed assertion PASSES and preset metadata assertion FAILS.

- [ ] **Step 3: Register defaults and four presets**

Change only defaults, not types/ranges/order:

```ts
uCellSize: 11
uDotScale: 1.05
uColorMode: 1
uAngle: 0
uShape: 0
uHueShift: 0
```

Add presets with complete numeric maps:

```ts
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
```

Add translated preset names and change the style description to emphasize channel separation and ink overprint.

- [ ] **Step 4: Separate screen coordinates from source coordinates**

In `halftone.frag`, never rotate `vUv`. Add:

```glsl
vec2 rotatePx(vec2 px, float degrees) {
  float rad = degrees * 3.14159265 / 180.0;
  mat2 r = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  return r * (px - uResolution * 0.5) + uResolution * 0.5;
}

float shapeDistance(vec2 p) {
  if (uShape < 0.5) return length(p);
  if (uShape < 1.5) return max(abs(p.x), abs(p.y));
  return (abs(p.x) + abs(p.y)) * 0.7071;
}
```

For every channel angle use this mapping before selecting the channel ink and computing the radius/mask:

```glsl
vec2 screenPx = rotatePx(gl_FragCoord.xy, angle);
vec2 cellId = floor(screenPx / uCellSize);
vec2 screenCenter = (cellId + 0.5) * uCellSize;
vec2 sourceCenter = rotatePx(screenCenter, -angle);
vec2 sampleUv = clamp(sourceCenter / uResolution, 0.0, 1.0);
vec3 sampled = texture2D(uImage, sampleUv).rgb;
vec2 local = fract(screenPx / uCellSize) - 0.5;
float radius = clamp(inkAmount * uDotScale * 0.48, 0.0, 0.7);
float mask = 1.0 - smoothstep(radius - 0.04, radius + 0.04, shapeDistance(local));
```

The inverse mapping is mandatory; sampling with rotated UV repeats the current bug.

- [ ] **Step 5: Implement three ink modes**

Grayscale: composite black ink over `vec3(0.97, 0.955, 0.92)`.

Color: hue-shift the sampled source, convert it to `1.0 - rgb`, screen C/M/Y at relative angles `15°`, `75°`, and `0°`, then multiply ink layers over paper:

```glsl
vec3 outColor = paper;
outColor *= mix(vec3(1.0), vec3(0.0, 0.68, 0.82), cMask);
outColor *= mix(vec3(1.0), vec3(0.88, 0.08, 0.48), mMask);
outColor *= mix(vec3(1.0), vec3(1.0, 0.82, 0.08), yMask);
```

Duotone: screen deep blue and warm red inks at `uAngle` and `uAngle + 55.0`; distribute ink coverage from source luminance rather than multiplying a color gradient by one mask.

- [ ] **Step 6: Automated verification**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts`

Run: `npm run build`

Expected: both exit 0; literal seed still decodes identically.

- [ ] **Step 7: Real WebGL verification**

On all bundled images verify source composition never rotates, corners do not stretch, grayscale is dark ink on light paper, CMY screens are distinct, duotone shows two angles, and Crosshatch remains line-art based.

- [ ] **Step 8: Commit**

```powershell
git add src/shaders/halftone.frag src/lib/StyleRegistry.ts src/i18n/zh.json src/i18n/en.json src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts
git commit -m "feat: turn halftone into color separation print effect"
```

---

### Task 4: Light & Shadow bright-pass and defaults

**Files:**
- Modify: `src/shaders/lightshadow_blur_h.frag`
- Modify: `src/shaders/lightshadow_composite.frag`
- Modify: `src/lib/StyleRegistry.ts`
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`
- Modify: `src/lib/builtInPreset.test.ts`
- Modify: `src/lib/seedCodec.test.ts`

**Interfaces:**
- Produces preset IDs `softWindow`, `productHalo`, `lowKey`, `coolNeon`.
- Preserves seven parameters, three-pass order, and `uOriginal` texture-unit behavior.

- [ ] **Step 1: Add literal seed and failing metadata tests**

Add:

```ts
it('decodes the pre-upgrade lightshadow seed unchanged', () => {
  expect(decodeSeed('03EPxNkRL6Bg2d')).toEqual({
    styleId: 'lightshadow',
    params: {
      uContrast: 1.25, uThreshold: 0.55, uGlowRadius: 18,
      uLightDir: 135, uGlowIntensity: 0.35, uShadowDepth: 0.6,
    },
    colorParams: { uGlowColor: '#62c6ff' },
  })
})
```

Assert the four preset IDs and both-locale labels in `builtInPreset.test.ts`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts`

Expected: literal seed PASSES; preset test FAILS.

- [ ] **Step 3: Register moderate defaults and presets**

Keep schema unchanged. Defaults:

```ts
uContrast: 1.25
uThreshold: 0.55
uGlowRadius: 18
uLightDir: 135
uGlowIntensity: 0.35
uGlowColor: '#FFFFFF'
uShadowDepth: 0.6
```

Presets:

```ts
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
```

Rename only the displayed `uLightDir` label to “氛围光方向” / “Ambient Light Direction” and describe the effect as dramatic tonal shaping.

- [ ] **Step 4: Extract highlights before horizontal blur**

Declare `uThreshold` in `lightshadow_blur_h.frag` and apply:

```glsl
float brightPass(float lum) {
  float gate = smoothstep(uThreshold - 0.08, uThreshold + 0.08, lum);
  float normalized = max(lum - uThreshold, 0.0) / max(1.0 - uThreshold, 0.001);
  return gate * normalized;
}
```

Accumulate `brightPass(lum) * weight`; keep the vertical pass as grayscale blur.

- [ ] **Step 5: Protect detail in the composite**

Use original luminance for the transition and clamp only at output:

```glsl
float origLum = dot(color, vec3(0.299, 0.587, 0.114));
float transition = smoothstep(uThreshold - 0.08, uThreshold + 0.08, origLum);
vec3 contrasted = (color - 0.5) * uContrast + 0.5;
vec3 glow = glowTint * blurredBright * uGlowIntensity;
vec3 shadowed = contrasted * max(0.2, 1.0 - uShadowDepth * 0.55);
vec3 shaped = mix(shadowed, contrasted + glow, transition);
vec3 final = shaped * mix(0.9, 1.1, lightFactor);
```

- [ ] **Step 6: Verify automatically and visually**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts`

Run: `npm run build`

Expected: both exit 0. In WebGL, inspect default plus all four presets on all images: no default clipping, only thresholded highlights glow, direction remains subtle, and preset colors/select states update.

- [ ] **Step 7: Commit**

```powershell
git add src/shaders/lightshadow_blur_h.frag src/shaders/lightshadow_composite.frag src/lib/StyleRegistry.ts src/i18n/zh.json src/i18n/en.json src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts
git commit -m "feat: make light shadow a controlled dramatic grade"
```

---

### Task 5: Content-driven organic pointillism

**Files:**
- Modify: `src/shaders/pointillism.frag`
- Modify: `src/lib/StyleRegistry.ts`
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`
- Modify: `src/lib/builtInPreset.test.ts`
- Modify: `src/lib/seedCodec.test.ts`

**Interfaces:**
- Produces preset IDs `fineDots`, `seuratColor`, `looseBrush`, `confetti`.
- Preserves all six current parameters and their schema.
- Uses a fixed 3×3 candidate loop and stable hash output.

- [ ] **Step 1: Add literal seed and failing metadata tests**

Add:

```ts
it('decodes the pre-upgrade pointillism seed unchanged', () => {
  expect(decodeSeed('0548EOMw')).toEqual({
    styleId: 'pointillism',
    params: {
      uDotSize: 10, uDensity: 1.6, uRandomness: 0.65,
      uSizeVariation: 0.45, uDotOpacity: 0.88,
    },
    colorParams: {},
  })
})
```

Assert the four preset IDs and both-locale labels in `builtInPreset.test.ts`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts`

Expected: literal seed PASSES; pointillism preset test FAILS.

- [ ] **Step 3: Register new defaults and presets**

Keep schema unchanged. Defaults:

```ts
uDotSize: 10
uDensity: 1.6
uRandomness: 0.65
uSizeVariation: 0.45
uDotOpacity: 0.88
uShape: 0
```

Presets:

```ts
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
```

Revise parameter descriptions so Density means mark occupancy and Dot Size means brush scale.

- [ ] **Step 4: Implement stable 3×3 candidates**

Replace `cellSize = uDotSize / uDensity`. Use:

```glsl
vec2 pixel = vUv * uResolution;
float spacing = max(uDotSize, 2.0);
vec2 baseCell = floor(pixel / spacing);
float bestDist = 999.0;
vec3 bestColor = vec3(1.0);

for (int oy = -1; oy <= 1; oy++) {
  for (int ox = -1; ox <= 1; ox++) {
    vec2 cell = baseCell + vec2(float(ox), float(oy));
    vec2 jitter = vec2(hash(cell), hash(cell + 37.17)) - 0.5;
    vec2 sitePx = (cell + 0.5 + jitter * uRandomness * 0.8) * spacing;
    vec2 siteUv = clamp(sitePx / uResolution, 0.0, 1.0);
    vec3 color = texture2D(uImage, siteUv).rgb;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    float hi = max(color.r, max(color.g, color.b));
    float lo = min(color.r, min(color.g, color.b));
    float importance = mix(0.18, 1.0, max(1.0 - lum, (hi - lo) * 0.65));
    float probability = clamp(importance * uDensity * 0.55, 0.03, 0.98);
    bool occupied = hash(cell + 91.73) <= probability;
    float sizeRand = mix(1.0, 0.55 + hash(cell + 173.0) * 0.9, uSizeVariation);
    float radius = spacing * 0.42 * sizeRand;
    vec2 local = (pixel - sitePx) / max(radius, 0.001);
    float candidateDist;
    if (uShape < 0.5) {
      candidateDist = length(local);
    } else if (uShape < 1.5) {
      candidateDist = max(abs(local.x), abs(local.y));
    } else {
      vec2 p = local;
      const float k = 1.7320508;
      p.x = abs(p.x) - 1.0;
      p.y = p.y + 1.0 / k;
      if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
      p.x -= clamp(p.x, -2.0, 0.0);
      candidateDist = length(p) * sign(p.y);
    }
    if (occupied && candidateDist < bestDist) {
      bestDist = candidateDist;
      bestColor = color;
    }
  }
}
```

Turn the retained normalized distance into a roughly one-pixel antialiased mask and composite:

```glsl
float edgeWidth = 1.0 / max(spacing * 0.42, 1.0);
float mask = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, bestDist);
vec3 canvas = vec3(0.985, 0.98, 0.96);
gl_FragColor = vec4(mix(canvas, bestColor, mask * uDotOpacity), 1.0);
```

Use no time, frame, mutable state, texture, or new uniform.

- [ ] **Step 5: Automated verification**

Run: `npm test -- src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts`

Run: `npm run build`

Expected: both exit 0; literal seed remains identical.

- [ ] **Step 6: Real WebGL verification**

On all bundled images verify light neutral regions have fewer marks, Density changes occupancy more than diameter, Dot Size changes abstraction, Randomness breaks rows without flicker, all presets differ, and near-2K slider interaction remains responsive.

- [ ] **Step 7: Commit**

```powershell
git add src/shaders/pointillism.frag src/lib/StyleRegistry.ts src/i18n/zh.json src/i18n/en.json src/lib/builtInPreset.test.ts src/lib/seedCodec.test.ts
git commit -m "feat: make pointillism content driven and organic"
```

---

### Task 6: Full regression and visual acceptance

**Files:**
- Modify only an in-scope file when fresh evidence exposes a defect.
- Create ignored files under `artifacts/2d-effects-foundation-qa/`.

**Interfaces:**
- Consumes all prior tasks.
- Produces fresh automated gates and visual QA evidence.

- [ ] **Step 1: Run all automated gates**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: every command exits 0, with zero failed tests and zero lint errors.

- [ ] **Step 2: Audit seed-schema invariants**

Run:

```powershell
git diff f8f1ef4 -- src/types.ts src/lib/StyleRegistry.ts src/lib/seedCodec.ts
```

Confirm `StyleDefinition.presets` is additive, `seedCodec.ts` and `SEED_VERSION` are unchanged, registry order/Style IDs are unchanged, and the three styles changed only defaults plus preset metadata—not parameter types/order/ranges.

- [ ] **Step 3: Exercise all browser flows**

For each effect: apply every built-in preset; confirm active state; move one parameter and confirm it clears; Reset; Random; save to “我的配置”; switch away and back; reapply the user preset; apply its literal legacy seed; toggle Compare; export PNG and JPG. Confirm existing SVG availability rules remain unchanged.

- [ ] **Step 4: Capture and inspect visual evidence**

Create `artifacts/2d-effects-foundation-qa/` and save four contact sheets: three defaults on `cake.jpg`, four halftone presets, four Light & Shadow presets, and four pointillism presets. Add at least one `car.jpg` or `car2.jpg` cross-check per effect.

Inspect full-size output for blank canvases, clipping, source rotation/cropping, corner stretching, repetitive grid artifacts, indistinguishable presets, and flicker.

- [ ] **Step 5: Correct only verified in-scope defects**

For each defect, first strengthen the nearest automated regression when feasible, then apply the smallest fix. After the last fix rerun its focused test, `npm test`, `npm run lint`, and `npm run build`.

- [ ] **Step 6: Review final workspace state**

Run:

```powershell
git status --short
git diff --check
git diff --stat f8f1ef4
```

Confirm root `task_plan.md`, `findings.md`, `progress.md`, generated `dist`, ignored artifacts, and unrelated user files are not staged.

- [ ] **Step 7: Commit integration corrections only if tracked fixes exist**

Stage the explicit in-scope files shown by `git status --short` and commit:

```powershell
git commit -m "fix: polish upgraded 2d effect presets"
```

If no tracked correction exists, skip the commit instead of creating an empty commit.

---

## Completion Criteria

- All 12 presets are translated, selectable, matched from values, and separate from user storage.
- Halftone provides distinct grayscale, CMY, and two-ink output without rotating source content.
- Light & Shadow preserves default detail and blooms only thresholded highlights.
- Pointillism changes mark occupancy by image content and remains stable across frames.
- Literal historical seeds decode to identical parameter values; seed schema is unchanged.
- User presets, compare, reset, random, seed application, and exports still work.
- Full tests, lint, build, and visual inspection pass.
