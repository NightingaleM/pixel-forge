// tiltshift_ds.frag — 金字塔 tent 降采样 pass(tiltshift 专属链)
// 4 双线性 tap 覆盖 2x2 源 texel,作为金字塔 L0..L3(1/2..1/16)与深层
// 动态加轮的统一降采样核。
// 约定:输入纹理绑 unit 0(uImage);uSrcRes = 输入纹理的像素分辨率
// (renderToFBO 由调用方传,非画布 uResolution——本 pass 输出尺寸可小于画布,
// 步进必须按输入纹理算,勿踩 01 票病理「UV/texel 单位错位」)。
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uSrcRes;

void main() {
  vec2 t = 1.0 / uSrcRes;
  vec3 c = texture2D(uImage, vUv + vec2(-t.x, -t.y)).rgb
         + texture2D(uImage, vUv + vec2( t.x, -t.y)).rgb
         + texture2D(uImage, vUv + vec2(-t.x,  t.y)).rgb
         + texture2D(uImage, vUv + vec2( t.x,  t.y)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}
