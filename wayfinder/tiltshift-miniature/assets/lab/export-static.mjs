/* 实验室样张导出 + 验证: server + Edge headless + 断言 + PNG 归档 + static.html 生成
   用法: node export-static.mjs            (4 图 × orig/A/B/C 默认参数)
        node export-static.mjs --params '{"maxBlur":8,...}'  (覆盖参数出对照组) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const argIdx = process.argv.indexOf('--params');
const OVERRIDE = argIdx > 0 ? JSON.parse(process.argv[argIdx+1]) : null;
const TAG = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag')+1] : '';

const ROOT = path.resolve('wayfinder/tiltshift-miniature');
const OUT = path.join(ROOT, 'assets/lab/out');
const PORT = 8941;
const MIME = { '.html':'text/html; charset=utf-8', '.png':'image/png', '.js':'text/javascript' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'assets/lab/lab.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(PORT, r));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail='') => {
  results.push({ name, ok, detail });
  console.log((ok?'PASS':'FAIL')+'  '+name+(detail?'  ['+detail+']':''));
};

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new',
  });
  const NAMES = ['nyc','beach','bazaar','hanoi'];
  const ROUTES = ['orig','A','B','C'];
  const grid = [];

  for (let i=0;i<4;i++){
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/assets/lab/lab.html?img=${i}`, { waitUntil:'load' });
    await page.waitForFunction('window.__done === true || window.__err', { timeout: 60000 });
    const err = await page.evaluate('window.__err');
    check(`${NAMES[i]}: 页面无错误`, !err, err || '');

    if (OVERRIDE) await page.evaluate(o => window.__setP(o), OVERRIDE);

    const band = await page.evaluate('window.__band');
    console.log(`  smart band[${NAMES[i]}]:`, band ? JSON.stringify(band) : 'null');

    /* 度量段: 色彩链归零, 隔离纯模糊(饱和/对比/加锐会抬方差干扰判据) */
    const savedP = await page.evaluate('({...window.__P})');
    const NEUTRAL = { sat:1, con:1, clar:0, vig:0, warm:0, dith:0, hiGlow:0 };
    await page.evaluate(o => window.__setP(o), NEUTRAL);
    const neutralPngs = {};
    for (const r of ['A','B','C']) neutralPngs[r] = await page.evaluate('window.__capture("'+r+'")');
    await page.evaluate(o => window.__setP(o), savedP);

    const edgeOf = async (url, y0, y1) => page.evaluate((u, a, b) => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const x=c.getContext('2d'); x.drawImage(im,0,0);
        const w=im.width, h=Math.max(3,Math.floor(im.height*(b-a))), oy=Math.floor(im.height*a);
        const d=x.getImageData(0, oy, w, h).data;
        const L=new Float32Array(w*h);
        for (let p=0;p<w*h;p++) L[p]=0.299*d[p*4]+0.587*d[p*4+1]+0.114*d[p*4+2];
        let e=0,n=0;
        for (let j=1;j<h-1;j++) for (let i=1;i<w-1;i++){
          e += Math.abs(L[j*w+i+1]-L[j*w+i-1]) + Math.abs(L[(j+1)*w+i]-L[(j-1)*w+i]);
          n++;
        }
        res(n? e/n : 0);
      };
      im.src=u;
    }), url, y0, y1);

    /* 内容感知选行窗: 顶 35% 内取原边缘能量最大的 8% 高条带, 原能量过低判为纯天空跳过 */
    const origPng = await page.evaluate('window.__capture("orig")');
    let probeY = null, origTop = 0;
    for (let y0=0.02; y0<=0.27; y0+=0.03){
      const st = await edgeOf(origPng, y0, y0+0.08);
      if (st > origTop){ origTop = st; probeY = y0; }
    }
    if (origTop < 3){
      check(`${NAMES[i]}: 顶缘为低频天空, 边缘断言跳过`, true, `max edge ${origTop.toFixed(2)} < 3`);
    } else {
      for (const r of ['A','B','C']){
        const top = await edgeOf(neutralPngs[r], probeY, probeY+0.08);
        check(`${NAMES[i]} ${r}: 顶区细节边缘能量降`, top < origTop*0.6, `orig ${origTop.toFixed(2)} → ${top.toFixed(2)}`);
      }
    }
    const bandY = savedP.bandY;
    const origBandEdge = await edgeOf(origPng, bandY-0.03, bandY+0.03);
    for (const r of ['A','B','C']){
      const bd = await edgeOf(neutralPngs[r], bandY-0.03, bandY+0.03);
      check(`${NAMES[i]} ${r}: 焦带细节保留`, bd > origBandEdge*0.5, `orig ${origBandEdge.toFixed(2)} → ${bd.toFixed(2)}`);
    }

    const pngs = {};
    for (const r of ROUTES){
      const u = await page.evaluate('window.__capture("'+r+'")');
      pngs[r] = u;
      const name = `${NAMES[i]}__${r}${TAG}`;
      fs.writeFileSync(path.join(OUT, name+'.png'), Buffer.from(u.slice(u.indexOf(',')+1), 'base64'));
      check(`${NAMES[i]} ${r}: PNG 非空`, u.length > 40000, String(u.length));
    }
    /* 光圈形状对照: 六角 aperture=1(盘感最可见的 B 路线) */
    await page.evaluate(o => window.__setP(o), { aperture: 1 });
    const hexPng = await page.evaluate('window.__capture("B")');
    await page.evaluate(o => window.__setP(o), { aperture: 0 });
    fs.writeFileSync(path.join(OUT, `${NAMES[i]}__B-hex${TAG}.png`), Buffer.from(hexPng.slice(hexPng.indexOf(',')+1), 'base64'));
    check(`${NAMES[i]} B-hex: PNG 非空`, hexPng.length > 40000, String(hexPng.length));

    /* 追加: 竖幅倾角矩阵 (bazaar × A × 用户口味基调) */
    if (i === 2){
      const userBase = { bandW:.05, feather:.30, hiGlow:.21, sat:1.5, con:1.3, clar:.5, vig:.25, warm:.5, dith:.006 };
      const sv = await page.evaluate('({...window.__P})');
      for (const t of [0, 60, 75, 90]){
        await page.evaluate(o => window.__setP(o), { ...userBase, bandTilt:t });
        const u = await page.evaluate('window.__capture("A")');
        fs.writeFileSync(path.join(OUT, `bazaar__A-tilt${t}${TAG}.png`), Buffer.from(u.slice(u.indexOf(',')+1), 'base64'));
      }
      await page.evaluate(o => window.__setP(o), sv);
    }
    /* 追加: 全图 A 用户口味版 (窄带+长过渡+浓色彩, 各图焦带几何沿用 defs) */
    {
      const sv = await page.evaluate('({...window.__P})');
      await page.evaluate(o => window.__setP(o), { bandW:.05, feather:.35, hiGlow:.21, sat:1.5, con:1.3, clar:.5, vig:.25, warm:.5, dith:.006 });
      const u = await page.evaluate('window.__capture("A")');
      fs.writeFileSync(path.join(OUT, `${NAMES[i]}__A-user${TAG}.png`), Buffer.from(u.slice(u.indexOf(',')+1), 'base64'));
      check(`${NAMES[i]} A-user: PNG 非空`, u.length > 40000, String(u.length));
      await page.evaluate(o => window.__setP(o), sv);
    }

    grid.push({ row: NAMES[i], pngs });

    /* 断言2: B 路线耗时可预算 */
    const t = await page.evaluate('window.__timing()');
    check(`${NAMES[i]}: B 全分耗时记录`, t && parseFloat(t.B) >= 0, JSON.stringify(t));

    await page.close();
  }

  /* 生成 static.html */
  const rows = grid.map(g => {
    const cells = ROUTES.map(r => `<figure><figcaption>${r==='orig'?'原图':r}</figcaption><img src="out/${g.row}__${r}${TAG}.png"></figure>`).join('');
    const hex = `<h2>${g.row} · 光圈形状（B 圆 vs 六角）</h2><div class="row">
      <figure><figcaption>B 圆</figcaption><img src="out/${g.row}__B${TAG}.png"></figure>
      <figure><figcaption>B 六角</figcaption><img src="out/${g.row}__B-hex${TAG}.png"></figure></div>`;
    const user = `<figure><figcaption>A·用户口味</figcaption><img src="out/${g.row}__A-user${TAG}.png"></figure>`;
    const tilt = g.row === 'bazaar'
      ? `<h2>bazaar · 竖幅倾角矩阵（A · 0/60/75/90°）</h2><div class="row">${[0,60,75,90].map(t =>
          `<figure><figcaption>tilt ${t}°</figcaption><img src="out/bazaar__A-tilt${t}${TAG}.png"></figure>`).join('')}</div>` : '';
    return `<h2>${g.row}</h2><div class="row">${cells}${user}</div>\n${hex}\n${tilt}`;
  }).join('\n');
  fs.writeFileSync(path.join(ROOT, 'assets/lab/static.html'), `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>移轴微缩 · 静态对照</title>
<style>body{background:#101218;color:#d7dae2;font:13px/1.6 system-ui,sans-serif;padding:20px;margin:0}
h1{font-size:16px}h2{font-size:14px;color:#8a8f9c;margin:18px 0 6px}
.row{display:flex;gap:10px}.row figure{flex:1;min-width:0}
figcaption{color:#8a8f9c;font-size:11px;margin-bottom:3px}
img{width:100%;display:block;border:1px solid #262a35;border-radius:6px;background:#000}</style></head><body>
<h1>移轴微缩 · 静态对照（各图默认参数直出）</h1>
${rows}</body></html>`);
  check('static.html 生成', true, path.join(ROOT,'assets/lab/static.html'));

  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length-failed.length}/${results.length} PASS ====`);
} finally {
  if (browser) await browser.close();
  server.close();
}
process.exit(results.some(r => !r.ok) ? 1 : 0);
