# 四种新特效实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 web_pic_design_ai 新增4种 WebGL 特效：万花筒镜像、网纹底稿、动画光影、文字栅格

**Architecture:** 遵循现有 StyleRegistry + ShaderRenderer 模式。万花筒和网纹底稿为单 pass shader，动画光影为 2 pass 多 pass shader，文字栅格需要扩展 ParamDef 类型系统支持文本输入。动画光影引入 TEXTURE1 绑定原图的多 pass 约定。

**Tech Stack:** React 19, TypeScript, WebGL 1.0 (GLSL ES 1.0), Vite

**Spec:** `docs/superpowers/specs/2026-03-28-four-new-effects-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/types.ts` | 扩展 StyleId 联合类型 + ParamDef 改为 discriminated union |
| Create | `src/shaders/kaleidoscope.frag` | 万花筒镜像 shader |
| Create | `src/shaders/crosshatch.frag` | 网纹底稿 shader |
| Create | `src/shaders/animelight_edge_blur.frag` | 动画光影 Pass 1：边缘提取+光晕模糊 |
| Create | `src/shaders/animelight_composite.frag` | 动画光影 Pass 2：合成+神光束 |
| Create | `src/shaders/textraster.frag` | 文字栅格 shader |
| Modify | `src/lib/StyleRegistry.ts` | 注册4种新特效 |
| Modify | `src/lib/ShaderRenderer.ts` | 新增 loadTextTexture/bindTexture + renderMultiPass 绑定原图到 TEXTURE1 |
| Modify | `src/components/ParamPanel.tsx` | 支持文本输入控件 |
| Modify | `src/components/App.tsx` | 处理文本参数和纹理绑定 |
| Modify | `src/shaders/lightshadow_composite.frag` | 适配 uOriginal 约定 |

---

## Task 1: 扩展 types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 更新 StyleId 联合类型**

将 `src/types.ts:1` 的 `StyleId` 扩展：

```typescript
export type StyleId = 'halftone' | 'diffusion' | 'popart' | 'lightshadow' | 'sketch' | 'pointillism' | 'kaleidoscope' | 'crosshatch' | 'animelight' | 'textraster'
```

- [ ] **Step 2: 将 ParamDef 改为 discriminated union**

替换 `src/types.ts:3-11` 的 `ParamDef` 接口为：

```typescript
export interface NumberParamDef {
  type?: 'number'
  name: string
  uniform: string
  min: number
  max: number
  step: number
  default: number
  description?: string
}

export interface TextParamDef {
  type: 'text'
  name: string
  uniform: string
  textDefault: string
  description?: string
}

export type ParamDef = NumberParamDef | TextParamDef
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `npx tsc --noEmit`
Expected: 无类型错误（现有代码使用 `ParamDef` 的地方因为 `type` 是可选字段且默认 `'number'`，所以全部兼容）

- [ ] **Step 4: 提交**

```bash
git add src/types.ts
git commit -m "feat: extend StyleId and ParamDef types for new effects"
```

---

## Task 2: 万花筒镜像 shader + 注册

**Files:**
- Create: `src/shaders/kaleidoscope.frag`
- Modify: `src/lib/StyleRegistry.ts`

- [ ] **Step 1: 创建 kaleidoscope.frag**

创建 `src/shaders/kaleidoscope.frag`：

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uSegments;
uniform float uRotation;
uniform float uZoom;
uniform float uCenterX;
uniform float uCenterY;
uniform float uEdgeGlow;
uniform float uHueShift;

vec3 hue2rgb(float h) {
  h = fract(h);
  float r = abs(h * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h * 6.0 - 2.0);
  float b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 rgb2hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float h = 0.0;
  if (d > 0.001) {
    if (mx == c.r) h = (c.g - c.b) / d;
    else if (mx == c.g) h = 2.0 + (c.b - c.r) / d;
    else h = 4.0 + (c.r - c.g) / d;
    h = fract(h / 6.0);
  }
  float s = mx > 0.001 ? d / mx : 0.0;
  return vec3(h, s, mx);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = hue2rgb(c.x);
  return rgb * c.z;
}

void main() {
  // Center UV and apply offset
  vec2 uv = vUv - 0.5 - vec2(uCenterX, uCenterY) * 0.5;

  // Apply rotation
  float rot = uRotation * 3.14159265 / 180.0;
  mat2 rotMat = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
  uv = rotMat * uv;

  // Apply zoom
  uv /= max(uZoom, 0.01);

  // Convert to polar coordinates
  float r = length(uv);
  float theta = atan(uv.y, uv.x);

  // Kaleidoscope fold
  float segAngle = 3.14159265 * 2.0 / max(uSegments, 2.0);
  theta = mod(theta, segAngle);

  // Mirror every other segment
  float segIndex = floor(atan(uv.y, uv.x) / segAngle);
  if (mod(segIndex, 2.0) > 0.5) {
    theta = segAngle - theta;
  }

  // Convert back to Cartesian
  vec2 kaleidoUv = vec2(cos(theta), sin(theta)) * r + 0.5;

  // Sample texture
  vec3 color = texture2D(uImage, clamp(kaleidoUv, 0.0, 1.0)).rgb;

  // Edge glow: detect proximity to segment boundary
  float edgeDist = abs(theta - segAngle * 0.5) / segAngle;
  float glow = smoothstep(0.4, 0.5, edgeDist) * uEdgeGlow;
  color += vec3(0.8, 0.9, 1.0) * glow;

  // Apply hue shift
  if (uHueShift > 0.5) {
    vec3 hsv = rgb2hsv(color);
    hsv.x = fract(hsv.x + uHueShift / 360.0);
    color = hsv2rgb(hsv);
  }

  // Vignette at edges (fade to black where r > 0.5)
  float vignette = smoothstep(0.8, 0.4, r);
  color *= mix(1.0, vignette, 0.5);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
```

