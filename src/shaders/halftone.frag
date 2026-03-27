precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uCellSize;
uniform float uDotScale;
uniform float uColorMode;
uniform float uAngle;

void main() {
  // rotate UV by angle
  float rad = uAngle * 3.14159265 / 180.0;
  vec2 uv = vUv - 0.5;
  mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  uv = rot * uv + 0.5;

  float cellSize = uCellSize;
  vec2 cellCount = uResolution / cellSize;
  vec2 cellUv = uv * cellCount;
  vec2 cellId = floor(cellUv);
  vec2 cellLocal = fract(cellUv) - 0.5;

  // sample center of cell for color
  vec2 sampleUv = (cellId + 0.5) / cellCount;
  vec3 color = texture2D(uImage, clamp(sampleUv, 0.0, 1.0)).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // circle radius based on luminance (dark = bigger dot)
  float radius = uDotScale * (1.0 - lum) * 0.45;
  float dist = length(cellLocal);
  float d = 1.0 - smoothstep(radius - 0.5, radius + 0.5, dist);

  if (uColorMode < 0.5) {
    // monochrome mode
    gl_FragColor = vec4(vec3(d), 1.0);
  } else if (uColorMode < 1.5) {
    // CMYK mode - simplified: use grayscale halftone
    gl_FragColor = vec4(vec3(d), 1.0);
  } else {
    // color mode - preserve original colors
    gl_FragColor = vec4(color * d, 1.0);
  }
}
