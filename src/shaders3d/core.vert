// Common attributes (filled during sampling)
attribute vec3 aPosition;
attribute vec3 aColor;
attribute vec3 aNormal;
attribute float aSize;
attribute float aRandom;

// Common uniforms
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseRadius;
uniform float uMouseEnabled;
uniform float uMouseStrength;

// Custom color uniforms
uniform float uUseCustomColor;
uniform float uColorR;
uniform float uColorG;
uniform float uColorB;

// Gradient color uniforms
uniform float uGradientMode;
uniform float uNumColorStops;
uniform sampler2D uGradientMap;
uniform float uGradientMinY;
uniform float uGradientMaxY;
uniform vec3 uGradientCenter;
uniform float uGradientMaxRadius;

// Varying
varying vec3 vColor;
varying float vAlpha;
varying float vGradientUV;

// %%EFFECT_UNIFORMS%%

// %%EFFECT_TRANSFORM%%

void main() {
  vColor = aColor;
  vGradientUV = 0.0;
  if (uUseCustomColor > 0.5) {
    vColor = vec3(uColorR, uColorG, uColorB);
  }
  vAlpha = 1.0;

  vec3 transformed = effectTransform(aPosition, aNormal, aRandom, uTime);

  // Gradient UV computation (after transform)
  if (uUseCustomColor > 0.5 && uGradientMode >= 0.0) {
    vec3 pos = aPosition;
    if (uGradientMode < 0.5) {
      vGradientUV = clamp((pos.y - uGradientMinY) / max(uGradientMaxY - uGradientMinY, 0.001), 0.0, 1.0);
    } else if (uGradientMode < 1.5) {
      float dist = distance(pos, uGradientCenter);
      vGradientUV = clamp(dist / max(uGradientMaxRadius, 0.001), 0.0, 1.0);
    } else {
      float bucket = floor(aRandom * max(uNumColorStops, 1.0)) / max(uNumColorStops, 1.0);
      vGradientUV = clamp(bucket, 0.0, 1.0);
    }
  }

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = effectSize(aSize, aRandom, uTime);
  gl_PointSize = size * (300.0 / -mvPosition.z);
}
