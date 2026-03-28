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

  // Local glow blur (9x9 kernel)
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

  gl_FragColor = vec4(glow, edge, 0.0, 1.0);
}
