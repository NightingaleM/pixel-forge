varying vec3 vColor;
varying float vAlpha;
varying float vGradientUV;

uniform float uShapeType;
uniform float uUseCustomColor;
uniform float uGradientMode;
uniform sampler2D uGradientMap;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float alpha = 0.0;

  if (uShapeType < 0.5) {
    // Circle with soft edge
    float dist = length(uv);
    if (dist > 0.5) discard;
    alpha = 1.0 - smoothstep(0.3, 0.5, dist);
  } else if (uShapeType < 1.5) {
    // Square
    float d = max(abs(uv.x), abs(uv.y));
    if (d > 0.45) discard;
    alpha = 1.0 - smoothstep(0.25, 0.45, d);
  } else if (uShapeType < 2.5) {
    // Diamond
    float d = abs(uv.x) + abs(uv.y);
    if (d > 0.5) discard;
    alpha = 1.0 - smoothstep(0.3, 0.5, d);
  } else {
    // Soft glow (gaussian)
    float dist = length(uv);
    alpha = exp(-dist * dist * 18.0);
    if (alpha < 0.01) discard;
  }

  vec3 finalColor = vColor;
  if (uUseCustomColor > 0.5 && uGradientMode >= 0.0) {
    finalColor = texture2D(uGradientMap, vec2(vGradientUV, 0.5)).rgb;
  }
  gl_FragColor = vec4(finalColor, alpha * vAlpha);
}
