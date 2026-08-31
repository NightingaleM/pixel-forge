precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uEdgeWidth;
uniform float uSensitivity;
uniform float uDetail;
uniform float uHatching;
uniform float uBgColor;
uniform float uLineColor;     // 0-360 hue, 0 = black
uniform float uHatchDensity;  // 1-10, hatching frequency multiplier
uniform float uEdgeMethod;    // 0=Sobel, 1=Prewitt

vec3 hue2rgb(float h) {
  h = fract(h);
  float r = abs(h * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(h * 6.0 - 2.0);
  float b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
  vec2 texel = 1.0 / uResolution;

  // 1. Sample center pixel and convert to grayscale
  vec3 color = texture2D(uImage, vUv).rgb;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // 2. Multi-directional edge detection at 4 angles
  float totalEdge = 0.0;
  float hatchFreq = uHatchDensity;

  // Angle 0 (horizontal): sample left and right
  {
    vec2 dir = vec2(uEdgeWidth, 0.0) * texel;
    float left  = dot(texture2D(uImage, vUv - dir).rgb, vec3(0.299, 0.587, 0.114));
    float right = dot(texture2D(uImage, vUv + dir).rgb, vec3(0.299, 0.587, 0.114));
    float center = lum;
    if (uEdgeMethod < 0.5) {
      // Sobel:  |-1 0 1|   |-1 -2 -1|
      //         |-2 0 2| ~ | 0  0  0|
      //         |-1 0 1|   | 1  2  1|
      totalEdge += abs(-left + right) + abs(left - 2.0 * center + right);
    } else {
      // Prewitt: simpler gradient
      totalEdge += abs(right - left);
    }
  }

  // Angle 90 (vertical): sample above and below
  {
    vec2 dir = vec2(0.0, uEdgeWidth) * texel;
    float top    = dot(texture2D(uImage, vUv - dir).rgb, vec3(0.299, 0.587, 0.114));
    float bottom = dot(texture2D(uImage, vUv + dir).rgb, vec3(0.299, 0.587, 0.114));
    float center = lum;
    if (uEdgeMethod < 0.5) {
      totalEdge += abs(-top + bottom) + abs(top - 2.0 * center + bottom);
    } else {
      totalEdge += abs(bottom - top);
    }
  }

  // Angle 45 (diagonal)
  {
    float s = 0.7071; // 1/sqrt(2)
    vec2 dir = vec2(s, -s) * uEdgeWidth * texel;
    float a = dot(texture2D(uImage, vUv - dir).rgb, vec3(0.299, 0.587, 0.114));
    float b = dot(texture2D(uImage, vUv + dir).rgb, vec3(0.299, 0.587, 0.114));
    float center = lum;
    if (uEdgeMethod < 0.5) {
      totalEdge += abs(-a + b) + abs(a - 2.0 * center + b);
    } else {
      totalEdge += abs(b - a);
    }
  }

  // Angle 135 (diagonal)
  {
    float s = 0.7071;
    vec2 dir = vec2(s, s) * uEdgeWidth * texel;
    float a = dot(texture2D(uImage, vUv - dir).rgb, vec3(0.299, 0.587, 0.114));
    float b = dot(texture2D(uImage, vUv + dir).rgb, vec3(0.299, 0.587, 0.114));
    float center = lum;
    if (uEdgeMethod < 0.5) {
      totalEdge += abs(-a + b) + abs(a - 2.0 * center + b);
    } else {
      totalEdge += abs(b - a);
    }
  }

  // Normalize edge strength
  totalEdge /= 4.0;

  // 3. Apply sensitivity threshold
  float sensitivity = uSensitivity;
  float edge = smoothstep(sensitivity, sensitivity * 2.0, totalEdge);

  // 4. Detail preservation: 1 keeps edges everywhere, 0 fades lines in dark
  // areas (lum-weighted) so shadows read cleaner
  edge *= mix(lum, 1.0, uDetail);

  // 5. Invert: background with lines
  float line = 1.0 - edge;

  // 6. Optional cross-hatching
  if (uHatching > 0.5) {
    vec2 pos = vUv * uResolution;
    float darkness = 1.0 - lum;

    // Primary hatching - frequency scaled by density
    float hatch1 = sin(pos.x * 1.2 * hatchFreq + pos.y * 0.8 * hatchFreq) * 0.5 + 0.5;
    hatch1 = smoothstep(0.3, 0.7, hatch1);

    // Secondary hatching - steeper angle
    float hatch2 = sin(pos.x * 0.7 * hatchFreq - pos.y * 1.3 * hatchFreq) * 0.5 + 0.5;
    hatch2 = smoothstep(0.35, 0.65, hatch2);

    // Tertiary hatching - vertical lines for darkest areas
    float hatch3 = sin(pos.x * 0.3 * hatchFreq + pos.y * 2.0 * hatchFreq) * 0.5 + 0.5;
    hatch3 = smoothstep(0.4, 0.6, hatch3);

    // Layer hatching based on darkness
    float hatchMask = 0.0;
    hatchMask += hatch1 * smoothstep(0.2, 0.5, darkness);
    hatchMask += hatch2 * smoothstep(0.45, 0.7, darkness) * 0.7;
    hatchMask += hatch3 * smoothstep(0.7, 0.9, darkness) * 0.5;
    hatchMask = clamp(hatchMask, 0.0, 1.0);

    // Combine hatching with edges (darken where hatched)
    line = min(line, 1.0 - hatchMask * darkness);
  }

  // 7. Background color
  vec3 bg = vec3(1.0);
  if (uBgColor > 0.5) {
    bg = vec3(0.102, 0.227, 0.361); // #1A3A5C
  }

  // 8. Line color (0 = black, >0 = hue-based color)
  vec3 lineColor = vec3(0.0);
  if (uLineColor > 0.5) {
    lineColor = hue2rgb(uLineColor / 360.0);
  }

  vec3 result = mix(bg, lineColor, 1.0 - line);

  gl_FragColor = vec4(result, 1.0);
}
