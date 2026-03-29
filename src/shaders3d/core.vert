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

// Varying
varying vec3 vColor;
varying float vAlpha;

// %%EFFECT_UNIFORMS%%

// Mouse deformation: push particles away from cursor in screen space
vec3 mouseDeformation(vec3 worldPos, vec2 mouseNDC, float radius) {
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  vec2 screenPos = clipPos.xy / clipPos.w;
  float dist = distance(screenPos, mouseNDC);
  if (dist < radius) {
    vec2 dir = normalize(screenPos - mouseNDC);
    float strength = (1.0 - dist / radius) * 0.5;
    clipPos.xy += dir * strength * clipPos.w;
    return (inverse(projectionMatrix * modelViewMatrix) * clipPos).xyz;
  }
  return worldPos;
}

// %%EFFECT_TRANSFORM%%

void main() {
  vColor = aColor;
  vAlpha = 1.0;

  vec3 transformed = effectTransform(aPosition, aNormal, aRandom, uTime);
  transformed = mouseDeformation(transformed, uMouse, uMouseRadius);

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = effectSize(aSize, aRandom, uTime);
  gl_PointSize = size * (300.0 / -mvPosition.z);
}
