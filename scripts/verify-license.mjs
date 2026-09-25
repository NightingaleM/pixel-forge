// scripts/verify-license.mjs
// 付费墙浏览器实测:水印绘制像素验证 + gating 全链路 + 兑换码激活全链路 + 3D 无碍。
// 场景 C(兑换码方案):C0 断网贴未兑换码→网络提示;C1 起 mock 后 redeem 激活;
//   C2 会员超额无 toast;C3 清存储重贴已兑换码离线恢复。
// 用法: 先起 mock 目标的 dev: API_PROXY_TARGET=http://localhost:3999 npx vite
//   (端口 5177 由 vite.config.ts 指定),然后 node scripts/verify-license.mjs <port>
//   测试公钥在本脚本内经 setLicensePublicKey 注入页面(此 vite 8 下 env 文件/命令行
//   均无法把 VITE_ 变量可靠注入 dev 的 import.meta.env,故不依赖 .env.local)。
// 产物: artifacts/license-verify/ 截图 + result.json
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { ed25519 } from '@noble/curves/ed25519'
import fs from 'node:fs'
import path from 'node:path'

const PORT = process.argv[2] || '5177'
const BASE = `http://localhost:${PORT}`
const OUT = path.resolve('artifacts/license-verify')
fs.mkdirSync(OUT, { recursive: true })

// 测试私钥自签两码,公钥派生注入页面(与 src/lib/license/testKey.ts 同一对,换钥两处同步)
const TEST_PRIVATE_KEY_HEX = '585a87b0a5f2c4304597fcd18bd78368851de086b1ab126830bb961fc7fc2ff3'
const TEST_PUBLIC_KEY_HEX = Buffer.from(ed25519.getPublicKey(TEST_PRIVATE_KEY_HEX)).toString('hex')
const sign = (payload) => {
  const msg = Buffer.from(JSON.stringify(payload), 'utf8')
  return `PF1.${msg.toString('base64url')}.${Buffer.from(ed25519.sign(msg, TEST_PRIVATE_KEY_HEX)).toString('base64url')}`
}
const NOW_S = Math.floor(Date.now() / 1000)
const unredeemedCode = sign({ v: 1, tier: 'day', iat: NOW_S })            // 未兑换码(兑换码方案)
const DAY_EXP = NOW_S + 86400
const redeemedCode = sign({ v: 1, tier: 'day', exp: DAY_EXP })            // 已兑换码(离线路径)
const b64urlJson = (code) => JSON.parse(Buffer.from(code.split('.')[1], 'base64url').toString('utf8'))

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

// ---------- 场景 C:兑换码激活全链路 ----------
// 测试公钥注入页面(dev 默认公钥是开发公钥,reload 后模块状态重置须重注入)
const applyTestPubkey = async () => {
  await page.evaluate(async (pub) => {
    const m = await import('/src/lib/license/verify.ts')
    m.setLicensePublicKey(pub)
  }, TEST_PUBLIC_KEY_HEX)
}

// UI 激活走真实交互:点 ActionBar 会员钮开面板 → 输入码 → 点激活(比直接 setItem 更真实)
const openPanel = async () => {
  const el = (await page.evaluateHandle(() => [...document.querySelectorAll('.action-bar .action-btn')]
    .find(x => x.textContent?.includes('会员') || x.textContent?.includes('Member')))).asElement()
  if (!el) throw new Error('未找到会员按钮')
  await el.click()
  await new Promise(r => setTimeout(r, 400))
}
const closePanel = async () => {
  const b = await page.$('.license-panel .param-panel-close')
  if (b) { await b.click(); await new Promise(r => setTimeout(r, 250)) }
}
const activateViaUi = async (code) => {
  await openPanel()
  await (await page.$('.license-panel input')).type(code)
  await (await page.$('.license-panel .action-btn--primary')).click()
}

// C0:mock 未起(3999 不可达)→ 贴未兑换码 → 网络错误提示
await applyTestPubkey()
await page.evaluate(() => localStorage.removeItem('pixel-forge.license.v1'))
await activateViaUi(unredeemedCode)
await page.waitForFunction(() => document.querySelector('.license-msg--err') !== null, { timeout: 8000 })
const c0msg = await page.evaluate(() => document.querySelector('.license-msg--err')?.textContent ?? '')
ok('C0 断网贴未兑换码 → 网络不可达提示', /联网|[Ii]nternet/.test(c0msg), c0msg)
await page.screenshot({ path: path.join(OUT, 'c0-offline.png') })
await closePanel()

// C1:起 mock redeem → 同一未兑换码激活成功
const mock = spawn(process.execPath, ['scripts/mock-redeem.mjs', '3999'], { stdio: 'pipe' })
let mockUp = false
for (let i = 0; i < 30; i++) {
  try { if ((await fetch('http://localhost:3999/')).ok) { mockUp = true; break } } catch { /* 未就绪,继续轮询 */ }
  await new Promise(r => setTimeout(r, 200))
}
ok('C1a mock redeem 服务就绪(3999)', mockUp)
await activateViaUi(unredeemedCode)
await page.waitForFunction(() => document.querySelector('.license-msg--ok') !== null, { timeout: 8000 })
const storedCode = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v1'))
const storedPayload = storedCode ? b64urlJson(storedCode) : null
ok('C1b redeem 激活成功,存储区为已兑换码(有 exp 无 iat)',
  storedPayload !== null && typeof storedPayload.exp === 'number' && storedPayload.iat === undefined,
  storedCode ? JSON.stringify(storedPayload) : 'storage 空')
const panelText = await page.evaluate(() => document.querySelector('.license-panel')?.textContent ?? '')
ok('C1c 会员面板显示会员与到期日', /有效期|Active until/.test(panelText), panelText.slice(0, 80))
const memberBtnCls = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.action-bar .action-btn')]
    .find(x => x.textContent?.includes('会员') || x.textContent?.includes('Member'))
  return b ? b.className : null
})
ok('C1d ActionBar 会员钮呈会员态(secondary)', memberBtnCls !== null && memberBtnCls.includes('action-btn--secondary'), `class=${memberBtnCls}`)
await page.screenshot({ path: path.join(OUT, 'c1-member-panel.png') })
await closePanel()

// C2:会员超额下载 7 次应全程无降级 toast(B 场景已耗尽免费额度)
let memberToastLeak = false
const dl2 = await page.$$('.action-bar .action-btn')
for (let i = 0; i < 7; i++) {
  await dl2[0].click()
  await new Promise(r => setTimeout(r, 250))
  if (await page.$('[role="status"]')) memberToastLeak = true
}
ok('C2 会员超额下载无降级 toast', !memberToastLeak)

// C3:清存储回落免费 → 重贴已兑换码(离线路径,mock 在场但不发网络)→ 直接恢复
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
await applyTestPubkey()   // reload 重置了模块内公钥
await page.click('img[src*="local_test_pic"]')
await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, { timeout: 10000 })
const fellBack = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v1') === null)
ok('C3a 清存储后回落免费态', fellBack)
await activateViaUi(redeemedCode)
await page.waitForFunction(() => document.querySelector('.license-msg--ok') !== null, { timeout: 8000 })
const restoredCode = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v1'))
const restoredPayload = restoredCode ? b64urlJson(restoredCode) : null
ok('C3b 重贴已兑换码离线直接恢复(exp 原样保留)',
  restoredPayload !== null && restoredPayload.exp === DAY_EXP,
  restoredCode ? JSON.stringify(restoredPayload) : 'storage 空')
await closePanel()

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
mock.kill()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
