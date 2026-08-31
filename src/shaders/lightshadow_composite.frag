precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // previous pass output (blur_v luminance)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform float uContrast;
uniform float uThreshold;
uniform float uLightDir;
uniform float uGlowIntensity;
uniform float uGlowColorR;
uniform float uGlowColorG;
uniform float uGlowColorB;
uniform float uShadowDepth;

void main() {
  vec3 color = texture2D(uOriginal, vUv).rgb;
  float blurred = texture2D(uImage, vUv).r;

  float glowStrength = blurred * (1.0 - uThreshold) * 2.0 * uGlowIntensity;

  vec3 glowTint = vec3(uGlowColorR, uGlowColorG, uGlowColorB);
  vec3 glow = glowTint * glowStrength;

  float rad = uLightDir * 3.14159265 / 180.0;
  vec2 lightVec = normalize(vec2(cos(rad), sin(rad)));
  vec2 posOffset = (vUv - 0.5) * 2.0;
  float lightFactor = dot(lightVec, posOffset) * 0.5 + 0.5;

  color = (color - 0.5) * uContrast + 0.5;

  float transition = smoothstep(uThreshold - 0.1, uThreshold + 0.1, blurred);

  vec3 brightened = color + glow;
  // 0.475 coefficient keeps the depth slider monotonic over its full 0..2
  // range (2.0 * 0.475 = 0.95, just above the 0.05 floor — no dead travel)
  vec3 darkened = color * max(0.05, 1.0 - uShadowDepth * 0.475);

  vec3 final = mix(darkened, brightened, transition);
  final *= mix(0.6, 1.0, lightFactor);

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
