precision highp float;

// 棱镜彩虹色散:RGB 三通道沿方向分离采样,高对比边缘拖出彩虹镶边。
// 三种模式共用一支 shader:径向色差(默认)/对角色散/紫边增强
// (值域与默认值=wayfinder/2d-new-effects/tickets/04 定稿)。

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uMode;            // 0 径向色差 / 1 对角色散 / 2 紫边增强(select 档位)
uniform float uAmount;          // 色散量 0..1,默认 0.5
uniform float uAngle;           // 对角:方向角 0..180°,默认 45°
uniform float uEdgeThreshold;   // 紫边:边缘阈值 0..1,默认 0.5

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec3 col;
  float aspect = uResolution.x / uResolution.y;

  if (uMode < 0.5) {
    // 径向色差:以画面中心为原点,离中心越远分离越大
    vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
    float amt = (0.004 + length(d) * 0.028) * uAmount * 2.0;
    col.r = texture2D(uImage, vUv + d * amt).r;
    col.g = texture2D(uImage, vUv).g;
    col.b = texture2D(uImage, vUv - d * amt).b;
  } else if (uMode < 1.5) {
    // 对角色散:固定方向的均匀通道错位
    float a = radians(uAngle);
    vec2 off = vec2(cos(a), sin(a)) * uAmount * 0.02;
    col.r = texture2D(uImage, vUv + off).r;
    col.g = texture2D(uImage, vUv).g;
    col.b = texture2D(uImage, vUv - off).b;
  } else {
    // 紫边增强:径向分离 + 高对比边缘推向紫色
    vec2 px = 1.0 / uResolution;
    float l0 = luma(texture2D(uImage, vUv).rgb);
    float lxr = luma(texture2D(uImage, vUv + vec2(px.x, 0.0)).rgb);
    float lyr = luma(texture2D(uImage, vUv + vec2(0.0, px.y)).rgb);
    float edgeMag = length(vec2(lxr - l0, lyr - l0));
    float e = smoothstep(uEdgeThreshold * 0.5, uEdgeThreshold * 0.5 + 0.15, edgeMag);

    vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
    float amt = (0.004 + length(d) * 0.02) * uAmount * 2.0;
    col.r = texture2D(uImage, vUv + d * amt).r;
    col.g = texture2D(uImage, vUv).g;
    col.b = texture2D(uImage, vUv - d * amt).b;

    // 高对比缘:提升红蓝压绿,推向紫边观感
    col = mix(col, vec3(col.r * 0.9 + 0.12, col.g * 0.72, col.b * 0.9 + 0.18), e * uAmount * 0.6);
  }

  gl_FragColor = vec4(col, 1.0);
}
