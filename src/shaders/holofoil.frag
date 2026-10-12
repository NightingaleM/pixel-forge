precision highp float;

// 全息箔:亮度梯度作伪法线,视角相关的光谱色相映射叠深色金属底,
// 做出"镭射烫印箔面"质感。三种箔面质感共用一支 shader:
// 碎冰镭射(默认)/拉丝光柱/珠光细闪,气质参数按质感 visibleWhen 条件显隐
// (值域与默认值=wayfinder/2d-new-effects/tickets/04 定稿,碎冰基准=样张页定稿)。
//
// 选择性加箔扩展(wayfinder/holofoil-card 票06 定稿):uScope 应用范围三档——
// 0 全图(缺省,旧码逐字节等价)/1 边缘(单 pass Sobel+双尺度+Laplacian 门控+
// 滞后阈值近似,检测步进按纹理分辨率 uTexSize)/2 分区(CPU k-means 掩膜纹理,
// uZoneEnabled 缺省 0=全图,批量/旧码安全)。转卡倾角 uTiltX/uTiltY 缺省 0,
// 静态渲染无影响。

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
/* ---- 选择性加箔 + 转卡(缺省值即旧码行为,GLSL uniform 默认 0) ---- */
uniform float uScope;          // 0 全图 / 1 边缘 / 2 分区(select「应用范围」)
uniform float uEdgeThreshold;  // 0.1..0.9 默认 0.5(样张有效区间 0.35..0.65)
uniform float uEdgeWidth;      // 1..6 默认 2(dilate 边宽,纹素)
uniform float uEdgeSoftBand;   // 0.5..3 默认 1.5(响应域软带宽度,内部 /6 映射)
uniform float uEdgeHysteresis; // 0..0.4 默认 0.15(核心阈值滞后,高纹理弥漫抑制)
uniform float uZoneBoost;      // 分区档:0 仅烫箔(默认)/1 光谱流彩;边缘档恒仅烫箔
uniform sampler2D uZoneMask;   // 分区掩膜 256² 白/黑,CPU 上传(unit 2)
uniform float uZoneEnabled;    // 缺省 0=zone 恒 1(全图/批量无掩膜),旧码安全
uniform vec2 uTexSize;         // 纹理原始分辨率——检测步进按纹理像素走
uniform float uTiltX;          // 转卡倾角 -1..1(缺省 0)
uniform float uTiltY;

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

/* ---------- 边缘检测(票01 方案 A+B + 票03 样张升级:单 pass 滞后阈值近似) ----------
   纯 smoothstep 阈值在高纹理照片上一/二阶导大面积过阈(样张实测:梯度场 46.6% 像素
   超阈,边缘响应弥漫 31% 画面)。两层修正:① Laplacian 门控滤柔和渐变(一阶梯度够
   但二阶≈0 的光晕/暗角);② 滞后核心——强阶跃才成核心,弱响应只在核心的 dilate
   邻域内保留为软带,弥漫纹理弱响应因无核心邻接被剔除。真 Canny 出局,此为单 pass
   近似。所有采样步进按 uTexSize(纹理像素)——渲染 canvas ≠ 纹理尺寸时,按 canvas
   步进会被 LINEAR 插值摊薄梯度 2.7× 致细线全漏检(票03 卡通素材实测定位)。 */
