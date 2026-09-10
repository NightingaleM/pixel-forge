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

vec2 rotatePx(vec2 px, float degrees) {
  float rad = degrees * 3.14159265 / 180.0;
  mat2 r = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
  return r * (px - uResolution * 0.5) + uResolution * 0.5;
}

float shapeDistance(vec2 p) {
  if (uShape < 0.5) return length(p);
  if (uShape < 1.5) return max(abs(p.x), abs(p.y));
  return (abs(p.x) + abs(p.y)) * 0.7071;
}

float screenMask(float angle, float channel) {
  vec2 screenPx = rotatePx(gl_FragCoord.xy, angle);
  vec2 cellId = floor(screenPx / uCellSize);
  vec2 screenCenter = (cellId + 0.5) * uCellSize;
  // Undo only the screen rotation so each ink samples the original composition.
  vec2 sourceCenter = rotatePx(screenCenter, -angle);
  vec2 sampleUv = clamp(sourceCenter / uResolution, 0.0, 1.0);
  vec3 sampled = texture2D(uImage, sampleUv).rgb;
  float darkness = 1.0 - dot(sampled, vec3(0.299, 0.587, 0.114));
  float inkAmount = darkness;

  if (uColorMode >= 0.5 && uColorMode < 1.5) {
    vec3 hsv = rgb2hsv(sampled);
    hsv.x = fract(hsv.x + uHueShift / 360.0);
    vec3 ink = 1.0 - hsv2rgb(hsv);
    if (channel < 0.5) inkAmount = ink.r;
    else if (channel < 1.5) inkAmount = ink.g;
    else inkAmount = ink.b;
  } else if (uColorMode >= 1.5) {
    // Blue builds shadows; red carries midtones on an independent screen.
    if (channel < 0.5) inkAmount = smoothstep(0.15, 1.0, darkness);
    else inkAmount = clamp(darkness * 1.35, 0.0, 1.0);
  }

  vec2 local = fract(screenPx / uCellSize) - 0.5;
  float radius = clamp(inkAmount * uDotScale * 0.48, 0.0, 0.7);
  return 1.0 - smoothstep(radius - 0.04, radius + 0.04, shapeDistance(local));
}

void main() {
  vec3 paper = vec3(0.97, 0.955, 0.92);
  vec3 outColor = paper;
  if (uColorMode < 0.5) {
    outColor *= 1.0 - screenMask(uAngle, 0.0);
  } else if (uColorMode < 1.5) {
    float cMask = screenMask(uAngle + 15.0, 0.0);
    float mMask = screenMask(uAngle + 75.0, 1.0);
    float yMask = screenMask(uAngle, 2.0);
    outColor *= mix(vec3(1.0), vec3(0.0, 0.68, 0.82), cMask);
    outColor *= mix(vec3(1.0), vec3(0.88, 0.08, 0.48), mMask);
    outColor *= mix(vec3(1.0), vec3(1.0, 0.82, 0.08), yMask);
  } else {
    float blueMask = screenMask(uAngle, 0.0);
    float redMask = screenMask(uAngle + 55.0, 1.0);
    outColor *= mix(vec3(1.0), vec3(0.10, 0.23, 0.36), blueMask);
    outColor *= mix(vec3(1.0), vec3(0.92, 0.22, 0.16), redMask);
  }
  gl_FragColor = vec4(outColor, 1.0);
}
