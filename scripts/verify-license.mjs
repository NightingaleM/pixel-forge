// scripts/verify-license.mjs
// 付费墙浏览器实测:水印绘制像素验证 + gating 全链路 + 链式兑换全链路 + 3D 无碍。
// 场景 C(链式方案,spec 2026-09-26):C0 断网贴未兑换码→网络提示;C1 起 mock 后激活
//   成身份码(存储区为 v2 凭证,did 绑定);C1b 会员态续费(补充包,exp 延长+次数+1);
//   C1c 刷新同步;C2 会员超额无 toast;C3 清存储重输身份码恢复(绑新设备);
//   C4 篡改 deviceId → 凭证失效(设备绑定)。
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

// 测试私钥自签未兑换码,公钥派生注入页面(与 src/lib/license/testKey.ts 同一对,换钥两处同步)
const TEST_PRIVATE_KEY_HEX = '585a87b0a5f2c4304597fcd18bd78368851de086b1ab126830bb961fc7fc2ff3'
const TEST_PUBLIC_KEY_HEX = Buffer.from(ed25519.getPublicKey(TEST_PRIVATE_KEY_HEX)).toString('hex')
const sign = (payload) => {
  const msg = Buffer.from(JSON.stringify(payload), 'utf8')
  return `PF1.${msg.toString('base64url')}.${Buffer.from(ed25519.sign(msg, TEST_PRIVATE_KEY_HEX)).toString('base64url')}`
}
const NOW_S = Math.floor(Date.now() / 1000)
const codeA = sign({ v: 1, tier: 'day', iat: NOW_S })      // 身份码候选 A
const codeB = sign({ v: 1, tier: 'week', iat: NOW_S })     // 补充包候选 B
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
  `plainMax=${wm.cornerRegion.plainMax.toFixed(1)} wmMax=${wm.cornerRegion.wmMax.toFixed(1)}`)
ok('A2 平铺水印:全图亮度高于对照',
  wm.tiledWhole.wm > wm.tiledWhole.plain + 3,
  `plain=${wm.tiledWhole.plain.toFixed(1)} wm=${wm.tiledWhole.wm.toFixed(1)}`)
ok('A3 平铺水印:采样点方差>0(真平铺纹理,非整片提亮)', wm.tiledVariance > 1, `variance=${wm.tiledVariance.toFixed(2)}`)
ok('A4 SVG 注入:corner/tiled 结构正确', wm.svgCornerOk && wm.svgTiledOk)

// ---------- 场景 B:免费额度 gating 全链路(上传测试图→下载×6) ----------
await page.click('img[src*="local_test_pic"]')
await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, { timeout: 10000 })
await new Promise(r => setTimeout(r, 1200))   // 等渲染稳定

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

// ---------- 场景 C:链式兑换全链路 ----------
// 测试公钥注入页面。vite HMR 陷阱:热更新过的模块带 ?t= 变体,与无 query 版是
// 两个实例(setLicensePublicKey 只改其一);从 LicensePanel 转换产物抠出组件实际
// 引用的 URL,连同无 query 版一起注入,两实例都命中。reload 后模块图重置须重注入。
let verifyUrls = ['/src/lib/license/verify.ts']
const sniffVerifyUrls = async () => {
  const src = await page.evaluate(() => fetch('/src/components/LicensePanel.tsx').then(r => r.text()))
  const m = src.match(/"(\/src\/lib\/license\/verify\.ts[^"]*)"/)
  verifyUrls = m && m[1] !== verifyUrls[0] ? ['/src/lib/license/verify.ts', m[1]] : ['/src/lib/license/verify.ts']
}
const applyTestPubkey = async () => {
  await page.evaluate(async (urls, pub) => {
    for (const u of urls) { (await import(u)).setLicensePublicKey(pub) }
  }, verifyUrls, TEST_PUBLIC_KEY_HEX)
}
await sniffVerifyUrls()

// UI 操作走真实交互:点 ActionBar 会员钮开面板 → 输入码 → 点主按钮
// (非会员态主按钮=激活,会员态=续费,双入口同一控件)
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
const inputCodeViaUi = async (code) => {
  await openPanel()
  const input = await page.$('.license-panel input')
  await input.click({ clickCount: 3 })   // 清掉遗留文本
  await input.type(code)
  await (await page.$('.license-panel .action-btn--primary')).click()
}

// C0:mock 未起(3999 不可达)→ 贴未兑换码 → 网络错误提示
await applyTestPubkey()
await page.evaluate(() => localStorage.removeItem('pixel-forge.license.v2'))
await inputCodeViaUi(codeA)
await page.waitForFunction(() => document.querySelector('.license-msg--err') !== null, { timeout: 8000 })
const c0msg = await page.evaluate(() => document.querySelector('.license-msg--err')?.textContent ?? '')
ok('C0 断网贴未兑换码 → 网络不可达提示', /联网|[Ii]nternet/.test(c0msg), c0msg)
await page.screenshot({ path: path.join(OUT, 'c0-offline.png') })
await closePanel()

