// src/lib/cardHtml.ts
// 闪卡导出:单文件 HTML 生成(wayfinder/holofoil-card 票02 方案(i) + 票06 规格)。
// WebGL 实时(holofoil.frag 原文内嵌=与编辑器同一来源 import)+ 冻结参数 +
// 源图 JPEG q85 base64 + 降级链(WebGL 失败/contextlost → 静态烘焙帧)+
// 陀螺仪三分支(iOS 权限按钮/直接监听/无数据静默回触摸)。查看者只能转卡,
// 无参数可调。模板为纯字符串拼接(buildCardHtml 可单测);图像编码走调用方
// 浏览器侧(encodeImageForCard/renderCardFallbackCanvas)。
import shaderSource from '../shaders/holofoil.frag?raw'

export interface CardHtmlParams {
  uTexture: number
  uStrength: number
  uBandDensity: number
  uBandAngle: number
  uFoilColorR: number
  uFoilColorG: number
  uFoilColorB: number
  uCrackleDensity: number
  uStreakDensity: number
  uSparkleDensity: number
  uScope: number
  uEdgeThreshold: number
  uEdgeWidth: number
  uEdgeSoftBand: number
  uEdgeHysteresis: number
  uZoneBoost: number
  uMaskLo: number
  uMaskHi: number
  uLumaWeight: number
  uEdgeWeight: number
  uMaskInvert: number
}

export interface CardHtmlInput {
  /** 源图 JPEG q85 dataURL(调用方按 2048 上限编码) */
  imageDataUrl: string
  /** 静态烘焙帧 JPEG dataURL(WebGL 失败降级用,建议 1024 控体积) */
  fallbackDataUrl: string
  /** 源图宽高比(纹理 naturalWidth/naturalHeight,卡片 aspect-ratio) */
  aspect: number
  params: CardHtmlParams
  /** 页面 <title> 与卡面角标 */
  title: string
  /** 界面文案(i18n 注入,查看者不可调) */
  ui: {
    hint: string
    gyroButton: string
    fallbackNote: string
  }
}

