precision highp float;

// 玻璃扭曲:噪声位移场全幅重映射采样坐标,做出"隔着非平滑玻璃看图"的质感。
// 三种玻璃类型共用一支 shader,常量与位移曲线均为用户定稿值
// (迭代过程与定稿表见 wayfinder/tickets/01-glass-prototype.md 及试验台
//  wayfinder/assets/glass-lab.html,默认值即定稿值)。

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uGlassType;      // 0 大波浪 / 1 方格压花 / 2 橘皮(select 档位)
uniform float uStrengthLevel;  // 0 轻微 / 1 标准 / 2 强烈(select 档位)

/* ---------- 基础噪声:hash + value noise,quintic 平滑保 C2(透镜面光滑) ---------- */

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* ---------- 高度场:三套玻璃各一,常量即票1 定稿参数 ---------- */

/* 大波浪:3 octave fBm,连绵起伏。
   波长尺度 0.73 / 倍频增益 0.52 / y 向拉伸 1.37 */
float heightWave(vec2 p) {
  vec2 q = vec2(p.x, p.y * 1.37);
  float f = 1.8 / 0.73;
  float a = 1.0;
  float norm = 0.0;
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    h += a * vnoise(q * f + float(i) * 17.0);
    norm += a; a *= 0.52; f *= 2.1;
  }
  return h / norm;
}

/* 橘皮:4 octave fBm + domain warp + 疏密包络 + 低频流动。
   鼓包基频 26 / 低频流动 0.25 / domain warp 0.12 / 疏密包络 0.12。
   铁律:gain 0.35 x lacunarity 1.95 = 0.68/octave < 1,高频 octave 的
   位移/波长比逐级衰减,抑制采样折叠碎屑(高频只留圆润棱线感) */
float heightPeel(vec2 p) {
  vec2 w = vec2(vnoise(p * 3.1 + 7.3), vnoise(p * 3.1 + 3.7)) - 0.5;
  vec2 q = p + 0.12 * w;
  float env = 1.0 - 0.12 * 0.5 + 0.12 * vnoise(p * 6.0 + 11.0);
  float a = 1.0, f = 26.0, norm = 0.0, h = 0.0;
  for (int i = 0; i < 4; i++) {
    h += a * vnoise(q * f);
    norm += a; a *= 0.35; f *= 1.95;
  }
  h = h / norm - 0.5;
  float low = vnoise(p * 1.6 + 5.0) - 0.5;
  return h * env + 0.25 * 0.6 * low;
}

/* ---------- 方格压花:格点透镜阵(结构化场,不走 fBm) ---------- */
/* 格数 20.5 / 逐格错位 0.52 / 透镜鼓包 0.32 / 翻转概率 0.16 */
vec2 latticeDisp(vec2 p, out vec2 cellOut) {
  float N = 20.5;
  vec2 g = p * N;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float flip = hash(cell + 91.3) < 0.16 ? -1.0 : 1.0;
  /* 逐格随机错位:跨缝不连续的关键(连续正弦场做不出) */
  vec2 jit = (vec2(hash(cell), hash(cell + 37.7)) - 0.5) * 2.0 * 0.52;
  /* 透镜包络:中心 0、边缘大(钟形,t 空间保证非负)→ 枕形鼓包 + 拖尾 */
  vec2 t = f + 0.5;
  float bell = 16.0 * t.x * t.y * (1.0 - t.x) * (1.0 - t.y);
  vec2 lens = f * bell * 0.32 * flip;
  cellOut = cell;
  return (jit * flip + lens) / N;
}

/* ---------- 镜像 wrap:防采样越界拉丝(kaleidoscope tileMirror 同源教训) ---------- */
vec2 mirrorWrap(vec2 uv) {
  vec2 u = mod(uv, 2.0);
  return min(u, 2.0 - u);
}

/* ---------- 强度锚点矩阵(票2 规格:比例外推,行=玻璃类型,列=弱/中/强) ---------- */
float anchorStrength(float type, float level) {
  if (type < 0.5) {
    if (level < 0.5) return 0.47;   // 大波浪
    if (level < 1.5) return 0.78;
    return 0.95;
  } else if (type < 1.5) {
    if (level < 0.5) return 0.31;   // 方格压花
    if (level < 1.5) return 0.51;
    return 0.64;
  }
  if (level < 0.5) return 0.20;     // 橘皮
  if (level < 1.5) return 0.34;
  return 0.43;
}

/* 数值梯度(差分步长 0.004 抗高频走样),只服务于波浪/橘皮 */
float heightAt(vec2 p) {
  if (uGlassType < 0.5) return heightWave(p);
  return heightPeel(p);
}
vec2 gradAt(vec2 p, float e) {
  float h0 = heightAt(p);
  return vec2(heightAt(p + vec2(e, 0.0)) - h0,
              heightAt(p + vec2(0.0, e)) - h0) / e;
}

void main() {
  float strength = anchorStrength(uGlassType, uStrengthLevel);
  float s = pow(strength, 1.5);   // 位移包络曲线:弱档细腻、强档猛
  vec2 uv = vUv;
  vec2 disp;

  if (uGlassType > 0.5 && uGlassType < 1.5) {
    /* 方格压花:位移直接来自结构化格点场 */
    vec2 cell;
    disp = latticeDisp(uv, cell) * s;
  } else {
    /* 梯度折射位移:透镜感的来源(纯 value 位移只有涂抹感)。
       高频场 K 按频率量纲折减(铁律):波浪基频 ~2.5,K = 0.11·s;
       橘皮基频 26、梯度大一个量级,K = 0.032·strength²(二次曲线让弱档温和) */
    float K = uGlassType < 0.5 ? 0.11 * s : 0.032 * strength * strength;
    disp = -K * gradAt(uv, 0.004);
  }

  vec3 col = texture2D(uImage, mirrorWrap(uv + disp)).rgb;

  /* 方格压花:缝亮脊 + 逐格曝光(玻璃自身光学层,固定开;采样后叠加,非独立 pass) */
  if (uGlassType > 0.5 && uGlassType < 1.5) {
    float N = 20.5;
    vec2 g2 = uv * N;
    vec2 f2 = fract(g2) - 0.5;
    vec2 cell2 = floor(g2);
    float edge = 0.5 - max(abs(f2.x), abs(f2.y));   // 距缝(格单位)
    float ridge = 1.0 - smoothstep(0.0, 0.06, edge);
    float facet = 0.9 + 0.2 * hash(cell2 + 7.3);    // 逐格明暗
    col *= facet;
    float ridgeLight = ridge * (0.10 + 0.22 * hash(cell2 + 3.1));
    col += ridgeLight * vec3(1.0, 0.98, 0.94);
    col -= ridge * 0.10;                            // 脊线旁暗影
  }

  gl_FragColor = vec4(col, 1.0);
}
