// tiltshift_composite.frag — 移轴微缩 A 路线合成 pass(金字塔混合 + 形状高光层 + 色彩链)
// 规格: wayfinder/tiltshift-miniature/tickets/04(2026-10-13 锁定);样张定稿同图票 03。
//
// 输入纹理(renderImage 的 tiltshift 分支经 renderToCanvas 绑定):
//   uOriginal unit0 原图全分辨率(清晰像素与 unsharp 恒取全分,画质无损铁律)
//   uL0..uL2  unit1-3 金字塔层 1/2, 1/4, 1/8(tent 降采样链)
//   uL3Top/uL3Bot unit4-5 深层 1/16 上/下两份独立加轮(每 4% 一轮,1-6 轮)
//     ——上/下满糊半径完全解耦:只动一侧参数另一侧逐位不变(sweep 断言)
//
// 几何约定: 所有长度量以「画幅短边比例」表达(960 预览与 2048 导出观感一致);
//   uMaxBlurTop/uMaxBlurBottom 面板给百分数(1-25),此处 /100;
//   vUv.y=0 为画面底部(UNPACK_FLIP_Y)。
// 半径曲线: r = rm * pow(smoothstep(0, feather, 带距), 1.5) —— 离焦带越远越糊
//   的单调渐进(修 01 票病理②「alpha 混合假梯度」);rm 取本侧满糊值。
// 权重: 按本侧归一 t = r/rm 的三角窗(T=0.117/0.25/0.517/1.0)——权重曲线
//   只依赖本侧满糊值,两侧互不影响。
precision highp float;
varying vec2 vUv;
uniform sampler2D uOriginal;
uniform sampler2D uL0;
uniform sampler2D uL1;
uniform sampler2D uL2;
uniform sampler2D uL3Top;
uniform sampler2D uL3Bot;
uniform vec2 uResolution;
uniform float uBandY;          // 焦带中心(uv.y, 0..1)
uniform float uBandTilt;       // 倾角(度,±90;90=竖直带)
uniform float uBandW;          // 带全宽(短边比例)
uniform float uMaxBlurTop;     // 上缘(远端)满糊半径,百分数
uniform float uMaxBlurBottom;  // 下缘(近端)满糊半径,百分数
uniform float uFeather;        // 过渡带半宽(短边比例)
uniform float uHiGlow;         // 高光盘感(高光偏置+盘内提亮)
uniform float uSat;            // 饱和(1..2,模糊区自动 -18% 收)
uniform float uCon;            // 对比(0.5 pivot)
uniform float uClar;           // 焦带内 unsharp 加锐量
uniform float uVig;            // 暗角
uniform float uWarm;           // 微暖(玩具涂装感)
uniform float uDith;           // 抖动(天空大渐变防 banding)

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float shortSide() { return min(uResolution.x, uResolution.y); }

// 带符号带距(短边比例): >0 = 画面上方(远端)
float bandSigned(vec2 uv) {
  float mn = shortSide();
  float ax = uResolution.x / mn;
  float ay = uResolution.y / mn;
  float t = radians(uBandTilt);
  return (uv.x - 0.5) * ax * sin(t) + (uv.y - uBandY) * ay * cos(t);
}
float radiusMaxAt(vec2 uv) {
  return bandSigned(uv) > 0.0 ? uMaxBlurTop * 0.01 : uMaxBlurBottom * 0.01;
}
float radiusAt(vec2 uv) {
  float d = max(abs(bandSigned(uv)) - 0.5 * uBandW, 0.0);
  return radiusMaxAt(uv) * pow(smoothstep(0.0, uFeather, d), 1.5);
}
// 方向(单位向量,短边比例域) -> UV 偏移
vec2 dirToUV(vec2 dirN, float rShort) {
  float mn = shortSide();
  return vec2(dirN.x * uResolution.x, dirN.y * uResolution.y) * (rShort / mn);
}

