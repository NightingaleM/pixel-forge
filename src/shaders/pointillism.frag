precision highp float;

varying vec2 vTexCoord;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uDotSize;
uniform float uDensity;
uniform float uRandomness;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    // Step 1: Scale UV by density to get grid spacing
    float cellSize = uDotSize / uDensity;

    // Step 2: Create grid
    vec2 cellUv = vTexCoord * (uResolution / cellSize);

    // Step 3: Get cell ID
    vec2 cellId = floor(cellUv);

    // Step 4: Get local position within cell
    vec2 cellLocal = fract(cellUv) - 0.5;

    // Step 5: Add randomness to cell center using hash
    vec2 jitter = vec2(hash(cellId), hash(cellId + 100.0)) * 2.0 - 1.0;
    cellLocal -= jitter * uRandomness * 0.4;

    // Step 6: Sample original image color at cell center (adjusted for jitter)
    vec2 sampleUv = (cellId + 0.5 + jitter * uRandomness * 0.4) * cellSize / uResolution;
    vec3 color = texture2D(uImage, clamp(sampleUv, 0.0, 1.0)).rgb;

    // Step 7: Draw circle with smooth edge
    float dist = length(cellLocal);
    float radius = 0.4;
    float mask = 1.0 - smoothstep(radius - 0.05, radius + 0.05, dist);

    // Step 8: Output - white background with colored dots
    gl_FragColor = vec4(mix(vec3(1.0), color, mask), 1.0);
}
