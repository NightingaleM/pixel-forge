precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform sampler2D uCharAtlas;   // TEXTURE2: character atlas
uniform vec2 uResolution;
uniform float uCellSize;
uniform float uAtlasCount;      // number of characters in atlas
uniform float uBgBrightness;
uniform float uColorStrength;
uniform float uAngle;

void main() {
  // Rotate UV
  float rad = uAngle * 3.14159265 / 180.0;
  vec2 uv = vUv - 0.5;
  mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  uv = rot * uv + 0.5;

  // Grid
  float cellSize = uCellSize;
  vec2 cellCount = uResolution / cellSize;
  vec2 cellUv = uv * cellCount;
  vec2 cellId = floor(cellUv);
  vec2 cellLocal = fract(cellUv);

  // Sample center of cell for color and luminance
  vec2 sampleUv = (cellId + 0.5) / cellCount;
  vec3 color = texture2D(uImage, clamp(sampleUv, 0.0, 1.0)).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // Map luminance to character index (dark = dense chars first)
  float charCount = max(uAtlasCount, 1.0);
  float charIndex = floor(lum * charCount);
  charIndex = clamp(charIndex, 0.0, charCount - 1.0);

  // Sample character from atlas
  // Atlas is a single row of characters, each cell is fontSize wide
  float atlasU = (charIndex + cellLocal.x) / charCount;
  float atlasV = cellLocal.y;
  float charAlpha = texture2D(uCharAtlas, vec2(atlasU, atlasV)).r;

  // Output: character foreground color * alpha, background
  vec3 fgColor = color * uColorStrength;
  vec3 bgColor = vec3(uBgBrightness);

  vec3 result = mix(bgColor, fgColor, charAlpha);

  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