/** 源图编码:上限 2048(与单图导出一致),JPEG q85 base64。 */
export function encodeImageForCard(image: HTMLImageElement): { dataUrl: string; width: number; height: number } {
  const MAX = 2048
  let w = image.naturalWidth || image.width
  let h = image.naturalHeight || image.height
  const scale = Math.min(1, MAX / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(image, 0, 0, w, h)
  return { dataUrl: c.toDataURL('image/jpeg', 0.85), width: w, height: h }
}

/** 静态烘焙帧:当前预览画布(所见即所得,uTilt=0)降采样到 ≤1024 JPEG。 */
export function encodeFallbackForCard(canvas: HTMLCanvasElement): string {
  const MAX = 1024
  const scale = Math.min(1, MAX / Math.max(canvas.width, canvas.height))
  const w = Math.max(1, Math.round(canvas.width * scale))
  const h = Math.max(1, Math.round(canvas.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(canvas, 0, 0, w, h)
  return c.toDataURL('image/jpeg', 0.85)
}

/** JSON 注入字面量:数值全 round 到 4 位小数内(参数 step 最小 0.01,无损)。 */
function num(n: number): string {
  return String(Math.round(n * 10000) / 10000)
}

export function buildCardHtml(input: CardHtmlInput): string {
  const p = input.params
  const P = `uTexture:${num(p.uTexture)},uStrength:${num(p.uStrength)},uBandDensity:${num(p.uBandDensity)},uBandAngle:${num(p.uBandAngle)},uFoilColorR:${num(p.uFoilColorR)},uFoilColorG:${num(p.uFoilColorG)},uFoilColorB:${num(p.uFoilColorB)},uCrackleDensity:${num(p.uCrackleDensity)},uStreakDensity:${num(p.uStreakDensity)},uSparkleDensity:${num(p.uSparkleDensity)},uScope:${num(p.uScope)},uEdgeThreshold:${num(p.uEdgeThreshold)},uEdgeWidth:${num(p.uEdgeWidth)},uEdgeSoftBand:${num(p.uEdgeSoftBand)},uEdgeHysteresis:${num(p.uEdgeHysteresis)},uZoneBoost:${num(p.uZoneBoost)},uMaskLo:${num(p.uMaskLo)},uMaskHi:${num(p.uMaskHi)},uLumaWeight:${num(p.uLumaWeight)},uEdgeWeight:${num(p.uEdgeWeight)},uMaskInvert:${num(p.uMaskInvert)}`
  const aspect = num(input.aspect)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // prettier-ignore
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>${esc(input.title)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { background: radial-gradient(1200px 700px at 62% 38%, #191b28, #0e0f16);
  font: 14px/1.6 system-ui, "Segoe UI", "Microsoft YaHei", sans-serif; color: #e8eaf2;
  display: flex; align-items: center; justify-content: center; overflow: hidden; }
.stage { position: relative; width: 100%; height: 100%; perspective: 1100px;
  display: flex; align-items: center; justify-content: center;
  touch-action: none; overscroll-behavior: contain; cursor: crosshair; }
.stage .hint { position: absolute; left: 14px; top: 12px; color: #9aa0b4;
  font-size: 12px; pointer-events: none; }
.card { position: relative; width: min(86vw, 86vh * ${aspect}); aspect-ratio: ${aspect};
  border-radius: 16px; transform-style: preserve-3d; background: #000;
  box-shadow: 0 18px 44px rgba(5,7,14,0.55); will-change: transform; overflow: hidden;
  outline: 1px solid rgba(255,255,255,0.06); }
.card canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.card .fallback { position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; display: none; }
.card .gloss { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.26) 50%, rgba(255,255,255,0) 60%);
  background-size: 240% 100%; background-position: 50% 0; mix-blend-mode: screen; }
.card .vignette { position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background: linear-gradient(to right, rgba(0,0,0,0.42), rgba(0,0,0,0) 26% 74%, rgba(0,0,0,0.42)),
    linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0) 30% 70%, rgba(0,0,0,0.30)); }
.gyro-btn { position: absolute; right: 14px; top: 12px; display: none;
  background: #1e2130; color: #e8eaf2; border: 1px solid #2c3044; border-radius: 999px;
  padding: 5px 14px; font: 13px/1.4 inherit; cursor: pointer; }
</style>
</head>
<body>
<div class="stage" id="stage">
  <div class="hint" id="hint">${esc(input.ui.hint)}</div>
  <button class="gyro-btn" id="gyroBtn">${esc(input.ui.gyroButton)}</button>
  <div class="card" id="card">
    <canvas id="foil"></canvas>
    <img class="fallback" id="fallback" alt="" src="${input.fallbackDataUrl}">
    <div class="gloss" id="gloss"></div>
    <div class="vignette" id="vignette"></div>
  </div>
</div>
<script id="fs-src" type="x-shader/x-fragment">
${shaderSource}
</script>
<script>
'use strict';
/* 闪卡运行时:参数冻结,查看者只能转卡。verify 钩子(window.__card)供导出
   自检断言(票06 验收:模板自带 verify)。 */
var P = { ${P} };
var AMP = 12, FLOW = true, IDLE = true, LIGHT = true;
var IDLE_DELAY = 2500, SWING = 0.42, DAMPING = 0.10, THRESH = 0.0015;
var W = { err: '', glOk: false, drawn: false, tilt: [0, 0], idleActive: false, fallbackShown: false };
window.__card = W;
window.addEventListener('error', function (e) { W.err = W.err || e.message; });

var stage = document.getElementById('stage');
var card = document.getElementById('card');
var canvas = document.getElementById('foil');
var gloss = document.getElementById('gloss');
var vignette = document.getElementById('vignette');

/* ---------------- WebGL(holofoil 实时,倾角作 uniform) ---------------- */
var gl = null, prog = null, uni = {}, tex = null, texW = 1, texH = 1;
try {
  gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('no webgl');
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER,
    'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }');
  var fs = compile(gl.FRAGMENT_SHADER, document.getElementById('fs-src').textContent);
  prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  ['uImage','uResolution','uTexture','uStrength','uBandDensity','uBandAngle',
   'uFoilColorR','uFoilColorG','uFoilColorB','uCrackleDensity','uStreakDensity',
   'uSparkleDensity','uScope','uEdgeThreshold','uEdgeWidth','uEdgeSoftBand',
   'uEdgeHysteresis','uZoneBoost','uMaskLo','uMaskHi','uLumaWeight','uEdgeWeight',
   'uMaskInvert','uTexSize','uTiltX','uTiltY'].forEach(function (n) {
    uni[n] = gl.getUniformLocation(prog, n);
  });
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  W.glOk = true;
} catch (e) {
  W.err = 'WebGL: ' + (e && e.message);
}

function showFallback() {
  W.fallbackShown = true;
  canvas.style.display = 'none';
  document.getElementById('fallback').style.display = 'block';
  document.getElementById('hint').textContent = ${JSON.stringify(input.ui.fallbackNote)};
  gloss.style.display = 'none';
  vignette.style.display = 'none';
}

var img = new Image();
var needDraw = true, lastTilt = [99, 99];
img.onload = function () {
  texW = img.naturalWidth; texH = img.naturalHeight;
  if (W.glOk) {
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    } catch (e) { showFallback(); return; }
    sizeCanvas();
    needDraw = true;
  } else showFallback();
};
img.onerror = function () { W.err = W.err || 'image load fail'; showFallback(); };
img.src = ${JSON.stringify(input.imageDataUrl)};

