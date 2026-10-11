/* 样张页实测：静态 server + Edge headless + 断言 + PNG 归档（用完删） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve('wayfinder/holofoil-card/assets/sampler-static');
const PORT = 8931;
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'sampler.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(PORT, r));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
};

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new',
  });

  for (const img of ['car.png', 'scene2.png']) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/sampler.html?img=${img}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__done === true || window.__err', { timeout: 60000 });
    const err = await page.evaluate('window.__err');
    check(`${img}: 页面无错误`, !err, err || '');

    const rs = await page.evaluate('window.__results');
    const pngs = rs.filter(r => r.kind === 'png');
    const timing = rs.find(r => r.kind === 'timing');
    check(`${img}: 静态渲染 13 张`, pngs.length === 13, '实际 ' + pngs.length);
    check(`${img}: 全部 PNG 非空`, pngs.every(p => p.dataURL.length > 60000),
      '最小 ' + Math.min(...pngs.map(p => p.dataURL.length)));
    check(`${img}: 分区耗时 < 500ms`, timing && timing.ms < 500, timing ? timing.ms + 'ms ' + JSON.stringify(timing.detail) : 'no timing');
    /* 分区质量本质=「大块主导」:≥5% 大区至少 3 个且合计 >70%(碎边角/孤岛不计) */
    check(`${img}: 分区大块主导`, timing && timing.detail.bigCount >= 3 && timing.detail.bigPct > 70,
      '大区 ' + timing?.detail.bigCount + ' 个合计 ' + timing?.detail.bigPct + '% / 共 ' + timing?.detail.regions + ' 区');

    /* 归档 PNG */
    for (const p of pngs) {
      const b64 = p.dataURL.slice(p.dataURL.indexOf(',') + 1);
      fs.writeFileSync(path.join(ROOT, p.name + '.png'), Buffer.from(b64, 'base64'));
    }

    /* 基准对照：全图加箔(app默认) 必须有彩虹光谱 —— 中心行采样 */
    const fullPng = pngs.find(p => p.name.endsWith('__s1-1-full'));
    const rainbow = await page.evaluate(u => {
      return new Promise(res => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          const x = c.getContext('2d'); x.drawImage(im, 0, 0);
          /* 沿中线扫 64 点,统计 RGB 通道间差异>0.15 的"彩虹"像素数 */
          let rb = 0;
          for (let i = 0; i < 64; i++) {
            const d = x.getImageData(Math.floor(im.width * (i + 0.5) / 64), Math.floor(im.height / 2), 1, 1).data;
            const mx = Math.max(d[0], d[1], d[2]), mn = Math.min(d[0], d[1], d[2]);
            if ((mx - mn) / 255 > 0.15) rb++;
          }
          res(rb);
        };
        im.src = u;
      });
    }, fullPng.dataURL);
    check(`${img}: 全图加箔含光谱彩虹`, rainbow >= 8, '中线彩虹点 ' + rainbow + '/64');

    /* 边缘模式 = 非边缘区保持原图:对比 s1-0-orig 与 s1-2-edge 的平坦区像素（左上角 8×8） */
    const origPng = pngs.find(p => p.name.endsWith('__s1-0-orig'));
    const edgePng = pngs.find(p => p.name.endsWith('__s1-2-edge-t50-w2'));
    const flatDiff = await page.evaluate((u1, u2) => {
      return new Promise(res => {
        let n = 0; const imgs = [];
        const done = () => {
          if (++n < 2) return;
          /* 左上角 8×8 平均通道差(相对 s1-2 的非边区应≈原图) */
          const c1 = document.createElement('canvas'); c1.width = imgs[0].width; c1.height = imgs[0].height;
          const c2 = document.createElement('canvas'); c2.width = imgs[1].width; c2.height = imgs[1].height;
          const x1 = c1.getContext('2d'); x1.drawImage(imgs[0], 0, 0);
          const x2 = c2.getContext('2d'); x2.drawImage(imgs[1], 0, 0);
          let diff = 0;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const a = x1.getImageData(x, y, 1, 1).data, b = x2.getImageData(x, y, 1, 1).data;
            diff += Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);
          }
          res(diff / 192); /* 8*8*3 通道归一 */
        };
        for (const [i, u] of [u1, u2].entries()) {
          const im = new Image();
          im.onload = done; im.src = u; imgs[i] = im;
        }
      });
    }, origPng.dataURL, edgePng.dataURL);
    check(`${img}: 边缘模式平坦区≈原图`, flatDiff < 8, '左上8×8 平均通道差 ' + flatDiff.toFixed(1));

    /* 点选交互（只对 car 细测;scene2 跳过交互段） */
    if (img === 'car.png') {
      const before = await page.$$eval('.chip.on', els => els.length);
      const beforeImg = await page.evaluate('document.getElementById("live").toDataURL().length');
      /* #live 在长页下方,必须先滚入视口再取视口坐标 */
      await page.evaluate('document.getElementById("live").scrollIntoView({block:"center"})');
      await new Promise(r => setTimeout(r, 100));
      const box = await (await page.$('#live')).boundingBox();
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await new Promise(r => setTimeout(r, 200));
      const after = await page.$$eval('.chip.on', els => els.length);
      const afterImg = await page.evaluate('document.getElementById("live").toDataURL().length');
      check('点选: 徽章切换', after === before - 1, `${before}→${after}`);
      check('点选: 画布重渲', Math.abs(afterImg - beforeImg) > 500, `${beforeImg}→${afterImg}`);

      /* 点选分区渲染非空 */
      check('点选: 活画布非空渲染', afterImg > 60000, String(afterImg));

      /* 全不选按钮 → 掩膜清空重渲 */
      await page.click('#btnNone');
      await new Promise(r => setTimeout(r, 200));
      const noneImg = await page.evaluate('document.getElementById("live").toDataURL()');
      check('全不选: 掩膜清空重渲', noneImg.length > 0 && noneImg.length !== afterImg, String(noneImg.length));
    }
    await page.close();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
} finally {
  if (browser) await browser.close();
  server.close();
}
process.exit(results.some(r => !r.ok) ? 1 : 0);
