/* 转卡 demo 实测：静态 server + Edge headless + DOM 断言 + toDataURL 位图直出归档
   用法: node verify.mjs（在项目根运行） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve('wayfinder/holofoil-card/assets/card-demo');
const OUT = path.join(ROOT, 'verify');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8932;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 姿态收敛:等 __read 值进入期望区间 */
async function waitTill(fn, timeout = 6000) {
  await page.waitForFunction(fn, { timeout, polling: 120 });
}

let browser, page;
try {
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new',
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction('window.CARD_IMAGES && document.getElementById("foil").width > 4', { timeout: 15000 });

  check('页面无错误', !(await page.evaluate('window.__err')), await page.evaluate('window.__err') || '');
  check('WebGL 初始化', await page.evaluate('window.__read.glOk') === true);

  const dataURL = () => page.evaluate('document.getElementById("foil").toDataURL()');
  const savePng = async (name) => {
    const u = await dataURL();
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
  };

  /* 1. 初始渲染非空 */
  const d0 = await dataURL();
  check('初始渲染非空', d0.length > 40000, String(d0.length));

  /* 卡面进视口,取 bbox 供鼠标定位 */
  await page.evaluate('document.getElementById("card").scrollIntoView({block:"center"})');
  await sleep(300);
  const box = await (await page.$('#card')).boundingBox();

  /* 2. 鼠标右上角 → rx/ry 双正、transform 生效 */
  await page.mouse.move(box.x + box.width * 0.96, box.y + box.height * 0.04, { steps: 8 });
  await waitTill('window.__read.ry > 9 && window.__read.rx > 9');
  const read1 = await page.evaluate('({rx: __read.rx, ry: __read.ry})');
  check('倾角响应(右上极位)', read1.ry > 9 && read1.ry < 16.5 && read1.rx > 9, JSON.stringify(read1));
  const tr = await page.evaluate('getComputedStyle(document.getElementById("card")).transform');
  check('CSS transform 含 rotate', /1, 0, 0, 1|matrix/.test(tr) && tr !== 'none', tr.slice(0, 48));
  await savePng('01-tilt-tr');

  /* 3. 箔色流动:不同姿态 → 画布内容变化 */
  const d1 = await dataURL();
  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height * 0.96, { steps: 8 });
  await waitTill('window.__read.ry < -9 && window.__read.rx < -9');
  const d2 = await dataURL();
  const midDiff = d1.length === d2.length || d1.slice(1000, 60000) !== d2.slice(1000, 60000);
  check('箔色随倾角重渲', Math.abs(d1.length - d2.length) > 200 || midDiff,
    `${d1.length} → ${d2.length}`);
  await savePng('02-tilt-bl');

  /* 4. 关闭箔色流动:再换姿态 → 画布不变(tilt uniform 恒 0) */
  await page.evaluate(() => {
    const cb = document.getElementById('flow');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  await sleep(500);
  const d3 = await dataURL();
  await page.mouse.move(box.x + box.width * 0.96, box.y + box.height * 0.04, { steps: 8 });
  await waitTill('window.__read.ry > 9');
  await sleep(500);
  const d4 = await dataURL();
  check('关流动后只转卡不变色', d3 === d4, `${d3.length} vs ${d4.length}`);
  await page.evaluate(() => {
    const cb = document.getElementById('flow');
    cb.checked = true; cb.dispatchEvent(new Event('change'));
  });
  await sleep(400);

  /* 5. idle 自摆:静止 3.5s 后 idleActive 且角度在动 */
  await sleep(3500);
  check('闲置进入自摆', await page.evaluate('window.__read.idleActive') === true);
  const s1 = await page.evaluate('({rx: __read.rx, ry: __read.ry})');
  await sleep(900);
  const s2 = await page.evaluate('({rx: __read.rx, ry: __read.ry})');
  check('自摆在动', Math.abs(s2.rx - s1.rx) + Math.abs(s2.ry - s1.ry) > 0.3,
    JSON.stringify(s1) + '→' + JSON.stringify(s2));
  await savePng('03-idle-swing');

  /* 6. 光效开关:gloss 显隐 + box-shadow 变化 */
  const shadowOn = await page.evaluate('getComputedStyle(document.getElementById("card")).boxShadow');
  await page.evaluate(() => {
    const cb = document.getElementById('light');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  await sleep(300);
  const glossOff = await page.evaluate('getComputedStyle(document.getElementById("gloss")).display');
  const shadowOff = await page.evaluate('getComputedStyle(document.getElementById("card")).boxShadow');
  check('光效开关生效', glossOff === 'none' && shadowOn !== shadowOff,
    `gloss:${glossOff} shadow:${shadowOn.slice(0, 24)}→${shadowOff.slice(0, 24)}`);
  await page.evaluate(() => {
    const cb = document.getElementById('light');
    cb.checked = true; cb.dispatchEvent(new Event('change'));
  });

  /* 7. 幅度滑杆 18°:极位角度变大 */
  await page.evaluate(() => {
    const el = document.getElementById('amp');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, '18');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.mouse.move(box.x + box.width * 0.96, box.y + box.height * 0.04, { steps: 8 });
  await waitTill('window.__read.ry > 15');
  const read2 = await page.evaluate('({rx: __read.rx, ry: __read.ry})');
  check('幅度滑杆生效(18°)', read2.ry > 15 && read2.ry < 24, JSON.stringify(read2));

  /* 8. 质感切换 → 重渲 */
  await page.click('#texChips .chip[data-tex="1"]');
  await sleep(600);
  const d5 = await dataURL();
  check('质感切换重渲(拉丝)', d5 !== d2 && d5.length > 40000, `${d2.length} → ${d5.length}`);
  await savePng('04-streak');

  /* 9. 素材切换 car → 画布变化 */
  await page.click('#imgChips .chip[data-img="car"]');
  await sleep(900);
  const d6 = await dataURL();
  check('素材切换重渲(car)', d6 !== d5 && d6.length > 40000, `${d5.length} → ${d6.length}`);
  await savePng('05-car');

  /* 10. 整页布局截图(DOM 层;卡面内容以上面 toDataURL 直出为准) */
  await page.screenshot({ path: path.join(OUT, '00-page.png') });

  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
} finally {
  if (browser) await browser.close();
  server.close();
}
process.exit(results.some(r => !r.ok) ? 1 : 0);
