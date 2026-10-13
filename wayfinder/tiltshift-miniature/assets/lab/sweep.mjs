/* 参数扫描: 验证上/下缘 R% 在 A/C 路线真正驱动最大糊度(顶/底区边缘能量应单调降) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve('wayfinder/tiltshift-miniature');
const PORT = 8942;
const MIME = { '.html':'text/html; charset=utf-8', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(`http://localhost:${PORT}/assets/lab/lab.html?img=0`, { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true || window.__err', { timeout: 60000 });
  if (await page.evaluate('window.__err')) throw new Error(await page.evaluate('window.__err'));
  const NEUTRAL = { sat:1, con:1, clar:0, vig:0, warm:0, dith:0, hiGlow:0, bandY:.60, bandW:.20, bandTilt:0, feather:.12 };
  await page.evaluate(o => window.__setP(o), NEUTRAL);

  await page.evaluate(() => {
    window.__edge = async (u, y0, y1) => {
      const im = new Image();
      im.src = u;
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; });
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const w = im.width, h = Math.max(3, Math.floor(im.height*(y1-y0))), oy = Math.floor(im.height*y0);
      const d = x.getImageData(0, oy, w, h).data;
      const L = new Float32Array(w*h);
      for (let p=0;p<w*h;p++) L[p] = 0.299*d[p*4]+0.587*d[p*4+1]+0.114*d[p*4+2];
      let e=0,n=0;
      for (let j=1;j<h-1;j++) for (let i=1;i<w-1;i++){ e += Math.abs(L[j*w+i+1]-L[j*w+i-1]) + Math.abs(L[(j+1)*w+i]-L[(j-1)*w+i]); n++; }
      return n ? e/n : 0;
    };
    return true;
  });

  /* 上下解耦断言: 改一侧 R%, 另一侧渲染应完全不变(边缘能量差≈0) */
  for (const route of ['A','C']){
    const x = await page.evaluate(async (route) => {
      const run = async (t, b) => {
        window.__setP({ maxBlurTop:t, maxBlurBottom:b, sat:1, con:1, clar:0, vig:0, warm:0, dith:0, hiGlow:0 });
        const u = window.__capture(route);
        return { top: await window.__edge(u, 0.02, 0.10), bottom: await window.__edge(u, 0.90, 0.98) };
      };
      const a = await run(4, 4);
      const b = await run(4, 25);   /* 只动下缘 → 上缘应不变 */
      const c = await run(25, 4);   /* 只动上缘 → 下缘应不变 */
      return { topAB: Math.abs(a.top-b.top), botAC: Math.abs(a.bottom-c.bottom) };
    }, route);
    console.log(`路线 ${route}: 解耦 |Δ上|(只动下)=${x.topAB.toFixed(3)} |Δ下|(只动上)=${x.botAC.toFixed(3)} → ${x.topAB<0.05&&x.botAC<0.05?'OK':'FAIL'}`);
  }

  console.log('图: nyc(横幅) | 度量: 顶区(0.02-0.10)/底区(0.90-0.98) 边缘能量, 中性色链');
  for (const route of ['A','C','B']){
    const out = await page.evaluate(async (route) => {
      const res = [];
      for (const R of [2, 6, 10, 16, 25]){
        window.__setP({ maxBlurTop:R, maxBlurBottom:R });
        const u = window.__capture(route);
        res.push({ R, top: await window.__edge(u, 0.02, 0.10), bottom: await window.__edge(u, 0.90, 0.98) });
      }
      window.__setP({ maxBlurTop:4, maxBlurBottom:5.8 });
      return res;
    }, route);
    const monoTop = out.every((v, i) => i === 0 || v.top <= out[i-1].top + 0.3);
    const monoBot = out.every((v, i) => i === 0 || v.bottom <= out[i-1].bottom + 0.3);
    console.log(`路线 ${route}: R%→顶缘 ${out.map(v=>v.R+':'+v.top.toFixed(1)).join(' | ')}`);
    console.log(`路线 ${route}: R%→底缘 ${out.map(v=>v.R+':'+v.bottom.toFixed(1)).join(' | ')}`);
    console.log(`路线 ${route}: 单调性 top=${monoTop?'OK':'FAIL'} bottom=${monoBot?'OK':'FAIL'}`);
  }
} finally {
  await browser.close();
  server.close();
}
