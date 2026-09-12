precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uDotSize;
uniform float uDensity;
uniform float uRandomness;
uniform float uSizeVariation;
uniform float uDotOpacity;
uniform float uShape;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 pixel = vUv * uResolution;
    float spacing = max(uDotSize, 2.0);
    vec2 baseCell = floor(pixel / spacing);
    float bestDist = 999.0;
    vec3 bestColor = vec3(1.0);

    for (int oy = -1; oy <= 1; oy++) {
        for (int ox = -1; ox <= 1; ox++) {
            vec2 cell = baseCell + vec2(float(ox), float(oy));
            vec2 jitter = vec2(hash(cell), hash(cell + 37.17)) - 0.5;
            vec2 sitePx = (cell + 0.5 + jitter * uRandomness * 0.8) * spacing;
            vec2 siteUv = clamp(sitePx / uResolution, 0.0, 1.0);
            vec3 color = texture2D(uImage, siteUv).rgb;
            float lum = dot(color, vec3(0.299, 0.587, 0.114));
            float hi = max(color.r, max(color.g, color.b));
            float lo = min(color.r, min(color.g, color.b));
            float importance = mix(0.18, 1.0, max(1.0 - lum, (hi - lo) * 0.65));
            float probability = clamp(importance * uDensity * 0.55, 0.03, 0.98);
            bool occupied = hash(cell + 91.73) <= probability;
            float sizeRand = mix(1.0, 0.55 + hash(cell + 173.0) * 0.9, uSizeVariation);
            float radius = spacing * 0.42 * sizeRand;
            vec2 local = (pixel - sitePx) / max(radius, 0.001);
            float candidateDist;
            if (uShape < 0.5) {
                candidateDist = length(local);
            } else if (uShape < 1.5) {
                candidateDist = max(abs(local.x), abs(local.y));
            } else {
                vec2 p = local;
                const float k = 1.7320508;
                p.x = abs(p.x) - 1.0;
                p.y = p.y + 1.0 / k;
                if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
                p.x -= clamp(p.x, -2.0, 0.0);
                float signedDistance = -length(p) * sign(p.y);
                candidateDist = 1.0 + signedDistance * k;
            }
            if (occupied && candidateDist < bestDist) {
                bestDist = candidateDist;
                bestColor = color;
            }
        }
    }

    float edgeWidth = 1.0 / max(spacing * 0.42, 1.0);
    float mask = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, bestDist);
    vec3 canvas = vec3(0.985, 0.98, 0.96);
    gl_FragColor = vec4(mix(canvas, bestColor, mask * uDotOpacity), 1.0);
}