float sobelMag(vec2 uv) {
  vec2 px = 1.0 / uTexSize;
  float l00 = luma(texture2D(uImage, uv + px * vec2(-1.0, -1.0)).rgb);
  float l10 = luma(texture2D(uImage, uv + px * vec2( 0.0, -1.0)).rgb);
  float l20 = luma(texture2D(uImage, uv + px * vec2( 1.0, -1.0)).rgb);
  float l01 = luma(texture2D(uImage, uv + px * vec2(-1.0,  0.0)).rgb);
  float l21 = luma(texture2D(uImage, uv + px * vec2( 1.0,  0.0)).rgb);
  float l02 = luma(texture2D(uImage, uv + px * vec2(-1.0,  1.0)).rgb);
  float l12 = luma(texture2D(uImage, uv + px * vec2( 0.0,  1.0)).rgb);
  float l22 = luma(texture2D(uImage, uv + px * vec2( 1.0,  1.0)).rgb);
  float gx = (l20 + 2.0 * l21 + l22) - (l00 + 2.0 * l01 + l02);
  float gy = (l02 + 2.0 * l12 + l22) - (l00 + 2.0 * l10 + l20);
  return length(vec2(gx, gy));
}
float gradMag(vec2 uv) {
  vec2 px = 1.0 / uTexSize;
  float lx = luma(texture2D(uImage, uv + vec2(px.x * 2.0, 0.0)).rgb)
           - luma(texture2D(uImage, uv - vec2(px.x * 2.0, 0.0)).rgb);
  float ly = luma(texture2D(uImage, uv + vec2(0.0, px.y * 2.0)).rgb)
           - luma(texture2D(uImage, uv - vec2(0.0, px.y * 2.0)).rgb);
  return length(vec2(lx, ly));
}
float lapMag(vec2 uv) {
  vec2 px = 1.0 / uTexSize;
  float l0 = luma(texture2D(uImage, uv).rgb);
  float lap = luma(texture2D(uImage, uv + vec2(px.x, 0.0)).rgb) + luma(texture2D(uImage, uv - vec2(px.x, 0.0)).rgb)
            + luma(texture2D(uImage, uv + vec2(0.0, px.y)).rgb) + luma(texture2D(uImage, uv - vec2(0.0, px.y)).rgb)
            - 4.0 * l0;
  return abs(lap);
}
/* 返回 (核心响应, 软带响应)。阈值窗口随 uEdgeThreshold 线性映射 0.15..0.65+;
   mag 取双尺度一致(min):真实阶跃在 ±1px Sobel 与 ±2px 中心差分下都强,孤立高频
   尖峰长基线下被平滑 → min 拉低剔除(票03 debug 场实测验证);
   软带宽度 uEdgeSoftBand/6(默认 1.5→0.25);核心阈值起点滞后 0.10+uEdgeHysteresis
   (默认 0.15→0.25,与票03 样张常数一致)。 */
vec2 edgePair(vec2 uv) {
  float lo = 0.15 + uEdgeThreshold * 0.5;
  float wS = uEdgeSoftBand / 6.0;
  float mag = min(gradMag(uv), sobelMag(uv) * 0.6);
  float gate = smoothstep(0.012, 0.08, lapMag(uv));
  float core = smoothstep(lo + 0.10 + uEdgeHysteresis, lo + 0.25 + uEdgeHysteresis, mag) * gate;
  float soft = smoothstep(lo, lo + wS, mag) * gate;
  return vec2(core, soft);
}
float edgeZone() {
  vec2 self = edgePair(vUv);
  /* 核心邻域 dilate:8 方向步进 uEdgeWidth 纹素取核心 max —— 软带只在核心附近保留 */
  float coreNear = self.x;
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * 0.7853981633;
    vec2 o = vec2(cos(ang), sin(ang)) / uTexSize * uEdgeWidth;
    coreNear = max(coreNear, edgePair(vUv + o).x);
  }
  return max(self.x, self.y * coreNear);
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

  // 转卡注入(票04 demo 定稿):倾角向量投影到色带方向平移相位,
  // 增益 2.6 = 满幅约 0.4 个谱周期。uTilt 恒 0 时无影响(静态/旧码)。
  band += dot(vec2(uTiltX, uTiltY), dir) * 2.6;

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

  // 选择性加箔:uScope=0(缺省)整块旁路,输出与旧版逐字节一致。
  // uZoneEnabled 缺省 0(无掩膜:批量/旧码/分析未完)时 zone 恒 1 = 全部面选中
  // ——用 mix 而非乘法(乘 0 会把 zone 归零变全原图,语义错误)
  if (uScope > 0.5) {
    float zone;
    if (uScope < 1.5) {
      zone = edgeZone();
    } else {
      // 分区:CPU 掩膜纹理 LINEAR 上采样 + smoothstep 羽化
      zone = smoothstep(0.35, 0.65, texture2D(uZoneMask, vUv).r);
    }
    zone = mix(1.0, zone, uZoneEnabled);
    if (uScope > 1.5 && uZoneBoost > 0.5) {
      // 光谱流彩:金属底全图,光谱/闪点只出现在选中处
      col = foilBase + spectrum * mask * zone * 0.95 * uStrength + sparkle * zone * 0.6;
    } else {
      // 仅烫箔:整个效果按 zone 混入,未选区=原图(边缘档固定此语义)
      col = mix(base, col, zone);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