// 形状高光层: 32-tap 费马螺旋 disc(固定圆核,票 03 终判砍形状参数),只服务
// 高光撑盘。jitter 为确定性 hash(无 time,静止无闪烁)。
vec4 discGather(vec2 uv, float r) {
  float rotA = hash12(uv * uResolution) * 6.2831853;
  float wsum = 0.0, hi = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    float fi = float(i) + 0.5;
    float fr = sqrt(fi / 32.0);                       // 等面积填充盘内
    float ang = rotA + fi * 2.39996323;               // 黄金角
    vec2 dir = vec2(cos(ang), sin(ang));
    vec3 s3 = texture2D(uOriginal, uv + dirToUV(dir, fr * r)).rgb;
    // 圆核边缘柔化 0.12(防走样),高光样本加权(亮源撑满盘)
    float w = smoothstep(1.12, 0.88, fr);
    float lum = luma(s3);
    w *= 1.0 + uHiGlow * 1.6 * smoothstep(0.72, 0.95, lum);
    col += s3 * w; wsum += w;
    hi += w * smoothstep(0.72, 0.95, lum);
  }
  return vec4(col / max(wsum, 1e-4), clamp(hi / max(wsum, 1e-4) - 0.35, 0.0, 1.0));
}

// 色彩链(顺序固定,票 04): 带内 unsharp -> 饱和(糊区收敛) -> 对比 -> 暗角 -> 微暖 -> 抖动
vec3 colorChain(vec3 col, vec3 orig, float wBlur, vec2 uv) {
  vec2 texel = 1.0 / uResolution;
  vec3 nb = ( texture2D(uOriginal, uv + vec2(texel.x, 0.0)).rgb + texture2D(uOriginal, uv - vec2(texel.x, 0.0)).rgb
            + texture2D(uOriginal, uv + vec2(0.0, texel.y)).rgb + texture2D(uOriginal, uv - vec2(0.0, texel.y)).rgb ) * 0.25;
  vec3 us = orig + (orig - nb) * uClar * (1.0 - wBlur);
  col = mix(us, col, wBlur);
  float l = luma(col);
  col = mix(vec3(l), col, uSat * (1.08 - 0.18 * wBlur));
  col = (col - 0.5) * uCon + 0.5;
  float a = uResolution.x / uResolution.y;
  col *= 1.0 - uVig * smoothstep(0.5, 1.15, length((uv - 0.5) * vec2(a, 1.0)));
  col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.97), uWarm);
  col += (hash12(uv * uResolution) - 0.5) * uDith;
  return col;
}

void main() {
  float rm = radiusMaxAt(vUv);
  float r = radiusAt(vUv);
  float t = clamp(r / max(rm, 1e-5), 0.0, 1.05);
  float T0 = 0.117, T1 = 0.25, T2 = 0.517, T3 = 1.0;
  vec3 orig = texture2D(uOriginal, vUv).rgb;
  float w0 = max(0.0, 1.0 - abs(t - T0) / (T1 - T0));
  float w1 = max(0.0, 1.0 - abs(t - T1) / (T2 - T1));
  float w2 = max(0.0, 1.0 - abs(t - T2) / (T3 - T2));
  float w3 = smoothstep(T2, T3, t);
  float wS = 1.0 - smoothstep(0.0, T0, t);
  vec3 c3 = bandSigned(vUv) > 0.0 ? texture2D(uL3Top, vUv).rgb : texture2D(uL3Bot, vUv).rgb;
  vec3 c0 = texture2D(uL0, vUv).rgb;
  vec3 c1 = texture2D(uL1, vUv).rgb;
  vec3 c2 = texture2D(uL2, vUv).rgb;
  vec3 tower = (orig * wS + c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3)
             / (wS + w0 + w1 + w2 + w3 + 1e-5);
  // 形状高光层: 只在已糊开的亮区把高光按圆盘撑开
  vec4 d = discGather(vUv, max(r, 0.004));
  float hiMask = smoothstep(0.66, 0.92, luma(tower));
  tower = mix(tower, d.rgb * (1.0 + 0.5 * uHiGlow * d.a), uHiGlow * hiMask * smoothstep(0.004, 0.02, r));
  gl_FragColor = vec4(colorChain(tower, orig, 1.0 - wS, vUv), 1.0);
}
