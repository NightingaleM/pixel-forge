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
uniform float uCellSize;
uniform float uFracture;
uniform float uPrism;
uniform float uViewMask;
uniform float uMirrorMode;

const float PI = 3.141592653589793;

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

// Mirror tiling: repeat the photo by reflection instead of clamping, so samples
// outside [0,1] fold back seamlessly (no edge streaks a clamp would produce).
vec2 tileMirror(vec2 uv) {
  return 1.0 - abs(mod(uv, 2.0) - 1.0);
}

void main() {
  // Aspect-corrected centred coordinates: reflections stay rigid on the canvas.
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);

  // Rotate the mirror assembly itself — the photo stays fixed in front of the
  // tube, so turning it sweeps the facet edges across the photo.
  float rot = uRotation * PI / 180.0;
  mat2 rotMat = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
  vec2 q = rotMat * p;

  // Fracture subdivides each sector: k times finer wedges and rings, so every
  // facet shrinks while the sector count (the coarse silhouette) is preserved.
  float n = max(uSegments, 2.0);
  float k = max(uFracture, 1.0);
  float nFine = n * k;
  float segFine = PI / nFine;
  float cellFine = max(uCellSize, 0.02) / k;

  float r = length(q);
  float theta = atan(q.y, q.x);

  // Angular fold: reflect into the fundamental wedge of the dihedral group.
  float segIndex = floor((theta + PI) / (2.0 * segFine));
  float a = abs(mod(theta, 2.0 * segFine) - segFine);

  // Radial fold: rotate onto the wedge bisector, then reflect on the family of
  // mirrors perpendicular to it — straight-line mirrors keep the mapping rigid
  // and tile the wedge into the diamond lattice.
  float bisect = segFine * 0.5;
  float bx = r * cos(a - bisect);
  float by = r * sin(a - bisect);
  float fx = abs(mod(bx + cellFine * 0.5, cellFine) - cellFine * 0.5);

  // Facet lookup: every facet samples the photo through a window whose centre
  // the mirror mode decides. Quantised facet-centre angles/radii keep one fixed
  // window per facet, so the in-facet mirror detail stays crisp.
  float zoom = max(uZoom, 0.01);
  vec2 local = vec2(fx - cellFine * 0.25, by) / (cellFine * 0.5);
  float cellAngle = (segIndex + 0.5) * (2.0 * segFine) - PI;
  float ringIdx = floor((r + cellFine * 0.5) / cellFine);
  float ringR = (ringIdx + 0.5) * cellFine;

  vec2 facetCenter;
  if (uMirrorMode < 0.5) {
    // Tube: the photo sits at the tube's end — every facet shows the same window.
    facetCenter = vec2(0.5);
  } else if (uMirrorMode < 1.5) {
    // Positional: a facet located in a direction reflects the photo region lying
    // in that same direction — outer facets reach the edges.
    vec2 dirC = vec2(cos(cellAngle), sin(cellAngle));
    facetCenter = vec2(0.5) + dirC * min(ringR, 1.0) * 0.5;
  } else {
    // Mirror reflection: image of the central photo reflected in each facet's
    // own mirror plane (radial normal at the facet centre).
    vec2 pc = vec2(cos(cellAngle), sin(cellAngle)) * ringR;
    vec2 nrm = vec2(cos(cellAngle), sin(cellAngle));
    vec2 toCenter = vec2(0.5) - pc;
    facetCenter = pc + toCenter - 2.0 * dot(toCenter, nrm) * nrm;
  }
  vec2 photoUv = facetCenter + local * cellFine * vec2(1.0 / aspect, 1.0) * zoom
    + vec2(uCenterX, uCenterY) * 0.5;
  vec3 color = texture2D(uImage, tileMirror(photoUv)).rgb;

  // The golden-ratio sector stride keeps neighbouring mirrors distinct while
  // the radial term connects them with a continuous stained-glass gradient.
  float sectorPhase = fract(segIndex * 0.61803398875);
  float foldPhase = a / segFine;
  float palettePhase = fract(
    sectorPhase + r * 0.92 + foldPhase * 0.22 + uHueShift / 360.0
  );

  vec3 hsv = rgb2hsv(color);
  if (uPrism > 0.5) {
    hsv.x = fract(hsv.x + palettePhase);
    // Give neutral source material enough chroma to become visibly prismatic,
    // while retaining more of the original palette when it is already vivid.
    hsv.y = clamp(hsv.y * 1.12 + (1.0 - hsv.y) * 0.58, 0.0, 1.0);
    hsv.z = clamp(hsv.z * 1.06 + 0.025, 0.0, 1.0);
  } else {
    // Without the prism the mirror stays faithful — but the hue shift is an
    // independent control and must still recolor it.
    hsv.x = fract(hsv.x + uHueShift / 360.0);
  }
  color = hsv2rgb(hsv);

  // Edge glow along the mirror seams: angular boundaries (a = 0 or segFine)
  // and the radial mirror planes (fx = 0).
  float dAng = min(a, segFine - a) / segFine;
  float dRad = fx / (cellFine * 0.5);
  float dEdge = min(dAng, dRad);
  float glow = (1.0 - smoothstep(0.0, 0.18, dEdge)) * uEdgeGlow;
  if (uPrism > 0.5) {
    vec3 prism = hsv2rgb(vec3(fract(palettePhase + 0.08), 0.86, 1.0));
    color += prism * glow * 0.72;
  } else {
    color += vec3(glow * 0.3);
  }

  if (uViewMask > 0.5) {
    // Circular eyepiece: fade the tessellation out beyond the tube aperture.
    float maskR = length(p) * 2.0;
    float mask = 1.0 - smoothstep(0.8, 1.0, maskR);
    color *= mix(vec3(0.02), vec3(1.0), mask);
  } else {
    float vignette = 1.0 - smoothstep(0.48, 0.82, r);
    color *= mix(1.0, vignette, 0.18);
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