- [ ] **Step 2: 在 StyleRegistry.ts 注册万花筒特效**

在 `src/lib/StyleRegistry.ts` 的 `styles` 数组末尾（`pointillism` 之后），添加：

```typescript
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
```

- [ ] **Step 3: 验证构建**

Run: `npx vite build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/shaders/kaleidoscope.frag src/lib/StyleRegistry.ts
git commit -m "feat: add kaleidoscope mirror effect"
```

---

## Task 3: 网纹底稿 shader + 注册

**Files:**
- Create: `src/shaders/crosshatch.frag`
- Modify: `src/lib/StyleRegistry.ts`

- [ ] **Step 1: 创建 crosshatch.frag**

创建 `src/shaders/crosshatch.frag`：

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uDotSize;
uniform float uScreenAngle;
uniform float uEdgeSensitivity;
uniform float uLineWidth;
uniform float uPaperNoise;
uniform float uScreenDensity;
uniform float uInvert;

// Simple hash for paper noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 texel = 1.0 / uResolution;

  // 1. Sample color and compute luminance
  vec3 color = texture2D(uImage, vUv).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // 2. Sobel edge detection
  float tl = dot(texture2D(uImage, vUv + vec2(-1.0, -1.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float t  = dot(texture2D(uImage, vUv + vec2( 0.0, -1.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture2D(uImage, vUv + vec2( 1.0, -1.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float l  = dot(texture2D(uImage, vUv + vec2(-1.0,  0.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float r  = dot(texture2D(uImage, vUv + vec2( 1.0,  0.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture2D(uImage, vUv + vec2(-1.0,  1.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float b  = dot(texture2D(uImage, vUv + vec2( 0.0,  1.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture2D(uImage, vUv + vec2( 1.0,  1.0) * texel * uLineWidth).rgb, vec3(0.299, 0.587, 0.114));

  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);

  // Apply sensitivity threshold
  edge = smoothstep(uEdgeSensitivity, uEdgeSensitivity * 3.0, edge);

  // 3. Screen tone (rotatable dot grid)
  float rad = uScreenAngle * 3.14159265 / 180.0;
  mat2 rotMat = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  vec2 screenUv = rotMat * (vUv * uResolution);
  vec2 cellId = floor(screenUv / uDotSize);
  vec2 cellLocal = fract(screenUv / uDotSize) - 0.5;

  // Dot radius based on darkness (inverse of luminance)
  float darkness = 1.0 - lum;
  darkness = clamp(darkness * uScreenDensity, 0.0, 1.0);
  float dotRadius = darkness * 0.45;

  float dist = length(cellLocal);
  float dotMask = 1.0 - smoothstep(dotRadius - 0.05, dotRadius + 0.05, dist);

  // 4. Paper noise
  float paperGrain = noise(vUv * uResolution * 0.5) * 2.0 - 1.0;
  float paperNoise = paperGrain * uPaperNoise;

  // 5. Compose: white background + screen tone dots + edge lines
  float bgValue = 1.0;
  float result = bgValue;

  // Subtract screen tone (dots darken the paper)
  result = mix(result, result * 0.1, dotMask);

  // Edge lines: black over everything
  result = mix(result, 0.0, edge);

  // Paper noise
  result += paperNoise;

  // 6. Invert if needed
  if (uInvert > 0.5) {
    result = 1.0 - result;
  }

  gl_FragColor = vec4(vec3(clamp(result, 0.0, 1.0)), 1.0);
}
```

- [ ] **Step 2: 在 StyleRegistry.ts 注册网纹底稿**

在 `kaleidoscope` 注册后添加：

```typescript
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
```

- [ ] **Step 3: 验证构建**

Run: `npx vite build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/shaders/crosshatch.frag src/lib/StyleRegistry.ts
git commit -m "feat: add crosshatch screen-tone draft effect"
```

---

## Task 4: 多 pass 原图访问 + lightshadow 修复 + 动画光影

**Files:**
- Modify: `src/lib/ShaderRenderer.ts` (renderMultiPass 方法)
- Modify: `src/shaders/lightshadow_composite.frag`
- Create: `src/shaders/animelight_edge_blur.frag`
- Create: `src/shaders/animelight_composite.frag`
- Modify: `src/lib/StyleRegistry.ts`

- [ ] **Step 1: 修改 ShaderRenderer.ts renderMultiPass 方法**

在 `src/lib/ShaderRenderer.ts` 的 `renderMultiPass` 方法中，在每个 pass 的 `gl.bindTexture(gl.TEXTURE_2D, currentInput)` 之后、`gl.drawArrays` 之前，添加原图绑定到 TEXTURE1。

在 `renderMultiPass` 方法中有两个分支需要修改：

**分支 A — Final pass（约第294行，`isLast` 为 true 的分支）：**
找到：
```typescript
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, currentInput)

        for (const [name, value] of Object.entries(pass.uniforms)) {
```
在 `gl.bindTexture` 之后、`for` 循环之前，添加：
```typescript
        // Bind original image to TEXTURE1 for composite passes
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.texture)
```

**分支 B — Non-final pass（约第312行，`else` 分支）：**
找到：
```typescript
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, currentInput)

        for (const [name, value] of Object.entries(pass.uniforms)) {
```
在 `gl.bindTexture` 之后、`for` 循环之前，添加同样的两行。

> 参考：`gl.activeTexture(gl.TEXTURE0)` + `gl.bindTexture` 在 final pass 中位于第294行附近，在 non-final pass 中位于第312行附近。
```typescript
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, currentInput)

        for (const [name, value] of Object.entries(pass.uniforms)) {
```

在 for 循环之前添加同样的两行。

- [ ] **Step 2: 修改 lightshadow_composite.frag**

替换 `src/shaders/lightshadow_composite.frag` 为：

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // previous pass output (blur_v luminance)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform float uContrast;
uniform float uThreshold;
uniform float uGlowRadius;
uniform float uLightDir;
uniform float uGlowIntensity;
uniform float uGlowColor;
uniform float uShadowDepth;

vec3 hue2rgb(float h) {
  h = fract(h);
  float r = abs(h * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h * 6.0 - 2.0);
  float b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
  // 1. Sample original color from uOriginal (TEXTURE1)
  vec3 color = texture2D(uOriginal, vUv).rgb;

  // 2. Sample blurred luminance from uImage (TEXTURE0, blur_v output)
  float blurred = texture2D(uImage, vUv).r;

  // 3. Create glow effect from blurred luminance with intensity control
  float glowStrength = blurred * (1.0 - uThreshold) * 2.0 * uGlowIntensity;

  // 3.5 Tint glow with color
  vec3 glowTint = vec3(1.0);
  if (uGlowColor > 0.5) {
    glowTint = mix(vec3(1.0), hue2rgb(uGlowColor / 360.0), 0.5);
  }
  vec3 glow = glowTint * glowStrength;

  // 4. Apply directional light
  float rad = uLightDir * 3.14159265 / 180.0;
  vec2 lightVec = normalize(vec2(cos(rad), sin(rad)));
  vec2 posOffset = (vUv - 0.5) * 2.0;
  float lightFactor = dot(lightVec, posOffset) * 0.5 + 0.5;

  // 5. Apply contrast to original
  color = (color - 0.5) * uContrast + 0.5;

  // 6. Threshold split with smooth transition
  float transition = smoothstep(uThreshold - 0.1, uThreshold + 0.1, blurred);

  // Bright areas: keep contrast-adjusted color + add glow
  vec3 brightened = color + glow;

  // Dark areas: darken based on shadow depth
  vec3 darkened = color * max(0.05, 1.0 - uShadowDepth * 0.7);

  // 7. Blend based on blurred luminance threshold
  vec3 final = mix(darkened, brightened, transition);

  // 8. Apply light direction factor
  final *= mix(0.6, 1.0, lightFactor);

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
```

- [ ] **Step 3: 创建 animelight_edge_blur.frag**

创建 `src/shaders/animelight_edge_blur.frag`：

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uEdgeWidth;
uniform float uEdgeThreshold;
uniform float uGlowRadius;

void main() {
  vec2 texel = 1.0 / uResolution;
  vec3 color = texture2D(uImage, vUv).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // Sobel edge detection
  float tl = dot(texture2D(uImage, vUv + vec2(-1.0, -1.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float t  = dot(texture2D(uImage, vUv + vec2( 0.0, -1.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture2D(uImage, vUv + vec2( 1.0, -1.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float l  = dot(texture2D(uImage, vUv + vec2(-1.0,  0.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float r  = dot(texture2D(uImage, vUv + vec2( 1.0,  0.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture2D(uImage, vUv + vec2(-1.0,  1.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float b  = dot(texture2D(uImage, vUv + vec2( 0.0,  1.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture2D(uImage, vUv + vec2( 1.0,  1.0) * texel * uEdgeWidth).rgb, vec3(0.299, 0.587, 0.114));

  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  edge = smoothstep(uEdgeThreshold, uEdgeThreshold * 3.0, edge);

  // Local glow blur (9-tap average of luminance)
  float glowAccum = 0.0;
  float totalWeight = 0.0;
  float sigma = max(uGlowRadius / 3.0, 0.001);
  float sigma2 = 2.0 * sigma * sigma;

  for (int dx = -4; dx <= 4; dx++) {
    for (int dy = -4; dy <= 4; dy++) {
      vec2 offset = vec2(float(dx), float(dy)) * texel * uGlowRadius * 0.25;
      float dist2 = float(dx * dx + dy * dy);
      float w = exp(-dist2 / (sigma2 * 4.0));
      float sampleLum = dot(texture2D(uImage, vUv + offset).rgb, vec3(0.299, 0.587, 0.114));
      glowAccum += sampleLum * w;
      totalWeight += w;
    }
  }
  float glow = glowAccum / max(totalWeight, 0.001);

  // Output: R=glow intensity, G=edge intensity
  gl_FragColor = vec4(glow, edge, 0.0, 1.0);
}
```

- [ ] **Step 4: 创建 animelight_composite.frag**

创建 `src/shaders/animelight_composite.frag`：

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // Pass 1 output (R=glow, G=edge)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uEdgeWidth;
uniform float uEdgeThreshold;
uniform float uGodRayStrength;
uniform float uGodRayAngle;
uniform float uGlowRadius;
uniform float uHueShift;
uniform float uContrast;

vec3 rgb2hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float h = 0.0;
  if (d > 0.001) {
    if (mx == c.r) h = (c.g - c.b) / d;
    else if (mx == c.g) h = 2.0 + (c.b - c.r) / d;
    else h = 4.0 + (c.r - c.g) / d;
    h = fract(h / 6.0);
  }
  float s = mx > 0.001 ? d / mx : 0.0;
  return vec3(h, s, mx);
}

vec3 hue2rgb(float h) {
  h = fract(h);
  float r = abs(h * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h * 6.0 - 2.0);
  float b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = hue2rgb(c.x);
  return rgb * c.z;
}

void main() {
  // Read original image color
  vec3 origColor = texture2D(uOriginal, vUv).rgb;

  // Read pass 1 output
  vec2 pass1 = texture2D(uImage, vUv).rg;
  float glowIntensity = pass1.r;
  float edgeIntensity = pass1.g;

  // 1. Enhance saturation
  vec3 hsv = rgb2hsv(origColor);
  hsv.y = min(hsv.y * uSaturation, 1.0);

  // 2. Apply hue shift
  if (uHueShift > 0.5) {
    hsv.x = fract(hsv.x + uHueShift / 360.0);
  }

  // 3. Apply contrast
  hsv.z = clamp((hsv.z - 0.5) * uContrast + 0.5, 0.0, 1.0);

  vec3 color = hsv2rgb(hsv);

  // 4. Add glow (warm tint)
  vec3 glowColor = vec3(1.0, 0.95, 0.8); // warm white
  color += glowColor * glowIntensity * 0.5;

  // 5. Apply edge outline (darken edges)
  color = mix(color, vec3(0.0), edgeIntensity * 0.9);

  // 6. God rays: radial light streaks from a direction
  if (uGodRayStrength > 0.01) {
    float godRayAngle = uGodRayAngle * 3.14159265 / 180.0;
    vec2 godDir = normalize(vec2(cos(godRayAngle), sin(godRayAngle)));

    // Project UV offset onto god ray direction
    vec2 centered = vUv - 0.5;
    float projection = dot(centered, godDir);

    // Perpendicular distance for beam width
    float perpDist = length(centered - godDir * projection);

    // Multiple thin beams using sine pattern
    float beam = sin(projection * 30.0) * 0.5 + 0.5;
    beam = smoothstep(0.3, 0.7, beam);

    // Narrow beam width
    float beamMask = smoothstep(0.3, 0.0, perpDist);

    // God ray color (warm golden)
    vec3 rayColor = vec3(1.0, 0.9, 0.6);

    // Only apply where there's brightness
    float lum = dot(origColor, vec3(0.299, 0.587, 0.114));
    float rayStrength = beam * beamMask * uGodRayStrength * smoothstep(0.3, 0.6, lum);

    color += rayColor * rayStrength * 0.5;
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
```

- [ ] **Step 5: 在 StyleRegistry.ts 注册动画光影**

在 `crosshatch` 注册后添加：

```typescript
  // ---------------------------------------------------------------------------
  // Anime Light (multi-pass: edge_blur -> composite)
  // ---------------------------------------------------------------------------
  {
    id: 'animelight',
    label: 'Anime Light',
    description: '动画光影风格，高饱和气氛光、描边加神光束，呈现日系动画美术感的画面效果。',
    shaderImports: [
      () => import('../shaders/animelight_edge_blur.frag?raw').then(m => m.default),
      () => import('../shaders/animelight_composite.frag?raw').then(m => m.default),
    ],
    isMultiPass: true,
    params: [
      { name: '饱和度',   uniform: 'uSaturation',     min: 0.5, max: 4.0, step: 0.01, default: 1.8, description: '色彩饱和度增强' },
      { name: '描边宽度', uniform: 'uEdgeWidth',      min: 0.5, max: 5.0, step: 0.1,  default: 1.5, description: '动画面描边的线条粗细' },
      { name: '描边阈值', uniform: 'uEdgeThreshold',  min: 0.01, max: 0.5, step: 0.01, default: 0.1, description: '边缘检测灵敏度' },
      { name: '神光强度', uniform: 'uGodRayStrength', min: 0.0, max: 3.0, step: 0.01, default: 1.0, description: '神光束的亮度强度' },
      { name: '神光方向', uniform: 'uGodRayAngle',    min: 0,   max: 360, step: 1,    default: 135, description: '神光束的发射方向角度' },
      { name: '光晕半径', uniform: 'uGlowRadius',     min: 1,   max: 50,  step: 0.1,  default: 10,  description: '光晕扩散的模糊半径' },
      { name: '色相偏移', uniform: 'uHueShift',       min: 0,   max: 360, step: 1,    default: 0,   description: '整体色相偏移' },
      { name: '对比度',   uniform: 'uContrast',        min: 0.5, max: 3.0, step: 0.01, default: 1.3, description: '画面对比度' },
    ],
  },
```

- [ ] **Step 6: 验证构建**

Run: `npx vite build`
Expected: 构建成功

- [ ] **Step 7: 提交**

```bash
git add src/lib/ShaderRenderer.ts src/shaders/lightshadow_composite.frag src/shaders/animelight_edge_blur.frag src/shaders/animelight_composite.frag src/lib/StyleRegistry.ts
git commit -m "feat: add anime light effect + fix multi-pass original image access"
```

---

## Task 5: 文字栅格 — 架构扩展（ParamPanel + ShaderRenderer + App）

**Files:**
- Modify: `src/components/ParamPanel.tsx`
- Modify: `src/lib/ShaderRenderer.ts`
- Modify: `src/components/App.tsx`

- [ ] **Step 1: 扩展 ParamPanel.tsx 支持文本输入**

将 `src/components/ParamPanel.tsx` 整体替换为：

```tsx
import type { ParamDef } from '../types'

interface ParamPanelProps {
  styleLabel: string
  styleDescription: string
  params: ParamDef[]
  values: Record<string, number>
  textValues: Record<string, string>
  onChange: (uniform: string, value: number) => void
  onTextChange: (uniform: string, value: string) => void
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function ParamPanel({ styleLabel, styleDescription, params, values, textValues, onChange, onTextChange }: ParamPanelProps) {
  return (
    <div className="param-panel">
      <div className="param-panel-header">
        <div className="param-panel-title">{styleLabel}</div>
        <div className="param-panel-desc">{styleDescription}</div>
      </div>
      {params.map((param) => {
        if (param.type === 'text') {
          return (
            <div key={param.uniform} className="param-row">
              <div className="param-header">
                <span className="param-label">
                  {param.name}
                  {param.description && (
                    <span className="param-tooltip-wrap">
                      <span className="param-tooltip-icon">?</span>
                      <span className="param-tooltip-text">{param.description}</span>
                    </span>
                  )}
                </span>
              </div>
              <input
                type="text"
                className="param-text-input"
                value={textValues[param.uniform] ?? param.textDefault}
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  onTextChange(param.uniform, (e.target as HTMLInputElement).value)
                }}
              />
            </div>
          )
        }

        return (
          <div key={param.uniform} className="param-row">
            <div className="param-header">
              <span className="param-label">
                {param.name}
                {param.description && (
                  <span className="param-tooltip-wrap">
                    <span className="param-tooltip-icon">?</span>
                    <span className="param-tooltip-text">{param.description}</span>
                  </span>
                )}
              </span>
              <span className="param-value">{formatValue(values[param.uniform] ?? param.default)}</span>
            </div>
            <input
              type="range"
              className="param-slider"
              min={param.min}
              max={param.max}
              step={param.step}
              value={values[param.uniform] ?? param.default}
              onInput={(e: React.FormEvent<HTMLInputElement>) => {
                onChange(param.uniform, parseFloat((e.target as HTMLInputElement).value))
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default ParamPanel
```

- [ ] **Step 2: 在 global.css 添加文本输入框样式**

在 `src/styles/global.css` 中添加：

```css
/* --- Text Input (for text-type params) --- */
.param-text-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #000;
  border-radius: 0;
  background: #FFF;
  color: #000;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;
  box-sizing: border-box;
}
.param-text-input:focus {
  border-width: 2px;
}
```

- [ ] **Step 3: 扩展 ShaderRenderer.ts 添加文字纹理方法**

在 `src/lib/ShaderRenderer.ts` 的 `ShaderRenderer` 类中，`destroy()` 方法之前，添加：

```typescript
  /**
   * Generate a text atlas texture from the given string.
   * Each character is rendered into a fixed-width cell in a single row.
   * Returns a WebGL texture ready to be bound to a texture unit.
   */
  loadTextTexture(text: string, fontSize: number): WebGLTexture {
    const charCount = text.length || 1
    const actualText = text.length > 0 ? text : ' '
    const cellSize = fontSize

    const canvas = document.createElement('canvas')
    canvas.width = cellSize * charCount
    canvas.height = cellSize

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'

    for (let i = 0; i < actualText.length; i++) {
      ctx.fillText(actualText[i], i * cellSize + cellSize / 2, cellSize / 2)
    }

    const gl = this.gl
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    return texture
  }

  /**
   * Bind a texture to a specific texture unit.
   */
  bindTexture(texture: WebGLTexture, unit: number): void {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
  }

  /**
   * Return the underlying WebGL rendering context.
   */
  getGl(): WebGLRenderingContext {
    return this.gl
  }
```

- [ ] **Step 4: 扩展 App.tsx 处理文本参数**

修改 `src/components/App.tsx`：

1. 修改 `initParams` 函数，跳过 text 类型参数：
```typescript
function initParams(styleId: StyleId): Record<string, number> {
  const styleDef = getStyle(styleId)
  if (!styleDef) return {}
  const result: Record<string, number> = {}
  for (const p of styleDef.params) {
    if (p.type === 'text') continue
    result[p.uniform] = p.default
  }
  return result
}

function initTextParams(styleId: StyleId): Record<string, string> {
  const styleDef = getStyle(styleId)
  if (!styleDef) return {}
  const result: Record<string, string> = {}
  for (const p of styleDef.params) {
    if (p.type === 'text') {
      result[p.uniform] = p.textDefault
    }
  }
  return result
}
```

3. 新增 `textParams` 初始化：
```typescript
const [textParams, setTextParams] = useState<Record<string, string>>(() => initTextParams('halftone'))
```

4. 在 `handleStyleChange` 中添加文本参数重置：
```typescript
const handleStyleChange = useCallback(
  (id: StyleId) => {
    setActiveStyle(id)
    setParams(initParams(id))
    setTextParams(initTextParams(id))
  },
  [],
)
```

5. 新增文本参数修改处理器：
```typescript
const handleTextChange = useCallback((uniform: string, value: string) => {
  setTextParams((prev) => ({ ...prev, [uniform]: value }))
}, [])
```

6. 修改 `handleRandom` 跳过 text 类型：
```typescript
const handleRandom = useCallback(() => {
  const styleDef = getStyle(activeStyle)
  if (!styleDef) return
  const randomParams: Record<string, number> = {}
  for (const p of styleDef.params) {
    if (p.type === 'text') continue
    const range = p.max - p.min
    const raw = p.min + Math.random() * range
    randomParams[p.uniform] = Math.round(raw / p.step) * p.step
  }
  setParams(randomParams)
}, [activeStyle])
```

7. 修改 `renderWithStyle` 处理文字纹理。在 `renderWithStyle` 的 `const styleDef = getStyle(styleId)` 之后、shader 加载之前，添加文本纹理逻辑：

```typescript
const renderWithStyle = useCallback(
  async (styleId: StyleId, currentParams: Record<string, number>, currentTextParams: Record<string, string>) => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return

    const styleDef = getStyle(styleId)
    if (!styleDef) return

    // Handle text params: generate text textures
    const textTextures: WebGLTexture[] = []
    const textParams = styleDef.params.filter((p): p is typeof p & { type: 'text' } => p.type === 'text')
    let atlasCount = 0

    for (const tp of textParams) {
      const text = currentTextParams[tp.uniform] || tp.textDefault
      const fontSize = currentParams['uFontSize'] || 24
      const texture = renderer.loadTextTexture(text, fontSize)
      textTextures.push(texture)
      atlasCount = text.length || 1
    }

    // Bind text atlas to TEXTURE2 if present
    if (textTextures.length > 0) {
      renderer.bindTexture(textTextures[0], 2)
      // Set atlas count uniform
      currentParams['uAtlasCount'] = atlasCount
    }

    const shaderSources = await Promise.all(styleDef.shaderImports.map((fn) => fn()))

    if (styleDef.isMultiPass && shaderSources.length > 1) {
      const passes = shaderSources.map((src) => ({
        fragSource: src,
        uniforms: { ...currentParams },
      }))
      renderer.renderMultiPass(passes)
    } else {
      renderer.useShader(shaderSources[0])
      renderer.setUniform('uResolution', [canvas.width, canvas.height])
      for (const [key, val] of Object.entries(currentParams)) {
        renderer.setUniform(key, val)
      }
      renderer.render()
    }

    // Clean up text textures
    for (const tex of textTextures) {
      const gl = renderer.getGl()
      if (gl) gl.deleteTexture(tex)
    }
  },
  [],
)
```

**重要：** `getGl()` 方法已在 Step 3 中添加到 ShaderRenderer 类。

8. 修改 `renderWithStyle` 的调用点（useEffect）：
```typescript
useEffect(() => {
  if (!image || !rendererRef.current) return
  renderWithStyle(activeStyle, params, textParams)
}, [image, activeStyle, params, textParams, renderWithStyle])
```

9. 修改 ParamPanel 的调用，传入新 props：
```tsx
<ParamPanel
  styleLabel={currentStyle.label}
  styleDescription={currentStyle.description}
  params={currentStyle.params}
  values={params}
  textValues={textParams}
  onChange={handleParamChange}
  onTextChange={handleTextChange}
/>
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add src/components/ParamPanel.tsx src/components/App.tsx src/lib/ShaderRenderer.ts src/styles/global.css
git commit -m "feat: extend architecture for text input params (textraster support)"
```

---

## Task 6: 文字栅格 shader + 注册

**Files:**
- Create: `src/shaders/textraster.frag`
- Modify: `src/lib/StyleRegistry.ts`

- [ ] **Step 1: 创建 textraster.frag**

创建 `src/shaders/textraster.frag`：

```glsl
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform sampler2D uCharAtlas;   // TEXTURE2: character atlas
uniform vec2 uResolution;
uniform float uCellSize;
uniform float uAtlasCount;      // number of characters in atlas
uniform float uFontSize;        // font size used for atlas
uniform float uBgBrightness;
uniform float uColorStrength;
uniform float uAngle;

void main() {
  // Rotate UV
  float rad = uAngle * 3.14159265 / 180.0;
  vec2 uv = vUv - 0.5;
  mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  uv = rot * uv + 0.5;

  // Grid
  float cellSize = uCellSize;
  vec2 cellCount = uResolution / cellSize;
  vec2 cellUv = uv * cellCount;
  vec2 cellId = floor(cellUv);
  vec2 cellLocal = fract(cellUv);

  // Sample center of cell for color and luminance
  vec2 sampleUv = (cellId + 0.5) / cellCount;
  vec3 color = texture2D(uImage, clamp(sampleUv, 0.0, 1.0)).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // Map luminance to character index (dark = dense chars first)
  // luminance 0 (dark) -> index 0 (densest char)
  // luminance 1 (bright) -> index atlasCount-1 (sparsest char)
  float charCount = max(uAtlasCount, 1.0);
  float charIndex = floor(lum * charCount);
  charIndex = clamp(charIndex, 0.0, charCount - 1.0);

  // Sample character from atlas
  // Atlas is a single row of characters, each cell is fontSize wide
  float atlasU = (charIndex + cellLocal.x) / charCount;
  float atlasV = cellLocal.y;
  float charAlpha = texture2D(uCharAtlas, vec2(atlasU, atlasV)).r;

  // Output: character foreground color * alpha, background
  vec3 fgColor = color * uColorStrength;
  vec3 bgColor = vec3(uBgBrightness);

  vec3 result = mix(bgColor, fgColor, charAlpha);

  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
```

- [ ] **Step 2: 在 StyleRegistry.ts 注册文字栅格**

在 `animelight` 注册后添加：

```typescript
  // ---------------------------------------------------------------------------
  // Text Raster
  // ---------------------------------------------------------------------------
  {
    id: 'textraster',
    label: 'Text Raster',
    description: '文字栅格风格，将图片重构为文字栅格画面，每个网格单元以字符密度映射亮度。适合制作文本海报、信息屏和实验排版效果。',
    shaderImports: [() => import('../shaders/textraster.frag?raw').then(m => m.default)],
    params: [
      { name: '字符大小',     uniform: 'uCellSize',       min: 4,   max: 40,  step: 1,    default: 12,  description: '每个字符单元的像素大小' },
      { name: '文本内容',     uniform: 'uTextContent',    type: 'text', textDefault: '01', description: '用户输入的文字内容，渲染为纹理' },
      { name: '字体大小',     uniform: 'uFontSize',       min: 8,   max: 72,  step: 1,    default: 24,  description: '文字纹理中的字体大小' },
      { name: '背景亮度',     uniform: 'uBgBrightness',   min: 0.0, max: 1.0, step: 0.01, default: 0.0, description: '背景色亮度，0=纯黑' },
      { name: '颜色强度',     uniform: 'uColorStrength',  min: 0.0, max: 2.0, step: 0.01, default: 1.0, description: '字符前景色的强度' },
      { name: '网格旋转角度', uniform: 'uAngle',          min: 0,   max: 360, step: 1,    default: 0,   description: '网格整体旋转角度' },
    ],
  },
```

- [ ] **Step 3: 验证构建**

Run: `npx vite build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/shaders/textraster.frag src/lib/StyleRegistry.ts
git commit -m "feat: add text raster effect with text input support"
```

---

## Task 7: 最终验证

**Files:** 无新文件

- [ ] **Step 1: 完整构建验证**

Run: `npx vite build`
Expected: 构建成功，无错误

- [ ] **Step 2: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 启动开发服务器进行手动测试**

Run: `npx vite dev`

手动验证清单：
1. [ ] 左侧特效列表显示10种特效（6旧+4新）
2. [ ] 选择 Kaleidoscope — 调整扇区数和旋转，画面正确显示万花筒效果
3. [ ] 选择 Crosshatch — 调整网点大小和旋转角度，画面正确显示网纹底稿
4. [ ] 选择 Anime Light — 调整饱和度和神光强度，画面显示动画光影风格
5. [ ] 选择 Text Raster — 文本输入框显示默认值 "01"，输入新文字后画面更新
6. [ ] 选择 Light & Shadow — 确认原有特效仍然正常工作（uOriginal 修复验证）

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "feat: add 4 new effects — kaleidoscope, crosshatch, anime light, text raster"
```
