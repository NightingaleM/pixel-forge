/* 素材压缩内嵌:读 sampler-static 原图 → Edge headless canvas 缩放/铺白底 → JPEG base64
   生成 images.js(window.CARD_IMAGES)。demo 页 file:// 双击打开时用它喂 WebGL(data URI 不污染画布)。
   用法: node prep-images.mjs */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const SRC = path.resolve('wayfinder/holofoil-card/assets/sampler-static');
const OUT = path.resolve('wayfinder/holofoil-card/assets/card-demo');
/* [文件名, 最大宽, JPEG 质量] —— cartoon 是主场素材且只有 350px 宽,原尺寸保真 */
const JOBS = [
  ['car.png', 880, 0.85],
  ['scene2.png', 880, 0.85],
  ['cartoon.png', 880, 0.92],
];

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new',
  });
  const page = await browser.newPage();
  const out = {};
  for (const [name, maxW, q] of JOBS) {
    const b64in = fs.readFileSync(path.join(SRC, name)).toString('base64');
    const dataUrl = await page.evaluate(async (src, maxW, q) => {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('load fail'));
        i.src = 'data:image/png;base64,' + src;
      });
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; /* RGBA 原图铺白底再压 JPEG */
      x.fillRect(0, 0, w, h);
      x.drawImage(img, 0, 0, w, h);
      return { url: c.toDataURL('image/jpeg', q), w, h };
    }, b64in, maxW, q);
    const key = name.replace('.png', '');
    out[key] = dataUrl.url;
    console.log(`${key}: ${dataUrl.w}x${dataUrl.h}  ${(dataUrl.url.length / 1024).toFixed(0)}KB(base64)`);
  }
  const js = '/* prep-images.mjs 生成,勿手改 */\nwindow.CARD_IMAGES = {\n'
    + Object.entries(out).map(([k, v]) => `  ${k}: '${v}',`).join('\n')
    + '\n};\n';
  fs.writeFileSync(path.join(OUT, 'images.js'), js);
  console.log('images.js 写入完成');
} finally {
  if (browser) await browser.close();
}
