precision highp float;

// 全息箔:亮度梯度作伪法线,视角相关的光谱色相映射叠深色金属底,
// 做出"镭射烫印箔面"质感。三种箔面质感共用一支 shader:
// 碎冰镭射(默认)/拉丝光柱/珠光细闪,气质参数按质感 visibleWhen 条件显隐
// (值域与默认值=wayfinder/2d-new-effects/tickets/04 定稿,碎冰基准=样张页定稿)。

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uTexture;       // 0 碎冰镭射 / 1 拉丝光柱 / 2 珠光细闪(select 档位)
uniform float uStrength;      // 光谱强度 0..2,默认 1(1.0 = 样张基准)
uniform float uBandDensity;   // 色带密度 0.5..3,默认 1
uniform float uBandAngle;     // 色带角度 0..180°,默认 22°(=样张 4.0:1.6 权重比)
uniform float uFoilColorR;    // 箔面底色(color 拆通道)
uniform float uFoilColorG;
uniform float uFoilColorB;
uniform float uCrackleDensity;   // 碎冰:碎纹频率 15..60,默认 38
uniform float uStreakDensity;    // 拉丝:竖丝密度 5..40,默认 14
uniform float uSparkleDensity;   // 珠光:闪点密度 0.5..3,默认 1

/* ---------- 基础噪声(与 crosshatch/glassdistort 同源) ---------- */

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  vec2 px = 1.0 / uResolution;
  vec3 base = texture2D(uImage, vUv).rgb;
  float lC = luma(base);

  // 亮度梯度(伪法线):光谱对"轮廓"的响应来源
  float lx = luma(texture2D(uImage, vUv + vec2(px.x * 2.0, 0.0)).rgb)
           - luma(texture2D(uImage, vUv - vec2(px.x * 2.0, 0.0)).rgb);
  float ly = luma(texture2D(uImage, vUv + vec2(0.0, px.y * 2.0)).rgb)
           - luma(texture2D(uImage, vUv - vec2(0.0, px.y * 2.0)).rgb);
  vec2 grad = vec2(lx, ly);

  float a = radians(uBandAngle);
  vec2 dir = vec2(cos(a), sin(a));

  // 三种质感各自的纹理颗粒、色带扰动与光谱饱和度
  float grain;
  float band;
  float sat;
  float sparkleThresh;
  if (uTexture < 0.5) {
    // 碎冰镭射:碎纹噪声调制,全饱和彩虹(样张认可基准)
    grain = vnoise(vUv * uCrackleDensity);
    band = dot(vUv, dir) * 4.0 * uBandDensity + grad.x * 7.0 + grad.y * 5.0 + grain * 2.4;
    sat = 0.85;
    sparkleThresh = 0.985;
  } else if (uTexture < 1.5) {
    // 拉丝光柱:竖向细密、水平绵长的各向异性丝
    grain = vnoise(vec2(vUv.x * 1.5, vUv.y * uStreakDensity * 3.0));
    band = dot(vUv, dir) * 4.0 * uBandDensity + grad.y * 6.0 + grain * 3.0;
    sat = 0.80;
    sparkleThresh = 0.99;
  } else {
    // 珠光细闪:低饱和柔彩虹 + 高频闪点
    grain = vnoise(vUv * uCrackleDensity * 0.8);
    band = dot(vUv, dir) * 4.0 * uBandDensity + grad.x * 4.0 + grad.y * 3.0 + grain * 1.5;
    sat = 0.45;
    sparkleThresh = 0.975;
  }

  vec3 spectrum = hsv2rgb(vec3(fract(band * 0.35), sat, 1.0));

  // 箔面出现的地方:亮部 + 轮廓边缘(暗平区保持金属底)
  float edge = length(grad) * 4.0;
  float mask = smoothstep(0.32, 0.85, lC * 0.75 + edge) * (0.55 + 0.45 * grain);

  // 金属底:原图压暗保形,混入底色(近黑时箔面嵌入感最强)
  vec3 foilBase = mix(vec3(luma(base)), base, 0.35);
  foilBase = foilBase * 0.45 + vec3(uFoilColorR, uFoilColorG, uFoilColorB) * 0.55;

  vec3 col = foilBase + spectrum * mask * 0.95 * uStrength;

  // 细碎闪点(密度由质感参数控制)
  float sparkle = step(sparkleThresh, hash(floor(vUv * uResolution * 0.5 * uSparkleDensity))) * mask;
  col += sparkle * 0.6;

  gl_FragColor = vec4(col, 1.0);
}