function sizeCanvas() {
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var r = canvas.getBoundingClientRect();
  var w = Math.max(2, Math.round(r.width * dpr));
  var h = Math.max(2, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    gl && gl.viewport(0, 0, w, h);
    needDraw = true;
  }
}
window.addEventListener('resize', function () { if (W.glOk) sizeCanvas(); });

function draw(fx, fy) {
  if (!W.glOk) return;
  gl.uniform1i(uni.uImage, 0);
  gl.uniform2f(uni.uResolution, canvas.width, canvas.height);
  gl.uniform2f(uni.uTexSize, texW, texH);
  for (var k in P) if (k !== 'uTexSize') gl.uniform1f(uni[k], P[k]);
  gl.uniform1f(uni.uTiltX, fx);
  gl.uniform1f(uni.uTiltY, fy);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  W.drawn = true;
}

/* ---------------- 交互:指针 → 目标倾角 ---------------- */
var tx = 0, ty = 0, cx = 0, cy = 0, lastPointer = performance.now();
function pointerTo(e) {
  var r = card.getBoundingClientRect();
  var nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
  var ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
  tx = Math.max(-1.35, Math.min(1.35, nx));
  ty = Math.max(-1.35, Math.min(1.35, ny));
  lastPointer = performance.now();
}
stage.addEventListener('pointermove', pointerTo);
stage.addEventListener('pointerdown', pointerTo);
stage.addEventListener('pointerenter', pointerTo);
stage.addEventListener('pointerleave', function () { tx = 0; ty = 0; lastPointer = performance.now(); });
stage.addEventListener('pointerup', function () { tx = 0; ty = 0; lastPointer = performance.now(); });

/* ---------------- 陀螺仪三分支(票02:加分项,非验收) ---------------- */
(function () {
  var D = window.DeviceOrientationEvent;
  if (!D) return;
  function listen() {
    var got = false;
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null && e.beta == null) return;
      got = true;
      tx = Math.max(-1, Math.min(1, (e.gamma || 0) / 30));
      ty = Math.max(-1, Math.min(1, ((e.beta || 0) - 40) / 30));
      lastPointer = performance.now();
    });
    setTimeout(function () { if (!got) document.getElementById('gyroBtn').style.display = 'none'; }, 200);
  }
  if (typeof D.requestPermission === 'function') {
    var btn = document.getElementById('gyroBtn');
    btn.style.display = 'block';
    btn.addEventListener('click', function () {
      btn.style.display = 'none';
      D.requestPermission().then(function (s) { if (s === 'granted') listen(); }).catch(function () {});
    });
  } else listen();
})();

/* ---------------- 主循环(demo 同款:阻尼/自摆/按需重渲) ---------------- */
function loop(t) {
  var idleOn = IDLE && (t - lastPointer > IDLE_DELAY);
  W.idleActive = idleOn;
  if (idleOn) {
    tx = Math.sin(t / 1500) * SWING;
    ty = Math.cos(t / 1800) * SWING * 0.72;
  }
  cx += (tx - cx) * DAMPING;
  cy += (ty - cy) * DAMPING;

  var rx = -cy * AMP, ry = cx * AMP;
  card.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
  var fx = FLOW ? cx : 0, fy = FLOW ? cy : 0;
  if (LIGHT) {
    gloss.style.backgroundPosition = ((0.5 - fx * 0.5) * 100).toFixed(1) + '% 0';
    vignette.style.opacity = Math.min(0.85, (Math.abs(cx) + Math.abs(cy)) * 0.55).toFixed(3);
    card.style.boxShadow = (-cx * 13).toFixed(1) + 'px ' + (16 + cy * 9).toFixed(1) + 'px 44px 3px rgba(5,7,14,0.55)';
  }
  W.tilt = [+rx.toFixed(2), +ry.toFixed(2)];
  if (needDraw || Math.abs(fx - lastTilt[0]) > THRESH || Math.abs(fy - lastTilt[1]) > THRESH) {
    draw(fx, fy);
    needDraw = false;
    lastTilt = [fx, fy];
  }
  requestAnimationFrame(loop);
}
canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); showFallback(); W.glOk = false; });
requestAnimationFrame(loop);
</script>
</body>
</html>
`
}
