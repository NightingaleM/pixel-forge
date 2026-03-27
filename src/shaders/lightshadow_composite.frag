precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // original image
uniform sampler2D uBlur;        // blurred luminance from pass 2
uniform vec2 uResolution;
uniform float uContrast;
uniform float uThreshold;
uniform float uGlowRadius;
uniform float uLightDir;

void main() {
  // 1. Sample original color from uImage
  vec3 color = texture2D(uImage, vUv).rgb;

  // 2. Sample blurred luminance from uBlur
  float blurred = texture2D(uBlur, vUv).r;

  // 3. Create glow effect from blurred luminance
  float glow = blurred * (1.0 - uThreshold) * 2.0;

  // 4. Apply directional light: darken areas opposite to uLightDir
  float rad = uLightDir * 3.14159265 / 180.0; // degrees to radians
  vec2 lightVec = normalize(vec2(cos(rad), sin(rad)));
  vec2 posOffset = (vUv - 0.5) * 2.0;
  float lightFactor = dot(lightVec, posOffset) * 0.5 + 0.5;

  // 5. Apply contrast to original
  color = (color - 0.5) * uContrast + 0.5;

  // 6. Threshold split with smooth transition
  float transition = smoothstep(uThreshold - 0.1, uThreshold + 0.1, blurred);

  // Bright areas: keep contrast-adjusted color + add glow
  vec3 brightened = color + vec3(glow);

  // Dark areas: darken significantly
  vec3 darkened = color * 0.3;

  // 7. Blend based on blurred luminance threshold
  vec3 final = mix(darkened, brightened, transition);

  // 8. Apply light direction factor
  final *= mix(0.6, 1.0, lightFactor);

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
