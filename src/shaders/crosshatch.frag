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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

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

  vec3 color = texture2D(uImage, vUv).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // Sobel edge detection
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
  edge = smoothstep(uEdgeSensitivity, uEdgeSensitivity * 3.0, edge);

  // Screen tone (rotatable dot grid)
  float rad = uScreenAngle * 3.14159265 / 180.0;
  mat2 rotMat = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  vec2 screenUv = rotMat * (vUv * uResolution);
  vec2 cellId = floor(screenUv / uDotSize);
  vec2 cellLocal = fract(screenUv / uDotSize) - 0.5;

  float darkness = 1.0 - lum;
  darkness = clamp(darkness * uScreenDensity, 0.0, 1.0);
  float dotRadius = darkness * 0.45;

  float dist = length(cellLocal);
  float dotMask = 1.0 - smoothstep(dotRadius - 0.05, dotRadius + 0.05, dist);

  // Paper noise
  float paperGrain = noise(vUv * uResolution * 0.5) * 2.0 - 1.0;
  float paperNoiseVal = paperGrain * uPaperNoise;

  // Compose
  float result = 1.0;
  result = mix(result, result * 0.1, dotMask);
  result = mix(result, 0.0, edge);
  result += paperNoiseVal;

  if (uInvert > 0.5) {
    result = 1.0 - result;
  }

  gl_FragColor = vec4(vec3(clamp(result, 0.0, 1.0)), 1.0);
}
