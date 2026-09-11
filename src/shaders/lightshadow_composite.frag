precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // previous pass output (blurred highlights)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform float uContrast;
uniform float uThreshold;
uniform float uLightDir;
uniform float uGlowIntensity;
uniform float uGlowColorR;
uniform float uGlowColorG;
uniform float uGlowColorB;
uniform float uShadowDepth;

// A C1 toe/shoulder: identity through the midtones, strictly increasing
// outside them. Compress only after every grade contribution is included.
float compressTone(float value) {
  if (value < 0.1) return 0.01 / (0.2 - value);
  if (value > 0.9) return 1.0 - 0.01 / (value - 0.8);
  return value;
}

void main() {
  vec3 color = texture2D(uOriginal, vUv).rgb;
  float blurredBright = texture2D(uImage, vUv).r;

  vec3 glowTint = vec3(uGlowColorR, uGlowColorG, uGlowColorB);

  float rad = uLightDir * 3.14159265 / 180.0;
  vec2 lightVec = normalize(vec2(cos(rad), sin(rad)));
  vec2 posOffset = (vUv - 0.5) * 2.0;
  float lightFactor = dot(lightVec, posOffset) * 0.5 + 0.5;

  // Preserve the source detail when choosing between shadows and highlights.
  float origLum = dot(color, vec3(0.299, 0.587, 0.114));
  float transition = smoothstep(uThreshold - 0.08, uThreshold + 0.08, origLum);
  vec3 contrasted = (color - 0.5) * uContrast + 0.5;
  vec3 glow = glowTint * blurredBright * uGlowIntensity;
  vec3 shadowed = contrasted * max(0.2, 1.0 - uShadowDepth * 0.4);
  vec3 shaped = mix(shadowed, contrasted + glow, transition);
  vec3 final = shaped * mix(0.9, 1.1, lightFactor);
  final = vec3(compressTone(final.r), compressTone(final.g), compressTone(final.b));

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
