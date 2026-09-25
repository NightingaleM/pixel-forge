// scripts/verify-license.mjs
// 付费墙浏览器实测(plan Task 7):水印绘制像素验证 + gating 全链路 + 激活 + 3D 无碍。
// 用法: 先起 vite dev,然后 node scripts/verify-license.mjs <port>
// 产物: artifacts/license-verify/ 截图 + result.json
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const PORT = process.argv[2] || '5173'
const BASE = `http://localhost:${PORT}`
const OUT = path.resolve('artifacts/license-verify')
fs.mkdirSync(OUT, { recursive: true })

const CODE = process.env.LICENSE_CODE
if (!CODE) { console.error('缺少 LICENSE_CODE 环境变量(用 scripts/genLicense.mjs 生成)'); process.exit(1) }

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
if (!EDGE) { console.error('未找到 Edge'); process.exit(1) }

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`)
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// ---------- 场景 A:水印绘制像素验证(vite dev 动态 import 源模块) ----------
await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.clear())

const wm = await page.evaluate(async () => {
  const m = await import('/src/lib/license/watermark.ts')
  const mk = () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600
    const x = c.getContext('2d'); x.fillStyle = '#333333'; x.fillRect(0, 0, 800, 600)
    return c
  }
  const mean = (c, x0, y0, x1, y1) => {
    const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data
    let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3
    return s / (d.length / 4)
  }
  const maxLum = (c, x0, y0, x1, y1) => {
    const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data
    let m = 0; for (let i = 0; i < d.length; i += 4) m = Math.max(m, (d[i] + d[i + 1] + d[i + 2]) / 3)
    return m
  }
  const plain = mk()
  const corner = mk(); m.applyCanvasWatermark(corner, 'corner', 'TESTSEED')
  const tiled = mk(); m.applyCanvasWatermark(tiled, 'tiled', 'TESTSEED')
  // 平铺网格多点采样方差:有纹理(水印格)而非整片均匀
  const samples = []
  for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) {
    const x = Math.round((gx + 0.5) * 800 / 5), y = Math.round((gy + 0.5) * 600 / 5)
    samples.push(mean(tiled, x - 8, y - 8, x + 8, y + 8))
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length
  const variance = samples.reduce((a, b) => a + (b - avg) ** 2, 0) / samples.length
  const svgCorner = m.injectSvgWatermark('<svg xmlns="x" width="100" height="50"><text>x</text></svg>', 'corner', 'TESTSEED')
  const svgTiled = m.injectSvgWatermark('<svg xmlns="x" width="100" height="50"><text>x</text></svg>', 'tiled', 'TESTSEED')
  return {
    cornerRegion: { plain: mean(plain, 600, 520, 790, 590), wm: mean(corner, 600, 520, 790, 590),
      plainMax: maxLum(plain, 600, 520, 790, 590), wmMax: maxLum(corner, 600, 520, 790, 590) },
    tiledWhole: { plain: mean(plain, 0, 0, 800, 600), wm: mean(tiled, 0, 0, 800, 600) },
    tiledVariance: variance,
    svgCornerOk: svgCorner.includes('text-anchor="end"') && svgCorner.includes('TESTSEED'),
    svgTiledOk: svgTiled.includes('<pattern') && svgTiled.includes('rotate(45)'),
  }
})
ok('A1 角落水印:右下角区域出现接近白色的水印笔画',
  wm.cornerRegion.wmMax > wm.cornerRegion.plainMax + 80,
  `plainMax=${wm.cornerRegion.plainMax.toFixed(1)} wmMax=${wm.cornerRegion.wmMax.toFixed(1)} (mean ${wm.cornerRegion.plain.toFixed(1)}→${wm.cornerRegion.wm.toFixed(1)})`)
ok('A2 平铺水印:全图亮度高于对照',
  wm.tiledWhole.wm > wm.tiledWhole.plain + 3,
  `plain=${wm.tiledWhole.plain.toFixed(1)} wm=${wm.tiledWhole.wm.toFixed(1)}`)
ok('A3 平铺水印:采样点方差>0(真平铺纹理,非整片提亮)', wm.tiledVariance > 1, `variance=${wm.tiledVariance.toFixed(2)}`)
ok('A4 SVG 注入:corner/tiled 结构正确', wm.svgCornerOk && wm.svgTiledOk)

// ---------- 场景 B:免费额度 gating 全链路(上传测试图→下载×6) ----------
// 上传页点测试图缩略图加载图片,等主画布出现,再点"下载"按钮 6 次
await page.click('img[src*="local_test_pic"]')
await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, { timeout: 10000 })
await new Promise(r => setTimeout(r, 1200))   // 等渲染稳定
await page.screenshot({ path: path.join(OUT, 'b1-free-first-export.png') })

const downloadBtns = await page.$$('.action-bar .action-btn')
let toastSeen = false
for (let i = 0; i < 6; i++) {
  await downloadBtns[0].click()
  await new Promise(r => setTimeout(r, 350))
  if (await page.$('[role="status"]')) toastSeen = true
}
const quota = await page.evaluate(() => localStorage.getItem('pixel-forge.freeExports.v1'))
ok('B1 第 6 次导出触发降级 toast', toastSeen)
ok('B2 localStorage 计数=5(额度耗尽)', quota === JSON.stringify({ date: new Date().toLocaleDateString('sv'), count: 5 }), `stored=${quota}`)
await page.screenshot({ path: path.join(OUT, 'b2-toast.png') })

// ---------- 场景 C:激活会员→按钮态/横幅/面板 ----------
await page.evaluate((code) => localStorage.setItem('pixel-forge.license.v1', code), CODE)
await page.reload({ waitUntil: 'networkidle0' })
await page.click('img[src*="local_test_pic"]')
await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, { timeout: 10000 })
await new Promise(r => setTimeout(r, 800))
const memberBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.action-bar .action-btn')]
  const b = btns.find(x => x.textContent?.includes('会员') || x.textContent?.includes('Member'))
  return b ? b.className : null
})
ok('C1 ActionBar 会员钮呈会员态(secondary)', memberBtn !== null && memberBtn.includes('action-btn--secondary'), `class=${memberBtn}`)

// 免费下载 7 次(超额度):会员应全程无 toast
let memberToastLeak = false
const dl2 = await page.$$('.action-bar .action-btn')
for (let i = 0; i < 7; i++) {
  await dl2[0].click()
  await new Promise(r => setTimeout(r, 250))
  if (await page.$('[role="status"]')) memberToastLeak = true
}
ok('C2 会员超额下载无降级 toast', !memberToastLeak)

// 会员面板
const memberBtnEl = await page.evaluateHandle(() => [...document.querySelectorAll('.action-bar .action-btn')]
  .find(x => x.textContent?.includes('会员') || x.textContent?.includes('Member')))
const el = memberBtnEl.asElement()
if (!el) { ok('C3 会员面板显示到期信息', false, '未找到会员按钮') }
else {
  await el.click()
  await new Promise(r => setTimeout(r, 400))
  const panelText = await page.evaluate(() => document.querySelector('.license-panel')?.textContent ?? '')
  ok('C3 会员面板显示到期信息', /会员|Member/.test(panelText) && /有效期|Active until/.test(panelText), panelText.slice(0, 80))
  await page.screenshot({ path: path.join(OUT, 'c1-member-panel.png') })
}

// 清存储→回落免费→重输码恢复
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
const fellBack = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v1') === null)
ok('C4 清存储后回落免费态', fellBack)
await page.evaluate((code) => localStorage.setItem('pixel-forge.license.v1', code), CODE)
await page.reload({ waitUntil: 'networkidle0' })
const restored = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v1') !== null)
ok('C5 重输码恢复会员', restored)

// ---------- 场景 D:3D 页无碍 ----------
const errs3d = []
const onErr = (e) => errs3d.push(String(e))
page.on('pageerror', onErr)
await page.goto(`${BASE}/3d`, { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 1500))
ok('D1 3D 页加载无 pageerror', errs3d.length === 0, errs3d[0] ?? '')
page.off('pageerror', onErr)

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, pageErrors: errors }, null, 2))
await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
