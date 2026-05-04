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

// Varying
varying vec3 vColor;
varying float vAlpha;

// %%EFFECT_UNIFORMS%%

// %%EFFECT_TRANSFORM%%

void main() {
  vColor = aColor;
  if (uUseCustomColor > 0.5) {
    vColor = vec3(uColorR, uColorG, uColorB);
  }
  vAlpha = 1.0;

  vec3 transformed = effectTransform(aPosition, aNormal, aRandom, uTime);

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = effectSize(aSize, aRandom, uTime);
  gl_PointSize = size * (300.0 / -mvPosition.z);
}
