precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uCellSize;
uniform float uDotScale;
uniform float uColorMode;
uniform float uAngle;
uniform float uShape;      // 0=circle, 1=square, 2=diamond
uniform float uHueShift;   // 0-360 degrees

vec3 hue2rgb(float h) {
  h = fract(h);
  float r = abs(h * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h * 6.0 - 2.0);
  float b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 rgb2hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float h = 0.0;
  if (d > 0.001) {
    if (mx == c.r) h = (c.g - c.b) / d;
    else if (mx == c.g) h = 2.0 + (c.b - c.r) / d;
    else h = 4.0 + (c.r - c.g) / d;
    h = fract(h / 6.0);
  }
  float s = mx > 0.001 ? d / mx : 0.0;
  return vec3(h, s, mx);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = hue2rgb(c.x) * c.z;
  // Mix toward neutral gray (v,v,v) by saturation — hue2rgb alone is fully saturated
  return mix(vec3(c.z), rgb, c.y);
}

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

  // radius based on luminance (dark = bigger dot)
  float radius = uDotScale * (1.0 - lum) * 0.45;

  // distance calculation based on shape
  float dist;
  if (uShape < 0.5) {
    // circle
    dist = length(cellLocal);
  } else if (uShape < 1.5) {
    // square (Chebyshev distance)
    dist = max(abs(cellLocal.x), abs(cellLocal.y));
  } else {
    // diamond (Manhattan distance, normalized)
    dist = (abs(cellLocal.x) + abs(cellLocal.y)) * 0.7071;
  }

  float d = 1.0 - smoothstep(radius - 0.5, radius + 0.5, dist);

  // apply hue shift
  vec3 outColor = color;
  if (uHueShift > 0.5) {
    vec3 hsv = rgb2hsv(outColor);
    hsv.x = fract(hsv.x + uHueShift / 360.0);
    outColor = hsv2rgb(hsv);
  }

  if (uColorMode < 0.5) {
    // monochrome mode
    gl_FragColor = vec4(vec3(d), 1.0);
  } else if (uColorMode < 1.5) {
    // CMYK mode - simplified: use grayscale halftone
    gl_FragColor = vec4(vec3(d), 1.0);
  } else {
    // color mode - preserve original colors with optional hue shift
    gl_FragColor = vec4(outColor * d, 1.0);
  }
}
