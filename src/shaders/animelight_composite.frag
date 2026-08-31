precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;       // Pass 1 output (R=glow, G=edge)
uniform sampler2D uOriginal;    // original image on TEXTURE1
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uEdgeWidth;
uniform float uEdgeThreshold;
uniform float uGodRayStrength;
uniform float uGodRayLength;
uniform float uGodRayThreshold;
uniform float uGodRayColorR;
uniform float uGodRayColorG;
uniform float uGodRayColorB;
uniform float uCenterX;
uniform float uCenterY;
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
  vec3 rgb = hue2rgb(c.x) * c.z;
  // Mix toward neutral gray (v,v,v) by saturation — hue2rgb alone is fully saturated
  return mix(vec3(c.z), rgb, c.y);
}

void main() {
  vec3 origColor = texture2D(uOriginal, vUv).rgb;
  vec2 pass1 = texture2D(uImage, vUv).rg;
  float glowIntensity = pass1.r;

  // Dilate the edge mask (max filter) so uEdgeWidth maps to real line width
  // (radius = uEdgeWidth * 0.5 px). Pass-1 Sobel samples at fixed 1px spacing.
  vec2 texel = 1.0 / uResolution;
  float spread = uEdgeWidth / 4.0;
  float edgeIntensity = 0.0;
  for (int dx = -2; dx <= 2; dx++) {
    for (int dy = -2; dy <= 2; dy++) {
      float e = texture2D(uImage, vUv + vec2(float(dx), float(dy)) * spread * texel).g;
      edgeIntensity = max(edgeIntensity, e);
    }
  }

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
    // Volumetric light scattering (GPU Gems 3 Ch.13, simplified): march from
    // this pixel toward the light source, accumulating thresholded luminance
    // with distance decay — beams follow the bright parts of the image.
    vec2 lightPos = vec2(uCenterX, uCenterY);
    vec2 delta = (vUv - lightPos) * 0.9 / 32.0;
    vec2 sampleUv = vUv;
    // 0.9: march covers 90% of the path to the source; 2/32 (below) normalizes
    // the 32 weighted samples, x2 for visible beam strength.
    float decay = mix(0.85, 0.99, uGodRayLength);
    float illum = 1.0;
    float accum = 0.0;
    for (int i = 0; i < 32; i++) {
      sampleUv -= delta;
      float lum = dot(texture2D(uOriginal, sampleUv).rgb, vec3(0.299, 0.587, 0.114));
      accum += smoothstep(uGodRayThreshold, uGodRayThreshold + 0.1, lum) * illum;
      illum *= decay;
    }
    vec3 rayColor = vec3(uGodRayColorR, uGodRayColorG, uGodRayColorB);
    color += rayColor * accum * uGodRayStrength * (2.0 / 32.0);
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