// C1:起 mock redeem → 未兑换码 A 激活成身份码
const mock = spawn(process.execPath, ['scripts/mock-redeem.mjs', '3999'], { stdio: 'pipe' })
// 断言超时等异常会以未捕获异常退出——exit 钩子兜底杀 mock,防残留进程占用 3999
// 污染下一轮(上一轮残留的旧契约 mock 会让 C0/C1 得到错误响应而非网络错误)。
process.on('exit', () => { try { mock.kill() } catch { /* 已退出 */ } })
let mockUp = false
for (let i = 0; i < 30; i++) {
  try { if ((await fetch('http://localhost:3999/')).ok) { mockUp = true; break } } catch { /* 未就绪,继续轮询 */ }
  await new Promise(r => setTimeout(r, 200))
}
ok('C1a mock redeem 服务就绪(3999)', mockUp)
await inputCodeViaUi(codeA)
await page.waitForFunction(() => document.querySelector('.license-msg--ok') !== null, { timeout: 8000 })
const storedCode = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v2'))
const storedPayload = storedCode ? b64urlJson(storedCode) : null
const localDeviceId = await page.evaluate(() => localStorage.getItem('pixel-forge.deviceId.v1'))
ok('C1b 激活成功,存储区为 v2 隐藏凭证(cid/exp/did,无 tier/iat)',
  storedPayload !== null && storedPayload.v === 2 && /^[0-9a-f]{16}$/.test(storedPayload.cid)
  && typeof storedPayload.exp === 'number' && storedPayload.iat === undefined && storedPayload.tier === undefined,
  storedCode ? JSON.stringify(storedPayload) : 'storage 空')
ok('C1c 凭证 did 与本机 deviceId 一致(设备绑定)', storedPayload?.did === localDeviceId,
  `did=${storedPayload?.did} deviceId=${localDeviceId}`)
const metaRaw = await page.evaluate(() => localStorage.getItem('pixel-forge.licenseMeta.v2'))
ok('C1d 次数快照落库(5-首台=4)', metaRaw === JSON.stringify({ count: 4 }), `stored=${metaRaw}`)
const panelText = await page.evaluate(() => document.querySelector('.license-panel')?.textContent ?? '')
ok('C1e 会员面板显示会员/到期日/剩余次数(双入口切到续费)',
  /有效期|Active until/.test(panelText) && /可绑定设备余 4 次|4 device activations left/.test(panelText),
  panelText.slice(0, 120))
await page.screenshot({ path: path.join(OUT, 'c1-member-panel.png') })

// C1f:会员态续费——同一输入框贴补充包 B,主按钮已变"续费"
const expBefore = storedPayload?.exp
await inputCodeViaUi(codeB)
await page.waitForFunction(() => /已延长|Extended/.test(document.querySelector('.license-msg--ok')?.textContent ?? ''), { timeout: 8000 })
const renewedPayload = b64urlJson(await page.evaluate(() => localStorage.getItem('pixel-forge.license.v2')))
ok('C1f 续费成功:链 exp 延长一周(+604800),次数 4+1=5',
  renewedPayload.exp === expBefore + 604800
  && await page.evaluate(() => localStorage.getItem('pixel-forge.licenseMeta.v2')) === JSON.stringify({ count: 5 }),
  `exp ${expBefore}→${renewedPayload.exp}`)

// C1g:刷新链接(会员态第一个 link-btn)→ 同步反馈
await (await page.$('.license-panel .license-link-btn')).click()
await page.waitForFunction(() => /已同步|synced/i.test(document.querySelector('.license-msg--ok')?.textContent ?? ''), { timeout: 5000 })
ok('C1g 刷新同步有"已同步"反馈', true)
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

// C3:清存储回落免费 → 重输身份码 A(mock 幂等,绑新 deviceId,扣次)→ 恢复会员
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
await sniffVerifyUrls()   // reload 重置模块图,?t= 变体可能变化
await applyTestPubkey()   // reload 重置了模块内公钥
await page.click('img[src*="local_test_pic"]')
await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, { timeout: 10000 })
const fellBack = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v2') === null)
ok('C3a 清存储后回落免费态', fellBack)
await inputCodeViaUi(codeA)
await page.waitForFunction(() => document.querySelector('.license-msg--ok') !== null, { timeout: 8000 })
const reactivated = await page.evaluate(async (pub) => {
  const m = await import('/src/lib/license/verify.ts')
  m.setLicensePublicKey(pub)
  return m.getLicenseStatus()
}, TEST_PUBLIC_KEY_HEX)
const metaAfterRebind = await page.evaluate(() => localStorage.getItem('pixel-forge.licenseMeta.v2'))
ok('C3b 重输身份码恢复会员(新 deviceId 绑定,次数 5-1=4)',
  reactivated.active === true && metaAfterRebind === JSON.stringify({ count: 4 }),
  `active=${reactivated.active} meta=${metaAfterRebind}`)
await closePanel()

// C4:凭证复制防御——篡改本地 deviceId → 同一凭证立即失效
await page.evaluate(() => localStorage.setItem('pixel-forge.deviceId.v1', 'hacker-device'))
const hijacked = await page.evaluate(async (pub) => {
  const m = await import('/src/lib/license/verify.ts')
  m.setLicensePublicKey(pub)
  return m.getLicenseStatus()
}, TEST_PUBLIC_KEY_HEX)
ok('C4 deviceId 被换 → 凭证判定非会员(复制到未绑定设备无效)', hijacked.active === false,
  JSON.stringify(hijacked))

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
