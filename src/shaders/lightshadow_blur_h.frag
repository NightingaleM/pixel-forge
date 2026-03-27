precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uGlowRadius;

void main() {
  vec2 texel = 1.0 / uResolution;
  float radius = uGlowRadius;

  // Gaussian weights for 9-tap kernel (sigma ~ radius / 3.0)
  float sigma = max(radius / 3.0, 0.001);
  float sigma2 = 2.0 * sigma * sigma;

  // Offsets: -4, -3, -2, -1, 0, 1, 2, 3, 4 (9 samples centered)
  float offsets[9];
  offsets[0] = -4.0;
  offsets[1] = -3.0;
  offsets[2] = -2.0;
  offsets[3] = -1.0;
  offsets[4] =  0.0;
  offsets[5] =  1.0;
  offsets[6] =  2.0;
  offsets[7] =  3.0;
  offsets[8] =  4.0;

  // Compute Gaussian weights
  float weights[9];
  float totalWeight = 0.0;
  for (int i = 0; i < 9; i++) {
    float x = offsets[i] * (radius / 4.0);
    weights[i] = exp(-(x * x) / sigma2);
    totalWeight += weights[i];
  }

  // Normalize weights
  for (int i = 0; i < 9; i++) {
    weights[i] /= totalWeight;
  }

  // 1D horizontal Gaussian blur on luminance
  float blurredLum = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 sampleUv = vUv + vec2(offsets[i] * (radius / 4.0) * texel.x, 0.0);
    vec3 sampleColor = texture2D(uImage, sampleUv).rgb;
    float lum = dot(sampleColor, vec3(0.299, 0.587, 0.114));
    blurredLum += lum * weights[i];
  }

  gl_FragColor = vec4(vec3(blurredLum), 1.0);
}
