precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // Pass 1 output (R=glow, G=edge)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uEdgeWidth;
uniform float uEdgeThreshold;
uniform float uGodRayStrength;
uniform float uGodRayAngle;
uniform float uGlowRadius;
uniform float uHueShift;
uniform float uContrast;

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

vec3 hue2rgb(float h) {
  h = fract(h);
  float r = abs(h * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h * 6.0 - 2.0);
  float b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = hue2rgb(c.x);
  return rgb * c.z;
}

void main() {
  vec3 origColor = texture2D(uOriginal, vUv).rgb;
  vec2 pass1 = texture2D(uImage, vUv).rg;
  float glowIntensity = pass1.r;
  float edgeIntensity = pass1.g;

  vec3 hsv = rgb2hsv(origColor);
  hsv.y = min(hsv.y * uSaturation, 1.0);

  if (uHueShift > 0.5) {
    hsv.x = fract(hsv.x + uHueShift / 360.0);
  }

  hsv.z = clamp((hsv.z - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec3 color = hsv2rgb(hsv);

  color += vec3(1.0, 0.95, 0.8) * glowIntensity * 0.5;
  color = mix(color, vec3(0.0), edgeIntensity * 0.9);

  if (uGodRayStrength > 0.01) {
    float godRayAngle = uGodRayAngle * 3.14159265 / 180.0;
    vec2 godDir = normalize(vec2(cos(godRayAngle), sin(godRayAngle)));
    vec2 centered = vUv - 0.5;
    float projection = dot(centered, godDir);
    float perpDist = length(centered - godDir * projection);

    float beam = sin(projection * 30.0) * 0.5 + 0.5;
    beam = smoothstep(0.3, 0.7, beam);
    float beamMask = smoothstep(0.3, 0.0, perpDist);

    vec3 rayColor = vec3(1.0, 0.9, 0.6);
    float lum = dot(origColor, vec3(0.299, 0.587, 0.114));
    float rayStrength = beam * beamMask * uGodRayStrength * smoothstep(0.3, 0.6, lum);
    color += rayColor * rayStrength * 0.5;
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
