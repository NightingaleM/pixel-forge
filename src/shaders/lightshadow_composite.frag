precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // previous pass output (blur_v luminance)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform float uContrast;
uniform float uThreshold;
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
  vec3 color = texture2D(uOriginal, vUv).rgb;
  float blurred = texture2D(uImage, vUv).r;

  float glowStrength = blurred * (1.0 - uThreshold) * 2.0 * uGlowIntensity;

  vec3 glowTint = vec3(1.0);
  if (uGlowColor > 0.5) {
    glowTint = mix(vec3(1.0), hue2rgb(uGlowColor / 360.0), 0.5);
  }
  vec3 glow = glowTint * glowStrength;

  float rad = uLightDir * 3.14159265 / 180.0;
  vec2 lightVec = normalize(vec2(cos(rad), sin(rad)));
  vec2 posOffset = (vUv - 0.5) * 2.0;
  float lightFactor = dot(lightVec, posOffset) * 0.5 + 0.5;

  color = (color - 0.5) * uContrast + 0.5;

  float transition = smoothstep(uThreshold - 0.1, uThreshold + 0.1, blurred);

  vec3 brightened = color + glow;
  vec3 darkened = color * max(0.05, 1.0 - uShadowDepth * 0.7);

  vec3 final = mix(darkened, brightened, transition);
  final *= mix(0.6, 1.0, lightFactor);

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
