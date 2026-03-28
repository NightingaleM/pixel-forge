precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uDotSize;
uniform float uDensity;
uniform float uRandomness;
uniform float uSizeVariation; // 0.0-1.0, random size variation
uniform float uDotOpacity;    // 0.1-1.0, dot transparency
uniform float uShape;         // 0=circle, 1=square, 2=triangle

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    // Step 1: Scale UV by density to get grid spacing
    float cellSize = uDotSize / uDensity;

    // Step 2: Create grid
    vec2 cellUv = vUv * (uResolution / cellSize);

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

    // Step 7: Size variation - randomly scale each dot
    float sizeRand = mix(1.0, hash(cellId + 200.0) * 1.5 + 0.5, uSizeVariation);
    float baseRadius = 0.4 * sizeRand;

    // Step 8: Shape-based distance calculation
    float dist;
    if (uShape < 0.5) {
        // circle
        dist = length(cellLocal);
    } else if (uShape < 1.5) {
        // square (Chebyshev distance)
        dist = max(abs(cellLocal.x), abs(cellLocal.y));
    } else {
        // triangle (equilateral triangle SDF)
        vec2 p = cellLocal;
        float k = 1.732; // sqrt(3)
        p.x = abs(p.x) - 0.4;
        p.y = p.y + 0.4 / k;
        if (p.x + k * p.y > 0.0) {
            p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
        }
        p.x -= clamp(p.x, -0.8, 0.0);
        dist = -length(p) * 1.2;
        dist = max(dist, abs(cellLocal.y) - 0.4);
    }

    float mask = 1.0 - smoothstep(baseRadius - 0.05, baseRadius + 0.05, dist);

    // Apply opacity
    mask *= uDotOpacity;

    // Step 9: Output - white background with colored dots
    gl_FragColor = vec4(mix(vec3(1.0), color, mask), 1.0);
}
