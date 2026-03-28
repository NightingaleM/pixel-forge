precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uLevels;
uniform float uSpread;
uniform float uPixelSize;
uniform float uNoiseType;
uniform float uDitherStrength; // 0.0-1.0, controls how much noise to mix
uniform float uGrayscale;      // 0/1, convert to grayscale before dithering

// 2x2 Bayer threshold: [[0,2],[3,1]]
float bayer2(float x, float y) {
  return mod(2.0 * x + 3.0 * y, 4.0);
}

// 4x4 Bayer threshold (returns 0..15)
float bayer4(float x, float y) {
  return 4.0 * bayer2(mod(x, 2.0), mod(y, 2.0))
       + bayer2(floor(x / 2.0), floor(y / 2.0));
}

// 8x8 Bayer threshold (returns 0..63)
float bayer8(float x, float y) {
  return 4.0 * bayer4(mod(x, 4.0), mod(y, 4.0))
       + bayer2(floor(x / 4.0), floor(y / 4.0));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // Step 1: Pixelate UV
  vec2 pixelatedUv = floor(vUv * uResolution / uPixelSize) * uPixelSize / uResolution;

  // Step 2: Sample color at pixelated UV
  vec3 color = texture2D(uImage, clamp(pixelatedUv, 0.0, 1.0)).rgb;

  // Optional: convert to grayscale
  if (uGrayscale > 0.5) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = vec3(gray);
  }

  // Step 3: Determine pixel grid position for Bayer lookup
  vec2 pixelPos = floor(vUv * uResolution / uPixelSize);

  float bayer;

  if (uNoiseType < 0.5) {
    // 4x4 Bayer matrix
    bayer = bayer4(pixelPos.x, pixelPos.y) / 16.0;
  } else if (uNoiseType < 1.5) {
    // 8x8 Bayer matrix
    bayer = bayer8(pixelPos.x, pixelPos.y) / 64.0;
  } else {
    // Hash-based pseudo-random
    bayer = hash(pixelPos);
  }

  // Shift bayer from [0,1] to [-0.5, 0.5] range for balanced dithering
  bayer = (bayer - 0.5) * uDitherStrength;

  // Step 4: Quantize each channel with dithering
  float levels = max(uLevels, 2.0);
  vec3 quantized = floor(color * levels + uSpread * bayer) / levels;

  // Step 5: Output clamped result
  gl_FragColor = vec4(clamp(quantized, 0.0, 1.0), 1.0);
}
