precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uLevels;
uniform float uSaturation;
uniform float uContrast;
uniform float uPalette;
uniform float uBenDay;
uniform float uHueShift;
uniform float uDotSize;

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
    vec3 rgb = abs(fract(vec3(c.x) + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0;
    return c.z * mix(vec3(1.0), clamp(rgb, 0.0, 1.0), c.y);
}

vec3 posterize(vec3 color, float levels) {
    return floor(color * levels + 0.5) / levels;
}

vec3 nearestPaletteColor(vec3 color, float paletteIndex) {
    // Palette 0: #FF0055, #FFCC00, #00CCFF, #FF6600, #000000, #FFFFFF
    vec3 pal0[6];
    pal0[0] = vec3(1.0, 0.0, 0.333);
    pal0[1] = vec3(1.0, 0.8, 0.0);
    pal0[2] = vec3(0.0, 0.8, 1.0);
    pal0[3] = vec3(1.0, 0.4, 0.0);
    pal0[4] = vec3(0.0, 0.0, 0.0);
    pal0[5] = vec3(1.0, 1.0, 1.0);

    // Palette 1: #FF00FF, #00FF00, #FFFF00, #00FFFF, #000000, #FFFFFF
    vec3 pal1[6];
    pal1[0] = vec3(1.0, 0.0, 1.0);
    pal1[1] = vec3(0.0, 1.0, 0.0);
    pal1[2] = vec3(1.0, 1.0, 0.0);
    pal1[3] = vec3(0.0, 1.0, 1.0);
    pal1[4] = vec3(0.0, 0.0, 0.0);
    pal1[5] = vec3(1.0, 1.0, 1.0);

    // Palette 2: #FF0000, #0000FF, #FFFF00, #FF8000, #000000, #FFFFFF
    vec3 pal2[6];
    pal2[0] = vec3(1.0, 0.0, 0.0);
    pal2[1] = vec3(0.0, 0.0, 1.0);
    pal2[2] = vec3(1.0, 1.0, 0.0);
    pal2[3] = vec3(1.0, 0.502, 0.0);
    pal2[4] = vec3(0.0, 0.0, 0.0);
    pal2[5] = vec3(1.0, 1.0, 1.0);

    // Palette 3: #E91E63, #9C27B0, #3F51B5, #00BCD4, #000000, #FFFFFF
    vec3 pal3[6];
    pal3[0] = vec3(0.914, 0.118, 0.388);
    pal3[1] = vec3(0.612, 0.153, 0.69);
    pal3[2] = vec3(0.247, 0.318, 0.71);
    pal3[3] = vec3(0.0, 0.737, 0.831);
    pal3[4] = vec3(0.0, 0.0, 0.0);
    pal3[5] = vec3(1.0, 1.0, 1.0);

    // Palette 4: #FF3D00, #76FF03, #FFEA00, #D500F9, #000000, #FFFFFF
    vec3 pal4[6];
    pal4[0] = vec3(1.0, 0.239, 0.0);
    pal4[1] = vec3(0.463, 1.0, 0.012);
    pal4[2] = vec3(1.0, 0.918, 0.0);
    pal4[3] = vec3(0.835, 0.0, 0.976);
    pal4[4] = vec3(0.0, 0.0, 0.0);
    pal4[5] = vec3(1.0, 1.0, 1.0);

    vec3 best = pal0[0];
    float bestDist = 999.0;

    for (int i = 0; i < 6; i++) {
        vec3 c;
        if (paletteIndex < 0.5) {
            c = pal0[i];
        } else if (paletteIndex < 1.5) {
            c = pal1[i];
        } else if (paletteIndex < 2.5) {
            c = pal2[i];
        } else if (paletteIndex < 3.5) {
            c = pal3[i];
        } else {
            c = pal4[i];
        }
        float d = dot(color - c, color - c);
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }

    return best;
}

void main() {
    vec2 uv = vUv;
    vec4 color = texture2D(uImage, uv);

    // Step 1: Apply contrast
    vec3 c = ((color.rgb - 0.5) * uContrast) + 0.5;

    // Step 2: Apply saturation
    float gray = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(gray), c, uSaturation);

    // Step 3: Map to nearest palette color (decides the hue)
    vec3 paletteColor = nearestPaletteColor(c, uPalette);

    // Step 4: Posterize luminance into levels — few levels give the hard poster
    // look, many levels approach smooth palette shading
    float levels = floor(uLevels + 0.5);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float q = posterize(vec3(lum), levels).r;
    c = paletteColor * (0.35 + 0.65 * q);

    // Step 4.5: Apply hue shift
    if (uHueShift > 0.5) {
        vec3 hsv = rgb2hsv(c);
        hsv.x = fract(hsv.x + uHueShift / 360.0);
        c = hsv2rgb(hsv);
    }

    // Step 5: Optional Ben-Day dots
    if (uBenDay > 0.5) {
        float cellSize = max(uDotSize, 2.0);
        vec2 cell = floor(gl_FragCoord.xy / cellSize);
        vec2 cellCenter = (cell + 0.5) * cellSize;
        vec2 offset = gl_FragCoord.xy - cellCenter;
        float dist = length(offset) / (cellSize * 0.5);

        // Brightness-based dot size: darker areas get larger dots
        float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float dotRadius = mix(0.85, 0.25, luminance);

        if (dist > dotRadius) {
            c *= 0.65;
        }
    }

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
}
