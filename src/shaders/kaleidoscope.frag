precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uSegments;
uniform float uRotation;
uniform float uZoom;
uniform float uCenterX;
uniform float uCenterY;
uniform float uEdgeGlow;
uniform float uHueShift;

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
  vec2 uv = vUv - 0.5 - vec2(uCenterX, uCenterY) * 0.5;

  float rot = uRotation * 3.14159265 / 180.0;
  mat2 rotMat = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
  uv = rotMat * uv;

  uv /= max(uZoom, 0.01);

  float r = length(uv);
  float theta = atan(uv.y, uv.x);

  float segAngle = 3.14159265 * 2.0 / max(uSegments, 2.0);
  float segIndex = floor(theta / segAngle);
  theta = mod(theta, segAngle);
  if (mod(segIndex, 2.0) > 0.5) {
    theta = segAngle - theta;
  }

  vec2 kaleidoUv = vec2(cos(theta), sin(theta)) * r + 0.5;
  vec3 color = texture2D(uImage, clamp(kaleidoUv, 0.0, 1.0)).rgb;

  float edgeDist = abs(theta - segAngle * 0.5) / segAngle;
  float glow = smoothstep(0.4, 0.5, edgeDist) * uEdgeGlow;
  color += vec3(0.8, 0.9, 1.0) * glow;

  if (uHueShift > 0.5) {
    vec3 hsv = rgb2hsv(color);
    hsv.x = fract(hsv.x + uHueShift / 360.0);
    color = hsv2rgb(hsv);
  }

  float vignette = smoothstep(0.8, 0.4, r);
  color *= mix(1.0, vignette, 0.5);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
